# Dealer Dashboard Mobile Bottom Navigation Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Dealer Dashboard navigation by introducing a sleek 5-item Mobile Floating Bottom Navigation Bar with in-page segmented control for grouped sub-tabs (Members/Upstream and LINE Bot/Automation) and a 5-group visual top navigation bar on Desktop.

**Architecture:** Create reusable `DealerBottomNav.jsx` and `DealerSubTabsNav.jsx` components, wire them into `Dealer.jsx` with backward-compatible `activeTab` states and sub-tab memory, update `Dealer.css` with responsive breakpoint styling and safe-area scroll padding, and add comprehensive unit test suites.

**Tech Stack:** React 19, react-icons (FiCalendar, FiUsers, FiMessageSquare, FiShare2, FiUser, FiSend, FiSettings), Vanilla CSS, Vitest.

## Global Constraints

- Preserve exact `activeTab` string values: `'rounds' | 'members' | 'upstreamDealers' | 'lineBot' | 'automation' | 'referral' | 'profile'`
- Responsive breakpoint: Mobile & Tablet (`<= 768px`) displays bottom bar; Desktop (`> 768px`) displays grouped top tabs.
- Must respect Android / iOS safe area insets: `env(safe-area-inset-bottom, 0px)`.
- Modals (`z-index: 1000+`) must sit comfortably above the bottom navigation bar (`z-index: 995`).
- Zero breakage to existing 571 Vitest tests.

---

### Task 1: Create `DealerBottomNav` and `DealerSubTabsNav` Components with Tests

**Files:**
- Create: `src/components/dealer/DealerBottomNav.jsx`
- Create: `src/components/dealer/DealerSubTabsNav.jsx`
- Create: `src/components/dealer/__tests__/DealerBottomNav.test.jsx`

**Interfaces:**
- `DealerBottomNav` Props:
  - `activeTab`: string
  - `onSelectTab`: (tabId: string) => void
  - `membersCount`: number
  - `upstreamCount`: number
- `DealerSubTabsNav` Props:
  - `currentGroup`: `'members' | 'lineBot'`
  - `activeTab`: string
  - `onSelectSubTab`: (subTabId: string) => void
  - `membersCount`: number
  - `upstreamCount`: number

- [ ] **Step 1: Write the failing unit tests**

```jsx
// src/components/dealer/__tests__/DealerBottomNav.test.jsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DealerBottomNav from '../DealerBottomNav'
import DealerSubTabsNav from '../DealerSubTabsNav'

describe('DealerBottomNav', () => {
    it('renders all 5 main navigation items', () => {
        render(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(screen.getByText('งวดหวย')).toBeInTheDocument()
        expect(screen.getByText('สมาชิก')).toBeInTheDocument()
        expect(screen.getByText('LINE Bot')).toBeInTheDocument()
        expect(screen.getByText('แนะนำ')).toBeInTheDocument()
        expect(screen.getByText('โปรไฟล์')).toBeInTheDocument()
    })

    it('highlights active item when activeTab matches', () => {
        const { container } = render(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        const activeBtn = container.querySelector('.dealer-bottom-nav-item.active')
        expect(activeBtn).toHaveTextContent('งวดหวย')
    })

    it('highlights สมาชิก when activeTab is upstreamDealers', () => {
        const { container } = render(
            <DealerBottomNav
                activeTab="upstreamDealers"
                onSelectTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        const activeBtn = container.querySelector('.dealer-bottom-nav-item.active')
        expect(activeBtn).toHaveTextContent('สมาชิก')
    })

    it('displays total members badge count on สมาชิก item', () => {
        render(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(screen.getByText('18')).toBeInTheDocument() // 17 + 1
    })

    it('calls onSelectTab with appropriate tab identifier on click', () => {
        const onSelectTab = vi.fn()
        render(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={onSelectTab}
                membersCount={17}
                upstreamCount={1}
            />
        )
        fireEvent.click(screen.getByText('LINE Bot'))
        expect(onSelectTab).toHaveBeenCalledWith('lineBot')
    })
})

describe('DealerSubTabsNav', () => {
    it('renders members and upstream sub-tabs when currentGroup is members', () => {
        render(
            <DealerSubTabsNav
                currentGroup="members"
                activeTab="members"
                onSelectSubTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(screen.getByText(/สมาชิก \(17\)/)).toBeInTheDocument()
        expect(screen.getByText(/เจ้ามือตีออก \(1\)/)).toBeInTheDocument()
    })

    it('renders lineBot and automation sub-tabs when currentGroup is lineBot', () => {
        render(
            <DealerSubTabsNav
                currentGroup="lineBot"
                activeTab="lineBot"
                onSelectSubTab={vi.fn()}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(screen.getByText('จัดการ LINE Bot')).toBeInTheDocument()
        expect(screen.getByText('ตั้งค่าออโตเมชัน')).toBeInTheDocument()
    })

    it('calls onSelectSubTab when clicking a sub-tab', () => {
        const onSelectSubTab = vi.fn()
        render(
            <DealerSubTabsNav
                currentGroup="members"
                activeTab="members"
                onSelectSubTab={onSelectSubTab}
                membersCount={17}
                upstreamCount={1}
            />
        )
        fireEvent.click(screen.getByText(/เจ้ามือตีออก/))
        expect(onSelectSubTab).toHaveBeenCalledWith('upstreamDealers')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/components/dealer/__tests__/DealerBottomNav.test.jsx`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement `DealerBottomNav.jsx`**

