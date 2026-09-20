-- Migration 240: Test dealer_delete_round on specific rounds and catch any error
CREATE OR REPLACE FUNCTION public.debug_simulate_dealer_delete_test(p_user_id UUID, p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_error TEXT;
    v_detail TEXT;
    v_hint TEXT;
    v_context TEXT;
    v_result JSONB;
BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);

    BEGIN
        v_result := public.dealer_delete_round(p_round_id);
    EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        GET STACKED DIAGNOSTICS 
            v_detail = PG_EXCEPTION_DETAIL,
            v_hint = PG_EXCEPTION_HINT,
            v_context = PG_EXCEPTION_CONTEXT;
    END;

    RETURN jsonb_build_object(
        'success', v_error IS NULL,
        'result', v_result,
        'error', v_error,
        'detail', v_detail,
        'hint', v_hint,
        'context', v_context
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_simulate_dealer_delete_test(UUID, UUID) TO anon, authenticated;
