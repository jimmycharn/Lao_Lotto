-- Migration: 206_find_all_underpaid_winners.sql

CREATE OR REPLACE FUNCTION public.debug_find_underpaid_submissions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'round_id', s.round_id,
            'user_id', s.user_id,
            'bet_type', s.bet_type,
            'numbers', s.numbers,
            'amount', s.amount,
            'prize_amount', s.prize_amount,
            'lottery_type', lr.lottery_type,
            'close_time', lr.close_time
        )
    )
    INTO v_rows
    FROM public.submissions s
    JOIN public.lottery_rounds lr ON lr.id = s.round_id
    WHERE s.is_winner = TRUE 
      AND COALESCE(s.is_deleted, FALSE) = FALSE
      AND s.bet_type IN ('2_top', '2_bottom', '3_top', '3_tod', '3_bottom', '3_front', '2_front', '2_center')
      AND s.prize_amount <= s.amount;

    RETURN v_rows;
END;
$$;
