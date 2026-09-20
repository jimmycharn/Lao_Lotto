-- Migration 233: Simulate authenticated user deleting round
CREATE OR REPLACE FUNCTION public.debug_simulate_authenticated_delete(p_user_id UUID, p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_error TEXT := NULL;
    v_detail TEXT := NULL;
    v_hint TEXT := NULL;
    v_rows_deleted INT := 0;
BEGIN
    -- Set session auth to authenticated role with jwt claims
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);

    BEGIN
        DELETE FROM public.lottery_rounds WHERE id = p_round_id;
        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        RAISE EXCEPTION 'SIMULATED_SUCCESS: % rows deleted', v_rows_deleted;
    EXCEPTION
        WHEN OTHERS THEN
            v_error := SQLERRM;
            GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    END;

    -- Reset role
    RESET role;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'round_id', p_round_id,
        'result', v_error,
        'detail', v_detail,
        'hint', v_hint
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_simulate_authenticated_delete(UUID, UUID) TO anon, authenticated;
