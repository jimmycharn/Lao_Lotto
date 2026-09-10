# Dealer History Upstream Layoff Settlement Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มระบบบันทึกการชำระ/รับเงิน และติดตามยอดคงค้างของเจ้ามือรับตีออก (Upstream Layoff Settlement) ในแท็บประวัติของ Dealer Dashboard ให้ทำงานครบวงจรเหมือนกับระบบชำระเงินของสมาชิก

**Architecture:** 
1. สร้างตารางฐานข้อมูลเฉพาะ `public.upstream_round_payments` พร้อมนโยบาย RLS
2. เพิ่มฟังก์ชันการคำนวณ Initial Balance, Current Balance, Settlement Status, และ Presets สำหรับ Upstream Dealer ใน `memberSettlementCalculator.js` พร้อม Unit Tests ครบถ้วน
3. สร้างคอมโพเนนต์ `UpstreamSettlementInline.jsx` และ `.css` สำหรับสรุปยอด, หน้าต่างยืนยันเคลียร์ครบ, ฟอร์มบันทึกพร้อมปุ่มลัด (Default วันที่งวดหวย, โอนแล้ว, รับคืนรางวัล), และตารางประวัติ
4. เชื่อมโยงใน `src/pages/Dealer.jsx` ทั้งการดึงข้อมูล, การบันทึก/ลบ, การแสดงคอลัมน์ "สถานะ / ยอดคงค้าง", และการล้างข้อมูลเมื่อลบงวดประวัติ

**Tech Stack:** React (Vite), Supabase PostgreSQL + RLS, Vitest, CSS Modules/Vanilla CSS

## Global Constraints

- Direction values: `dealer_to_upstream` (🔴 เราจ่ายให้เจ้ามือรับตีออก), `upstream_to_dealer` (🟢 เจ้ามือรับตีออกจ่ายคืนเรา)
- Payment types: `net_settlement` (เคลียร์ยอดสุทธิ), `prize_collection` (รับคืนเงินรางวัล)
- All monetary calculations must use rounded numbers (`Math.round`)
- Date format in inputs must be `YYYY-MM-DD` ISO string
- Upstream dealer grouping is mapped by `dealerName` and `upstream_dealer_id`

---

### Task 1: Database Migration for `upstream_round_payments`

**Files:**
- Create: `supabase/migrations/223_create_upstream_round_payments.sql`

**Interfaces:**
- Produces: `public.upstream_round_payments` table with columns: `id`, `dealer_id`, `round_id`, `lottery_type`, `round_date`, `upstream_dealer_name`, `upstream_dealer_id`, `payment_type`, `direction`, `amount`, `paid_at`, `notes`, `created_at`, `created_by`

- [ ] **Step 1: Create migration SQL file**

```sql
-- Migration 223: Create upstream_round_payments table
CREATE TABLE IF NOT EXISTS public.upstream_round_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID NOT NULL,
    lottery_type TEXT,
    round_date DATE,
    upstream_dealer_name TEXT NOT NULL,
    upstream_dealer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('net_settlement', 'prize_collection')),
    direction TEXT NOT NULL CHECK (direction IN ('dealer_to_upstream', 'upstream_to_dealer')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_upstream_round_payments_lookup 
ON public.upstream_round_payments(dealer_id, round_id, upstream_dealer_name);

ALTER TABLE public.upstream_round_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealers can view and manage their upstream round payments" ON public.upstream_round_payments;
CREATE POLICY "Dealers can view and manage their upstream round payments"
ON public.upstream_round_payments
FOR ALL
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

DROP POLICY IF EXISTS "Superadmins have full access to upstream round payments" ON public.upstream_round_payments;
CREATE POLICY "Superadmins have full access to upstream round payments"
ON public.upstream_round_payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    )
);
```

- [ ] **Step 2: Deploy migration to Supabase database**

