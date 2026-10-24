-- Migration 260: Multi-Device Login Configuration for Super Admin
-- ==============================================================================
-- 1. Adds allow_multi_device_login column to profiles (default false)
-- 2. Refactors device_sessions unique index from (user_id) to (user_id, session_token)
-- 3. Updates check_and_create_device_session to bypass OTP for multi-device users
-- 4. Updates check_session_valid to prevent kickouts for multi-device users
-- 5. Updates update_user_by_superadmin RPC to allow updating allow_multi_device_login
-- ==============================================================================

-- 1. Add allow_multi_device_login to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allow_multi_device_login BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Refactor unique index on device_sessions so a user can hold multiple active sessions across distinct tokens
DROP INDEX IF EXISTS idx_device_sessions_active_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_active_user_token 
    ON public.device_sessions(user_id, session_token) WHERE is_active = true;

-- 3. Update check_and_create_device_session
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
    v_allow_multi_device BOOLEAN;
    v_email_result JSONB;
BEGIN
    -- Check role and multi-device permission
    SELECT role, COALESCE(allow_multi_device_login, false)
    INTO v_profile_role, v_allow_multi_device
    FROM profiles WHERE id = p_user_id;

    -- Superadmin OR user with allow_multi_device_login enabled:
    IF v_profile_role = 'superadmin' OR v_allow_multi_device = true THEN
        -- Check if this specific device token already has an active session
        SELECT * INTO v_existing_session
        FROM device_sessions
        WHERE user_id = p_user_id
          AND session_token = p_session_token
          AND is_active = true
        LIMIT 1;

        IF v_existing_session.id IS NOT NULL THEN
            UPDATE device_sessions SET last_seen_at = now() WHERE id = v_existing_session.id;
        ELSE
            -- Clean up any prior inactive rows for this device token to avoid duplicate clutter
            DELETE FROM device_sessions 
            WHERE user_id = p_user_id AND session_token = p_session_token;

            -- Create active session for this device (leaving all other active devices completely untouched!)
            INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
            VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        END IF;

        RETURN jsonb_build_object(
            'needs_otp', false,
            'session_created', true,
            'multi_device', true
        );
    END IF;

    -- =========================================================================
    -- Single-Device Mode (Default / allow_multi_device_login = false)
    -- =========================================================================

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

    -- Different device detected in single-device mode → check OTP block window
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

    -- Insert request with status 'pending'
    INSERT INTO login_otp_requests (
        user_id, email, otp_code, new_session_token, device_info, ip_address, status, expires_at
    ) VALUES (
        p_user_id, v_user_email, v_otp_code, p_session_token, p_device_info, p_ip_address, 'pending',
        now() + INTERVAL '5 minutes'
    ) RETURNING id INTO v_otp_id;

    -- Try to send OTP email via pg_net
    BEGIN
        v_email_result := send_otp_email_pg_net(v_user_email, v_otp_code, p_device_info);
    EXCEPTION WHEN OTHERS THEN
        v_email_result := jsonb_build_object('email_sent', false, 'error', SQLERRM);
    END;

    RETURN jsonb_build_object(
        'needs_otp', true,
        'blocked', false,
        'otp_request_id', v_otp_id,
        'email', v_user_email,
        'device_info', p_device_info,
        'session_created', false,
        'email_sent', COALESCE((v_email_result->>'email_sent')::boolean, false)
    );
END;
$$;

-- 4. Update check_session_valid
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
    v_allow_multi_device BOOLEAN;
