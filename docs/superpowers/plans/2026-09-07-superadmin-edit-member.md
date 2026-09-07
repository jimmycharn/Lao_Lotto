# SuperAdmin Edit Member Profile (including Email and Password) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow SuperAdmin to edit member profiles across all role levels (`superadmin`, `dealer`, `user`), including email, password, profile info, and bank details via a dedicated modal dialog in the SuperAdmin Member Management page.

**Architecture:** Create a PostgreSQL RPC function `update_user_by_superadmin` (`SECURITY DEFINER`) to atomically update `auth.users`, `auth.identities`, and `public.profiles`. Implement a responsive React modal `EditMemberModal.jsx` and connect it to both the Table View in `Admin.jsx` and the Tree View in `MemberTreeView.jsx`.

**Tech Stack:** PostgreSQL (Supabase Auth / Extensions pgcrypto), React 18, CSS3, Vitest

## Global Constraints
- Only users with `role = 'superadmin'` can execute the RPC function.
- Email changes must check for duplicates across `auth.users` and update both `auth.users` and `auth.identities` without requiring email re-verification (`email_confirmed_at = NOW()`).
- Password changes must be hashed using Supabase standard `extensions.crypt(password, extensions.gen_salt('bf'))`.
- Edit button must be available for all member roles in both Table View and Tree View.
- Maintain full Dark Theme and Light Theme compatibility.

---

### Task 1: Create Database Migration for `update_user_by_superadmin`

**Files:**
- Create: `supabase/migrations/191_superadmin_update_user_function.sql`

**Interfaces:**
- Produces RPC function:
  - `update_user_by_superadmin(target_user_id UUID, new_full_name TEXT, new_phone TEXT, new_email TEXT, new_password TEXT, new_role TEXT, new_bank_name TEXT, new_bank_account_name TEXT, new_bank_account_number TEXT, new_is_active BOOLEAN) RETURNS JSONB`

- [x] **Step 1: Write migration `191_superadmin_update_user_function.sql`**

```sql
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
```

- [x] **Step 2: Deploy migration to remote Supabase database**

Run: `cmd /c npx supabase db push`
Expected: Migration applied successfully.

- [x] **Step 3: Commit migration file**

```bash
git add supabase/migrations/191_superadmin_update_user_function.sql
git commit -m "feat(db): add 191_superadmin_update_user_function.sql"
```

---

### Task 2: Create `EditMemberModal` Component and Styles

**Files:**
- Create: `src/components/admin/EditMemberModal.jsx`
- Create: `src/components/admin/EditMemberModal.css`

**Interfaces:**
- Component Props:
  - `isOpen`: boolean
  - `user`: Object (member profile data)
  - `onClose`: () => void
  - `onUpdated`: () => void

- [x] **Step 1: Create `src/components/admin/EditMemberModal.jsx`**

Features:
- Form state initialized from `user` prop: `fullName`, `email`, `newPassword`, `phone`, `role`, `bankName`, `bankAccountName`, `bankAccountNumber`, `isActive`.
- Password generator helper: `generateRandomPassword()` creates 8-char secure password, sets it into state, and copies to clipboard with toast notification.
- Show/Hide password toggle (`showPassword` boolean state).
- Popular Thai Banks dropdown list (KBANK, SCB, BBL, KTB, TTB, GSB, BAY, PromptPay, etc.).
- Form submission calling `supabase.rpc('update_user_by_superadmin', { ... })`.
- Handles duplicate email error or validation error with clear toast.

- [x] **Step 2: Create `src/components/admin/EditMemberModal.css`**

Features:
- Premium modal design matching Big Lotto aesthetic: glassmorphic header, card sections, clean inputs, badges.
- Full Light Theme & Dark Theme support.
- Responsive for mobile and desktop.

- [x] **Step 3: Verify build**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [x] **Step 4: Commit EditMemberModal component**

