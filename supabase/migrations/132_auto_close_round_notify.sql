-- Migration: Auto-close rounds and notify LINE groups at close time
-- =====================================================
-- Adds an opt-in flag on lottery_rounds. When enabled, a pg_cron job runs every
-- minute, finds rounds whose close_time has passed, closes them, and calls the
-- LINE bot edge function (via pg_net) to push the same "ปิดรับแทงแล้ว" Flex
-- message that the /ปิด command sends.
-- =====================================================

-- 1. Required extensions (free, bundled with Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. New columns on lottery_rounds
ALTER TABLE lottery_rounds
    ADD COLUMN IF NOT EXISTS notify_close_to_groups BOOLEAN DEFAULT FALSE;

ALTER TABLE lottery_rounds
    ADD COLUMN IF NOT EXISTS close_notified_at TIMESTAMPTZ;

-- 3. Config values (app_settings created in migration 117).
--    The function URL points at this project's line-bot edge function.
--    The cron secret is auto-generated so no manual env setup is needed; the
--    edge function reads the same value from app_settings to authorize the call.
INSERT INTO app_settings (key, value, description) VALUES
    ('line_bot_function_url', 'https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot', 'LINE bot edge function URL for cron callbacks'),
    ('line_bot_cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'Shared secret authorizing cron-triggered LINE bot actions')
ON CONFLICT (key) DO NOTHING;

-- 4. Worker function: close due rounds and fire the close notification.
--    The round is closed in-DB first (reliable); the push is best-effort.
CREATE OR REPLACE FUNCTION process_due_round_closures()
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
    SELECT value INTO v_url FROM app_settings WHERE key = 'line_bot_function_url';
    SELECT value INTO v_secret FROM app_settings WHERE key = 'line_bot_cron_secret';

    FOR v_round IN
        SELECT id
        FROM lottery_rounds
        WHERE status = 'open'
          AND is_active = TRUE
          AND COALESCE(notify_close_to_groups, FALSE) = TRUE
          AND close_notified_at IS NULL
          AND close_time IS NOT NULL
          AND close_time <= now()
    LOOP
        -- Close the round and mark as notified (prevents duplicate sends)
        UPDATE lottery_rounds
        SET status = 'closed',
            close_notified_at = now(),
            updated_at = now()
        WHERE id = v_round.id;

        v_count := v_count + 1;

        -- Best-effort push via the LINE bot edge function
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
                -- Ignore push errors; the round is already closed in DB.
                NULL;
            END;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('closed', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION process_due_round_closures() TO authenticated, service_role;

-- 5. Schedule the worker to run every minute (idempotent re-create)
DO $$
BEGIN
    PERFORM cron.unschedule('process-due-round-closures');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'process-due-round-closures',
    '* * * * *',
    $$SELECT process_due_round_closures();$$
);

-- Done!
SELECT 'Migration 132 completed - auto-close round notify scheduled!' AS status;
