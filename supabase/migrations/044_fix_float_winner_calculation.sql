-- Fix 4_float and 5_float (ลอยแพ) winner calculation
-- 
-- Problem: 4_float and 5_float bet types were not being checked for winning
-- 
-- Rules for ลอยแพ (floating):
-- - 4_float: Win if all 3 digits of 3_top exist in the 4-digit bet number (order doesn't matter)
-- - 5_float: Win if all 3 digits of 3_top exist in the 5-digit bet number (order doesn't matter)
-- 
-- For Thai lottery: 3_top = 3 ตัวบน
-- For Lao/Hanoi lottery: 3_top = 3 ตัวตรง (last 3 digits of 4_set)
--
-- Note: Since order doesn't matter, numbers like 6357 and 3567 are considered the same bet
-- They are stored sorted (e.g., 3567) but displayed as originally entered

DROP FUNCTION IF EXISTS calculate_round_winners(UUID);

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
    
    -- ----- PAK_TOP (ปักบน) -----
    IF v_submission.bet_type = 'pak_top' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 1 THEN
      IF v_num = substring(v_3_top from 1 for 1) OR
         v_num = substring(v_3_top from 2 for 1) OR
         v_num = substring(v_3_top from 3 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- PAK_BOTTOM (ปักล่าง) -----
    IF v_submission.bet_type = 'pak_bottom' AND v_2_bottom IS NOT NULL AND length(v_2_bottom) = 2 AND length(v_num) = 1 THEN
      IF v_num = substring(v_2_bottom from 1 for 1) OR
         v_num = substring(v_2_bottom from 2 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_BOTTOM (2 ตัวล่าง) -----
    IF v_submission.bet_type = '2_bottom' AND v_2_bottom IS NOT NULL AND length(v_num) = 2 THEN
      IF v_num = v_2_bottom THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_TOP (2 ตัวบน) -----
    IF v_submission.bet_type = '2_top' AND v_2_top IS NOT NULL AND length(v_num) = 2 THEN
      IF v_num = v_2_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_FRONT (2 ตัวหน้า) -----
    IF v_submission.bet_type = '2_front' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 2 THEN
      IF v_num = substring(v_3_top from 1 for 2) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_CENTER (2 ตัวถ่าง) -----
    IF v_submission.bet_type = '2_center' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 2 THEN
      IF v_num = (substring(v_3_top from 1 for 1) || substring(v_3_top from 3 for 1)) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_SPREAD (2 ตัวถ่าง) - same as 2_center -----
    IF v_submission.bet_type = '2_spread' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 2 THEN
      IF v_num = (substring(v_3_top from 1 for 1) || substring(v_3_top from 3 for 1)) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_RUN (2 ตัวลอย) -----
    IF v_submission.bet_type = '2_run' AND v_3_top IS NOT NULL AND length(v_num) = 2 THEN
      IF position(substring(v_num from 1 for 1) in v_3_top) > 0 AND
         position(substring(v_num from 2 for 1) in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOP (3 ตัวตรง) -----
    IF v_submission.bet_type = '3_top' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      IF v_num = v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_STRAIGHT (3 ตัวตรง for Lao/Hanoi) - same as 3_top -----
    IF v_submission.bet_type = '3_straight' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      IF v_num = v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOD (3 ตัวโต๊ด) -----
    -- Win only if same digits but NOT exact match
    IF v_submission.bet_type = '3_tod' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      
      IF v_num_sorted = v_3_top_sorted AND v_num != v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOD_SINGLE (3 ตัวโต๊ด for Lao/Hanoi) - same as 3_tod -----
    IF v_submission.bet_type = '3_tod_single' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      
      IF v_num_sorted = v_3_top_sorted AND v_num != v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_BOTTOM (3 ตัวล่าง) - Thai only -----
    IF v_submission.bet_type = '3_bottom' AND v_lottery_type = 'thai' AND v_3_bottom IS NOT NULL AND length(v_num) = 3 THEN
      IF v_num = ANY(v_3_bottom) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_RUN (4 ตัวลอย - ต้องเรียงตำแหน่ง) -----
    -- 3_top must exist as substring in the 4-digit number (position matters)
    IF v_submission.bet_type = '4_run' AND v_3_top IS NOT NULL AND length(v_num) = 4 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 5_RUN (5 ตัวลอย - ต้องเรียงตำแหน่ง) -----
    -- 3_top must exist as substring in the 5-digit number (position matters)
    IF v_submission.bet_type = '5_run' AND v_3_top IS NOT NULL AND length(v_num) = 5 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_FLOAT (4 ตัวลอยแพ - ไม่สนตำแหน่ง) -----
    -- All 3 digits of 3_top must exist in the 4-digit number (order doesn't matter)
    -- Each digit from 3_top is removed from the bet number once found
    IF v_submission.bet_type = '4_float' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 4 THEN
      v_digit1 := substring(v_3_top from 1 for 1);
      v_digit2 := substring(v_3_top from 2 for 1);
      v_digit3 := substring(v_3_top from 3 for 1);
      v_temp_num := v_num;
      v_found_count := 0;
      
      -- Check digit 1
      IF position(v_digit1 in v_temp_num) > 0 THEN
        v_temp_num := regexp_replace(v_temp_num, v_digit1, '', 'i');
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Check digit 2
      IF position(v_digit2 in v_temp_num) > 0 THEN
        v_temp_num := regexp_replace(v_temp_num, v_digit2, '', 'i');
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Check digit 3
      IF position(v_digit3 in v_temp_num) > 0 THEN
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Win if all 3 digits were found
      IF v_found_count = 3 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 5_FLOAT (5 ตัวลอยแพ - ไม่สนตำแหน่ง) -----
    -- All 3 digits of 3_top must exist in the 5-digit number (order doesn't matter)
    -- Each digit from 3_top is removed from the bet number once found
    IF v_submission.bet_type = '5_float' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 5 THEN
      v_digit1 := substring(v_3_top from 1 for 1);
      v_digit2 := substring(v_3_top from 2 for 1);
      v_digit3 := substring(v_3_top from 3 for 1);
      v_temp_num := v_num;
      v_found_count := 0;
      
      -- Check digit 1
      IF position(v_digit1 in v_temp_num) > 0 THEN
        v_temp_num := regexp_replace(v_temp_num, v_digit1, '', 'i');
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Check digit 2
      IF position(v_digit2 in v_temp_num) > 0 THEN
        v_temp_num := regexp_replace(v_temp_num, v_digit2, '', 'i');
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Check digit 3
      IF position(v_digit3 in v_temp_num) > 0 THEN
        v_found_count := v_found_count + 1;
      END IF;
      
      -- Win if all 3 digits were found
      IF v_found_count = 3 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_SET (4 ตัวชุด) - Lao/Hanoi only -----
    -- Prize is FIXED AMOUNT (not multiplied by bet amount)
    IF v_submission.bet_type = '4_set' AND v_4_set IS NOT NULL AND length(v_num) = 4 THEN
      DECLARE
        v_bet_last3 TEXT;
        v_win_last3 TEXT;
        v_bet_last3_sorted TEXT;
        v_win_last3_sorted TEXT;
        v_bet_first2 TEXT;
        v_win_first2 TEXT;
        v_bet_last2 TEXT;
        v_win_last2 TEXT;
        v_bet_sorted TEXT;
        v_win_sorted TEXT;
        v_4set_prize DECIMAL := 0;
        v_prize_settings JSONB;
      BEGIN
        v_bet_last3 := substring(v_num from 2 for 3);
        v_win_last3 := substring(v_4_set from 2 for 3);
        v_bet_first2 := substring(v_num from 1 for 2);
        v_win_first2 := substring(v_4_set from 1 for 2);
        v_bet_last2 := substring(v_num from 3 for 2);
        v_win_last2 := substring(v_4_set from 3 for 2);
        
        -- Sort for tod comparisons
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_bet_sorted 
        FROM unnest(string_to_array(v_num, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_sorted 
        FROM unnest(string_to_array(v_4_set, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_bet_last3_sorted 
        FROM unnest(string_to_array(v_bet_last3, NULL)) AS ch;
        SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_last3_sorted 
        FROM unnest(string_to_array(v_win_last3, NULL)) AS ch;
        
        -- Get prize settings from user's lottery_settings or use defaults
        v_prize_settings := v_submission.lottery_settings->v_bet_key->'4_set'->'prizes';
        
        -- Check 6 prize conditions - find HIGHEST prize only
        -- Priority: 4ตรง(100000) > 3ตรง(30000) > 4โต๊ด(4000) > 3โต๊ด(3000) > 2หน้า(1000) = 2หลัง(1000)
        IF v_num = v_4_set THEN
          -- 4 ตัวตรงชุด (exact match)
          v_4set_prize := COALESCE((v_prize_settings->>'4_straight_set')::DECIMAL, 100000);
        ELSIF v_bet_last3 = v_win_last3 THEN
          -- 3 ตัวตรงชุด (last 3 exact)
          v_4set_prize := COALESCE((v_prize_settings->>'3_straight_set')::DECIMAL, 30000);
        ELSIF v_bet_sorted = v_win_sorted AND v_num != v_4_set THEN
          -- 4 ตัวโต๊ดชุด (permutation, not exact)
          v_4set_prize := COALESCE((v_prize_settings->>'4_tod_set')::DECIMAL, 4000);
        ELSIF v_bet_last3_sorted = v_win_last3_sorted AND v_bet_last3 != v_win_last3 THEN
          -- 3 ตัวโต๊ดชุด (last 3 permutation, not exact)
          v_4set_prize := COALESCE((v_prize_settings->>'3_tod_set')::DECIMAL, 3000);
        ELSIF v_bet_first2 = v_win_first2 THEN
          -- 2 ตัวหน้าชุด (first 2 exact)
          v_4set_prize := COALESCE((v_prize_settings->>'2_front_set')::DECIMAL, 1000);
        ELSIF v_bet_last2 = v_win_last2 THEN
          -- 2 ตัวหลังชุด (last 2 exact)
          v_4set_prize := COALESCE((v_prize_settings->>'2_back_set')::DECIMAL, 1000);
        END IF;
        
        -- If won, update with FIXED prize amount
        IF v_4set_prize > 0 THEN
          UPDATE submissions SET 
            is_winner = TRUE,
            prize_amount = v_4set_prize
          WHERE id = v_submission.id;
          
          v_win_count := v_win_count + 1;
        END IF;
      END;
    END IF;
    
    -- =====================================================
    -- UPDATE WINNER STATUS FOR NON-4_SET BETS
    -- (4_set is handled above with FIXED prize)
    -- =====================================================
    
    IF v_is_winner AND v_submission.bet_type != '4_set' THEN
      -- Get payout rate from user's lottery_settings first, then type_limits, then default
      v_payout_rate := COALESCE(
        (v_submission.lottery_settings->v_bet_key->v_submission.bet_type->>'payout')::DECIMAL,
        (SELECT payout_rate FROM type_limits WHERE round_id = p_round_id AND bet_type = v_submission.bet_type LIMIT 1),
        1
      );
      
      -- Update as winner (prize = amount * payout_rate)
      UPDATE submissions SET 
        is_winner = TRUE,
        prize_amount = v_submission.amount * v_payout_rate
      WHERE id = v_submission.id;
      
      v_win_count := v_win_count + 1;
    END IF;
    
  END LOOP;
  
  RETURN v_win_count;
END;
$$ LANGUAGE plpgsql;
