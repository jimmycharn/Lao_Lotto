# Design Specification: Dealer Remaining Tab Sorting (การเรียงลำดับแท็บยอดเหลือ)

**Date**: 2026-10-09  
**Status**: Approved by User  
**Target File**: `src/components/dealer/RoundAccordionItem.jsx`

---

## 1. Background & Goals
In the dealer management interface, within each round's accordion view, the **"ยอดเหลือ" (Remaining)** tab displays filtered remaining bet items with their number, bet type, total amount received, and remaining amount (`remainingAmount`).

Previously, items in this tab were only sorted ascending by number digit length and numeric value. The user requested the ability to sort these items by:
1. **Numbers ("เลข")**: Ascending (0-9) and Descending (9-0)
2. **Amounts ("เงิน")**: Ascending and Descending, prioritizing **"ยอดเหลือ" (Remaining Amount)** and optionally **"ยอดรวม" (Total Amount)**
3. **UI Requirement**: Clean, uncluttered, intuitive, and mobile-friendly without adding unnecessary buttons or clutter to the screen.

---

## 2. User-Approved Design

### 2.1 Clickable Table Headers (หัวตารางคลิกได้)
Instead of adding extra toolbar rows, the column headers in the `<thead>` of the table will be interactive:
- **`เลข` (Number)**:
  - Default: `asc` (0-9)
  - Clicking toggles between `asc` (0-9) `↑` and `desc` (9-0) `↓`
- **`เหลือ` (Remaining Amount)**:
  - Default when activated: `desc` (highest remaining amount first) `↓`
  - Clicking toggles between `desc` `↓` and `asc` `↑`
- **`ยอดรวม` (Total Amount)**:
  - Default when activated: `desc` (highest total amount first) `↓`
  - Clicking toggles between `desc` `↓` and `asc` `↑`

### 2.2 Visual Indicators (สัญลักษณ์และการแสดงผล)
- Active column: Highlighted with `color: var(--color-warning, #f59e0b)` and displays directional arrow (`↑` for asc, `↓` for desc).
- Inactive column: Shows muted sortable indicator `↕` on hover or subtle styling.
- `cursor: pointer`, `userSelect: none` for smooth interaction.
- Title tooltip on header cells describing the toggle action (e.g. `คลิกเพื่อเรียงลำดับตามยอดเหลือ`).

---

## 3. Implementation Details

### 3.1 State Management in `RoundAccordionItem.jsx`
Add the following state hooks in `RoundAccordionItem.jsx`:
```javascript
const [remainingSortBy, setRemainingSortBy] = useState('number') // 'number' | 'remaining' | 'total'
const [remainingSortOrder, setRemainingSortOrder] = useState('asc') // 'asc' | 'desc'
```

### 3.2 Toggle Handler
```javascript
const handleToggleRemainingSort = (columnKey) => {
    if (remainingSortBy === columnKey) {
        setRemainingSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
        setRemainingSortBy(columnKey)
        // If sorting by amounts ('remaining' or 'total'), default to 'desc' (highest first)
        // If sorting by 'number', default to 'asc' (0-9)
        setRemainingSortOrder(columnKey === 'number' ? 'asc' : 'desc')
    }
}
```

### 3.3 Sorting Logic
When generating `filteredRemainingItems`:
```javascript
const sortedRemainingItems = [...filteredRemainingItems].sort((a, b) => {
    if (remainingSortBy === 'number') {
        const aNum = String(a?.numbers ?? '')
        const bNum = String(b?.numbers ?? '')
        const digitDiff = aNum.length - bNum.length
        if (digitDiff !== 0) {
            return remainingSortOrder === 'asc' ? digitDiff : -digitDiff
        }
        const cmp = aNum.localeCompare(bNum, undefined, { numeric: true })
        return remainingSortOrder === 'asc' ? cmp : -cmp
    }

    if (remainingSortBy === 'remaining') {
        const aRem = Number(a?.remainingAmount) || 0
        const bRem = Number(b?.remainingAmount) || 0
        const diff = aRem - bRem
        if (diff !== 0) {
            return remainingSortOrder === 'asc' ? diff : -diff
        }
        // Tie-breaker: sort by number ascending
        return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
    }

    if (remainingSortBy === 'total') {
        const aTot = Number(a?.totalAmount) || 0
        const bTot = Number(b?.totalAmount) || 0
        const diff = aTot - bTot
        if (diff !== 0) {
            return remainingSortOrder === 'asc' ? diff : -diff
        }
        // Tie-breaker: sort by number ascending
        return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
    }

    return 0
})
```

### 3.4 Table Header JSX
```jsx
<thead>
    <tr>
        <th style={{ width: '36px', textAlign: 'center' }}></th>
        <th 
            onClick={() => handleToggleRemainingSort('number')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="คลิกเพื่อเรียงตามเลข"
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: remainingSortBy === 'number' ? 'var(--color-warning)' : 'inherit' }}>
                เลข {remainingSortBy === 'number' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
            </span>
        </th>
        <th>ประเภท</th>
        <th 
            onClick={() => handleToggleRemainingSort('total')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="คลิกเพื่อเรียงตามยอดรวม"
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: remainingSortBy === 'total' ? 'var(--color-warning)' : 'inherit' }}>
                ยอดรวม {remainingSortBy === 'total' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
            </span>
        </th>
        <th 
            onClick={() => handleToggleRemainingSort('remaining')}
            style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
            title="คลิกเพื่อเรียงตามยอดเหลือ"
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', color: remainingSortBy === 'remaining' ? 'var(--color-warning)' : 'inherit' }}>
                เหลือ {remainingSortBy === 'remaining' ? (remainingSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
            </span>
        </th>
    </tr>
</thead>
```

---

## 4. Verification & Testing
1. **Unit Tests**:
   - Create unit tests verifying sorting logic for remaining items:
     - Number sort (asc & desc) with different digit lengths and same digit lengths.
     - Remaining amount sort (asc & desc) with tie-breakers.
     - Total amount sort (asc & desc) with tie-breakers.
2. **UI Verification**:
   - Verify table headers render correctly, toggle on click, and maintain active sorting state.
3. **Regression Testing**:
   - Run existing Vitest test suite (`npm.cmd test`) to ensure no broken functionality.
