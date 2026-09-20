-- Migration 226: Add temp_open_members JSONB to lottery_rounds
-- Allows dealers to temporarily grant bet submission access to multiple members concurrently with individual expiry times.

ALTER TABLE public.lottery_rounds
  ADD COLUMN IF NOT EXISTS temp_open_members JSONB DEFAULT '{}'::jsonb;

-- Add helpful comment explaining the structure
COMMENT ON COLUMN public.lottery_rounds.temp_open_members IS 'Key-value map of user_id -> { expires_at: ISO8601, granted_at: ISO8601, duration_minutes: number, member_name: string } for granting time extensions to specific members after round close.';
