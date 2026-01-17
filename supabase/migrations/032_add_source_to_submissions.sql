-- =============================================
-- Add source column to submissions table
-- =============================================
-- This column tracks where the submission came from:
-- - 'user' = normal user submission (default)
-- - 'transfer' = transferred from another dealer

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_submissions_source ON submissions(source);
