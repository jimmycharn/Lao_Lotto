-- ==============================================================================
-- Migration 256: Support Rate Limit in Number Limits and Apply Payout Percent in Winner Calc
-- 1. Update number_limits check constraint to allow 'rate_limit'
-- 2. Add use_default_limit column to number_limits
-- 3. Update calculate_round_winners to scale prize_amount by actual_payout_percent or number_limits.payout_percent
-- ==============================================================================

-- 1. Allow 'rate_limit' in number_limits table
ALTER TABLE number_limits DROP CONSTRAINT IF EXISTS number_limits_limit_type_check;
ALTER TABLE number_limits ADD CONSTRAINT number_limits_limit_type_check CHECK (limit_type IN ('limited', 'blocked', 'rate_limit'));

-- 2. Add use_default_limit column (TRUE = อั้นปกติ ยึดวงเงินตามประเภทเลข)
ALTER TABLE number_limits ADD COLUMN IF NOT EXISTS use_default_limit BOOLEAN DEFAULT FALSE;

-- 3. Update calculate_round_winners function
CREATE OR REPLACE FUNCTION calculate_round_winners(p_round_id UUID) 
RETURNS INTEGER AS $$
DECLARE
  v_round lottery_rounds%ROWTYPE;
  v_submission RECORD;
  v_win_count INTEGER := 0;
  v_is_winner BOOLEAN;
  v_payout_rate DECIMAL;
  v_lottery_type TEXT;
  v_bet_key TEXT;
  v_settings_key TEXT;
  
  -- Winning numbers
  v_6_top TEXT;        -- Thai: 6 digit main number
  v_3_top TEXT;        -- 3 digit top
  v_2_top TEXT;        -- 2 digit top
  v_2_bottom TEXT;     -- 2 digit bottom
  v_3_bottom TEXT[];   -- Thai: array of 4 sets of 3 digit bottom
  v_4_set TEXT;        -- Lao/Hanoi: 4 digit set
  
  -- Submission number
  v_num TEXT;
  v_num_sorted TEXT;
  v_3_top_sorted TEXT;
  
  -- For float check
  v_digit1 TEXT;
  v_digit2 TEXT;
  v_digit3 TEXT;
  v_temp_num TEXT;
  v_found_count INTEGER;
