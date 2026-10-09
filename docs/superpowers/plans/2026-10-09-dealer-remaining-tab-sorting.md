# Dealer Remaining Tab Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement interactive sorting in the dealer "ยอดเหลือ" (Remaining) tab by clicking table headers for number ("เลข"), total received amount ("ยอดรวม"), and remaining amount ("เหลือ").

**Architecture:** 
1. Create a pure, robust sorting utility `sortRemainingItems(items, sortBy, sortOrder)` in `src/utils/remainingSortHelper.js` with comprehensive unit tests for all modes and tie-breaking.
2. In `src/components/dealer/RoundAccordionItem.jsx`, manage `remainingSortBy` ('number' | 'remaining' | 'total') and `remainingSortOrder` ('asc' | 'desc') states.
3. Update table `<thead>` headers with interactive clickable columns, hover states, and dynamic directional arrows (`↑`, `↓`, `↕`).
4. Apply the sort function to `filteredRemainingItems` before rendering.

**Tech Stack:** React, JavaScript (ES6+), Vitest

## Global Constraints
- Do NOT delete, mutate, or mock any database data (Domain Rule 3).
- Must run test suite via `npm.cmd test` on Windows.
- Keep table responsive and uncluttered.

---

### Task 1: Create `sortRemainingItems` Helper with Full Test Suite

**Files:**
- Create: `src/utils/remainingSortHelper.js`
- Test: `src/utils/__tests__/remainingSortHelper.test.js`

**Interfaces:**
- Produces: `sortRemainingItems(items, sortBy, sortOrder)`
  - `items`: Array of remaining items `{ numbers, bet_type, totalAmount, remainingAmount, ... }`
  - `sortBy`: `'number'` | `'remaining'` | `'total'`
  - `sortOrder`: `'asc'` | `'desc'`
  - Returns: New sorted array

- [ ] **Step 1: Write failing unit tests for `sortRemainingItems`**

Create `src/utils/__tests__/remainingSortHelper.test.js`:
```javascript
import { describe, it, expect } from 'vitest'
import { sortRemainingItems } from '../remainingSortHelper'

describe('sortRemainingItems', () => {
    const mockItems = [
        { numbers: '45', bet_type: '2_top', totalAmount: 100, remainingAmount: 50 },
        { numbers: '123', bet_type: '3_top', totalAmount: 500, remainingAmount: 200 },
        { numbers: '012', bet_type: '3_top', totalAmount: 300, remainingAmount: 200 },
        { numbers: '78', bet_type: '2_top', totalAmount: 200, remainingAmount: 10 },
        { numbers: '999', bet_type: '3_top', totalAmount: 1000, remainingAmount: 500 }
    ]

    describe('Sort by number', () => {
        it('sorts numbers ascending: shorter length first, then numeric value', () => {
            const sorted = sortRemainingItems(mockItems, 'number', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['45', '78', '012', '123', '999'])
        })

        it('sorts numbers descending: longer length first, then numeric value descending', () => {
            const sorted = sortRemainingItems(mockItems, 'number', 'desc')
            expect(sorted.map(i => i.numbers)).toEqual(['999', '123', '012', '78', '45'])
        })
    })

    describe('Sort by remaining amount', () => {
        it('sorts by remainingAmount descending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'remaining', 'desc')
            // 500 (999), 200 (012, 123), 50 (45), 10 (78)
            expect(sorted.map(i => i.numbers)).toEqual(['999', '012', '123', '45', '78'])
        })

        it('sorts by remainingAmount ascending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'remaining', 'asc')
            // 10 (78), 50 (45), 200 (012, 123), 500 (999)
            expect(sorted.map(i => i.numbers)).toEqual(['78', '45', '012', '123', '999'])
        })
    })

    describe('Sort by total amount', () => {
        it('sorts by totalAmount descending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'total', 'desc')
            // 1000 (999), 500 (123), 300 (012), 200 (78), 100 (45)
            expect(sorted.map(i => i.numbers)).toEqual(['999', '123', '012', '78', '45'])
        })

        it('sorts by totalAmount ascending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'total', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['45', '78', '012', '123', '999'])
        })
    })

    describe('Edge cases', () => {
        it('handles empty or non-array inputs gracefully', () => {
            expect(sortRemainingItems(null, 'number', 'asc')).toEqual([])
            expect(sortRemainingItems([], 'number', 'asc')).toEqual([])
        })

        it('handles items with missing or non-numeric amounts', () => {
            const itemsWithNaN = [
                { numbers: '11', remainingAmount: null },
                { numbers: '22', remainingAmount: '20' }
            ]
            const sorted = sortRemainingItems(itemsWithNaN, 'remaining', 'desc')
            expect(sorted[0].numbers).toBe('22')
            expect(sorted[1].numbers).toBe('11')
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run src/utils/__tests__/remainingSortHelper.test.js`
Expected: FAIL with "Cannot find module '../remainingSortHelper'"

- [ ] **Step 3: Implement `sortRemainingItems` in `src/utils/remainingSortHelper.js`**

