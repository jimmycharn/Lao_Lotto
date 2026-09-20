-- Migration 250: Diagnostic function to compare bet_transfers with round_history
-- This helps identify discrepancies between restored transfers and historical records

CREATE OR REPLACE FUNCTION public.debug_compare_transfer_data(p_dealer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'round_history', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', rh.id,
                    'round_id', rh.round_id,
                    'lottery_type', rh.lottery_type,
                    'round_date', rh.round_date,
                    'open_time', rh.open_time,
                    'close_time', rh.close_time,
                    'total_entries', rh.total_entries,
                    'total_amount', rh.total_amount,
                    'total_commission', rh.total_commission,
                    'total_payout', rh.total_payout,
                    'transferred_amount', rh.transferred_amount,
                    'upstream_commission', rh.upstream_commission,
                    'upstream_winnings', rh.upstream_winnings,
                    'transferred_entries', rh.transferred_entries,
                    'profit', rh.profit,
                    'deleted_at', rh.deleted_at
                ) ORDER BY rh.round_date DESC
            )
            FROM public.round_history rh
            WHERE rh.dealer_id = p_dealer_id
        ),
        'current_bet_transfers', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', bt.id,
                    'round_id', bt.round_id,
                    'bet_type', bt.bet_type,
                    'numbers', bt.numbers,
                    'amount', bt.amount,
                    'status', bt.status,
                    'is_linked', bt.is_linked,
                    'target_dealer_name', bt.target_dealer_name,
                    'transfer_batch_id', bt.transfer_batch_id,
                    'created_at', bt.created_at
                ) ORDER BY bt.created_at DESC
            )
            FROM public.bet_transfers bt
            JOIN public.lottery_rounds r ON r.id = bt.round_id
            WHERE r.dealer_id = p_dealer_id
        ),
        'current_rounds', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'lottery_name', r.lottery_name,
                    'round_date', r.round_date,
                    'status', r.status,
                    'close_time', r.close_time,
                    'winning_numbers', r.winning_numbers
                ) ORDER BY r.close_time DESC
            )
            FROM public.lottery_rounds r
            WHERE r.dealer_id = p_dealer_id
        ),
        'upstream_round_payments', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'round_id', p.round_id,
                    'dealer_id', p.dealer_id,
                    'upstream_dealer_id', p.upstream_dealer_id,
                    'upstream_dealer_name', p.upstream_dealer_name,
                    'total_transfer_amount', p.total_transfer_amount,
                    'total_transfer_commission', p.total_transfer_commission,
                    'upstream_winnings', p.upstream_winnings,
                    'profit_loss', p.profit_loss,
                    'payment_status', p.payment_status,
                    'created_at', p.created_at
                ) ORDER BY p.created_at DESC
            )
            FROM public.upstream_round_payments p
            WHERE p.dealer_id = p_dealer_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_compare_transfer_data(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
