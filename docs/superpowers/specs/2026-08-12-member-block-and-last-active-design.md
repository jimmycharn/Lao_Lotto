# Member Block, Delete & Last Active Specification

## Summary
Enhance the Superadmin Member Management section to track users' last active timestamp (`last_login_at`), provide inline Block/Unblock and Delete action buttons, and enforce account suspension upon login with clear user notification.

## Detailed Features

### 1. Database Schema
- Add `last_login_at TIMESTAMPTZ DEFAULT NULL` column to `public.profiles` table (migration `182_add_last_login_at_to_profiles.sql`).

### 2. Last Login Tracking
- Update `profiles.last_login_at = NOW()` whenever a user logs in via `signIn` or when restoring an active session in `AuthContext.jsx`.

### 3. Block Enforcement on Login
- When `profiles.is_active === false`:
  - Login fails immediately with error message: `"บัญชีนี้ถูกระงับการใช้งาน (โดนบล็อก) กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้"`.
  - In `AuthContext.jsx` and `ForceLogoutOverlay.jsx`: Handle `ACCOUNT_BLOCKED` force logout reason and display overlay message asking user to contact Admin.

### 4. Admin Management UI (`Admin.jsx` & `MemberTreeView.jsx`)
- **Table View**:
  - Add column **"ใช้งานล่าสุด" (Last Active)** displaying formatted date/time (e.g. `12/8/2569 10:35` or `-`).
  - Add action buttons:
    - ⛔ **Block / 🔓 Unblock**: Toggles `is_active` status with confirmation dialog.
    - 🗑️ **Delete**: Removes user profile with confirmation dialog.
  - Display `🔴 โดนบล็อก` badge for suspended users.
- **Tree View**:
  - Display `last_login_at` underneath user node titles.
  - Add compact Block/Unblock and Delete action buttons on tree cards and child node rows.
