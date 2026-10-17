# Auto-Detect Settlement Mode & Thank You Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement "ตรวจสอบอัตโนมัติ" (Auto-detect) settlement mode as default in LINE groups, intelligently matching member payment slips against immediate, cross-round, or total debts without query latency, and customize the LINE receipt message footer.

**Architecture:** Extend `line_groups.settlement_mode` with `'auto'` as default. In the `line-bot` Edge Function, evaluate in-memory candidates (`currentRoundDebt`, `netPastDebt`, `totalDebtWithCurrent`) against `slipAmount` with tolerance. Update `formatSlipSettlementLineMessage` with the new thank-you footer (`✅ บันทึกตัดชำระเรียบร้อยแล้ว✅\n🙏 ขอบคุณมากค่ะ 🙏`).

**Tech Stack:** React (Vite), Supabase (PostgreSQL, Edge Functions, Deno, TypeScript), Vitest, LINE Messaging API, SlipOK API.

## Global Constraints
- Domain Rule: Round date is the draw/closing date (`close_time`), not open date.
- 1,000-row Limit Rule: Always use `fetchAllRows` with `.order()`.
- Strict Data Safety: No unauthorized deletion/destructive queries.
- Zero extra DB queries for auto-detect: Must evaluate candidates using already preloaded in-memory data to preserve LINE `replyToken` responsiveness.

---

### Task 1: Update Receipt Message Footer in `slipSettlementHelper.ts`

**Files:**
- Modify: `supabase/functions/line-bot/slipSettlementHelper.ts`
- Modify: `supabase/functions/line-bot/slipSettlementHelper.test.ts`

- [ ] **Step 1: Write test for new receipt footer message**
  Update `slipSettlementHelper.test.ts` to assert:
  - `expect(msg).toContain('✅ บันทึกตัดชำระเรียบร้อยแล้ว✅')`
  - `expect(msg).toContain('🙏 ขอบคุณมากค่ะ 🙏')`

- [ ] **Step 2: Run test to confirm failure**
  Run `cmd.exe /c "npm test"` to see test fail.

- [ ] **Step 3: Update `formatSlipSettlementLineMessage` in `slipSettlementHelper.ts`**
  Change lines from:
  ```typescript
  lines.push('✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว')
  ```
  to:
  ```typescript
  lines.push('✅ บันทึกตัดชำระเรียบร้อยแล้ว✅')
  lines.push('🙏 ขอบคุณมากค่ะ 🙏')
  ```

- [ ] **Step 4: Run tests to confirm pass**
  Run `cmd.exe /c "npm test"`.

- [ ] **Step 5: Commit changes**
  `git add supabase/functions/line-bot/slipSettlementHelper.ts supabase/functions/line-bot/slipSettlementHelper.test.ts`
  `git commit -m "feat(line-bot): update receipt message footer with custom thank you text"`

---

### Task 2: Implement Auto-Detect Settlement Helper & Tests

**Files:**
- Modify: `supabase/functions/line-bot/slipSettlementHelper.ts`
- Modify: `supabase/functions/line-bot/slipSettlementHelper.test.ts`

- [ ] **Step 1: Write unit tests for `evaluateAutoSettlementMode`**
  In `slipSettlementHelper.test.ts`, write tests covering:
  1. Member pays exact current round debt -> selects `immediate` mode.
  2. Member pays net past debt (e.g. 4,596 = 6,696 debt - 2,100 prize) -> selects `cross_round` mode.
  3. Member pays total debt with current round (e.g. 7,308) -> selects `cross_round_all` mode.
  4. Member slip matches within `toleranceAmount`.
  5. Mismatch reporting when slip does not match any candidate.

- [ ] **Step 2: Run test to confirm failure**
  Run `cmd.exe /c "npm test"`.

- [ ] **Step 3: Implement `evaluateAutoSettlementCandidate` in `slipSettlementHelper.ts`**
  Create helper function:
  ```typescript
  export interface AutoSettlementCandidate {
    mode: 'immediate' | 'cross_round' | 'cross_round_all'
    expectedAmount: number
    label: string
  }
  ```
  Determine which candidate matches `slipAmount` within `toleranceAmount`.

- [ ] **Step 4: Run tests to confirm pass**
  Run `cmd.exe /c "npm test"`.

