-- Migration 229: Inspect all rounds for dealer Jimmy Charn
CREATE OR REPLACE FUNCTION public.debug_inspect_all_rounds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rounds JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', lr.id,
            'dealer_id', lr.dealer_id,
            'lottery_type', lr.lottery_type,
            'lottery_name', lr.lottery_name,
            'status', lr.status,
            'is_result_announced', lr.is_result_announced,
            'round_date', lr.round_date,
            'open_time', lr.open_time,
            'close_time', lr.close_time,
            'submission_count', (SELECT COUNT(*) FROM public.submissions s WHERE s.round_id = lr.id)
        )
    )
    INTO v_rounds
    FROM public.lottery_rounds lr
    ORDER BY lr.created_at DESC
    LIMIT 20;

    RETURN v_rounds;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_all_rounds() TO anon, authenticated;
