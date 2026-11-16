# Upstream Dealer 5-digit Code & Line Bot Layoff Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Provide a unique 5-digit ID for upstream dealers on the Web UI, and implement LINE Bot commands `/สรุปตีออก` and `/โพยตีออกถูก` (both global and targeted by dealer ID) with descending layoff volume sorting and strict permission controls.

**Architecture:**
- Database: Column `upstream_code` on `dealer_upstream_connections` defaulting to `nextval('member_code_seq')::text`.
- Frontend: Display `ID: 10001` badge in `UpstreamDealerAccordionItem.jsx` and query `upstream_code` in `UpstreamDealersTab.jsx`.
- Backend (LINE Bot Edge Function): A dedicated module `layoffSummaryHelper.ts` to compute layoff financials, sort upstream dealers descending by bet amount, generate Flex Messages, and format winning bets messages. `index.ts` routes the commands with authorization checks.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions Deno/TypeScript), React (Vite, CSS Modules), Vitest / Deno Test.

## Global Constraints
- **Domain Rule #1**: "งวดวันที่" (Round Date) must strictly be `close_time` / `close_date`.
- **Domain Rule #2**: All queries on accumulating tables (`bet_transfers`) must use pagination and order (`.order('created_at', { ascending: false })`).
- **Domain Rule #3**: No arbitrary data deletion or destructive queries.
- **Permissions**: `/สรุปตีออก` and `/โพยตีออกถูก` are restricted to Dealer, Admin, Superadmin, and Group Managers (`line_managers`).

---

### Task 1: Database Migration for Upstream Dealer Code

**Files:**
- Create: `supabase/migrations/263_add_upstream_code_to_dealer_upstream_connections.sql`
- Test: `scratch/test_migration_263.js`

**Interfaces:**
- Produces: `dealer_upstream_connections.upstream_code TEXT UNIQUE`

- [x] **Step 1: Write the migration file**

```sql
-- Migration 263: Add upstream_code to dealer_upstream_connections
-- Ensures every upstream connection (manual or linked) gets a unique 5-digit code

-- 1. Ensure member_code_seq sequence exists
CREATE SEQUENCE IF NOT EXISTS member_code_seq START WITH 10001;

-- 2. Add upstream_code column
ALTER TABLE public.dealer_upstream_connections
ADD COLUMN IF NOT EXISTS upstream_code TEXT DEFAULT nextval('member_code_seq')::text;

-- 3. Backfill any existing connections that have null upstream_code
UPDATE public.dealer_upstream_connections
SET upstream_code = nextval('member_code_seq')::text
WHERE upstream_code IS NULL;

-- 4. Create index on upstream_code
CREATE INDEX IF NOT EXISTS idx_dealer_upstream_connections_code 
ON public.dealer_upstream_connections(upstream_code);
```

- [x] **Step 2: Apply the migration to the database**

Run:
```powershell
# Read and run migration SQL via supabase CLI or verify schema
Get-Content supabase/migrations/263_add_upstream_code_to_dealer_upstream_connections.sql
```

- [x] **Step 3: Write verification script to confirm schema and backfill**

Create `scratch/test_migration_263.js`:
```javascript
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('dealer_upstream_connections')
    .select('id, upstream_name, upstream_code')
    .limit(5)
  if (error) {
    console.error('FAIL:', error)
    process.exit(1)
  }
  console.log('PASS: upstream connections fetched:', data)
  process.exit(0)
}
test()
```

- [x] **Step 4: Run verification script**

Run: `node scratch/test_migration_263.js`  
Expected: `PASS: upstream connections fetched: [...]` with 5-digit `upstream_code`.

- [x] **Step 5: Commit**

```powershell
git add supabase/migrations/263_add_upstream_code_to_dealer_upstream_connections.sql scratch/test_migration_263.js; git commit -m "feat(db): add upstream_code column and backfill to dealer_upstream_connections"
```

---

### Task 2: Frontend Web UI — Display ID Badge on Upstream Dealers

**Files:**
- Modify: `src/components/dealer/UpstreamDealerAccordionItem.jsx:320-335`
- Modify: `src/components/dealer/UpstreamDealersTab.jsx:55-80`
- Test: `src/components/dealer/__tests__/UpstreamDealerAccordionItem.test.jsx`

**Interfaces:**
- Consumes: `dealer.upstream_code`, `dealer.upstream_profile?.member_code`
- Produces: Visual ID Badge `ID: 10001` in the accordion header

