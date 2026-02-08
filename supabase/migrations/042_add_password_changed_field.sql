-- Add password_changed field to profiles table
-- This field tracks whether user has changed their initial password
-- Used to hide copy credentials button and write submission button for dealer-created members

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_password_changed ON profiles(password_changed);
