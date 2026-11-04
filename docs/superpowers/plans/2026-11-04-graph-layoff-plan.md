# Graph-based Layoff (การตีออกด้วยการตัดจากกราฟ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement visual graph-based layoff cutting where dealers can view accumulated numbers on a bar chart and set 1 or 2 horizontal threshold lines to slice and accumulate bets for layoff.

**Architecture:**
A dedicated pure calculation module (`graphLayoffCalculator.js`) encapsulates all domain rules, line matching, amount slicing, and basket aggregation. A high-performance interactive modal (`GraphLayoffModal.jsx`) renders a 60fps responsive HTML5 Canvas/SVG chart supporting drag-and-drop lines, mobile touch pills, keyboard shortcuts, and a staging basket drawer. `RoundAccordionItem.jsx` integrates the modal seamlessly into both the "ยอดเหลือ" (Remaining) and "ยอดเกิน" (Excess) tabs.

**Tech Stack:**
React 18/19, Vite, HTML5 Canvas / SVG, CSS variables, Vitest.

## Global Constraints
- "งวดวันที่" must be close_time/close_date (Rule 1).
- Supabase 1,000 row pagination limit compliance (Rule 2).
- Zero deletion or destructive mutation of database records without explicit user confirmation (Rule 3).
- Mobile & desktop responsive support (pointer events for touch/mouse, on-screen controls for mobile).

---

### Task 1: Core Graph Layoff Calculation Logic & Unit Tests

**Files:**
- Create: `src/utils/graphLayoffCalculator.js`
- Test: `src/utils/__tests__/graphLayoffCalculator.test.js`

**Interfaces:**
- Consumes: Raw bet item array `{ numbers, bet_type, excess?, remainingAmount?, totalAmount? }`
- Produces:
  - `getNumberDomainForCategory(category: '3_digit' | '2_digit' | 'run'): string[]`
  - `mapBetTypeToCategory(betType: string): '3_digit' | '2_digit' | 'run' | null`
  - `groupItemsByNumber(items: any[], category: string): Record<string, { numbers: string, totalAmount: number, items: any[] }>`
  - `evaluateLineCut({ amount: number, lineCount: 1 | 2, singleLine?: number, upperLine?: number, lowerLine?: number, cutMode: 'above' | 'below' | 'between' | 'outside', amountMode: 'difference' | 'full' }): { isMatched: boolean, cutAmount: number, retainedAmount: number }`
  - `calculateGraphCuts({ buckets: Record<string, any>, lineCount: 1 | 2, singleLine?: number, upperLine?: number, lowerLine?: number, cutMode: string, amountMode: string }): { matchedNumbersCount: number, totalCutAmount: number, cutItems: any[] }`
  - `aggregateStagedLayoffItems(existingBasket: any[], newCutItems: any[]): any[]`

- [ ] **Step 1: Write the failing unit tests for calculations**

