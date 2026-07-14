-- Migration: Add notify_result_group_id to public.dealer_automation_jobs
-- =====================================================================

ALTER TABLE public.dealer_automation_jobs
  ADD COLUMN IF NOT EXISTS notify_result_group_id UUID REFERENCES public.line_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dealer_automation_jobs.notify_result_group_id IS
  'Target LINE group to route member win/loss result announcements. If NULL, defaults to all active groups where members submitted bets.';
