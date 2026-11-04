# Design Specification: Graph-based Layoff / Cut-off (การตีออกด้วยการตัดจากกราฟ)

**Date**: 2026-11-04  
**Status**: Approved by User  
**Target Files**:
- `src/components/dealer/GraphLayoffModal.jsx` (New Component)
- `src/components/dealer/RoundAccordionItem.jsx` (Entry points & Integration)
- `src/utils/graphLayoffCalculator.js` (Pure helper functions for cut logic & aggregation)
- `src/utils/__tests__/graphLayoffCalculator.test.js` (Unit Tests)

---

## 1. Background & Goals
In lottery dealership management, dealers need to manage their risk and retain limits for each number across the round. In existing legacy desktop lottery programs, dealers frequently use a visual bar graph where the X-axis represents all numbers and the Y-axis represents the accumulated bet amount. By setting one or two horizontal threshold price lines across the chart, dealers can visually "cut off" (ตีออก) batches of numbers exceeding their risk tolerance or below their interest threshold.

The user requested adding this visual cut-off feature to the web application:
1. Available from both **"ยอดเหลือ" (Remaining)** and **"ยอดเกิน" (Excess)** tabs in each active round.
2. Displays the numbers of selected bet types as a bar chart, summing up bet amounts for identical numbers.
3. Groups numbers into standard length categories: **3 ตัว (000–999)**, **2 ตัว (00–99)**, and **เลขวิ่ง (0–9)**.
4. Allows drawing up to **2 horizontal price lines** (draggable via mouse/touch, double-clickable to set exact value, deletable via keyboard `Delete` or touch-friendly UI buttons).
5. Supports cutting modes:
   - **1 Line**: Cut above line (ตัดบนเส้น) OR Cut below line (ตัดล่างเส้น).
   - **2 Lines**: Cut between lines (ตัดระหว่างเส้น) OR Cut outside lines (ตัดนอกเส้น).
   - **Amount mode**: Option to cut only the excess difference (`amount - line`) OR the full amount of the qualifying numbers.
6. Includes a **Staging Basket (ตะกร้าพักยอดตีออก)** so dealers can cut in multiple steps (e.g. cut 3-digit numbers first, then switch to cut 2-digit numbers) and accumulate amounts for the same number into a unified layoff transfer.

---

## 2. User-Approved Design

### 2.1 Entry Points in `RoundAccordionItem.jsx`
- In both the **"ยอดเหลือ" (Remaining)** and **"ยอดเกิน" (Excess)** tabs, add a dedicated button:
  - Label: `📊 ตัดจากกราฟ` (or `📊 ตัดยอดจากกราฟ`)
  - Styled cleanly alongside the existing toolbar buttons.
  - Clicking this button opens `GraphLayoffModal` with the current round and source context (`sourceTab = 'remaining' | 'excess'`).

### 2.2 Modal Structure (`GraphLayoffModal.jsx`)
Full-screen / large responsive modal (`max-width: 96vw`, `height: 92vh` on desktop; full screen on mobile) containing:

#### A. Header
- Title: `📊 ตัดยอดตีออกจากกราฟ - [ชื่อหวย] ([งวดวันที่])`
- Source indicator badge: `แท็บ: ยอดเหลือ` หรือ `แท็บ: ยอดเกิน`
- Number group selector tabs:
  - `🎯 3 ตัว (000-999)`
  - `🎯 2 ตัว (00-99)`
  - `🎯 เลขวิ่ง (0-9)`
- Close button (`✕`)

#### B. Control Toolbar (แผงควบคุมเงื่อนไขการตัด)
1. **Line Management**:
   - `[+ เพิ่มเส้นราคา]` (Disabled if already 2 lines active).
   - **Line Badges (Pills)**:
     - Line 1 (Red `#ef4444`): Shows price e.g. `เส้นบน: ฿350`
       - Click/Double-click or tap `✎` to edit price via numeric prompt/modal.
       - Click `✕` (or press `Delete` when selected) to remove line.
     - Line 2 (Blue `#3b82f6`): Shows price e.g. `เส้นล่าง: ฿100`
       - Click/Double-click or tap `✎` to edit price.
       - Click `✕` to remove line.
2. **Cut Mode Selector (เงื่อนไขการตัด)**:
   - *When 1 line is set*:
     - `🔴 ตัดบนเส้น (ยอดเกิน)`: Numbers where `amount > Line`
     - `🔵 ตัดล่างเส้น (ยอดต่ำกว่า)`: Numbers where `amount < Line`
   - *When 2 lines are set* (Automatically ordered as `UpperLine` and `LowerLine`):
     - `🟡 ตัดระหว่างเส้น`: Numbers where `LowerLine <= amount <= UpperLine`
     - `🟣 ตัดนอกเส้น`: Numbers where `amount > UpperLine || amount < LowerLine`
3. **Amount Calculation Switch (รูปแบบยอดที่จะตัด)**:
   - Radio or Pill toggle:
     - `ตัดเฉพาะส่วนต่าง (ส่วนเกิน/ส่วนขาด)`:
       - If above upper line: `excess = amount - upperLine`
       - If below lower line: `excess = lowerLine - amount` (capped at amount)
       - If between lines: `excess = amount - lowerLine`
     - `ตัดเต็มจำนวนของเลขนั้น`:
       - `excess = amount`
