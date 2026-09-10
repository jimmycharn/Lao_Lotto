# Dealer History Member Settlement Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เจ้ามือสามารถบันทึกการรับ-จ่ายเงินของสมาชิกแต่ละคนในแท็บประวัติตามงวดที่ประกาศผลแล้ว พร้อมทั้งแสดงยอดคงค้าง (+ / - / 0) แบบ Inline Expandable Sub-Row รองรับทั้ง Desktop และ Mobile

**Architecture:**
- **Database:** ตาราง `public.member_round_payments` บันทึกประวัติการชำระเงิน พร้อม RLS ให้ Dealer และ SuperAdmin
- **Pure Utility:** `memberSettlementCalculator.js` คำนวณยอดตั้งต้น, ยอดคงค้าง, สถานะ และตัวเลือก Preset พร้อม Vitest Unit Tests
- **Component:** `MemberSettlementInline.jsx` จัดการแผงสรุปการเงิน, ฟอร์มบันทึกการเงิน, และประวัติการชำระเงิน
- **Integration:** อัปเดต `Dealer.jsx` ให้ดึงข้อมูล `member_round_payments` ใน `fetchHistoryDetails`, เพิ่มคอลัมน์สถานะยอดคงค้างในตารางสมาชิก, และรองรับการคลี่เปิด Inline Sub-Row

**Tech Stack:** React 19, Supabase PostgreSQL, Vitest, Vanilla CSS, React Icons

## Global Constraints
- Do not use TailwindCSS unless explicitly requested; use existing CSS variables and Dark Glassmorphism theme tokens.
- All member payment amounts must be positive numbers (`amount > 0`).
- Direction is `'member_to_dealer'` (สมาชิกจ่ายเจ้ามือ) หรือ `'dealer_to_member'` (เจ้ามือจ่ายสมาชิก).
- Touch targets on mobile must be >= 44px.

---

### Task 1: Database Migration for `member_round_payments`

**Files:**
- Create: `supabase/migrations/222_create_member_round_payments.sql`

**Interfaces:**
- Produces: Table `public.member_round_payments` with columns:
  - `id` UUID PRIMARY KEY
  - `dealer_id` UUID REFERENCES profiles(id)
  - `user_id` UUID REFERENCES profiles(id)
  - `round_id` UUID NOT NULL
  - `lottery_type` TEXT
  - `round_date` DATE
  - `payment_type` TEXT ('net_settlement', 'prize_payout')
  - `direction` TEXT ('member_to_dealer', 'dealer_to_member')
  - `amount` NUMERIC(12,2)
  - `paid_at` DATE
  - `notes` TEXT
  - `created_at` TIMESTAMPTZ
  - `created_by` UUID

- [ ] **Step 1: Create migration file `222_create_member_round_payments.sql`**

```sql
-- Migration 222: Create member_round_payments table
CREATE TABLE IF NOT EXISTS public.member_round_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    round_id UUID NOT NULL,
    lottery_type TEXT,
    round_date DATE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('net_settlement', 'prize_payout')),
    direction TEXT NOT NULL CHECK (direction IN ('member_to_dealer', 'dealer_to_member')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_member_round_payments_lookup 
ON public.member_round_payments(dealer_id, round_id, user_id);

ALTER TABLE public.member_round_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers can view and manage their member round payments"
ON public.member_round_payments
FOR ALL
USING (auth.uid() = dealer_id)
WITH CHECK (auth.uid() = dealer_id);

CREATE POLICY "Superadmins have full access to member round payments"
ON public.member_round_payments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin'
    )
);
```

- [ ] **Step 2: Push migration to remote database**

