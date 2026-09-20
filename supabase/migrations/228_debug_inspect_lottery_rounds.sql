-- Migration 228: Debug inspect lottery rounds and delete constraints
CREATE OR REPLACE FUNCTION public.debug_inspect_round_delete()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_fk_rules JSONB;
    v_closed_rounds JSONB;
    v_rls_policies JSONB;
BEGIN
    -- 1. Get foreign keys referencing lottery_rounds
    SELECT jsonb_agg(
        jsonb_build_object(
            'table_name', tc.table_name,
            'column_name', kcu.column_name,
            'constraint_name', tc.constraint_name,
            'delete_rule', rc.delete_rule
        )
    )
    INTO v_fk_rules
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE ccu.table_name = 'lottery_rounds';

    -- 2. Get all closed rounds
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', lr.id,
            'dealer_id', lr.dealer_id,
            'dealer_name', p.full_name,
            'dealer_email', p.email,
            'lottery_type', lr.lottery_type,
            'lottery_name', lr.lottery_name,
            'status', lr.status,
            'is_result_announced', lr.is_result_announced,
            'round_date', lr.round_date,
            'open_time', lr.open_time,
            'close_time', lr.close_time
        )
    )
    INTO v_closed_rounds
    FROM (
        SELECT * FROM public.lottery_rounds
        WHERE status = 'closed' OR is_result_announced = TRUE
        ORDER BY close_time DESC
        LIMIT 20
    ) lr
    LEFT JOIN public.profiles p ON p.id = lr.dealer_id;

    -- 3. Get RLS policies on lottery_rounds
    SELECT jsonb_agg(
        jsonb_build_object(
            'policyname', polname,
            'cmd', polcmd,
            'roles', polroles,
            'qual', pg_get_expr(polqual, polrelid),
            'with_check', pg_get_expr(polwithcheck, polrelid)
        )
    )
    INTO v_rls_policies
    FROM pg_policy
    WHERE polrelid = 'public.lottery_rounds'::regclass;

    RETURN jsonb_build_object(
        'foreign_keys', v_fk_rules,
        'closed_rounds', v_closed_rounds,
        'rls_policies', v_rls_policies
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_round_delete() TO anon, authenticated;
