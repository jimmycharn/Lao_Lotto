-- Migration: 157_auto_round_creator_cron.sql
-- =========================================

CREATE OR REPLACE FUNCTION public.process_due_scheduled_rounds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_req BIGINT;
BEGIN
    SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
    SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';
    
    IF v_url IS NOT NULL THEN
        -- Invoke the line-bot function to create new rounds
        SELECT net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'action', 'auto_create_rounds',
                'secret', v_secret
            )
        ) INTO v_req;
    END IF;
    
    RETURN jsonb_build_object('triggered', true, 'request_id', v_req);
END;
$$;

-- Schedule the job to run daily at 00:00 Bangkok time (17:00 UTC)
DO $$
BEGIN
    PERFORM cron.unschedule('process-scheduled-rounds');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-scheduled-rounds',
    '0 17 * * *',
    $$SELECT public.process_due_scheduled_rounds();$$
);
