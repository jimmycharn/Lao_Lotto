-- Migration: 182_add_last_login_at_to_profiles.sql
-- Description: Add last_login_at timestamp column to public.profiles table

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;
