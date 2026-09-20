-- Migration 242: Fix debug_inspect_all_dealer_rounds
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
            'id', t.id,
            'dealer_id', t.dealer_id,
            'dealer_name', t.full_name,
            'lottery_name', t.lottery_name,
            'lottery_type', t.lottery_type,
            'status', t.status,
            'round_date', t.round_date,
            'close_time', t.close_time,
            'created_at', t.created_at
        )
    )
    INTO v_rounds
    FROM (
        SELECT lr.*, p.full_name
        FROM public.lottery_rounds lr
        LEFT JOIN public.profiles p ON p.id = lr.dealer_id
        ORDER BY lr.created_at DESC
    ) t;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t2.id,
            'dealer_id', t2.dealer_id,
            'dealer_name', t2.full_name,
            'lottery_name', t2.lottery_name,
            'round_date', t2.round_date,
            'total_entries', t2.total_entries,
            'total_amount', t2.total_amount,
            'deleted_at', t2.deleted_at
        )
    )
    INTO v_history
    FROM (
        SELECT rh.*, p.full_name
        FROM public.round_history rh
        LEFT JOIN public.profiles p ON p.id = rh.dealer_id
        ORDER BY rh.deleted_at DESC NULLS LAST
        LIMIT 10
    ) t2;

    RETURN jsonb_build_object(
        'rounds', v_rounds,
        'history', v_history
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_all_dealer_rounds() TO anon, authenticated;
