# Dealer-Member Tree View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Hierarchical Tree View in the Admin Member Management tab (`src/pages/Admin.jsx`) allowing Superadmins to view dealer-member network relationships with interactive expand/collapse branches and dual perspective toggles (Dealer -> Members and Member -> Dealers).

**Architecture:** Create a modular component `MemberTreeView.jsx` and corresponding `MemberTreeView.css`. Fetch `user_dealer_memberships` in `Admin.jsx` alongside `profiles` to build relationship mapping, and render a view mode switcher (Table vs Tree View) in the Member Management tab header.

**Tech Stack:** React 18, Supabase Client JS, React Icons (`react-icons/fi`), Vanilla CSS.

## Global Constraints

- Preserve all existing functionality of Table View in `Admin.jsx`.
- Use standard React Hooks and pure CSS for tree guide lines and node animation.

---

### Task 1: Create MemberTreeView Component & Styles

**Files:**
- Create: `src/components/admin/MemberTreeView.jsx`
- Create: `src/components/admin/MemberTreeView.css`

**Interfaces:**
- Consumes:
  - `users`: Array of profile objects (`id`, `full_name`, `email`, `role`, `balance`, `created_at`).
  - `memberships`: Array of membership objects (`id`, `user_id`, `dealer_id`, `created_at`).
- Produces: React Tree View component with expand/collapse node states, perspective switcher (Dealer perspective vs Member perspective), search filtering, and "Expand All" / "Collapse All" triggers.

- [ ] **Step 1: Write `MemberTreeView.css`**

```css
.member-tree-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.tree-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
}

.tree-mode-toggle {
    display: flex;
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    border-radius: var(--radius-md);
}

.tree-mode-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.tree-mode-btn.active {
    background: var(--color-accent);
    color: white;
}

.tree-action-btns {
    display: flex;
    gap: 0.5rem;
}

.tree-action-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.tree-action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.tree-nodes-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.tree-node-card {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    overflow: hidden;
    transition: border-color var(--transition-fast);
}

.tree-node-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
}

.tree-node-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    cursor: pointer;
    user-select: none;
}

.tree-node-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.tree-expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1.125rem;
    transition: transform var(--transition-fast);
}

.tree-node-info {
    display: flex;
    flex-direction: column;
}

.tree-node-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
}

.tree-node-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.tree-node-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.tree-count-badge {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
}

.tree-children-list {
    padding: 0.5rem 1rem 1rem 2.5rem;
    background: rgba(0, 0, 0, 0.15);
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    position: relative;
}

.tree-children-list::before {
    content: '';
    position: absolute;
    left: 1.5rem;
    top: 0;
    bottom: 1rem;
    width: 2px;
    background: rgba(255, 255, 255, 0.1);
}

.tree-child-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.875rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    position: relative;
}

.tree-child-item::before {
    content: '';
    position: absolute;
    left: -1rem;
    top: 50%;
    width: 0.75rem;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
}
```

- [ ] **Step 2: Create `MemberTreeView.jsx`**

