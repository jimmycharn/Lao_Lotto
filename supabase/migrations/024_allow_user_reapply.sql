-- =============================================
-- LAO LOTTO - Allow User Re-application
-- Migration: 024_allow_user_reapply.sql
-- =============================================

-- Allow users to update their own membership status from 'rejected' to 'pending'
-- This enables users to re-apply if they were previously rejected
CREATE POLICY "Users can re-apply if rejected" ON user_dealer_memberships
    FOR UPDATE USING (
        auth.uid() = user_id 
        AND status = 'rejected'
    )
    WITH CHECK (
        status = 'pending'
    );
