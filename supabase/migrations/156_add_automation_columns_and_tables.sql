-- Migration: Add Automation Columns and Centralized Tables
-- ========================================================

-- 1. Add scheduling and automation columns to public.dealer_lottery_templates
ALTER TABLE public.dealer_lottery_templates
    ADD COLUMN IF NOT EXISTS is_auto_round_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'weekly',
    ADD COLUMN IF NOT EXISTS schedule_days JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS close_day_offset INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_layoff_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_layoff_method TEXT NOT NULL DEFAULT 'limits',
    ADD COLUMN IF NOT EXISTS auto_layoff_keep_amount NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_import_result_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Add custom notification routing columns to public.line_groups
ALTER TABLE public.line_groups
    ADD COLUMN IF NOT EXISTS notify_round_created BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_admin_alerts BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_layoff_bets BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_round_summary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_lottery_results BOOLEAN NOT NULL DEFAULT false;

-- 3. Create centralized results table public.central_lottery_results
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

-- Enable RLS
ALTER TABLE public.central_lottery_results ENABLE ROW LEVEL SECURITY;

-- Create policies for central_lottery_results
DROP POLICY IF EXISTS "Anyone authenticated can select central results" ON public.central_lottery_results;
CREATE POLICY "Anyone authenticated can select central results" 
ON public.central_lottery_results 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Service role can manage central results" ON public.central_lottery_results;
CREATE POLICY "Service role can manage central results" 
ON public.central_lottery_results 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 4. Create centralized lottery sources memory table public.central_lottery_sources
CREATE TABLE IF NOT EXISTS public.central_lottery_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lottery_type TEXT NOT NULL,
    source_url TEXT NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lottery_type, source_url)
);

-- Enable RLS
ALTER TABLE public.central_lottery_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for central_lottery_sources
DROP POLICY IF EXISTS "Anyone authenticated can select sources" ON public.central_lottery_sources;
CREATE POLICY "Anyone authenticated can select sources" 
ON public.central_lottery_sources 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Service role can manage sources" ON public.central_lottery_sources;
CREATE POLICY "Service role can manage sources" 
ON public.central_lottery_sources 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 5. Create search jobs table public.central_ai_search_jobs
CREATE TABLE IF NOT EXISTS public.central_ai_search_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lottery_type TEXT NOT NULL,
    round_date DATE NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lottery_type, round_date)
);

-- Enable RLS
ALTER TABLE public.central_ai_search_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for central_ai_search_jobs
DROP POLICY IF EXISTS "Anyone authenticated can select search jobs" ON public.central_ai_search_jobs;
CREATE POLICY "Anyone authenticated can select search jobs" 
ON public.central_ai_search_jobs 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Service role can manage search jobs" ON public.central_ai_search_jobs;
CREATE POLICY "Service role can manage search jobs" 
ON public.central_ai_search_jobs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Trigger to update updated_at on central_lottery_results
CREATE OR REPLACE FUNCTION public.handle_updated_at_results()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_results ON public.central_lottery_results;
CREATE TRIGGER set_updated_at_results
BEFORE UPDATE ON public.central_lottery_results
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at_results();

-- Trigger to update updated_at on central_ai_search_jobs
CREATE OR REPLACE FUNCTION public.handle_updated_at_jobs()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_jobs ON public.central_ai_search_jobs;
CREATE TRIGGER set_updated_at_jobs
BEFORE UPDATE ON public.central_ai_search_jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at_jobs();
