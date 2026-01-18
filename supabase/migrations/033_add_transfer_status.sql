-- =============================================
-- Add status column to bet_transfers table
-- =============================================
-- This column tracks the transfer status:
-- - 'active' = transfer is active (default)
-- - 'returned' = transfer was returned by receiving dealer

ALTER TABLE bet_transfers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_bet_transfers_status ON bet_transfers(status);