```jsx
import React, { useState, useMemo } from 'react'
import {
    FiChevronRight,
    FiChevronDown,
    FiUserCheck,
    FiUsers,
    FiBriefcase,
    FiMaximize2,
    FiMinimize2
} from 'react-icons/fi'
import './MemberTreeView.css'

export default function MemberTreeView({ users, memberships, searchTerm }) {
    const [perspective, setPerspective] = useState('dealer') // 'dealer' (Dealer -> Members) or 'member' (Member -> Dealers)
    const [expandedNodeIds, setExpandedNodeIds] = useState({})

    // Create maps for quick lookup
    const userMap = useMemo(() => {
        const map = {}
        users.forEach(u => {
            map[u.id] = u
        })
        return map
    }, [users])

    // Dealer -> List of Member IDs
    const dealerMembersMap = useMemo(() => {
        const map = {}
        memberships.forEach(m => {
            if (!map[m.dealer_id]) map[m.dealer_id] = []
            if (userMap[m.user_id] && !map[m.dealer_id].some(u => u.id === m.user_id)) {
                map[m.dealer_id].push(userMap[m.user_id])
            }
        })
        return map
    }, [memberships, userMap])

    // Member -> List of Dealer IDs
    const memberDealersMap = useMemo(() => {
        const map = {}
        memberships.forEach(m => {
            if (!map[m.user_id]) map[m.user_id] = []
            if (userMap[m.dealer_id] && !map[m.user_id].some(d => d.id === m.dealer_id)) {
                map[m.user_id].push(userMap[m.dealer_id])
            }
        })
        return map
    }, [memberships, userMap])

    // Filter root nodes based on perspective and search
    const rootNodes = useMemo(() => {
        let list = []
        if (perspective === 'dealer') {
            list = users.filter(u => u.role === 'dealer' || u.role === 'superadmin')
        } else {
            list = users.filter(u => !u.role || u.role === 'user')
        }

        if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase().trim()
            list = list.filter(node => {
                const nameMatch = (node.full_name || '').toLowerCase().includes(term)
                const emailMatch = (node.email || '').toLowerCase().includes(term)
                const children = perspective === 'dealer'
                    ? (dealerMembersMap[node.id] || [])
                    : (memberDealersMap[node.id] || [])
                const childMatch = children.some(c =>
                    (c.full_name || '').toLowerCase().includes(term) ||
                    (c.email || '').toLowerCase().includes(term)
                )
                return nameMatch || emailMatch || childMatch
            })
        }

        return list
    }, [users, perspective, searchTerm, dealerMembersMap, memberDealersMap])

    const toggleNode = (id) => {
        setExpandedNodeIds(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const expandAll = () => {
        const nextState = {}
        rootNodes.forEach(node => {
            nextState[node.id] = true
        })
        setExpandedNodeIds(nextState)
    }

    const collapseAll = () => {
        setExpandedNodeIds({})
    }

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'superadmin':
            case 'admin':
                return 'role-admin'
            case 'dealer':
                return 'role-dealer'
            default:
                return 'role-user'
        }
    }

    const getRoleLabel = (role) => {
        switch (role) {
            case 'superadmin':
            case 'admin':
                return 'Admin'
            case 'dealer':
                return 'เจ้ามือ'
            default:
                return 'ผู้ใช้'
        }
    }

    return (
        <div className="member-tree-container">
            {/* Toolbar */}
            <div className="tree-toolbar">
                <div className="tree-mode-toggle">
                    <button
                        className={`tree-mode-btn ${perspective === 'dealer' ? 'active' : ''}`}
                        onClick={() => setPerspective('dealer')}
                    >
                        <FiBriefcase />
                        มองตามเจ้ามือ (Dealers → Members)
                    </button>
                    <button
                        className={`tree-mode-btn ${perspective === 'member' ? 'active' : ''}`}
                        onClick={() => setPerspective('member')}
                    >
                        <FiUsers />
                        มองตามสมาชิก (Members → Dealers)
                    </button>
                </div>

                <div className="tree-action-btns">
                    <button className="tree-action-btn" onClick={expandAll}>
                        <FiMaximize2 style={{ marginRight: '4px' }} />
                        ขยายทั้งหมด
                    </button>
                    <button className="tree-action-btn" onClick={collapseAll}>
                        <FiMinimize2 style={{ marginRight: '4px' }} />
                        ย่อทั้งหมด
                    </button>
                </div>
            </div>

            {/* Tree Nodes */}
            <div className="tree-nodes-wrap">
                {rootNodes.length === 0 ? (
                    <div className="empty-state">
                        <FiUsers className="empty-icon" />
                        <p>ไม่พบข้อมูลตามเงื่อนไขที่กรอง</p>
                    </div>
                ) : (
                    rootNodes.map(node => {
                        const children = perspective === 'dealer'
                            ? (dealerMembersMap[node.id] || [])
                            : (memberDealersMap[node.id] || [])
                        const isExpanded = !!expandedNodeIds[node.id] || (searchTerm && searchTerm.trim() !== '')

                        return (
                            <div className="tree-node-card" key={node.id}>
                                <div className="tree-node-header" onClick={() => toggleNode(node.id)}>
                                    <div className="tree-node-left">
                                        <div className="tree-expand-icon">
                                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                        </div>
                                        <div className="tree-node-info">
                                            <span className="tree-node-title">
                                                {node.full_name || 'ไม่ระบุชื่อ'}
                                            </span>
                                            <span className="tree-node-sub">{node.email}</span>
                                        </div>
                                    </div>

                                    <div className="tree-node-right">
                                        <span className={`role-badge ${getRoleBadgeClass(node.role)}`}>
                                            {getRoleLabel(node.role)}
                                        </span>
                                        <span className="tree-count-badge">
                                            {perspective === 'dealer'
                                                ? `สมาชิก ${children.length} คน`
                                                : `สังกัด ${children.length} เจ้ามือ`}
                                        </span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="tree-children-list">
                                        {children.length === 0 ? (
                                            <div className="tree-child-empty" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                                                {perspective === 'dealer' ? 'ยังไม่มีสมาชิกในสังกัด' : 'ยังไม่ได้สังกัดเจ้ามือใด'}
                                            </div>
                                        ) : (
                                            children.map(child => (
                                                <div className="tree-child-item" key={child.id}>
                                                    <div className="tree-node-info">
                                                        <span className="tree-node-title" style={{ fontSize: '0.875rem' }}>
                                                            {child.full_name || 'ไม่ระบุชื่อ'}
                                                        </span>
                                                        <span className="tree-node-sub">{child.email}</span>
                                                    </div>
                                                    <span className={`role-badge ${getRoleBadgeClass(child.role)}`}>
                                                        {getRoleLabel(child.role)}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Test syntax and build validation**

Run: `cmd /c npm run build`
Expected: Success with no JSX or CSS syntax errors.

- [ ] **Step 4: Commit Task 1**

```bash
git add src/components/admin/MemberTreeView.jsx src/components/admin/MemberTreeView.css
git commit -m "feat: create MemberTreeView component and styles for dealer-member hierarchy"
```

---

### Task 2: Integrate Tree View into Admin Page (`Admin.jsx`)

**Files:**
- Modify: `src/pages/Admin.jsx`

**Interfaces:**
- Consumes: `user_dealer_memberships` table data from Supabase.
- Produces: View Mode Switcher (`table` vs `tree`) in Member Management tab header, rendering `MemberTreeView` when `viewMode === 'tree'`.

- [ ] **Step 1: Update `fetchUsers` in `Admin.jsx` to fetch `user_dealer_memberships`**

Add state `memberships` and fetch `user_dealer_memberships`:
```javascript
const [memberships, setMemberships] = useState([])
const [viewMode, setViewMode] = useState('table') // 'table' or 'tree'
```

In `fetchUsers`:
```javascript
async function fetchUsers() {
    setLoading(true)
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error) setUsers(data || [])

        const { data: memData } = await supabase
            .from('user_dealer_memberships')
            .select('*')

        setMemberships(memData || [])
    } catch (error) {
        console.error('Error:', error)
    } finally {
        setLoading(false)
    }
}
```

- [ ] **Step 2: Add Table/Tree View Switcher to `users-header` in `Admin.jsx`**

Import `MemberTreeView` and icons `FiList`, `FiGitBranch`:
```jsx
import MemberTreeView from '../components/admin/MemberTreeView'
import { FiList, FiGitBranch } from 'react-icons/fi'
```

Render View Mode Switcher in `users-header`:
```jsx
<div className="view-mode-toggle" style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
    <button
        className={`tree-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
        onClick={() => setViewMode('table')}
    >
        <FiList /> ตาราง
    </button>
    <button
        className={`tree-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
        onClick={() => setViewMode('tree')}
    >
        <FiGitBranch /> แผนผัง (Tree View)
    </button>
</div>
```

If `viewMode === 'tree'`, render `<MemberTreeView users={users} memberships={memberships} searchTerm={searchTerm} />`.

- [ ] **Step 3: Run Vitest and Build to verify**

Run: `cmd /c npm run test` and `cmd /c npm run build`
Expected: PASS and clean build output.

- [ ] **Step 4: Commit Task 2**

```bash
git add src/pages/Admin.jsx
git commit -m "feat: integrate MemberTreeView and memberships data in Admin.jsx"
```
