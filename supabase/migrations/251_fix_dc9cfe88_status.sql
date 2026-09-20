-- Migration 251: Fix dc9cfe88 round status from 'closed' to 'announced'
-- This round has is_result_announced=true and winning_numbers set,
-- but status was incorrectly set to 'closed' during restoration.
-- Screenshot shows this round had winning payouts (จ่าย ฿3,000).

UPDATE public.lottery_rounds 
SET status = 'announced',
    updated_at = NOW()
WHERE id = 'dc9cfe88-714c-42ee-ad5e-d200e940fde4'
  AND status = 'closed'
  AND is_result_announced = true;

NOTIFY pgrst, 'reload schema';
