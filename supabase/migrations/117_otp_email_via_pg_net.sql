-- Migration: Send OTP email via pg_net (no Edge Function needed)
-- =====================================================
-- Uses pg_net extension (built-in on Supabase) to call Resend API directly from PostgreSQL.
-- Store RESEND_API_KEY in Supabase Vault or as a config setting.
-- Until API key is configured, OTP will still be generated and can be verified,
-- but email won't actually be sent (client shows OTP hint for testing).
-- =====================================================

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a settings table for OTP email config (if not exists)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings (won't overwrite if already exist)
INSERT INTO app_settings (key, value, description) VALUES 
    ('resend_api_key', '', 'Resend API key for sending OTP emails'),
    ('otp_from_email', 'noreply@biglotto.app', 'Sender email address for OTP'),
    ('app_name', 'Big Lotto', 'Application name shown in OTP emails')
ON CONFLICT (key) DO NOTHING;

-- RLS for app_settings: only superadmin can read/write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin can manage app_settings" ON app_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Function to send OTP email via Resend API using pg_net
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

    -- If no API key configured, skip sending but return success with note
    IF v_api_key IS NULL OR v_api_key = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RESEND_API_KEY not configured in app_settings',
            'email_sent', false
        );
    END IF;

    -- Build device info text
    IF p_device_info IS NOT NULL AND p_device_info != '' THEN
        v_device_text := '<p style="color: #666; font-size: 13px;">อุปกรณ์ที่พยายามเข้าสู่ระบบ: ' || p_device_info || '</p>';
    ELSE
        v_device_text := '';
    END IF;

    v_subject := '[' || v_app_name || '] รหัสยืนยัน OTP: ' || p_otp_code;

    v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        || 'body{font-family:''Segoe UI'',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;margin:0;padding:20px}'
        || '.container{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}'
        || '.header{text-align:center;margin-bottom:24px}'
        || '.header h1{color:#1a1a2e;font-size:24px;margin:0}'
        || '.otp-box{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:12px;padding:24px;text-align:center;margin:24px 0}'
        || '.otp-code{font-size:36px;font-weight:700;color:#fff;letter-spacing:8px;margin:0}'
        || '.info{color:#555;font-size:14px;line-height:1.6}'
        || '.warning{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:16px;font-size:13px;color:#856404}'
        || '.footer{text-align:center;margin-top:24px;color:#999;font-size:12px}'
        || '</style></head><body><div class="container">'
        || '<div class="header"><h1>🔐 ' || v_app_name || '</h1>'
        || '<p style="color:#666;">รหัสยืนยันการเข้าสู่ระบบ</p></div>'
        || '<p class="info">มีการพยายามเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์ใหม่ กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยัน:</p>'
        || '<div class="otp-box"><p class="otp-code">' || p_otp_code || '</p></div>'
        || '<p class="info">⏰ รหัสนี้จะหมดอายุใน <strong>5 นาที</strong><br>🔒 สามารถกรอกผิดได้สูงสุด <strong>3 ครั้ง</strong></p>'
        || v_device_text
        || '<div class="warning">⚠️ หากคุณไม่ได้เป็นคนเข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที</div>'
        || '<div class="footer"><p>อีเมลนี้ถูกส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ</p></div>'
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
    -- If pg_net fails, don't block the OTP flow
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'email_sent', false
    );
END;
$$;

-- Update check_and_create_device_session to automatically send email
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
    -- Check if user is superadmin (exempt from single-device restriction)
    SELECT role INTO v_profile_role FROM profiles WHERE id = p_user_id;
    IF v_profile_role = 'superadmin' THEN
        DELETE FROM device_sessions WHERE user_id = p_user_id;
        INSERT INTO device_sessions (user_id, session_token, device_info, ip_address, is_active)
        VALUES (p_user_id, p_session_token, p_device_info, p_ip_address, true);
        RETURN jsonb_build_object('needs_otp', false, 'session_created', true);
    END IF;

    -- Check for existing active session
    SELECT * INTO v_existing_session 
    FROM device_sessions 
    WHERE user_id = p_user_id AND is_active = true;

    -- If no existing session → just create session
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

    -- Try to send OTP email via pg_net (non-blocking, won't fail the function)
    BEGIN
        v_email_result := send_otp_email_pg_net(v_user_email, v_otp_code, p_device_info);
    EXCEPTION WHEN OTHERS THEN
        v_email_result := jsonb_build_object('email_sent', false, 'error', SQLERRM);
    END;

    -- Return result (always include otp_code for client-side fallback display during testing)
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
