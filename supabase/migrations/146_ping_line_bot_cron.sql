-- Enable the pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Safely unschedule existing job if it exists
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ping-line-bot';

-- Schedule a cron job named 'ping-line-bot' to run every 5 minutes
SELECT cron.schedule(
  'ping-line-bot',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "ping"}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
