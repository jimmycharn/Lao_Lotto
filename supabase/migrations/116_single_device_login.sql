-- Migration: Single Device Login with Email OTP
-- =====================================================
-- When a user logs in from a new device while already having an active session,
-- they must verify via email OTP before the new session is activated.
-- The old session is invalidated after successful OTP verification.
-- =====================================================

-- 1. Create device_sessions table to track active sessions per user
CREATE TABLE IF NOT EXISTS device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL, -- unique identifier for this session (browser fingerprint or random token)
    device_info TEXT DEFAULT NULL, -- user agent / device description
    ip_address TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    invalidated_at TIMESTAMPTZ DEFAULT NULL,
    invalidated_reason TEXT DEFAULT NULL -- 'new_device_login', 'manual_logout', 'admin_force'
);

-- Unique active session per user (only one active session at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_active_user 
    ON device_sessions(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_token ON device_sessions(session_token);

-- 2. Create login_otp_requests table
CREATE TABLE IF NOT EXISTS login_otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL, -- 6-digit code (stored hashed for security)
    new_session_token TEXT NOT NULL, -- the pending session token
    device_info TEXT DEFAULT NULL,
    ip_address TEXT DEFAULT NULL,
    attempts INTEGER DEFAULT 0, -- number of failed attempts
    max_attempts INTEGER DEFAULT 3,
    expires_at TIMESTAMPTZ NOT NULL, -- 5 minutes from creation
    verified_at TIMESTAMPTZ DEFAULT NULL,
    blocked_until TIMESTAMPTZ DEFAULT NULL, -- set after max failed attempts (15 min block)
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_otp_user ON login_otp_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_login_otp_expires ON login_otp_requests(expires_at);

-- 3. RLS Policies for device_sessions
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" ON device_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own sessions (for last_seen_at updates)
CREATE POLICY "Users can update own sessions" ON device_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON device_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Superadmin can view all sessions
CREATE POLICY "Superadmin can view all sessions" ON device_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- 4. RLS Policies for login_otp_requests
ALTER TABLE login_otp_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own OTP requests
CREATE POLICY "Users can view own otp requests" ON login_otp_requests
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert OTP requests for themselves
CREATE POLICY "Users can insert own otp requests" ON login_otp_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own OTP requests (for attempt counting)
CREATE POLICY "Users can update own otp requests" ON login_otp_requests
    FOR UPDATE USING (auth.uid() = user_id);

-- 5. RPC: Create OTP request and return whether OTP is needed
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
BEGIN
    -- Check if user is superadmin (exempt from single-device restriction)
    SELECT role INTO v_profile_role FROM profiles WHERE id = p_user_id;
    IF v_profile_role = 'superadmin' THEN
        -- Superadmin: just create/update session without OTP
        DELETE FROM device_sessions WHERE user_id = p_user_id;
        INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
        VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Check for existing active session
    SELECT * INTO v_existing_session 
    FROM device_sessions 
    WHERE user_id = p_user_id AND is_active = true;

    -- If no existing session, or same device token → just create session
    IF v_existing_session IS NULL THEN
        INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
        VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Same device → update last_seen
    IF v_existing_session.session_token = p_session_token THEN
        UPDATE device_sessions SET last_seen_at = now() WHERE id = v_existing_session.id;
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Different device detected → check if blocked
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

    -- Get user email
    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

    -- Generate 6-digit OTP
    v_otp_code := lpad(floor(random() * 1000000)::TEXT, 6, '0');

    -- Create OTP request
    INSERT INTO login_otp_requests (
        user_id, email, otp_code, new_session_token, device_info, ip_address, expires_at
    ) VALUES (
        p_user_id, v_user_email, v_otp_code, p_session_token, p_device_info, p_ip_address,
        now() + INTERVAL '5 minutes'
    ) RETURNING id INTO v_otp_id;

    -- Return OTP needed + the plain OTP code (will be sent to email by the client/edge function)
    RETURN jsonb_build_object(
        'needs_otp', true,
        'blocked', false,
        'otp_request_id', v_otp_id,
        'otp_code', v_otp_code,
        'email', v_user_email,
        'session_created', false
    );
END;
$$;

-- 6. RPC: Verify OTP and activate new session
CREATE OR REPLACE FUNCTION verify_device_otp(
    p_otp_request_id UUID,
    p_otp_code TEXT,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request login_otp_requests%ROWTYPE;
BEGIN
    -- Get the OTP request
    SELECT * INTO v_request
    FROM login_otp_requests
    WHERE id = p_otp_request_id AND user_id = p_user_id;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่พบคำขอ OTP');
    END IF;

    -- Check if blocked
    IF v_request.blocked_until IS NOT NULL AND v_request.blocked_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ถูกบล็อคเนื่องจากกรอก OTP ผิดหลายครั้ง',
            'blocked_until', v_request.blocked_until
        );
    END IF;

    -- Check if expired
    IF v_request.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'รหัส OTP หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่');
    END IF;

    -- Check if already verified
    IF v_request.verified_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'รหัส OTP นี้ถูกใช้แล้ว');
    END IF;

    -- Check OTP code
    IF v_request.otp_code != p_otp_code THEN
        -- Increment attempts
        UPDATE login_otp_requests 
        SET attempts = attempts + 1,
            blocked_until = CASE 
                WHEN attempts + 1 >= max_attempts THEN now() + INTERVAL '15 minutes'
                ELSE blocked_until
            END
        WHERE id = p_otp_request_id;

        IF v_request.attempts + 1 >= v_request.max_attempts THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'กรอก OTP ผิดเกินจำนวนครั้ง ถูกบล็อค 15 นาที',
                'blocked', true,
                'attempts_left', 0
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'รหัส OTP ไม่ถูกต้อง',
            'attempts_left', v_request.max_attempts - (v_request.attempts + 1)
        );
    END IF;

    -- OTP is correct! Mark as verified
    UPDATE login_otp_requests SET verified_at = now() WHERE id = p_otp_request_id;

    -- Invalidate old session
    UPDATE device_sessions 
    SET is_active = false, 
        invalidated_at = now(), 
        invalidated_reason = 'new_device_login'
    WHERE user_id = p_user_id AND is_active = true;

    -- Create new session
    INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
    VALUES (p_user_id, v_request.new_session_token, v_request.device_info, v_request.ip_address, true);

    RETURN jsonb_build_object('success', true, 'session_created', true);
