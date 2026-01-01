-- Add grouping and display columns to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS bill_id TEXT,
ADD COLUMN IF NOT EXISTS entry_id TEXT,
ADD COLUMN IF NOT EXISTS display_numbers TEXT,
ADD COLUMN IF NOT EXISTS display_amount TEXT,
ADD COLUMN IF NOT EXISTS display_bet_type TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_bill_id ON submissions(bill_id);
CREATE INDEX IF NOT EXISTS idx_submissions_entry_id ON submissions(entry_id);
