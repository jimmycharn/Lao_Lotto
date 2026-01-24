-- =====================================================
-- PERCENTAGE CREDIT SYSTEM
-- Add minimum amount threshold and pending credit tracking
-- =====================================================

-- 1. Add min_amount_before_charge to subscription_packages
ALTER TABLE subscription_packages 
ADD COLUMN IF NOT EXISTS min_amount_before_charge DECIMAL(15,2) DEFAULT 0;

COMMENT ON COLUMN subscription_packages.min_amount_before_charge IS 'จำนวนเงินขั้นต่ำที่ dealer ป้อนได้ก่อนเริ่มตัดเครดิต (เฉพาะ percentage model)';

-- 2. Add pending_deduction to dealer_credits for tracking estimated deduction
ALTER TABLE dealer_credits 
ADD COLUMN IF NOT EXISTS pending_deduction DECIMAL(15,2) DEFAULT 0;

COMMENT ON COLUMN dealer_credits.pending_deduction IS 'ยอดเครดิตที่รอตัด (คำนวณจากยอดขายในงวดที่ยังไม่ปิด)';

-- 3. Create table to track pending credit per round
CREATE TABLE IF NOT EXISTS round_pending_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
    dealer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Volume breakdown
    dealer_input_volume DECIMAL(15,2) DEFAULT 0,      -- Dealer's own input
    member_input_volume DECIMAL(15,2) DEFAULT 0,      -- From dealer's members
    upstream_volume DECIMAL(15,2) DEFAULT 0,          -- From other dealers (ตีเลขเข้ามา)
    
    -- Total volume after applying min_amount threshold
    total_chargeable_volume DECIMAL(15,2) DEFAULT 0,
    
    -- Fee calculation
    percentage_rate DECIMAL(5,2) DEFAULT 0,
    pending_fee DECIMAL(15,2) DEFAULT 0,
    
    -- Status
    is_finalized BOOLEAN DEFAULT FALSE,
    finalized_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(round_id, dealer_id)
);

CREATE INDEX IF NOT EXISTS idx_round_pending_credits_round ON round_pending_credits(round_id);
CREATE INDEX IF NOT EXISTS idx_round_pending_credits_dealer ON round_pending_credits(dealer_id);
CREATE INDEX IF NOT EXISTS idx_round_pending_credits_not_finalized ON round_pending_credits(dealer_id) WHERE is_finalized = FALSE;

