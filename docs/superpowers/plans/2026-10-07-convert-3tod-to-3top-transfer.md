# Convert 3-Tod to 3-Top Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เจ้ามือสามารถเปิด/ปิดโหมดแปลงยอดเกิน 3 ตัวโต๊ดเป็น 3 ตัวตรง (คำนวณ permutation และปัดเศษขึ้นด้วย Math.ceil) ในแท็บยอดเกิน พร้อมรวมยอดกับ 3 ตัวตรงเดิมที่มีอยู่ (Approach A) ตีออกไปยังเจ้ามือปลายทาง ตัดยอดโต๊ดเดิมออก และแสดงผลพร้อมเอาคืนได้สมบูรณ์

**Architecture:** สร้างโมดูลคำนวณแยกต่างหาก `src/utils/layoffTodConverter.js` พร้อม Unit Tests สำหรับการแตก Permutation, การปัดเศษขึ้น, การ Merge รายการ 3 ตัวตรงเดิม, และการเข้ารหัส/ถอดรหัส Metadata ใน `bet_transfers` แล้วนำมาเชื่อมโยงกับ UI และการคำนวณยอดเกินใน `RoundAccordionItem.jsx`

**Tech Stack:** React 19, JavaScript (ES Module), Supabase, Vitest

## Global Constraints
- ไม่ทำการปรับโครงสร้างตารางฐานข้อมูลโดยไม่จำเป็น (ใช้ field `notes` ใน `bet_transfers` สำหรับเก็บ metadata การแปลง เพื่อความเข้ากันได้ 100%)
- เคารพกฎ Domain: "งวดวันที่" ต้องเป็น `close_time` / `close_date`, ห้ามดึงข้อมูลเกิน 1,000 แถวโดยไม่ใช้ pagination, และห้ามลบ/แก้ไขข้อมูลผู้ใช้โดยพลการ
- การทดสอบทั้งหมดต้องผ่าน `vitest` และ `npm run build`

---

### Task 1: Create Permutation & Converter Utility (`src/utils/layoffTodConverter.js`)

**Files:**
- Create: `src/utils/layoffTodConverter.js`
- Test: `src/utils/layoffTodConverter.test.js`

**Interfaces:**
- Produces:
  - `get3DigitPermutations(numbers: string): string[]`
  - `convertTodItemToTopItems(todItem: object): object[]`
  - `mergeTodToTopExcessItems(excessItems: object[]): object[]`
  - `encodeTodConversionNote(item: object, userNote?: string): string`
  - `parseTodConversionNote(note?: string): object | null`

- [ ] **Step 1: Write tests for permutations, ceiling math, and item conversion**

