-- Migration 264: Add LINE Key-in Assistants, per-group auto-register toggle, and submitter UID tracking
-- ==============================================================================
-- 1. Create public.member_line_assistants (Many LINE UIDs -> 1 primary member account per dealer)
-- 2. Add public.line_groups.disable_auto_register BOOLEAN DEFAULT false
-- 3. Add public.submissions.submitted_by_line_user_id TEXT for own-bill cancellation checks
-- 4. Create atomic RPC public.bind_member_line_assistant with safe auto-cleanup of empty auto-created accounts
-- ==============================================================================

-- 1. Create member_line_assistants table
CREATE TABLE IF NOT EXISTS public.member_line_assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    line_user_id TEXT NOT NULL,
    assistant_name TEXT,
    can_view_summary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT member_line_assistants_dealer_line_uid_unique UNIQUE (dealer_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_line_assistants_dealer_profile
    ON public.member_line_assistants (dealer_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_member_line_assistants_active_uid
    ON public.member_line_assistants (dealer_id, line_user_id)
    WHERE is_active = true;

ALTER TABLE public.member_line_assistants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can manage their member line assistants" ON public.member_line_assistants;
CREATE POLICY "Dealers can manage their member line assistants"
    ON public.member_line_assistants
    FOR ALL
    USING (dealer_id = auth.uid())
    WITH CHECK (dealer_id = auth.uid());

DROP POLICY IF EXISTS "Superadmins have full access to member line assistants" ON public.member_line_assistants;
CREATE POLICY "Superadmins have full access to member line assistants"
    ON public.member_line_assistants
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('superadmin', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('superadmin', 'admin')
        )
    );

DROP POLICY IF EXISTS "Members can view their own line assistants" ON public.member_line_assistants;
CREATE POLICY "Members can view their own line assistants"
    ON public.member_line_assistants
    FOR SELECT
    USING (profile_id = auth.uid());

-- 2. Add disable_auto_register toggle to line_groups
ALTER TABLE public.line_groups
    ADD COLUMN IF NOT EXISTS disable_auto_register BOOLEAN NOT NULL DEFAULT false;

-- 3. Add submitted_by_line_user_id to submissions (tracks actual LINE UID who keyed the bill)
ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS submitted_by_line_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_bill_submitted_by
    ON public.submissions (bill_id, submitted_by_line_user_id)
    WHERE bill_id IS NOT NULL;

-- 4. Atomic RPC to bind a LINE User ID as a key-in assistant to a primary member account
CREATE OR REPLACE FUNCTION public.bind_member_line_assistant(
    p_dealer_id UUID,
    p_profile_id UUID,
    p_line_user_id TEXT,
    p_assistant_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_jwt_role TEXT := current_setting('request.jwt.claim.role', true);
    v_is_authorized BOOLEAN := false;
    v_clean_uid TEXT := NULLIF(TRIM(p_line_user_id), '');
    v_clean_name TEXT := NULLIF(TRIM(p_assistant_name), '');
    v_primary RECORD;
    v_has_membership BOOLEAN := false;
    v_other RECORD;
    v_sub_cnt INTEGER := 0;
    v_hist_cnt INTEGER := 0;
    v_pay_cnt INTEGER := 0;
    v_other_dealer_cnt INTEGER := 0;
    v_default_name TEXT;
    v_cleaned_up BOOLEAN := false;
    v_cleaned_up_name TEXT := NULL;
    v_cleaned_up_code TEXT := NULL;
    v_result_row public.member_line_assistants%ROWTYPE;
BEGIN
    -- Authorization: service_role, postgres, dealer owner, or superadmin/admin
    IF v_jwt_role = 'service_role' OR current_user = 'postgres' THEN
        v_is_authorized := true;
    ELSIF v_caller_uid IS NOT NULL THEN
        IF v_caller_uid = p_dealer_id THEN
            v_is_authorized := true;
        ELSIF EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller_uid AND role IN ('superadmin', 'admin')
        ) THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'UNAUTHORIZED',
            'message', 'ไม่มีสิทธิ์ดำเนินการผูกผู้ช่วยคีย์'
        );
    END IF;

    IF v_clean_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_UID',
            'message', 'กรุณาระบุ LINE User ID ที่ถูกต้อง'
        );
    END IF;

    -- Validate primary profile
    SELECT id, full_name, member_code, line_user_id
    INTO v_primary
    FROM public.profiles
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'MEMBER_NOT_FOUND',
            'message', 'ไม่พบบัญชีสมาชิกหลักที่ระบุ'
        );
    END IF;

    IF p_profile_id <> p_dealer_id THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_dealer_memberships
            WHERE user_id = p_profile_id
              AND dealer_id = p_dealer_id
              AND status = 'active'
        ) INTO v_has_membership;

        IF NOT v_has_membership THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'MEMBER_NOT_IN_DEALER',
                'message', 'บัญชีสมาชิกหลักนี้ไม่ได้เป็นสมาชิกที่ใช้งานอยู่ของเจ้ามือนี้'
            );
        END IF;
    END IF;

    -- Prevent binding primary owner's own LINE UID as an assistant of themselves
    IF v_primary.line_user_id IS NOT NULL AND v_primary.line_user_id = v_clean_uid THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ALREADY_PRIMARY_UID',
            'message', 'LINE UID นี้เป็นบัญชีหลักของสมาชิกคนนี้อยู่แล้ว'
        );
    END IF;

    v_default_name := v_clean_name;

    -- Check if this LINE UID is currently attached to another profile in profiles.line_user_id
    SELECT id, full_name, email, member_code
    INTO v_other
    FROM public.profiles
    WHERE line_user_id = v_clean_uid
      AND id <> p_profile_id
    LIMIT 1;

    IF FOUND THEN
        -- Check whether v_other is a member of THIS dealer
        IF EXISTS (
            SELECT 1 FROM public.user_dealer_memberships
            WHERE user_id = v_other.id AND dealer_id = p_dealer_id
        ) THEN
            SELECT COUNT(*) INTO v_sub_cnt
            FROM public.submissions s
            JOIN public.lottery_rounds lr ON lr.id = s.round_id
            WHERE s.user_id = v_other.id AND lr.dealer_id = p_dealer_id;

            SELECT COUNT(*) INTO v_hist_cnt
            FROM public.user_round_history urh
            JOIN public.lottery_rounds lr ON lr.id = urh.round_id
            WHERE urh.user_id = v_other.id AND lr.dealer_id = p_dealer_id;

            SELECT COUNT(*) INTO v_pay_cnt
            FROM public.member_round_payments
            WHERE user_id = v_other.id AND dealer_id = p_dealer_id;

            -- Safe Auto-Cleanup ONLY if auto-created LINE dummy account AND zero transactions/history under this dealer
            IF COALESCE(v_other.email, '') ~* '^line_.*@(biglotto\.app|gmail\.com)$'
               AND v_sub_cnt = 0 AND v_hist_cnt = 0 AND v_pay_cnt = 0 THEN

                IF v_default_name IS NULL THEN
                    v_default_name := v_other.full_name;
                END IF;

                -- Remove empty membership from this dealer
                DELETE FROM public.user_dealer_memberships
                WHERE user_id = v_other.id AND dealer_id = p_dealer_id;

                -- Only clear profiles.line_user_id if they have no memberships with any other dealer
                SELECT COUNT(*) INTO v_other_dealer_cnt
                FROM public.user_dealer_memberships
                WHERE user_id = v_other.id;

                IF v_other_dealer_cnt = 0 THEN
                    UPDATE public.profiles
                    SET line_user_id = NULL, updated_at = now()
                    WHERE id = v_other.id;
                END IF;

                v_cleaned_up := true;
                v_cleaned_up_name := v_other.full_name;
                v_cleaned_up_code := v_other.member_code;
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'UID_IN_USE_WITH_HISTORY',
                    'conflict_name', v_other.full_name,
                    'conflict_code', v_other.member_code,
                    'has_history', (v_sub_cnt + v_hist_cnt + v_pay_cnt) > 0,
                    'message', format(
                        'LINE UID นี้ถูกผูกกับบัญชี %s (%s) อยู่แล้วและมีประวัติหรือเป็นบัญชีหลัก กรุณาล้างค่าหรือตรวจสอบก่อนดำเนินการ',
                        COALESCE(v_other.full_name, 'ไม่ระบุชื่อ'),
                        COALESCE(v_other.member_code, '-')
                    )
                );
            END IF;
        ELSE
            -- User exists as a member of a different dealer only; keep their primary profile intact
            IF v_default_name IS NULL THEN
                v_default_name := v_other.full_name;
            END IF;
        END IF;
    END IF;

    -- Fallback default assistant_name from line_group_members if still empty
    IF v_default_name IS NULL THEN
        SELECT lgm.display_name
        INTO v_default_name
        FROM public.line_group_members lgm
        JOIN public.line_groups lg ON lg.line_group_id = lgm.line_group_id
        WHERE lg.dealer_id = p_dealer_id
          AND lgm.line_user_id = v_clean_uid
        ORDER BY lgm.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    -- Upsert assistant mapping (default can_view_summary = false; preserve flag only if staying on same profile)
    INSERT INTO public.member_line_assistants (
        dealer_id,
        profile_id,
        line_user_id,
        assistant_name,
        can_view_summary,
        is_active,
        updated_at
    ) VALUES (
        p_dealer_id,
        p_profile_id,
        v_clean_uid,
        COALESCE(v_default_name, 'ผู้ช่วยคีย์'),
        false,
        true,
        now()
    )
    ON CONFLICT (dealer_id, line_user_id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        assistant_name = COALESCE(v_clean_name, EXCLUDED.assistant_name, member_line_assistants.assistant_name),
        can_view_summary = CASE
            WHEN member_line_assistants.profile_id = EXCLUDED.profile_id THEN member_line_assistants.can_view_summary
            ELSE false
        END,
        is_active = true,
        updated_at = now()
    RETURNING * INTO v_result_row;

    RETURN jsonb_build_object(
        'success', true,
        'assistant', to_jsonb(v_result_row),
        'primary_name', v_primary.full_name,
        'primary_code', v_primary.member_code,
        'cleaned_up', v_cleaned_up,
        'cleaned_up_name', v_cleaned_up_name,
        'cleaned_up_code', v_cleaned_up_code
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bind_member_line_assistant(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
