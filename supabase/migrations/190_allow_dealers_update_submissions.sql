-- Migration: 190_allow_dealers_update_submissions.sql
-- Description: Allow dealers and admins to update submissions in their rounds (e.g. for is_paid, is_deleted, etc.)

DROP POLICY IF EXISTS "dealers_update_submissions" ON public.submissions;

CREATE POLICY "dealers_update_submissions" ON public.submissions
    FOR UPDATE TO authenticated
    USING (
        -- Dealer owns the round that the submission belongs to
        round_id IN (
            SELECT id FROM public.lottery_rounds WHERE dealer_id = auth.uid()
        )
        OR
        -- Admin or SuperAdmin
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    )
    WITH CHECK (
        -- Dealer owns the round that the submission belongs to
        round_id IN (
            SELECT id FROM public.lottery_rounds WHERE dealer_id = auth.uid()
        )
        OR
        -- Admin or SuperAdmin
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );
