-- Add set_prices column to lottery_rounds table
-- This column stores the price per set for set-based bet types (e.g., {"4_top": 120})

ALTER TABLE lottery_rounds 
ADD COLUMN IF NOT EXISTS set_prices JSONB DEFAULT '{}';

-- Comment on column
COMMENT ON COLUMN lottery_rounds.set_prices IS 'Stores price per set for set-based bet types (e.g. {"4_top": 120})';
