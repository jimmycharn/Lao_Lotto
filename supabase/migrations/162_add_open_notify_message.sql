-- Migration: Add customizable "round opened" notification message
-- =========================================================================
-- Lets dealers customize the message broadcast to all LINE groups when an
-- automation job (or legacy auto-round template) creates a new round.
-- When left blank, the edge function falls back to a sensible default
-- based on lottery_type (lao/hanoi vs thai style wording).

ALTER TABLE public.dealer_automation_jobs
    ADD COLUMN IF NOT EXISTS open_notify_message TEXT;

ALTER TABLE public.dealer_lottery_templates
    ADD COLUMN IF NOT EXISTS open_notify_message TEXT;
