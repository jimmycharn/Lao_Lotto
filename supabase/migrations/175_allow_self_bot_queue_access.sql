-- Migration 175: Allow background queue processing for self_bot_push_queue
ALTER TABLE public.self_bot_push_queue DISABLE ROW LEVEL SECURITY;