Run: `npx.cmd supabase db push`
Expected: Remote database updated with migration 223 successfully.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/223_create_upstream_round_payments.sql
git commit -m "feat(db): add upstream_round_payments table migration 223"
```

---

### Task 2: Upstream Settlement Calculation Utility & Unit Tests

**Files:**
- Modify: `src/utils/memberSettlementCalculator.js`
- Modify: `src/utils/memberSettlementCalculator.test.js`

**Interfaces:**
- Consumes: transfer object `{ amount, commission_earned, winnings }`, payments array `[{ direction, amount, payment_type }]`
- Produces:
  - `calculateUpstreamInitialBalance(transfer)` -> `number` (Positive = Dealer owes Upstream, Negative = Upstream owes Dealer)
  - `calculateUpstreamCurrentBalance(initialBalance, payments)` -> `number`
  - `getUpstreamSettlementStatus(currentBalance)` -> `{ isSettled: boolean, formattedText: string, color: string, badgeBg: string, badgeBorder: string, partyWhoOwes: 'dealer' | 'upstream' | 'none' }`
  - `getUpstreamPaymentPresetAmount(transfer, payments, paymentType, direction)` -> `number`

- [ ] **Step 1: Write failing unit tests for Upstream settlement in `src/utils/memberSettlementCalculator.test.js`**

Add tests for:
1. `calculateUpstreamInitialBalance`: Net layoff 6,030 (8600 - 2570) and winnings 0 -> Initial balance = 6030 (Dealer owes Upstream)
2. `calculateUpstreamInitialBalance`: Net layoff 5,000 and winnings 12,000 -> Initial balance = -7000 (Upstream owes Dealer)
3. `calculateUpstreamCurrentBalance`: Initial balance 6030, payment `dealer_to_upstream` 6030 -> Current balance = 0
4. `getUpstreamSettlementStatus`: Balance 6030 -> `isSettled: false, formattedText: '-฿6,030'`
5. `getUpstreamSettlementStatus`: Balance -7000 -> `isSettled: false, formattedText: '+฿7,000'`
6. `getUpstreamSettlementStatus`: Balance 0 -> `isSettled: true, formattedText: '฿0'`
7. `getUpstreamPaymentPresetAmount`: Net settlement & Prize collection amounts

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --run src/utils/memberSettlementCalculator.test.js`
Expected: FAIL with "calculateUpstreamInitialBalance is not defined"

- [ ] **Step 3: Implement Upstream calculation functions in `src/utils/memberSettlementCalculator.js`**

Implement:
```javascript
export function calculateUpstreamInitialBalance(transfer) {
    const amount = Number(transfer?.amount || 0)
    const comm = Number(transfer?.commission_earned || 0)
    const netLayoff = Math.round(amount - comm)
    const winnings = Number(transfer?.winnings || 0)
    return Math.round(netLayoff - winnings)
}

export function calculateUpstreamCurrentBalance(initialBalance, payments = []) {
    const paidByDealer = payments
        .filter(p => p.direction === 'dealer_to_upstream')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    
    const paidByUpstream = payments
        .filter(p => p.direction === 'upstream_to_dealer')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    
    return Math.round(initialBalance - paidByDealer + paidByUpstream)
}

export function getUpstreamSettlementStatus(currentBalance) {
    if (Math.abs(currentBalance) <= 0.01) {
        return {
            isSettled: true,
            formattedText: '฿0',
            color: 'var(--color-success, #10b981)',
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.3)',
            partyWhoOwes: 'none'
        }
    }

    if (currentBalance > 0) {
        // Dealer owes Upstream
        return {
            isSettled: false,
            formattedText: `-฿${Math.round(currentBalance).toLocaleString()}`,
            color: '#ef4444',
            badgeBg: 'rgba(239, 68, 68, 0.15)',
            badgeBorder: 'rgba(239, 68, 68, 0.3)',
            partyWhoOwes: 'dealer'
        }
    }

    // Upstream owes Dealer
    return {
        isSettled: false,
        formattedText: `+฿${Math.abs(Math.round(currentBalance)).toLocaleString()}`,
        color: 'var(--color-success, #10b981)',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.3)',
        partyWhoOwes: 'upstream'
    }
}

export function getUpstreamPaymentPresetAmount(transfer, payments = [], paymentType = 'net_settlement') {
    if (paymentType === 'prize_collection') {
        const totalWinnings = Number(transfer?.winnings || 0)
        const prizeCollected = payments
            .filter(p => p.payment_type === 'prize_collection')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return Math.max(0, Math.round(totalWinnings - prizeCollected))
    }

    const initial = calculateUpstreamInitialBalance(transfer)
    const current = calculateUpstreamCurrentBalance(initial, payments)
    return Math.abs(current)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --run src/utils/memberSettlementCalculator.test.js`
Expected: PASS (100%)

- [ ] **Step 5: Commit**

```bash
git add src/utils/memberSettlementCalculator.js src/utils/memberSettlementCalculator.test.js
git commit -m "feat(calculator): add upstream settlement calculations and unit tests"
```

---

### Task 3: Create `UpstreamSettlementInline` Component & CSS

**Files:**
- Create: `src/components/dealer/UpstreamSettlementInline.jsx`
- Create: `src/components/dealer/UpstreamSettlementInline.css`

**Interfaces:**
- Consumes:
  - `transfer`: `{ dealerName, amount, commission_earned, winnings, upstream_dealer_id }`
  - `round`: round object with `id`, `round_id`, `lottery_type`, `round_date`, `close_time`
  - `payments`: array of upstream payment records
  - `onSavePayment(payload)`: async callback
  - `onDeletePayment(paymentId)`: async callback
  - `onClose()`: callback

- [ ] **Step 1: Create `UpstreamSettlementInline.css`**

Reuse the dark glassmorphism styling from `MemberSettlementInline.css` with responsive layout, modal styles, and `.preset-pill-btn.active`.

- [ ] **Step 2: Create `UpstreamSettlementInline.jsx`**

