-- Migration: Add scheduled layoff times to dealer_automation_jobs
-- ================================================================
-- Allows dealers to schedule multiple layoff times throughout the day
-- (e.g., 10:00, 14:00, 18:00) that trigger auto-layoff before the round closes.

-- 1. Add layoff_schedules JSONB column to dealer_automation_jobs
-- Stores an array of time strings, e.g. ["10:00", "14:00", "18:00"]
ALTER TABLE public.dealer_automation_jobs
    ADD COLUMN IF NOT EXISTS layoff_schedules JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Add layoff_auto_close flag: if true, also run layoff at close_time (final round)
ALTER TABLE public.dealer_automation_jobs
    ADD COLUMN IF NOT EXISTS layoff_auto_close BOOLEAN NOT NULL DEFAULT true;

-- 3. Add last_layoff_at to lottery_rounds to track when layoff was last executed
ALTER TABLE public.lottery_rounds
    ADD COLUMN IF NOT EXISTS last_layoff_at TIMESTAMPTZ;

-- 4. Create function to detect and trigger scheduled layoffs
CREATE OR REPLACE FUNCTION public.process_due_scheduled_layoffs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_req BIGINT;
    v_triggered INT := 0;
    v_now TIMESTAMPTZ;
    v_current_time TEXT;
    v_rec RECORD;
BEGIN
    -- Get current Bangkok time
    v_now := now() AT TIME ZONE 'Asia/Bangkok';
    v_current_time := to_char(v_now, 'HH24:MI');

    -- Look for open rounds that have a job with layoff_schedules,
    -- and at least one scheduled time has arrived but hasn't been processed yet
    FOR v_rec IN
        SELECT r.id AS round_id, j.id AS job_id, sched_time.val AS schedule_time
        FROM public.lottery_rounds r
        INNER JOIN public.dealer_automation_jobs j ON j.id = r.created_by_job_id
        CROSS JOIN LATERAL jsonb_array_elements_text(j.layoff_schedules) AS sched_time(val)
        WHERE r.status = 'open'
          AND r.is_active = TRUE
          AND j.is_active = TRUE
          AND j.layoff_enabled = TRUE
          AND jsonb_array_length(j.layoff_schedules) > 0
          -- The scheduled time has arrived
          AND sched_time.val <= v_current_time
          -- The scheduled time is at or after the open_time (sanity check)
          AND sched_time.val >= j.open_time
          -- The scheduled time is before close_time (don't duplicate the close-time layoff)
          AND sched_time.val < j.close_time
          -- Haven't done layoff at or after this scheduled time today
          AND (
              r.last_layoff_at IS NULL
              OR to_char(r.last_layoff_at AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') < sched_time.val
          )
        ORDER BY r.id, sched_time.val ASC
    LOOP
        -- Only trigger the earliest un-processed schedule per round
        -- (the query is ordered by schedule_time ASC, and we update last_layoff_at after trigger)
        
        -- Get edge function URL and secret
        IF v_url IS NULL THEN
            SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
            SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';
        END IF;

        IF v_url IS NOT NULL AND v_url <> '' THEN
            BEGIN
                SELECT net.http_post(
                    url := v_url,
                    headers := jsonb_build_object('Content-Type', 'application/json'),
                    body := jsonb_build_object(
                        'action', 'auto_scheduled_layoff',
                        'secret', v_secret,
                        'round_id', v_rec.round_id,
                        'schedule_time', v_rec.schedule_time
                    )
                ) INTO v_req;

                v_triggered := v_triggered + 1;
            EXCEPTION WHEN OTHERS THEN
                NULL; -- Silently continue on network errors
            END;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('triggered', v_triggered);
END;
$$;

-- 5. Schedule the cron job to run every minute for precise scheduling
DO $$
BEGIN
    PERFORM cron.unschedule('process-scheduled-layoffs');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-scheduled-layoffs',
    '*/1 * * * *',
    $$SELECT public.process_due_scheduled_layoffs();$$
);
