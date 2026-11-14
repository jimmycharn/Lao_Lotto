-- Migration: 261_optimize_line_webhook_trigger_and_purge.sql
-- ==============================================================================
-- Description:
-- 1. Prevent duplicate Edge Function & pg_net invocations:
--    Fast-Path events (bets, slips, bot commands) are processed synchronously by the
--    Edge Function and inserted into line_webhook_queue with status = 'processing'.
--    Previously, trg_process_line_webhook had NO WHEN clause, firing net.http_post
--    for every row. This caused a second Edge Function instance to launch for every bet,
--    doubling database connections and Edge Function load during peak times.
--    We restrict the trigger and function to fire ONLY WHEN (NEW.status = 'pending').
--
-- 2. Daily cleanup of ephemeral webhook queue:
--    Create purge_old_line_webhook_queue(p_days_to_keep) and schedule daily via pg_cron
--    at 20:00 UTC (03:00 Bangkok time) to prevent table bloat on Supabase Free Tier (500MB cap).
-- ==============================================================================

-- 1. Optimize Trigger Function to guard against non-pending items
CREATE OR REPLACE FUNCTION public.trigger_process_line_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_req BIGINT;
BEGIN
    -- Guard: Only pending items need asynchronous queue processing.
    -- Fast-path events (bets, slips, commands) are already executed synchronously.
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
    SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';

    IF v_url IS NOT NULL AND v_url <> '' THEN
        -- Fire async background call via pg_net
        SELECT net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'action', 'process_queue',
                'secret', v_secret,
                'queue_id', NEW.id
            )
        ) INTO v_req;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Re-create trigger with explicit WHEN (NEW.status = 'pending') condition
DROP TRIGGER IF EXISTS trg_process_line_webhook ON public.line_webhook_queue;

CREATE TRIGGER trg_process_line_webhook
    AFTER INSERT ON public.line_webhook_queue
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
    EXECUTE FUNCTION public.trigger_process_line_webhook();

-- 3. Composite index to make purge and status querying instantaneous
CREATE INDEX IF NOT EXISTS idx_line_webhook_queue_status_created_at 
ON public.line_webhook_queue(status, created_at);

-- 4. Purge function to clean up completed/failed ephemeral webhook queue records older than N days
CREATE OR REPLACE FUNCTION public.purge_old_line_webhook_queue(p_days_to_keep INT DEFAULT 7)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM public.line_webhook_queue
    WHERE created_at < (NOW() - (p_days_to_keep || ' days')::INTERVAL)
      AND status IN ('completed', 'failed', 'processing');
      
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_line_webhook_queue(INT) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_process_line_webhook() TO postgres, service_role;

-- 5. Schedule daily cleanup via pg_cron at 20:00 UTC (03:00 Bangkok Time UTC+7)
DO $do$
BEGIN
    -- Safely unschedule previous job if already registered
    PERFORM cron.unschedule('purge-old-webhook-queue');
EXCEPTION WHEN OTHERS THEN
    -- Ignore if pg_cron is not installed or job did not exist
    NULL;
END $do$;

DO $do$
BEGIN
    PERFORM cron.schedule(
        'purge-old-webhook-queue',
        '0 20 * * *', -- 20:00 UTC = 03:00 Bangkok Time
        'SELECT public.purge_old_line_webhook_queue(7);'
    );
EXCEPTION WHEN OTHERS THEN
    -- Graceful fallback if pg_cron extension is not active in current environment
    RAISE NOTICE 'pg_cron not available or schedule failed: %', SQLERRM;
END $do$;