Implement:
1. Balances summary: `netLayoff`, `totalWinnings`, `paidByDealer`, `paidByUpstream`, `currentBalance`, `status`
2. Quick Action `⚡ เคลียร์ครบ ({status.formattedText})` button and Quick Settle Modal with date picker, quick date chips (`[ วันนี้ ]`, `[ วันที่งวดหวย ]`), notes input with quick chips (`[ เคลียร์ยอดครบจำนวน ]`, `[ โอนแล้ว ]`, `[ เงินสด ]`)
3. Manual form `+ บันทึกการจ่าย/รับเงิน`:
   - Default tab: `prize_collection` if `totalWinnings > 0`, else `net_settlement`
   - Default direction: `dealer_to_upstream` if `currentBalance >= 0` else `upstream_to_dealer`
   - Default amount: prefilled with `totalWinnings` (if prize collection) or `Math.abs(currentBalance)` (if net settlement), with active highlight on the matching preset button
   - Default date: prefilled with `roundDateIso || todayStr` with active highlight on `[ วันที่งวดหวย ]`
   - Default notes: prefilled with `'โอนแล้ว'` with active highlight on `[ โอนแล้ว ]`
4. Payments history table showing: Date, Type, Direction (`🔴 เราจ่ายให้เจ้ามือ` / `🟢 เจ้ามือจ่ายเรา`), Amount, Notes, and Delete button 🗑️

- [ ] **Step 3: Commit**

```bash
git add src/components/dealer/UpstreamSettlementInline.jsx src/components/dealer/UpstreamSettlementInline.css
git commit -m "feat(ui): add UpstreamSettlementInline component and styles"
```

---

### Task 4: Integrate Upstream Settlement in `Dealer.jsx`

**Files:**
- Modify: `src/pages/Dealer.jsx`

**Interfaces:**
- Imports: `UpstreamSettlementInline`, `calculateUpstreamInitialBalance`, `calculateUpstreamCurrentBalance`, `getUpstreamSettlementStatus`
- State: `expandedUpstreamSettlementId`, `upstreamPayments` in `historyDetails`

- [ ] **Step 1: Import Upstream components and calculation functions in `Dealer.jsx`**

Import `UpstreamSettlementInline` from `../components/dealer/UpstreamSettlementInline`, and `calculateUpstreamInitialBalance`, `calculateUpstreamCurrentBalance`, `getUpstreamSettlementStatus` from `../utils/memberSettlementCalculator`.

- [ ] **Step 2: Update `fetchHistoryDetails` to query `upstream_round_payments`**

In `fetchHistoryDetails`:
Query `public.upstream_round_payments` where `dealer_id = user.id` and `round_id = targetRoundId`. Store as `upstreamPayments` in `historyDetails[historyId]`.

- [ ] **Step 3: Add `handleSaveUpstreamPayment` and `handleDeleteUpstreamPayment`**

Implement handlers to insert and delete records in `upstream_round_payments` and optimistically/reactively update `historyDetails[historyId].upstreamPayments`.

- [ ] **Step 4: Update `confirmDeleteHistoryRecord` to delete from `upstream_round_payments`**

Clean up upstream payments when round history is deleted.

- [ ] **Step 5: Update the Outgoing Layoff Bet Transfers Table (`🚀 รายละเอียดการตีออกให้เจ้ามือในงวดนี้`)**

Add:
1. Header column: `<th style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>สถานะ / ยอดคงค้าง</th>`
2. Row click and Badge render:
   Compute `initBal = calculateUpstreamInitialBalance(t)` and `currBal = calculateUpstreamCurrentBalance(initBal, dealerUpstreamPayments)`.
   Render status badge button with `status.formattedText` and toggle `expandedUpstreamSettlementId`.
3. Expandable Sub-row:
   When `expandedUpstreamSettlementId === settlementKey`, render:
   ```jsx
   <tr>
       <td colSpan={7}>
           <UpstreamSettlementInline
               transfer={t}
               round={history}
               payments={dealerUpstreamPayments}
               onSavePayment={(paymentData) => handleSaveUpstreamPayment({ historyItem: history, transfer: t, paymentData })}
               onDeletePayment={(paymentId) => handleDeleteUpstreamPayment({ historyItem: history, paymentId })}
               onClose={() => setExpandedUpstreamSettlementId(null)}
           />
       </td>
   </tr>
   ```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dealer.jsx
git commit -m "feat(dealer): integrate upstream layoff settlement in history table"
```

---

### Task 5: End-to-End Verification & Production Build

**Files:**
- Test: Vitest test suites
- Build: Vite production build

- [ ] **Step 1: Run all automated tests**

Run: `npm.cmd test -- --run`
Expected: All tests pass (309+ tests passing 100%).

- [ ] **Step 2: Run Vite build**

Run: `npm.cmd run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Update `walkthrough.md` and commit**

```bash
git add docs/superpowers/plans/2026-09-10-dealer-history-upstream-settlement-payments.md walkthrough.md
git commit -m "docs: update plan and walkthrough for upstream settlement payments"
```
