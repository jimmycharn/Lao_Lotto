-- Add global_poy_display column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS global_poy_display TEXT DEFAULT 'normal' CHECK (global_poy_display IN ('normal', 'force_open', 'force_close'));