Run: `npx.cmd supabase db push`
Expected: Applies migration 222 successfully.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/222_create_member_round_payments.sql
git commit -m "feat(db): create member_round_payments table"
```

---

### Task 2: Settlement Math Utility & Unit Tests

**Files:**
- Create: `src/utils/memberSettlementCalculator.js`
- Test: `src/utils/memberSettlementCalculator.test.js`

**Interfaces:**
- Produces:
  - `calculateMemberInitialBalance(uh)`: returns number
  - `calculateMemberCurrentBalance(initialBalance, payments)`: returns number
  - `getMemberSettlementStatus(currentBalance)`: returns `{ isSettled, owesDealer, owesMember, balance, formattedText, colorClass }`
  - `getPaymentPresetAmount(memberHistory, payments, paymentType, direction)`: returns number

- [ ] **Step 1: Write failing tests in `src/utils/memberSettlementCalculator.test.js`**

```javascript
import { describe, it, expect } from 'vitest'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    getMemberSettlementStatus,
    getPaymentPresetAmount
} from './memberSettlementCalculator'

describe('memberSettlementCalculator', () => {
    it('calculates initial balance correctly: (total_amount - commission) - winnings', () => {
        // Member owes dealer: 2794 - 565 - 0 = 2229
        const uh1 = { total_amount: 2794, total_commission: 565, total_winnings: 0 }
        expect(calculateMemberInitialBalance(uh1)).toBe(2229)

        // Dealer owes member: 1000 - 200 - 10000 = -9200
        const uh2 = { total_amount: 1000, total_commission: 200, total_winnings: 10000 }
        expect(calculateMemberInitialBalance(uh2)).toBe(-9200)

        // Break even: 1000 - 200 - 800 = 0
        const uh3 = { total_amount: 1000, total_commission: 200, total_winnings: 800 }
        expect(calculateMemberInitialBalance(uh3)).toBe(0)
    })

    it('calculates current balance with payments: initial - member_paid + dealer_paid', () => {
        const initial = 2229
        // Member paid 1000
        const payments1 = [{ direction: 'member_to_dealer', amount: 1000 }]
        expect(calculateMemberCurrentBalance(initial, payments1)).toBe(1229)

        // Member paid remaining 1229
        const payments2 = [
            { direction: 'member_to_dealer', amount: 1000 },
            { direction: 'member_to_dealer', amount: 1229 }
        ]
        expect(calculateMemberCurrentBalance(initial, payments2)).toBe(0)

        // Initial was -9200 (dealer owes member), dealer paid 5000
        const initialNegative = -9200
        const paymentsDealer = [{ direction: 'dealer_to_member', amount: 5000 }]
        expect(calculateMemberCurrentBalance(initialNegative, paymentsDealer)).toBe(-4200)

        // Dealer paid full remaining
        const paymentsDealerFull = [
            { direction: 'dealer_to_member', amount: 5000 },
            { direction: 'dealer_to_member', amount: 4200 }
        ]
        expect(calculateMemberCurrentBalance(initialNegative, paymentsDealerFull)).toBe(0)
    })

    it('determines status correctly: owesDealer, owesMember, isSettled', () => {
        expect(getMemberSettlementStatus(2229)).toMatchObject({
            owesDealer: true,
            owesMember: false,
            isSettled: false,
            formattedText: '+฿2,229'
        })

        expect(getMemberSettlementStatus(-1400)).toMatchObject({
            owesDealer: false,
            owesMember: true,
            isSettled: false,
            formattedText: '-฿1,400'
        })

        expect(getMemberSettlementStatus(0)).toMatchObject({
            owesDealer: false,
            owesMember: false,
            isSettled: true,
            formattedText: '฿0'
        })
    })

    it('calculates payment presets for quick buttons', () => {
        const uh = { total_amount: 2511, total_commission: 504, total_winnings: 1400 }
        const initial = calculateMemberInitialBalance(uh) // 607

        // For net settlement, preset is remaining balance absolute value
        expect(getPaymentPresetAmount(uh, [], 'net_settlement', 'member_to_dealer')).toBe(607)

        // For prize payout only, preset is winnings amount
        expect(getPaymentPresetAmount(uh, [], 'prize_payout', 'dealer_to_member')).toBe(1400)
    })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm.cmd test src/utils/memberSettlementCalculator.test.js -- --run`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Implement `src/utils/memberSettlementCalculator.js`**

```javascript
/**
 * Calculates the initial dealer profit / net balance for a member in a round.
 * Initial Balance = (total_amount - total_commission) - total_winnings
 * Positive (+) => Member owes dealer
 * Negative (-) => Dealer owes member
 * Zero (0) => Even
 */
export function calculateMemberInitialBalance(uh) {
    if (!uh) return 0
    const amount = Number(uh.total_amount || 0)
    const comm = Number(uh.total_commission || 0)
    const win = Number(uh.total_winnings || 0)
    return Math.round(amount - comm - win)
}

/**
 * Calculates current outstanding balance after applying payment logs.
 * Current = Initial - paid_by_member + paid_by_dealer
 */
export function calculateMemberCurrentBalance(initialBalance, payments = []) {
    const init = Number(initialBalance || 0)
    if (!Array.isArray(payments) || payments.length === 0) return init

    let paidByMember = 0
    let paidByDealer = 0

    payments.forEach(p => {
        const amt = Number(p.amount || 0)
        if (p.direction === 'member_to_dealer') {
            paidByMember += amt
        } else if (p.direction === 'dealer_to_member') {
            paidByDealer += amt
        }
    })

    return Math.round(init - paidByMember + paidByDealer)
}

/**
 * Returns formatted settlement status metadata
 */
export function getMemberSettlementStatus(currentBalance) {
    const bal = Math.round(Number(currentBalance || 0))
    if (bal === 0) {
        return {
            balance: 0,
            isSettled: true,
            owesDealer: false,
            owesMember: false,
            formattedText: '฿0',
            label: 'ชำระครบแล้ว',
            color: 'var(--color-success, #10b981)',
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.3)'
        }
    }

    if (bal > 0) {
        return {
            balance: bal,
            isSettled: false,
            owesDealer: true,
            owesMember: false,
            formattedText: `+฿${bal.toLocaleString()}`,
            label: 'คนส่งค้างเจ้ามือ',
            color: 'var(--color-warning, #f59e0b)',
            badgeBg: 'rgba(245, 158, 11, 0.15)',
            badgeBorder: 'rgba(245, 158, 11, 0.3)'
        }
    }

    const absBal = Math.abs(bal)
    return {
        balance: bal,
        isSettled: false,
        owesDealer: false,
        owesMember: true,
        formattedText: `-฿${absBal.toLocaleString()}`,
        label: 'เจ้ามือค้างคนส่ง',
        color: 'var(--color-danger, #ef4444)',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeBorder: 'rgba(239, 68, 68, 0.3)'
    }
}

/**
 * Calculates preset amount for payment form
 */
export function getPaymentPresetAmount(memberHistory, payments = [], paymentType = 'net_settlement', direction = 'member_to_dealer') {
    if (paymentType === 'prize_payout') {
        const totalWinnings = Number(memberHistory?.total_winnings || 0)
        // Check how much prize was already paid
        const prizePaid = payments
            .filter(p => p.payment_type === 'prize_payout')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return Math.max(0, Math.round(totalWinnings - prizePaid))
    }

    const initial = calculateMemberInitialBalance(memberHistory)
    const current = calculateMemberCurrentBalance(initial, payments)
    return Math.abs(current)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test src/utils/memberSettlementCalculator.test.js -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/memberSettlementCalculator.js src/utils/memberSettlementCalculator.test.js
git commit -m "feat: add memberSettlementCalculator with unit tests"
```

---

### Task 3: MemberSettlementInline Component

**Files:**
- Create: `src/components/dealer/MemberSettlementInline.jsx`
- Create: `src/components/dealer/MemberSettlementInline.css`

**Interfaces:**
- Props:
  - `member`: user history item with `user_id`, `total_amount`, `total_commission`, `total_winnings`, `profiles`
  - `round`: round object with `id`, `lottery_type`, `round_date`
  - `payments`: array of payment records for this member
  - `onSavePayment(paymentData)`: async function returning Promise
  - `onDeletePayment(paymentId)`: async function returning Promise
  - `onClose()`: callback

- [ ] **Step 1: Create `MemberSettlementInline.css`**

Define styling tokens for the summary strip, quick action buttons, inline form, and payment history log table using existing theme variables (`var(--color-surface)`, `var(--color-border)`, `var(--color-primary)`).

- [ ] **Step 2: Create `MemberSettlementInline.jsx`**

Implement:
- Summary metrics strip: Net bet, Prize, Paid, Outstanding Balance
- Quick settlement button: "⚡ เคลียร์ครบจำนวน"
- "+ บันทึกการจ่าย/รับเงิน" toggleable form:
  - Type toggle: Net Settlement / Prize Payout (if prize > 0)
  - Direction toggle: Member to Dealer / Dealer to Member
  - Amount input with preset pill buttons
  - Date input (defaults to today)
  - Notes input
  - Submit & Cancel buttons
- Payment history logs table with delete confirmation

- [ ] **Step 3: Commit component**

```bash
git add src/components/dealer/MemberSettlementInline.jsx src/components/dealer/MemberSettlementInline.css
git commit -m "feat: add MemberSettlementInline component"
```

---

### Task 4: Integrate Settlement into Dealer History Tab (`Dealer.jsx`)

**Files:**
- Modify: `src/pages/Dealer.jsx`

- [ ] **Step 1: Fetch `member_round_payments` in `fetchHistoryDetails`**

In `fetchHistoryDetails(historyItem)` (around line 390):
Query `member_round_payments` for `round_id: historyItem.round_id || historyItem.id` and attach to `historyDetails[historyId].payments`.

```javascript
const { data: paymentsData } = await supabase
    .from('member_round_payments')
    .select('*')
    .eq('dealer_id', user.id)
    .eq('round_id', historyItem.round_id || historyItem.id)
    .order('paid_at', { ascending: false })
```

- [ ] **Step 2: Add payment handlers (`handleSaveMemberPayment`, `handleDeleteMemberPayment`)**

Implement optimistic updates for adding and deleting payments in `historyDetails`.

- [ ] **Step 3: Update Member Breakdown table header and rows**

- Add Table Header column: `<th style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>สถานะ / ยอดคงค้าง</th>`
- In Table Rows:
  - Calculate `currentBalance` using `calculateMemberCurrentBalance(initialBalance, memberPayments)`
  - Render clickable status badge pill (`+฿X`, `-฿X`, `ชำระครบแล้ว`)
  - When row is clicked, toggle `expandedMemberId === uh.user_id`
  - If expanded, render sub-row:
    ```jsx
    {isMemberExpanded && (
        <tr className="member-settlement-expanded-row">
            <td colSpan={7} style={{ padding: "0.75rem 1rem", background: "rgba(0, 0, 0, 0.25)" }}>
                <MemberSettlementInline ... />
            </td>
        </tr>
    )}
    ```

- [ ] **Step 4: Commit `Dealer.jsx`**

```bash
git add src/pages/Dealer.jsx
git commit -m "feat: integrate member settlement sub-rows in Dealer history tab"
```

---

### Task 5: End-to-End Verification & Final Polish

- [ ] **Step 1: Run Vitest test suite**

Run: `npm.cmd test -- --run`
Expected: All tests pass.

- [ ] **Step 2: Run Production Build**

Run: `npm.cmd run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Manual Testing Checklist**
1. Navigate to Dealer Dashboard > History tab.
2. Expand an announced round.
3. Verify the member table displays the "สถานะ / ยอดคงค้าง" column with correct colored badges.
4. Click on a member row to expand the inline settlement panel.
5. Click "⚡ เคลียร์ครบจำนวน" or "+ บันทึกการจ่าย/รับเงิน" and record a payment.
6. Verify the badge immediately updates to `฿0` or reduced balance.
7. Verify payment shows in the payment history log.
8. Delete the payment and verify balance reverts.
9. Verify responsive layout on mobile viewport.
