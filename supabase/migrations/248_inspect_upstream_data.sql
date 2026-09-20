-- Migration 248: Inspect upstream data and connections for Jimmy
CREATE OR REPLACE FUNCTION public.debug_inspect_upstream_data(p_dealer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_conns JSONB;
    v_payments JSONB;
    v_transfers JSONB;
    v_other_transfers JSONB;
BEGIN
    SELECT jsonb_agg(to_jsonb(c))
    INTO v_conns
    FROM public.dealer_upstream_connections c
    WHERE c.dealer_id = p_dealer_id;

    SELECT jsonb_agg(to_jsonb(p))
    INTO v_payments
    FROM public.upstream_round_payments p
    WHERE p.dealer_id = p_dealer_id;

    -- Check if there are any transfers in ANY round for this dealer
    SELECT jsonb_agg(to_jsonb(t))
    INTO v_transfers
    FROM public.bet_transfers t
    JOIN public.lottery_rounds r ON r.id = t.round_id
    WHERE r.dealer_id = p_dealer_id;

    -- Also check bet_transfers where target_round_id belongs to this dealer
    SELECT jsonb_agg(to_jsonb(t))
    INTO v_other_transfers
    FROM public.bet_transfers t
    WHERE t.upstream_dealer_id = p_dealer_id;

    RETURN jsonb_build_object(
        'connections', v_conns,
        'payments', v_payments,
        'transfers', v_transfers,
        'transfers_as_upstream', v_other_transfers
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_inspect_upstream_data(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
