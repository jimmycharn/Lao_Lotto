-- Combined Migration: Fix credit deduction and display in SuperAdmin
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop existing functions first (to change return type)
DROP FUNCTION IF EXISTS create_immediate_billing_record(UUID, UUID);

-- 1. Fix finalize_round_credit function
CREATE OR REPLACE FUNCTION finalize_round_credit(p_round_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_round RECORD;
    v_pending JSONB;
    v_deducted_count INTEGER := 0;
    v_total_deducted DECIMAL := 0;
    v_results JSONB := '[]'::JSONB;
    v_subscription RECORD;
    v_credit_before DECIMAL;
    v_credit_after DECIMAL;
BEGIN
    -- Get the round and its dealer
    SELECT lr.*, ds.id as subscription_id, ds.billing_cycle, sp.billing_model, sp.percentage_rate
    INTO v_round
    FROM lottery_rounds lr
    LEFT JOIN dealer_subscriptions ds ON lr.dealer_id = ds.dealer_id AND ds.status IN ('active', 'trial')
    LEFT JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE lr.id = p_round_id;
    
    IF v_round IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Round not found',
            'round_id', p_round_id
        );
    END IF;
    
    -- Check if dealer has percentage billing
    IF v_round.billing_model IS NULL OR v_round.billing_model != 'percentage' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Not a percentage billing package',
            'round_id', p_round_id,
            'billing_model', v_round.billing_model,
            'dealers_charged', 0,
            'total_deducted', 0
        );
    END IF;
    
    -- Skip if billing_cycle is 'immediate' (handled separately by create_immediate_billing_record)
    IF v_round.billing_cycle = 'immediate' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Immediate billing - handled separately',
            'round_id', p_round_id,
            'dealers_charged', 0,
            'total_deducted', 0
        );
    END IF;
    
    -- Calculate pending credit for the round owner
    v_pending := calculate_round_pending_credit(p_round_id, v_round.dealer_id);
    
    IF (v_pending->>'pending_fee')::DECIMAL > 0 THEN
        -- Get current credit balance before deduction
        SELECT COALESCE(balance, 0) INTO v_credit_before
        FROM dealer_credits
        WHERE dealer_id = v_round.dealer_id;
        
        -- Deduct credit
        UPDATE dealer_credits
        SET 
            balance = balance - (v_pending->>'pending_fee')::DECIMAL,
            pending_deduction = GREATEST(0, pending_deduction - (v_pending->>'pending_fee')::DECIMAL),
            updated_at = NOW()
        WHERE dealer_id = v_round.dealer_id;
        
        -- Get new balance
        SELECT COALESCE(balance, 0) INTO v_credit_after
        FROM dealer_credits
        WHERE dealer_id = v_round.dealer_id;
        
        -- Record transaction in credit_transactions
        INSERT INTO credit_transactions (
            dealer_id,
            transaction_type,
            amount,
            balance_after,
            reference_type,
            reference_id,
            description,
            metadata
        )
        VALUES (
            v_round.dealer_id,
            'deduction',
            -(v_pending->>'pending_fee')::DECIMAL,
            v_credit_after,
            'round',
            p_round_id,
            'ค่าบริการงวด ' || COALESCE(v_round.lottery_name, 'หวย') || ' (' || COALESCE((v_pending->>'percentage_rate')::TEXT, '0') || '%)',
            v_pending
        );
        
        v_deducted_count := 1;
        v_total_deducted := (v_pending->>'pending_fee')::DECIMAL;
        
        v_results := v_results || jsonb_build_object(
            'dealer_id', v_round.dealer_id,
            'deducted', (v_pending->>'pending_fee')::DECIMAL,
            'credit_before', v_credit_before,
            'credit_after', v_credit_after,
            'details', v_pending
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', p_round_id,
        'dealer_id', v_round.dealer_id,
        'billing_model', v_round.billing_model,
        'billing_cycle', v_round.billing_cycle,
        'dealers_charged', v_deducted_count,
        'total_deducted', v_total_deducted,
        'details', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION finalize_round_credit(UUID) TO authenticated;

-- 2. Fix create_immediate_billing_record function
CREATE OR REPLACE FUNCTION create_immediate_billing_record(
    p_round_id UUID,
    p_dealer_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_subscription RECORD;
    v_credit RECORD;
    v_total_volume DECIMAL(15,2);
    v_chargeable_volume DECIMAL(15,2);
    v_min_amount DECIMAL(15,2);
    v_percentage_rate DECIMAL(5,2);
    v_amount DECIMAL(15,2);
    v_billing_id UUID;
    v_credit_before DECIMAL(15,2);
    v_credit_after DECIMAL(15,2);
    v_round RECORD;
BEGIN
    -- Get round info
    SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
    
    -- Get dealer's subscription
    SELECT ds.*, sp.percentage_rate, sp.min_amount_before_charge, sp.billing_model
    INTO v_subscription
    FROM dealer_subscriptions ds
    JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE ds.dealer_id = p_dealer_id
    AND ds.status IN ('active', 'trial')
    AND ds.billing_cycle = 'immediate'
    ORDER BY ds.created_at DESC
    LIMIT 1;
    
    -- If no immediate billing subscription, return null
    IF v_subscription IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No immediate billing subscription found',
            'dealer_id', p_dealer_id
        );
    END IF;
    
    v_percentage_rate := COALESCE(v_subscription.percentage_rate, 0);
    v_min_amount := COALESCE(v_subscription.min_amount_before_charge, 0);
    
    -- Calculate total volume for this round
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_volume
    FROM submissions
    WHERE round_id = p_round_id
    AND is_deleted = false;
    
    -- Calculate chargeable volume (apply min_amount threshold)
    IF v_total_volume > v_min_amount THEN
        v_chargeable_volume := v_total_volume - v_min_amount;
    ELSE
        v_chargeable_volume := 0;
    END IF;
    
    -- Calculate amount
    v_amount := v_chargeable_volume * (v_percentage_rate / 100);
    
    -- If no amount to charge, skip
    IF v_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'No amount to charge',
            'total_volume', v_total_volume,
            'min_amount', v_min_amount,
            'chargeable_volume', v_chargeable_volume
        );
    END IF;
    
    -- Get current credit balance
    SELECT balance INTO v_credit_before
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    v_credit_before := COALESCE(v_credit_before, 0);
    
    -- Deduct from credit
    UPDATE dealer_credits
    SET balance = balance - v_amount,
        pending_deduction = GREATEST(0, pending_deduction - v_amount),
        updated_at = NOW()
    WHERE dealer_id = p_dealer_id;
    
    -- Get new balance
    SELECT balance INTO v_credit_after
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    v_credit_after := COALESCE(v_credit_after, 0);
    
    -- Create credit transaction record
    INSERT INTO credit_transactions (
        dealer_id,
        transaction_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description
    ) VALUES (
        p_dealer_id,
        'deduction',
        -v_amount,
        v_credit_after,
        'round',
        p_round_id,
        'ค่าธรรมเนียมทันที (' || v_percentage_rate || '%) - ' || COALESCE(v_round.lottery_name, 'หวย')
    );
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'dealer_id', p_dealer_id,
        'round_id', p_round_id,
        'total_volume', v_total_volume,
        'chargeable_volume', v_chargeable_volume,
        'percentage_rate', v_percentage_rate,
        'amount_deducted', v_amount,
        'credit_before', v_credit_before,
        'credit_after', v_credit_after
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_immediate_billing_record(UUID, UUID) TO authenticated;

-- Done!
SELECT 'Migration completed successfully!' as status;
