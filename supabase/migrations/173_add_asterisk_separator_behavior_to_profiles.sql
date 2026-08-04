-- =============================================
-- LAO LOTTO - Add asterisk_separator_behavior to profiles
-- Migration: 149_add_asterisk_separator_behavior_to_profiles.sql
-- =============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS asterisk_separator_behavior TEXT DEFAULT 'revert' CHECK (asterisk_separator_behavior IN ('equal', 'revert'));
