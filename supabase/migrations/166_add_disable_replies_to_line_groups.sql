-- Migration: Add disable_replies to public.line_groups table
-- This flag disables the bot from replying/answering in specific LINE groups, acting only as a push notifier.
ALTER TABLE public.line_groups
    ADD COLUMN IF NOT EXISTS disable_replies BOOLEAN NOT NULL DEFAULT false;
