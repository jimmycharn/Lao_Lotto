-- Migration 238: Find profiles and users
CREATE OR REPLACE FUNCTION public.debug_find_user_profiles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_profiles JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'email', p.email,
            'full_name', p.full_name,
            'role', p.role
        )
    )
    INTO v_profiles
    FROM public.profiles p;

    RETURN v_profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_find_user_profiles() TO anon, authenticated;
