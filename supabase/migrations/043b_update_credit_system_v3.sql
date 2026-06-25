-- Migration: Update credit system v3
-- =====================================================
-- Changes:
-- 1. Add 'details' JSONB column to round_pending_credits for storing per-round breakdown
-- 2. Add new volume breakdown columns for the v3 credit calculation logic
-- 3. Update finalize_round_credit to use new v3 logic
-- =====================================================

-- 1. Add details JSONB column to round_pending_credits
ALTER TABLE round_pending_credits
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

COMMENT ON COLUMN round_pending_credits.details IS 'Detailed breakdown of credit calculation per round (v3 logic)';

-- 2. Add new volume breakdown columns
ALTER TABLE round_pending_credits
ADD COLUMN IF NOT EXISTS dealer_own_volume DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS self_input_volume DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS downstream_volume DECIMAL(15,2) DEFAULT 0;

COMMENT ON COLUMN round_pending_credits.dealer_own_volume IS 'Volume from dealer own bets + dealer-input for own users (subject to min_amount)';
COMMENT ON COLUMN round_pending_credits.self_input_volume IS 'Volume from users who entered their own bets (charged immediately, no min_amount)';
COMMENT ON COLUMN round_pending_credits.downstream_volume IS 'Volume from downstream dealers (always charged)';

-- 3. Update finalize_round_credit to use v3 logic
-- This function is called when a round is closed/deleted to deduct credit for THAT specific round only
CREATE OR REPLACE FUNCTION finalize_round_credit(p_round_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_round RECORD;
    v_pending RECORD;
    v_credit_before DECIMAL;
    v_credit_after DECIMAL;
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
    
    -- Get the pre-calculated pending fee for THIS specific round from round_pending_credits
    SELECT * INTO v_pending
    FROM round_pending_credits
    WHERE round_id = p_round_id
    AND dealer_id = v_round.dealer_id
    AND is_finalized = FALSE;
    
    -- If no pending record, calculate fee = 0
    v_final_fee := COALESCE(v_pending.pending_fee, 0);
    
    IF v_final_fee <= 0 THEN
        -- Mark as finalized even if 0
        IF v_pending.id IS NOT NULL THEN
            UPDATE round_pending_credits
            SET is_finalized = TRUE, finalized_at = NOW(), updated_at = NOW()
            WHERE id = v_pending.id;
        END IF;
        
        RETURN jsonb_build_object(
            'success', TRUE,
            'round_id', p_round_id,
            'dealer_id', v_round.dealer_id,
            'message', 'No fee to charge for this round',
            'dealers_charged', 0,
            'total_deducted', 0
        );
    END IF;
    
    -- Get current credit balance before deduction
    SELECT COALESCE(balance, 0) INTO v_credit_before
    FROM dealer_credits
    WHERE dealer_id = v_round.dealer_id;
    
    -- Deduct credit for THIS round only
    UPDATE dealer_credits
    SET 
        balance = balance - v_final_fee,
        pending_deduction = GREATEST(0, pending_deduction - v_final_fee),
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
        'ค่าบริการงวด ' || COALESCE(v_round.lottery_name, 'หวย') || ' (' || COALESCE(v_round.percentage_rate::TEXT, '0') || '%)',
        jsonb_build_object(
            'round_id', p_round_id,
            'final_fee', v_final_fee,
            'credit_before', v_credit_before,
            'credit_after', v_credit_after,
            'details', COALESCE(v_pending.details, '{}'::JSONB)
        )
    );
    
    -- Mark round_pending_credits as finalized
    IF v_pending.id IS NOT NULL THEN
        UPDATE round_pending_credits
        SET is_finalized = TRUE, finalized_at = NOW(), updated_at = NOW()
        WHERE id = v_pending.id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', p_round_id,
        'dealer_id', v_round.dealer_id,
        'billing_model', v_round.billing_model,
        'dealers_charged', 1,
        'total_deducted', v_final_fee,
        'credit_before', v_credit_before,
        'credit_after', v_credit_after,
        'details', COALESCE(v_pending.details, '{}'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION finalize_round_credit(UUID) TO authenticated;

-- 4. Enable RLS on round_pending_credits and add policies
ALTER TABLE round_pending_credits ENABLE ROW LEVEL SECURITY;

-- Dealers can read their own pending credits
DROP POLICY IF EXISTS "Dealers can read own pending credits" ON round_pending_credits;
CREATE POLICY "Dealers can read own pending credits"
ON round_pending_credits FOR SELECT
TO authenticated
USING (dealer_id = auth.uid());

-- Dealers can insert/update their own pending credits (from client-side updatePendingDeduction)
DROP POLICY IF EXISTS "Dealers can upsert own pending credits" ON round_pending_credits;
CREATE POLICY "Dealers can upsert own pending credits"
ON round_pending_credits FOR INSERT
TO authenticated
WITH CHECK (dealer_id = auth.uid());

DROP POLICY IF EXISTS "Dealers can update own pending credits" ON round_pending_credits;
CREATE POLICY "Dealers can update own pending credits"
ON round_pending_credits FOR UPDATE
TO authenticated
USING (dealer_id = auth.uid())
WITH CHECK (dealer_id = auth.uid());

-- Dealers can delete their own pending credits (cleanup of old rounds)
DROP POLICY IF EXISTS "Dealers can delete own pending credits" ON round_pending_credits;
CREATE POLICY "Dealers can delete own pending credits"
ON round_pending_credits FOR DELETE
TO authenticated
USING (dealer_id = auth.uid());

-- SuperAdmins can manage all pending credits
DROP POLICY IF EXISTS "SuperAdmins can manage all pending credits" ON round_pending_credits;
CREATE POLICY "SuperAdmins can manage all pending credits"
ON round_pending_credits FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SuperAdmin')
);

-- Done!
SELECT 'Migration 043 completed successfully!' as status;
