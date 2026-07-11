-- Migration: Add open_notify_group_id for targeting specific LINE group
-- =========================================================================
-- Lets dealers choose a specific LINE group to send the open-round
-- notification to, or NULL/empty for "all groups" (default).

ALTER TABLE public.dealer_automation_jobs
    ADD COLUMN IF NOT EXISTS open_notify_group_id UUID;

ALTER TABLE public.dealer_lottery_templates
    ADD COLUMN IF NOT EXISTS open_notify_group_id UUID;