Create `src/utils/__tests__/graphLayoffCalculator.test.js`:
```javascript
import { describe, it, expect } from 'vitest'
import {
    getNumberDomainForCategory,
    mapBetTypeToCategory,
    groupItemsByNumber,
    evaluateLineCut,
    calculateGraphCuts,
    aggregateStagedLayoffItems
} from '../graphLayoffCalculator'

describe('graphLayoffCalculator', () => {
    describe('getNumberDomainForCategory', () => {
        it('returns 1000 items from 000 to 999 for 3_digit', () => {
            const domain = getNumberDomainForCategory('3_digit')
            expect(domain).toHaveLength(1000)
            expect(domain[0]).toBe('000')
            expect(domain[999]).toBe('999')
        })

        it('returns 100 items from 00 to 99 for 2_digit', () => {
            const domain = getNumberDomainForCategory('2_digit')
            expect(domain).toHaveLength(100)
            expect(domain[0]).toBe('00')
            expect(domain[99]).toBe('99')
        })

        it('returns 10 items from 0 to 9 for run', () => {
            const domain = getNumberDomainForCategory('run')
            expect(domain).toHaveLength(10)
            expect(domain[0]).toBe('0')
            expect(domain[9]).toBe('9')
        })
    })

    describe('mapBetTypeToCategory', () => {
        it('maps 3-digit bet types correctly', () => {
            expect(mapBetTypeToCategory('3_top')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_tod')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_bottom')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_front')).toBe('3_digit')
        })

        it('maps 2-digit bet types correctly', () => {
            expect(mapBetTypeToCategory('2_top')).toBe('2_digit')
            expect(mapBetTypeToCategory('2_bottom')).toBe('2_digit')
        })

        it('maps run bet types correctly', () => {
            expect(mapBetTypeToCategory('run_top')).toBe('run')
            expect(mapBetTypeToCategory('run_bottom')).toBe('run')
        })
    })

    describe('groupItemsByNumber', () => {
        it('groups and sums items with identical numbers in the same category', () => {
            const items = [
                { numbers: '25', bet_type: '2_top', excess: 100 },
                { numbers: '25', bet_type: '2_bottom', excess: 50 },
                { numbers: '99', bet_type: '2_top', excess: 200 },
                { numbers: '123', bet_type: '3_top', excess: 500 } // different category
            ]
            const grouped = groupItemsByNumber(items, '2_digit')
            expect(grouped['25']).toBeDefined()
            expect(grouped['25'].totalAmount).toBe(150)
            expect(grouped['25'].items).toHaveLength(2)
            expect(grouped['99'].totalAmount).toBe(200)
            expect(grouped['123']).toBeUndefined()
        })
    })

    describe('evaluateLineCut (1 line)', () => {
        it('cuts above line with difference mode', () => {
            // amount = 500, line = 350 -> cut 150, keep 350
            const res = evaluateLineCut({
                amount: 500,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(150)
            expect(res.retainedAmount).toBe(350)
        })

        it('cuts above line with full amount mode', () => {
            // amount = 500, line = 350 -> cut 500, keep 0
            const res = evaluateLineCut({
                amount: 500,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(500)
            expect(res.retainedAmount).toBe(0)
        })

        it('ignores amount below line when mode is above', () => {
            const res = evaluateLineCut({
                amount: 300,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(false)
            expect(res.cutAmount).toBe(0)
            expect(res.retainedAmount).toBe(300)
        })

        it('cuts below line with full amount mode', () => {
            // amount = 100, line = 200 -> cut 100
            const res = evaluateLineCut({
                amount: 100,
                lineCount: 1,
                singleLine: 200,
                cutMode: 'below',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(100)
            expect(res.retainedAmount).toBe(0)
        })
    })

    describe('evaluateLineCut (2 lines)', () => {
        it('cuts between lines with difference mode', () => {
            // lower = 100, upper = 400, amount = 250 -> cut (250 - 100) = 150
            const res = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'between',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(150)
            expect(res.retainedAmount).toBe(100)
        })

        it('cuts between lines with full amount mode', () => {
            const res = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'between',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(250)
            expect(res.retainedAmount).toBe(0)
        })

        it('cuts outside lines (both above upper and below lower)', () => {
            // Case A: above upper (500 > 400)
            const resA = evaluateLineCut({
                amount: 500,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(resA.isMatched).toBe(true)
            expect(resA.cutAmount).toBe(100) // 500 - 400

            // Case B: below lower (80 < 100)
            const resB = evaluateLineCut({
                amount: 80,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'full'
            })
            expect(resB.isMatched).toBe(true)
            expect(resB.cutAmount).toBe(80)

            // Case C: between lines (250) -> not matched
            const resC = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(resC.isMatched).toBe(false)
            expect(resC.cutAmount).toBe(0)
        })
    })

    describe('aggregateStagedLayoffItems', () => {
        it('merges new cuts with existing basket summing amounts for identical numbers and bet types', () => {
            const existingBasket = [
                { numbers: '872', bet_type: '3_top', excess: 100, display_bet_type: '3 ตัวบน' },
                { numbers: '25', bet_type: '2_top', excess: 50, display_bet_type: '2 ตัวบน' }
            ]
            const newCuts = [
                { numbers: '872', bet_type: '3_top', excess: 50, display_bet_type: '3 ตัวบน' }, // repeat
                { numbers: '99', bet_type: '2_bottom', excess: 200, display_bet_type: '2 ตัวล่าง' } // new
            ]

            const merged = aggregateStagedLayoffItems(existingBasket, newCuts)
            expect(merged).toHaveLength(3)

            const item872 = merged.find(i => i.numbers === '872' && i.bet_type === '3_top')
            expect(item872.excess).toBe(150)

            const item25 = merged.find(i => i.numbers === '25')
            expect(item25.excess).toBe(50)

            const item99 = merged.find(i => i.numbers === '99')
            expect(item99.excess).toBe(200)
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/utils/__tests__/graphLayoffCalculator.test.js`  
Expected: FAIL with "Cannot find module '../graphLayoffCalculator'"

