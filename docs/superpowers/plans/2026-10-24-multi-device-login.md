# Multi-Device Login Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Super Admin to configure whether each member or dealer account can log in on multiple devices simultaneously or only one device at a time, providing a quick toggle button in the Admin table actions column and a configuration control in the Edit Member Modal.

**Architecture:** Add `allow_multi_device_login` boolean column to `profiles`. Replace the single-device active index on `device_sessions` with a per-device-token unique index. Update `check_and_create_device_session` and `check_session_valid` to bypass OTP challenges and prevent kickouts when multi-device login is enabled. Add UI controls in `Admin.jsx` and `EditMemberModal.jsx`.

**Tech Stack:** React 19, Supabase (PostgreSQL, PL/pgSQL, Realtime), CSS3, Vitest.

## Global Constraints
- Preserve existing single-device security for all accounts where `allow_multi_device_login = false`.
- Bangkok timezone (`Asia/Bangkok` / UTC+7).
- No hardcoded secrets or credentials.
- All tests must pass cleanly (`npx vitest run`).
- Production build must succeed (`npm run build`).

---

### Task 1: Database Migration (`260_allow_multi_device_login_setting.sql`)

**Files:**
- Create: `supabase/migrations/260_allow_multi_device_login_setting.sql`

**Interfaces:**
- Produces:
  - Column `profiles.allow_multi_device_login BOOLEAN NOT NULL DEFAULT FALSE`
  - Index `idx_device_sessions_active_user_token ON device_sessions(user_id, session_token) WHERE is_active = true`
  - Updated RPC `check_and_create_device_session(UUID, TEXT, TEXT, TEXT)`
  - Updated RPC `check_session_valid(UUID, TEXT)`
  - Updated RPC `update_user_by_superadmin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN)`

- [ ] **Step 1: Write migration SQL file**
  Create `supabase/migrations/260_allow_multi_device_login_setting.sql`:
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allow_multi_device_login BOOLEAN NOT NULL DEFAULT FALSE;`
  - `DROP INDEX IF EXISTS idx_device_sessions_active_user;`
  - `CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_active_user_token ON device_sessions(user_id, session_token) WHERE is_active = true;`
  - Update `check_and_create_device_session`: If `v_profile_role = 'superadmin' OR v_allow_multi_device = true`, create or update session for this device token without kicking out other active sessions and return `needs_otp = false, session_created = true, multi_device = true`.
  - Update `check_session_valid`: If `v_allow_multi_device = true`, verify this device's own session or self-heal, never check other devices (`v_other`), and never return `new_device_login`.
  - Update `update_user_by_superadmin` with `new_allow_multi_device_login BOOLEAN DEFAULT NULL`.

- [ ] **Step 2: Apply migration to remote Supabase database**
  Run `cmd.exe /c npx supabase db push` to execute the migration on Supabase.

- [ ] **Step 3: Commit migration**
  Run `git add supabase/migrations/260_allow_multi_device_login_setting.sql` and commit.

---

### Task 2: Action Button & Badge in `Admin.jsx` & `Admin.css`

**Files:**
- Modify: `src/pages/Admin.jsx`
- Modify: `src/pages/Admin.css`

**Interfaces:**
- Consumes: `profiles.allow_multi_device_login`
- Produces: Quick toggle button with confirmation dialog and visual badge in member table

- [ ] **Step 1: Add styling in `src/pages/Admin.css`**
  Add styles for `.action-btn.multi-device`:
  - `.action-btn.multi-device.active`: emerald/teal background (`rgba(16, 185, 129, 0.15)`), border `1px solid rgba(16, 185, 129, 0.3)`, color `#10b981`.
  - `.action-btn.multi-device.single`: slate background (`rgba(255, 255, 255, 0.05)`), color `#94a3b8`, hover `#c084fc`.
  - `.status-badge.multi-device`: emerald pill badge for member name column.

- [ ] **Step 2: Implement toggle handler and render button in `src/pages/Admin.jsx`**
  - Import `FiLayers, FiSmartphone` from `'react-icons/fi'`.
  - Add `handleToggleMultiDeviceLogin(targetUser)` using `confirmDialog`.
  - Render button immediately before `FiEdit2` button in `.action-buttons`:
    ```jsx
    <button
        className={`action-btn multi-device ${user.allow_multi_device_login ? 'active' : 'single'}`}
        title={user.allow_multi_device_login ? 'อนุญาต Login หลายเครื่อง (คลิกเพื่อเปลี่ยนเป็น Login ทีละเครื่อง)' : 'จำกัด Login ทีละเครื่อง (คลิกเพื่ออนุญาต Login หลายเครื่อง)'}
        onClick={() => handleToggleMultiDeviceLogin(user)}
    >
        {user.allow_multi_device_login ? <FiLayers /> : <FiSmartphone />}
    </button>
    ```
  - In user name column, render badge `{user.allow_multi_device_login && <span className="status-badge multi-device">📱 หลายเครื่อง</span>}`.

