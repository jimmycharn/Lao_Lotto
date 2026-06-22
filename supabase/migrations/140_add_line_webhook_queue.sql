-- Migration: Add LINE Webhook Queue and Asynchronous Trigger
-- =====================================================
-- Creates a line_webhook_queue table to act as our async buffer.
-- A trigger calls the line-bot Edge Function (via pg_net) when a new row is inserted.
-- =====================================================

-- 1. Create Webhook Queue Table
CREATE TABLE IF NOT EXISTS public.line_webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Index to optimize querying pending items
CREATE INDEX IF NOT EXISTS idx_line_webhook_queue_status ON public.line_webhook_queue(status);

-- Enable RLS to keep it private (service_role automatically bypasses RLS)
ALTER TABLE public.line_webhook_queue ENABLE ROW LEVEL SECURITY;

-- 2. Trigger Function to fire async HTTP POST via pg_net
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
        -- Fire async background call via pg_net
        SELECT extensions.net.http_post(
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

-- 3. Trigger Definition
CREATE OR REPLACE TRIGGER trg_process_line_webhook
    AFTER INSERT ON public.line_webhook_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_process_line_webhook();

SELECT 'Migration 140 completed - LINE Webhook queue and trigger configured!' AS status;
