-- Migration: 213_check_exact_thai_round_profit.sql

CREATE OR REPLACE FUNCTION public.debug_check_exact_thai_round_profit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_total_bet NUMERIC;
    v_total_comm NUMERIC;
    v_total_payout NUMERIC;
    v_profit NUMERIC;
    v_old_profit NUMERIC := 140318.55;
    v_old_fee NUMERIC := 7015.93;
    v_new_fee NUMERIC;
    v_fee_diff NUMERIC;
BEGIN
    SELECT 
        COALESCE(SUM(s.amount), 0),
        COALESCE(SUM(COALESCE(s.commission_amount, 0)), 0),
        COALESCE(SUM(CASE WHEN s.is_winner = TRUE THEN COALESCE(s.prize_amount, 0) ELSE 0 END), 0)
    INTO 
        v_total_bet,
        v_total_comm,
        v_total_payout
    FROM public.submissions s
    WHERE s.round_id = '349a18b3-44fd-4c96-a7e0-14e6411a019b'
      AND COALESCE(s.is_deleted, FALSE) = FALSE;

    v_profit := v_total_bet - v_total_comm - v_total_payout;
    v_new_fee := ROUND(v_profit * 0.05, 2);
    v_fee_diff := v_old_fee - v_new_fee;

    RETURN jsonb_build_object(
        'total_bet', v_total_bet,
        'total_comm', v_total_comm,
        'total_payout', v_total_payout,
        'new_profit', v_profit,
        'old_profit', v_old_profit,
        'new_fee', v_new_fee,
        'old_fee', v_old_fee,
        'fee_diff', v_fee_diff
    );
END;
$$;
