-- Migration: 220_all_winning_rounds.sql

CREATE OR REPLACE FUNCTION public.debug_all_winning_rounds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', lr.id,
            'dealer_id', lr.dealer_id,
            'round_date', lr.round_date,
            'close_time', lr.close_time,
            'lottery_type', lr.lottery_type,
            'lottery_name', lr.lottery_name,
            'winning_numbers', lr.winning_numbers
        )), '[]'::jsonb)
        FROM lottery_rounds lr
        WHERE lr.winning_numbers IS NOT NULL AND lr.winning_numbers != '{}'::jsonb
    );
END;
$$;
