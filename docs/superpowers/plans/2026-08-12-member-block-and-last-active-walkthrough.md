# Member Block, Delete & Last Active Walkthrough

## Summary of Completed Work

### 1. Database & Schema Migration
- Created migration `182_add_last_login_at_to_profiles.sql` adding `last_login_at TIMESTAMPTZ DEFAULT NULL` to `public.profiles`.
- Applied migration to remote database and updated migration history.

### 2. Last Active Timestamp & Login Block Enforcement
- Updated `AuthContext.jsx` to set `last_login_at = NOW()` upon successful password authentication.
- Added suspension guard in `Login.jsx` and `AuthContext.jsx`:
  - If a blocked user (`is_active === false`) attempts to log in, authentication is rejected immediately with error message:
    `"บัญชีนี้ถูกระงับการใช้งาน (โดนบล็อก) กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้"`
  - Updated `ForceLogoutOverlay.jsx` to render account block modal if active session gets blocked.

### 3. Member Management Table View UI (`Admin.jsx` & `Admin.css`)
- Added **"ใช้งานล่าสุด" (Last Active)** column displaying formatted date/time (e.g. `12/8/2569 10:35` or `-`).
- Added `🔴 โดนบล็อก` status badge for suspended users.
- Added action buttons in the **จัดการ** column:
  - ⛔ **บล็อก / 🔓 ปลดบล็อก**: Toggle user `is_active` status with confirmation modal.
  - 🗑️ **ลบสมาชิก**: Delete user profile with confirmation modal.

### 4. Member Management Tree View UI (`MemberTreeView.jsx` & `MemberTreeView.css`)
- Rendered last active timestamp (`ใช้งานล่าสุด: ...`) under node titles and child member titles.
- Added compact action buttons (Block/Unblock, Delete) for tree root nodes and child member rows.
- Highlighted blocked user nodes with `🔴 โดนบล็อก` badge and subtle visual dimming.

## Verification
- Ran Vitest suite: 207 tests passed cleanly.
- Ran production build check (`npm run build`): Completed without errors.
- Pushed changes to Git master branch (`f99d7f0`).
