-- Migration 188: Multi-Device Login Protection with Device Approval & Email 6-Digit PIN
-- ======================================================================================
-- 1. Adds status, responded_by, responded_at to login_otp_requests
-- 2. Enables Realtime for login_otp_requests
-- 3. Provides approve_login_request and reject_login_request RPCs for Device A
-- 4. Updates verify_device_otp to handle approved/rejected states
-- 5. Provides get_pending_login_request RPC for Device A
-- 6. Refines email template and check_and_create_device_session
-- ======================================================================================

-- 1. Add status columns to login_otp_requests
ALTER TABLE login_otp_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE login_otp_requests ADD COLUMN IF NOT EXISTS responded_by TEXT DEFAULT NULL;
ALTER TABLE login_otp_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Enable Realtime for login_otp_requests so Device A and Device B can sync instantly
ALTER TABLE login_otp_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'login_otp_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE login_otp_requests;
    END IF;
END $$;

-- 3. Function to send OTP email via Resend API using pg_net with clear multi-device instructions
CREATE OR REPLACE FUNCTION send_otp_email_pg_net(
    p_to_email TEXT,
    p_otp_code TEXT,
    p_device_info TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_api_key TEXT;
    v_from_email TEXT;
    v_app_name TEXT;
    v_subject TEXT;
    v_html TEXT;
    v_device_text TEXT;
    v_request_id BIGINT;
BEGIN
    -- Get settings
    SELECT value INTO v_api_key FROM app_settings WHERE key = 'resend_api_key';
    SELECT value INTO v_from_email FROM app_settings WHERE key = 'otp_from_email';
    SELECT value INTO v_app_name FROM app_settings WHERE key = 'app_name';

    -- Default values
    v_from_email := COALESCE(NULLIF(v_from_email, ''), 'noreply@biglotto.app');
    v_app_name := COALESCE(NULLIF(v_app_name, ''), 'Big Lotto');

    -- If no API key configured, skip sending but return gracefully
    IF v_api_key IS NULL OR v_api_key = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RESEND_API_KEY not configured in app_settings',
            'email_sent', false
        );
    END IF;

    IF p_device_info IS NOT NULL AND p_device_info != '' THEN
        v_device_text := '<div style="background:#f0f4ff;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#334155;">📱 <strong>อุปกรณ์ที่กำลังพยายามเข้าสู่ระบบ:</strong> ' || p_device_info || '</div>';
    ELSE
        v_device_text := '';
    END IF;

    v_subject := '[' || v_app_name || '] รหัส PIN ยืนยันการเข้าสู่ระบบ: ' || p_otp_code;

    v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        || 'body{font-family:''Segoe UI'',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;margin:0;padding:20px}'
        || '.container{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}'
        || '.header{text-align:center;margin-bottom:24px}'
        || '.header h1{color:#1a1a2e;font-size:24px;margin:0}'
        || '.otp-box{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:12px;padding:24px;text-align:center;margin:24px 0}'
        || '.otp-code{font-size:36px;font-weight:700;color:#fff;letter-spacing:8px;margin:0}'
        || '.info{color:#475569;font-size:14px;line-height:1.6}'
        || '.highlight{background:#e0f2fe;border-left:4px solid #0284c7;padding:12px;border-radius:4px;margin:16px 0;font-size:13px;color:#0369a1;}'
        || '.warning{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:16px;font-size:13px;color:#856404}'
        || '.footer{text-align:center;margin-top:24px;color:#999;font-size:12px}'
        || '</style></head><body><div class="container">'
        || '<div class="header"><h1>🔐 ' || v_app_name || '</h1>'
        || '<p style="color:#666;">รหัส PIN ยืนยันการเข้าสู่ระบบจากอุปกรณ์ใหม่</p></div>'
        || '<p class="info">ตรวจพบการพยายามเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์อื่น หากเป็นคุณ กรุณายืนยันการเข้าสู่ระบบด้วยวิธีใดวิธีหนึ่งดังนี้:</p>'
        || v_device_text
        || '<div class="highlight">'
        || '👉 <strong>วิธีที่ 1:</strong> หากหน้าจออุปกรณ์เดิมยังเปิดอยู่ คุณสามารถกดปุ่ม <strong>[อนุญาต]</strong> ที่หน้าจออุปกรณ์นั้นได้ทันทีโดยไม่ต้องใช้รหัส PIN นี้'
        || '</div>'
        || '<p class="info"><strong>วิธีที่ 2:</strong> หากไม่ได้อยู่อุปกรณ์เดิม ให้นำรหัส PIN 6 หลักด้านล่างนี้ไปกรอกที่หน้าจออุปกรณ์ใหม่:</p>'
        || '<div class="otp-box"><p class="otp-code">' || p_otp_code || '</p></div>'
        || '<p class="info">⏰ รหัสนี้จะหมดอายุใน <strong>5 นาที</strong><br>🔒 สามารถกรอกผิดได้สูงสุด <strong>3 ครั้ง</strong></p>'
        || '<div class="warning">⚠️ หากคุณไม่ได้เป็นผู้เข้าสู่ระบบ กรุณากด <strong>[ปฏิเสธ]</strong> บนอุปกรณ์เดิม หรือเปลี่ยนรหัสผ่านทันที</div>'
        || '<div class="footer"><p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบรักษาความปลอดภัย กรุณาอย่าตอบกลับ</p></div>'
        || '</div></body></html>';

    -- Send via pg_net to Resend API
    SELECT net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_api_key,
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
            'from', v_from_email,
            'to', p_to_email,
            'subject', v_subject,
            'html', v_html
        )
    ) INTO v_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'email_sent', true,
        'request_id', v_request_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'email_sent', false
    );
