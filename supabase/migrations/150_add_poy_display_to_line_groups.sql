-- =============================================
-- LAO LOTTO - Add poy_display to line_groups
-- Migration: 150_add_poy_display_to_line_groups.sql
-- =============================================

ALTER TABLE line_groups
ADD COLUMN IF NOT EXISTS poy_display TEXT DEFAULT 'normal' CHECK (poy_display IN ('normal', 'force_open', 'force_close'));
