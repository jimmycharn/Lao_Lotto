# Keyboard Navigation & Settlement Shortcut Design in History Tab

## 1. Overview & Goals
Provide a seamless keyboard-driven experience in the Dealer History tab (`แท็บ ประวัติ`) allowing users to navigate rounds, expand details, inspect members/upstreams, and record settlements without touching a mouse:
1. **Collapsed Round Cards**: ArrowUp / ArrowDown jumps focus between round cards.
2. **Expanded Round Cards**: ArrowDown steps through member rows, then upstream rows; reaching the top/bottom jumps out to the previous/next round card.
3. **Member / Upstream Row Expansion**: Pressing `Enter` on a collapsed row expands the settlement panel and immediately moves focus to the `บันทึกชำระเงิน` button. A second `Enter` immediately opens the `CrossRoundOffsetModal` dialog.
4. **Settlement Modal Navigation**:
   - Focus defaults to the active settlement mode card (among the 4 options: จ่ายหนี้งวดนี้, รางวัลงวดนี้, หักลบรางวัลกับหนี้เก่า, หักลบหนี้ทั้งหมด).
   - ArrowLeft / ArrowRight navigates and selects among enabled mode options.
   - `Tab` / `Shift+Tab` navigates through other form elements (inputs, bank selectors, checkboxes).
   - `Enter` anywhere in the modal triggers the confirm/submit action (`ยืนยันบันทึกชำระเงิน`).

---

## 2. Architecture & State Management

### 2.1 Focus Target State in `Dealer.jsx`
```typescript
interface KeyboardNavState {
  cardIndex: number;          // Index in filteredRoundHistory
  section: 'header' | 'member' | 'upstream';
  rowIndex: number;           // Index within members or upstreams list
}
```
- Initial state:
  - Defaults to `{ cardIndex: 0, section: 'header', rowIndex: 0 }` when entering the History tab or on the first ArrowUp/ArrowDown keypress.
- Focus movement rules:
  - **At Card Header**:
    - `ArrowDown`:
      - If card is collapsed: move to card `cardIndex + 1`, section `'header'`.
      - If card is expanded:
        - If members exist: move to `cardIndex`, section `'member'`, row `0`.
        - Else if upstreams exist: move to `cardIndex`, section `'upstream'`, row `0`.
        - Else: move to card `cardIndex + 1`, section `'header'`.
    - `ArrowUp`:
      - Move to card `cardIndex - 1`. If previous card is expanded, move to its last row; otherwise to its `'header'`.
    - `Enter`:
      - Toggle expand/collapse of the card header.
  - **At Member Row**:
    - `ArrowDown`:
      - If not last member row: `rowIndex + 1`.
      - If last member row:
        - If upstreams exist: move to `section: 'upstream', rowIndex: 0`.
        - Else: move to card `cardIndex + 1`, section `'header'`.
    - `ArrowUp`:
      - If not first member row: `rowIndex - 1`.
      - If first member row: move to `section: 'header'`.
    - `Enter`:
      - If row is collapsed: expand row (`setExpandedMemberSettlementId`) and set flag/ref to auto-focus the `[⚡ บันทึกชำระเงิน]` button.
  - **At Upstream Row**:
    - `ArrowDown`:
      - If not last upstream row: `rowIndex + 1`.
      - If last upstream row: move to card `cardIndex + 1`, section `'header'`.
    - `ArrowUp`:
      - If not first upstream row: `rowIndex - 1`.
      - If first upstream row:
        - If members exist: move to `section: 'member'`, last member row.
        - Else: move to `section: 'header'`.
    - `Enter`:
      - If row is collapsed: expand row (`setExpandedUpstreamSettlementId`) and auto-focus its `[⚡ บันทึกชำระเงิน]` button.

### 2.2 Global Key Listener Guard
The key listener in `Dealer.jsx` runs on `window` and ignores events if:
- A modal is currently open (`CrossRoundOffsetModal`, `PaymentNoticeModal`, delete modal, etc.).
- The user is currently typing inside an `input`, `textarea`, or `select`.
- The current tab is not `roundsTab === 'history'`.

---

## 3. Component Details & Visual Indicators

### 3.1 Visual Focus Indicator (Primary Theme Gold Glow)
Matching the user's selected preference:
```css
.round-accordion-item.keyboard-focused,
.round-accordion-header.keyboard-focused {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-primary, #facc15), 0 0 14px rgba(250, 204, 21, 0.35) !important;
}

.history-row.keyboard-focused {
  outline: none;
  background: rgba(250, 204, 21, 0.12) !important;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.5), 0 0 10px rgba(250, 204, 21, 0.25) !important;
}
```
Every focused item automatically calls:
`element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.

### 3.2 Auto-Focusing the `[⚡ บันทึกชำระเงิน]` Button in Inline Panels
- When a member or upstream row is expanded via `Enter`:
  - `MemberSettlementInline` / `UpstreamSettlementInline` receives an `autoFocusPaymentBtn={true}` prop or listens to a trigger.
  - The `btn-cross-offset-action` button gets focused via React `ref.current?.focus()`.
  - Pressing `Enter` on this focused button executes its `onClick`, opening `CrossRoundOffsetModal`.

### 3.3 `CrossRoundOffsetModal` Keyboard Handling
- **Active Mode Focus**:
  - Modal tracks a `modeCardsRef` array.
  - On modal mount/open, `useEffect` focuses the card corresponding to the initial `mode`.
- **ArrowLeft / ArrowRight Navigation**:
  - Modes array: `['current_debt', 'current_prize', 'offset_prize_past_debt', 'combine_all']`.
  - Filtered to only selectable (non-disabled) modes.
  - ArrowRight / ArrowDown: select and focus next selectable mode.
  - ArrowLeft / ArrowUp: select and focus previous selectable mode.
- **Tab Key**:
  - Standard focus ring moves through past rounds selector, input amount, bank selector, buttons.
- **Enter Key**:
  - Attached to modal `onKeyDown`.
  - If `e.key === 'Enter'`:
    - If focus is on the cancel button (`btn-outline`) or close button (`modal-close`), let default behavior happen (or close).
    - Otherwise, `e.preventDefault()`, validate, and trigger `handleSubmit()`.

---

## 4. Testing & Verification Plan
1. **Automated Unit Tests**:
   - Write tests for keyboard navigation helper / index resolution functions.
   - Run `cmd /c npm test` to ensure 100% test suite pass rate.
   - Run `cmd /c npm run build` to ensure clean Vite build.
2. **Manual Keyboard Walkthrough**:
   - In History tab, press ArrowDown -> verify cards focus sequentially with gold glow.
   - Press Enter on card -> verify card expands.
   - Press ArrowDown -> verify focus enters first member row.
   - Press ArrowDown through rows -> verify reaching bottom jumps to next card header.
   - Press Enter on member row -> verify row expands and `[⚡ บันทึกชำระเงิน]` is focused.
   - Press Enter again -> verify `CrossRoundOffsetModal` opens and active mode card is focused.
   - Press ArrowLeft / ArrowRight -> verify mode options switch.
   - Press Enter -> verify settlement confirmation submits.
