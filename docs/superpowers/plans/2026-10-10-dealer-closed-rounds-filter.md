# Dealer Closed Rounds Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lottery type dropdown filter to the "Closed rounds" tab (`งวดที่ปิดแล้ว`) in Dealer Dashboard, defaulting to "All lottery types" (`หวยทุกประเภท`), dynamically listing only types present in closed rounds, and updating the tab counter to reflect filtered counts.

**Architecture:** 
1. Create a pure helper module `src/utils/closedRoundsFilterHelper.js` for filtering and extracting available lottery types from closed rounds, with unit tests in `src/utils/__tests__/closedRoundsFilterHelper.test.js`.
2. Connect state and helpers in `src/pages/Dealer.jsx` to manage `closedLotteryTypeFilter`, display `.closed-rounds-filter-bar`, update the sub-tab count, and handle the filtered empty state.
3. Add responsive Dark Mode styles in `src/pages/Dealer.css` matching the design system.

**Tech Stack:** React 19, JavaScript (ESM), CSS, Vitest

## Global Constraints
- **Round Date rule:** Preserve existing domain rules regarding round dates (`close_time` / `round_date`).
- **Data Safety:** Client-side filtering only. No database modifications or deletions.
- **Default value:** The lottery type filter must default to `'all'` ("หวยทุกประเภท").
- **Dynamic dropdown options:** Dropdown options must contain only `'all'` and distinct lottery types present in `closedRounds`.
- **Tab counter:** The count in the tab button `งวดที่ปิดแล้ว (...)` must display the filtered count (`filteredClosedRounds.length`).

---

### Task 1: Create Helper Functions & Unit Tests for Closed Rounds Filtering

**Files:**
- Create: `src/utils/closedRoundsFilterHelper.js`
- Create: `src/utils/__tests__/closedRoundsFilterHelper.test.js`

**Interfaces:**
- Produces:
  - `getAvailableClosedLotteryTypes(closedRounds: Array): Array<string>`
  - `filterClosedRounds(closedRounds: Array, typeFilter: string): Array<object>`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/closedRoundsFilterHelper.test.js`:
```javascript
import { describe, it, expect } from 'vitest'
import { getAvailableClosedLotteryTypes, filterClosedRounds } from '../closedRoundsFilterHelper'

