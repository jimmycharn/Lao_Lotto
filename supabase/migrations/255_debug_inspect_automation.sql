-- Migration 254: Diagnostic inspection function for automation jobs, rounds, and cron
CREATE OR REPLACE FUNCTION public.debug_inspect_automation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_bkk_now TIMESTAMPTZ;
    v_utc_now TIMESTAMPTZ;
    v_jobs JSONB;
    v_rounds JSONB;
    v_settings JSONB;
    v_cron_jobs JSONB;
BEGIN
    v_utc_now := now();
    v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';

    -- 1. Automation jobs
    SELECT jsonb_agg(to_jsonb(j))
    INTO v_jobs
    FROM public.dealer_automation_jobs j;

    -- 2. Recent lottery rounds
    SELECT jsonb_agg(to_jsonb(r))
    INTO v_rounds
    FROM (
        SELECT id, dealer_id, lottery_type, lottery_name, round_date, open_time, close_time, status, created_at, created_by_job_id
        FROM public.lottery_rounds
        ORDER BY created_at DESC
        LIMIT 10
    ) r;

    -- 3. App settings
    SELECT jsonb_agg(to_jsonb(s))
    INTO v_settings
    FROM public.app_settings s
    WHERE s.key IN ('line_bot_function_url', 'line_bot_cron_secret');

    -- 4. pg_cron jobs
    BEGIN
        SELECT jsonb_agg(to_jsonb(cj))
        INTO v_cron_jobs
        FROM cron.job cj;
    EXCEPTION WHEN OTHERS THEN
        v_cron_jobs := jsonb_build_object('error', SQLERRM);
    END;

    RETURN jsonb_build_object(
        'utc_now', v_utc_now,
        'bkk_now', v_bkk_now,
        'jobs', v_jobs,
        'rounds', v_rounds,
        'settings', v_settings,
        'cron_jobs', v_cron_jobs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_automation() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
