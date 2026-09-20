-- Migration 239: Inspect all foreign keys referencing lottery_rounds and test deletion simulation
CREATE OR REPLACE FUNCTION public.debug_inspect_round_fks(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_fk_info JSONB;
    v_counts JSONB := '{}'::jsonb;
    v_sub_cnt INT;
    v_bt_cnt INT;
    v_tl_cnt INT;
    v_nl_cnt INT;
    v_rpc_cnt INT;
    v_ai_cnt INT;
    v_mrp_cnt INT;
    v_urp_cnt INT;
    v_dbr_cnt INT;
    v_drc_cnt INT;
    v_rh_cnt INT;
    v_urh_cnt INT;
BEGIN
    -- Check references in known tables
    SELECT COUNT(*) INTO v_sub_cnt FROM public.submissions WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_bt_cnt FROM public.bet_transfers WHERE round_id = p_round_id OR target_round_id = p_round_id;
    SELECT COUNT(*) INTO v_tl_cnt FROM public.type_limits WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_nl_cnt FROM public.number_limits WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_rpc_cnt FROM public.round_pending_credits WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_ai_cnt FROM public.ai_analysis_logs WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_mrp_cnt FROM public.member_round_payments WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_urp_cnt FROM public.upstream_round_payments WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_dbr_cnt FROM public.dealer_billing_records WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_drc_cnt FROM public.dealer_referral_commissions WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_rh_cnt FROM public.round_history WHERE round_id = p_round_id;
    SELECT COUNT(*) INTO v_urh_cnt FROM public.user_round_history WHERE round_id = p_round_id;

    -- Query information_schema for all foreign keys pointing to lottery_rounds
    SELECT jsonb_agg(
        jsonb_build_object(
            'table_name', tc.table_name,
            'constraint_name', tc.constraint_name,
            'column_name', kcu.column_name,
            'delete_rule', rc.delete_rule
        )
    )
    INTO v_fk_info
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'lottery_rounds';

    RETURN jsonb_build_object(
        'foreign_keys', v_fk_info,
        'counts', jsonb_build_object(
            'submissions', v_sub_cnt,
            'bet_transfers', v_bt_cnt,
            'type_limits', v_tl_cnt,
            'number_limits', v_nl_cnt,
            'round_pending_credits', v_rpc_cnt,
            'ai_analysis_logs', v_ai_cnt,
            'member_round_payments', v_mrp_cnt,
            'upstream_round_payments', v_urp_cnt,
            'dealer_billing_records', v_dbr_cnt,
            'dealer_referral_commissions', v_drc_cnt,
            'round_history', v_rh_cnt,
            'user_round_history', v_urh_cnt
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_round_fks(UUID) TO anon, authenticated;
