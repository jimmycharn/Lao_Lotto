-- Migration 186: Add temp_open_member_id to lottery_rounds
-- Allows /เปิด [member_code] to temporarily re-open a closed round for a specific member only.

ALTER TABLE public.lottery_rounds
  ADD COLUMN IF NOT EXISTS temp_open_member_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS temp_open_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_temp_open_member
  ON public.lottery_rounds(temp_open_member_id)
  WHERE temp_open_member_id IS NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN public.lottery_rounds.temp_open_member_id IS 'When set, only this member can bet even if round is closed. Cleared on /ปิด or when round is re-opened for all.';
COMMENT ON COLUMN public.lottery_rounds.temp_open_expires_at IS 'Optional expiry timestamp for temp open. After this time, temp open is ignored.';
