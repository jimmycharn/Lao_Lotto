-- Migration: 205_inspect_user_settings.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_submission_d56e()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_sub RECORD;
    v_user_settings JSONB;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_sub FROM public.submissions WHERE id = 'd56e4864-b178-4c73-8062-306a44b344d6';
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_sub.user_id;
    SELECT lottery_settings INTO v_user_settings FROM public.user_settings WHERE user_id = v_sub.user_id AND dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';

    RETURN jsonb_build_object(
        'submission', row_to_json(v_sub),
        'profile', row_to_json(v_profile),
        'user_settings', v_user_settings
    );
END;
$$;
