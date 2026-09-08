-- Migration: 197_fix_superadmin_delete_round_transfers.sql
-- Description: Fix column "winnings" does not exist in bet_transfers query inside superadmin_delete_round.

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

        -- Check transfers (bet_transfers has no winnings column, upstream_winnings is initialized to 0)
        SELECT 
            COUNT(*),
            COALESCE(SUM(amount), 0)
        INTO v_transferred_entries, v_transferred_amt
        FROM public.bet_transfers
        WHERE round_id = p_round_id;

        v_upstream_winnings := 0;

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