Create `src/utils/remainingSortHelper.js`:
```javascript
/**
 * Sort remaining layoff bet items
 * 
 * @param {Array} items - List of remaining items
 * @param {'number'|'remaining'|'total'} sortBy - Sort column key
 * @param {'asc'|'desc'} sortOrder - Sort direction
 * @returns {Array} New sorted array
 */
export function sortRemainingItems(items, sortBy = 'number', sortOrder = 'asc') {
    if (!Array.isArray(items)) return []
    if (items.length <= 1) return [...items]

    return [...items].sort((a, b) => {
        if (sortBy === 'remaining') {
            const aRem = Number(a?.remainingAmount) || 0
            const bRem = Number(b?.remainingAmount) || 0
            const diff = aRem - bRem
            if (diff !== 0) {
                return sortOrder === 'asc' ? diff : -diff
            }
            // Tie-breaker: sort by numbers ascending
            return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
        }

        if (sortBy === 'total') {
            const aTot = Number(a?.totalAmount) || 0
            const bTot = Number(b?.totalAmount) || 0
            const diff = aTot - bTot
            if (diff !== 0) {
                return sortOrder === 'asc' ? diff : -diff
            }
            // Tie-breaker: sort by numbers ascending
            return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
        }

        // Default: sort by 'number'
        const aNum = String(a?.numbers ?? '')
        const bNum = String(b?.numbers ?? '')
        const digitDiff = aNum.length - bNum.length
        if (digitDiff !== 0) {
            return sortOrder === 'asc' ? digitDiff : -digitDiff
        }
        const cmp = aNum.localeCompare(bNum, undefined, { numeric: true })
        return sortOrder === 'asc' ? cmp : -cmp
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run src/utils/__tests__/remainingSortHelper.test.js`
Expected: PASS all tests

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/remainingSortHelper.js src/utils/__tests__/remainingSortHelper.test.js
git commit -m "feat(dealer): add sortRemainingItems helper with full unit test suite"
```

---

### Task 2: Integrate Sorting States and Interactive Headers into `RoundAccordionItem.jsx`

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`

**Interfaces:**
- Consumes: `sortRemainingItems` from `src/utils/remainingSortHelper.js`

- [ ] **Step 1: Import `sortRemainingItems` into `RoundAccordionItem.jsx`**

At the top of `RoundAccordionItem.jsx`:
```javascript
import { sortRemainingItems } from '../../utils/remainingSortHelper'
```

- [ ] **Step 2: Add sort states in `RoundAccordionItem.jsx`**

Around line 400 where remaining layoff states are defined:
```javascript
const [remainingSortBy, setRemainingSortBy] = useState('number') // 'number' | 'remaining' | 'total'
const [remainingSortOrder, setRemainingSortOrder] = useState('asc') // 'asc' | 'desc'
```

- [ ] **Step 3: Update `filteredRemainingItems` sorting**

Around line 5354:
Replace the hardcoded inline `.sort(...)` with `sortRemainingItems(..., remainingSortBy, remainingSortOrder)`.
```javascript
const rawRemainingItems = activeRemainingItems.filter(item => {
    if (!isBetTypeMatched(item.bet_type, inlineSelectedBetTypes)) return false
    if (isSearchActive && !isSearchNumberMatched(item.numbers, activeSearchNumbers, inlineIsCompositeSearch)) return false
    return true
})
const filteredRemainingItems = sortRemainingItems(rawRemainingItems, remainingSortBy, remainingSortOrder)
```

- [ ] **Step 4: Add toggle handler and update table headers in `inlineTab === 'remaining'`**

In `inlineTab === 'remaining'` table header (around line 5828):
```jsx
{(() => {
    const handleToggleSort = (colKey) => {
        if (remainingSortBy === colKey) {
            setRemainingSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setRemainingSortBy(colKey)
            setRemainingSortOrder(colKey === 'number' ? 'asc' : 'desc')
        }
    }
    return (
        <table className="inline-table">
            <thead>
                <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}></th>
                    <th 
                        onClick={() => handleToggleSort('number')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        title="คลิกเพื่อเรียงตามเลข (น้อยไปมาก / มากไปน้อย)"
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: remainingSortBy === 'number' ? 'var(--color-warning)' : 'inherit' }}>
                            เลข {remainingSortBy === 'number' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                        </span>
                    </th>
                    <th>ประเภท</th>
                    <th 
                        onClick={() => handleToggleSort('total')}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        title="คลิกเพื่อเรียงตามยอดรวม (มากไปน้อย / น้อยไปมาก)"
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: remainingSortBy === 'total' ? 'var(--color-warning)' : 'inherit' }}>
                            ยอดรวม {remainingSortBy === 'total' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                        </span>
                    </th>
                    <th 
                        onClick={() => handleToggleSort('remaining')}
                        style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                        title="คลิกเพื่อเรียงตามยอดเหลือ (มากไปน้อย / น้อยไปมาก)"
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', color: remainingSortBy === 'remaining' ? 'var(--color-warning)' : 'inherit' }}>
                            เหลือ {remainingSortBy === 'remaining' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                        </span>
                    </th>
                </tr>
            </thead>
            ...
        </table>
    )
})()}
```

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npm.cmd test`
Expected: All test suites PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add src/components/dealer/RoundAccordionItem.jsx
git commit -m "feat(dealer): enable clickable header sorting on remaining tab table"
```

---

### Task 3: Regression Testing & Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`
Expected: 43 test suites, 705+ tests all passing

- [ ] **Step 2: Verify git status is clean**

Run: `git status`
Expected: Working tree clean
