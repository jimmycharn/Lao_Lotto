-- Migration: 137_add_role_to_line_managers.sql
ALTER TABLE line_managers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';
