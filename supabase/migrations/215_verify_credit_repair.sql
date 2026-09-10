-- Migration: 215_verify_credit_repair.sql

CREATE OR REPLACE FUNCTION public.debug_verify_credit_repair()
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
        'repaired_tx', (SELECT to_jsonb(ct) FROM credit_transactions ct WHERE ct.id = '812abd5a-4ad2-4ead-9e57-f501de223b70'),
        'latest_tx', (
            SELECT to_jsonb(ct) FROM credit_transactions ct 
            WHERE ct.dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'
            ORDER BY ct.created_at DESC 
            LIMIT 1
        )
    ) INTO v_res;
    RETURN v_res;
END;
$$;
