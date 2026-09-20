-- Migration 232: Inspect RLS on submissions and test simulated authenticated delete
CREATE OR REPLACE FUNCTION public.debug_inspect_submissions_rls()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_sub_policies JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'policyname', polname,
            'cmd', polcmd,
            'roles', polroles,
            'qual', pg_get_expr(polqual, polrelid),
            'with_check', pg_get_expr(polwithcheck, polrelid)
        )
    )
    INTO v_sub_policies
    FROM pg_policy
    WHERE polrelid = 'public.submissions'::regclass;

    RETURN jsonb_build_object('submission_policies', v_sub_policies);
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_submissions_rls() TO anon, authenticated;
