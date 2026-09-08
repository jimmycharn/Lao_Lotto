-- Migration: 196_fix_dealer_rounds_status_and_active_amounts.sql
-- Description: 
-- 1. In superadmin_get_dealer_rounds:
--    - Calculate effective status based on close_time < NOW() so rounds past close_time are marked as 'closed' (matching Dealer view).
--    - Aggregate total_amount by filtering COALESCE(is_deleted, false) = false so soft-deleted bets do not inflate totals.
-- 2. In superadmin_delete_round:
--    - Filter COALESCE(is_deleted, false) = false when calculating total_amt and archiving to round_history & user_round_history.

-- 1. Update superadmin_get_dealer_rounds
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
    created_at TIMESTAMPTZ
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
        EXISTS(SELECT 1 FROM public.round_history rh WHERE rh.round_id = lr.id) AS is_archived,
        lr.created_at
    FROM public.lottery_rounds lr
    JOIN public.profiles p ON p.id = lr.dealer_id
    LEFT JOIN (
        SELECT 
            submissions.round_id,
            COUNT(submissions.id) AS sub_count,
            SUM(CASE WHEN COALESCE(submissions.is_deleted, FALSE) = FALSE THEN submissions.amount ELSE 0 END) AS total_amt
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.close_time DESC, lr.round_date DESC, lr.created_at DESC;
END;
$$;

-- 2. Update superadmin_delete_round
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

        -- Check transfers
        SELECT 
            COUNT(*),
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(winnings), 0)
        INTO v_transferred_entries, v_transferred_amt, v_upstream_winnings
        FROM public.bet_transfers
        WHERE round_id = p_round_id;

        IF v_transferred_amt > 0 THEN
            v_upstream_comm := ROUND(v_transferred_amt * (25.0 / 120.0));
        ELSE
            v_upstream_comm := 0;
        END IF;

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