- [ ] **Step 3: Implement `src/utils/graphLayoffCalculator.js`**

Create `src/utils/graphLayoffCalculator.js`:
```javascript
/**
 * Pure functions for Graph-based Layoff calculations.
 */

export function getNumberDomainForCategory(category) {
    if (category === '3_digit') {
        const arr = new Array(1000)
        for (let i = 0; i < 1000; i++) {
            arr[i] = String(i).padStart(3, '0')
        }
        return arr
    }
    if (category === '2_digit') {
        const arr = new Array(100)
        for (let i = 0; i < 100; i++) {
            arr[i] = String(i).padStart(2, '0')
        }
        return arr
    }
    if (category === 'run') {
        const arr = new Array(10)
        for (let i = 0; i < 10; i++) {
            arr[i] = String(i)
        }
        return arr
    }
    return []
}

export function mapBetTypeToCategory(betType) {
    if (!betType) return null
    if (['3_top', '3_tod', '3_bottom', '3_front'].includes(betType)) return '3_digit'
    if (['2_top', '2_bottom'].includes(betType)) return '2_digit'
    if (['run_top', 'run_bottom'].includes(betType)) return 'run'
    if (betType.startsWith('4_')) return '4_digit'
    return null
}

export function groupItemsByNumber(items, category) {
    const grouped = {}
    if (!Array.isArray(items)) return grouped

    items.forEach(item => {
        if (!item || !item.numbers) return
        const cat = mapBetTypeToCategory(item.bet_type)
        if (cat !== category) return

        const numStr = String(item.numbers)
        const amt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
        if (amt <= 0) return

        if (!grouped[numStr]) {
            grouped[numStr] = {
                numbers: numStr,
                totalAmount: 0,
                items: []
            }
        }
        grouped[numStr].totalAmount += amt
        grouped[numStr].items.push(item)
    })

    return grouped
}

export function evaluateLineCut({
    amount,
    lineCount,
    singleLine = 0,
    upperLine = 0,
    lowerLine = 0,
    cutMode = 'above',
    amountMode = 'difference'
}) {
    const numAmt = Number(amount) || 0
    if (numAmt <= 0) {
        return { isMatched: false, cutAmount: 0, retainedAmount: 0 }
    }

    if (lineCount === 1) {
        const line = Number(singleLine) || 0
        if (cutMode === 'above') {
            if (numAmt > line) {
                const cut = amountMode === 'difference' ? numAmt - line : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        } else if (cutMode === 'below') {
            if (numAmt < line) {
                const cut = amountMode === 'difference' ? numAmt : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: 0
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        }
    }

    if (lineCount === 2) {
        const upper = Math.max(Number(upperLine) || 0, Number(lowerLine) || 0)
        const lower = Math.min(Number(upperLine) || 0, Number(lowerLine) || 0)

        if (cutMode === 'between') {
            if (numAmt >= lower && numAmt <= upper) {
                const cut = amountMode === 'difference' ? numAmt - lower : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        } else if (cutMode === 'outside') {
            if (numAmt > upper) {
                const cut = amountMode === 'difference' ? numAmt - upper : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            if (numAmt < lower) {
                return {
                    isMatched: true,
                    cutAmount: numAmt,
                    retainedAmount: 0
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        }
    }

    return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
}

export function calculateGraphCuts({
    buckets = {},
    lineCount = 1,
    singleLine = 0,
    upperLine = 0,
    lowerLine = 0,
    cutMode = 'above',
    amountMode = 'difference'
}) {
    let matchedNumbersCount = 0
    let totalCutAmount = 0
    const cutItems = []

    Object.values(buckets).forEach(bucket => {
        const evalRes = evaluateLineCut({
            amount: bucket.totalAmount,
            lineCount,
            singleLine,
            upperLine,
            lowerLine,
            cutMode,
            amountMode
        })

        if (evalRes.isMatched && evalRes.cutAmount > 0) {
            matchedNumbersCount += 1
            totalCutAmount += evalRes.cutAmount

            // Allocate cutAmount across underlying items proportionally or sequentially
            let remainingCutToAllocate = evalRes.cutAmount
            const items = bucket.items || []

            for (let i = 0; i < items.length; i++) {
                if (remainingCutToAllocate <= 0) break
                const item = items[i]
                const itemAmt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
                const itemCut = Math.min(itemAmt, remainingCutToAllocate)

                if (itemCut > 0) {
                    cutItems.push({
                        ...item,
                        excess: itemCut,
                        originalExcess: itemAmt,
                        cutFromGraph: true
                    })
                    remainingCutToAllocate -= itemCut
                }
            }
        }
    })

    return {
        matchedNumbersCount,
        totalCutAmount,
        cutItems
    }
}

export function aggregateStagedLayoffItems(existingBasket = [], newCutItems = []) {
    const map = new Map()

    existingBasket.forEach(item => {
        const key = `${item.bet_type}|${item.numbers}`
        map.set(key, { ...item, excess: Number(item.excess) || 0 })
    })

    newCutItems.forEach(item => {
        const key = `${item.bet_type}|${item.numbers}`
        const amt = Number(item.excess) || 0
        if (map.has(key)) {
            const existing = map.get(key)
            existing.excess += amt
        } else {
            map.set(key, { ...item, excess: amt })
        }
    })

    return Array.from(map.values()).filter(item => (item.excess || 0) > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/utils/__tests__/graphLayoffCalculator.test.js`  
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/graphLayoffCalculator.js src/utils/__tests__/graphLayoffCalculator.test.js
git commit -m "feat(layoff): add pure calculation helper and unit tests for graph-based layoff"
```

---

### Task 2: Interactive High-Performance Graph Component (`GraphLayoffModal.jsx`)

**Files:**
- Create: `src/components/dealer/GraphLayoffModal.jsx`
- Create: `src/components/dealer/__tests__/GraphLayoffModal.test.jsx`

**Interfaces:**
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `round: object` (contains `lottery_type`, `lottery_name`, `round_date`, `currency_symbol`)
  - `sourceTab: 'remaining' | 'excess'`
  - `items: any[]` (baseRemainingItems or activeExcessItems)
  - `onProceedToTransfer: (stagedItems: any[]) => void`

- [ ] **Step 1: Write failing component tests for `GraphLayoffModal.jsx`**

Create `src/components/dealer/__tests__/GraphLayoffModal.test.jsx`:
```jsx
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import GraphLayoffModal from '../GraphLayoffModal'

