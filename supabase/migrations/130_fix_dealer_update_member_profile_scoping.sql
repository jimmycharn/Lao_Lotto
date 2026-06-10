-- =============================================
-- LAO LOTTO - Fix scoping bug in Dealers can update their members profiles policy
-- Migration: 130_fix_dealer_update_member_profile_scoping.sql
-- =============================================

DROP POLICY IF EXISTS "Dealers can update their members profiles" ON profiles;

CREATE POLICY "Dealers can update their members profiles" ON profiles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_dealer_memberships
            WHERE dealer_id = auth.uid() AND user_id = profiles.id
        )
        OR EXISTS (
            SELECT 1 FROM dealer_upstream_connections
            WHERE upstream_dealer_id = auth.uid() AND dealer_id = profiles.id
        )
    );
