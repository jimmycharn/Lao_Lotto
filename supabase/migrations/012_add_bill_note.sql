-- Add bill note column to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS bill_note TEXT;

-- Create index for searching by note
CREATE INDEX IF NOT EXISTS idx_submissions_bill_note ON submissions(bill_note);