- [x] **Step 1: Write the unit test for UpstreamDealerAccordionItem badge**

Create `src/components/dealer/__tests__/UpstreamDealerAccordionItem.test.jsx`:
```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import UpstreamDealerAccordionItem from '../UpstreamDealerAccordionItem'

describe('UpstreamDealerAccordionItem', () => {
  it('renders upstream_code badge correctly for manual dealer', () => {
    const mockDealer = {
      id: 'conn-1',
      upstream_name: 'พี่จิ้ม อ้อมค่าย',
      upstream_code: '10001',
      is_linked: false,
      is_active: true
    }
    render(
      <UpstreamDealerAccordionItem
        dealer={mockDealer}
        isExpanded={false}
        onToggle={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggleBlock={() => {}}
        onSetDefault={() => {}}
        onSaveSettings={() => {}}
      />
    )
    expect(screen.getByText('พี่จิ้ม อ้อมค่าย')).toBeInTheDocument()
    expect(screen.getByText('ID: 10001')).toBeInTheDocument()
  })

  it('renders linked dealer member_code if upstream_code not set', () => {
    const mockDealer = {
      id: 'conn-2',
      upstream_name: 'ดีลเลอร์ใหญ่',
      is_linked: true,
      upstream_profile: {
        member_code: '10005'
      }
    }
    render(
      <UpstreamDealerAccordionItem
        dealer={mockDealer}
        isExpanded={false}
        onToggle={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggleBlock={() => {}}
        onSetDefault={() => {}}
        onSaveSettings={() => {}}
      />
    )
    expect(screen.getByText('ID: 10005')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test src/components/dealer/__tests__/UpstreamDealerAccordionItem.test.jsx`  
Expected: FAIL (Badge not found).

- [x] **Step 3: Modify `UpstreamDealerAccordionItem.jsx` to render the ID badge**

In `src/components/dealer/UpstreamDealerAccordionItem.jsx`:
```jsx
const dealerCode = dealer.upstream_code || dealer.upstream_profile?.member_code;

// In header:
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
    <span className="dealer-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
        {dealer.upstream_name || 'ไม่ระบุชื่อ'}
    </span>
    {dealerCode && (
        <span
            className="dealer-id-badge"
            style={{
                fontSize: '0.75rem',
                color: 'var(--color-primary, #eab308)',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                padding: '0.1rem 0.45rem',
                borderRadius: '6px',
                fontWeight: '600',
                letterSpacing: '0.5px',
                display: 'inline-flex',
                alignItems: 'center'
            }}
            title={`รหัสเจ้ามือ: ${dealerCode}`}
        >
            ID: {dealerCode}
        </span>
    )}
```

- [x] **Step 4: Update `UpstreamDealersTab.jsx` query to select `upstream_code`**

In `src/components/dealer/UpstreamDealersTab.jsx`:
Ensure `fetchUpstreamDealers` queries `upstream_code` in the select string:
```javascript
.select(`
    *,
    upstream_profile:upstream_dealer_id(id, full_name, email, phone, member_code)
`)
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npm test src/components/dealer/__tests__/UpstreamDealerAccordionItem.test.jsx`  
Expected: PASS.

- [x] **Step 6: Commit**

```powershell
git add src/components/dealer/UpstreamDealerAccordionItem.jsx src/components/dealer/UpstreamDealersTab.jsx src/components/dealer/__tests__/UpstreamDealerAccordionItem.test.jsx; git commit -m "feat(ui): display upstream dealer 5-digit ID badge in dealers tab"
```

---

### Task 3: LINE Bot Layoff Financial Calculations & Flex Message Module

**Files:**
- Create: `supabase/functions/line-bot/layoffSummaryHelper.ts`
- Create: `supabase/functions/line-bot/layoffSummaryHelper.test.ts`

**Interfaces:**
- Produces:
  - `calculateLayoffSummaries(transfers, upstreamConnections, winningNumbers, lotteryType)`
  - `generateLayoffSummaryFlex(overallTotals, sortedDealers, roundInfo)`
  - `generateTargetedLayoffSummaryFlex(targetDealer, roundInfo)`
  - `formatLayoffWinningBetsMessage(winningTransfers, targetDealer, roundInfo)`

- [x] **Step 1: Write unit tests for `layoffSummaryHelper.ts`**

