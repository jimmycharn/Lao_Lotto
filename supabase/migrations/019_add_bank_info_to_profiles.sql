-- Add bank information columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT;
