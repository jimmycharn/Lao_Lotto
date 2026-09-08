-- Migration: 195_superadmin_dealer_rounds_management.sql
-- Description: RPC functions for SuperAdmin to view and manage dealer rounds with database-side aggregation (bypassing Supabase 1000-row limit) and atomic auto-archiving before deletion.

-- 1. RPC to get rounds with aggregated submission counts and dealer profiles
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
        lr.status,
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
            SUM(submissions.amount) AS total_amt
        FROM public.submissions
        GROUP BY submissions.round_id
    ) s ON s.round_id = lr.id
    WHERE (p_dealer_id IS NULL OR lr.dealer_id = p_dealer_id)
    ORDER BY lr.close_time DESC, lr.round_date DESC, lr.created_at DESC;
END;
$$;

-- 2. RPC to safely delete a round with auto-archiving
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

    -- Count submissions
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
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
        WHERE round_id = p_round_id;

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

-- 3. RPC to bulk cleanup announced rounds
CREATE OR REPLACE FUNCTION public.superadmin_bulk_cleanup_announced_rounds(
    p_dealer_id UUID DEFAULT NULL,
    p_round_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_round_id UUID;
    v_rounds_deleted INT := 0;
    v_total_subs_deleted INT := 0;
    v_res JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only superadmins can bulk cleanup dealer rounds';
    END IF;

    FOR v_round_id IN 
        SELECT id FROM public.lottery_rounds
        WHERE (status = 'announced' OR is_result_announced = TRUE)
          AND (p_dealer_id IS NULL OR dealer_id = p_dealer_id)
          AND (p_round_ids IS NULL OR id = ANY(p_round_ids))
    LOOP
        v_res := public.superadmin_delete_round(v_round_id);
        v_rounds_deleted := v_rounds_deleted + 1;
        v_total_subs_deleted := v_total_subs_deleted + COALESCE((v_res->>'deleted_submissions')::INT, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'rounds_deleted', v_rounds_deleted,
        'total_submissions_deleted', v_total_subs_deleted
    );
END;
$$;
