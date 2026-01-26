-- Migration: Fix finalize_round_credit to use lottery_rounds.dealer_id
-- =====================================================

-- Fix the finalize_round_credit function to properly find the round owner
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
    IF v_round.billing_model != 'percentage' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Not a percentage billing package',
            'round_id', p_round_id,
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
        
        -- Record transaction
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
            'ค่าบริการงวด ' || v_round.lottery_name || ' (' || (v_pending->>'percentage_rate')::TEXT || '%)',
            v_pending
        );
        
        -- Create billing record for SuperAdmin dashboard
        INSERT INTO dealer_billing_records (
            dealer_id,
            subscription_id,
            round_id,
            billing_type,
            billing_period_start,
            billing_period_end,
            total_volume,
            chargeable_volume,
            percentage_rate,
            amount,
            status,
            paid_at,
            paid_amount,
            payment_method,
            credit_deducted,
            credit_balance_before,
            credit_balance_after,
            description
        ) VALUES (
            v_round.dealer_id,
            v_round.subscription_id,
            p_round_id,
            COALESCE(v_round.billing_cycle, 'monthly'),
            NOW(),
            NOW(),
            (v_pending->>'total_volume')::DECIMAL,
            (v_pending->>'chargeable_volume')::DECIMAL,
            (v_pending->>'percentage_rate')::DECIMAL,
            (v_pending->>'pending_fee')::DECIMAL,
            'deducted',
            NOW(),
            (v_pending->>'pending_fee')::DECIMAL,
            'credit_deduction',
            (v_pending->>'pending_fee')::DECIMAL,
            v_credit_before,
            v_credit_after,
            'หักค่าธรรมเนียมหลังประกาศผล - ' || v_round.lottery_name
        );
        
        -- Update or insert round_pending_credits as finalized
        INSERT INTO round_pending_credits (
            round_id, dealer_id, 
            dealer_input_volume, member_input_volume, upstream_volume,
            total_chargeable_volume, percentage_rate, pending_fee,
            is_finalized, finalized_at
        )
        VALUES (
            p_round_id, v_round.dealer_id,
            (v_pending->>'dealer_volume')::DECIMAL,
            (v_pending->>'member_volume')::DECIMAL,
            (v_pending->>'upstream_volume')::DECIMAL,
            (v_pending->>'chargeable_volume')::DECIMAL,
            (v_pending->>'percentage_rate')::DECIMAL,
            (v_pending->>'pending_fee')::DECIMAL,
            TRUE, NOW()
        )
        ON CONFLICT (round_id, dealer_id) DO UPDATE SET
            dealer_input_volume = EXCLUDED.dealer_input_volume,
            member_input_volume = EXCLUDED.member_input_volume,
            upstream_volume = EXCLUDED.upstream_volume,
            total_chargeable_volume = EXCLUDED.total_chargeable_volume,
            percentage_rate = EXCLUDED.percentage_rate,
            pending_fee = EXCLUDED.pending_fee,
            is_finalized = TRUE,
            finalized_at = NOW(),
            updated_at = NOW();
        
        v_deducted_count := 1;
        v_total_deducted := (v_pending->>'pending_fee')::DECIMAL;
        
        v_results := v_results || jsonb_build_object(
            'dealer_id', v_round.dealer_id,
            'deducted', (v_pending->>'pending_fee')::DECIMAL,
            'details', v_pending
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', p_round_id,
        'dealers_charged', v_deducted_count,
        'total_deducted', v_total_deducted,
        'details', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION finalize_round_credit(UUID) TO authenticated;
