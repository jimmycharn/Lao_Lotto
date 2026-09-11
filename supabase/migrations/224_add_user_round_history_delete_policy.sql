-- ==========================================================
-- Migration 224: Add DELETE policy for user_round_history and RPC function
-- ==========================================================

-- 1. Add DELETE policy for user_round_history so dealers can delete their member round history
DROP POLICY IF EXISTS "Dealers can delete member round history" ON public.user_round_history;
CREATE POLICY "Dealers can delete member round history"
    ON public.user_round_history FOR DELETE
    TO authenticated
    USING (
        dealer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- 2. Create secure atomic RPC function to delete dealer round history and its associated child records
CREATE OR REPLACE FUNCTION delete_dealer_round_history(p_round_id UUID, p_history_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_rh_deleted INT := 0;
    v_urh_deleted INT := 0;
    v_lr_deleted INT := 0;
    v_mrp_deleted INT := 0;
    v_urp_deleted INT := 0;
    v_is_admin BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role IN ('admin', 'superadmin')
    ) INTO v_is_admin;

    -- 1. Delete from round_history
    DELETE FROM public.round_history
    WHERE (id = p_history_id OR (p_round_id IS NOT NULL AND round_id = p_round_id))
      AND (dealer_id = v_caller_id OR v_is_admin);
    GET DIAGNOSTICS v_rh_deleted = ROW_COUNT;

    -- 2. Delete from user_round_history
    IF p_round_id IS NOT NULL THEN
        DELETE FROM public.user_round_history
        WHERE round_id = p_round_id
          AND (dealer_id = v_caller_id OR v_is_admin);
        GET DIAGNOSTICS v_urh_deleted = ROW_COUNT;

        -- 3. Delete from lottery_rounds if present
        DELETE FROM public.lottery_rounds
        WHERE id = p_round_id
          AND (dealer_id = v_caller_id OR v_is_admin);
        GET DIAGNOSTICS v_lr_deleted = ROW_COUNT;

        -- 4. Delete from member_round_payments
        DELETE FROM public.member_round_payments
        WHERE round_id = p_round_id
          AND (dealer_id = v_caller_id OR v_is_admin);
        GET DIAGNOSTICS v_mrp_deleted = ROW_COUNT;

        -- 5. Delete from upstream_round_payments
        DELETE FROM public.upstream_round_payments
        WHERE round_id = p_round_id
          AND (dealer_id = v_caller_id OR v_is_admin);
        GET DIAGNOSTICS v_urp_deleted = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'round_history_deleted', v_rh_deleted,
        'user_round_history_deleted', v_urh_deleted,
        'lottery_rounds_deleted', v_lr_deleted,
        'member_payments_deleted', v_mrp_deleted,
        'upstream_payments_deleted', v_urp_deleted
    );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_dealer_round_history(UUID, UUID) TO authenticated;
