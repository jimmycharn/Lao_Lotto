-- Migration: 221_add_winning_numbers_to_round_history.sql
-- Description:
-- 1. Add winning_numbers JSONB column to round_history and user_round_history.
-- 2. Update superadmin_delete_round to store winning_numbers when archiving.
-- 3. Backfill winning_numbers from lottery_rounds where available.
-- 4. Clean up temporary debug functions.

-- 1. Add column to round_history and user_round_history
ALTER TABLE public.round_history 
ADD COLUMN IF NOT EXISTS winning_numbers JSONB;

ALTER TABLE public.user_round_history 
ADD COLUMN IF NOT EXISTS winning_numbers JSONB;

COMMENT ON COLUMN public.round_history.winning_numbers IS 'Winning numbers of the announced round (e.g. 4_set, 3_top, 2_top, 2_bottom, 6_top)';
COMMENT ON COLUMN public.user_round_history.winning_numbers IS 'Winning numbers of the announced round';

-- 2. Update superadmin_delete_round to preserve winning_numbers
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
        SELECT out_transferred_amt, out_upstream_comm, out_upstream_win
        INTO v_transferred_amt, v_upstream_comm, v_upstream_winnings
        FROM public.calculate_round_transfers_summary(p_round_id);

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

-- 3. Backfill winning_numbers from lottery_rounds where available
UPDATE public.round_history rh
SET winning_numbers = lr.winning_numbers
FROM public.lottery_rounds lr
WHERE (rh.round_id = lr.id OR (rh.round_date = lr.round_date AND rh.lottery_type = lr.lottery_type))
  AND lr.winning_numbers IS NOT NULL 
  AND lr.winning_numbers != '{}'::jsonb
  AND (rh.winning_numbers IS NULL OR rh.winning_numbers = '{}'::jsonb);

UPDATE public.user_round_history urh
SET winning_numbers = lr.winning_numbers
FROM public.lottery_rounds lr
WHERE (urh.round_id = lr.id OR (urh.round_date = lr.round_date AND urh.lottery_type = lr.lottery_type))
  AND lr.winning_numbers IS NOT NULL 
  AND lr.winning_numbers != '{}'::jsonb
  AND (urh.winning_numbers IS NULL OR urh.winning_numbers = '{}'::jsonb);

-- 4. Clean up temporary debug functions
DROP FUNCTION IF EXISTS public.debug_inspect_round_history();
DROP FUNCTION IF EXISTS public.debug_inspect_rounds_and_history();
DROP FUNCTION IF EXISTS public.debug_search_past_winning_numbers();
DROP FUNCTION IF EXISTS public.debug_all_winning_rounds();
