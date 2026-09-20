-- Migration 230: Inspect all rounds cleanly
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
            'id', r.id,
            'dealer_id', r.dealer_id,
            'lottery_type', r.lottery_type,
            'lottery_name', r.lottery_name,
            'status', r.status,
            'is_result_announced', r.is_result_announced,
            'round_date', r.round_date,
            'open_time', r.open_time,
            'close_time', r.close_time,
            'submission_count', r.sub_count
        )
    )
    INTO v_rounds
    FROM (
        SELECT 
            lr.id,
            lr.dealer_id,
            lr.lottery_type,
            lr.lottery_name,
            lr.status,
            lr.is_result_announced,
            lr.round_date,
            lr.open_time,
            lr.close_time,
            (SELECT COUNT(*) FROM public.submissions s WHERE s.round_id = lr.id) AS sub_count
        FROM public.lottery_rounds lr
        ORDER BY lr.created_at DESC
        LIMIT 20
    ) r;

    RETURN v_rounds;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_all_rounds() TO anon, authenticated;
