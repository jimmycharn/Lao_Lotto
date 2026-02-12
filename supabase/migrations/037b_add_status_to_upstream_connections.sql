-- Migration: Add status field to dealer_upstream_connections
-- This allows upstream dealers to approve/reject connection requests

-- Add status column
ALTER TABLE dealer_upstream_connections 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'blocked'));

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_upstream_status ON dealer_upstream_connections(status);

-- Update existing records to be active (they were created before approval system)
UPDATE dealer_upstream_connections SET status = 'active' WHERE status IS NULL OR status = 'pending';
