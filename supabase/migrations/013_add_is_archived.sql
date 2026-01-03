-- Add is_archived column to lottery_rounds
-- This allows admin/dealer to hide old rounds from user view
ALTER TABLE lottery_rounds 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Add index for archived status
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_archived ON lottery_rounds(is_archived);