```jsx
// src/components/dealer/DealerBottomNav.jsx
import React from 'react'
import {
    FiCalendar,
    FiUsers,
    FiMessageSquare,
    FiShare2,
    FiUser
} from 'react-icons/fi'

export default function DealerBottomNav({
    activeTab,
    onSelectTab,
    membersCount = 0,
    upstreamCount = 0
}) {
    const isMembersActive = activeTab === 'members' || activeTab === 'upstreamDealers'
    const isLineBotActive = activeTab === 'lineBot' || activeTab === 'automation'
    const totalMembers = membersCount + upstreamCount

    const navItems = [
        {
            id: 'rounds',
            label: 'งวดหวย',
            icon: FiCalendar,
            isActive: activeTab === 'rounds'
        },
        {
            id: 'members',
            label: 'สมาชิก',
            icon: FiUsers,
            isActive: isMembersActive,
            badge: totalMembers > 0 ? totalMembers : null
        },
        {
            id: 'lineBot',
            label: 'LINE Bot',
            icon: FiMessageSquare,
            isActive: isLineBotActive
        },
        {
            id: 'referral',
            label: 'แนะนำ',
            icon: FiShare2,
            isActive: activeTab === 'referral'
        },
        {
            id: 'profile',
            label: 'โปรไฟล์',
            icon: FiUser,
            isActive: activeTab === 'profile'
        }
    ]

    return (
        <nav className="dealer-bottom-nav" aria-label="Dealer Navigation">
            {navItems.map(item => {
                const IconComponent = item.icon
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`dealer-bottom-nav-item ${item.isActive ? 'active' : ''}`}
                        onClick={() => onSelectTab(item.id)}
                    >
                        <div className="dealer-bottom-nav-icon-wrapper">
                            <IconComponent className="dealer-bottom-nav-icon" />
                            {item.badge !== undefined && item.badge !== null && (
                                <span className="dealer-bottom-nav-badge">{item.badge}</span>
                            )}
                        </div>
                        <span className="dealer-bottom-nav-label">{item.label}</span>
                    </button>
                )
            })}
        </nav>
    )
}
```

- [ ] **Step 4: Implement `DealerSubTabsNav.jsx`**

