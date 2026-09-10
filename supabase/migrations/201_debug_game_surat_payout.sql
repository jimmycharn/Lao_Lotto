-- Migration: 201_debug_game_surat_payout.sql
CREATE OR REPLACE FUNCTION public.debug_inspect_game_surat_payout()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_dealers JSONB;
    v_rounds JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'email', email, 'role', role))
    INTO v_dealers
    FROM public.profiles
    WHERE email ILIKE '%game%' OR full_name ILIKE '%เกมส์%' OR full_name ILIKE '%สุราษ%';

    SELECT jsonb_agg(jsonb_build_object('id', r.id, 'dealer_id', r.dealer_id, 'lottery_type', r.lottery_type, 'status', r.status, 'is_announced', r.is_result_announced, 'round_date', r.round_date, 'close_time', r.close_time))
    INTO v_rounds
    FROM public.lottery_rounds r
    WHERE r.dealer_id IN (
        SELECT id FROM public.profiles WHERE email ILIKE '%game%' OR full_name ILIKE '%เกมส์%' OR full_name ILIKE '%สุราษ%'
    );

    RETURN jsonb_build_object(
        'dealers', v_dealers,
        'rounds', v_rounds
    );
END;
$$;
