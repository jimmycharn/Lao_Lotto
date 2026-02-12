-- Fix 4_set prize calculation - SIMPLE VERSION
-- Prize is FIXED AMOUNT, not multiplied

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
  v_settings_key TEXT;  -- Key to lookup in lottery_settings (may differ from bet_type)
  
  v_6_top TEXT;
  v_3_top TEXT;
  v_2_top TEXT;
  v_2_bottom TEXT;
  v_3_bottom TEXT[];
  v_4_set TEXT;
  
  v_num TEXT;
  v_num_sorted TEXT;
  v_3_top_sorted TEXT;
  
  -- 4_set specific
  v_4set_prize DECIMAL;
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
  SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL OR v_round.winning_numbers IS NULL THEN
    RETURN 0;
  END IF;
  
  v_lottery_type := v_round.lottery_type;
  
  -- Extract winning numbers
  IF v_lottery_type = 'thai' THEN
    v_6_top := v_round.winning_numbers->>'6_top';
    v_3_top := v_round.winning_numbers->>'3_top';
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_round.winning_numbers->'3_bottom')) INTO v_3_bottom;
    
  ELSIF v_lottery_type IN ('lao', 'hanoi') THEN
    v_4_set := v_round.winning_numbers->>'4_set';
    v_3_top := COALESCE(v_round.winning_numbers->>'3_top', substring(v_4_set from 2 for 3));
    v_2_top := COALESCE(v_round.winning_numbers->>'2_top', substring(v_4_set from 3 for 2));
    IF v_lottery_type = 'lao' THEN
      v_2_bottom := COALESCE(v_round.winning_numbers->>'2_bottom', substring(v_4_set from 1 for 2));
    ELSE
      v_2_bottom := v_round.winning_numbers->>'2_bottom';
    END IF;
    
  ELSIF v_lottery_type = 'stock' THEN
    v_2_top := v_round.winning_numbers->>'2_top';
    v_2_bottom := v_round.winning_numbers->>'2_bottom';
  END IF;
  
  -- Pre-calculate sorted 3_top
  IF v_3_top IS NOT NULL THEN
    SELECT string_agg(ch, '' ORDER BY ch) INTO v_3_top_sorted 
    FROM unnest(string_to_array(v_3_top, NULL)) AS ch;
  END IF;
  
  v_bet_key := CASE 
    WHEN v_lottery_type = 'thai' THEN 'thai'
    WHEN v_lottery_type IN ('lao', 'hanoi') THEN 'lao'
    WHEN v_lottery_type = 'stock' THEN 'stock'
    ELSE 'thai'
  END;
  
  -- Loop through submissions
  FOR v_submission IN 
    SELECT s.*, us.lottery_settings
    FROM submissions s
    LEFT JOIN user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_round.dealer_id
    WHERE s.round_id = p_round_id AND s.is_deleted = FALSE
  LOOP
    v_is_winner := FALSE;
    v_num := v_submission.numbers;
    v_4set_prize := 0;
    
    -- ===== 4_SET (4 ตัวชุด) - FIXED PRIZE =====
    IF v_submission.bet_type = '4_set' AND v_4_set IS NOT NULL AND length(v_num) = 4 THEN
      v_bet_last3 := substring(v_num from 2 for 3);
      v_win_last3 := substring(v_4_set from 2 for 3);
      v_bet_first2 := substring(v_num from 1 for 2);
      v_win_first2 := substring(v_4_set from 1 for 2);
      v_bet_last2 := substring(v_num from 3 for 2);
      v_win_last2 := substring(v_4_set from 3 for 2);
      
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_bet_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_sorted 
      FROM unnest(string_to_array(v_4_set, NULL)) AS ch;
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_bet_last3_sorted 
      FROM unnest(string_to_array(v_bet_last3, NULL)) AS ch;
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_win_last3_sorted 
      FROM unnest(string_to_array(v_win_last3, NULL)) AS ch;
      
      -- Check prizes in priority order (highest first)
      -- Get prize settings from user_settings.lottery_settings.lao['4_set'].prizes
      -- Path: lottery_settings -> 'lao' -> '4_set' -> 'prizes' -> prize_key
      IF v_num = v_4_set THEN
        -- 4 ตัวตรงชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'4_straight_set')::DECIMAL,
          100000
        );
      ELSIF v_bet_last3 = v_win_last3 THEN
        -- 3 ตัวตรงชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'3_straight_set')::DECIMAL,
          30000
        );
      ELSIF v_bet_sorted = v_win_sorted AND v_num != v_4_set THEN
        -- 4 ตัวโต๊ดชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'4_tod_set')::DECIMAL,
          4000
        );
      ELSIF v_bet_last3_sorted = v_win_last3_sorted AND v_bet_last3 != v_win_last3 THEN
        -- 3 ตัวโต๊ดชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'3_tod_set')::DECIMAL,
          3000
        );
      ELSIF v_bet_first2 = v_win_first2 THEN
        -- 2 ตัวหน้าชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'2_front_set')::DECIMAL,
          1000
        );
      ELSIF v_bet_last2 = v_win_last2 THEN
        -- 2 ตัวหลังชุด
        v_4set_prize := COALESCE(
          (v_submission.lottery_settings->v_bet_key->'4_set'->'prizes'->>'2_back_set')::DECIMAL,
          1000
        );
      END IF;
      
      IF v_4set_prize > 0 THEN
        UPDATE submissions SET 
          is_winner = TRUE,
          prize_amount = v_4set_prize
        WHERE id = v_submission.id;
        v_win_count := v_win_count + 1;
      END IF;
      
      CONTINUE;  -- Skip to next submission
    END IF;
    
    -- ===== OTHER BET TYPES =====
    
    -- RUN_TOP
    IF v_submission.bet_type = 'run_top' AND v_3_top IS NOT NULL AND length(v_num) = 1 THEN
      IF position(v_num in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- RUN_BOTTOM
    IF v_submission.bet_type = 'run_bottom' AND v_2_bottom IS NOT NULL AND length(v_num) = 1 THEN
      IF position(v_num in v_2_bottom) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- PAK_TOP
    IF v_submission.bet_type = 'pak_top' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 1 THEN
      IF v_num = substring(v_3_top from 1 for 1) OR
         v_num = substring(v_3_top from 2 for 1) OR
         v_num = substring(v_3_top from 3 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- PAK_BOTTOM
    IF v_submission.bet_type = 'pak_bottom' AND v_2_bottom IS NOT NULL AND length(v_2_bottom) = 2 AND length(v_num) = 1 THEN
      IF v_num = substring(v_2_bottom from 1 for 1) OR
         v_num = substring(v_2_bottom from 2 for 1) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 2_BOTTOM
    IF v_submission.bet_type = '2_bottom' AND v_2_bottom IS NOT NULL AND length(v_num) = 2 THEN
      IF v_num = v_2_bottom THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 2_TOP
    IF v_submission.bet_type = '2_top' AND v_2_top IS NOT NULL AND length(v_num) = 2 THEN
      IF v_num = v_2_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 2_FRONT
    IF v_submission.bet_type = '2_front' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 2 THEN
      IF v_num = substring(v_3_top from 1 for 2) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 2_CENTER
    IF v_submission.bet_type = '2_center' AND v_3_top IS NOT NULL AND length(v_3_top) = 3 AND length(v_num) = 2 THEN
      IF v_num = (substring(v_3_top from 1 for 1) || substring(v_3_top from 3 for 1)) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 2_RUN
    IF v_submission.bet_type = '2_run' AND v_3_top IS NOT NULL AND length(v_num) = 2 THEN
      IF position(substring(v_num from 1 for 1) in v_3_top) > 0 AND
         position(substring(v_num from 2 for 1) in v_3_top) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 3_TOP
    IF v_submission.bet_type = '3_top' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      IF v_num = v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 3_TOD (permutation only, not exact)
    IF v_submission.bet_type = '3_tod' AND v_3_top IS NOT NULL AND length(v_num) = 3 THEN
      SELECT string_agg(ch, '' ORDER BY ch) INTO v_num_sorted 
      FROM unnest(string_to_array(v_num, NULL)) AS ch;
      IF v_num_sorted = v_3_top_sorted AND v_num != v_3_top THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 3_BOTTOM (Thai only)
    IF v_submission.bet_type = '3_bottom' AND v_lottery_type = 'thai' AND v_3_bottom IS NOT NULL AND length(v_num) = 3 THEN
      IF v_num = ANY(v_3_bottom) THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 4_RUN
    IF v_submission.bet_type = '4_run' AND v_3_top IS NOT NULL AND length(v_num) = 4 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- 5_RUN
    IF v_submission.bet_type = '5_run' AND v_3_top IS NOT NULL AND length(v_num) = 5 THEN
      IF position(v_3_top in v_num) > 0 THEN
        v_is_winner := TRUE;
      END IF;
    END IF;
    
    -- Update winner for non-4_set bets
    IF v_is_winner THEN
      -- Map bet_type to settings key (Lao/Hanoi use different keys in settings)
      v_settings_key := CASE 
        WHEN v_bet_key IN ('lao', 'hanoi') THEN
          CASE v_submission.bet_type
            WHEN '3_top' THEN '3_straight'
            WHEN '3_tod' THEN '3_tod_single'
            ELSE v_submission.bet_type
          END
        ELSE v_submission.bet_type
      END;
      
      v_payout_rate := COALESCE(
        (v_submission.lottery_settings->v_bet_key->v_settings_key->>'payout')::DECIMAL,
        (SELECT payout_rate FROM type_limits WHERE round_id = p_round_id AND bet_type = v_submission.bet_type LIMIT 1),
        1
      );
      
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
