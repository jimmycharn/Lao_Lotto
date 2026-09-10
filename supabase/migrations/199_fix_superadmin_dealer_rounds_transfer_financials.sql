-- Migration: 199_fix_superadmin_dealer_rounds_transfer_financials.sql
-- Description: Accurately calculate bet transfer commission and winnings according to dealer upstream settings
-- in superadmin_get_dealer_rounds and superadmin_delete_round.

-- 1. Helper function to calculate outgoing transfers summary for any round
CREATE OR REPLACE FUNCTION public.calculate_round_transfers_summary(
    p_round_id UUID,
    OUT out_transferred_amt NUMERIC,
    OUT out_upstream_comm NUMERIC,
    OUT out_upstream_win NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_lottery_type TEXT;
    v_is_announced BOOLEAN;
    v_winning_numbers JSONB;
    v_dealer_id UUID;
    v_lottery_key TEXT;
BEGIN
    out_transferred_amt := 0;
    out_upstream_comm := 0;
    out_upstream_win := 0;

    -- Get round metadata
    SELECT 
        dealer_id,
        lottery_type,
        COALESCE(is_result_announced, FALSE),
        winning_numbers
    INTO
        v_dealer_id,
        v_lottery_type,
        v_is_announced,
        v_winning_numbers
    FROM public.lottery_rounds
    WHERE id = p_round_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Normalize lottery key (same as getLotteryTypeKey)
    IF v_lottery_type IN ('lao', 'hanoi') THEN
        v_lottery_key := 'lao';
    ELSIF v_lottery_type = 'stock' THEN
        v_lottery_key := 'stock';
    ELSE
        v_lottery_key := 'thai';
    END IF;

    SELECT
        COALESCE(SUM(t.amount), 0),
        ROUND(COALESCE(SUM(
            CASE
                -- 4_set commission is fixed Baht per set
                WHEN t.bet_type = '4_set' THEN
                    FLOOR(COALESCE(t.amount, 0) / COALESCE(
                        (sett.lottery_settings -> v_lottery_key -> '4_set' ->> 'setPrice')::NUMERIC,
                        120.0
                    ))
                    * COALESCE(
                        (sett.lottery_settings -> v_lottery_key -> '4_set' ->> 'commission')::NUMERIC,
                        25.0
                    )
                ELSE
                    COALESCE(t.amount, 0) * (
                        COALESCE(
                            (sett.lottery_settings -> v_lottery_key -> (
                                CASE
                                    WHEN v_lottery_key = 'lao' AND t.bet_type IN ('3_top', '3_straight') THEN '3_straight'
                                    WHEN v_lottery_key = 'lao' AND t.bet_type IN ('3_tod', '3_tod_single') THEN '3_tod_single'
                                    WHEN t.bet_type IN ('front_top_1', 'middle_top_1', 'back_top_1') THEN 'pak_top'
                                    WHEN t.bet_type IN ('front_bottom_1', 'back_bottom_1') THEN 'pak_bottom'
                                    ELSE t.bet_type
                                END
                            ) ->> 'commission')::NUMERIC,
                            -- Fallbacks matching getFallbackCommission
                            CASE
                                WHEN v_lottery_key = 'lao' THEN
                                    CASE
                                        WHEN t.bet_type IN ('run_top', 'run_bottom') THEN 10.0
                                        WHEN t.bet_type IN ('pak_top', 'pak_bottom', '2_top', '2_bottom', '2_front', '2_center', '2_spread', '2_run', '3_top', '3_tod', '3_bottom', '4_float', '5_float') THEN 20.0
                                        WHEN t.bet_type IN ('4_top', '4_set') THEN 25.0
                                        ELSE 20.0
                                    END
                                ELSE
                                    -- Thai / Stock defaults
                                    CASE
                                        WHEN t.bet_type IN ('3_top', '3_tod', '3_front', '3_straight') THEN 30.0
                                        WHEN t.bet_type IN ('2_top', '2_bottom', '2_front', '2_spread') THEN 28.0
                                        WHEN t.bet_type IN ('1_top', '1_bottom', 'run_top', 'run_bottom') THEN 12.0
                                        ELSE 20.0
                                    END
                            END
                        ) / 100.0
                    )
            END
        ), 0)),
        ROUND(COALESCE(SUM(
            CASE
                -- Linked transfer win checking
                WHEN t.target_submission_id IS NOT NULL THEN
                    CASE
                        WHEN target_sub.is_winner = TRUE THEN
                            CASE
                                WHEN target_sub.bet_type = '4_set' THEN
                                    COALESCE(target_sub.prize_amount, 0) * GREATEST(1, FLOOR(COALESCE(target_sub.amount, 0) / 120.0))
                                ELSE
                                    COALESCE(target_sub.prize_amount, 0)
                            END
                        ELSE 0
                    END
                -- External transfer win checking (when announced)
                WHEN v_is_announced = TRUE AND v_winning_numbers IS NOT NULL THEN
                    CASE
                        WHEN t.bet_type IN ('3_top', '3_straight') AND t.numbers = (v_winning_numbers ->> '3_top') THEN
                            t.amount * COALESCE(
                                (sett.lottery_settings -> v_lottery_key -> (
                                    CASE WHEN v_lottery_key = 'lao' THEN '3_straight' ELSE '3_top' END
                                ) ->> 'payout')::NUMERIC,
                                900.0
                            )
                        WHEN t.bet_type = '2_top' AND t.numbers = COALESCE(v_winning_numbers ->> '2_top', RIGHT(v_winning_numbers ->> '3_top', 2)) THEN
                            t.amount * COALESCE(
                                (sett.lottery_settings -> v_lottery_key -> '2_top' ->> 'payout')::NUMERIC,
                                90.0
                            )
                        WHEN t.bet_type = '2_bottom' AND t.numbers = (v_winning_numbers ->> '2_bottom') THEN
                            t.amount * COALESCE(
                                (sett.lottery_settings -> v_lottery_key -> '2_bottom' ->> 'payout')::NUMERIC,
                                90.0
                            )
                        WHEN t.bet_type = 'run_top' AND (v_winning_numbers ->> '3_top') LIKE ('%' || t.numbers || '%') THEN
                            t.amount * COALESCE(
                                (sett.lottery_settings -> v_lottery_key -> 'run_top' ->> 'payout')::NUMERIC,
                                3.2
                            )
                        WHEN t.bet_type = 'run_bottom' AND (v_winning_numbers ->> '2_bottom') LIKE ('%' || t.numbers || '%') THEN
                            t.amount * COALESCE(
                                (sett.lottery_settings -> v_lottery_key -> 'run_bottom' ->> 'payout')::NUMERIC,
                                4.2
                            )
                        ELSE 0
                    END
                ELSE 0
            END
        ), 0))
    INTO
        out_transferred_amt,
        out_upstream_comm,
        out_upstream_win
    FROM public.bet_transfers t
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            (
                SELECT us_inner.lottery_settings
                FROM public.user_settings us_inner
                WHERE us_inner.user_id = v_dealer_id
                  AND us_inner.dealer_id = t.upstream_dealer_id
                LIMIT 1
            ),
            (
                SELECT duc_inner.lottery_settings
                FROM public.dealer_upstream_connections duc_inner
                WHERE duc_inner.dealer_id = v_dealer_id
                  AND (
                      (t.upstream_dealer_id IS NOT NULL AND duc_inner.upstream_dealer_id = t.upstream_dealer_id)
                      OR (TRIM(duc_inner.upstream_name) = TRIM(t.target_dealer_name))
                  )
                ORDER BY duc_inner.updated_at DESC NULLS LAST
                LIMIT 1
            )
        ) AS lottery_settings
    ) sett ON true
    LEFT JOIN LATERAL (
        SELECT sub_inner.is_winner, sub_inner.prize_amount, sub_inner.bet_type, sub_inner.amount
        FROM public.submissions sub_inner
        WHERE sub_inner.id = t.target_submission_id
          AND COALESCE(sub_inner.is_deleted, FALSE) = FALSE
        LIMIT 1
    ) target_sub ON (t.target_submission_id IS NOT NULL)
    WHERE t.round_id = p_round_id;

    out_transferred_amt := COALESCE(out_transferred_amt, 0);
    out_upstream_comm := COALESCE(out_upstream_comm, 0);
    out_upstream_win := COALESCE(out_upstream_win, 0);
