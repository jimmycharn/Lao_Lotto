-- =============================================
-- Add 'stock' lottery type
-- =============================================
-- This migration adds 'stock' to the lottery_type constraint

-- Drop and recreate the constraint with 'stock' option
ALTER TABLE lottery_rounds 
DROP CONSTRAINT IF EXISTS lottery_rounds_lottery_type_check;

ALTER TABLE lottery_rounds 
ADD CONSTRAINT lottery_rounds_lottery_type_check 
CHECK (lottery_type IN ('thai', 'lao', 'hanoi', 'yeekee', 'stock', 'other'));

-- Note: You can run this SQL directly in Supabase SQL Editor