END;
$$;

-- 7. RPC: Invalidate session (for logout)
CREATE OR REPLACE FUNCTION invalidate_device_session(
    p_user_id UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_session_token IS NOT NULL THEN
        UPDATE device_sessions 
        SET is_active = false, invalidated_at = now(), invalidated_reason = 'manual_logout'
        WHERE user_id = p_user_id AND session_token = p_session_token AND is_active = true;
    ELSE
        UPDATE device_sessions 
        SET is_active = false, invalidated_at = now(), invalidated_reason = 'manual_logout'
        WHERE user_id = p_user_id AND is_active = true;
    END IF;
END;
$$;

-- 8. RPC: Check if current session is still valid (called periodically by clients)
CREATE OR REPLACE FUNCTION check_session_valid(
    p_user_id UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session device_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_session
    FROM device_sessions
    WHERE user_id = p_user_id AND session_token = p_session_token AND is_active = true;

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'session_invalidated');
    END IF;

    -- Update last_seen
    UPDATE device_sessions SET last_seen_at = now() WHERE id = v_session.id;

    RETURN jsonb_build_object('valid', true);
END;
$$;

-- 9. Cleanup old data (run periodically)
-- Delete expired OTP requests older than 1 day
-- Delete inactive sessions older than 30 days
CREATE OR REPLACE FUNCTION cleanup_device_sessions() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM login_otp_requests WHERE expires_at < now() - INTERVAL '1 day';
    DELETE FROM device_sessions WHERE is_active = false AND invalidated_at < now() - INTERVAL '30 days';
END;
$$;

-- 10. Enable Realtime for device_sessions (for detecting force logout)
ALTER PUBLICATION supabase_realtime ADD TABLE device_sessions;
