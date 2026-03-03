-- Migration: Auto-renew subscriptions
-- =====================================================
-- Creates a function to auto-renew expired monthly/yearly subscriptions
-- Can be called by a cron job, edge function, or manually
-- =====================================================

-- Function to auto-renew a single dealer's subscription
CREATE OR REPLACE FUNCTION auto_renew_subscription(p_dealer_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_pkg RECORD;
    v_credit RECORD;
    v_price DECIMAL;
    v_new_expiry TIMESTAMPTZ;
    v_new_balance DECIMAL;
BEGIN
    -- Get the dealer's active/trial subscription
    SELECT ds.*, sp.billing_model, sp.monthly_price, sp.yearly_price, sp.name as package_name
    INTO v_sub
    FROM dealer_subscriptions ds
    JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE ds.dealer_id = p_dealer_id
    AND ds.status IN ('active', 'trial')
    ORDER BY ds.created_at DESC
    LIMIT 1;

    IF v_sub IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'No active subscription found');
    END IF;

    -- Only auto-renew fixed-price packages (not percentage)
    IF v_sub.billing_model = 'percentage' THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Percentage packages do not need renewal');
    END IF;

    -- Check if subscription has expired
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at > NOW() THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Subscription not yet expired', 'expires_at', v_sub.expires_at);
    END IF;

    -- Calculate renewal price
    IF v_sub.billing_cycle = 'yearly' THEN
        v_price := COALESCE(v_sub.yearly_price, 0);
    ELSE
        v_price := COALESCE(v_sub.monthly_price, 0);
    END IF;

    IF v_price <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'message', 'Package has no price configured');
    END IF;

    -- Check dealer credit
    SELECT * INTO v_credit
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;

    IF v_credit IS NULL OR v_credit.is_blocked THEN
        -- Mark subscription as expired
        UPDATE dealer_subscriptions
        SET status = 'expired', updated_at = NOW()
        WHERE dealer_id = p_dealer_id AND id = v_sub.id;

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Dealer credit blocked or not found - subscription expired',
            'dealer_id', p_dealer_id
        );
    END IF;

    -- Check if balance is sufficient
    IF (v_credit.balance - COALESCE(v_credit.pending_deduction, 0)) < v_price THEN
        -- Mark subscription as expired due to insufficient credit
        UPDATE dealer_subscriptions
        SET status = 'expired', updated_at = NOW()
        WHERE dealer_id = p_dealer_id AND id = v_sub.id;

        -- Update profile
        UPDATE profiles
        SET subscription_status = 'expired'
        WHERE id = p_dealer_id;

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Insufficient credit for renewal',
            'dealer_id', p_dealer_id,
            'balance', v_credit.balance,
            'pending', v_credit.pending_deduction,
            'price', v_price
        );
    END IF;

    -- Calculate new expiry date (from NOW, not from old expiry)
    IF v_sub.billing_cycle = 'yearly' THEN
        v_new_expiry := NOW() + INTERVAL '1 year';
    ELSE
        v_new_expiry := NOW() + INTERVAL '1 month';
    END IF;

    -- Deduct credit
    v_new_balance := v_credit.balance - v_price;
    
    UPDATE dealer_credits
    SET balance = v_new_balance, updated_at = NOW()
    WHERE dealer_id = p_dealer_id;

    -- Record transaction
    INSERT INTO credit_transactions (
        dealer_id, transaction_type, amount, balance_after,
        reference_type, description, metadata
    ) VALUES (
        p_dealer_id, 'deduction', -v_price, v_new_balance,
        'subscription',
        'ต่ออายุแพ็คเกจ "' || v_sub.package_name || '" (' || 
            CASE WHEN v_sub.billing_cycle = 'yearly' THEN 'รายปี' ELSE 'รายเดือน' END || ')',
        jsonb_build_object(
            'package_id', v_sub.package_id,
            'package_name', v_sub.package_name,
            'billing_cycle', v_sub.billing_cycle,
            'price', v_price,
            'old_expires_at', v_sub.expires_at,
            'new_expires_at', v_new_expiry,
            'auto_renewed', TRUE
        )
    );

    -- Update subscription with new expiry
    UPDATE dealer_subscriptions
    SET 
        expires_at = v_new_expiry,
        start_date = NOW()::DATE,
        end_date = v_new_expiry::DATE,
        status = 'active',
        is_trial = FALSE,
        updated_at = NOW()
    WHERE dealer_id = p_dealer_id AND id = v_sub.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Subscription renewed successfully',
        'dealer_id', p_dealer_id,
        'package_name', v_sub.package_name,
        'price', v_price,
        'new_expires_at', v_new_expiry,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to batch auto-renew all expired subscriptions
-- Returns summary of renewals
CREATE OR REPLACE FUNCTION batch_auto_renew_subscriptions()
RETURNS JSONB AS $$
DECLARE
    v_dealer RECORD;
    v_result JSONB;
    v_results JSONB[] := '{}';
    v_total INT := 0;
    v_renewed INT := 0;
    v_failed INT := 0;
BEGIN
    -- Find all dealers with expired fixed-price subscriptions
    FOR v_dealer IN
        SELECT ds.dealer_id
        FROM dealer_subscriptions ds
        JOIN subscription_packages sp ON ds.package_id = sp.id
        WHERE ds.status IN ('active', 'trial')
        AND sp.billing_model != 'percentage'
        AND ds.expires_at IS NOT NULL
        AND ds.expires_at <= NOW()
    LOOP
        v_total := v_total + 1;
        v_result := auto_renew_subscription(v_dealer.dealer_id);
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_renewed := v_renewed + 1;
        ELSE
            v_failed := v_failed + 1;
        END IF;
        
        v_results := array_append(v_results, v_result);
    END LOOP;

    RETURN jsonb_build_object(
        'total', v_total,
        'renewed', v_renewed,
        'failed', v_failed,
        'details', to_jsonb(v_results)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auto_renew_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_auto_renew_subscriptions() TO authenticated;

-- Done!
SELECT 'Migration 110 completed - auto-renew subscription functions created!' as status;
