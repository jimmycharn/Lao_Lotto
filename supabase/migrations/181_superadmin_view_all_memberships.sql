-- Migration: 181_superadmin_view_all_memberships.sql
-- Description: Allow Superadmin role to view and manage all rows in user_dealer_memberships table

DROP POLICY IF EXISTS "Superadmins can manage all memberships" ON public.user_dealer_memberships;

CREATE POLICY "Superadmins can manage all memberships" ON public.user_dealer_memberships
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
    );