Create `src/utils/layoffTodConverter.test.js`:
```javascript
import { describe, it, expect } from 'vitest'
import {
    get3DigitPermutations,
    convertTodItemToTopItems,
    mergeTodToTopExcessItems,
    encodeTodConversionNote,
    parseTodConversionNote
} from './layoffTodConverter'

describe('layoffTodConverter', () => {
    describe('get3DigitPermutations', () => {
        it('should return 6 permutations for unique 3 digits', () => {
            const perms = get3DigitPermutations('123')
            expect(perms).toHaveLength(6)
            expect(perms.sort()).toEqual(['123', '132', '213', '231', '312', '321'].sort())
        })

        it('should return 3 permutations for double digits', () => {
            const perms = get3DigitPermutations('122')
            expect(perms).toHaveLength(3)
            expect(perms.sort()).toEqual(['122', '212', '221'].sort())
        })

        it('should return 1 permutation for triple digits', () => {
            const perms = get3DigitPermutations('111')
            expect(perms).toHaveLength(1)
            expect(perms).toEqual(['111'])
        })

        it('should fallback to original string if not 3 digits', () => {
            expect(get3DigitPermutations('25')).toEqual(['25'])
        })
    })

    describe('convertTodItemToTopItems', () => {
        it('should divide excess amount and ceil correctly (exact division)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 6
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.bet_type).toBe('3_top')
                expect(item.excess).toBe(1)
                expect(item.isConvertedFromTod).toBe(true)
                expect(item.originalTodNumbers).toBe('123')
                expect(item.originalTodExcess).toBe(6)
            })
        })

        it('should apply Math.ceil when excess is not evenly divisible (123=5 -> 1 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 5
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(1) // Math.ceil(5/6) = 1
            })
        })

        it('should apply Math.ceil for double digits (122=25 -> 9 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '122',
                excess: 25
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(3)
            converted.forEach(item => {
                expect(item.excess).toBe(9) // Math.ceil(25/3) = 9
            })
        })

        it('should calculate for screenshot example (123=200 -> 34 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 200
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(34) // Math.ceil(200/6) = 34
            })
        })
    })

    describe('mergeTodToTopExcessItems (Approach A)', () => {
        it('should merge converted item with existing 3_top item of same number', () => {
            const excessItems = [
                { bet_type: '2_top', numbers: '25', excess: 1000 },
                { bet_type: '3_tod', numbers: '123', excess: 200 },
                { bet_type: '3_top', numbers: '123', excess: 380 }
            ]
            const merged = mergeTodToTopExcessItems(excessItems)
            
            // 2_top stays untouched
            expect(merged.find(i => i.bet_type === '2_top' && i.numbers === '25')).toBeDefined()
            // 3_tod is removed/converted
            expect(merged.find(i => i.bet_type === '3_tod')).toBeUndefined()
            
            // 123 3_top is merged
            const item123 = merged.find(i => i.bet_type === '3_top' && i.numbers === '123')
            expect(item123).toBeDefined()
            expect(item123.excess).toBe(414) // 380 + 34
            expect(item123.isMergedWithTod).toBe(true)
            expect(item123.originalTopExcess).toBe(380)
            expect(item123.convertedTodExcess).toBe(34)
            expect(item123.originalTodNumbers).toBe('123')
            expect(item123.originalTodFullExcess).toBe(200)

            // other permutations are separate standalone 3_top items
            const item132 = merged.find(i => i.bet_type === '3_top' && i.numbers === '132')
            expect(item132).toBeDefined()
            expect(item132.excess).toBe(34)
            expect(item132.isConvertedFromTod).toBe(true)
        })
    })

    describe('encodeTodConversionNote & parseTodConversionNote', () => {
        it('should encode and decode metadata correctly', () => {
            const item = {
                isConvertedFromTod: true,
                originalTodNumbers: '123',
                originalTodExcess: 200,
                convertedTodExcess: 34,
                isMergedWithTod: true,
                originalTopExcess: 380
            }
            const note = encodeTodConversionNote(item, 'ส่งเจ้ามือใหญ่')
            expect(note).toContain('[TOD_CONV:')
            expect(note).toContain('ส่งเจ้ามือใหญ่')

            const parsed = parseTodConversionNote(note)
            expect(parsed).toBeDefined()
            expect(parsed.originalTodNumbers).toBe('123')
            expect(parsed.originalTodExcess).toBe(200)
            expect(parsed.isMergedWithTod).toBe(true)
            expect(parsed.userNote).toBe('ส่งเจ้ามือใหญ่')
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run src/utils/layoffTodConverter.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/utils/layoffTodConverter.js`**

