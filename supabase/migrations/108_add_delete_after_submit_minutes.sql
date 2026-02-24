-- Add delete_after_submit_minutes column to lottery_rounds table
-- This allows dealers to set how long after submission users can still delete/edit their bets

ALTER TABLE lottery_rounds 
ADD COLUMN IF NOT EXISTS delete_after_submit_minutes INT DEFAULT 0;

-- Comment: 0 means no time limit based on submission time (only delete_before_minutes applies)
-- If set to e.g. 30, users can delete within 30 minutes after submitting, 
-- but still subject to delete_before_minutes constraint
