-- Add submitted_by column to track who actually entered the submission
-- This allows dealers to submit bets on behalf of users

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id);

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS submitted_by_type TEXT DEFAULT 'user' CHECK (submitted_by_type IN ('user', 'dealer'));

-- Add comment for documentation
COMMENT ON COLUMN submissions.submitted_by IS 'The user ID who actually entered this submission (could be dealer entering on behalf of user)';
COMMENT ON COLUMN submissions.submitted_by_type IS 'Type of submitter: user (self-submitted) or dealer (dealer entered on behalf)';
