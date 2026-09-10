-- Migration: 202_inspect_game_thai_round.sql

CREATE OR REPLACE FUNCTION public.debug_inspect_game_thai_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round_id UUID := '349a18b3-44fd-4c96-a7e0-14e6411a019b';
    v_dealer_id UUID := 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';
    v_db_prize_sum NUMERIC;
    v_dynamic_payout_sum NUMERIC;
    v_diffs JSONB;
    v_counts RECORD;
BEGIN
    -- DB prize sum
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN is_winner = TRUE THEN 1 END),
        SUM(CASE WHEN is_winner = TRUE THEN prize_amount ELSE 0 END),
        SUM(amount),
        SUM(commission_amount)
    INTO v_counts
    FROM public.submissions
    WHERE round_id = v_round_id AND COALESCE(is_deleted, FALSE) = FALSE;

    -- Dynamic payout sum matching RoundAccordionItem getExpectedPayout
    SELECT 
        COALESCE(SUM(
            CASE
                WHEN s.is_winner != TRUE THEN 0
                WHEN s.bet_type = '4_set' THEN
                    COALESCE(s.prize_amount, 0) * GREATEST(1, FLOOR(COALESCE(s.amount, 0) / 120.0))
                ELSE
                    COALESCE(s.amount, 0) * COALESCE(
                        (us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout')::NUMERIC,
                        CASE 
                            WHEN s.bet_type = '3_top' THEN 900.0
                            WHEN s.bet_type IN ('2_top', '2_bottom') THEN 90.0
                            WHEN s.bet_type = 'run_top' THEN 3.2
                            WHEN s.bet_type = 'run_bottom' THEN 4.2
                            ELSE 1.0
                        END
                    )
            END
        ), 0)
    INTO v_dynamic_payout_sum
    FROM public.submissions s
    LEFT JOIN public.user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_dealer_id
    WHERE s.round_id = v_round_id AND COALESCE(s.is_deleted, FALSE) = FALSE;

    -- Look at diff rows
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'bet_type', s.bet_type,
            'numbers', s.numbers,
            'amount', s.amount,
            'db_prize_amount', s.prize_amount,
            'user_setting_payout', us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout',
            'dynamic_payout', CASE 
                WHEN s.bet_type = '4_set' THEN 
                    COALESCE(s.prize_amount, 0) * GREATEST(1, FLOOR(COALESCE(s.amount, 0) / 120.0))
                ELSE 
                    COALESCE(s.amount, 0) * COALESCE(
                        (us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout')::NUMERIC,
                        90.0
                    )
            END
        )
    )
    INTO v_diffs
    FROM public.submissions s
    LEFT JOIN public.user_settings us ON us.user_id = s.user_id AND us.dealer_id = v_dealer_id
    WHERE s.round_id = v_round_id 
      AND s.is_winner = TRUE 
      AND COALESCE(s.is_deleted, FALSE) = FALSE
      AND COALESCE(s.prize_amount, 0) != (
            CASE 
                WHEN s.bet_type = '4_set' THEN 
                    COALESCE(s.prize_amount, 0) * GREATEST(1, FLOOR(COALESCE(s.amount, 0) / 120.0))
                ELSE 
                    COALESCE(s.amount, 0) * COALESCE(
                        (us.lottery_settings -> 'thai' -> s.bet_type ->> 'payout')::NUMERIC,
                        CASE 
                            WHEN s.bet_type = '3_top' THEN 900.0
                            WHEN s.bet_type IN ('2_top', '2_bottom') THEN 90.0
                            WHEN s.bet_type = 'run_top' THEN 3.2
                            WHEN s.bet_type = 'run_bottom' THEN 4.2
                            ELSE 1.0
                        END
                    )
            END
      );

    RETURN jsonb_build_object(
        'sub_count', v_counts.count,
        'winner_count', v_counts.count_1,
        'db_prize_sum', v_counts.sum,
        'db_total_amount', v_counts.sum_1,
        'db_total_commission', v_counts.sum_2,
        'dynamic_payout_sum', v_dynamic_payout_sum,
        'diff', v_dynamic_payout_sum - v_counts.sum,
        'diff_rows', v_diffs
    );
END;
$$;