END;
$$;

-- 2. Drop and recreate superadmin_get_dealer_rounds with accurate metrics
DROP FUNCTION IF EXISTS public.superadmin_get_dealer_rounds(UUID);

CREATE OR REPLACE FUNCTION public.superadmin_get_dealer_rounds(p_dealer_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    dealer_id UUID,
    dealer_name TEXT,
    dealer_email TEXT,
    lottery_type TEXT,
    lottery_name TEXT,
    round_date DATE,
    open_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    status TEXT,
    is_result_announced BOOLEAN,
    winning_numbers JSONB,
    submission_count BIGINT,
    total_amount NUMERIC,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ,
    total_commission NUMERIC,
    total_payout NUMERIC,
    transferred_amount NUMERIC,
    upstream_commission NUMERIC,
    upstream_winnings NUMERIC,
    net_profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- Only superadmin allowed
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can access dealer rounds overview';
    END IF;

    RETURN QUERY
    SELECT 
        lr.id,
        lr.dealer_id,
        COALESCE(p.full_name, 'ไม่ระบุชื่อ') AS dealer_name,
        COALESCE(p.email, '') AS dealer_email,
        lr.lottery_type,
        COALESCE(lr.lottery_name, lr.lottery_type) AS lottery_name,
        lr.round_date,
        lr.open_time,
        lr.close_time,
        CASE 
            WHEN lr.status = 'announced' OR COALESCE(lr.is_result_announced, FALSE) = TRUE THEN 'announced'
            WHEN lr.status = 'closed' OR (lr.close_time IS NOT NULL AND lr.close_time < NOW()) THEN 'closed'
            ELSE 'open'
        END AS status,
        COALESCE(lr.is_result_announced, FALSE) AS is_result_announced,
        COALESCE(lr.winning_numbers, '{}'::jsonb) AS winning_numbers,
        COALESCE(s.sub_count, 0::BIGINT) AS submission_count,
        COALESCE(s.total_amt, 0::NUMERIC) AS total_amount,
        EXISTS(SELECT 1 FROM public.round_history rh_check WHERE rh_check.round_id = lr.id) AS is_archived,
        lr.created_at,
        -- Financial metrics: fallback to round_history if already archived, otherwise aggregate active data
        COALESCE(rh.total_commission, s.total_comm, 0::NUMERIC) AS total_commission,
        COALESCE(rh.total_payout, s.total_payout, 0::NUMERIC) AS total_payout,
        COALESCE(rh.transferred_amount, bt.out_transferred_amt, 0::NUMERIC) AS transferred_amount,
        COALESCE(rh.upstream_commission, bt.out_upstream_comm, 0::NUMERIC) AS upstream_commission,
        COALESCE(rh.upstream_winnings, bt.out_upstream_win, 0::NUMERIC) AS upstream_winnings,
        COALESCE(
            rh.profit,
            (
                (COALESCE(s.total_amt, 0::NUMERIC) - COALESCE(s.total_comm, 0::NUMERIC) - COALESCE(s.total_payout, 0::NUMERIC))
                + (-COALESCE(bt.out_transferred_amt, 0::NUMERIC) + COALESCE(bt.out_upstream_comm, 0::NUMERIC) + COALESCE(bt.out_upstream_win, 0::NUMERIC))
            )
        ) AS net_profit
    FROM public.lottery_rounds lr
    JOIN public.profiles p ON p.id = lr.dealer_id
    LEFT JOIN (
        SELECT 
            submissions.round_id,
            COUNT(submissions.id) AS sub_count,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN submissions.amount ELSE 0 END) AS total_amt,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN COALESCE(submissions.commission_amount, 0) ELSE 0 END) AS total_comm,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE AND submissions.is_winner = TRUE THEN COALESCE(submissions.prize_amount, 0) ELSE 0 END) AS total_payout
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    LEFT JOIN LATERAL public.calculate_round_transfers_summary(lr.id) bt ON TRUE
    LEFT JOIN public.round_history rh ON rh.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.close_time DESC, lr.round_date DESC, lr.created_at DESC;
