-- =============================================
-- EMERGENCY FIX: Restore Members Visibility
-- =============================================

-- 1. Ensure RLS is enabled
ALTER TABLE user_dealer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Fix user_dealer_memberships policies
-- Allow dealers to match their own ID in dealer_id
DROP POLICY IF EXISTS "Dealers can view own memberships" ON user_dealer_memberships;
CREATE POLICY "Dealers can view own memberships" ON user_dealer_memberships
    FOR SELECT TO authenticated USING (dealer_id = auth.uid());

-- Allow users to match their own ID in user_id
DROP POLICY IF EXISTS "Users can view own memberships" ON user_dealer_memberships;
CREATE POLICY "Users can view own memberships" ON user_dealer_memberships
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Fix profiles visibility
-- Ensure Dealers can see profile details of their members
DROP POLICY IF EXISTS "Dealers view all profiles" ON profiles;
CREATE POLICY "Dealers view all profiles" ON profiles
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('superadmin', 'dealer')
        )
    );

-- 4. Verify
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('user_dealer_memberships', 'profiles');
