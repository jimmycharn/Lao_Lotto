-- Migration: Create Dealer Automation Jobs table and update scheduling crons
-- =========================================================================

-- 1. Create public.dealer_automation_jobs table
CREATE TABLE IF NOT EXISTS public.dealer_automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lottery_type TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Schedule settings
    schedule_mode TEXT NOT NULL DEFAULT 'weekly', -- 'weekly', 'monthly'
    schedule_days JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g., [1,2,3,4,5] or [15] or ["last"]
    open_time TEXT NOT NULL DEFAULT '06:00', -- HH:MM
    close_day_offset INTEGER NOT NULL DEFAULT 0,
    close_time TEXT NOT NULL DEFAULT '20:15', -- HH:MM
    
    -- Actions when closed (พอหมดเวลารับ)
    layoff_enabled BOOLEAN NOT NULL DEFAULT false,
    layoff_method TEXT NOT NULL DEFAULT 'limits', -- 'limits', 'formula', 'ai'
    layoff_keep_amount NUMERIC NOT NULL DEFAULT 0, -- [จำนวนสู้] or [จำนวนเงินสู้]
    layoff_notify_group_enabled BOOLEAN NOT NULL DEFAULT false,
    layoff_notify_group_id UUID REFERENCES public.line_groups(id) ON DELETE SET NULL,
    
    notify_bets_enabled BOOLEAN NOT NULL DEFAULT false,
    notify_bets_group_id UUID REFERENCES public.line_groups(id) ON DELETE SET NULL,
    notify_bets_types JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of strings e.g. ["total", "remaining", "layoff"]
    
    -- Actions when result is out (เมื่อออกผลรางวัล)
    auto_import_result_enabled BOOLEAN NOT NULL DEFAULT false, -- ดึงเลขรางวัลมาสรุปผล
    result_notify_group_id UUID REFERENCES public.line_groups(id) ON DELETE SET NULL, -- แจ้งลงกลุ่มที่เลือก
    notify_result_enabled BOOLEAN NOT NULL DEFAULT false, -- แจ้งผลไปยังสมาชิกกลุ่มต่างๆ เหมือน /แจ้งผล
    
    -- Tracking last executions to avoid double trigger
    last_created_at TIMESTAMPTZ, -- When a round was last created by this job
    last_closed_at TIMESTAMPTZ, -- When close action was last run
    last_announced_at TIMESTAMPTZ, -- When result action was last run
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dealer_automation_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for dealer_automation_jobs
DROP POLICY IF EXISTS "Dealers can manage their own automation jobs" ON public.dealer_automation_jobs;
CREATE POLICY "Dealers can manage their own automation jobs" 
ON public.dealer_automation_jobs 
FOR ALL 
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

-- Trigger to update updated_at on dealer_automation_jobs
CREATE OR REPLACE FUNCTION public.handle_updated_at_automation_jobs()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_automation_jobs ON public.dealer_automation_jobs;
CREATE TRIGGER set_updated_at_automation_jobs
BEFORE UPDATE ON public.dealer_automation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at_automation_jobs();

-- 2. Add created_by_job_id link column to public.lottery_rounds
ALTER TABLE public.lottery_rounds
    ADD COLUMN IF NOT EXISTS created_by_job_id UUID REFERENCES public.dealer_automation_jobs(id) ON DELETE SET NULL;

-- 3. Modify process_due_round_closures to support job-created rounds closing
CREATE OR REPLACE FUNCTION public.process_due_round_closures()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_round RECORD;
    v_url TEXT;
    v_secret TEXT;
    v_count INT := 0;
    v_req BIGINT;
BEGIN
    SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
    SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';

    FOR v_round IN
        SELECT id
        FROM public.lottery_rounds
        WHERE status = 'open'
          AND is_active = TRUE
          -- Close either if notify_close_to_groups is true OR if it was created by an automation job
          AND (COALESCE(notify_close_to_groups, FALSE) = TRUE OR created_by_job_id IS NOT NULL)
          AND close_notified_at IS NULL
          AND close_time IS NOT NULL
          AND close_time <= now()
    LOOP
        -- Close the round and mark as closed/notified (prevents duplicate triggers)
        UPDATE public.lottery_rounds
        SET status = 'closed',
            close_notified_at = now(),
            updated_at = now()
        WHERE id = v_round.id;

        v_count := v_count + 1;

        -- Invoke the LINE bot edge function
        IF v_url IS NOT NULL AND v_url <> '' THEN
            BEGIN
                SELECT net.http_post(
                    url := v_url,
                    headers := jsonb_build_object('Content-Type', 'application/json'),
                    body := jsonb_build_object(
                        'action', 'auto_close_notify',
                        'secret', v_secret,
                        'round_id', v_round.id
                    )
                ) INTO v_req;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore push errors; round is closed safely in DB
                NULL;
            END;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('closed', v_count);
END;
$$;

-- 4. Optimize process_due_scheduled_rounds to query dealer_automation_jobs AND fallback legacy templates
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

    -- Count active automation jobs that are due
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
      AND j.open_time <= v_current_time
      -- Check has not run today
      AND (
          j.last_created_at IS NULL 
          OR (j.last_created_at AT TIME ZONE 'Asia/Bangkok')::date < v_current_date
      );

    -- Count legacy templates that are due (fallback compatibility)
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
      AND t.open_time <= v_current_time
      -- Check if round already exists for this dealer, type and date (as template doesn't have last_created_at)
      AND NOT EXISTS (
          SELECT 1 FROM public.lottery_rounds r
          WHERE r.dealer_id = t.dealer_id
            AND r.lottery_type = t.lottery_type
            AND r.round_date = v_current_date
      );

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

-- 5. Reschedule process-scheduled-rounds to run every 5 minutes instead of daily
DO $$
BEGIN
    PERFORM cron.unschedule('process-scheduled-rounds');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-scheduled-rounds',
    '*/5 * * * *',
    $$SELECT public.process_due_scheduled_rounds();$$
);
