-- Update calculate_round_winners to use user-specific lottery_settings
CREATE OR REPLACE FUNCTION calculate_round_winners(p_round_id UUID) 
RETURNS INTEGER AS $$
DECLARE
  v_round lottery_rounds%ROWTYPE;
  v_submission RECORD;
  v_win_count INTEGER := 0;
  v_winning_number TEXT;
  v_payout_rate DECIMAL;
  v_lottery_type TEXT;
  v_bet_key TEXT;
BEGIN
  -- Get round data
  SELECT * INTO v_round FROM lottery_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL OR v_round.winning_numbers IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Determine lottery type category for settings lookup
  v_lottery_type := CASE 
    WHEN v_round.lottery_type = 'thai' THEN 'thai'
    WHEN v_round.lottery_type IN ('lao', 'hanoi') THEN 'lao'
    WHEN v_round.lottery_type = 'stock' THEN 'stock'
    ELSE 'thai'
  END;
  
  -- Loop through all submissions
  FOR v_submission IN 
    SELECT s.*, us.lottery_settings
    FROM submissions s
    LEFT JOIN user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_round.dealer_id
    WHERE s.round_id = p_round_id AND s.is_deleted = FALSE
  LOOP
    -- Get winning number for this bet type
    v_winning_number := v_round.winning_numbers->>v_submission.bet_type;
    
    -- Map bet_type to lottery_settings key
    v_bet_key := v_submission.bet_type;
    
    -- Check if winner
    IF v_winning_number IS NOT NULL THEN
      -- For tod types, check if number is in array
      IF v_submission.bet_type LIKE '%_tod' AND jsonb_typeof(v_round.winning_numbers->v_submission.bet_type) = 'array' THEN
        IF v_submission.numbers = ANY(ARRAY(SELECT jsonb_array_elements_text(v_round.winning_numbers->v_submission.bet_type))) THEN
          -- Get payout rate from user's lottery_settings first, then fallback to type_limits
          v_payout_rate := COALESCE(
            (v_submission.lottery_settings->v_lottery_type->v_bet_key->>'payout')::DECIMAL,
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
      ELSE
        -- Direct match
        IF v_submission.numbers = v_winning_number THEN
          -- Get payout rate from user's lottery_settings first, then fallback to type_limits
          v_payout_rate := COALESCE(
            (v_submission.lottery_settings->v_lottery_type->v_bet_key->>'payout')::DECIMAL,
            (SELECT payout_rate FROM type_limits WHERE round_id = p_round_id AND bet_type = v_submission.bet_type),
            1
          );
          
          UPDATE submissions SET 
            is_winner = TRUE,
            prize_amount = v_submission.amount * v_payout_rate
          WHERE id = v_submission.id;
          
          v_win_count := v_win_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_win_count;
END;
$$ LANGUAGE plpgsql;
