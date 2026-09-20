-- Migration 236: Inspect rounds and test dealer_delete_round
CREATE OR REPLACE FUNCTION public.debug_check_rounds_and_test_dealer_delete(p_user_id UUID, p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round RECORD;
    v_user RECORD;
    v_rpc_result JSONB;
    v_error TEXT;
    v_detail TEXT;
    v_recent_rounds JSONB;
BEGIN
    -- Check user
    SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;

    -- Check round
    SELECT * INTO v_round FROM public.lottery_rounds WHERE id = p_round_id;

    -- List all recent rounds for this dealer
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'lottery_name', lottery_name,
            'status', status,
            'round_date', round_date,
            'close_time', close_time,
            'dealer_id', dealer_id
        )
    )
    INTO v_recent_rounds
    FROM public.lottery_rounds
    WHERE dealer_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10;

    -- Now simulate calling dealer_delete_round
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);

    BEGIN
        v_rpc_result := public.dealer_delete_round(p_round_id);
    EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    END;

    RETURN jsonb_build_object(
        'user_found', v_user IS NOT NULL,
        'user_role', v_user.role,
        'round_found', v_round IS NOT NULL,
        'round_dealer_id', v_round.dealer_id,
        'recent_rounds', v_recent_rounds,
        'rpc_result', v_rpc_result,
        'error', v_error,
        'detail', v_detail
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_check_rounds_and_test_dealer_delete(UUID, UUID) TO anon, authenticated;
