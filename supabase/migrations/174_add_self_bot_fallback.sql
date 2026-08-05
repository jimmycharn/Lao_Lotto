-- LAO LOTTO - Add Self-Bot Push Fallback and Queue Table
-- Migration: 174_add_self_bot_fallback.sql

-- 1. Add push_fallback_self_bot to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS push_fallback_self_bot BOOLEAN DEFAULT FALSE;

-- 2. Add push_fallback_self_bot to line_groups (optional per-group override)
ALTER TABLE public.line_groups 
ADD COLUMN IF NOT EXISTS push_fallback_self_bot BOOLEAN DEFAULT NULL;

-- 3. Create self_bot_push_queue table
CREATE TABLE IF NOT EXISTS public.self_bot_push_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_line_group_id TEXT NOT NULL,
    message_payload JSONB NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'flex'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Index for queue polling
CREATE INDEX IF NOT EXISTS idx_self_bot_push_queue_status ON public.self_bot_push_queue(status);
CREATE INDEX IF NOT EXISTS idx_self_bot_push_queue_dealer_id ON public.self_bot_push_queue(dealer_id);

-- Enable RLS
ALTER TABLE public.self_bot_push_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Dealers and Superadmins can manage self bot push queue" ON public.self_bot_push_queue;
CREATE POLICY "Dealers and Superadmins can manage self bot push queue" ON public.self_bot_push_queue
    FOR ALL
    USING (
        auth.uid() = dealer_id OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'superadmin'
        )
    );

SELECT 'Migration 174 completed - Self-Bot Push Fallback and Queue configured!' AS status;
