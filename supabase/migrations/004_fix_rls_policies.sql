-- =============================================
-- FIX: RLS Policy Recursive Issue v2
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Dealers can view all profiles" ON profiles;

-- Create a security definer function in PUBLIC schema to check role without RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE SQL
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Recreate policy using the function
CREATE POLICY "Admins and Dealers can view all profiles" ON profiles
  FOR SELECT USING (
    auth.uid() = id  -- Can always view own profile
    OR public.get_user_role() IN ('superadmin', 'dealer')  -- Admins/dealers see all
  );

-- Fix: Allow superadmin to update any profile
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    auth.uid() = id  -- Users can update own
    OR public.get_user_role() = 'superadmin'  -- Superadmin can update any
  );
