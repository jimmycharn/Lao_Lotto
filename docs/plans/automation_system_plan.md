# Lottery Automation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete automated lottery management system that handles round scheduling/creation, granular group notification routing, auto-layoff calculations at closure, centralized AI search crawler for winning numbers with URL memory, and user-friendly LINE announcement commands.

**Architecture:** 
- **Database Schema:** Extend `dealer_lottery_templates` and `line_groups` with automation flags. Create centralized tables `central_lottery_results`, `central_lottery_sources`, and `central_ai_search_jobs`.
- **Cron Jobs (pg_cron + pg_net):** Automated workers run inside PostgreSQL and trigger Deno Edge Function endpoints for time-sensitive tasks.
- **AI Crawling:** A single centralized worker runs queries on OpenRouter using search-grounding and feeds results back to all active dealer rounds.

**Tech Stack:** Supabase (PostgreSQL, pg_cron, pg_net), Deno Edge Functions (TypeScript), React + Vite.

## Global Constraints
- Database changes must be packaged in clean SQL migrations in `supabase/migrations/`
- Frontend changes must be compatible with existing component states in `src/pages/Dealer.jsx`
- API calls to OpenRouter must handle timeouts and retries gracefully without hanging

---

### Task 1: Database Migration
**Files:**
- Create: `supabase/migrations/156_add_automation_columns_and_tables.sql`

**Interfaces:**
- Consumes: Existing DB schema (profiles, line_groups, dealer_lottery_templates)
- Produces: Updated database tables with scheduling, routing, and centralized crawling schemas

- [ ] **Step 1: Write migration SQL code**
  Create `supabase/migrations/156_add_automation_columns_and_tables.sql` with the following structure:
  ```sql
  -- Add automation settings to templates
  ALTER TABLE public.dealer_lottery_templates
      ADD COLUMN IF NOT EXISTS is_auto_round_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'weekly',
      ADD COLUMN IF NOT EXISTS schedule_days JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS close_day_offset INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS auto_layoff_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS auto_layoff_method TEXT NOT NULL DEFAULT 'limits',
      ADD COLUMN IF NOT EXISTS auto_layoff_keep_amount NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS auto_import_result_enabled BOOLEAN NOT NULL DEFAULT false;

  -- Add notification switches to line_groups
  ALTER TABLE public.line_groups
      ADD COLUMN IF NOT EXISTS notify_round_created BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_admin_alerts BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_layoff_bets BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_round_summary BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_lottery_results BOOLEAN NOT NULL DEFAULT false;

  -- Create central results table
  CREATE TABLE IF NOT EXISTS public.central_lottery_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lottery_type TEXT NOT NULL,
      round_date DATE NOT NULL,
      win_number_3_top TEXT,
      win_number_2_bottom TEXT,
      win_number_3_tod TEXT,
      win_number_all JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (lottery_type, round_date)
  );

  ALTER TABLE public.central_lottery_results ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone authenticated can select central results" ON public.central_lottery_results FOR SELECT USING (true);
  CREATE POLICY "Service role can manage central results" ON public.central_lottery_results FOR ALL USING (true) WITH CHECK (true);

  -- Create sources table
  CREATE TABLE IF NOT EXISTS public.central_lottery_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lottery_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      success_count INTEGER NOT NULL DEFAULT 0,
      last_success_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (lottery_type, source_url)
  );

  ALTER TABLE public.central_lottery_sources ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone authenticated can select sources" ON public.central_lottery_sources FOR SELECT USING (true);
  CREATE POLICY "Service role can manage sources" ON public.central_lottery_sources FOR ALL USING (true) WITH CHECK (true);

  -- Create search jobs table
  CREATE TABLE IF NOT EXISTS public.central_ai_search_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lottery_type TEXT NOT NULL,
      round_date DATE NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending',
      last_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (lottery_type, round_date)
  );

  ALTER TABLE public.central_ai_search_jobs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone authenticated can select search jobs" ON public.central_ai_search_jobs FOR SELECT USING (true);
  CREATE POLICY "Service role can manage search jobs" ON public.central_ai_search_jobs FOR ALL USING (true) WITH CHECK (true);
  ```

- [ ] **Step 2: Deploy database schema**
  Run: `powershell -ExecutionPolicy Bypass -Command "supabase db push"`
  Expected: Database schema successfully pushes new columns and tables to the remote database.

- [ ] **Step 3: Commit migration**
  Run git commands to stage and commit the migration file.

---

### Task 2: Web Dashboard UI - LINE Group Settings
**Files:**
- Modify: `src/pages/Dealer.jsx` (Add toggle switches for group-level notification routing in the LINE Groups tab)

**Interfaces:**
- Consumes: Updated database schema columns for `line_groups`
- Produces: Enhanced UI settings in the LINE group listing/edit view

