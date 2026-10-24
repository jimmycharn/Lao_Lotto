# Design Specification: Multi-Device Login Configuration for Super Admin

- **Date:** 2026-10-24
- **Author:** Antigravity & User
- **Status:** Approved

---

## 1. Executive Summary

Currently, the Big Lotto system enforces a strict single-device login policy for accounts (except for `superadmin` role). When a user attempts to log in from a secondary device (Device B) while an active session exists on Device A:
1. Device B is presented with a 6-digit OTP verification screen, and an OTP email is sent.
2. Device A is presented with a real-time modal with **[อนุญาต]** (Approve) and **[ปฏิเสธ]** (Reject) buttons.
3. If approved, Device A's session is invalidated with `invalidated_reason = 'new_device_login'`, immediately kicking Device A out of the app.

This design introduces an account-level setting (`allow_multi_device_login`) configurable by Super Admin on the Admin page (`/admin` -> "จัดการสมาชิก"). When enabled for a member or dealer:
- The user can log in simultaneously across multiple devices (phones, computers, tablets) without being challenged by OTP/approval dialogs.
- Active sessions on existing devices remain undisturbed and are not kicked out.
- When disabled (default), the account continues to use the existing single-device security model.

---

## 2. User Experience & UI Design

### 2.1 Table View in `src/pages/Admin.jsx` (Manage Members Tab)

In the member list table (`Admin.jsx` -> `activeTab === 'users'`), the "จัดการ" (Actions) column will be updated:
- A new action button is placed immediately before the Edit button (`FiEdit2`), exactly in the position indicated by the user's screenshot.
- **When `allow_multi_device_login === true`**:
  - Class: `action-btn multi-device active`
  - Icon: `<FiLayers />`
  - Visuals: Emerald/green background tint and border (`#10b981`).
  - Tooltip: `อนุญาต Login หลายเครื่อง (คลิกเพื่อเปลี่ยนเป็น Login ทีละเครื่อง)`
- **When `allow_multi_device_login === false` (Default)**:
  - Class: `action-btn multi-device single`
  - Icon: `<FiSmartphone />`
  - Visuals: Neutral slate button (`#94a3b8`).
  - Tooltip: `จำกัด Login ทีละเครื่อง (คลิกเพื่ออนุญาต Login หลายเครื่อง)`
- **Click Behavior**:
  - Invokes `confirmDialog`:
    - If turning ON: *"ต้องการอนุญาตให้คุณ [ชื่อ] เข้าสู่ระบบได้หลายเครื่องพร้อมกันหรือไม่? (จะไม่ต้องยืนยัน OTP เมื่อเข้าเครื่องใหม่)"*
    - If turning OFF: *"ต้องการจำกัดให้คุณ [ชื่อ] เข้าสู่ระบบได้ทีละเครื่องหรือไม่? (จะต้องยืนยัน OTP หรืออนุมัติจากเครื่องเดิมเมื่อเข้าเครื่องใหม่)"*
  - On confirm, executes `supabase.from('profiles').update({ allow_multi_device_login: nextValue }).eq('id', user.id)`.
  - Displays a toast notification and refreshes user list.
- **Table Row Badge**:
  - If `user.allow_multi_device_login === true`, renders a subtle status badge next to the name: `📱 หลายเครื่อง` (`rgba(16, 185, 129, 0.15)` background, `#34d399` text) for quick recognition.

### 2.2 Edit Member Modal in `src/components/admin/EditMemberModal.jsx`

Inside `EditMemberModal.jsx`, add a dedicated form group for session device permissions:
- **Label**: `<FiSmartphone /> การเข้าสู่ระบบ (อุปกรณ์)`
- **Component**: Select dropdown or toggle buttons:
  - Option 1 (Default): `📱 เข้าสู่ระบบได้ทีละเครื่อง (Single Device) - มีระบบ OTP / ยืนยันเครื่องเดิม` (`false`)
  - Option 2: `💻 เข้าสู่ระบบได้หลายเครื่องพร้อมกัน (Multi-Device) - สามารถเข้าใช้งานได้หลายเครื่องพร้อมกันโดยไม่เตะเครื่องเดิม` (`true`)
