# Design Specification: SuperAdmin Member Profile Editing (including Email and Password)

- **Date**: 2026-09-07
- **Feature**: Edit Member Profile, Email, and Password for SuperAdmin
- **Status**: Approved

## 1. Problem Statement & Goals
SuperAdmin users currently can view member lists in Table View and Tree View, change roles directly in the table, block/unblock members, and delete members.
However, there is no way for SuperAdmin to edit a member's profile details, bank details, or critical credentials (email and password).
Members sometimes contact the SuperAdmin requesting changes to their email or forgotten passwords when they cannot access their original email inbox. SuperAdmin needs a dedicated, secure modal window to modify any member's profile and credentials across all role levels (`superadmin`, `dealer`, `user`).

### Goals:
1. Provide an "Edit" button (`<FiEdit2 />`) on every member row in Table View and every node in Tree View.
2. Open an `EditMemberModal` with comprehensive fields:
   - Credentials: Email (with duplicate check), New Password (optional, with visibility toggle and random generator).
   - Profile: Full Name, Phone, Role (`user`, `dealer`, `superadmin`), Active/Blocked status.
   - Bank details: Bank Name, Account Number, Account Name.
3. Provide a secure PostgreSQL RPC function `update_user_by_superadmin` (`SECURITY DEFINER`):
   - Validates caller is a superadmin.
   - Atomically updates `auth.users` (email, encrypted_password, email_confirmed_at, raw_user_meta_data).
   - Atomically updates `auth.identities` (email, identity_data).
   - Atomically updates `public.profiles` (full_name, phone, email, role, bank details, is_active).
4. Provide immediate feedback via Toast notifications and refresh the member list.

## 2. Architecture & Implementation Design

### 2.1 Backend: PostgreSQL RPC Function
**Migration File**: `supabase/migrations/191_superadmin_update_user_function.sql`

```sql
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
  -- 1. Verify caller is superadmin
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

    IF v_clean_email != LOWER(v_current_email) THEN
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
```

### 2.2 Frontend Component: `EditMemberModal.jsx` & `EditMemberModal.css`
- **Location**: `src/components/admin/EditMemberModal.jsx`
- **Props**:
  - `isOpen` (boolean)
  - `user` (selected user profile object)
  - `onClose` (function)
  - `onUpdated` (callback after successful update to refresh user list)
- **Features**:
  - Password generator helper (generates an 8-character random alphanumeric password and copies it to clipboard).
  - Show/Hide password toggle (`FiEye` / `FiEyeOff`).
  - Pre-fills all existing user profile attributes.
  - Bank selector dropdown with standard Thai banks list (KBANK, SCB, BBL, KTB, TTB, GSB, BAY, PromptPay, etc.).
  - Validation: Email format, password min-length 6, required name/email.
  - Submitting state with loading spinner and disabled buttons.

### 2.3 Integration in `Admin.jsx` & `MemberTreeView.jsx`
- **In `src/pages/Admin.jsx`**:
  - Add state `editingUser` and `showEditModal`.
  - Add `handleEditUser(user)` function that sets `editingUser` and opens the modal.
  - In Table View: Add `<button className="action-btn edit" title="แก้ไขข้อมูลสมาชิก" onClick={() => handleEditUser(user)}><FiEdit2 /></button>` in the "จัดการ" column.
  - Pass `onEditUser={handleEditUser}` prop to `<MemberTreeView />`.
  - Mount `<EditMemberModal />` inside the Admin page.
- **In `src/components/admin/MemberTreeView.jsx`**:
  - Receive `onEditUser` prop.
  - Add edit action button `<button className="tree-action-icon-btn edit" title="แก้ไขข้อมูลสมาชิก" onClick={() => onEditUser(node)}><FiEdit2 /></button>` for both parent nodes and child member nodes.

## 3. Verification & Testing Plan
1. **Migration Test**: Apply migration via `cmd /c npx supabase db push`.
2. **Unit Test**: Test validation logic and password generation logic in a test file.
3. **Build Test**: Run `cmd /c npm run build` to ensure no syntax/import errors.
4. **End-to-End Verification**:
   - Open SuperAdmin -> แอดมิน -> จัดการสมาชิก.
   - Verify Edit button appears in Table View and Tree View for all member roles.
   - Open modal for a member, edit name/phone/bank and save -> verify data persists.
   - Edit email and password -> verify user can authenticate with the new email/password.
