-- =============================================
-- ADD charged_credit_amount COLUMN TO lottery_rounds
-- =============================================
-- This column stores the amount of credit that has been charged for this round
-- Used to calculate additional credit to deduct when submissions are modified after round is closed
-- =============================================

-- Add charged_credit_amount column to lottery_rounds
ALTER TABLE lottery_rounds 
ADD COLUMN IF NOT EXISTS charged_credit_amount DECIMAL(12,2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN lottery_rounds.charged_credit_amount IS 'Amount of credit that has been charged for this round. Used to calculate additional credit when submissions are modified after round is closed.';
