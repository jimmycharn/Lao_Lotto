-- =============================================
-- LAO LOTTO - Add member_permissions to line_groups
-- Migration: 135_add_member_permissions_to_line_groups.sql
-- =============================================

ALTER TABLE line_groups
ADD COLUMN IF NOT EXISTS member_permissions JSONB DEFAULT '{"bet": true, "summary": true, "total": true, "cancel": true, "bill": true, "link": true, "help": true}'::jsonb NOT NULL;
