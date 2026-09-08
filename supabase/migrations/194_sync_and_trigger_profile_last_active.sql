-- Migration: 194_sync_and_trigger_profile_last_active.sql
-- Description: Backfill and automatically track last active timestamp (from web login, device sessions, line-bot submissions, line group activity) into profiles.last_login_at

-- 1. Backfill profiles.last_login_at from submissions, device_sessions, line_group_members, and auth.users
UPDATE public.profiles p
SET last_login_at = GREATEST(
    p.last_login_at,
    (SELECT MAX(created_at) FROM public.submissions WHERE user_id = p.id),
    (SELECT MAX(COALESCE(last_seen_at, created_at)) FROM public.device_sessions WHERE user_id = p.id),
    (SELECT MAX(COALESCE(updated_at, created_at)) FROM public.line_group_members WHERE user_id = p.id OR (p.line_user_id IS NOT NULL AND line_user_id = p.line_user_id)),
    (SELECT last_sign_in_at FROM auth.users WHERE id = p.id)
)
WHERE EXISTS (
    SELECT 1 WHERE GREATEST(
        p.last_login_at,
        (SELECT MAX(created_at) FROM public.submissions WHERE user_id = p.id),
        (SELECT MAX(COALESCE(last_seen_at, created_at)) FROM public.device_sessions WHERE user_id = p.id),
        (SELECT MAX(COALESCE(updated_at, created_at)) FROM public.line_group_members WHERE user_id = p.id OR (p.line_user_id IS NOT NULL AND line_user_id = p.line_user_id)),
        (SELECT last_sign_in_at FROM auth.users WHERE id = p.id)
    ) IS NOT NULL
);

-- 2. Trigger on public.submissions (tracks lottery submissions from Web and Line Bot)
CREATE OR REPLACE FUNCTION public.trg_update_profile_last_active_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET last_login_at = GREATEST(COALESCE(last_login_at, NEW.created_at), NEW.created_at)
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_update_last_active ON public.submissions;
CREATE TRIGGER trg_submissions_update_last_active
AFTER INSERT ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_profile_last_active_on_submission();

-- 3. Trigger on public.device_sessions (tracks web login & active sessions)
CREATE OR REPLACE FUNCTION public.trg_update_profile_last_active_on_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_time TIMESTAMPTZ;
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        v_time := COALESCE(NEW.last_seen_at, NEW.created_at, now());
        UPDATE public.profiles
        SET last_login_at = GREATEST(COALESCE(last_login_at, v_time), v_time)
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_device_sessions_update_last_active ON public.device_sessions;
CREATE TRIGGER trg_device_sessions_update_last_active
AFTER INSERT OR UPDATE OF last_seen_at ON public.device_sessions
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_profile_last_active_on_session();

-- 4. Trigger on public.line_group_members (tracks captured Line group activity)
CREATE OR REPLACE FUNCTION public.trg_update_profile_last_active_on_line_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_time TIMESTAMPTZ;
BEGIN
    v_time := COALESCE(NEW.updated_at, NEW.created_at, now());
    IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET last_login_at = GREATEST(COALESCE(last_login_at, v_time), v_time)
        WHERE id = NEW.user_id;
    ELSIF NEW.line_user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET last_login_at = GREATEST(COALESCE(last_login_at, v_time), v_time)
        WHERE line_user_id = NEW.line_user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_line_group_members_update_last_active ON public.line_group_members;
CREATE TRIGGER trg_line_group_members_update_last_active
AFTER INSERT OR UPDATE OF updated_at ON public.line_group_members
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_profile_last_active_on_line_member();

-- 5. RPC function to manually or periodically resync all profiles' last active timestamp
CREATE OR REPLACE FUNCTION public.sync_all_profiles_last_active()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_count INT := 0;
BEGIN
    UPDATE public.profiles p
    SET last_login_at = GREATEST(
        p.last_login_at,
        (SELECT MAX(created_at) FROM public.submissions WHERE user_id = p.id),
        (SELECT MAX(COALESCE(last_seen_at, created_at)) FROM public.device_sessions WHERE user_id = p.id),
        (SELECT MAX(COALESCE(updated_at, created_at)) FROM public.line_group_members WHERE user_id = p.id OR (p.line_user_id IS NOT NULL AND line_user_id = p.line_user_id)),
        (SELECT last_sign_in_at FROM auth.users WHERE id = p.id)
    )
    WHERE EXISTS (
        SELECT 1 WHERE GREATEST(
            p.last_login_at,
            (SELECT MAX(created_at) FROM public.submissions WHERE user_id = p.id),
            (SELECT MAX(COALESCE(last_seen_at, created_at)) FROM public.device_sessions WHERE user_id = p.id),
            (SELECT MAX(COALESCE(updated_at, created_at)) FROM public.line_group_members WHERE user_id = p.id OR (p.line_user_id IS NOT NULL AND line_user_id = p.line_user_id)),
            (SELECT last_sign_in_at FROM auth.users WHERE id = p.id)
        ) IS NOT NULL
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'updated_rows', v_count);
END;
$$;
