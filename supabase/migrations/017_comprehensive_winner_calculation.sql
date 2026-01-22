-- Comprehensive winner calculation function with all lottery rules
-- Supports: Thai, Lao, Hanoi, Stock lottery types

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
  v_3_top TEXT;        -- 3 digit top (last 3 of 6_top or 4_set)
  v_2_top TEXT;        -- 2 digit top (last 2 of 3_top)
  v_2_bottom TEXT;     -- 2 digit bottom
  v_3_bottom TEXT[];   -- Thai: array of 4 sets of 3 digit bottom
  v_4_set TEXT;        -- Lao/Hanoi: 4 digit set
  
  -- Submission number
  v_num TEXT;
  v_num_sorted TEXT;
  v_3_top_sorted TEXT;
BEGIN
  -- Get round data
  SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL OR v_round.winning_numbers IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Extract winning numbers based on lottery type
  v_lottery_type := v_round.lottery_type;
  
  IF v_lottery_type = 'thai' THEN
    v_6_top := v_round.winning_numbers->>'6_top';
    v_3_top := v_round.winning_numbers->>'3_top';
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
    -- Get 3_bottom array
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_round.winning_numbers->'3_bottom')) INTO v_3_bottom;
    
  ELSIF v_lottery_type IN ('lao', 'hanoi') THEN
    v_4_set := v_round.winning_numbers->>'4_set';
    v_3_top := v_round.winning_numbers->>'3_top';
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
    
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
    
    -- ----- RUN_TOP (ลอยบน/วิ่งบน) -----
    -- Win if any digit of submission matches any digit in 3_top
    IF v_submission.bet_type = 'run_top' AND v_3_top IS NOT NULL THEN
      IF position(v_num in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- RUN_BOTTOM (ลอยล่าง/วิ่งล่าง) -----
    -- Win if any digit of submission matches any digit in 2_bottom
    IF v_submission.bet_type = 'run_bottom' AND v_2_bottom IS NOT NULL THEN
      IF position(v_num in v_2_bottom) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- PAK_TOP (ปักบน) -----
    -- Current system uses single pak_top type, check all 3 positions
    -- pak_front_top: matches position 1 of 3_top
    -- pak_center_top: matches position 2 of 3_top  
    -- pak_back_top: matches position 3 of 3_top
    IF v_submission.bet_type = 'pak_top' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
      IF length(v_num) = 1 THEN
        -- Check all 3 positions - win if matches any
        IF v_num = substring(v_3_top from 1 for 1) OR
           v_num = substring(v_3_top from 2 for 1) OR
           v_num = substring(v_3_top from 3 for 1) THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- PAK_BOTTOM (ปักล่าง) -----
    -- Current system uses single pak_bottom type, check both positions
    -- pak_front_bottom: matches position 1 of 2_bottom
    -- pak_back_bottom: matches position 2 of 2_bottom
    IF v_submission.bet_type = 'pak_bottom' AND v_2_bottom IS NOT NULL AND length(v_2_bottom) = 2 THEN
      IF length(v_num) = 1 THEN
        -- Check both positions - win if matches any
        IF v_num = substring(v_2_bottom from 1 for 1) OR
           v_num = substring(v_2_bottom from 2 for 1) THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 2_BOTTOM (2 ตัวล่าง) -----
    -- Exact match with 2_bottom
    IF v_submission.bet_type = '2_bottom' AND v_2_bottom IS NOT NULL THEN
      IF v_num = v_2_bottom THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_TOP (2 ตัวบน) -----
    -- For Thai: matches last 2 digits of 3_top (positions 2-3)
    -- For Lao/Hanoi: matches 2_top (last 2 of 4_set)
    IF v_submission.bet_type = '2_top' THEN
      IF v_lottery_type = 'thai' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
        IF v_num = substring(v_3_top from 2 for 2) THEN
          v_is_winner := TRUE;
        END IF;
      ELSIF v_2_top IS NOT NULL THEN
        IF v_num = v_2_top THEN
          v_is_winner := TRUE;
        END IF;
      END IF;
    END IF;
    
    -- ----- 2_FRONT (2 ตัวหน้า) -----
    -- Matches first 2 digits of 3_top (positions 1-2)
    IF v_submission.bet_type = '2_front' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
      IF v_num = substring(v_3_top from 1 for 2) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_CENTER (2 ตัวถ่าง) -----
    -- Matches positions 1 and 3 of 3_top
    IF v_submission.bet_type = '2_center' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 THEN
      IF v_num = (substring(v_3_top from 1 for 1) || substring(v_3_top from 3 for 1)) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 2_RUN (2 ตัวลอย/2 ตัวมี) -----
    -- Both digits exist in 3_top (any position)
    IF v_submission.bet_type = '2_run' AND v_3_top IS NOT NULL AND length(v_num) = 2 THEN
      IF position(substring(v_num from 1 for 1) in v_3_top) > 0 AND
         position(substring(v_num from 2 for 1) in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOP (3 ตัวบน/3 ตัวตรง) -----
    -- Exact match with 3_top
    IF v_submission.bet_type = '3_top' AND v_3_top IS NOT NULL THEN
      IF v_num = v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_TOD (3 ตัวโต๊ด) -----
    -- Same digits as 3_top but DIFFERENT order (NOT exact match)
    -- If user wants both 3_top and 3_tod, they buy "เต็ง-โต๊ด" which creates 2 submissions
    IF v_submission.bet_type = '3_tod' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      
      -- Win only if same digits but NOT exact match (โต๊ด = permutation only)
      IF v_num_sorted = v_3_top_sorted AND v_num != v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 3_BOTTOM (3 ตัวล่าง) - Thai only -----
    -- Matches any of the 4 sets in 3_bottom array
    IF v_submission.bet_type = '3_bottom' AND v_lottery_type = 'thai' AND v_3_bottom IS NOT NULL THEN
      IF v_num = ANY(v_3_bottom) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_RUN (4 ตัวลอย) -----
    -- 3_top exists anywhere in the 4-digit number
    IF v_submission.bet_type = '4_run' AND v_3_top IS NOT NULL AND length(v_num) = 4 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 5_RUN (5 ตัวลอย) -----
    -- 3_top exists anywhere in the 5-digit number
    IF v_submission.bet_type = '5_run' AND v_3_top IS NOT NULL AND length(v_num) = 5 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- ----- 4_SET (4 ตัวชุด) - Lao/Hanoi only -----
    -- This is handled separately with multiple prize tiers
    -- The frontend calculates the highest prize from 6 possible prizes
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
        
        -- Check 6 prize conditions and find the HIGHEST prize only
        -- Priority order: 4ตรง > 3ตรง > 4โต๊ด > 3โต๊ด > 2หน้า/2หลัง
        IF v_num = v_4_set THEN                                  -- 4 ตัวตรงชุด (exact match) - highest
          v_is_winner := TRUE;
        ELSIF v_bet_last3 = v_win_last3 THEN                     -- 3 ตัวตรงชุด (last 3 exact)
          v_is_winner := TRUE;
        ELSIF v_bet_sorted = v_win_sorted AND v_num != v_4_set THEN -- 4 ตัวโต๊ดชุด (permutation only, not exact)
          v_is_winner := TRUE;
        ELSIF v_bet_last3_sorted = v_win_last3_sorted AND v_bet_last3 != v_win_last3 THEN -- 3 ตัวโต๊ดชุด (permutation only)
          v_is_winner := TRUE;
        ELSIF v_bet_first2 = v_win_first2 THEN                   -- 2 ตัวหน้าชุด (first 2 exact)
          v_is_winner := TRUE;
        ELSIF v_bet_last2 = v_win_last2 THEN                     -- 2 ตัวหลังชุด (last 2 exact)
          v_is_winner := TRUE;
        END IF;
      END;
    END IF;
    
    -- =====================================================
    -- UPDATE WINNER STATUS AND CALCULATE PRIZE
    -- =====================================================
    
    IF v_is_winner THEN
      -- Get payout rate from user's lottery_settings first, then fallback to type_limits
      v_payout_rate := COALESCE(
        (v_submission.lottery_settings->v_bet_key->v_submission.bet_type->>'payout')::DECIMAL,
        (SELECT payout_rate FROM type_limits WHERE round_id = p_round_id AND bet_type = v_submission.bet_type),
        1
      );
      
      -- Update as winner
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
