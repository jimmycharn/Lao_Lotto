-- Migration: 158_ai_result_crawler_cron.sql
-- =========================================

CREATE OR REPLACE FUNCTION public.process_centralized_result_crawler()
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
        -- Trigger the centralized crawler endpoint
        SELECT net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'action', 'central_crawl_results',
                'secret', v_secret
            )
        ) INTO v_req;
    END IF;
    
    RETURN jsonb_build_object('triggered', true, 'request_id', v_req);
END;
$$;

-- Schedule the job to run every 10 minutes
DO $$
BEGIN
    PERFORM cron.unschedule('process-result-crawler');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-result-crawler',
    '*/10 * * * *',
    $$SELECT public.process_centralized_result_crawler();$$
);
