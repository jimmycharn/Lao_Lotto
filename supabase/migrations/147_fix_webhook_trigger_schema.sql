-- Fix the trigger function to use the correct schema 'net' for HTTP POST calls
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
    SELECT value INTO v_url FROM public.app_settings WHERE key = 'line_bot_function_url';
    SELECT value INTO v_secret FROM public.app_settings WHERE key = 'line_bot_cron_secret';

    IF v_url IS NOT NULL AND v_url <> '' THEN
        -- Fire async background call via pg_net (calling 'net.http_post' instead of 'extensions.net.http_post')
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
