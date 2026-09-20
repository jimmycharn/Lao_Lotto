-- Migration 241: Inspect all rounds across all dealers
CREATE OR REPLACE FUNCTION public.debug_inspect_all_dealer_rounds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rounds JSONB;
    v_history JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', lr.id,
            'dealer_id', lr.dealer_id,
            'dealer_name', p.full_name,
            'lottery_name', lr.lottery_name,
            'lottery_type', lr.lottery_type,
            'status', lr.status,
            'round_date', lr.round_date,
            'close_time', lr.close_time,
            'created_at', lr.created_at
        )
    )
    INTO v_rounds
    FROM public.lottery_rounds lr
    LEFT JOIN public.profiles p ON p.id = lr.dealer_id
    ORDER BY lr.created_at DESC;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', rh.id,
            'dealer_id', rh.dealer_id,
            'dealer_name', p.full_name,
            'lottery_name', rh.lottery_name,
            'round_date', rh.round_date,
            'total_entries', rh.total_entries,
            'total_amount', rh.total_amount,
            'deleted_at', rh.deleted_at
        )
    )
    INTO v_history
    FROM public.round_history rh
    LEFT JOIN public.profiles p ON p.id = rh.dealer_id
    ORDER BY rh.deleted_at DESC NULLS LAST
    LIMIT 10;

    RETURN jsonb_build_object(
        'rounds', v_rounds,
        'history', v_history
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_all_dealer_rounds() TO anon, authenticated;