```jsx
// src/components/dealer/DealerSubTabsNav.jsx
import React from 'react'
import { FiUsers, FiSend, FiMessageSquare, FiSettings } from 'react-icons/fi'

export default function DealerSubTabsNav({
    currentGroup,
    activeTab,
    onSelectSubTab,
    membersCount = 0,
    upstreamCount = 0
}) {
    if (currentGroup !== 'members' && currentGroup !== 'lineBot') {
        return null
    }

    if (currentGroup === 'members') {
        return (
            <div className="dealer-sub-tabs-container">
                <div className="dealer-sub-tabs-pill">
                    <button
                        type="button"
                        className={`dealer-sub-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => onSelectSubTab('members')}
                    >
                        <FiUsers className="sub-tab-icon" />
                        <span>สมาชิก ({membersCount})</span>
                    </button>
                    <button
                        type="button"
                        className={`dealer-sub-tab-btn ${activeTab === 'upstreamDealers' ? 'active' : ''}`}
                        onClick={() => onSelectSubTab('upstreamDealers')}
                    >
                        <FiSend className="sub-tab-icon" />
                        <span>เจ้ามือตีออก ({upstreamCount})</span>
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="dealer-sub-tabs-container">
            <div className="dealer-sub-tabs-pill">
                <button
                    type="button"
                    className={`dealer-sub-tab-btn ${activeTab === 'lineBot' ? 'active' : ''}`}
                    onClick={() => onSelectSubTab('lineBot')}
                >
                    <FiMessageSquare className="sub-tab-icon" />
                    <span>จัดการ LINE Bot</span>
                </button>
                <button
                    type="button"
                    className={`dealer-sub-tab-btn ${activeTab === 'automation' ? 'active' : ''}`}
                    onClick={() => onSelectSubTab('automation')}
                >
                    <FiSettings className="sub-tab-icon" />
                    <span>ตั้งค่าออโตเมชัน</span>
                </button>
            </div>
        </div>
    )
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cmd /c npx vitest run src/components/dealer/__tests__/DealerBottomNav.test.jsx`
Expected: PASS (all 7 tests passing)

- [ ] **Step 6: Commit**

```bash
git add src/components/dealer/DealerBottomNav.jsx src/components/dealer/DealerSubTabsNav.jsx src/components/dealer/__tests__/DealerBottomNav.test.jsx
git commit -m "feat(dealer): add DealerBottomNav and DealerSubTabsNav components with unit tests"
```

---

### Task 2: Style Bottom Nav, Sub-Tabs Pill, and Desktop Tab Groups in CSS

**Files:**
- Modify: `src/pages/Dealer.css:68-105` and `995-1030`

**Interfaces:**
- Consumes: `.dealer-bottom-nav`, `.dealer-bottom-nav-item`, `.dealer-sub-tabs-container`, `.dealer-tab-group`

- [ ] **Step 1: Add bottom navigation and sub-tabs CSS rules to `src/pages/Dealer.css`**

Add styling for:
1. `.dealer-bottom-nav`: Hidden on desktop (`display: none`), flex on mobile with glassmorphism backdrop blur `16px`, floating capsule `border-radius: 24px`, gold border `1px solid rgba(212, 175, 55, 0.25)`.
2. `.dealer-bottom-nav-item`: Flex column, centered, smooth transition, active gold glow.
3. `.dealer-bottom-nav-badge`: Small rounded pill badge with gold background / high contrast text.
4. `.dealer-sub-tabs-container`: In-page pill container with sleek dark backdrop and gold active tab.
5. `.dealer-tabs` desktop grouping: `.dealer-tab-group` wrapper for Member and LINE Bot pairs on desktop.
6. Responsive media query `@media (max-width: 768px)`:
   - Hide `.dealer-tabs`
   - Show `.dealer-bottom-nav`
   - Set `.dealer-page` padding-bottom: `calc(88px + env(safe-area-inset-bottom, 0px))`

- [ ] **Step 2: Run build to verify CSS syntax**

Run: `cmd /c npm run build`
Expected: PASS with no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dealer.css
git commit -m "style(dealer): add CSS for mobile bottom nav, sub-tabs pill, and desktop grouping"
```