END;
$$;

-- 4. Update check_and_create_device_session to store status and return device info
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
        'otp_code', v_otp_code,
        'email', v_user_email,
        'device_info', p_device_info,
        'session_created', false,
        'email_sent', COALESCE((v_email_result->>'email_sent')::boolean, false)
    );
END;
$$;

-- 5. RPC: Approve login request (called by Device A)
CREATE OR REPLACE FUNCTION approve_login_request(
    p_request_id UUID,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request login_otp_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_request
    FROM login_otp_requests
    WHERE id = p_request_id AND user_id = p_user_id;

    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่พบคำขอเข้าสู่ระบบ');
    END IF;

    IF v_request.status = 'rejected' THEN
        RETURN jsonb_build_object('success', false, 'error', 'คำขอนี้ถูกปฏิเสธไปแล้ว');
    END IF;

    IF v_request.status = 'approved' THEN
        RETURN jsonb_build_object('success', true, 'already_approved', true);
    END IF;

    IF v_request.expires_at < now() THEN
        UPDATE login_otp_requests SET status = 'expired' WHERE id = p_request_id;
        RETURN jsonb_build_object('success', false, 'error', 'คำขอเข้าสู่ระบบหมดอายุแล้ว');
    END IF;

    -- Mark request as approved
    UPDATE login_otp_requests
    SET status = 'approved',
        verified_at = now(),
        responded_by = 'device_approval',
        responded_at = now()
    WHERE id = p_request_id;

    -- Invalidate existing active session(s) (Device A)
    UPDATE device_sessions
    SET is_active = false,
        invalidated_at = now(),
        invalidated_reason = 'new_device_login'
    WHERE user_id = p_user_id AND is_active = true;

    -- Activate new session for Device B
    INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
    VALUES (p_user_id, v_request.new_session_token, v_request.device_info, v_request.ip_address, true);

    RETURN jsonb_build_object('success', true, 'session_created', true);
END;
$$;

-- 6. RPC: Reject login request (called by Device A)
CREATE OR REPLACE FUNCTION reject_login_request(
    p_request_id UUID,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request login_otp_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_request
    FROM login_otp_requests
    WHERE id = p_request_id AND user_id = p_user_id;

    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่พบคำขอเข้าสู่ระบบ');
    END IF;

    IF v_request.status = 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'คำขอนี้ได้รับการอนุมัติไปแล้ว');
    END IF;

    -- Mark request as rejected
    UPDATE login_otp_requests
    SET status = 'rejected',
        responded_by = 'device_rejection',
        responded_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'rejected', true);
END;
$$;

-- 7. RPC: Verify OTP / PIN 6-digits (called by Device B)
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

    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ไม่พบคำขอ OTP');
    END IF;

    -- Check if rejected by Device A
    IF v_request.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'การเข้าสู่ระบบนี้ถูกปฏิเสธโดยอุปกรณ์เดิมแล้ว',
            'rejected', true
        );
    END IF;

    -- Check if already approved (e.g. by Device A's allow button)
    IF v_request.status = 'approved' OR v_request.verified_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'already_approved', true);
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
        UPDATE login_otp_requests SET status = 'expired' WHERE id = p_otp_request_id;
        RETURN jsonb_build_object('success', false, 'error', 'รหัส OTP หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่');
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

    -- OTP is correct! Mark as verified and approved
    UPDATE login_otp_requests
    SET verified_at = now(),
        status = 'approved',
        responded_by = 'pin_verification',
        responded_at = now()
    WHERE id = p_otp_request_id;

    -- Invalidate old session
    UPDATE device_sessions 
    SET is_active = false, 
        invalidated_at = now(), 
        invalidated_reason = 'new_device_login'
    WHERE user_id = p_user_id AND is_active = true;

    -- Create new session for Device B
    INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
    VALUES (p_user_id, v_request.new_session_token, v_request.device_info, v_request.ip_address, true);

    RETURN jsonb_build_object('success', true, 'session_created', true);
END;
$$;

-- 8. RPC: Get pending login request (called by Device A on load or reconnect)
CREATE OR REPLACE FUNCTION get_pending_login_request(
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request login_otp_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_request
    FROM login_otp_requests
    WHERE user_id = p_user_id
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('has_pending', false);
    END IF;

    RETURN jsonb_build_object(
        'has_pending', true,
        'request_id', v_request.id,
        'device_info', v_request.device_info,
        'email', v_request.email,
        'created_at', v_request.created_at,
        'expires_at', v_request.expires_at
    );
END;
$$;
