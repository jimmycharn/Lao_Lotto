-- Migration: 218_inspect_rounds_and_history.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_rounds_and_history()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN jsonb_build_object(
        'history_rows', (
            SELECT jsonb_agg(to_jsonb(rh))
            FROM round_history rh
            WHERE rh.dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'
        ),
        'active_rounds', (
            SELECT jsonb_agg(to_jsonb(lr))
            FROM lottery_rounds lr
            WHERE lr.dealer_id = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'
        )
    );
END;
$$;
