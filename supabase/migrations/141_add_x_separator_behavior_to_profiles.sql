-- =============================================
-- LAO LOTTO - Add x_separator_behavior to profiles
-- Migration: 141_add_x_separator_behavior_to_profiles.sql
-- =============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS x_separator_behavior TEXT DEFAULT 'auto' CHECK (x_separator_behavior IN ('auto', 'revert', 'straight'));
