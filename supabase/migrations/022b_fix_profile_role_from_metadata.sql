-- =============================================
-- FIX: AUTO-CREATE PROFILE WITH ROLE FROM METADATA
-- =============================================
-- This updates the handle_new_user function to use
-- the role from user metadata (for dealer registration)
-- =============================================

-- Update function to read role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get role from metadata, default to 'user' if not provided
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
    
    -- Validate role - only allow 'user' or 'dealer' from registration
    -- 'superadmin' cannot be self-assigned
    IF user_role NOT IN ('user', 'dealer') THEN
        user_role := 'user';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, balance, dealer_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        user_role,
        0,
        (NEW.raw_user_meta_data->>'dealer_id')::uuid
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Note: The trigger already exists, this just updates the function
