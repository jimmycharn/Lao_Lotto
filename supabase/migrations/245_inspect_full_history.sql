-- Migration 245: Inspect full history for restoration
CREATE OR REPLACE FUNCTION public.debug_inspect_full_history_for_restore(p_dealer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rounds JSONB;
    v_users JSONB;
BEGIN
    SELECT jsonb_agg(to_jsonb(rh))
    INTO v_rounds
    FROM public.round_history rh
    WHERE rh.dealer_id = p_dealer_id;

    SELECT jsonb_agg(to_jsonb(urh))
    INTO v_users
    FROM public.user_round_history urh
    WHERE urh.dealer_id = p_dealer_id;

    RETURN jsonb_build_object(
        'round_history', v_rounds,
        'user_round_history', v_users
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_full_history_for_restore(UUID) TO anon, authenticated;
