-- Migration 154: Add close_time_behavior to type_limits table
ALTER TABLE public.type_limits ADD COLUMN IF NOT EXISTS close_time_behavior VARCHAR(50) DEFAULT 'close_immediately';
COMMENT ON COLUMN public.type_limits.close_time_behavior IS 'Behavior when specific close_time is reached. Either "close_immediately" or "return_excess".';
