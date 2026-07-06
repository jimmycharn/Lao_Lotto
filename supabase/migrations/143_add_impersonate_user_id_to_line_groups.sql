-- Add impersonate_user_id column to line_groups table
ALTER TABLE line_groups
ADD COLUMN IF NOT EXISTS impersonate_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
