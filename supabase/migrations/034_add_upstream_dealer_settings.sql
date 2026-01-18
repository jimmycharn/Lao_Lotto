-- Migration: Add settings and block functionality for upstream dealers
-- This allows dealers to set commission rates, payout rates, and block upstream dealers

-- Add is_blocked column to dealer_upstream_connections
ALTER TABLE dealer_upstream_connections 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Add lottery_settings column (same structure as user_settings)
-- This stores commission and payout rates per lottery type and bet type
ALTER TABLE dealer_upstream_connections 
ADD COLUMN IF NOT EXISTS lottery_settings JSONB;

-- Add index for blocked status
CREATE INDEX IF NOT EXISTS idx_upstream_is_blocked ON dealer_upstream_connections(is_blocked);

-- Comment for documentation
COMMENT ON COLUMN dealer_upstream_connections.is_blocked IS 'If true, this upstream dealer cannot send bets to this dealer';
COMMENT ON COLUMN dealer_upstream_connections.lottery_settings IS 'Commission and payout rates per lottery type, same structure as user_settings.lottery_settings';
