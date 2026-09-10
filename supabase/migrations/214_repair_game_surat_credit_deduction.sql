-- Migration: 214_repair_game_surat_credit_deduction.sql
-- Description:
-- 1. Repair credit deduction for Thai lottery round (1 ก.ย. 2569) of dealer Game Surat.
--    The profit was recorded as 140,318.55 instead of 133,918.55 due to the 6,400 payout undercount.
--    The 5% fee was therefore 7,015.93 instead of 6,695.93 (overcharged by 320.00 THB).
-- 2. Update credit_transactions row, subsequent balance_after values, and dealer_credits balance.
-- 3. Clean up debug functions.

DO $$
DECLARE
    v_target_tx_id UUID := '812abd5a-4ad2-4ead-9e57-f501de223b70';
    v_dealer_id UUID := 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7';
    v_diff NUMERIC := 320.00;
BEGIN
    -- 1. Update the target transaction
    UPDATE public.credit_transactions
    SET 
        amount = -6695.93,
        balance_after = balance_after + v_diff,
        metadata = jsonb_build_object(
            'type', 'profit_percentage_deduction',
            'profit', 133918.55,
            'profitFee', 6695.93,
            'profitPercentageRate', 5
        )
    WHERE id = v_target_tx_id;

    -- 2. Update all subsequent transactions for this dealer that occurred after the target transaction
    UPDATE public.credit_transactions
    SET balance_after = balance_after + v_diff
    WHERE dealer_id = v_dealer_id
      AND created_at > '2026-09-01T09:00:06.546982+00:00';

    -- 3. Update dealer's credit balance
    UPDATE public.dealer_credits
    SET 
        balance = balance + v_diff,
        updated_at = NOW()
    WHERE dealer_id = v_dealer_id;
END;
$$;

-- Drop debug functions
DROP FUNCTION IF EXISTS public.debug_inspect_credit_tx();
DROP FUNCTION IF EXISTS public.debug_inspect_dealer_all_tx();
DROP FUNCTION IF EXISTS public.debug_check_exact_thai_round_profit();
