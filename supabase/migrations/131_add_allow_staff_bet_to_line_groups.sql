-- =============================================
-- Migration: 131_add_allow_staff_bet_to_line_groups.sql
-- =============================================

-- Add allow_staff_bet column to line_groups table
ALTER TABLE line_groups
ADD COLUMN IF NOT EXISTS allow_staff_bet BOOLEAN DEFAULT FALSE NOT NULL;

-- Add staff_member_id column referencing profiles
ALTER TABLE line_groups
ADD COLUMN IF NOT EXISTS staff_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
