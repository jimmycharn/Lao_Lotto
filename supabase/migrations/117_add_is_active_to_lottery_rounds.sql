-- Add is_active column to lottery_rounds
-- When a round is created, it defaults to FALSE (inactive)
-- Dealer must explicitly activate it before users can see/submit to it
ALTER TABLE lottery_rounds
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;

-- Set existing open rounds to active (backward compatibility)
UPDATE lottery_rounds SET is_active = TRUE WHERE status = 'open';

-- Enable Realtime for lottery_rounds (for is_active toggle)
ALTER PUBLICATION supabase_realtime ADD TABLE lottery_rounds;
