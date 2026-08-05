-- Migration: 177_add_self_bot_line_user_id.sql
-- Add self_bot_line_user_id to profiles so Official Bot ignores messages sent by the dealer's Self-Bot

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS self_bot_line_user_id TEXT DEFAULT NULL;

SELECT 'Migration 177 completed - self_bot_line_user_id added to profiles!' AS status;
