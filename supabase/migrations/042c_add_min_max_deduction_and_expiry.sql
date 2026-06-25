-- Migration: Add min/max deduction to packages and expiry to subscriptions
-- =====================================================

-- 1. Add min_deduction and max_deduction to subscription_packages
ALTER TABLE subscription_packages
ADD COLUMN IF NOT EXISTS min_deduction DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_deduction DECIMAL(15,2) DEFAULT 100000;

COMMENT ON COLUMN subscription_packages.min_deduction IS 'ตัดเครดิตขั้นต่ำ - ถ้าคำนวณได้น้อยกว่านี้จะตัดตามค่านี้';
COMMENT ON COLUMN subscription_packages.max_deduction IS 'ตัดเครดิตสูงสุด - ถ้าคำนวณได้มากกว่านี้จะตัดแค่ค่านี้';

-- 2. Add expires_at to dealer_subscriptions (null = no expiry)
ALTER TABLE dealer_subscriptions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN dealer_subscriptions.expires_at IS 'วันหมดอายุของแพ็คเกจ - null หมายถึงไม่กำหนดเวลา (ใช้ได้เรื่อยๆ)';

-- 3. Update finalize_round_credit to use min/max deduction
CREATE OR REPLACE FUNCTION finalize_round_credit(p_round_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_round RECORD;
    v_pending JSONB;
    v_deducted_count INTEGER := 0;
    v_total_deducted DECIMAL := 0;
    v_results JSONB := '[]'::JSONB;
    v_credit_before DECIMAL;
    v_credit_after DECIMAL;
    v_pending_fee DECIMAL;
    v_min_deduction DECIMAL;
    v_max_deduction DECIMAL;
    v_final_fee DECIMAL;
BEGIN
    -- Get the round and its dealer with package settings
    SELECT lr.*, ds.id as subscription_id, ds.billing_cycle, ds.expires_at,
           sp.billing_model, sp.percentage_rate, sp.min_deduction, sp.max_deduction
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
    
    -- Check if subscription is expired
    IF v_round.expires_at IS NOT NULL AND v_round.expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Subscription expired',
            'round_id', p_round_id,
            'expires_at', v_round.expires_at
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
    
    -- Skip if billing_cycle is 'immediate' (handled separately)
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
    v_pending_fee := COALESCE((v_pending->>'pending_fee')::DECIMAL, 0);
    v_min_deduction := COALESCE(v_round.min_deduction, 0);
    v_max_deduction := COALESCE(v_round.max_deduction, 100000);
    
    -- Apply min/max deduction limits
    v_final_fee := v_pending_fee;
    IF v_final_fee < v_min_deduction THEN
        v_final_fee := v_min_deduction;
    END IF;
    IF v_final_fee > v_max_deduction THEN
        v_final_fee := v_max_deduction;
    END IF;
    
    IF v_final_fee > 0 THEN
        -- Get current credit balance before deduction
        SELECT COALESCE(balance, 0) INTO v_credit_before
        FROM dealer_credits
        WHERE dealer_id = v_round.dealer_id;
        
        -- Deduct credit
        UPDATE dealer_credits
        SET 
            balance = balance - v_final_fee,
            pending_deduction = GREATEST(0, pending_deduction - v_pending_fee),
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
            -v_final_fee,
            v_credit_after,
            'round',
            p_round_id,
            'ค่าบริการงวด ' || COALESCE(v_round.lottery_name, 'หวย') || ' (' || COALESCE((v_pending->>'percentage_rate')::TEXT, '0') || '%)',
            jsonb_build_object(
                'pending_fee', v_pending_fee,
                'min_deduction', v_min_deduction,
                'max_deduction', v_max_deduction,
                'final_fee', v_final_fee,
                'details', v_pending
            )
        );
        
        v_deducted_count := 1;
        v_total_deducted := v_final_fee;
        
        v_results := v_results || jsonb_build_object(
            'dealer_id', v_round.dealer_id,
            'pending_fee', v_pending_fee,
            'min_deduction', v_min_deduction,
            'max_deduction', v_max_deduction,
            'final_deducted', v_final_fee,
            'credit_before', v_credit_before,
            'credit_after', v_credit_after
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

-- 4. Update create_immediate_billing_record to use min/max deduction
DROP FUNCTION IF EXISTS create_immediate_billing_record(UUID, UUID);

CREATE OR REPLACE FUNCTION create_immediate_billing_record(
    p_round_id UUID,
    p_dealer_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_subscription RECORD;
    v_total_volume DECIMAL(15,2);
    v_chargeable_volume DECIMAL(15,2);
    v_min_amount DECIMAL(15,2);
    v_percentage_rate DECIMAL(5,2);
    v_pending_fee DECIMAL(15,2);
    v_min_deduction DECIMAL(15,2);
    v_max_deduction DECIMAL(15,2);
    v_final_fee DECIMAL(15,2);
    v_credit_before DECIMAL(15,2);
    v_credit_after DECIMAL(15,2);
    v_round RECORD;
BEGIN
    -- Get round info
    SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
    
    -- Get dealer's subscription with package settings
    SELECT ds.*, sp.percentage_rate, sp.min_amount_before_charge, sp.billing_model,
           sp.min_deduction, sp.max_deduction
    INTO v_subscription
    FROM dealer_subscriptions ds
    JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE ds.dealer_id = p_dealer_id
    AND ds.status IN ('active', 'trial')
    AND ds.billing_cycle = 'immediate'
    AND (ds.expires_at IS NULL OR ds.expires_at > NOW())
    ORDER BY ds.created_at DESC
    LIMIT 1;
    
    -- If no immediate billing subscription, return
    IF v_subscription IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No immediate billing subscription found',
            'dealer_id', p_dealer_id
        );
    END IF;
    
    v_percentage_rate := COALESCE(v_subscription.percentage_rate, 0);
    v_min_amount := COALESCE(v_subscription.min_amount_before_charge, 0);
    v_min_deduction := COALESCE(v_subscription.min_deduction, 0);
    v_max_deduction := COALESCE(v_subscription.max_deduction, 100000);
    
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
    
    -- Calculate pending fee
    v_pending_fee := v_chargeable_volume * (v_percentage_rate / 100);
    
    -- Apply min/max deduction limits
    v_final_fee := v_pending_fee;
    IF v_final_fee < v_min_deduction THEN
        v_final_fee := v_min_deduction;
    END IF;
    IF v_final_fee > v_max_deduction THEN
        v_final_fee := v_max_deduction;
    END IF;
    
    -- If no amount to charge, skip
    IF v_final_fee <= 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'No amount to charge',
            'total_volume', v_total_volume,
            'min_amount', v_min_amount,
            'chargeable_volume', v_chargeable_volume,
            'pending_fee', v_pending_fee,
            'min_deduction', v_min_deduction,
            'final_fee', v_final_fee
        );
    END IF;
    
    -- Get current credit balance
    SELECT balance INTO v_credit_before
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    v_credit_before := COALESCE(v_credit_before, 0);
    
    -- Deduct from credit
    UPDATE dealer_credits
    SET balance = balance - v_final_fee,
        pending_deduction = GREATEST(0, pending_deduction - v_pending_fee),
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
        -v_final_fee,
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
        'pending_fee', v_pending_fee,
        'min_deduction', v_min_deduction,
        'max_deduction', v_max_deduction,
        'amount_deducted', v_final_fee,
        'credit_before', v_credit_before,
        'credit_after', v_credit_after
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION finalize_round_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_immediate_billing_record(UUID, UUID) TO authenticated;

-- Done!
SELECT 'Migration completed successfully!' as status;
