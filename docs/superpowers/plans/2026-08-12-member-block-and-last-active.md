# Member Block, Delete & Last Active Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add last active timestamp (`last_login_at`) tracking, block/unblock and delete user action buttons in Admin Member Management (Table View & Tree View), and enforce login blocking with clear user notification for suspended accounts.

**Architecture:** Create DB migration `182_add_last_login_at_to_profiles.sql` for timestamp storage. Update `AuthContext.jsx` and `Login.jsx` to update `last_login_at` on login and reject blocked users. Enhance `Admin.jsx` and `MemberTreeView.jsx` to expose block/unblock and delete operations with confirmation dialogs.

**Tech Stack:** React 18, Supabase Client JS, PostgreSQL DDL, React Icons (`react-icons/fi`).

## Global Constraints

- Preserve all existing admin features and auth flows.
- Use explicit confirmation dialogs before blocking or deleting users.

---

### Task 1: Database Migration for `last_login_at`

**Files:**
- Create: `supabase/migrations/182_add_last_login_at_to_profiles.sql`

- [ ] **Step 1: Write Migration File**

```sql
-- Migration: 182_add_last_login_at_to_profiles.sql
-- Description: Add last_login_at timestamp column to public.profiles table

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;
```

- [ ] **Step 2: Apply Migration to Remote Supabase Database**

Run: `cmd /c npx supabase db query --linked -f supabase/migrations/182_add_last_login_at_to_profiles.sql`
Expected: Output showing query executed successfully.

- [ ] **Step 3: Repair Migration History**

Run: `cmd /c npx supabase migration repair 182 --status applied`
Expected: Repaired migration history: [182] => applied.

- [ ] **Step 4: Commit Task 1**

```bash
git add supabase/migrations/182_add_last_login_at_to_profiles.sql
git commit -m "feat: add 182_add_last_login_at_to_profiles.sql migration"
```

---

### Task 2: Login Tracking & Block Enforcement in Auth Context & Login Page

**Files:**
- Modify: `src/contexts/AuthContext.jsx`
- Modify: `src/pages/Login.jsx`
- Modify: `src/components/ForceLogoutOverlay.jsx`

**Interfaces:**
- Consumes: `profiles.is_active` and `profiles.last_login_at`.
- Produces: `isAccountSuspended` check on login, auto-update of `last_login_at` timestamp on authentication, and block overlay error message.

- [ ] **Step 1: Update `AuthContext.jsx` to update `last_login_at` and handle blocked profile**

In `fetchProfile` in `AuthContext.jsx`:
When profile data is fetched and valid (`data.is_active !== false`):
```javascript
// Check if blocked
if (data.is_active === false) {
    console.warn('Account is blocked:', data.email)
    setForceLogoutReason('ACCOUNT_BLOCKED')
    clearAllAuthState()
    try { await supabase.auth.signOut({ scope: 'local' }) } catch (_) {}
    setLoading(false)
    return
}
```

In `signIn` in `AuthContext.jsx`:
After successful `signInWithPassword`:
```javascript
if (data?.user) {
    await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id)
}
```

- [ ] **Step 2: Update `Login.jsx` to show blocked error message if user profile is blocked**

In `handleSubmit` in `Login.jsx`:
After `signIn` succeeds, fetch profile status:
```javascript
const { data: profileCheck } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .single()

if (profileCheck && profileCheck.is_active === false) {
    setError('บัญชีนี้ถูกระงับการใช้งาน (โดนบล็อก) กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้')
    setPendingOtpUserId(null)
    setPendingOtp(false)
    await signOut()
    setLoading(false)
    return
}
```

- [ ] **Step 3: Update `ForceLogoutOverlay.jsx` to render blocked message**

When `forceLogoutReason === 'ACCOUNT_BLOCKED'`:
```jsx
{forceLogoutReason === 'ACCOUNT_BLOCKED' ? (
    <>
        <h2 style={titleStyle}>บัญชีของคุณถูกระงับการใช้งาน</h2>
        <p style={messageStyle}>
            บัญชีของคุณถูกระงับการใช้งาน (โดนบล็อก)
            <br />
            กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้
        </p>
    </>
) : (
    // Existing device session force logout UI
)}
```

- [ ] **Step 4: Run tests and build to verify**

