-- Remove the retired LINE Self-Bot integration.
-- This forward-only migration cleans deployed databases without rewriting
-- the historical migrations that introduced the feature.

DROP TABLE IF EXISTS public.self_bot_push_queue CASCADE;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS push_fallback_self_bot,
  DROP COLUMN IF EXISTS self_bot_line_user_id;

ALTER TABLE public.line_groups
  DROP COLUMN IF EXISTS push_fallback_self_bot,
  DROP COLUMN IF EXISTS self_bot_chat_mid;

DROP POLICY IF EXISTS "Allow anon read active line_groups" ON public.line_groups;
