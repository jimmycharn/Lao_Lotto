-- Migration: Add creation_frequency setting to dealer_automation_jobs
-- =========================================================================
-- Lets dealers choose per automation job whether a new round can be created
-- at most once per day ('once_per_day', default) or an unlimited number of
-- times per day ('unlimited'), as long as it doesn't overlap an existing
-- non-closed round of the same lottery_type.

ALTER TABLE public.dealer_automation_jobs
    ADD COLUMN IF NOT EXISTS creation_frequency TEXT NOT NULL DEFAULT 'once_per_day';

ALTER TABLE public.dealer_automation_jobs
    DROP CONSTRAINT IF EXISTS dealer_automation_jobs_creation_frequency_check;

ALTER TABLE public.dealer_automation_jobs
    ADD CONSTRAINT dealer_automation_jobs_creation_frequency_check
    CHECK (creation_frequency IN ('once_per_day', 'unlimited'));
