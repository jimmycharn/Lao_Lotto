-- =============================================
-- LAO LOTTO - Refactor Poy Display Columns in line_groups
-- Migration: 169_refactor_line_groups_poy_display.sql
-- =============================================

-- Drop column to safely remove check constraints and defaults
ALTER TABLE line_groups DROP COLUMN IF EXISTS poy_display;

-- Re-add poy_display as visibility control (open/close)
ALTER TABLE line_groups ADD COLUMN poy_display TEXT DEFAULT 'open' CHECK (poy_display IN ('open', 'close'));

-- Add poy_format (short/full)
ALTER TABLE line_groups ADD COLUMN poy_format TEXT DEFAULT 'short' CHECK (poy_format IN ('short', 'full'));

-- Add dealer_poy_display (normal/force_open/force_close)
ALTER TABLE line_groups ADD COLUMN dealer_poy_display TEXT DEFAULT 'normal' CHECK (dealer_poy_display IN ('normal', 'force_open', 'force_close'));
