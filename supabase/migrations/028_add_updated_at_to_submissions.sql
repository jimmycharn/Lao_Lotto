-- =============================================
-- Add updated_at column to submissions table
-- =============================================
-- This column tracks when a submission was last edited

-- Add updated_at column to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger to auto-update the updated_at column
CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update existing rows to have updated_at set to created_at
UPDATE submissions 
SET updated_at = created_at 
WHERE updated_at IS NULL;