Create `src/utils/layoffTodConverter.js`:
```javascript
/**
 * Utility for converting 3-tod excess bets to 3-top permutations.
 */

/**
 * Returns all unique permutations of a 3-digit string.
 * @param {string} numbers - 3 digit number string, e.g. "123", "122", "111"
 * @returns {string[]} Array of unique permutation strings
 */
export function get3DigitPermutations(numbers) {
    if (!numbers || typeof numbers !== 'string' || numbers.length !== 3) {
        return [numbers || '']
    }
    const chars = numbers.split('')
    const permutations = new Set()
    
    // Generate permutations
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (j === i) continue
            for (let k = 0; k < 3; k++) {
                if (k === i || k === j) continue
                permutations.add(chars[i] + chars[j] + chars[k])
            }
        }
    }
    return Array.from(permutations)
}

/**
 * Converts a 3_tod excess item into an array of 3_top items.
 * Applies Math.ceil(excess / perms.length) for each permutation.
 * @param {object} todItem - Excess item with bet_type === '3_tod'
 * @returns {object[]} Array of converted 3_top items
 */
export function convertTodItemToTopItems(todItem) {
    const perms = get3DigitPermutations(todItem.numbers)
    const perPermExcess = Math.ceil(todItem.excess / perms.length)

    return perms.map(num => ({
        ...todItem,
        bet_type: '3_top',
        numbers: num,
        excess: perPermExcess,
        isConvertedFromTod: true,
        isMergedWithTod: false,
        originalTodNumbers: todItem.numbers,
        originalTodExcess: todItem.excess,
        originalTodFullExcess: todItem.excess,
        convertedTodExcess: perPermExcess,
        convertedPermutationsCount: perms.length
    }))
}

/**
 * Merges tod-converted 3_top items with existing 3_top items in the excessItems list.
 * Approach A: Same number is combined into a single row.
 * @param {object[]} excessItems - Full list of excess items
 * @returns {object[]} Transformed excess items
 */
export function mergeTodToTopExcessItems(excessItems) {
    const nonTodItems = []
    const todItems = []

    excessItems.forEach(item => {
        if (item.bet_type === '3_tod') {
            todItems.push(item)
        } else {
            nonTodItems.push({ ...item })
        }
    })

    if (todItems.length === 0) {
        return nonTodItems
    }

    // Convert all tod items
    const convertedItems = []
    todItems.forEach(tod => {
        convertedItems.push(...convertTodItemToTopItems(tod))
    })

    // Index non-tod items by bet_type|numbers
    const resultMap = new Map()
    nonTodItems.forEach(item => {
        resultMap.set(`${item.bet_type}|${item.numbers}`, item)
    })

    // Merge converted items
    convertedItems.forEach(conv => {
        const key = `3_top|${conv.numbers}`
        if (resultMap.has(key)) {
            const existing = resultMap.get(key)
            resultMap.set(key, {
                ...existing,
                excess: (existing.excess || 0) + conv.excess,
                isMergedWithTod: true,
                isConvertedFromTod: true,
                originalTopExcess: existing.excess || 0,
                convertedTodExcess: conv.excess,
                originalTodNumbers: conv.originalTodNumbers,
                originalTodFullExcess: conv.originalTodFullExcess,
                convertedPermutationsCount: conv.convertedPermutationsCount
            })
        } else {
            resultMap.set(key, conv)
        }
    })

    return Array.from(resultMap.values())
}

const METADATA_PREFIX = '[TOD_CONV:'
const METADATA_SUFFIX = ']'

/**
 * Encodes tod conversion metadata into a transfer note string.
 * @param {object} item - Excess item
 * @param {string} userNote - Optional user notes
 * @returns {string} Combined note string
 */
export function encodeTodConversionNote(item, userNote = '') {
    if (!item.isConvertedFromTod) return userNote || ''
    const meta = {
        orig_num: item.originalTodNumbers,
        orig_excess: item.originalTodFullExcess || item.originalTodExcess,
        allocated: item.convertedTodExcess,
        is_merged: !!item.isMergedWithTod,
        top_excess: item.originalTopExcess || 0
    }
    const metaStr = `${METADATA_PREFIX}${JSON.stringify(meta)}${METADATA_SUFFIX}`
    return userNote ? `${metaStr} ${userNote}` : metaStr
}

/**
 * Parses tod conversion metadata from a transfer note string.
 * @param {string} note - Transfer note
 * @returns {object|null} Parsed metadata with userNote, or null
 */
export function parseTodConversionNote(note) {
    if (!note || typeof note !== 'string') return null
    const startIdx = note.indexOf(METADATA_PREFIX)
    const endIdx = note.indexOf(METADATA_SUFFIX)
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null

    try {
        const jsonStr = note.slice(startIdx + METADATA_PREFIX.length, endIdx)
        const parsed = JSON.parse(jsonStr)
        const remainingNote = (note.slice(0, startIdx) + note.slice(endIdx + METADATA_SUFFIX.length)).trim()
        return {
            originalTodNumbers: parsed.orig_num,
            originalTodExcess: parsed.orig_excess,
            convertedTodExcess: parsed.allocated,
            isMergedWithTod: parsed.is_merged,
            originalTopExcess: parsed.top_excess,
            userNote: remainingNote
        }
    } catch {
        return null
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run src/utils/layoffTodConverter.test.js`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/layoffTodConverter.js src/utils/layoffTodConverter.test.js
git commit -m "feat: add layoff tod to top converter and permutation utility"
```

---

### Task 2: Integrate Toggle & Display in Excess Tab (`RoundAccordionItem.jsx`)

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`

