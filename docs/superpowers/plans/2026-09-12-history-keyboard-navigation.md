# History Tab Keyboard Navigation & Settlement Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable full keyboard navigation in the Dealer History tab to navigate round cards, inspect member/upstream rows, open settlement inline panels, and record cross-round payments seamlessly.

**Architecture:** 
- Extract navigation state transition logic into a pure helper `historyKeyboardNavigation.js` with 100% unit test coverage.
- Wire `Dealer.jsx` to manage `keyboardNavTarget` with `window` keydown listeners that respect input/modal focus guards.
- Apply theme primary gold glow styling on focused cards/rows and scroll them into view.
- Propagate autofocus to `[⚡ บันทึกชำระเงิน]` button in `MemberSettlementInline` and `UpstreamSettlementInline` on Enter.
- Enhance `CrossRoundOffsetModal` to auto-focus active mode, support ArrowLeft/Right to switch modes, Tab navigation, and Enter to confirm payment.

**Tech Stack:** React, Vanilla CSS, Vitest.

## Global Constraints
- Preserve Supabase PostgREST pagination rules and Thai round date rules.
- Do NOT disrupt mouse clicking behavior or text inputs (guard keydown events when focus is in inputs/textareas).
- Theme primary gold glow styling (`0 0 0 2px #facc15, 0 0 12px rgba(250, 204, 21, 0.35)`).

---

### Task 1: Create `historyKeyboardNavigation` Helper and Unit Tests

**Files:**
- Create: `src/utils/historyKeyboardNavigation.js`
- Create: `src/utils/historyKeyboardNavigation.test.js`

**Interfaces:**
- Produces:
  - `getNextKeyboardFocusTarget({ currentTarget, totalCards, getCardContent(cardIndex) })`
  - `getPrevKeyboardFocusTarget({ currentTarget, totalCards, getCardContent(cardIndex) })`

- [x] **Step 1: Write failing unit tests for `historyKeyboardNavigation.test.js`**
  - Test jumping across collapsed cards on ArrowDown / ArrowUp.
  - Test diving into expanded card rows (member 0, 1, 2... upstream 0, 1...).
  - Test transitioning from last row of card N to header of card N+1.
  - Test transitioning from header of card N to last row of previous expanded card N-1.
  - Test edge cases (empty list, cards with 0 members, etc.).

- [x] **Step 2: Run tests to verify failure**
  - Run `cmd /c npm test -- src/utils/historyKeyboardNavigation.test.js`

- [x] **Step 3: Implement `src/utils/historyKeyboardNavigation.js`**
  - Implement transition algorithms cleanly.

- [x] **Step 4: Run tests and ensure 100% pass**
  - Run `cmd /c npm test -- src/utils/historyKeyboardNavigation.test.js`

- [x] **Step 5: Commit changes**
  - Commit: `test: add history keyboard navigation helper and tests`

---

### Task 2: Implement Keyboard Navigation & Visual Focus in `Dealer.jsx` and `Dealer.css`

**Files:**
- Modify: `src/pages/Dealer.jsx`
- Modify: `src/pages/Dealer.css`

**Interfaces:**
- Consumes: `getNextKeyboardFocusTarget`, `getPrevKeyboardFocusTarget` from Task 1.
- Produces: `keyboardNavTarget` state, keyboard listener, `.keyboard-focused` CSS class, `autoFocusPaymentBtn` prop passed to inline settlement.

- [x] **Step 1: Add `.keyboard-focused` styles to `Dealer.css`**
  - Add gold primary glow for `.round-accordion-header.keyboard-focused` and `.history-row.keyboard-focused`.

- [x] **Step 2: Implement `keyboardNavTarget` state and window keydown handler in `Dealer.jsx`**
  - Check guard: only active if `roundsTab === 'history'` and active modal count is 0 and active element is not an input/textarea/select.
  - Handle ArrowDown: compute next target, update state, trigger element scroll into view.
  - Handle ArrowUp: compute previous target, update state, trigger element scroll into view.
  - Handle Enter on header: toggle expand round history card.
  - Handle Enter on member/upstream row: expand member/upstream and set `autoFocusPaymentBtnTarget`.

