-- Migration: Allow automation jobs/templates to create multiple rounds per day
-- =================================================================================
-- Previously, dealer_automation_jobs and dealer_lottery_templates were restricted
-- to creating at most one round per calendar day (checked via last_created_at /
-- round_date). This removes that restriction so a job can create as many rounds
-- per day as its schedule allows; the only remaining guard against duplicate
-- rounds is the overlapping-active-round check (same dealer + lottery_type with
-- a still-open time window), enforced in the line-bot edge function.

CREATE OR REPLACE FUNCTION public.process_due_scheduled_rounds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_req BIGINT;
    v_job_due_count INT := 0;
    v_tmpl_due_count INT := 0;
    v_now TIMESTAMPTZ;
    v_current_day_of_week INT;
    v_current_day_of_month INT;
    v_current_date DATE;
    v_current_time TEXT;
    v_is_last_day_of_month BOOLEAN;
BEGIN
    -- Get current Bangkok time
    v_now := now() AT TIME ZONE 'Asia/Bangkok';
    v_current_day_of_week := extract(dow from v_now); -- 0 = Sunday, 1 = Monday...
    v_current_day_of_month := extract(day from v_now);
    v_current_date := (v_now)::date;
    v_current_time := to_char(v_now, 'HH24:MI');
    v_is_last_day_of_month := (extract(month from v_now + interval '1 day') <> extract(month from v_now));

    -- Count active automation jobs that are due (no longer gated by last_created_at)
    SELECT count(*)
    INTO v_job_due_count
    FROM public.dealer_automation_jobs j
    WHERE j.is_active = TRUE
      -- Check schedule matches today
      AND (
          (j.schedule_mode = 'weekly' AND j.schedule_days @> to_jsonb(v_current_day_of_week))
          OR
          (j.schedule_mode = 'monthly' AND (j.schedule_days @> to_jsonb(v_current_day_of_month) OR (j.schedule_days @> '"last"'::jsonb AND v_is_last_day_of_month)))
      )
      -- Check open time has arrived
      AND j.open_time <= v_current_time;

    -- Count legacy templates that are due (no longer gated by an existing round on the same date)
    SELECT count(*)
    INTO v_tmpl_due_count
    FROM public.dealer_lottery_templates t
    WHERE t.is_auto_round_enabled = TRUE
      -- Check schedule matches today
      AND (
          (t.schedule_mode = 'weekly' AND t.schedule_days @> to_jsonb(v_current_day_of_week))
          OR
          (t.schedule_mode = 'monthly' AND (t.schedule_days @> to_jsonb(v_current_day_of_month) OR (t.schedule_days @> '"last"'::jsonb AND v_is_last_day_of_month)))
      )
      -- Check open time has arrived
      AND t.open_time <= v_current_time;

    -- Trigger the LINE bot edge function if there is any work to do
    IF (v_job_due_count + v_tmpl_due_count) > 0 THEN
        SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
        SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';

        IF v_url IS NOT NULL AND v_url <> '' THEN
            SELECT net.http_post(
                url := v_url,
                headers := jsonb_build_object('Content-Type', 'application/json'),
                body := jsonb_build_object(
                    'action', 'auto_create_rounds',
                    'secret', v_secret
                )
            ) INTO v_req;
        END IF;
        RETURN jsonb_build_object('triggered', true, 'request_id', v_req, 'due_jobs', v_job_due_count, 'due_legacy_templates', v_tmpl_due_count);
    END IF;

    RETURN jsonb_build_object('triggered', false, 'due_jobs', 0, 'due_legacy_templates', 0);
END;
$$;