- Form submission passes `new_allow_multi_device_login: allowMultiDeviceLogin` to `update_user_by_superadmin` RPC.

---

## 3. Database Schema & Migration (`260_allow_multi_device_login_setting.sql`)

### 3.1 Column in `public.profiles`
```sql
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allow_multi_device_login BOOLEAN NOT NULL DEFAULT FALSE;
```

### 3.2 Index Refactoring in `public.device_sessions`
Previously, migration 116 defined:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_active_user 
    ON device_sessions(user_id) WHERE is_active = true;
```
This hard unique constraint prohibited any user from having more than 1 active session in `device_sessions`.
We drop this constraint and replace it with a composite unique index on `(user_id, session_token)`:
```sql
DROP INDEX IF EXISTS idx_device_sessions_active_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_active_user_token
    ON device_sessions(user_id, session_token) WHERE is_active = true;
```

### 3.3 Function `check_and_create_device_session`
Update the RPC:
- Inspect `v_allow_multi_device := COALESCE(profiles.allow_multi_device_login, false)`.
- If `v_profile_role = 'superadmin' OR v_allow_multi_device = true`:
  - Check if this `session_token` is already active for this `user_id`. If so, update `last_seen_at = now()`.
  - If not active, delete/deactivate any old rows for this `session_token` and insert a new active session row.
  - Crucially: **Do NOT touch other devices' active sessions**.
  - Return `{ needs_otp: false, session_created: true, multi_device: true }`.
- Else (single device):
  - Retain existing logic (reusing own token, detecting other device, checking block window, creating `login_otp_requests`, sending email via `pg_net`).

### 3.4 Function `check_session_valid`
Update the periodic and on-refresh validity check:
- If `v_profile_role = 'superadmin'`: Return `valid: true, exempt: true`.
- If this device owns an active session (`session_token = p_session_token AND is_active = true`), touch `last_seen_at = now()` and return `valid: true`.
- If `v_allow_multi_device = true`:
  - If explicitly invalidated by `admin_force`, return `valid: false, reason: 'admin_force'`.
  - Otherwise, self-heal by inserting an active session for this device token and return `valid: true, multi_device: true`.
  - Never query `v_other` or return `new_device_login`.
- Else (single device):
  - Retain existing logic (checks `v_other`, checks prior kickout, etc.).

### 3.5 Function `update_user_by_superadmin`
Add parameter `new_allow_multi_device_login BOOLEAN DEFAULT NULL` and update `profiles.allow_multi_device_login = COALESCE(new_allow_multi_device_login, allow_multi_device_login)`.

---

## 4. Frontend Client Context (`src/contexts/AuthContext.jsx`)

In `AuthContext.jsx`:
- When `profile?.allow_multi_device_login === true`:
  - Skip subscribing to incoming login verification requests (`subscribeToLoginRequests`) and pending approval checks (`getPendingLoginRequest`), because multi-device logins are pre-authorized and will not produce OTP requests.
  - Device session invalidation listener (`subscribeToSessionChanges`) and periodic validity check (`startSessionCheck`) remain active to respond to manual logouts and admin account freezes, but will not fire when other devices log in.

---

## 5. Verification & Testing Plan

1. **Unit Tests**:
   - `src/utils/deviceSession.test.js`: Add tests for multi-device login bypass behavior and session checking.
   - `src/components/admin/__tests__/EditMemberModal.test.js`: Verify modal state initialization and payload handling for `allow_multi_device_login`.
2. **Database Push**:
   - Apply `260_allow_multi_device_login_setting.sql` via Supabase CLI.
3. **Full Regression Suite**:
   - Run `npx vitest run` across all test files.
   - Run `npm run build` to verify production assets compile cleanly.
4. **End-to-End Functional Verification**:
   - Test toggle from Table View and verify database reflects change.
   - Test toggle from Edit Member Modal and verify persistence.
   - Verify accounts with `allow_multi_device_login = false` still require OTP and trigger approval on the other device.
   - Verify accounts with `allow_multi_device_login = true` log in smoothly on two devices simultaneously without kicking out.
