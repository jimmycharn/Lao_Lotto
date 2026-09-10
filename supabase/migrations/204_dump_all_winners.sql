-- Migration: 204_dump_all_winners.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_game_thai_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round_id UUID := '349a18b3-44fd-4c96-a7e0-14e6411a019b';
    v_dealer_id UUID := 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';
    v_rows JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'bet_type', s.bet_type,
            'numbers', s.numbers,
            'amount', s.amount,
            'prize_amount', s.prize_amount,
            'user_settings_found', (us.id IS NOT NULL),
            'user_payout_setting', us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout',
            'calc_with_setting', (s.amount * (us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout')::NUMERIC),
            'calc_with_fallback', (s.amount * CASE 
                WHEN s.bet_type = '3_top' THEN 900.0
                WHEN s.bet_type IN ('2_top', '2_bottom') THEN 90.0
                WHEN s.bet_type = 'run_top' THEN 3.2
                WHEN s.bet_type = 'run_bottom' THEN 4.2
                ELSE 1.0
            END)
        )
    )
    INTO v_rows
    FROM public.submissions s
    LEFT JOIN public.user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_dealer_id
    WHERE s.round_id = v_round_id 
      AND s.is_winner = TRUE 
      AND COALESCE(s.is_deleted, FALSE) = FALSE;

    RETURN v_rows;
END;
$$;
