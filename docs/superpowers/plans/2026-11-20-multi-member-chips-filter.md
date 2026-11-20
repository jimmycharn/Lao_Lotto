# Multi-Member Chips Filter with Include/Exclude Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow dealers in `RoundAccordionItem.jsx` (Total Tab) to multi-select members using interactive chips, toggle between "แสดงเฉพาะ" (Include) and "ไม่เอา" (Exclude) modes, and show the "เขียนโพย" button only when exactly one member is selected in include mode.

**Architecture:** A pure helper `memberFilterHelper.js` provides matching logic for any submission/bill. A dedicated `MemberChipsFilter.jsx` component manages the mode toggle, member chips, and member selector dropdown. `RoundAccordionItem.jsx` uses this helper across summary cards, table views (รวม / ใบโพย), copy receipt, and write bet gating.

**Tech Stack:** React 19, JavaScript (ESM), Vitest, Vite

## Global Constraints
- Preserve all existing Supabase pagination and domain rules (`fetchAllRows`, round date = close date).
- The `[ 📝 เขียนโพย ]` button must ONLY appear when exactly 1 member is selected in `include` mode and dealer has key-in permission.
- No destructive database modifications.

---

### Task 1: Create pure helper `memberFilterHelper.js` and Unit Tests

**Files:**
- Create: `src/utils/memberFilterHelper.js`
- Test: `src/utils/__tests__/memberFilterHelper.test.js`

**Interfaces:**
- Produces: `isMemberMatched(userName, selectedMembers, mode)` -> `boolean`
  - `userName`: string
  - `selectedMembers`: string[]
  - `mode`: 'include' | 'exclude'

- [ ] **Step 1: Write failing tests for `memberFilterHelper.test.js`**
- [ ] **Step 2: Run test to confirm it fails** (`npx vitest run src/utils/__tests__/memberFilterHelper.test.js`)
- [ ] **Step 3: Implement `isMemberMatched` in `src/utils/memberFilterHelper.js`**
- [ ] **Step 4: Run test to confirm it passes** (`npx vitest run src/utils/__tests__/memberFilterHelper.test.js`)
- [ ] **Step 5: Commit task 1** (`git add src/utils/memberFilterHelper.js src/utils/__tests__/memberFilterHelper.test.js && git commit -m "feat(dealer): add memberFilterHelper with unit tests"`)

---

### Task 2: Create `MemberChipsFilter.jsx` Component and Unit Tests

**Files:**
- Create: `src/components/dealer/MemberChipsFilter.jsx`
- Test: `src/components/dealer/__tests__/MemberChipsFilter.test.jsx`

**Interfaces:**
- Consumes: `isMemberMatched` from `src/utils/memberFilterHelper.js`
- Produces: `MemberChipsFilter` component with props:
  - `selectedMembers`: string[]
  - `onSelectedMembersChange`: (members: string[]) => void
  - `mode`: 'include' | 'exclude'
  - `onModeChange`: (mode: 'include' | 'exclude') => void
  - `availableMembers`: Array<{ label: string, value: string }>
  - `allowedMembers`: Array<any>
  - `canWriteBet`: boolean
  - `onWriteBet`: () => void
  - `onCopy`: () => void
  - `onExtend`: () => void
  - `isAnnounced`: boolean
  - `hasSubmissions`: boolean

- [ ] **Step 1: Write tests for `MemberChipsFilter.test.jsx`**
- [ ] **Step 2: Run test to confirm it fails** (`npx vitest run src/components/dealer/__tests__/MemberChipsFilter.test.jsx`)
- [ ] **Step 3: Implement `MemberChipsFilter.jsx`**
  - Mode switch buttons (`แสดงเฉพาะ` vs `ไม่เอา`)
  - `SearchableDropdown` to search & select members to add
  - Active chips list with `✕` remove button
  - `ล้างสมาชิก` button
  - Action buttons (`เขียนโพย` shown conditionally, `คัดลอก`, `ขยายเวลา`)
- [ ] **Step 4: Run test to confirm it passes** (`npx vitest run src/components/dealer/__tests__/MemberChipsFilter.test.jsx`)
- [ ] **Step 5: Commit task 2** (`git add src/components/dealer/MemberChipsFilter.jsx src/components/dealer/__tests__/MemberChipsFilter.test.jsx && git commit -m "feat(dealer): create MemberChipsFilter component"`)

---

### Task 3: Integrate `MemberChipsFilter` into `RoundAccordionItem.jsx`

**Files:**
- Modify: `src/components/dealer/RoundAccordionItem.jsx`
- Test: `src/components/dealer/__tests__/MemberChipsFilterIntegration.test.jsx`

- [x] **Step 1: Write integration tests** verifying filter scoping across summary cards, bills, and write bet button gating.
- [x] **Step 2: Update `RoundAccordionItem.jsx` state and handlers**:
  - Replace `inlineUserFilter` with `inlineSelectedMembers` and `inlineMemberSelectMode`
  - Update `canWriteBetForSelectedMember` to gate on single member in include mode
  - Update `handleOpenWriteBet`
  - Update summary card calculations with `isMemberMatched`
  - Update preFilteredData & table display in view mode "รวม" with `isMemberMatched`
  - Update `filteredBills` in view mode "ใบโพย" with `isMemberMatched`
  - Update `handleCopyTotal` and `generateTotalCopyText`
  - Replace old member bar JSX with `<MemberChipsFilter />`
- [x] **Step 3: Run integration tests to confirm they pass** (`npx vitest run src/components/dealer/__tests__/MemberChipsFilterIntegration.test.jsx`)
- [x] **Step 4: Commit task 3** (`git add src/components/dealer/RoundAccordionItem.jsx src/components/dealer/__tests__/MemberChipsFilterIntegration.test.jsx && git commit -m "feat(dealer): integrate MemberChipsFilter into RoundAccordionItem"`)

---

### Task 4: Full Verification and Deployment

**Files:**
- Full test suite: `npx vitest run`
- Production build: `npm run build`

- [x] **Step 1: Run full vitest suite (all 58+ test files)**
- [x] **Step 2: Run production build (`npm run build`)**
- [x] **Step 3: Commit and push to `origin/master`**
