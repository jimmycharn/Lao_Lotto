-- Migration 231: Inspect triggers and test delete
CREATE OR REPLACE FUNCTION public.debug_inspect_triggers_and_test_delete(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_triggers JSONB;
    v_error TEXT := NULL;
    v_detail TEXT := NULL;
    v_rows_deleted INT := 0;
BEGIN
    -- List triggers on related tables
    SELECT jsonb_agg(
        jsonb_build_object(
            'event_object_table', event_object_table,
            'trigger_name', trigger_name,
            'event_manipulation', event_manipulation,
            'action_timing', action_timing
        )
    )
    INTO v_triggers
    FROM information_schema.triggers
    WHERE event_object_table IN ('lottery_rounds', 'submissions', 'type_limits', 'number_limits', 'bet_transfers', 'round_pending_credits', 'dealer_billing_records', 'ai_analysis_logs');

    -- Try deleting in a block
    BEGIN
        DELETE FROM public.lottery_rounds WHERE id = p_round_id;
        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        RAISE EXCEPTION 'TEST_ROLLBACK: % rows would be deleted', v_rows_deleted;
    EXCEPTION 
        WHEN OTHERS THEN
            v_error := SQLERRM;
            GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    END;

    RETURN jsonb_build_object(
        'triggers', v_triggers,
        'test_delete_result', v_error,
        'detail', v_detail
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_triggers_and_test_delete(UUID) TO anon, authenticated;