4. **Real-time Impact Summary**:
   - Displays live matching count: e.g. `เข้าเงื่อนไข: 142 เลข | ยอดตัดรวม: ฿45,200`
   - Button: `✂️ ตัดยอดเข้าตะกร้า`

#### C. Interactive Chart Canvas / SVG
- **Dimensions**: Full modal body width, responsive height (400px–500px).
- **X-Axis**:
  - For 3-digit: numbers `000` to `999` (1,000 slots).
  - For 2-digit: numbers `00` to `99` (100 slots).
  - For run: numbers `0` to `9` (10 slots).
  - Clean labeling with periodic interval ticks (e.g. every 20 or 50 numbers for 3-digit).
- **Y-Axis**:
  - Dynamically scaled from 0 up to `Math.max(highestBetAmount, upperLine) * 1.15`.
  - Grid lines with readable currency steps (e.g. 50, 100, 200, 500, etc.).
- **Bars**:
  - Each number has a vertical bar representing its total accumulated bet amount in the current category.
  - Numbers matching current line conditions are highlighted in vibrant gold `#f59e0b` or green `#10b981`.
  - Non-matching bars are styled in muted slate/dark gray.
  - Hover/Tap Tooltip: Shows number, total bet, calculated cut amount, and remaining amount after cut.
- **Horizontal Lines**:
  - Draggable horizontally across the entire width.
  - Smooth cursor styling (`ns-resize`).
  - Labeled tag at the right/left edge displaying the current threshold value (e.g. `฿350`).
  - Active line selection for keyboard `Delete`/`Backspace` handling.
  - Mobile touch handles for easy dragging on touchscreens.

#### D. Staging Basket & Layoff Execution (ตะกร้าพักยอดตีออก)
- Collapsible bottom drawer or sidebar:
  - Displays list of currently staged layoff items.
  - Aggregates by `bet_type` and `numbers`:
    - If number `872` was cut for 100 in step 1, and cut again for 50 in step 2 $\rightarrow$ aggregates to `150`.
  - Shows total staged items count and grand total amount.
  - `[ล้างตะกร้า]` button to clear staged cuts.
  - `[🚀 ดำเนินการส่งตีออก (X รายการ)]` button:
    - Bridges staged items directly into the existing `showTransferModal` or `showRemainingTransferModal` in `RoundAccordionItem.jsx`.
    - Dealer selects upstream dealer (เจ้ามือรับตีออก) and confirms submission.

---

## 3. Data Flow & Calculation Logic

### 3.1 Aggregating Input Data for the Graph
```javascript
// Input: items from either baseRemainingItems or activeExcessItems
// Filtered by active number category:
// - '3_digit': ['3_top', '3_tod', '3_bottom', '3_front']
// - '2_digit': ['2_top', '2_bottom']
// - 'run': ['run_top', 'run_bottom']

function buildGraphNumberBuckets(items, category) {
    const buckets = {}; // number -> { totalAmount: number, items: [] }
    // Initialize standard range if needed or populate sparse map
    ...
}
```

### 3.2 Evaluation of Line Cut Conditions
Pure functions in `src/utils/graphLayoffCalculator.js`:
- `evaluateSingleLineCut(amount, linePrice, mode, amountMode)`
  - `mode`: `'above'` | `'below'`
  - `amountMode`: `'difference'` | `'full'`
- `evaluateDoubleLineCut(amount, upperLine, lowerLine, mode, amountMode)`
  - `mode`: `'between'` | `'outside'`
  - `amountMode`: `'difference'` | `'full'`
- `aggregateStagedLayoffItems(existingBasket, newCutItems)`
  - Merges items sharing identical `(bet_type, numbers)`, summing their cut amounts.

---

## 4. Mobile & Touchscreen Considerations
1. **Line Controls**:
   - In addition to dragging the line, prominent pill chips `[เส้นบน: ฿350 ✎ ✕]` allow setting prices via numeric keypad and deleting lines via tap on touch screens.
2. **Canvas Touch**:
   - Support `touch-action: none` on the chart canvas with touch event listeners (`pointerdown`, `pointermove`, `pointerup`) for smooth touch dragging.
3. **Responsive Chart Scroll**:
   - For 1,000 numbers on small mobile screens, provide horizontal touch-scroll or pinch-to-zoom, or quick section navigator (`000-249`, `250-499`, `500-749`, `750-999`).

---

## 5. Verification & Testing Strategy
1. **Unit Tests (`graphLayoffCalculator.test.js`)**:
   - Single line above/below cut calculation with difference mode.
   - Single line above/below cut calculation with full amount mode.
   - Double line between/outside cut calculation with difference mode.
   - Double line between/outside cut calculation with full amount mode.
   - Aggregation of layoff items: merging repeated numbers correctly into a single accumulated amount.
2. **Integration Verification**:
   - Opening modal from both `ยอดเหลือ` and `ยอดเกิน` tabs.
   - Dragging lines updates live match counts and highlights.
   - Adding, editing, and deleting lines (both keyboard and touch button).
   - Staging items into basket across categories (3-digit then 2-digit) and sending to transfer modal.