- [ ] **Step 1: Write UI code for toggles**
  Locate the LINE Groups list rendering block in `Dealer.jsx` and insert switches for:
  - `notify_round_created`
  - `notify_admin_alerts`
  - `notify_layoff_bets`
  - `notify_round_summary`
  - `notify_lottery_results`
  Include api handlers to update these switches inside the database via Supabase client.

- [ ] **Step 2: Verify compilation**
  Run: `powershell -ExecutionPolicy Bypass -Command "npm run build"`
  Expected: Successful compilation of UI without errors.

- [ ] **Step 3: Commit changes**

---

### Task 3: Web Dashboard UI - Templates & Auto-Scheduling
**Files:**
- Modify: `src/pages/Dealer.jsx` (Add schedules, offsets, auto-layoff settings, and AI auto-import to Create Round/Template modal)

**Interfaces:**
- Consumes: Updated templates schema columns
- Produces: Full automation settings inside templates form

- [ ] **Step 1: Update Templates Modal Form**
  Include inputs for:
  - Enabled auto-creation (checkbox/switch)
  - Mode Selection (weekly days / monthly dates dropdown/checkbox list)
  - Offsets (input number)
  - Auto-layoff flag & method selection
  - Auto-import result flag
  Hook these elements to `handleSaveTemplate` upsert requests.

- [ ] **Step 2: Run verification**
  Run: `powershell -ExecutionPolicy Bypass -Command "npm run build"`
  Expected: Build finishes with no issues.

- [ ] **Step 3: Commit changes**

---

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

### Task 5: Auto-Layoff and Close summaries Trigger
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Extend `auto_close_notify` callback to execute auto-layoff calculations and route closing reports)

**Interfaces:**
- Consumes: Closed round ID
- Produces: Stored layoff entries and formatted messages sent to correct LINE groups

- [ ] **Step 1: Extend auto-close callback logic**
  In the `auto_close_notify` handler:
  - If `template.auto_layoff_enabled` is active, fetch bets, invoke `layoffCalculator`, and format messages.
  - Send the layoff message to groups matching `notify_layoff_bets = true`.
  - Calculate total bets, remaining stakes, and list of senders. Format and send this closing summary report to groups matching `notify_round_summary = true`.

- [ ] **Step 2: Deploy and verify Deno edge function compilation**
  Run: `powershell -ExecutionPolicy Bypass -Command "supabase functions deploy line-bot --no-verify-jwt"`
  Expected: Successful deployment.

- [ ] **Step 3: Commit changes**

---

### Task 6: Centralized AI Search & URL Memory Crawler
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Create crawling engine calling OpenRouter, prioritizing sources, mapping results, and importing to dealer rounds)

**Interfaces:**
- Consumes: Closed dates, OpenRouter API keys from system settings
- Produces: Central results records, updated URL scores, and automatic round winners calculation

- [ ] **Step 1: Implement AI Crawler in index.ts**
  Add a handler for `action: 'central_crawl_results'`.
  - Retrieve closed dates without entries in `central_lottery_results`.
  - Query remembered URLs from `central_lottery_sources`.
  - Call OpenRouter with Web Search grounding. Prompt: *"Find win numbers for [type] on [date]. Try these sources first if valid: [urls]. Return JSON."*
  - On success: write to `central_lottery_results`, increment success count in `central_lottery_sources`, and auto-import results into all matching dealer rounds (running payouts automatically and posting results /สรุป to group channels matching `notify_lottery_results = true`).
  - On failure: retry. If retries exhausted, send warning message to Superadmin groups matching `notify_admin_alerts = true`.

- [ ] **Step 2: Schedule Crawler cron job**
  Schedule via SQL:
  ```sql
  SELECT cron.schedule('process-result-crawler', '*/10 * * * *', 'SELECT process_centralized_result_crawler();');
  ```

- [ ] **Step 3: Deploy & commit**

---

### Task 7: LINE Command /แจ้งผล [งวดวันที่]
**Files:**
- Modify: `supabase/functions/line-bot/index.ts` (Parse and execute winner announcement command)

**Interfaces:**
- Consumes: LINE chat message `/แจ้งผล`
- Produces: Specific group payout report showing member names, winning amounts, and total group summary

- [ ] **Step 1: Implement `/แจ้งผล` parsing and processing**
  Under webhook parser:
  - If text starts with `/แจ้งผล`:
    - Parse target date.
    - Check if group is bound to a dealer.
    - Retrieve calculated winners for this round restricted to members of this group.
    - Generate a beautiful announcement Flex message showing winner names and amounts.
    - Reply to group.

- [ ] **Step 2: Deploy LINE Bot and verify build**
  Run: `powershell -ExecutionPolicy Bypass -Command "supabase functions deploy line-bot --no-verify-jwt"`
  Expected: Success.

- [ ] **Step 3: Commit and Push**