describe('GraphLayoffModal', () => {
    const mockRound = {
        lottery_type: 'lao',
        lottery_name: 'หวยลาวพัฒนา',
        currency_symbol: '฿'
    }

    const mockItems = [
        { numbers: '872', bet_type: '3_top', excess: 450 },
        { numbers: '25', bet_type: '2_top', excess: 150 },
        { numbers: '25', bet_type: '2_bottom', excess: 100 }
    ]

    it('renders modal header and category tabs when open', () => {
        render(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(screen.getByText(/ตัดยอดตีออกจากกราฟ/i)).toBeInTheDocument()
        expect(screen.getByText(/3 ตัว/i)).toBeInTheDocument()
        expect(screen.getByText(/2 ตัว/i)).toBeInTheDocument()
        expect(screen.getByText(/เลขวิ่ง/i)).toBeInTheDocument()
    })

    it('switches number category tabs correctly', () => {
        render(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="remaining"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        const tab2Digit = screen.getByRole('button', { name: /2 ตัว/i })
        fireEvent.click(tab2Digit)
        expect(tab2Digit).toHaveClass('active')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`  
Expected: FAIL with "Cannot find module '../GraphLayoffModal'"

- [ ] **Step 3: Implement `GraphLayoffModal.jsx`**

Create `src/components/dealer/GraphLayoffModal.jsx`:
- Build Canvas-based high-performance chart rendering:
  - `HTML5 Canvas` with devicePixelRatio resolution scaling.
  - Draw bars for domain: 1000 bars for 3-digit, 100 bars for 2-digit, 10 bars for run.
  - Highlight bars in `#f59e0b` / `#10b981` when matching active cut conditions.
  - Draw 1 or 2 horizontal lines with distinct colors (Line 1: Red `#ef4444`, Line 2: Blue `#3b82f6`).
  - Pointer event handlers for dragging lines with mouse or touch (`onPointerDown`, `onPointerMove`, `onPointerUp`).
  - Double-click on line or edit button triggers inline prompt to set exact price.
  - Keyboard listener: `window.addEventListener('keydown')` to remove active line on `Delete` / `Backspace`.
  - Mobile line pill badges with `✕` button to delete lines easily.
  - Tooltip tracking mouse/touch position to show number details.
  - Bottom summary bar with "✂️ ตัดยอดเข้าตะกร้า" button and staged basket drawer.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add src/components/dealer/GraphLayoffModal.jsx src/components/dealer/__tests__/GraphLayoffModal.test.jsx
git commit -m "feat(layoff): implement interactive GraphLayoffModal with canvas and line drag controls"
```

---

### Task 3: Staging Basket & Layoff Integration in `RoundAccordionItem.jsx`

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`
- Modify: `src/components/dealer/GraphLayoffModal.jsx`

**Interfaces:**
- `RoundAccordionItem.jsx`:
  - Adds state `[showGraphLayoffModal, setShowGraphLayoffModal] = useState(false)`
  - Adds state `[graphLayoffSource, setGraphLayoffSource] = useState('excess')`
  - Adds button `📊 ตัดจากกราฟ` in Remaining tab toolbar (around line 5830)
  - Adds button `📊 ตัดจากกราฟ` in Excess tab toolbar (around line 6035)
  - Handles `handleProceedFromGraph(stagedItems)`:
    - Prepares `selectedExcessItems` or `selectedRemainingItems` from `stagedItems`
    - Sets transfer modal initial types and opens `showTransferModal(true)` seamlessly

- [ ] **Step 1: Add modal opening buttons and state to `RoundAccordionItem.jsx`**

In `src/components/dealer/RoundAccordionItem.jsx`:
1. Add state:
   ```javascript
   const [showGraphLayoffModal, setShowGraphLayoffModal] = useState(false)
   const [graphLayoffSource, setGraphLayoffSource] = useState('excess')
   ```
2. In Remaining tab toolbar (near "ตีออก"):
   ```jsx
   <button
       type="button"
       className="btn btn-sm btn-outline"
       onClick={() => {
           setGraphLayoffSource('remaining')
           setShowGraphLayoffModal(true)
       }}
       title="เปิดดูกราฟและตัดยอดที่เหลือ"
       style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '6px' }}
   >
       <FiBarChart2 /> ตัดจากกราฟ
   </button>
   ```
3. In Excess tab toolbar (near "คัดลอก"):
   ```jsx
   <button
       type="button"
       className="btn btn-sm btn-outline"
       onClick={() => {
           setGraphLayoffSource('excess')
           setShowGraphLayoffModal(true)
       }}
       title="เปิดดูกราฟและตัดยอดเกิน"
       style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '6px' }}
   >
       <FiBarChart2 /> ตัดจากกราฟ
   </button>
   ```
4. Render `GraphLayoffModal` at the bottom of `RoundAccordionItem`:
   ```jsx
   {showGraphLayoffModal && (
       <GraphLayoffModal
           isOpen={showGraphLayoffModal}
           onClose={() => setShowGraphLayoffModal(false)}
           round={round}
           sourceTab={graphLayoffSource}
           items={graphLayoffSource === 'remaining' ? baseRemainingItems : activeExcessItems}
           onProceedToTransfer={(stagedItems) => {
               setShowGraphLayoffModal(false)
               handleOpenTransferFromGraph(stagedItems, graphLayoffSource)
           }}
       />
   )}
   ```
5. Implement `handleOpenTransferFromGraph`:
   Converts staged items into transfer target items, initializes bet types, sets `transferSource = graphLayoffSource`, and opens `setShowTransferModal(true)`.

- [ ] **Step 2: Run tests to ensure no regressions in existing round and layoff tests**

Run: `npm.cmd test -- src/components/dealer/`  
Expected: PASS

- [ ] **Step 3: Commit Task 3**

```bash
git add src/components/dealer/RoundAccordionItem.jsx src/components/dealer/GraphLayoffModal.jsx
git commit -m "feat(layoff): integrate GraphLayoffModal with RoundAccordionItem remaining and excess tabs"
```

---

### Task 4: Full System Verification & Production Build

**Files:**
- All modified & created files

- [ ] **Step 1: Run full unit test suite**

Run: `npm.cmd test`  
Expected: PASS (all test suites pass)

- [ ] **Step 2: Run production build check**

Run: `npm.cmd run build`  
Expected: PASS (vite production build succeeds with exit code 0)

- [ ] **Step 3: Commit final adjustments (if any)**

```bash
git commit -m "chore(layoff): finalize graph-based layoff feature with complete tests"
```
