-- Migration: 208_verify_game_surat_rounds.sql

CREATE OR REPLACE FUNCTION public.debug_verify_game_surat_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round RECORD;
    v_total_amt NUMERIC;
    v_total_comm NUMERIC;
    v_total_payout NUMERIC;
    v_net_profit NUMERIC;
BEGIN
    SELECT 
        s.round_id,
        COALESCE(SUM(CASE WHEN COALESCE(s.is_deleted, FALSE) = FALSE THEN s.amount ELSE 0 END), 0) AS total_amt,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(s.is_deleted, FALSE) = FALSE THEN COALESCE(s.commission_amount, 0) ELSE 0 END), 0)) AS total_comm,
        COALESCE(SUM(
            CASE 
                WHEN COALESCE(s.is_deleted, FALSE) = FALSE AND s.is_winner = TRUE THEN 
                    CASE 
                        WHEN s.bet_type = '4_set' THEN 
                            COALESCE(s.prize_amount, 0) * GREATEST(1, FLOOR(COALESCE(s.amount, 0) / 120.0))
                        ELSE 
                            COALESCE(s.prize_amount, 0)
                    END
                ELSE 0 
            END
        ), 0) AS total_payout
    INTO 
        v_round.round_id,
        v_total_amt,
        v_total_comm,
        v_total_payout
    FROM public.submissions s
    WHERE s.round_id = '349a18b3-44fd-4c96-a7e0-14e6411a019b'
    GROUP BY s.round_id;

    v_net_profit := v_total_amt - v_total_comm - v_total_payout;

    RETURN jsonb_build_object(
        'round_id', '349a18b3-44fd-4c96-a7e0-14e6411a019b',
        'total_amount', v_total_amt,
        'total_commission', v_total_comm,
        'total_payout', v_total_payout,
        'net_profit', v_net_profit
    );
END;
$$;
