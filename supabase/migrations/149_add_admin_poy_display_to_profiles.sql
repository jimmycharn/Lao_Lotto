-- =============================================
-- LAO LOTTO - Add admin_poy_display to profiles
-- Migration: 149_add_admin_poy_display_to_profiles.sql
-- =============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS admin_poy_display TEXT DEFAULT 'normal' CHECK (admin_poy_display IN ('normal', 'force_open', 'force_close'));