END;
$$;

-- 3. Update superadmin_delete_round to use calculate_round_transfers_summary
CREATE OR REPLACE FUNCTION public.superadmin_delete_round(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round RECORD;
    v_sub_count INT := 0;
    v_total_amt NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_total_payout NUMERIC := 0;
    v_transferred_amt NUMERIC := 0;
    v_transferred_entries INT := 0;
    v_upstream_comm NUMERIC := 0;
    v_upstream_winnings NUMERIC := 0;
    v_archived BOOLEAN := FALSE;
BEGIN
    -- Verify superadmin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can delete dealer rounds';
    END IF;

    -- Fetch round
    SELECT * INTO v_round FROM public.lottery_rounds WHERE id = p_round_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round not found';
    END IF;

    -- Count submissions & active amount
    SELECT 
        COUNT(*), 
        COALESCE(SUM(CASE WHEN COALESCE(is_deleted, FALSE) = FALSE THEN amount ELSE 0 END), 0)
    INTO v_sub_count, v_total_amt
    FROM public.submissions
    WHERE round_id = p_round_id;

    -- If announced and not yet in round_history, archive summary
    IF (v_round.status = 'announced' OR v_round.is_result_announced = TRUE)
       AND NOT EXISTS (SELECT 1 FROM public.round_history WHERE round_id = p_round_id) THEN
        
        SELECT 
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(commission_amount), 0),
            COALESCE(SUM(CASE WHEN is_winner = TRUE THEN prize_amount ELSE 0 END), 0)
        INTO v_total_amt, v_total_comm, v_total_payout
        FROM public.submissions
        WHERE round_id = p_round_id
          AND COALESCE(is_deleted, FALSE) = FALSE;

        -- Count transfer entries
        SELECT COUNT(*) INTO v_transferred_entries
        FROM public.bet_transfers
        WHERE round_id = p_round_id;

        -- Calculate accurate transfer financial totals
        SELECT out_transferred_amt, out_upstream_comm, out_upstream_win
        INTO v_transferred_amt, v_upstream_comm, v_upstream_winnings
        FROM public.calculate_round_transfers_summary(p_round_id);

        -- Insert dealer round_history
        INSERT INTO public.round_history (
            dealer_id,
            round_id,
            lottery_type,
            lottery_name,
            round_date,
            open_time,
            close_time,
            total_entries,
            total_amount,
            total_commission,
            total_payout,
            transferred_amount,
            transferred_entries,
            upstream_commission,
            upstream_winnings,
            profit,
            deleted_at
        ) VALUES (
            v_round.dealer_id,
            p_round_id,
            v_round.lottery_type,
            COALESCE(v_round.lottery_name, v_round.lottery_type),
            v_round.round_date,
            v_round.open_time,
            v_round.close_time,
            v_sub_count,
            v_total_amt,
            v_total_comm,
            v_total_payout,
            v_transferred_amt,
            v_transferred_entries,
            v_upstream_comm,
            v_upstream_winnings,
            (v_total_amt - v_total_comm - v_total_payout) + (-v_transferred_amt + v_upstream_comm + v_upstream_winnings),
            NOW()
        );

        -- Insert per-user summary into user_round_history
        INSERT INTO public.user_round_history (
            user_id,
            dealer_id,
            round_id,
            lottery_type,
            lottery_name,
            round_date,
            open_time,
            close_time,
            total_entries,
            total_amount,
            total_commission,
            total_winnings,
            profit_loss,
            deleted_at
        )
        SELECT 
            s.user_id,
            v_round.dealer_id,
            p_round_id,
            v_round.lottery_type,
            COALESCE(v_round.lottery_name, v_round.lottery_type),
            v_round.round_date,
            v_round.open_time,
            v_round.close_time,
            COUNT(s.id),
            COALESCE(SUM(s.amount), 0),
            COALESCE(SUM(s.commission_amount), 0),
            COALESCE(SUM(CASE WHEN s.is_winner = TRUE THEN s.prize_amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.is_winner = TRUE THEN s.prize_amount ELSE 0 END), 0) + COALESCE(SUM(s.commission_amount), 0) - COALESCE(SUM(s.amount), 0),
            NOW()
        FROM public.submissions s
        WHERE s.round_id = p_round_id
          AND COALESCE(s.is_deleted, FALSE) = FALSE
        GROUP BY s.user_id;

        v_archived := TRUE;
    END IF;

    -- Delete round (cascades submissions, type_limits, number_limits, bet_transfers)
    DELETE FROM public.lottery_rounds WHERE id = p_round_id;

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'deleted_submissions', v_sub_count,
        'archived', v_archived
    );
END;
$$;
