-- =============================================
-- Add missing columns to history tables
-- =============================================

-- Add lottery_name to round_history (dealer)
ALTER TABLE round_history ADD COLUMN IF NOT EXISTS lottery_name TEXT;

-- Add open_time, close_time, lottery_name to user_round_history
ALTER TABLE user_round_history ADD COLUMN IF NOT EXISTS open_time TIMESTAMPTZ;
ALTER TABLE user_round_history ADD COLUMN IF NOT EXISTS close_time TIMESTAMPTZ;
ALTER TABLE user_round_history ADD COLUMN IF NOT EXISTS lottery_name TEXT;