- [ ] **Step 5: Commit changes**
  `git add supabase/functions/line-bot/slipSettlementHelper.ts supabase/functions/line-bot/slipSettlementHelper.test.ts`
  `git commit -m "feat(line-bot): add evaluateAutoSettlementCandidate helper and unit tests"`

---

### Task 3: Integrate Auto-Detect Mode into `handleLineSlipMessage` in `index.ts`

**Files:**
- Modify: `supabase/functions/line-bot/index.ts`

- [ ] **Step 1: Wire auto-detect mode into `handleLineSlipMessage`**
  When `settlementMode === 'auto'`:
  - Calculate both `immediateRes` and `crossDebtRes` from preloaded data in memory.
  - Evaluate candidates using `evaluateAutoSettlementCandidate`.
  - If matched Candidate 1 (`immediate`): execute immediate branch.
  - If matched Candidate 2 or 3 (`cross_round` / `cross_round_all`): execute cross-round branch with matching allocation.
  - If none match: reply with informative `amount_mismatch` message showing options.

- [ ] **Step 2: Run test suite**
  Run `cmd.exe /c "npm test"`.

- [ ] **Step 3: Commit changes**
  `git add supabase/functions/line-bot/index.ts`
  `git commit -m "feat(line-bot): integrate auto settlement mode into handleLineSlipMessage"`

---

### Task 4: Database Migration for `settlement_mode = 'auto'`

**Files:**
- Create: `supabase/migrations/262_add_auto_settlement_mode.sql`

- [ ] **Step 1: Write migration SQL**
  ```sql
  -- Drop existing constraint
  ALTER TABLE public.line_groups DROP CONSTRAINT IF EXISTS chk_line_groups_settlement_mode;

  -- Add updated check constraint with 'auto'
  ALTER TABLE public.line_groups ADD CONSTRAINT chk_line_groups_settlement_mode
      CHECK (settlement_mode IN ('auto', 'immediate', 'cross_round'));

  -- Set default to 'auto'
  ALTER TABLE public.line_groups ALTER COLUMN settlement_mode SET DEFAULT 'auto';
  ```

- [ ] **Step 2: Apply migration to Supabase DB**
  Run migration or apply via Supabase CLI / direct client.

- [ ] **Step 3: Commit migration file**
  `git add supabase/migrations/262_add_auto_settlement_mode.sql`
  `git commit -m "feat(db): update line_groups settlement_mode constraint to allow auto"`

---

### Task 5: Frontend UI Update in `DealerLineBotTab.jsx`

**Files:**
- Modify: `src/components/dealer/DealerLineBotTab.jsx`

- [ ] **Step 1: Update Table View dropdown**
  In `DealerLineBotTab.jsx` lines 1320-1322:
  ```jsx
  <option value="auto">ตรวจสอบอัตโนมัติ (แนะนำ)</option>
  <option value="immediate">งวดต่องวด (ชำระทันที)</option>
  <option value="cross_round">งวดชนงวด (หักรางวัล/ยกยอด)</option>
  ```
  Fallback: `group.settlement_mode || 'auto'`.

- [ ] **Step 2: Update Mobile Card View dropdown**
  In `DealerLineBotTab.jsx` lines 1500-1503:
  Add `<option value="auto">ตรวจสอบอัตโนมัติ (แนะนำ)</option>`.
  Fallback: `group.settlement_mode || 'auto'`.

- [ ] **Step 3: Run Vitest frontend tests**
  Run `cmd.exe /c "npm test"`.

- [ ] **Step 4: Commit changes**
  `git add src/components/dealer/DealerLineBotTab.jsx`
  `git commit -m "feat(dealer): add auto-detect option as default in settlement mode dropdown"`

---

### Task 6: Deploy Edge Function & End-to-End Verification

**Files:**
- Deploy: `supabase/functions/line-bot`

- [ ] **Step 1: Run full test suite**
  Run `cmd.exe /c "npm test"` to verify all 785+ tests pass.

- [ ] **Step 2: Deploy `line-bot` Edge Function**
  Run `cmd.exe /c "npx.cmd supabase functions deploy line-bot --no-verify-jwt"`.

- [ ] **Step 3: Verify deployment log and status**
  Confirm deployment succeeded on project `nmumnletxkeflmsythsn`.
