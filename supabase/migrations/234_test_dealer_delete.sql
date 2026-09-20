-- Migration 234: Test auth.uid() simulation and test delete as dealer
CREATE OR REPLACE FUNCTION public.debug_test_dealer_delete(p_dealer_id UUID, p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_sim_uid UUID;
    v_can_see_round BOOLEAN;
    v_can_delete_round BOOLEAN;
    v_error TEXT;
    v_detail TEXT;
    v_deleted_rows INT := 0;
BEGIN
    -- Set jwt claims for dealer
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_dealer_id, 'role', 'authenticated')::text, true);
    
    -- Check what auth.uid() evaluates to
    v_sim_uid := auth.uid();

    -- Check if round exists and matches dealer_id
    SELECT EXISTS (
        SELECT 1 FROM public.lottery_rounds 
        WHERE id = p_round_id AND dealer_id = v_sim_uid
    ) INTO v_can_see_round;

    -- Now test delete in a subtransaction with rollback
    BEGIN
        DELETE FROM public.lottery_rounds WHERE id = p_round_id;
        GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
        RAISE EXCEPTION 'TEST_DELETED_%_ROWS', v_deleted_rows;
    EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    END;

    RETURN jsonb_build_object(
        'simulated_uid', v_sim_uid,
        'matches_dealer', v_can_see_round,
        'result', v_error,
        'detail', v_detail
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_test_dealer_delete(UUID, UUID) TO anon, authenticated;