---

### Task 3: Integrate `DealerBottomNav` & `DealerSubTabsNav` into `Dealer.jsx`

**Files:**
- Modify: `src/pages/Dealer.jsx`

**Interfaces:**
- Consumes: `DealerBottomNav`, `DealerSubTabsNav`
- Manages:
  - `lastMemberSubTab` (`'members' | 'upstreamDealers'`, default `'members'`)
  - `lastBotSubTab` (`'lineBot' | 'automation'`, default `'lineBot'`)
  - `handleBottomNavSelect`: selects appropriate tab and handles memory restoration.

- [ ] **Step 1: Update `Dealer.jsx`**
  - Import `DealerBottomNav` from `../components/dealer/DealerBottomNav`
  - Import `DealerSubTabsNav` from `../components/dealer/DealerSubTabsNav`
  - Add state for sub-tab memory:
    ```javascript
    const [lastMemberSubTab, setLastMemberSubTab] = useState('members')
    const [lastBotSubTab, setLastBotSubTab] = useState('lineBot')
    ```
  - Update memory tracking when `activeTab` changes:
    ```javascript
    useEffect(() => {
        if (activeTab === 'members' || activeTab === 'upstreamDealers') {
            setLastMemberSubTab(activeTab)
        } else if (activeTab === 'lineBot' || activeTab === 'automation') {
            setLastBotSubTab(activeTab)
        }
    }, [activeTab])
    ```
  - Implement `handleBottomNavSelect(tabId)`:
    ```javascript
    const handleBottomNavSelect = (tabId) => {
        if (tabId === 'members') {
            setActiveTab(lastMemberSubTab || 'members')
        } else if (tabId === 'lineBot') {
            setActiveTab(lastBotSubTab || 'lineBot')
        } else {
            setActiveTab(tabId)
        }
    }
    ```
  - In Desktop top `.dealer-tabs`, organize tabs into the 5 visual groups:
    - Group 1: งวดหวย
    - Group 2 (Card wrapper): สมาชิก + เจ้ามือตีออก
    - Group 3 (Card wrapper): จัดการ LINE Bot + ตั้งค่าออโตเมชัน
    - Group 4: แนะนำเจ้ามือ (Affiliate)
    - Group 5: โปรไฟล์
  - Render `<DealerSubTabsNav>` at the top of the content area when `activeTab` is in `members`, `upstreamDealers`, `lineBot`, or `automation`.
  - Render `<DealerBottomNav>` at the bottom of the `Dealer` component.

- [ ] **Step 2: Run all tests to ensure zero regressions**

Run: `cmd /c npm run test`
Expected: PASS (all test suites pass)

- [ ] **Step 3: Run production build**

Run: `cmd /c npm run build`
Expected: PASS (build completed cleanly)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dealer.jsx
git commit -m "feat(dealer): wire DealerBottomNav and DealerSubTabsNav into Dealer dashboard"
```

---

### Task 4: Responsive Verification & Visual Polish

**Files:**
- Test: Responsive viewports in browser or headless check
- Polish: Any fine-tuning of padding, icons, or badges

- [ ] **Step 1: Verify mobile viewport rendering**
  - Verify on mobile width (<= 768px):
    - Top tabs are hidden.
    - Bottom floating bar is clearly displayed with 5 icons and active gold glow.
    - Sub-tabs pill displays at top of "สมาชิก" and "LINE Bot" sections.
    - Content scrolls fully above the floating bar.
- [ ] **Step 2: Verify desktop viewport rendering**
  - Verify on desktop width (> 768px):
    - Bottom floating bar is hidden.
    - Top tabs display 5 clean groups.
- [ ] **Step 3: Commit and Push**

```bash
git add .
git commit -m "feat: complete dealer dashboard mobile bottom nav and desktop grouped tabs"
git push origin master
```