-- 4. Function to calculate pending credit for a dealer in a round
CREATE OR REPLACE FUNCTION calculate_round_pending_credit(
    p_round_id UUID,
    p_dealer_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_dealer_volume DECIMAL := 0;
    v_member_volume DECIMAL := 0;
    v_upstream_volume DECIMAL := 0;
    v_total_volume DECIMAL := 0;
    v_chargeable_volume DECIMAL := 0;
    v_percentage_rate DECIMAL := 0;
    v_min_amount DECIMAL := 0;
    v_pending_fee DECIMAL := 0;
    v_dealer_credit DECIMAL := 0;
    v_result JSONB;
BEGIN
    -- Get dealer's subscription package info
    SELECT 
        COALESCE(sp.percentage_rate, 0),
        COALESCE(sp.min_amount_before_charge, 0)
    INTO v_percentage_rate, v_min_amount
    FROM dealer_subscriptions ds
    JOIN subscription_packages sp ON ds.package_id = sp.id
    WHERE ds.dealer_id = p_dealer_id
    AND ds.status = 'active'
    AND sp.billing_model = 'percentage'
    LIMIT 1;
    
    -- If no percentage package, return zeros
    IF v_percentage_rate IS NULL OR v_percentage_rate = 0 THEN
        RETURN jsonb_build_object(
            'has_percentage_package', FALSE,
            'dealer_volume', 0,
            'member_volume', 0,
            'upstream_volume', 0,
            'total_volume', 0,
            'chargeable_volume', 0,
            'percentage_rate', 0,
            'min_amount_before_charge', 0,
            'pending_fee', 0,
            'dealer_credit', 0,
            'available_credit', 0,
            'has_sufficient_credit', TRUE
        );
    END IF;
    
    -- Calculate dealer's own input volume
    SELECT COALESCE(SUM(amount), 0) INTO v_dealer_volume
    FROM submissions
    WHERE round_id = p_round_id
    AND user_id = p_dealer_id
    AND is_deleted = FALSE;
    
    -- Calculate member input volume (users who belong to this dealer)
    SELECT COALESCE(SUM(s.amount), 0) INTO v_member_volume
    FROM submissions s
    JOIN user_dealer_memberships udm ON s.user_id = udm.user_id
    WHERE s.round_id = p_round_id
    AND udm.dealer_id = p_dealer_id
    AND udm.status = 'active'
    AND s.user_id != p_dealer_id
    AND s.is_deleted = FALSE;
    
    -- Calculate upstream volume (bets forwarded from other dealers)
    SELECT COALESCE(SUM(amount), 0) INTO v_upstream_volume
    FROM submissions
    WHERE round_id = p_round_id
    AND source_dealer_id IS NOT NULL
    AND source_dealer_id != p_dealer_id
    AND user_id = p_dealer_id
    AND is_deleted = FALSE;
    
    -- Total volume
    v_total_volume := v_dealer_volume + v_member_volume + v_upstream_volume;
    
    -- Apply minimum amount threshold (only for dealer's own input)
    IF v_dealer_volume > v_min_amount THEN
        v_chargeable_volume := (v_dealer_volume - v_min_amount) + v_member_volume + v_upstream_volume;
    ELSE
        v_chargeable_volume := v_member_volume + v_upstream_volume;
    END IF;
    
    -- Calculate pending fee
    v_pending_fee := v_chargeable_volume * (v_percentage_rate / 100);
    
    -- Get dealer's current credit
    SELECT COALESCE(balance, 0) INTO v_dealer_credit
    FROM dealer_credits
    WHERE dealer_id = p_dealer_id;
    
    -- Build result
    v_result := jsonb_build_object(
        'has_percentage_package', TRUE,
        'dealer_volume', v_dealer_volume,
        'member_volume', v_member_volume,
        'upstream_volume', v_upstream_volume,
        'total_volume', v_total_volume,
        'chargeable_volume', v_chargeable_volume,
        'percentage_rate', v_percentage_rate,
        'min_amount_before_charge', v_min_amount,
        'pending_fee', v_pending_fee,
        'dealer_credit', v_dealer_credit,
        'available_credit', v_dealer_credit - v_pending_fee,
        'has_sufficient_credit', (v_dealer_credit >= v_pending_fee)
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 5. Function to check if dealer has sufficient credit before saving bet
CREATE OR REPLACE FUNCTION check_credit_before_bet(
    p_round_id UUID,
    p_dealer_id UUID,
    p_new_bet_amount DECIMAL
)
RETURNS JSONB AS $$
DECLARE
    v_current_pending JSONB;
    v_new_pending_fee DECIMAL;
    v_dealer_credit DECIMAL;
    v_percentage_rate DECIMAL;
BEGIN
    -- Get current pending calculation
    v_current_pending := calculate_round_pending_credit(p_round_id, p_dealer_id);
    
    -- If no percentage package, allow the bet
    IF NOT (v_current_pending->>'has_percentage_package')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'allowed', TRUE,
            'message', 'No percentage package',
            'current_pending', v_current_pending
        );
    END IF;
    
    v_percentage_rate := (v_current_pending->>'percentage_rate')::DECIMAL;
    v_dealer_credit := (v_current_pending->>'dealer_credit')::DECIMAL;
    
    -- Calculate new pending fee with the additional bet
    v_new_pending_fee := (v_current_pending->>'pending_fee')::DECIMAL + (p_new_bet_amount * v_percentage_rate / 100);
    
    -- Check if credit is sufficient
    IF v_dealer_credit >= v_new_pending_fee THEN
        RETURN jsonb_build_object(
            'allowed', TRUE,
            'message', 'Credit sufficient',
            'current_credit', v_dealer_credit,
            'new_pending_fee', v_new_pending_fee,
            'remaining_credit', v_dealer_credit - v_new_pending_fee
        );
    ELSE
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'message', 'Insufficient credit',
            'current_credit', v_dealer_credit,
            'new_pending_fee', v_new_pending_fee,
            'shortfall', v_new_pending_fee - v_dealer_credit
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to finalize credit deduction when round closes
CREATE OR REPLACE FUNCTION finalize_round_credit(p_round_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_dealer RECORD;
    v_pending JSONB;
    v_deducted_count INTEGER := 0;
    v_total_deducted DECIMAL := 0;
    v_results JSONB := '[]'::JSONB;
BEGIN
    -- Get all dealers who have submissions in this round with percentage packages
    FOR v_dealer IN 
        SELECT DISTINCT s.user_id as dealer_id
        FROM submissions s
        JOIN dealer_subscriptions ds ON s.user_id = ds.dealer_id
        JOIN subscription_packages sp ON ds.package_id = sp.id
        WHERE s.round_id = p_round_id
        AND ds.status = 'active'
        AND sp.billing_model = 'percentage'
        AND s.is_deleted = FALSE
    LOOP
        -- Calculate final pending credit
        v_pending := calculate_round_pending_credit(p_round_id, v_dealer.dealer_id);
        
        IF (v_pending->>'pending_fee')::DECIMAL > 0 THEN
            -- Deduct credit
            UPDATE dealer_credits
            SET 
                balance = balance - (v_pending->>'pending_fee')::DECIMAL,
                pending_deduction = GREATEST(0, pending_deduction - (v_pending->>'pending_fee')::DECIMAL),
                updated_at = NOW()
            WHERE dealer_id = v_dealer.dealer_id;
            
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
            SELECT 
                v_dealer.dealer_id,
                'deduction',
                -(v_pending->>'pending_fee')::DECIMAL,
                dc.balance,
                'round',
                p_round_id,
                'ค่าบริการงวด ' || lr.lottery_name || ' (' || (v_pending->>'percentage_rate')::TEXT || '%)',
                v_pending
            FROM dealer_credits dc
            CROSS JOIN lottery_rounds lr
            WHERE dc.dealer_id = v_dealer.dealer_id
            AND lr.id = p_round_id;
            
            -- Update or insert round_pending_credits as finalized
            INSERT INTO round_pending_credits (
                round_id, dealer_id, 
                dealer_input_volume, member_input_volume, upstream_volume,
                total_chargeable_volume, percentage_rate, pending_fee,
                is_finalized, finalized_at
            )
            VALUES (
                p_round_id, v_dealer.dealer_id,
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
            
            v_deducted_count := v_deducted_count + 1;
            v_total_deducted := v_total_deducted + (v_pending->>'pending_fee')::DECIMAL;
            
            v_results := v_results || jsonb_build_object(
                'dealer_id', v_dealer.dealer_id,
                'deducted', (v_pending->>'pending_fee')::DECIMAL,
                'details', v_pending
            );
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'round_id', p_round_id,
        'dealers_charged', v_deducted_count,
        'total_deducted', v_total_deducted,
        'details', v_results
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger to update pending_deduction when submissions change
CREATE OR REPLACE FUNCTION update_dealer_pending_deduction()
RETURNS TRIGGER AS $$
DECLARE
    v_dealer_id UUID;
    v_round_id UUID;
    v_pending JSONB;
    v_total_pending DECIMAL := 0;
BEGIN
    -- Determine dealer_id and round_id based on operation
    IF TG_OP = 'DELETE' THEN
        v_dealer_id := OLD.user_id;
        v_round_id := OLD.round_id;
    ELSE
        v_dealer_id := NEW.user_id;
        v_round_id := NEW.round_id;
    END IF;
    
    -- Calculate total pending for all open rounds for this dealer
    SELECT COALESCE(SUM((calculate_round_pending_credit(lr.id, v_dealer_id)->>'pending_fee')::DECIMAL), 0)
    INTO v_total_pending
    FROM lottery_rounds lr
    WHERE lr.dealer_id = v_dealer_id
    AND lr.status IN ('open', 'closed')
    AND lr.is_result_announced = FALSE;
    
    -- Update dealer's pending_deduction
    UPDATE dealer_credits
    SET pending_deduction = v_total_pending, updated_at = NOW()
    WHERE dealer_id = v_dealer_id;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger is commented out to avoid performance issues
-- Uncomment if needed, but consider using batch updates instead
-- DROP TRIGGER IF EXISTS trigger_update_pending_deduction ON submissions;
-- CREATE TRIGGER trigger_update_pending_deduction
--     AFTER INSERT OR UPDATE OR DELETE ON submissions
--     FOR EACH ROW
--     EXECUTE FUNCTION update_dealer_pending_deduction();
