-- Migration: 212_inspect_dealer_all_tx.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_dealer_all_tx()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_build_object(
        'credit', (SELECT to_jsonb(dc) FROM dealer_credits dc WHERE dc.dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'),
        'transactions', (
            SELECT COALESCE(jsonb_agg(to_jsonb(ct)), '[]'::jsonb) 
            FROM (
                SELECT * FROM credit_transactions 
                WHERE dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'
                ORDER BY created_at ASC
            ) ct
        )
    ) INTO v_res;
    RETURN v_res;
END;
$$;
