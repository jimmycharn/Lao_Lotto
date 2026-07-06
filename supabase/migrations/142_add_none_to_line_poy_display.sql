-- Drop existing check constraint if any
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_line_poy_display_check;

-- Add new check constraint allowing 'short', 'full', 'none'
ALTER TABLE profiles ADD CONSTRAINT profiles_line_poy_display_check CHECK (line_poy_display IN ('short', 'full', 'none'));