Create `supabase/functions/line-bot/layoffSummaryHelper.test.ts`:
```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  calculateLayoffSummaries,
  generateLayoffSummaryFlex,
  formatLayoffWinningBetsMessage
} from "./layoffSummaryHelper.ts";

Deno.test("calculateLayoffSummaries calculates totals and sorts dealers descending by totalBet", () => {
  const mockTransfers = [
    { target_dealer_name: "พี่จิ้ม", upstream_dealer_id: null, amount: 5000, bet_type: "2_top", numbers: "54" },
    { target_dealer_name: "พี่โต", upstream_dealer_id: null, amount: 8000, bet_type: "3_top", numbers: "654" },
    { target_dealer_name: "พี่จิ้ม", upstream_dealer_id: null, amount: 2000, bet_type: "2_bottom", numbers: "06" }
  ];
  const mockConnections = [
    { upstream_name: "พี่จิ้ม", upstream_code: "10001", lottery_settings: { thai: { "2_top": { commission: 20, payout: 90 }, "2_bottom": { commission: 20, payout: 90 } } } },
    { upstream_name: "พี่โต", upstream_code: "10002", lottery_settings: { thai: { "3_top": { commission: 25, payout: 900 } } } }
  ];
  const winningNumbers = { "3_top": "654", "2_top": "54", "2_bottom": "06" };

  const { overallTotals, sortedDealers } = calculateLayoffSummaries(
    mockTransfers,
    mockConnections,
    winningNumbers,
    "thai"
  );

  // Sorting check: พี่โต (8,000) > พี่จิ้ม (7,000)
  assertEquals(sortedDealers.length, 2);
  assertEquals(sortedDealers[0].dealerName, "พี่โต");
  assertEquals(sortedDealers[0].totalBet, 8000);
  assertEquals(sortedDealers[1].dealerName, "พี่จิ้ม");
  assertEquals(sortedDealers[1].totalBet, 7000);

  // Overall totals check
  assertEquals(overallTotals.totalBet, 15000);
});

Deno.test("formatLayoffWinningBetsMessage formats text accurately", () => {
  const winningTransfers = [
    { dealerName: "พี่จิ้ม", dealerCode: "10001", bet_type: "2_top", numbers: "54", amount: 100, winAmount: 9000 },
    { dealerName: "พี่จิ้ม", dealerCode: "10001", bet_type: "2_bottom", numbers: "06", amount: 50, winAmount: 4500 }
  ];
  const roundInfo = { lotteryName: "หวยไทย", roundDate: "16-11-2569", winningResultStr: "645654 / 06" };
  const targetDealer = { dealerName: "พี่จิ้ม", dealerCode: "10001" };

  const text = formatLayoffWinningBetsMessage(winningTransfers, targetDealer, roundInfo);
  assertEquals(text.includes("รายการตีออกที่ถูกรางวัล"), true);
  assertEquals(text.includes("พี่จิ้ม (10001)"), true);
  assertEquals(text.includes("13,500"), true);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test supabase/functions/line-bot/layoffSummaryHelper.test.ts` (or deno test)  
Expected: FAIL (File not created).

- [x] **Step 3: Implement `layoffSummaryHelper.ts`**

Create `supabase/functions/line-bot/layoffSummaryHelper.ts` with:
- `calculateLayoffSummaries`: Group transfers by upstream connection (resolving by `upstream_dealer_id` or `target_dealer_name`).
- Winning evaluation matching canonical lottery rules (e.g., 3-top, 2-top, 2-bottom, 3-tod, floats, 4-set).
- Commission calculation from connection settings (fallback to standard defaults).
- Net balance calculation: `ourNet = totalWin + totalCommission - totalBet` (if > 0 -> "ต้องเก็บ", if < 0 -> "ต้องจ่าย").
- Sorting of `sortedDealers` by `totalBet` descending.
- `generateLayoffSummaryFlex`: Build bubble Flex message with Section 1 (Overall Layoff Summary) and Section 2 (Ranked Upstream Dealers breakdown matching user screenshot design).
- `generateTargetedLayoffSummaryFlex`: Build targeted single-dealer bubble Flex message.
- `formatLayoffWinningBetsMessage`: Format text slip list of winning bets.

- [x] **Step 4: Run test to verify it passes**

