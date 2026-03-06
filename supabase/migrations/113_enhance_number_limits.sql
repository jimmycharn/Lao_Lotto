-- =============================================
-- Migration 113: Enhance Number Limits System
-- เพิ่มระบบเลขอั้นและเลขปิดแบบครบวงจร
-- =============================================

-- 1. Add new columns to number_limits table
-- limit_type: 'limited' = เลขอั้น (รับเกินได้แต่จ่ายลด), 'blocked' = เลขปิด (ปิดรับเมื่อเกิน)
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS limit_type TEXT DEFAULT 'limited' CHECK (limit_type IN ('limited', 'blocked'));

-- payout_percent: อัตราจ่าย % ปกติ (เช่น 100 = จ่ายเต็ม, 70 = จ่าย 70%)
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS payout_percent DECIMAL(5, 2) DEFAULT 100;

-- include_reversed: รวมเลขกลับด้วยหรือไม่
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS include_reversed BOOLEAN DEFAULT FALSE;

-- reversed_numbers: เก็บเลขกลับทั้งหมดที่ generate จาก numbers (JSON array)
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS reversed_numbers JSONB DEFAULT '[]';

-- time_condition: ตั้งอัตราจ่ายตามช่วงเวลา
-- เช่น {"after_time": "18:00", "payout_percent": 50} = หลัง 18:00 จ่าย 50%
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS time_condition JSONB DEFAULT NULL;

-- is_active: เปิด/ปิดใช้งาน
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- updated_at
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Fix RLS policies — drop restrictive SELECT policy and add proper open policies
DROP POLICY IF EXISTS "Users can view number limits" ON number_limits;
DROP POLICY IF EXISTS "authenticated_read_number_limits" ON number_limits;

CREATE POLICY "authenticated_read_number_limits" ON number_limits
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_update_number_limits" ON number_limits
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_number_limits" ON number_limits
    FOR DELETE TO authenticated USING (true);

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_number_limits_round_active ON number_limits(round_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_number_limits_numbers ON number_limits(round_id, numbers);
CREATE INDEX IF NOT EXISTS idx_number_limits_limit_type ON number_limits(round_id, limit_type);

-- 4. Add is_overflow and overflow_amount to submissions for tracking excess amounts
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_overflow BOOLEAN DEFAULT FALSE;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS overflow_amount DECIMAL(12, 2) DEFAULT 0;
-- payout_percent at time of submission (for record keeping)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS actual_payout_percent DECIMAL(5, 2) DEFAULT 100;

-- 5. Create index for overflow submissions
CREATE INDEX IF NOT EXISTS idx_submissions_overflow ON submissions(round_id, is_overflow) WHERE is_overflow = TRUE;

-- 6. Update trigger for number_limits updated_at
CREATE OR REPLACE FUNCTION update_number_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_number_limits_updated_at ON number_limits;
CREATE TRIGGER update_number_limits_updated_at
    BEFORE UPDATE ON number_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_number_limits_updated_at();

-- 7. Create helper function to check number limit with enhanced logic
CREATE OR REPLACE FUNCTION check_number_limit_v2(
    p_round_id UUID,
    p_bet_type TEXT,
    p_numbers TEXT,
    p_amount DECIMAL
) RETURNS TABLE (
    limit_status TEXT,        -- 'ok', 'limited', 'blocked', 'overflow'
    current_total DECIMAL,
    max_allowed DECIMAL,
    remaining_amount DECIMAL,
    overflow_amount DECIMAL,
    payout_percent DECIMAL,
    limit_type TEXT
) AS $$
DECLARE
    v_limit RECORD;
    v_current_total DECIMAL;
    v_max_allowed DECIMAL;
    v_payout_pct DECIMAL := 100;
    v_limit_type TEXT := 'ok';
    v_remaining DECIMAL;
    v_overflow DECIMAL := 0;
    v_now TIMESTAMPTZ := NOW();
    v_round_close_time TIMESTAMPTZ;
    v_after_time TIME;
BEGIN
    -- Get round close time
    SELECT close_time INTO v_round_close_time
    FROM lottery_rounds WHERE id = p_round_id;

    -- Find matching number limit (direct match or reversed match)
    SELECT nl.* INTO v_limit
    FROM number_limits nl
    WHERE nl.round_id = p_round_id
      AND nl.is_active = TRUE
      AND (
          -- Direct match: same bet_type and same numbers
          (nl.bet_type = p_bet_type AND nl.numbers = p_numbers)
          OR
          -- Reversed match: same bet_type and numbers is in reversed_numbers array
          (nl.bet_type = p_bet_type AND nl.include_reversed = TRUE AND nl.reversed_numbers ? p_numbers)
      )
    ORDER BY 
        -- Prefer direct match over reversed match
        CASE WHEN nl.numbers = p_numbers THEN 0 ELSE 1 END
    LIMIT 1;

    -- If no specific number limit found, check type limit
    IF v_limit IS NULL THEN
        -- No number-specific limit, return ok
        RETURN QUERY SELECT 
            'ok'::TEXT,
            0::DECIMAL,
            999999999::DECIMAL,
            999999999::DECIMAL,
            0::DECIMAL,
            100::DECIMAL,
            'none'::TEXT;
        RETURN;
    END IF;

    -- Get current total for this number across all submissions
    SELECT COALESCE(SUM(amount), 0) INTO v_current_total
    FROM submissions
    WHERE round_id = p_round_id
      AND bet_type = p_bet_type
      AND numbers = p_numbers
      AND is_deleted = FALSE
      AND is_overflow = FALSE;

    v_max_allowed := v_limit.max_amount;
    v_remaining := GREATEST(v_max_allowed - v_current_total, 0);

    -- Determine payout percent (check time condition first)
    v_payout_pct := v_limit.payout_percent;
    
    IF v_limit.time_condition IS NOT NULL AND v_limit.time_condition->>'after_time' IS NOT NULL THEN
        v_after_time := (v_limit.time_condition->>'after_time')::TIME;
        IF v_now::TIME >= v_after_time THEN
            v_payout_pct := COALESCE((v_limit.time_condition->>'payout_percent')::DECIMAL, v_payout_pct);
        END IF;
    END IF;

    -- Calculate overflow
    IF (v_current_total + p_amount) > v_max_allowed THEN
        v_overflow := (v_current_total + p_amount) - v_max_allowed;
        
        IF v_limit.limit_type = 'blocked' THEN
            -- Blocked: cannot accept any more
            IF v_current_total >= v_max_allowed THEN
                v_limit_type := 'blocked';
            ELSE
                v_limit_type := 'overflow';
            END IF;
        ELSE
            -- Limited: accept but mark overflow
            v_limit_type := 'overflow';
        END IF;
    ELSE
        v_limit_type := v_limit.limit_type;
    END IF;

    RETURN QUERY SELECT 
        v_limit_type,
        v_current_total,
        v_max_allowed,
        v_remaining,
        v_overflow,
        v_payout_pct,
        v_limit.limit_type;
END;
$$ LANGUAGE plpgsql;
