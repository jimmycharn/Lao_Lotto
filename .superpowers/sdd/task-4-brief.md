### Task 4: Automated Scheduler Worker (Auto Round Creator)
**Files:**
- Modify: `supabase/functions/line-bot/index.ts`
- Create: SQL script for pg_cron scheduling

**Interfaces:**
- Consumes: `dealer_lottery_templates` schedule settings
- Produces: Automatically created round entries and announcements

- [ ] **Step 1: Implement `process_scheduled_round_creation` endpoint in line-bot index.ts**
  Add a handler for `action: 'auto_create_rounds'` that reads templates, calculates if today is a scheduled open date, inserts a new `lottery_rounds` record, inserts limits, and triggers notifications to groups where `notify_round_created = true`.

- [ ] **Step 2: Define database function & cron task**
  Create SQL code to schedule the job:
  ```sql
  -- central worker function to run daily
  CREATE OR REPLACE FUNCTION process_due_scheduled_rounds()
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  DECLARE
      v_url TEXT;
      v_secret TEXT;
      v_req BIGINT;
  BEGIN
      SELECT value INTO v_url FROM app_settings WHERE key = 'line_bot_function_url';
      SELECT value INTO v_secret FROM app_settings WHERE key = 'line_bot_cron_secret';
      
      IF v_url IS NOT NULL THEN
          SELECT net.http_post(
              url := v_url,
              headers := jsonb_build_object('Content-Type', 'application/json'),
              body := jsonb_build_object(
                  'action', 'auto_create_rounds',
                  'secret', v_secret
              )
          ) INTO v_req;
      END IF;
      RETURN jsonb_build_object('triggered', true);
  END;
  $$;

  SELECT cron.schedule('process-scheduled-rounds', '0 0 * * *', 'SELECT process_due_scheduled_rounds();');
  ```

- [ ] **Step 3: Deploy and commit**

---
