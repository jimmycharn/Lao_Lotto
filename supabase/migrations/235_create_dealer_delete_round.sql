-- Migration 235: Create dealer_delete_round RPC function
-- Allows dealers to safely delete their own rounds (and admins to delete any round)
-- bypasses the RLS cascade delete subquery restriction on child tables.

CREATE OR REPLACE FUNCTION public.dealer_delete_round(p_round_id UUID)
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
    v_archived BOOLEAN := FALSE;
    v_deleted_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch round
    SELECT * INTO v_round FROM public.lottery_rounds WHERE id = p_round_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round not found';
    END IF;

    -- Verify caller is dealer owner or admin/superadmin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role IN ('admin', 'superadmin')
    ) INTO v_is_admin;

    IF v_round.dealer_id != v_caller_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this round';
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
        INTO v_total_amt, v_total_comm, v_total_payout
        FROM public.submissions
        WHERE round_id = p_round_id
          AND COALESCE(is_deleted, FALSE) = FALSE;

        -- Count transfer entries
        SELECT COUNT(*) INTO v_transferred_entries
        FROM public.bet_transfers
        WHERE round_id = p_round_id;

        -- Calculate accurate transfer financial totals
        BEGIN
            SELECT out_transferred_amt, out_upstream_comm, out_upstream_win
            INTO v_transferred_amt, v_upstream_comm, v_upstream_winnings
            FROM public.calculate_round_transfers_summary(p_round_id);
        EXCEPTION WHEN OTHERS THEN
            v_transferred_amt := 0;
            v_upstream_comm := 0;
            v_upstream_winnings := 0;
        END;

        -- Insert dealer round_history including winning_numbers
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
            deleted_at,
            winning_numbers
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
            NOW(),
            v_round.winning_numbers
        );

        -- Insert per-user summary into user_round_history including winning_numbers
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
            deleted_at,
            winning_numbers
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
            NOW(),
            v_round.winning_numbers
        FROM public.submissions s
        WHERE s.round_id = p_round_id
          AND COALESCE(s.is_deleted, FALSE) = FALSE
        GROUP BY s.user_id;

        v_archived := TRUE;
    END IF;

    -- Explicitly delete/disconnect child records to avoid any FK constraint or cascade issues
    DELETE FROM public.submissions WHERE round_id = p_round_id;
    DELETE FROM public.bet_transfers WHERE round_id = p_round_id;
    UPDATE public.bet_transfers SET target_round_id = NULL WHERE target_round_id = p_round_id;
    DELETE FROM public.type_limits WHERE round_id = p_round_id;
    DELETE FROM public.number_limits WHERE round_id = p_round_id;
    DELETE FROM public.round_pending_credits WHERE round_id = p_round_id;
    DELETE FROM public.ai_analysis_logs WHERE round_id = p_round_id;
    DELETE FROM public.member_round_payments WHERE round_id = p_round_id;
    DELETE FROM public.upstream_round_payments WHERE round_id = p_round_id;
    UPDATE public.dealer_billing_records SET round_id = NULL WHERE round_id = p_round_id;
    UPDATE public.dealer_referral_commissions SET round_id = NULL WHERE round_id = p_round_id;

    -- Delete round
    DELETE FROM public.lottery_rounds WHERE id = p_round_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'deleted_submissions', v_sub_count,
        'deleted_rounds', v_deleted_count,
        'archived', v_archived
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dealer_delete_round(UUID) TO authenticated;

-- Clean up temporary debug functions from migrations 227-234
DROP FUNCTION IF EXISTS public.debug_inspect_round_delete();
DROP FUNCTION IF EXISTS public.debug_inspect_all_rounds();
DROP FUNCTION IF EXISTS public.debug_inspect_triggers_and_test_delete(UUID);
DROP FUNCTION IF EXISTS public.debug_inspect_submissions_rls();
DROP FUNCTION IF EXISTS public.debug_simulate_authenticated_delete(UUID, UUID);
DROP FUNCTION IF EXISTS public.debug_test_dealer_delete(UUID, UUID);
