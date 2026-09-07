-- Migration: 191_superadmin_update_user_function.sql
-- Description: Create update_user_by_superadmin RPC function with SECURITY DEFINER to allow superadmins to update any user profile, email, and password

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
    new_is_active BOOLEAN DEFAULT NULL
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
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Member updated successfully');
END;
$$;