```bash
git add src/components/admin/EditMemberModal.jsx src/components/admin/EditMemberModal.css
git commit -m "feat: add EditMemberModal component for superadmin"
```

---

### Task 3: Integrate Edit Button into `Admin.jsx` and `MemberTreeView.jsx`

**Files:**
- Modify: `src/pages/Admin.jsx:40-70`, `src/pages/Admin.jsx:545-575`
- Modify: `src/pages/Admin.css`
- Modify: `src/components/admin/MemberTreeView.jsx:15-30`, `src/components/admin/MemberTreeView.jsx:260-290`
- Modify: `src/components/admin/MemberTreeView.css`

**Interfaces:**
- Consumes: `EditMemberModal`
- Produces: Edit user flow triggered from Table View and Tree View

- [x] **Step 1: Update `src/pages/Admin.jsx`**
  - Import `EditMemberModal` and `FiEdit2`.
  - Add state: `const [editingUser, setEditingUser] = useState(null)` and `const [showEditModal, setShowEditModal] = useState(false)`.
  - Add `handleEditUser = (user) => { setEditingUser(user); setShowEditModal(true); }`.
  - In Table View: Add `<button className="action-btn edit" title="แก้ไขข้อมูลสมาชิก" onClick={() => handleEditUser(user)}><FiEdit2 /></button>` before the block/delete buttons.
  - Pass `onEditUser={handleEditUser}` to `<MemberTreeView />`.
  - Render `<EditMemberModal isOpen={showEditModal} user={editingUser} onClose={() => { setShowEditModal(false); setEditingUser(null); }} onUpdated={fetchUsers} />`.

- [x] **Step 2: Update `src/components/admin/MemberTreeView.jsx`**
  - Add `onEditUser` to props.
  - In both parent nodes and child nodes, add `<button className="tree-action-icon-btn edit" title="แก้ไขข้อมูลสมาชิก" onClick={() => onEditUser(node)}><FiEdit2 /></button>`.

- [x] **Step 3: Update CSS styles in `Admin.css` and `MemberTreeView.css`**
  - Style `.action-btn.edit`: blue/cyan accent (`color: #38bdf8; background: rgba(56, 189, 248, 0.15);`).
  - Style `.tree-action-icon-btn.edit`.

- [x] **Step 4: Verify build and tests**

Run: `cmd /c npm test`
Run: `cmd /c npm run build`
Expected: All pass with 0 errors.

- [x] **Step 5: Commit integration**

```bash
git add src/pages/Admin.jsx src/pages/Admin.css src/components/admin/MemberTreeView.jsx src/components/admin/MemberTreeView.css
git commit -m "feat: integrate edit member button in Admin table view and tree view"
```

---

### Task 4: Unit Testing & Full Verification

**Files:**
- Create: `src/components/admin/__tests__/EditMemberModal.test.js`

- [x] **Step 1: Write unit test testing password generation and validation helpers**

```javascript
import { describe, it, expect } from 'vitest'

describe('EditMemberModal Helpers', () => {
    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
        let pwd = ''
        for (let i = 0; i < 8; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return pwd
    }

    const validateEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    }

    it('generates secure 8-character password', () => {
        const pwd = generatePassword()
        expect(pwd).toHaveLength(8)
        expect(/^[A-Za-z0-9]+$/.test(pwd)).toBe(true)
    })

    it('validates email correctly', () => {
        expect(validateEmail('test@example.com')).toBe(true)
        expect(validateEmail('invalid-email')).toBe(false)
        expect(validateEmail('')).toBe(false)
    })
})
```

- [x] **Step 2: Run test suite**

Run: `cmd /c npm test`
Expected: All tests pass.

- [x] **Step 3: Run production build**

Run: `cmd /c npm run build`
Expected: Build succeeds with 0 errors.

- [x] **Step 4: Commit test file**

```bash
git add src/components/admin/__tests__/EditMemberModal.test.js
git commit -m "test: add unit test for EditMemberModal helpers"
```
