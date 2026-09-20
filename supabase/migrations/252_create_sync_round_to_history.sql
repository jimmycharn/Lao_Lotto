-- Migration 252: Create sync_round_to_history function
-- Synchronizes live submissions and bet_transfers data into round_history and user_round_history

CREATE OR REPLACE FUNCTION public.sync_round_to_history(
    p_round_id UUID,
    p_dealer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_round RECORD;
    v_is_admin BOOLEAN := FALSE;
    v_sub_count INT := 0;
    v_total_amt NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_total_payout NUMERIC := 0;
    v_transferred_amt NUMERIC := 0;
    v_transferred_entries INT := 0;
    v_upstream_comm NUMERIC := 0;
    v_upstream_winnings NUMERIC := 0;
    v_profit NUMERIC := 0;
    v_members_synced INT := 0;
    v_round_history_id UUID;
    v_round_close_date DATE;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_dealer_id);
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch round
    SELECT * INTO v_round FROM public.lottery_rounds WHERE id = p_round_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Round not found'
        );
    END IF;

    -- Verify caller is dealer owner or admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role IN ('admin', 'superadmin')
    ) INTO v_is_admin;

    IF v_round.dealer_id != v_caller_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this round';
    END IF;

    -- Calculate round date based on close_time (Thai timezone UTC+7) as required by Domain Rule 1
    v_round_close_date := COALESCE((v_round.close_time AT TIME ZONE 'Asia/Bangkok')::date, v_round.round_date);

    -- Calculate submissions totals (active, non-deleted)
    SELECT 
        COUNT(*),
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(commission_amount), 0),
        COALESCE(SUM(
            CASE 
                WHEN is_winner = TRUE THEN 
                    CASE 
                        WHEN bet_type = '4_set' THEN prize_amount * GREATEST(1, FLOOR(COALESCE(amount, 0) / 120.0))
                        ELSE prize_amount 
                    END
                ELSE 0 
            END
        ), 0)
    INTO v_sub_count, v_total_amt, v_total_comm, v_total_payout
    FROM public.submissions
    WHERE round_id = p_round_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    -- Calculate transfer totals
    SELECT COUNT(*) INTO v_transferred_entries
    FROM public.bet_transfers
    WHERE round_id = p_round_id;

    BEGIN
        SELECT out_transferred_amt, out_upstream_comm, out_upstream_win
        INTO v_transferred_amt, v_upstream_comm, v_upstream_winnings
        FROM public.calculate_round_transfers_summary(p_round_id);
    EXCEPTION WHEN OTHERS THEN
        v_transferred_amt := 0;
        v_upstream_comm := 0;
        v_upstream_winnings := 0;
    END;

    v_profit := (v_total_amt - v_total_comm - v_total_payout) + (-v_transferred_amt + v_upstream_comm + v_upstream_winnings);

    -- Upsert round_history
    SELECT id INTO v_round_history_id
    FROM public.round_history
    WHERE round_id = p_round_id 
       OR (dealer_id = v_round.dealer_id AND lottery_type = v_round.lottery_type AND round_date = v_round_close_date)
    LIMIT 1;

    IF v_round_history_id IS NOT NULL THEN
        UPDATE public.round_history SET
            round_id = p_round_id,
            lottery_type = v_round.lottery_type,
            lottery_name = COALESCE(v_round.lottery_name, v_round.lottery_type),
            round_date = v_round_close_date,
            open_time = v_round.open_time,
            close_time = v_round.close_time,
            total_entries = v_sub_count,
            total_amount = v_total_amt,
            total_commission = v_total_comm,
            total_payout = v_total_payout,
            transferred_amount = v_transferred_amt,
            transferred_entries = v_transferred_entries,
            upstream_commission = v_upstream_comm,
            upstream_winnings = v_upstream_winnings,
            profit = v_profit,
            winning_numbers = v_round.winning_numbers,
            deleted_at = NULL
        WHERE id = v_round_history_id;
    ELSE
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
            winning_numbers
        ) VALUES (
            v_round.dealer_id,
            p_round_id,
            v_round.lottery_type,
            COALESCE(v_round.lottery_name, v_round.lottery_type),
            v_round_close_date,
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
            v_profit,
            v_round.winning_numbers
        ) RETURNING id INTO v_round_history_id;
    END IF;

    -- Resync user_round_history
    DELETE FROM public.user_round_history
    WHERE round_id = p_round_id
       OR (dealer_id = v_round.dealer_id AND lottery_type = v_round.lottery_type AND round_date = v_round_close_date);

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
        winning_numbers
    )
    SELECT 
        s.user_id,
        v_round.dealer_id,
        p_round_id,
        v_round.lottery_type,
        COALESCE(v_round.lottery_name, v_round.lottery_type),
        v_round_close_date,
        v_round.open_time,
        v_round.close_time,
        COUNT(s.id),
        COALESCE(SUM(s.amount), 0),
        COALESCE(SUM(s.commission_amount), 0),
        COALESCE(SUM(CASE WHEN s.is_winner = TRUE THEN s.prize_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s.is_winner = TRUE THEN s.prize_amount ELSE 0 END), 0) + COALESCE(SUM(s.commission_amount), 0) - COALESCE(SUM(s.amount), 0),
        v_round.winning_numbers
    FROM public.submissions s
    WHERE s.round_id = p_round_id
      AND COALESCE(s.is_deleted, FALSE) = FALSE
    GROUP BY s.user_id;

    GET DIAGNOSTICS v_members_synced = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'total_amount', v_total_amt,
        'total_commission', v_total_comm,
        'total_payout', v_total_payout,
        'profit', v_profit,
        'members_synced', v_members_synced,
        'message', 'Synchronized round to history successfully'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_round_to_history(UUID, UUID) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