**Interfaces:**
- Consumes:
  - `mergeTodToTopExcessItems` from `../../utils/layoffTodConverter`
  - `encodeTodConversionNote` from `../../utils/layoffTodConverter`

- [ ] **Step 1: Add State & Import in `RoundAccordionItem.jsx`**
  - Import `mergeTodToTopExcessItems`, `encodeTodConversionNote`, `parseTodConversionNote` from `../../utils/layoffTodConverter`
  - Add state `const [isConvertTodToTopActive, setIsConvertTodToTopActive] = useState(false)`
  - Modify `excessItems` definition:
    ```javascript
    const activeExcessItems = useMemo(() => {
        if (!isConvertTodToTopActive) return excessItems
        return mergeTodToTopExcessItems(excessItems)
    }, [excessItems, isConvertTodToTopActive])
    ```
  - Use `activeExcessItems` for filtering, statistics, and rendering within the excess tab.

- [ ] **Step 2: Add Toggle Button in Excess Tab Header**
  - In `inlineTab === 'excess'`, beside the `คัดลอก` button:
    Add toggle button:
    `[ 🔄 แปลงโต๊ดเป็นตรง: เปิด / ปิด ]` (highlighted in yellow when active)
  - When clicked, toggles `setIsConvertTodToTopActive(prev => !prev)`
  - Clear `selectedExcessItems` on toggle to prevent key mismatch between `3_tod` and `3_top`.

- [ ] **Step 3: Update Row Display in Excess Tab (Approach A)**
  - For items where `item.isMergedWithTod` is true:
    - Display sub-caption: `(ตรงเดิม ฿{item.originalTopExcess.toLocaleString()} + แปลงจากโต๊ด ฿{item.convertedTodExcess.toLocaleString()})`
  - For items where `item.isConvertedFromTod` is true but not merged:
    - Display badge / sub-caption: `💫 แตกจากโต๊ด {item.originalTodNumbers}`

- [ ] **Step 4: Update Transfer Creation (`handleSaveTransfer`) to Attach Note Metadata**
  - In `handleSaveTransfer`, when building transfer insert objects:
    - Use `encodeTodConversionNote(item, transferForm.notes)` for the `notes` field.
    - If `item.isConvertedFromTod` is true, ensure `bet_type: '3_top'`.

- [ ] **Step 5: Verify build & tests**
  Run `npx.cmd vitest run` and `npm.cmd run build`

- [ ] **Step 6: Commit Task 2**
```bash
git add src/components/dealer/RoundAccordionItem.jsx
git commit -m "feat: integrate tod-to-top toggle and row display in excess tab"
```

---

### Task 3: Support Tod Conversion in Excess Calculation & Transferred Display

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`

- [ ] **Step 1: Update `calculateExcessItems` in `RoundAccordionItem.jsx` to Deduct Converted Tod Transfers**
  - In `calculateExcessItems`, parse `parseTodConversionNote(t.notes)` for transfers where `t.bet_type === '3_top'`.
  - When calculating `transferredAmount` for a `3_tod` group:
    - Include transfers that were converted from this specific `3_tod` number (`meta.originalTodNumbers === group.numbers`).
    - This ensures that transferring the converted `3_top` completely clears the original `3_tod` from the excess list!
  - When calculating `transferredAmount` for a `3_top` group:
    - If a transfer was a merged transfer, only count the `meta.originalTopExcess` portion against `3_top` (or the transfer's portion).

- [ ] **Step 2: Update Transferred Tab Display (`inlineTab === 'transferred'`)**
  - In `inlineTab === 'transferred'`, for each transfer row, check `parseTodConversionNote(t.notes)`.
  - If it has metadata, display a neat badge: `💫 แปลงจากโต๊ด ${meta.originalTodNumbers}`.
  - Verify that when the user clicks "เอาคืน" (`handleRevertTransfers`), the transfer rows are deleted, and `calculateExcessItems()` naturally restores the original `3_tod` back to the excess tab!

- [ ] **Step 3: Run full verification suite**
  - Run `npx.cmd vitest run`
  - Run `npm.cmd run build`

- [ ] **Step 4: Commit Task 3**
```bash
git add src/components/dealer/RoundAccordionItem.jsx
git commit -m "feat: support tod deduction in excess calculation and transferred badge"
```