- [ ] **Step 3: Verify Admin page renders and compiles**
  Run `cmd.exe /c npx vitest run src/components/admin` to verify existing tests pass.

- [ ] **Step 4: Commit Admin changes**
  Run `git add src/pages/Admin.jsx src/pages/Admin.css` and commit.

---

### Task 3: Edit Member Modal Setting in `EditMemberModal.jsx` & `EditMemberModal.css`

**Files:**
- Modify: `src/components/admin/EditMemberModal.jsx`
- Modify: `src/components/admin/EditMemberModal.css`
- Test: `src/components/admin/__tests__/EditMemberModal.test.js`

**Interfaces:**
- Consumes: `user.allow_multi_device_login`
- Produces: `update_user_by_superadmin` payload with `new_allow_multi_device_login`

- [ ] **Step 1: Write test for modal multi-device state**
  In `src/components/admin/__tests__/EditMemberModal.test.js`, add test asserting helper logic or form initialization.

- [ ] **Step 2: Add multi-device login state and UI to `EditMemberModal.jsx`**
  - Add state `const [allowMultiDeviceLogin, setAllowMultiDeviceLogin] = useState(false)`.
  - In `useEffect`, initialize `setAllowMultiDeviceLogin(user.allow_multi_device_login === true)`.
  - Render form group with `FiSmartphone` icon and select/toggle:
    - `false`: "📱 เข้าสู่ระบบได้ทีละเครื่อง (Single Device) - มีระบบ OTP / ยืนยันเครื่องเดิม"
    - `true`: "💻 เข้าสู่ระบบได้หลายเครื่องพร้อมกัน (Multi-Device) - สามารถเข้าใช้งานได้หลายเครื่องพร้อมกัน"
  - In `handleSubmit`, pass `new_allow_multi_device_login: allowMultiDeviceLogin` to `update_user_by_superadmin`.

- [ ] **Step 3: Add CSS styling to `EditMemberModal.css`**
  Style the select/toggle cleanly matching the dark/neon theme of the application.

- [ ] **Step 4: Run unit tests**
  Run `cmd.exe /c npx vitest run src/components/admin/__tests__/EditMemberModal.test.js`.

- [ ] **Step 5: Commit modal changes**
  Run `git add src/components/admin/EditMemberModal.jsx src/components/admin/EditMemberModal.css src/components/admin/__tests__/EditMemberModal.test.js` and commit.

---

### Task 4: Realtime Session Context & Unit Tests

**Files:**
- Modify: `src/contexts/AuthContext.jsx`
- Modify: `src/utils/deviceSession.test.js`

**Interfaces:**
- Consumes: `profile.allow_multi_device_login`
- Produces: Bypass incoming login approval subscriptions for multi-device accounts

- [ ] **Step 1: Write unit test in `src/utils/deviceSession.test.js`**
  Add test verifying multi-device login bypass behavior and session checking.

- [ ] **Step 2: Update `AuthContext.jsx`**
  In `useEffect` for session monitoring (around line 475):
  - If `profile.allow_multi_device_login === true`, skip `getPendingLoginRequest` and `subscribeToLoginRequests` (because secondary device logins do not generate approval requests).

- [ ] **Step 3: Run unit tests**
  Run `cmd.exe /c npx vitest run src/utils/deviceSession.test.js`.

- [ ] **Step 4: Commit AuthContext and test changes**
  Run `git add src/contexts/AuthContext.jsx src/utils/deviceSession.test.js` and commit.

---

### Task 5: Full Regression Testing & Production Build

**Files:**
- All modified files

- [ ] **Step 1: Run full Vitest suite**
  Run `cmd.exe /c npx vitest run` and verify all test files pass (100%).

- [ ] **Step 2: Run production build**
  Run `cmd.exe /c npm run build` and ensure Vite bundle builds without errors.

- [ ] **Step 3: Final commit and push**
  Ensure working directory is clean and push to `origin/master`.
