-- =============================================
-- LAO LOTTO - Add hyphen_separator_behavior to profiles
-- Migration: 148_add_hyphen_separator_behavior_to_profiles.sql
-- =============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hyphen_separator_behavior TEXT DEFAULT 'equal' CHECK (hyphen_separator_behavior IN ('equal', 'separator'));
