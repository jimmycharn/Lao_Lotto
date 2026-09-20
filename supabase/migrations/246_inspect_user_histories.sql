-- Migration 246: Inspect user_round_history specifically for the two rounds
CREATE OR REPLACE FUNCTION public.debug_inspect_round_user_histories(p_round_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', urh.id,
            'user_id', urh.user_id,
            'user_name', p.full_name,
            'round_id', urh.round_id,
            'round_date', urh.round_date,
            'total_entries', urh.total_entries,
            'total_amount', urh.total_amount,
            'total_commission', urh.total_commission,
            'total_winnings', urh.total_winnings,
            'profit_loss', urh.profit_loss,
            'winning_numbers', urh.winning_numbers
        )
    )
    INTO v_result
    FROM public.user_round_history urh
    LEFT JOIN public.profiles p ON p.id = urh.user_id
    WHERE urh.round_id = ANY(p_round_ids);

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_round_user_histories(UUID[]) TO anon, authenticated;
