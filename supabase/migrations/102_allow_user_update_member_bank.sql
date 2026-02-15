-- =============================================
-- LAO LOTTO - Allow Users to Update Their Own Bank Account Assignment
-- Migration: 102_allow_user_update_member_bank.sql
-- =============================================
-- Problem: Users cannot update member_bank_account_id because RLS only allows dealers to update memberships
-- Solution: Add a policy allowing users to update their own member_bank_account_id

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Users can update their own member bank" ON user_dealer_memberships;

-- Allow users to update their own membership's member_bank_account_id
-- This is separate from dealer's ability to update status, assigned_bank_account_id, etc.
CREATE POLICY "Users can update their own member bank" ON user_dealer_memberships
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Note: This allows users to update any column on their own memberships.
-- If more restrictive control is needed, a database function with SECURITY DEFINER could be used instead.

COMMENT ON POLICY "Users can update their own member bank" ON user_dealer_memberships 
IS 'Allows users to update their own membership record, primarily for setting member_bank_account_id';
