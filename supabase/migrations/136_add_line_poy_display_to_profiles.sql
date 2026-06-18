-- =============================================
-- LAO LOTTO - Add line_poy_display to profiles
-- Migration: 136_add_line_poy_display_to_profiles.sql
-- =============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS line_poy_display TEXT DEFAULT 'short' CHECK (line_poy_display IN ('short', 'full'));