describe('closedRoundsFilterHelper', () => {
    const mockClosedRounds = [
        { id: '1', lottery_type: 'lao', round_date: '2026-10-09' },
        { id: '2', lottery_type: 'lao', round_date: '2026-10-08' },
        { id: '3', lottery_type: 'thai', round_date: '2026-10-01' },
        { id: '4', lottery_type: 'hanoi', round_date: '2026-10-09' },
        { id: '5', lottery_type: null, round_date: '2026-10-07' }
    ]

    describe('getAvailableClosedLotteryTypes', () => {
        it('extracts unique valid lottery types from closed rounds', () => {
            const types = getAvailableClosedLotteryTypes(mockClosedRounds)
            expect(types).toEqual(['lao', 'thai', 'hanoi'])
        })

        it('returns empty array when closedRounds is empty or undefined', () => {
            expect(getAvailableClosedLotteryTypes([])).toEqual([])
            expect(getAvailableClosedLotteryTypes(null)).toEqual([])
            expect(getAvailableClosedLotteryTypes(undefined)).toEqual([])
        })
    })

    describe('filterClosedRounds', () => {
        it('returns all closed rounds when typeFilter is "all"', () => {
            const result = filterClosedRounds(mockClosedRounds, 'all')
            expect(result).toHaveLength(5)
            expect(result).toEqual(mockClosedRounds)
        })

        it('returns only rounds matching specific lottery_type', () => {
            const laoRounds = filterClosedRounds(mockClosedRounds, 'lao')
            expect(laoRounds).toHaveLength(2)
            expect(laoRounds.every(r => r.lottery_type === 'lao')).toBe(true)

            const thaiRounds = filterClosedRounds(mockClosedRounds, 'thai')
            expect(thaiRounds).toHaveLength(1)
            expect(thaiRounds[0].id).toBe('3')
        })

        it('returns empty array if no rounds match the filter', () => {
            const result = filterClosedRounds(mockClosedRounds, 'yeekee')
            expect(result).toEqual([])
        })

        it('handles null/undefined closed rounds gracefully', () => {
            expect(filterClosedRounds(null, 'all')).toEqual([])
            expect(filterClosedRounds(undefined, 'lao')).toEqual([])
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
npm.cmd run test -- src/utils/__tests__/closedRoundsFilterHelper.test.js
```
Expected: FAIL (cannot resolve `../closedRoundsFilterHelper`)

- [ ] **Step 3: Implement minimal helper code**

Create `src/utils/closedRoundsFilterHelper.js`:
```javascript
/**
 * Extracts unique lottery types from closed rounds
 * @param {Array} closedRounds 
 * @returns {Array<string>} Unique lottery types present in closed rounds
 */
export function getAvailableClosedLotteryTypes(closedRounds) {
    if (!Array.isArray(closedRounds) || closedRounds.length === 0) {
        return []
    }
    const typeSet = new Set()
    closedRounds.forEach(round => {
        if (round && round.lottery_type) {
            typeSet.add(round.lottery_type)
        }
    })
    return Array.from(typeSet)
}

/**
 * Filters closed rounds by lottery type
 * @param {Array} closedRounds 
 * @param {string} typeFilter 'all' or specific lottery_type (e.g. 'lao', 'thai')
 * @returns {Array} Filtered closed rounds
 */
export function filterClosedRounds(closedRounds, typeFilter) {
    if (!Array.isArray(closedRounds)) {
        return []
    }
    if (!typeFilter || typeFilter === 'all') {
        return closedRounds
    }
    return closedRounds.filter(round => round && round.lottery_type === typeFilter)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
npm.cmd run test -- src/utils/__tests__/closedRoundsFilterHelper.test.js
```
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```powershell
git add src/utils/closedRoundsFilterHelper.js src/utils/__tests__/closedRoundsFilterHelper.test.js
git commit -m "feat(dealer): add closed rounds lottery type filter helper and tests"
```

---

### Task 2: Implement Filter Bar UI and State in Dealer Dashboard & Styles

**Files:**
- Modify: `src/pages/Dealer.jsx`
- Modify: `src/pages/Dealer.css`

**Interfaces:**
- Consumes:
  - `getAvailableClosedLotteryTypes` from `src/utils/closedRoundsFilterHelper.js`
  - `filterClosedRounds` from `src/utils/closedRoundsFilterHelper.js`
  - `LOTTERY_TYPES` from `src/constants/lotteryTypes.js`

- [ ] **Step 1: Add import and state in `Dealer.jsx`**

Import the helper functions at the top of `src/pages/Dealer.jsx`:
```javascript
import { getAvailableClosedLotteryTypes, filterClosedRounds } from '../utils/closedRoundsFilterHelper'
```

Add state inside `Dealer` component (around line 335 near `historyTypeFilter`):
```javascript
const [closedLotteryTypeFilter, setClosedLotteryTypeFilter] = useState('all')
```

- [ ] **Step 2: Update rounds filtering and memoization in `Dealer.jsx`**

In the rounds tab section (around lines 4545-4550):
```javascript
const openRounds = rounds.filter(r => isRoundOpen(r))
const closedRounds = rounds.filter(r => !isRoundOpen(r))
const availableClosedLotteryTypes = useMemo(() => {
    return getAvailableClosedLotteryTypes(closedRounds)
}, [closedRounds])
const filteredClosedRounds = useMemo(() => {
    return filterClosedRounds(closedRounds, closedLotteryTypeFilter)
}, [closedRounds, closedLotteryTypeFilter])
const displayedRounds = roundsTab === 'open' ? openRounds : filteredClosedRounds
```

Update the sub-tab count button (around line 4576):
```jsx
<button
    className={`sub-tab-btn ${roundsTab === 'closed' ? 'active' : ''}`}
    onClick={() => setRoundsTab('closed')}
>
    งวดที่ปิดแล้ว ({filteredClosedRounds.length})
</button>
```

- [ ] **Step 3: Render the `.closed-rounds-filter-bar` and filtered empty state in `Dealer.jsx`**

Directly under `<div className="rounds-sub-tabs">` (and before `{roundsTab === 'history' ? ... : ...}`):
When `roundsTab === 'closed'` and `closedRounds.length > 0`:
```jsx
{roundsTab === 'closed' && closedRounds.length > 0 && (
    <div className="closed-rounds-filter-bar">
        <div className="closed-rounds-filter-item">
            <label>🎯 ประเภทหวย:</label>
            <select
                className="form-control"
                value={closedLotteryTypeFilter}
                onChange={e => setClosedLotteryTypeFilter(e.target.value)}
            >
                <option value="all">หวยทุกประเภท</option>
                {availableClosedLotteryTypes.map(type => (
                    <option key={type} value={type}>
                        {LOTTERY_TYPES[type] || type}
                    </option>
                ))}
            </select>
        </div>
    </div>
)}
```

In the empty state rendering for open/closed rounds (around lines 5831-5836):
```jsx
) : displayedRounds.length === 0 ? (
    <div className="empty-state card">
        <FiCalendar className="empty-icon" />
        <h3>
            {roundsTab === 'open' 
                ? 'ไม่มีงวดที่เปิดอยู่' 
                : closedRounds.length > 0 
                    ? 'ไม่พบงวดที่ปิดแล้วสำหรับประเภทที่เลือก' 
                    : 'ไม่มีงวดที่ปิดแล้ว'}
        </h3>
        <p>
            {roundsTab === 'open' 
                ? 'กดปุ่ม "สร้างงวดใหม่" เพื่อเริ่มต้น' 
                : closedRounds.length > 0 
                    ? 'ลองเลือกประเภทหวยอื่น หรือกดดูหวยทุกประเภท' 
                    : 'สลับไปที่แท็บ "งวดที่เปิดอยู่" เพื่อดูงวดที่ยังเปิดรับ'}
        </p>
        {roundsTab === 'closed' && closedRounds.length > 0 && closedLotteryTypeFilter !== 'all' && (
            <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setClosedLotteryTypeFilter('all')}
            >
                แสดงหวยทุกประเภท
            </button>
        )}
    </div>
) : (
```

- [ ] **Step 4: Add CSS styles in `Dealer.css`**

Add styles for `.closed-rounds-filter-bar` and `.closed-rounds-filter-item`:
```css
/* ========================================
   Closed Rounds Filter Bar
   ======================================== */
.closed-rounds-filter-bar {
    display: flex;
    gap: 0.85rem;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 1rem;
    background: var(--color-surface);
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 1px solid var(--color-border);
}

.closed-rounds-filter-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 320px;
}

.closed-rounds-filter-item label {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    font-weight: 500;
}

.closed-rounds-filter-item select.form-control {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    border-radius: 6px;
    height: 38px;
    box-sizing: border-box;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.35);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.closed-rounds-filter-item select.form-control:focus {
    border-color: var(--color-primary, #f59e0b);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

@media (max-width: 576px) {
    .closed-rounds-filter-item {
        max-width: 100%;
    }
}
```

- [ ] **Step 5: Run tests and verify build**

Run:
```powershell
npm.cmd run test
```
Expected: PASS (all tests pass)

Run:
```powershell
npm.cmd run build
```
Expected: PASS (build completes with no errors)

- [ ] **Step 6: Commit**

```powershell
git add src/pages/Dealer.jsx src/pages/Dealer.css
git commit -m "feat(dealer): add lottery type dropdown filter in closed rounds tab"
```

---

### Task 3: End-to-End Verification

**Files:**
- None (verification step)

- [ ] **Step 1: Run complete vitest test suite**

Run:
```powershell
npm.cmd run test
```
Expected: All 46 test files pass.

- [ ] **Step 2: Inspect git diff**

Run:
```powershell
git diff HEAD~2..HEAD --stat
```
Expected: Clean changes confined to `closedRoundsFilterHelper`, `Dealer.jsx`, and `Dealer.css`.
