-- Migration: 165_redesign_central_lottery_results.sql
-- =========================================
-- Redesign central_lottery_results storage so each lottery type stores its
-- authoritative "primary" number(s), from which all other bet-type numbers
-- are derived consistently. This ensures dealers' auto-import/automation
-- always receives a complete, correct winning_numbers object regardless of
-- lottery type.
--
-- Per-type primary number rules:
--   thai:  primary_number = 6-digit 1st prize (รางวัลที่ 1)
--          secondary_number = 2-digit bottom (เลขท้าย 2 ตัว, independently drawn)
--          three_digit_sets = [front1, front2, back1, back2] (4x 3-digit prizes)
--   lao/hanoi: primary_number = 4-digit main set (last 4 digits of official draw)
--          secondary_number = derived (first 2 digits of primary_number) - NOT independently drawn
--   stock: primary_number = 2-digit stock index (2 ตัวบน)
--          secondary_number = 2-digit change/delta index (2 ตัวล่าง)

ALTER TABLE public.central_lottery_results
  ADD COLUMN IF NOT EXISTS primary_number TEXT,
  ADD COLUMN IF NOT EXISTS secondary_number TEXT,
  ADD COLUMN IF NOT EXISTS three_digit_sets JSONB;

COMMENT ON COLUMN public.central_lottery_results.primary_number IS
  'Authoritative primary number searched by AI: 6-digit 1st prize (thai), 4-digit main set (lao/hanoi), or 2-digit stock index (stock). All other derived numbers are computed from this value.';
COMMENT ON COLUMN public.central_lottery_results.secondary_number IS
  'Independently-drawn secondary number: 2-digit bottom for thai (เลขท้าย 2 ตัว) or 2-digit change index for stock. For lao/hanoi this is derived from primary_number (first 2 digits), not independently drawn.';
COMMENT ON COLUMN public.central_lottery_results.three_digit_sets IS
  'Thai lottery only: array of 4 three-digit numbers [front1, front2, back1, back2] (เลขหน้า 3 ตัว x2, เลขท้าย 3 ตัว x2), independently drawn.';