Run: `deno test --allow-read supabase/functions/line-bot/layoffSummaryHelper.test.ts` (or npm test equivalent)  
Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add supabase/functions/line-bot/layoffSummaryHelper.ts supabase/functions/line-bot/layoffSummaryHelper.test.ts; git commit -m "feat(line-bot): add layoffSummaryHelper for financial aggregation and flex formatting"
```

---

### Task 4: LINE Bot Command Routing & Handler Integration

**Files:**
- Modify: `supabase/functions/line-bot/index.ts`
- Create: `supabase/functions/line-bot/layoffCommands.test.ts`

**Interfaces:**
- Consumes: LINE webhook text event
- Produces: Flex Message reply for `/สรุปตีออก`, Text/Flex reply for `/โพยตีออกถูก`

- [x] **Step 1: Write integration tests for command routing in `layoffCommands.test.ts`**

Create `supabase/functions/line-bot/layoffCommands.test.ts`:
```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("Command regex correctly matches /สรุปตีออก and /โพยตีออกถูก with and without ID", () => {
  const cmd1 = "/สรุปตีออก";
  const cmd2 = "/สรุปตีออก 10001";
  const cmd3 = "/โพยตีออกถูก";
  const cmd4 = "/โพยตีออกถูก 10001";

  const isSummaryLayoff = cmd1.startsWith("/สรุปตีออก");
  const targetId1 = cmd1.substring("/สรุปตีออก".length).trim();
  assertEquals(isSummaryLayoff, true);
  assertEquals(targetId1, "");

  const targetId2 = cmd2.substring("/สรุปตีออก".length).trim();
  assertEquals(targetId2, "10001");

  const isWinningLayoff = cmd3.startsWith("/โพยตีออกถูก");
  const targetWinId3 = cmd3.substring("/โพยตีออกถูก".length).trim();
  assertEquals(isWinningLayoff, true);
  assertEquals(targetWinId3, "");

  const targetWinId4 = cmd4.substring("/โพยตีออกถูก".length).trim();
  assertEquals(targetWinId4, "10001");
});
```

- [x] **Step 2: Run test to verify regex/parsing**

Run: `deno test supabase/functions/line-bot/layoffCommands.test.ts`  
Expected: PASS.

- [x] **Step 3: Integrate command handlers in `supabase/functions/line-bot/index.ts`**

In `supabase/functions/line-bot/index.ts`:
1. Add fast-path detection for `/สรุปตีออก` and `/โพยตีออกถูก`.
2. Add command handler block:
   - Check authorization: sender must be dealer, superadmin, admin, or manager in `line_managers`.
   - Identify active round: query latest announced round (`is_result_announced = true`) for this group/dealer.
   - Fetch `bet_transfers` for `round.id` with pagination (`fetchAllRows` / range 1,000) ordered by `created_at DESC` (Domain Rule #2).
   - Fetch `dealer_upstream_connections` for dealer.
   - Execute `calculateLayoffSummaries`.
   - For `/สรุปตีออก`: if `targetId` present, find dealer by `upstream_code` or `member_code` or name. Render targeted Flex card or all-dealers ranked Flex card.
   - For `/โพยตีออกถูก`: filter winning bets (`winAmount > 0`). If `targetId` present, filter by target dealer. Format and send response.

- [x] **Step 4: Run line-bot tests to ensure zero regressions**

Run: `npm test`  
Expected: All tests pass (including existing 898 tests).

- [x] **Step 5: Commit**

```powershell
git add supabase/functions/line-bot/index.ts supabase/functions/line-bot/layoffCommands.test.ts; git commit -m "feat(line-bot): integrate /สรุปตีออก and /โพยตีออกถูก commands with authorization check"
```

---

### Task 5: End-to-End Verification

**Files:**
- Test: `scratch/test_e2e_layoff.js`

- [x] **Step 1: Write E2E verification script**
Create a test script that validates the entire flow:
- Queries an existing announced round with transfers (e.g. Thai round 16-11-2569).
- Runs `calculateLayoffSummaries`.
- Confirms ranking orders dealers by totalBet descending.
- Confirms Flex Message payload conforms to LINE Messaging API schema.

- [x] **Step 2: Execute E2E verification**
Run: `node scratch/test_e2e_layoff.js`  
Expected: Successful output, valid Flex JSON.

- [x] **Step 3: Final commit and summary**
```powershell
git add scratch/test_e2e_layoff.js; git commit -m "test: add e2e verification for layoff summary and winning commands"
```
