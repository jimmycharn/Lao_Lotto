-- Migration 152: Add close_time to type_limits table
ALTER TABLE public.type_limits ADD COLUMN IF NOT EXISTS close_time TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.type_limits.close_time IS 'Specific close time for this bet type. If NULL, defaults to lottery_rounds.close_time.';
