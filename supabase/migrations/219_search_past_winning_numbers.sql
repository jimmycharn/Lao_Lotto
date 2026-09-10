-- Migration: 219_search_past_winning_numbers.sql

CREATE OR REPLACE FUNCTION public.debug_search_past_winning_numbers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN jsonb_build_object(
        'other_dealer_rounds', (
            SELECT jsonb_agg(jsonb_build_object(
                'dealer_id', lr.dealer_id,
                'round_date', lr.round_date,
                'lottery_type', lr.lottery_type,
                'winning_numbers', lr.winning_numbers
            ))
            FROM lottery_rounds lr
            WHERE lr.round_date IN ('2026-09-07', '2026-09-04', '2026-09-02', '2026-09-01')
              AND lr.winning_numbers IS NOT NULL
              AND lr.winning_numbers != '{}'::jsonb
        ),
        'central_results', (
            SELECT jsonb_agg(to_jsonb(clr))
            FROM central_lottery_results clr
        )
    );
END;
$$;
