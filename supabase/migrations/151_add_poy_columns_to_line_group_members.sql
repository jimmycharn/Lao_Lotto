-- =============================================
-- LAO LOTTO - Add poy columns to line_group_members
-- Migration: 151_add_poy_columns_to_line_group_members.sql
-- =============================================

ALTER TABLE line_group_members
ADD COLUMN IF NOT EXISTS poy_display TEXT DEFAULT 'short' CHECK (poy_display IN ('short', 'full', 'none')),
ADD COLUMN IF NOT EXISTS admin_poy_display TEXT DEFAULT 'normal' CHECK (admin_poy_display IN ('normal', 'force_open', 'force_close'));
