-- Migration 176: Allow anon read on line_groups for Self-Bot fallback processing
CREATE POLICY "Allow anon read active line_groups"
    ON public.line_groups
    FOR SELECT
    USING (true);