Run: `cmd /c npm run test` and `cmd /c npm run build`
Expected: Success with no build or test errors.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/contexts/AuthContext.jsx src/pages/Login.jsx src/components/ForceLogoutOverlay.jsx
git commit -m "feat: enforce login block and update last_login_at timestamp"
```

---

### Task 3: Admin Table View UI Enhancements (`Admin.jsx` & `Admin.css`)

**Files:**
- Modify: `src/pages/Admin.jsx`
- Modify: `src/pages/Admin.css`

**Interfaces:**
- Consumes: `user.last_login_at`, `user.is_active`, `handleUpdateUserRole`.
- Produces: Action handlers for Block/Unblock and Delete, "ใช้งานล่าสุด" column, `🔴 โดนบล็อก` badge, and action buttons in Table View.

- [ ] **Step 1: Add action handlers in `Admin.jsx`**

Add `handleToggleBlockUser`:
```javascript
const handleToggleBlockUser = async (user) => {
    const isCurrentlyBlocked = user.is_active === false
    const actionText = isCurrentlyBlocked ? 'ปลดบล็อก' : 'ระงับการใช้งาน (บล็อก)'
    
    if (!(await confirmDialog({
        title: `ยืนยัน${actionText}`,
        message: `ต้องการ${actionText} สมาชิกคุณ ${user.full_name || user.email}?`,
        confirmText: actionText,
        type: isCurrentlyBlocked ? 'info' : 'danger'
    }))) return

    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                is_active: isCurrentlyBlocked ? true : false,
                deactivated_at: isCurrentlyBlocked ? null : new Date().toISOString()
            })
            .eq('id', user.id)

        if (error) throw error
        toast.success(`${actionText}สมาชิกเรียบร้อยแล้ว`)
        fetchUsers()
    } catch (error) {
        console.error('Error toggling block status:', error)
        toast.error('เกิดข้อผิดพลาดในการเปลี่ยนสถานะสมาชิก')
    }
}
```

Add `handleDeleteUser`:
```javascript
const handleDeleteUser = async (user) => {
    if (!(await confirmDialog({
        title: 'ยืนยันการลบสมาชิก',
        message: `ต้องการลบสมาชิกคุณ ${user.full_name || user.email}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
        confirmText: 'ลบสมาชิก',
        type: 'danger'
    }))) return

    try {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', user.id)

        if (error) throw error
        toast.success('ลบสมาชิกเรียบร้อยแล้ว')
        fetchUsers()
    } catch (error) {
        console.error('Error deleting user:', error)
        toast.error('เกิดข้อผิดพลาดในการลบสมาชิก')
    }
}
```

- [ ] **Step 2: Add "ใช้งานล่าสุด" column and Action buttons in `Admin.jsx` table**

In table header (`<thead>`):
```jsx
<th>ชื่อ</th>
<th>อีเมล</th>
<th>ยอดเงิน</th>
<th>สิทธิ์</th>
<th>ใช้งานล่าสุด</th>
<th>สมัครเมื่อ</th>
<th>จัดการ</th>
```

In table body (`<tbody>`):
```jsx
<tr key={user.id} className={user.is_active === false ? 'row-blocked' : ''}>
    <td>
        {user.full_name || '-'}
        {user.is_active === false && (
            <span className="status-badge blocked" style={{ marginLeft: '6px' }}>🔴 โดนบล็อก</span>
        )}
    </td>
    <td>{user.email}</td>
    <td>฿{(user.balance || 0).toLocaleString()}</td>
    <td>
        <select
            className={`role-select ${getRoleBadgeClass(user.role)}`}
            value={user.role || 'user'}
            onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
        >
            <option value="user">ผู้ใช้</option>
            <option value="dealer">เจ้ามือ</option>
            <option value="superadmin">Admin</option>
        </select>
    </td>
    <td className="time-cell">
        {user.last_login_at
            ? new Date(user.last_login_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
            : '-'}
    </td>
    <td className="time-cell">
        {new Date(user.created_at).toLocaleDateString('th-TH')}
    </td>
    <td>
        <div className="action-buttons">
            <button
                className={`action-btn ${user.is_active === false ? 'unblock' : 'block'}`}
                title={user.is_active === false ? 'ปลดบล็อก' : 'บล็อกสมาชิก'}
                onClick={() => handleToggleBlockUser(user)}
            >
                {user.is_active === false ? <FiUnlock /> : <FiSlash />}
            </button>
            <button
                className="action-btn delete"
                title="ลบสมาชิก"
                onClick={() => handleDeleteUser(user)}
            >
                {user.is_active === false ? <FiTrash2 /> : <FiTrash2 />}
            </button>
        </div>
    </td>
</tr>
```

- [ ] **Step 3: Add CSS styles in `Admin.css` for block status and action buttons**

```css
.status-badge.blocked {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-error);
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
}

.action-btn.block:hover {
    background: rgba(245, 158, 11, 0.2);
    color: var(--color-warning);
}

.action-btn.unblock {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
}

.action-btn.unblock:hover {
    background: rgba(16, 185, 129, 0.3);
}

tr.row-blocked {
    opacity: 0.75;
    background: rgba(239, 68, 68, 0.03);
}
```

- [ ] **Step 4: Run build validation**

Run: `cmd /c npm run build`
Expected: PASS with clean build.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/pages/Admin.jsx src/pages/Admin.css
git commit -m "feat: add last_login_at column, block/unblock, and delete actions in Admin table view"
```

---

### Task 4: Tree View UI Enhancements (`MemberTreeView.jsx` & `MemberTreeView.css`)

**Files:**
- Modify: `src/components/admin/MemberTreeView.jsx`
- Modify: `src/components/admin/MemberTreeView.css`

**Interfaces:**
- Consumes: `onToggleBlock`, `onDeleteUser` props from `Admin.jsx`.
- Produces: Last login display and inline Block/Unblock and Delete action buttons for tree node cards and child member rows.

- [ ] **Step 1: Update `MemberTreeView.jsx` to receive `onToggleBlock` and `onDeleteUser` props**

In `MemberTreeView({ users, memberships, searchTerm, onToggleBlock, onDeleteUser })`:
Add action buttons on node headers and child items:
```jsx
<div className="tree-node-right">
    {node.is_active === false && (
        <span className="status-badge blocked">🔴 โดนบล็อก</span>
    )}
    <span className={`role-badge ${getRoleBadgeClass(node.role)}`}>
        {getRoleLabel(node.role)}
    </span>
    <span className="tree-count-badge">
        {perspective === 'dealer'
            ? `สมาชิก ${children.length} คน`
            : `สังกัด ${children.length} เจ้ามือ`}
    </span>

    {onToggleBlock && (
        <button
            className={`tree-action-icon-btn ${node.is_active === false ? 'unblock' : 'block'}`}
            title={node.is_active === false ? 'ปลดบล็อก' : 'บล็อก'}
            onClick={(e) => { e.stopPropagation(); onToggleBlock(node); }}
        >
            {node.is_active === false ? <FiUnlock /> : <FiSlash />}
        </button>
    )}
    {onDeleteUser && (
        <button
            className="tree-action-icon-btn delete"
            title="ลบสมาชิก"
            onClick={(e) => { e.stopPropagation(); onDeleteUser(node); }}
        >
            <FiTrash2 />
        </button>
    )}
</div>
```

Also render `last_login_at` timestamp:
```jsx
<span className="tree-node-sub">
    {node.email} • ใช้งานล่าสุด: {node.last_login_at ? new Date(node.last_login_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
</span>
```

And in child items:
```jsx
<div className="tree-child-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    {child.is_active === false && (
        <span className="status-badge blocked">🔴 โดนบล็อก</span>
    )}
    <span className={`role-badge ${getRoleBadgeClass(child.role)}`}>
        {getRoleLabel(child.role)}
    </span>
    {onToggleBlock && (
        <button
            className={`tree-action-icon-btn ${child.is_active === false ? 'unblock' : 'block'}`}
            title={child.is_active === false ? 'ปลดบล็อก' : 'บล็อก'}
            onClick={() => onToggleBlock(child)}
        >
            {child.is_active === false ? <FiUnlock /> : <FiSlash />}
        </button>
    )}
    {onDeleteUser && (
        <button
            className="tree-action-icon-btn delete"
            title="ลบสมาชิก"
            onClick={() => onDeleteUser(child)}
        >
            <FiTrash2 />
        </button>
    )}
</div>
```

- [ ] **Step 2: Add CSS styles in `MemberTreeView.css`**

```css
.tree-action-icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.tree-action-icon-btn:hover {
    color: var(--text-primary);
}

.tree-action-icon-btn.block:hover {
    background: rgba(245, 158, 11, 0.2);
    color: var(--color-warning);
}

.tree-action-icon-btn.unblock {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
}

.tree-action-icon-btn.delete:hover {
    background: rgba(239, 68, 68, 0.2);
    color: var(--color-error);
}
```

- [ ] **Step 3: Pass `onToggleBlock` and `onDeleteUser` props in `Admin.jsx`**

In `Admin.jsx`:
```jsx
<MemberTreeView
    users={users}
    memberships={memberships}
    searchTerm={searchTerm}
    onToggleBlock={handleToggleBlockUser}
    onDeleteUser={handleDeleteUser}
/>
```

- [ ] **Step 4: Run Vitest and Build to verify**

Run: `cmd /c npm run test` and `cmd /c npm run build`
Expected: PASS and clean build output.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/admin/MemberTreeView.jsx src/components/admin/MemberTreeView.css src/pages/Admin.jsx
git commit -m "feat: add last login timestamp and block/delete action buttons in Tree View"
```