BEGIN
    SELECT role, COALESCE(allow_multi_device_login, false)
    INTO v_profile_role, v_allow_multi_device
    FROM profiles WHERE id = p_user_id;

    -- Superadmin is exempt from single-device enforcement
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

    -- =========================================================================
    -- Multi-Device User Handling
    -- =========================================================================
    IF v_allow_multi_device = true THEN
        -- Check if THIS device was explicitly kicked by admin force logout
        SELECT * INTO v_last
        FROM device_sessions
        WHERE user_id = p_user_id
          AND session_token = p_session_token
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_last.id IS NOT NULL AND v_last.invalidated_reason = 'admin_force' THEN
            RETURN jsonb_build_object('valid', false, 'reason', 'admin_force');
        END IF;

        -- Self-heal: the row is merely missing (cleaned up or new tab).
        -- Never kick multi-device users out because of other devices.
        BEGIN
            INSERT INTO device_sessions (user_id, session_token, device_info, is_active)
            VALUES (p_user_id, p_session_token, 'Self-healed session (multi-device)', true);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object('valid', true, 'multi_device', true);
    END IF;

    -- =========================================================================
    -- Single-Device User Handling (Default)
    -- =========================================================================

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

    -- Nobody holds an active session. Was THIS device explicitly kicked out earlier?
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

    -- Self-heal: row missing for single device user
    BEGIN
        INSERT INTO device_sessions (user_id, session_token, device_info, is_active)
        VALUES (
            p_user_id,
            p_session_token,
            COALESCE(v_last.device_info, 'Self-healed session'),
            true
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object('valid', true, 'self_healed', true);
END;
$$;

-- 5. Update update_user_by_superadmin RPC to accept new_allow_multi_device_login
CREATE OR REPLACE FUNCTION update_user_by_superadmin(
    target_user_id UUID,
    new_full_name TEXT DEFAULT NULL,
    new_phone TEXT DEFAULT NULL,
    new_email TEXT DEFAULT NULL,
    new_password TEXT DEFAULT NULL,
    new_role TEXT DEFAULT NULL,
    new_bank_name TEXT DEFAULT NULL,
    new_bank_account_name TEXT DEFAULT NULL,
    new_bank_account_number TEXT DEFAULT NULL,
    new_is_active BOOLEAN DEFAULT NULL,
    new_allow_multi_device_login BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_current_email TEXT;
  v_clean_email TEXT;
BEGIN
  -- 1. Verify calling user is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only superadmins can update members';
  END IF;

  -- 2. Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 3. Handle Email Update if provided
  IF new_email IS NOT NULL AND TRIM(new_email) != '' THEN
    v_clean_email := LOWER(TRIM(new_email));
    SELECT email INTO v_current_email FROM auth.users WHERE id = target_user_id;

    IF v_clean_email != LOWER(COALESCE(v_current_email, '')) THEN
      -- Check duplicate email in auth.users
      IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_clean_email AND id != target_user_id) THEN
        RAISE EXCEPTION 'อีเมลนี้ถูกใช้งานแล้วในระบบ โปรดใช้อีเมลอื่น';
      END IF;

      -- Update auth.users
      UPDATE auth.users
      SET
        email = v_clean_email,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = jsonb_set(
          COALESCE(raw_user_meta_data, '{}'::jsonb),
          '{email}',
          to_jsonb(v_clean_email)
        ),
        updated_at = NOW()
      WHERE id = target_user_id;

      -- Update auth.identities
      UPDATE auth.identities
      SET
        identity_data = jsonb_set(
          jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_clean_email)),
          '{email_verified}',
          'true'::jsonb
        ),
        email = v_clean_email,
        updated_at = NOW()
      WHERE user_id = target_user_id;
    END IF;
  END IF;

  -- 4. Handle Password Update if provided
  IF new_password IS NOT NULL AND TRIM(new_password) != '' THEN
    IF LENGTH(TRIM(new_password)) < 6 THEN
      RAISE EXCEPTION 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
    END IF;

    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(TRIM(new_password), extensions.gen_salt('bf')),
      updated_at = NOW()
    WHERE id = target_user_id;
  END IF;

  -- 5. Update public.profiles
  UPDATE public.profiles
  SET
    full_name = COALESCE(new_full_name, full_name),
    phone = COALESCE(new_phone, phone),
    email = COALESCE(v_clean_email, email),
    role = COALESCE(new_role, role),
    bank_name = COALESCE(new_bank_name, bank_name),
    bank_account_name = COALESCE(new_bank_account_name, bank_account_name),
    bank_account_number = COALESCE(new_bank_account_number, bank_account_number),
    is_active = COALESCE(new_is_active, is_active),
    allow_multi_device_login = COALESCE(new_allow_multi_device_login, allow_multi_device_login),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Member updated successfully');
END;
$$;
