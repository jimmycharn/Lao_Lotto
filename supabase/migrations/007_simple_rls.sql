-- =============================================
-- SIMPLIFIED RLS FIX - NO RECURSIVE FUNCTION
-- =============================================
-- This uses a simpler approach without function calls
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Drop ALL policies on profiles
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin_dealer" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "Dealers can view their members" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and Dealers can view all profiles" ON profiles;

-- Step 2: Drop old functions
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.get_user_role();

-- Step 3: Create ONE simple SELECT policy - allow all authenticated users to read all profiles
-- This is simpler and avoids recursion issues
CREATE POLICY "authenticated_can_read_profiles" ON profiles
    FOR SELECT 
    TO authenticated
    USING (true);

-- Step 4: INSERT policy - users can insert their own profile
CREATE POLICY "users_can_insert_own_profile" ON profiles
    FOR INSERT 
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Step 5: UPDATE policy - users can update their own profile
CREATE POLICY "users_can_update_own_profile" ON profiles
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = id);

-- Step 6: DELETE policy - no one can delete (or only via admin)
-- (Not creating delete policy = no one can delete)

-- Verify policies
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
