-- Migration: 217_inspect_round_history.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_round_history()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(to_jsonb(rh)), '[]'::jsonb) 
        FROM (SELECT * FROM round_history ORDER BY created_at DESC LIMIT 10) rh
    );
END;
$$;
