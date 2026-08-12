-- Migration: 183_superadmin_delete_user_function.sql
-- Description: Add RLS DELETE policy for profiles and create delete_user_by_superadmin RPC function

-- 1. Add DELETE policy on public.profiles for superadmin
DROP POLICY IF EXISTS "Superadmin can delete profiles" ON public.profiles;

CREATE POLICY "Superadmin can delete profiles" ON public.profiles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
    );

-- 2. Create RPC function delete_user_by_superadmin
CREATE OR REPLACE FUNCTION delete_user_by_superadmin(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify calling user is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only superadmins can delete users';
  END IF;

  -- Delete from public.profiles
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Delete from auth.users (triggers foreign key cascades)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
