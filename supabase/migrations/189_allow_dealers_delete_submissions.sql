-- Migration: 189_allow_dealers_delete_submissions.sql
-- Description: Allow dealers and admins to delete submissions from their rounds, and create secure RPC function for permanent deletion

-- 1. Drop existing policy if exists and create dealers_delete_submissions
DROP POLICY IF EXISTS "dealers_delete_submissions" ON public.submissions;

CREATE POLICY "dealers_delete_submissions" ON public.submissions
    FOR DELETE TO authenticated
    USING (
        -- Dealer owns the round that the submission belongs to
        round_id IN (
            SELECT id FROM public.lottery_rounds WHERE dealer_id = auth.uid()
        )
        OR
        -- Admin or SuperAdmin
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- 2. Create secure RPC function to delete submissions permanently
CREATE OR REPLACE FUNCTION delete_submissions_permanently(p_submission_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_deleted_count INT := 0;
    v_is_admin BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Return early if empty array
    IF p_submission_ids IS NULL OR array_length(p_submission_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'deleted_count', 0
        );
    END IF;

    -- Check if caller is admin or superadmin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role IN ('admin', 'superadmin')
    ) INTO v_is_admin;

    -- Delete authorized submissions:
    -- Caller must be:
    -- 1) The dealer who owns the round of the submission
    -- 2) The owner of the submission (user_id)
    -- 3) Admin/superadmin
    WITH authorized_subs AS (
        SELECT s.id
        FROM public.submissions s
        LEFT JOIN public.lottery_rounds lr ON lr.id = s.round_id
        WHERE s.id = ANY(p_submission_ids)
        AND (
            v_is_admin
            OR s.user_id = v_caller_id
            OR lr.dealer_id = v_caller_id
        )
    ),
    deleted AS (
        DELETE FROM public.submissions
        WHERE id IN (SELECT id FROM authorized_subs)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_submissions_permanently(UUID[]) TO authenticated;
