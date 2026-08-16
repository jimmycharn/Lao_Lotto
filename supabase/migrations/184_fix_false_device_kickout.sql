-- Migration: Fix false "logged in from another device" kick-outs
-- =====================================================
-- Problem
-- -------
-- check_session_valid() returned { valid: false, reason: 'session_invalidated' }
-- whenever it could not find an ACTIVE row for (user_id, session_token).
-- It never verified that another device actually holds the active session.
--
-- So any situation where this device's row is simply MISSING produced a
-- false "มีการเข้าสู่ระบบจากอุปกรณ์อื่น" overlay, e.g.:
--   * check_and_create_device_session() failed at login (the client swallows
--     the error and lets the user in, so no row is ever created)
--   * the row was removed by cleanup_device_sessions()
--   * a unique-index race during concurrent logins aborted the INSERT
--
-- Fix
-- ---
-- 1. check_session_valid() now distinguishes the two cases:
--      - another device owns the active session  -> reason 'new_device_login'
--      - nobody owns an active session           -> self-heal (recreate row)
--    A device that was explicitly kicked ('new_device_login') is never allowed
--    to self-heal, so single-device enforcement is preserved.
-- 2. Superadmin is exempt (matches check_and_create_device_session).
-- 3. Both functions use `IS NOT NULL` on the primary key instead of the
--    `record IS NULL` idiom, and tolerate unique-index races.
-- =====================================================

CREATE OR REPLACE FUNCTION check_session_valid(
    p_user_id UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session device_sessions%ROWTYPE;
    v_other device_sessions%ROWTYPE;
    v_last device_sessions%ROWTYPE;
    v_profile_role TEXT;
BEGIN
    -- Superadmin is exempt from single-device enforcement
    SELECT role INTO v_profile_role FROM profiles WHERE id = p_user_id;
    IF v_profile_role = 'superadmin' THEN
        RETURN jsonb_build_object('valid', true, 'exempt', true);
    END IF;

    -- Happy path: this device owns an active session
    SELECT * INTO v_session
    FROM device_sessions
    WHERE user_id = p_user_id
      AND session_token = p_session_token
      AND is_active = true
    LIMIT 1;

    IF v_session.id IS NOT NULL THEN
        UPDATE device_sessions SET last_seen_at = now() WHERE id = v_session.id;
        RETURN jsonb_build_object('valid', true);
    END IF;

    -- Does another device genuinely hold the active session?
    SELECT * INTO v_other
    FROM device_sessions
    WHERE user_id = p_user_id
      AND is_active = true
      AND session_token <> p_session_token
    ORDER BY last_seen_at DESC
    LIMIT 1;

    IF v_other.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'new_device_login',
            'other_device', v_other.device_info
        );
    END IF;

    -- Nobody holds an active session. Was THIS device explicitly kicked out
    -- earlier? If so it must stay invalid (security: no silent comeback).
    SELECT * INTO v_last
    FROM device_sessions
    WHERE user_id = p_user_id
      AND session_token = p_session_token
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last.id IS NOT NULL AND v_last.invalidated_reason = 'new_device_login' THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'new_device_login');
    END IF;

    IF v_last.id IS NOT NULL AND v_last.invalidated_reason = 'admin_force' THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'admin_force');
    END IF;

    -- Self-heal: the row is merely missing (never created, or cleaned up).
    -- The caller already holds a valid Supabase JWT, so re-register this device
    -- instead of falsely reporting a login from another device.
    BEGIN
        INSERT INTO device_sessions (user_id, session_token, device_info, is_active)
        VALUES (
            p_user_id,
            p_session_token,
            COALESCE(v_last.device_info, 'recovered'),
            true
        );
    EXCEPTION WHEN unique_violation THEN
        -- Another device won the race in between: treat as a real kick-out
        RETURN jsonb_build_object('valid', false, 'reason', 'new_device_login');
    END;

    RETURN jsonb_build_object('valid', true, 'recovered', true);
END;
$$;

-- Harden session creation against unique-index races on concurrent logins.
CREATE OR REPLACE FUNCTION check_and_create_device_session(
    p_user_id UUID,
    p_session_token TEXT,
    p_device_info TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_session device_sessions%ROWTYPE;
    v_otp_code TEXT;
    v_otp_id UUID;
    v_user_email TEXT;
    v_blocked_until TIMESTAMPTZ;
    v_profile_role TEXT;
    v_email_result JSONB;
BEGIN
    -- Superadmin is exempt from the single-device restriction
    SELECT role INTO v_profile_role FROM profiles WHERE id = p_user_id;
    IF v_profile_role = 'superadmin' THEN
        DELETE FROM device_sessions WHERE user_id = p_user_id;
        INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
        VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Reuse this device's own active session if it already exists
    SELECT * INTO v_existing_session
    FROM device_sessions
    WHERE user_id = p_user_id
      AND session_token = p_session_token
      AND is_active = true
    LIMIT 1;

    IF v_existing_session.id IS NOT NULL THEN
        UPDATE device_sessions SET last_seen_at = now() WHERE id = v_existing_session.id;
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Is another device holding the active session?
    SELECT * INTO v_existing_session
    FROM device_sessions
    WHERE user_id = p_user_id
      AND is_active = true
      AND session_token <> p_session_token
    ORDER BY last_seen_at DESC
    LIMIT 1;

    IF v_existing_session.id IS NULL THEN
        -- No active session anywhere → claim it for this device
        BEGIN
            INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
            VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        EXCEPTION WHEN unique_violation THEN
            -- Concurrent login won the race; fall through to OTP below
            SELECT * INTO v_existing_session
            FROM device_sessions
            WHERE user_id = p_user_id AND is_active = true
            LIMIT 1;
        END;

        IF v_existing_session.id IS NULL THEN
            RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
        END IF;
    END IF;

    -- Different device detected → check OTP block window
    SELECT blocked_until INTO v_blocked_until
    FROM login_otp_requests
    WHERE user_id = p_user_id AND blocked_until > now()
    ORDER BY created_at DESC LIMIT 1;

    IF v_blocked_until IS NOT NULL THEN
        RETURN jsonb_build_object(
            'needs_otp', true,
            'blocked', true,
            'blocked_until', v_blocked_until,
            'session_created', false
        );
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

    v_otp_code := lpad(floor(random() * 1000000)::TEXT, 6, '0');

    INSERT INTO login_otp_requests (
        user_id, email, otp_code, new_session_token, device_info, ip_address, expires_at
    ) VALUES (
        p_user_id, v_user_email, v_otp_code, p_session_token, p_device_info, p_ip_address,
        now() + INTERVAL '5 minutes'
    ) RETURNING id INTO v_otp_id;

    BEGIN
        v_email_result := send_otp_email_pg_net(v_user_email, v_otp_code, p_device_info);
    EXCEPTION WHEN OTHERS THEN
        v_email_result := jsonb_build_object('email_sent', false, 'error', SQLERRM);
    END;

    RETURN jsonb_build_object(
        'needs_otp', true,
        'blocked', false,
        'otp_request_id', v_otp_id,
        'otp_code', v_otp_code,
        'email', v_user_email,
        'session_created', false,
        'email_sent', COALESCE((v_email_result->>'email_sent')::boolean, false)
    );
END;
$$;
