# Graph-based Layoff Mobile Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a responsive, mobile-first layout for `GraphLayoffModal` so dealers can easily navigate categories, set threshold lines, and cut bets into the basket on smartphones and tablets.

**Architecture:** Split modal styling into a dedicated CSS file `src/components/dealer/GraphLayoffModal.css` with responsive media queries (`max-width: 768px` and `max-width: 480px`). Refactor `GraphLayoffModal.jsx` to use semantic classes for the 2-row header, 3-row stacked toolbar, touch-ergonomic canvas handles, and mobile bottom sheet drawer.

**Tech Stack:** React 18, CSS3 Media Queries & Flexbox, HTML5 Canvas Pointer Events, Vitest.

## Global Constraints
- Preserve all domain conventions (Thailand timezone close_date/close_time, free-tier Supabase data caps, zero DB mutation).
- All existing 14 `GraphLayoffModal.test.jsx` tests and 40 `graphLayoffCalculator.test.js` tests must continue passing.
- Touch detection for horizontal threshold lines must support both mouse (`14px` threshold) and touch (`24px` threshold).

---

### Task 1: Create Dedicated Stylesheet `GraphLayoffModal.css`

**Files:**
- Create: `src/components/dealer/GraphLayoffModal.css`
- Test: `src/components/dealer/__tests__/GraphLayoffModal.test.jsx`

**Interfaces:**
- Produces CSS classes:
  - `.graph-layoff-overlay`
  - `.graph-layoff-modal`
  - `.graph-modal-header`
  - `.graph-modal-title-row`
  - `.graph-category-tabs-row`
  - `.graph-category-tab-btn`
  - `.graph-toolbar`
  - `.graph-toolbar-row`
  - `.graph-toolbar-lines`
  - `.graph-toolbar-modes`
  - `.graph-toolbar-action`
  - `.graph-chart-container`
  - `.graph-basket-drawer`
  - `.graph-basket-header`
  - `.graph-basket-table-wrapper`

- [x] **Step 1: Write the failing test for responsive CSS classes**
Add a test in `src/components/dealer/__tests__/GraphLayoffModal.test.jsx` expecting `graph-modal-title-row` and `graph-toolbar` classes on the rendered modal.

- [x] **Step 2: Run test to verify it fails**
Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`
Expected: FAIL with missing class `graph-modal-title-row`.

- [x] **Step 3: Create `GraphLayoffModal.css`**
Write clean, modern responsive CSS with desktop base styles and mobile overrides (`@media (max-width: 768px)` and `@media (max-width: 480px)`).

- [x] **Step 4: Import CSS in `GraphLayoffModal.jsx`**
Add `import './GraphLayoffModal.css'` and apply classes to container and header elements.

- [x] **Step 5: Run test to verify it passes**
Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`
Expected: PASS.

- [x] **Step 6: Commit**
```bash
git add src/components/dealer/GraphLayoffModal.css src/components/dealer/GraphLayoffModal.jsx src/components/dealer/__tests__/GraphLayoffModal.test.jsx
git commit -m "feat(layoff): add responsive stylesheet GraphLayoffModal.css"
```

---

### Task 2: Refactor Modal Header, Toolbar, and Touch Hit Detection

**Files:**
- Modify: `src/components/dealer/GraphLayoffModal.jsx`
- Modify: `src/components/dealer/GraphLayoffModal.css`
- Test: `src/components/dealer/__tests__/GraphLayoffModal.test.jsx`

**Interfaces:**
- Consumes: `GraphLayoffModal.css` classes.
- Produces:
  - Responsive 2-row mobile header (Title + Source Badge + Close on top; 3-column equal category tabs below).
  - 3-row stacked mobile toolbar (Line management pills, Segmented cut & amount mode toggles, Action bar with thumb-sized cut button).
  - Touch hit threshold `hitDistance = (e.pointerType === 'touch' || ('ontouchstart' in window)) ? 24 : 14` for dragging price lines.
  - Mobile bottom sheet with sticky footer and smooth drawer scroll.

- [x] **Step 1: Write tests for mobile header structure and touch threshold**
In `GraphLayoffModal.test.jsx`, add tests verifying:
- Header contains title row and category tab bar row.
- Cut button is rendered in the action group.

- [x] **Step 2: Run test to verify failure or baseline**
Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`

- [x] **Step 3: Update `GraphLayoffModal.jsx` layout & pointer handlers**
Refactor JSX structure:
1. Header: wrap title + close in `.graph-modal-title-row`, wrap categories in `.graph-category-tabs-row`.
2. Toolbar: wrap line controls in `.graph-toolbar-lines`, wrap mode pills in `.graph-toolbar-modes`, wrap summary + cut button in `.graph-toolbar-action`.
3. In `handlePointerDown` and `handlePointerMove`: use dynamic `hitDistance = (e.pointerType === 'touch' || ('ontouchstart' in window)) ? 24 : 14`.
4. Bottom Drawer: wrap in `.graph-basket-drawer` with `.graph-basket-header` and `.graph-basket-table-wrapper`.

- [x] **Step 4: Run test to verify it passes**
Run: `npm.cmd test -- src/components/dealer/__tests__/GraphLayoffModal.test.jsx`
Expected: PASS all 15+ tests.

- [x] **Step 5: Commit**
```bash
git add src/components/dealer/GraphLayoffModal.jsx src/components/dealer/GraphLayoffModal.css src/components/dealer/__tests__/GraphLayoffModal.test.jsx
git commit -m "feat(layoff): implement stacked mobile toolbar and touch ergonomics"
```

---

### Task 3: Comprehensive Verification & Build

**Files:**
- Test: All test suites (`src/utils/__tests__/graphLayoffCalculator.test.js`, `src/components/dealer/__tests__/GraphLayoffModal.test.jsx`)

- [x] **Step 1: Run focused vitest on affected files**
Run: `npm.cmd test -- src/utils/__tests__/graphLayoffCalculator.test.js src/components/dealer/__tests__/GraphLayoffModal.test.jsx`
Expected: PASS.

- [x] **Step 2: Run ESLint on modified files**
Run: `npx.cmd eslint src/components/dealer/GraphLayoffModal.jsx`
Expected: 0 errors, 0 warnings.

- [x] **Step 3: Run full test suite**
Run: `npm.cmd test`
Expected: All 52 test files (890+ tests) pass.

- [x] **Step 4: Run Vite build**
Run: `npm.cmd run build`
Expected: Build succeeds with 0 errors.

- [x] **Step 5: Commit plan completion**
```bash
git commit --allow-empty -m "chore(layoff): verify mobile layout implementation"
```
