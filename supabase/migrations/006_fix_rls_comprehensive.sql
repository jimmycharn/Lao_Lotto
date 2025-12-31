-- =============================================
-- COMPREHENSIVE RLS FIX FOR PROFILES
-- =============================================
-- This fixes all RLS issues on the profiles table
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Drop all existing policies on profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Dealers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and Dealers can view all profiles" ON profiles;

-- Step 2: Drop the problematic function and recreate
DROP FUNCTION IF EXISTS public.get_user_role();

-- Step 3: Create a simpler, working function
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Step 4: Create simple, clear policies

-- 4a: Everyone can view their own profile
CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- 4b: Dealers and admins can view all profiles (using the function)
CREATE POLICY "profiles_select_admin_dealer" ON profiles
    FOR SELECT USING (
        public.get_my_role() IN ('superadmin', 'dealer')
    );

-- 4c: Users can insert their own profile
CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 4d: Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- 4e: Admins can update any profile
CREATE POLICY "profiles_update_admin" ON profiles
    FOR UPDATE USING (
        public.get_my_role() = 'superadmin'
    );

-- Verify: List all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
