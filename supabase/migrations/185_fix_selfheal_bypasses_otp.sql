-- Migration: Stop the session self-heal from bypassing the OTP challenge
-- =====================================================
-- Regression introduced by 184_fix_false_device_kickout.sql
-- ---------------------------------------------------------
-- 184 taught check_session_valid() to self-heal: when NO device holds an active
-- session it recreates the row for the calling device instead of falsely
-- reporting "logged in from another device".
--
-- The self-heal only proved that the caller holds a valid Supabase JWT. It never
-- checked whether that device had been challenged for an email OTP and failed to
-- answer it — and Login.jsx deliberately keeps the user authenticated while the
-- OTP modal is open ("DO NOT sign out - keep user authenticated so modal stays
-- visible"). That opened this hole:
--
--   1. Device A is logged in and holds the active session.
--   2. Device B signs in. check_and_create_device_session() correctly returns
--      needs_otp = true and creates NO session row for B. B keeps its JWT.
--   3. B never enters the code — it just reloads the page. AuthContext's
--      handleSession() calls check_session_valid() on every mount.
--   4. A logs out / its row is cleaned up, so no active session exists.
--   5. Self-heal fires and hands B the active session. B never entered the OTP.
--
-- From then on B owns an active row, so the next login from B takes the
-- "reuse this device's own active session" fast path and is never asked for OTP
-- again, while A gets kicked with 'new_device_login' on its next check. That is
-- exactly the reported symptom: no OTP prompt, the old device drops out, and the
-- overlay only appears after a refresh.
--
-- Fix
-- ---
-- A device with an unverified OTP request for its own session token has been
-- challenged and has not passed. It must never self-heal; it has to go back
-- through login. Expiry is deliberately NOT part of the condition — letting the
-- request lapse must not become a way to skip the challenge.
--
-- Recovering is still correct and automatic: signing in again while no other
-- device is active makes check_and_create_device_session() create the row
-- directly (no OTP request is issued), after which check_session_valid() takes
-- the happy path and never reaches the self-heal.
--
-- Everything 184 set out to fix still works — a device that was never challenged
-- (row lost to a failed insert, a cleanup, or a unique-index race) still heals.
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
    v_pending_otp login_otp_requests%ROWTYPE;
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

    -- This device was challenged for an OTP and never answered it. Self-healing
    -- here would let it claim the session without ever entering the code, so it
    -- must go back through login instead.
    SELECT * INTO v_pending_otp
    FROM login_otp_requests
    WHERE user_id = p_user_id
      AND new_session_token = p_session_token
      AND verified_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_otp.id IS NOT NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'otp_required');
    END IF;

    -- Self-heal: the row is merely missing (never created, or cleaned up) and
    -- this device was never challenged. The caller already holds a valid
    -- Supabase JWT, so re-register it instead of falsely reporting a login from
    -- another device.
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

-- Close the hole for devices that already slipped through: any active session
-- whose token still has an unverified OTP request was never OTP-verified.
-- Those devices are asked to sign in again (one time).
UPDATE device_sessions ds
SET is_active = false,
    invalidated_at = now(),
    invalidated_reason = 'otp_required'
WHERE ds.is_active = true
  AND EXISTS (
      SELECT 1
      FROM login_otp_requests o
      WHERE o.user_id = ds.user_id
        AND o.new_session_token = ds.session_token
        AND o.verified_at IS NULL
  );