BEGIN
  -- Get round data
  SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL OR v_round.winning_numbers IS NULL THEN
    RETURN 0;
  END IF;
  
  v_lottery_type := v_round.lottery_type;
  
  -- Extract winning numbers based on lottery type
  IF v_lottery_type = 'thai' THEN
    v_6_top := v_round.winning_numbers->>'6_top';
    v_3_top := v_round.winning_numbers->>'3_top';
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_round.winning_numbers->'3_bottom')) INTO v_3_bottom;
    
  ELSIF v_lottery_type IN ('lao', 'hanoi') THEN
    v_4_set := v_round.winning_numbers->>'4_set';
    -- Derive numbers from 4_set if not explicitly set
    -- 3_top = last 3 digits of 4_set
    v_3_top := COALESCE(v_round.winning_numbers->>'3_top', 
                        CASE WHEN length(v_4_set) >= 3 THEN substring(v_4_set from 2 for 3) ELSE NULL END);
    -- 2_top = last 2 digits of 4_set  
    v_2_top := COALESCE(v_round.winning_numbers->>'2_top',
                        CASE WHEN length(v_4_set) >= 2 THEN substring(v_4_set from 3 for 2) ELSE NULL END);
    -- 2_bottom for Lao = first 2 digits of 4_set, for Hanoi = separate field
    IF v_lottery_type = 'lao' THEN
      v_2_bottom := COALESCE(v_round.winning_numbers->>'2_bottom',
                             CASE WHEN length(v_4_set) >= 2 THEN substring(v_4_set from 1 for 2) ELSE NULL END);
    ELSE
      v_2_bottom := v_round.winning_numbers->>'2_bottom';
    END IF;
    
  ELSIF v_lottery_type = 'stock' THEN
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
  END IF;
  
  -- Pre-calculate sorted 3_top for tod comparisons
  IF v_3_top IS NOT NULL THEN
    SELECT string_agg(ch, '' ORDER BY ch) INTO v_3_top_sorted 
    FROM unnest(string_to_array(v_3_top, NULL)) AS ch;
  END IF;
  
  -- Determine lottery type category for settings lookup
  v_bet_key := CASE 
    WHEN v_lottery_type = 'thai' THEN 'thai'
    WHEN v_lottery_type IN ('lao', 'hanoi') THEN 'lao'
    WHEN v_lottery_type = 'stock' THEN 'stock'
    ELSE 'thai'
  END;

  -- Reset submissions for this round before recalculating
  UPDATE submissions 
  SET is_winner = FALSE, prize_amount = 0 
  WHERE round_id = p_round_id AND is_deleted = FALSE;
  
  -- Loop through all submissions
  FOR v_submission IN 
    SELECT s.*, us.lottery_settings
    FROM submissions s
    LEFT JOIN user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_round.dealer_id
    WHERE s.round_id = p_round_id AND s.is_deleted = FALSE
  LOOP
    v_is_winner := FALSE;
    v_num := v_submission.numbers;
    
    -- =====================================================
    -- CHECK WINNING CONDITIONS BASED ON BET TYPE
    -- =====================================================
    
    -- ----- RUN_TOP (วิ่งบน) -----
    IF v_submission.bet_type = 'run_top' AND v_3_top IS NOT NULL AND length(v_num) = 1 THEN
      IF position(v_num in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- RUN_BOTTOM (วิ่งล่าง) -----
    IF v_submission.bet_type = 'run_bottom' AND v_2_bottom IS NOT NULL AND length(v_num) = 1 THEN
      IF position(v_num in v_2_bottom) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- FRONT_TOP_1 (หน้าบน) = 1st digit of 3_top -----
    IF v_submission.bet_type = 'front_top_1' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 1 THEN
      IF v_num = substring(v_3_top from 1 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- MIDDLE_TOP_1 (กลางบน) = 2nd digit of 3_top -----
    IF v_submission.bet_type = 'middle_top_1' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 1 THEN
      IF v_num = substring(v_3_top from 2 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- BACK_TOP_1 (หลังบน / ปักหลักหน่วยบน) = 3rd digit of 3_top -----
    IF (v_submission.bet_type = 'back_top_1' OR v_submission.bet_type = 'pak_top') AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 1 THEN
      IF v_num = substring(v_3_top from 3 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- FRONT_BOTTOM_1 (หน้าล่าง) = 1st digit of 2_bottom -----
    IF v_submission.bet_type = 'front_bottom_1' AND v_2_bottom IS NOT NULL AND length(v_2_bottom) = 2 AND length(v_num) = 1 THEN
      IF v_num = substring(v_2_bottom from 1 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- BACK_BOTTOM_1 (หลังล่าง / ปักหลักหน่วยล่าง) = 2nd digit of 2_bottom -----
    IF (v_submission.bet_type = 'back_bottom_1' OR v_submission.bet_type = 'pak_bottom') AND v_2_bottom IS NOT NULL AND length(v_2_bottom) = 2 AND length(v_num) = 1 THEN
      IF v_num = substring(v_2_bottom from 2 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_TOP (2 ตัวบน) -----
    IF (v_submission.bet_type = '2_top' OR v_submission.bet_type = '2_back') AND v_2_top IS NOT NULL THEN
      IF v_num = v_2_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_BOTTOM (2 ตัวล่าง) -----
    IF v_submission.bet_type = '2_bottom' AND v_2_bottom IS NOT NULL THEN
      IF v_num = v_2_bottom THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_FRONT (2 ตัวหน้า) -----
    IF (v_submission.bet_type = '2_front' OR v_submission.bet_type = '2_front_single') THEN
      IF v_lottery_type = 'thai' AND v_6_top IS NOT NULL AND length(v_6_top) = 6 THEN
        IF v_num = substring(v_6_top from 1 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_lottery_type IN ('lao', 'hanoi') AND v_4_set IS NOT NULL AND length(v_4_set) >= 2 THEN
        IF v_num = substring(v_4_set from 1 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
        IF v_num = substring(v_3_top from 1 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 2_CENTER (2 ตัวกลาง / 2 ตัวถ่าง) -----
    IF (v_submission.bet_type = '2_center' OR v_submission.bet_type = '2_spread' OR v_submission.bet_type = '2_tang') THEN
      IF v_lottery_type = 'thai' AND v_6_top IS NOT NULL AND length(v_6_top) = 6 THEN
        IF v_num = substring(v_6_top from 3 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_lottery_type IN ('lao', 'hanoi') AND v_4_set IS NOT NULL AND length(v_4_set) >= 3 THEN
        IF v_num = substring(v_4_set from 2 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
        IF v_num = (substring(v_3_top from 1 for 1) || substring(v_3_top from 3 for 1)) THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 2_RUN (2 ตัวลอย / วิ่ง 2 ตัวบน) -----
    IF (v_submission.bet_type = '2_run' OR v_submission.bet_type = '2_teng' OR v_submission.bet_type = '2_have') AND v_3_top IS NOT NULL AND length(v_num) = 2 THEN
      v_digit1 := substring(v_num from 1 for 1);
      v_digit2 := substring(v_num from 2 for 1);
      
      IF v_digit1 = v_digit2 THEN
        SELECT count(*) INTO v_found_count
        FROM unnest(string_to_array(v_3_top, NULL)) AS ch
        WHERE ch = v_digit1;
        IF v_found_count >= 2 THEN
          v_is_winner := TRUE;
        END IF;
      ELSE
        IF position(v_digit1 in v_3_top) > 0 AND position(v_digit2 in v_3_top) > 0 THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 3_TOP (3 ตัวบน / 3 ตัวตรง) -----
    IF (v_submission.bet_type = '3_top' OR v_submission.bet_type = '3_straight') AND v_3_top IS NOT NULL THEN
      IF v_num = v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOD (3 ตัวโต๊ด) -----
    IF (v_submission.bet_type = '3_tod' OR v_submission.bet_type = '3_tod_single') AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      
      IF v_num_sorted = v_3_top_sorted THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_BOTTOM (3 ตัวล่าง) -----
    IF v_submission.bet_type = '3_bottom' THEN
      IF v_lottery_type = 'thai' AND v_3_bottom IS NOT NULL THEN
        IF v_num = ANY(v_3_bottom) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_lottery_type IN ('lao', 'hanoi') AND v_4_set IS NOT NULL AND length(v_4_set) >= 3 THEN
        IF v_num = substring(v_4_set from 1 for 3) THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 3_FRONT (3 ตัวหน้า) -----
    IF v_submission.bet_type = '3_front' AND v_lottery_type = 'thai' AND v_6_top IS NOT NULL AND length(v_6_top) = 6 THEN
      IF v_num = substring(v_6_top from 1 for 3) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_BACK (3 ตัวท้าย) -----
    IF v_submission.bet_type = '3_back' AND v_lottery_type = 'thai' AND v_6_top IS NOT NULL AND length(v_6_top) = 6 THEN
      IF v_num = substring(v_6_top from 4 for 3) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_FLOAT (4 ตัวลอย) -----
    IF v_submission.bet_type = '4_float' AND v_4_set IS NOT NULL AND length(v_num) = 4 THEN
      v_found_count := 0;
      v_temp_num := v_4_set;
      FOR i IN 1..4 LOOP
        v_digit1 := substring(v_num from i for 1);
        IF position(v_digit1 in v_temp_num) > 0 THEN
          v_found_count := v_found_count + 1;
          v_temp_num := overlay(v_temp_num placing '' from position(v_digit1 in v_temp_num) for 1);
        END IF;
      END LOOP;
      IF v_found_count = 4 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 5_FLOAT (5 ตัวลอย) -----
    IF v_submission.bet_type = '5_float' AND length(v_num) = 5 THEN
      IF v_6_top IS NOT NULL AND length(v_6_top) = 6 THEN
        v_found_count := 0;
        v_temp_num := v_6_top;
        FOR i IN 1..5 LOOP
          v_digit1 := substring(v_num from i for 1);
          IF position(v_digit1 in v_temp_num) > 0 THEN
            v_found_count := v_found_count + 1;
            v_temp_num := overlay(v_temp_num placing '' from position(v_digit1 in v_temp_num) for 1);
          END IF;
        END LOOP;
        IF v_found_count = 5 THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 6_TOP (6 ตัวตรง) -----
    IF v_submission.bet_type = '6_top' AND v_6_top IS NOT NULL THEN
      IF v_num = v_6_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_SET (หวยชุด 4 ตัว Lao/Hanoi) -----
    IF (v_submission.bet_type = '4_set' OR v_submission.bet_type = '4_top') AND v_4_set IS NOT NULL AND length(v_num) = 4 AND length(v_4_set) = 4 THEN
      DECLARE
        v_4set_prize DECIMAL := 0;
        v_prize_settings JSONB;
        v_win_sorted TEXT;
        v_bet_last3 TEXT := substring(v_num from 2 for 3);
        v_win_last3 TEXT := substring(v_4_set from 2 for 3);
        v_bet_last3_sorted TEXT;
        v_win_last3_sorted TEXT;
        v_bet_first2 TEXT := substring(v_num from 1 for 2);
        v_win_first2 TEXT := substring(v_4_set from 1 for 2);
        v_bet_last2 TEXT := substring(v_num from 3 for 2);
        v_win_last2 TEXT := substring(v_4_set from 3 for 2);
        v_effective_set_pct DECIMAL := COALESCE(v_submission.actual_payout_percent, 100);
      BEGIN
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
        FROM unnest(string_to_array(v_num, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_sorted 
        FROM unnest(string_to_array(v_4_set, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_bet_last3_sorted 
        FROM unnest(string_to_array(v_bet_last3, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_last3_sorted 
        FROM unnest(string_to_array(v_win_last3, NULL)) AS ch;
        
        v_prize_settings := v_submission.lottery_settings->v_bet_key->'4_set'->'prizes';
        
        IF v_num = v_4_set THEN
          v_4set_prize := COALESCE((v_prize_settings->>'4_straight_set')::DECIMAL, 100000);
        ELSIF v_bet_last3 = v_win_last3 THEN
          v_4set_prize := COALESCE((v_prize_settings->>'3_straight_set')::DECIMAL, 30000);
        ELSIF v_bet_sorted = v_win_sorted AND v_num != v_4_set THEN
          v_4set_prize := COALESCE((v_prize_settings->>'4_tod_set')::DECIMAL, 4000);
        ELSIF v_bet_last3_sorted = v_win_last3_sorted AND v_bet_last3 != v_win_last3 THEN
          v_4set_prize := COALESCE((v_prize_settings->>'3_tod_set')::DECIMAL, 3000);
        ELSIF v_bet_first2 = v_win_first2 THEN
          v_4set_prize := COALESCE((v_prize_settings->>'2_front_set')::DECIMAL, 1000);
        ELSIF v_bet_last2 = v_win_last2 THEN
          v_4set_prize := COALESCE((v_prize_settings->>'2_back_set')::DECIMAL, 1000);
        END IF;
        
        IF v_4set_prize > 0 THEN
          v_is_winner := TRUE;
          UPDATE submissions SET 
            is_winner = TRUE,
            prize_amount = (v_4set_prize * (v_effective_set_pct / 100.0))
          WHERE id = v_submission.id;
          
          v_win_count := v_win_count + 1;
        END IF;
      END;
    END IF;
    
    -- =====================================================
    -- UPDATE SUBMISSION IF WINNER (non 4_set)
    -- =====================================================
    IF v_is_winner AND v_submission.bet_type != '4_set' THEN
      DECLARE
        v_settings_key TEXT;
        v_sub_payout_pct DECIMAL := COALESCE(v_submission.actual_payout_percent, 100);
        v_nl_pct DECIMAL;
      BEGIN
        -- Map bet_type to settings key
        v_settings_key := CASE v_submission.bet_type
          WHEN 'front_top_1' THEN 'pak_top'
          WHEN 'middle_top_1' THEN 'pak_top'
          WHEN 'back_top_1' THEN 'pak_top'
          WHEN 'front_bottom_1' THEN 'pak_bottom'
          WHEN 'back_bottom_1' THEN 'pak_bottom'
          WHEN '2_spread' THEN '2_center'
          WHEN '2_tang' THEN '2_center'
          WHEN '2_teng' THEN '2_run'
          WHEN '2_have' THEN '2_run'
          WHEN '2_back' THEN '2_top'
          WHEN '2_front_single' THEN '2_front'
          WHEN '3_top' THEN CASE WHEN v_bet_key = 'lao' THEN '3_straight' ELSE '3_top' END
          WHEN '3_tod' THEN CASE WHEN v_bet_key = 'lao' THEN '3_tod_single' ELSE '3_tod' END
          ELSE v_submission.bet_type
        END;
      
        -- Get payout rate from user's lottery_settings first, then type_limits, then default system payout
        v_payout_rate := COALESCE(
          (v_submission.lottery_settings->v_bet_key->v_settings_key->>'payout')::DECIMAL,
          (SELECT NULLIF(payout_rate, 0) FROM type_limits WHERE round_id = p_round_id AND bet_type = v_settings_key LIMIT 1),
          (SELECT NULLIF(payout_rate, 0) FROM type_limits WHERE round_id = p_round_id AND bet_type = v_submission.bet_type LIMIT 1),
          CASE
            WHEN v_bet_key = 'lao' AND v_settings_key IN ('2_top', '2_front', '2_center', '2_spread', '2_bottom') THEN 70
            WHEN v_settings_key IN ('2_top', '2_front', '2_center', '2_bottom') THEN 65
            WHEN v_settings_key = '2_run' THEN 10
            WHEN v_settings_key = '3_top' THEN 550
            WHEN v_settings_key = '3_tod' THEN 100
            WHEN v_settings_key = '3_bottom' THEN 135
            WHEN v_settings_key = '3_front' THEN 100
            WHEN v_settings_key = '3_back' THEN 135
            WHEN v_settings_key = 'run_top' THEN 3
            WHEN v_settings_key = 'run_bottom' THEN 4
            WHEN v_settings_key IN ('pak_top', 'front_top_1', 'middle_top_1', 'back_top_1') THEN 8
            WHEN v_settings_key IN ('pak_bottom', 'front_bottom_1', 'back_bottom_1') THEN 6
            WHEN v_settings_key = '4_float' THEN 20
            WHEN v_settings_key = '5_float' THEN 10
            WHEN v_settings_key = '6_top' THEN 1000000
            ELSE 1
          END
        );

        -- If actual_payout_percent was not reduced (e.g. 100), check if number_limits has an active limit for this round/number with payout_percent < 100
        IF v_sub_payout_pct = 100 THEN
          SELECT nl.payout_percent INTO v_nl_pct
          FROM number_limits nl
          WHERE nl.round_id = p_round_id
            AND nl.is_active = TRUE
            AND nl.payout_percent < 100
            AND (
              (nl.bet_type = v_submission.bet_type AND nl.numbers = v_num)
              OR (nl.bet_type = v_submission.bet_type AND nl.include_reversed = TRUE AND nl.reversed_numbers ? v_num)
            )
          LIMIT 1;

          IF v_nl_pct IS NOT NULL THEN
            v_sub_payout_pct := v_nl_pct;
          END IF;
        END IF;
        
        -- Update as winner (prize = amount * payout_rate * effective_percent / 100)
        UPDATE submissions SET 
          is_winner = TRUE,
          prize_amount = (v_submission.amount * v_payout_rate * (v_sub_payout_pct / 100.0))
        WHERE id = v_submission.id;
        
        v_win_count := v_win_count + 1;
      END;
    END IF;
    
  END LOOP;
  
  RETURN v_win_count;
END;
$$ LANGUAGE plpgsql;