- [x] **Step 3: Pass `keyboard-focused` class to active card header, member row, and upstream row**
  - Verify visually and test with keyboard in browser.

- [x] **Step 4: Commit changes**
  - Commit: `feat: implement history list keyboard navigation in Dealer page`

---

### Task 3: Support Auto-Focusing the `[⚡ บันทึกชำระเงิน]` Button on Row Expand

**Files:**
- Modify: `src/components/dealer/MemberSettlementInline.jsx`
- Modify: `src/components/dealer/UpstreamSettlementInline.jsx`

**Interfaces:**
- Consumes: `autoFocusPaymentBtn` prop from `Dealer.jsx`.
- Produces: Focus on `btn-cross-offset-action` button when expanded via keyboard Enter.

- [x] **Step 1: Update `MemberSettlementInline.jsx`**
  - Accept `autoFocusPaymentBtn` prop.
  - Add `paymentBtnRef = useRef(null)`.
  - In `useEffect`, if `autoFocusPaymentBtn` is true, call `paymentBtnRef.current?.focus()`.

- [x] **Step 2: Update `UpstreamSettlementInline.jsx`**
  - Accept `autoFocusPaymentBtn` prop.
  - Add `paymentBtnRef = useRef(null)`.
  - In `useEffect`, if `autoFocusPaymentBtn` is true, call `paymentBtnRef.current?.focus()`.

- [x] **Step 3: Run test suite**
  - Run `cmd /c npm test`

- [x] **Step 4: Commit changes**
  - Commit: `feat: autofocus payment button on keyboard row expansion`

---

### Task 4: Enhance `CrossRoundOffsetModal` Keyboard Navigation & Enter Confirmation

**Files:**
- Modify: `src/components/dealer/CrossRoundOffsetModal.jsx`
- Modify: `src/components/dealer/CrossRoundOffsetModal.css`

**Interfaces:**
- Consumes: User keyboard events inside modal.
- Produces:
  - Initial focus on active mode option card.
  - ArrowLeft / ArrowRight navigation between selectable modes.
  - Tab navigation between interactive controls.
  - Enter shortcut to trigger `handleSubmit()`.

- [x] **Step 1: Make mode cards focusable and handle ArrowLeft/Right in `CrossRoundOffsetModal.jsx`**
  - Add `tabIndex={0}`, `role="radio"`.
  - Add `onKeyDown` to mode cards to handle ArrowLeft, ArrowRight, ArrowUp, ArrowDown to switch mode and focus the newly selected card.
  - Auto-focus the active mode card upon modal open.

- [x] **Step 2: Handle Enter key on modal form**
  - In modal keydown handler, if `e.key === 'Enter'`, verify activeElement is not the cancel/close button, prevent default and call `handleSubmit()`.

- [x] **Step 3: Add CSS focus ring for `.cross-round-mode-card:focus-visible` in `CrossRoundOffsetModal.css`**
  - Add gold glow outline for focused mode card.

- [x] **Step 4: Run unit tests and Vite build**
  - Run `cmd /c npm test`
  - Run `cmd /c npm run build`

- [x] **Step 5: Commit changes**
  - Commit: `feat: add keyboard mode navigation and enter confirmation in CrossRoundOffsetModal`

---

### Task 5: Final End-to-End Verification

- [x] **Step 1: Run complete automated test suite**
  - `cmd /c npm test`
- [x] **Step 2: Run production build**
  - `cmd /c npm run build`
- [x] **Step 3: Verify all 4 requirements are completely satisfied**
  1. Collapsed round card: ArrowUp/Down jumps focus card-by-card.
  2. Expanded round card: ArrowUp/Down traverses rows, then jumps to next/previous card at boundaries.
  3. Enter on member row expands it and focuses `[⚡ บันทึกชำระเงิน]`; 2nd Enter opens the modal.
  4. Modal opens with focus on 4 mode options; ArrowLeft/Right switches mode; Tab navigates; Enter submits.
