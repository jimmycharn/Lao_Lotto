-- Migration: 211_debug_inspect_credit_tx.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_credit_tx()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_tx JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(ct)), '[]'::jsonb)
    INTO v_tx
    FROM credit_transactions ct
    WHERE ct.reference_id = '349a18b3-44fd-4c96-a7e0-14e6411a019b';
    RETURN v_tx;
END;
$$;
