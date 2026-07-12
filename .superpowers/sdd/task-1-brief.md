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
