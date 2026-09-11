# Dealer Payment Notice Modal & LINE Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redundant top cross-round offset button in `MemberSettlementInline` with a "แจ้งชำระเงิน" (Payment Notice) button visible only when both current round and past rounds have outstanding balances, opening a dedicated `PaymentNoticeModal` with 3 billing modes, automated bank account resolution, and LINE Bot push notification dispatch.

**Architecture:**
- Create `src/utils/paymentNoticeHelper.js` with pure calculation, bank resolution, and LINE message formatting logic accompanied by comprehensive unit tests.
- Add `send_payment_notice` action to `supabase/functions/line-bot/index.ts` to push notifications directly to member LINE UIDs.
- Create `src/components/dealer/PaymentNoticeModal.jsx` and `.css` offering the 3 notice modes, past round selection, live calculation breakdown, bank account resolution, and LINE Bot dispatch with copy-to-clipboard fallback.
- Update `src/components/dealer/MemberSettlementInline.jsx` banner display condition (`pastUnpaidRounds.length > 0 && currentBalance !== 0`) and replace the top button with "แจ้งชำระเงิน".

**Tech Stack:** React (JSX), Supabase Client & Edge Functions (Deno/TypeScript), LINE Messaging API (Push message), Vitest for unit testing.

## Global Constraints
- "งวดวันที่" (Round Date) MUST always be resolved from `close_time` / `close_date` (never `open_date`) using `getRoundCloseDate` with Asia/Bangkok timezone.
- The payment notice feature does NOT record payment or debt clearance in the database (Option A: bill notice prior to customer transfer).
- Banner display condition in `MemberSettlementInline`: strictly `pastUnpaidRounds.length > 0 && currentBalance !== 0`.
- Maintain clean separation: do not mutate or compromise existing `CrossRoundOffsetModal` behavior.

---

### Task 1: Core Calculation, Bank Resolution, and LINE Message Helper

**Files:**
- Create: `src/utils/paymentNoticeHelper.js`
- Test: `src/utils/paymentNoticeHelper.test.js`

**Interfaces:**
- Produces:
  - `calculatePaymentNoticeSummary({ mode, currentBalance, currentWinnings, selectedPastRounds }): { netAmount, direction, currentRoundDebt, currentRoundPrize, selectedPastDebt, selectedPastPrize, modeLabel }`
  - `resolvePaymentNoticeBankAccount({ direction, dealerId, memberUserId, supabase, dealerBankAccounts, memberships }): Promise<{ bank_name, bank_account, account_name, source }>`
  - `formatPaymentNoticeMessage({ memberName, roundDate, lotteryTypeName, mode, summary, bankAccount, customNotes }): string`

- [ ] **Step 1: Write the failing tests for `paymentNoticeHelper`**

Create `src/utils/paymentNoticeHelper.test.js`:
```javascript
import { describe, it, expect } from 'vitest'
import {
    calculatePaymentNoticeSummary,
    formatPaymentNoticeMessage
} from './paymentNoticeHelper'

describe('paymentNoticeHelper', () => {
    describe('calculatePaymentNoticeSummary', () => {
        it('calculates mode "current_debt" (หนี้งวดนี้) correctly for member owing dealer', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'current_debt',
                currentBalance: 5768,
                currentWinnings: 0,
                selectedPastRounds: [{ roundId: 'r1', debt: 9157 }]
            })

            expect(summary.netAmount).toBe(5768)
            expect(summary.direction).toBe('member_to_dealer')
            expect(summary.modeLabel).toBe('หนี้งวดนี้')
        })

        it('calculates mode "current_debt" correctly when dealer owes member', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'current_debt',
                currentBalance: -3000,
                currentWinnings: 3000,
                selectedPastRounds: []
            })

            expect(summary.netAmount).toBe(3000)
            expect(summary.direction).toBe('dealer_to_member')
        })

        it('calculates mode "offset_prize_past_debt" (หักลบรางวัลกับหนี้เก่า) when past debt > prize', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'offset_prize_past_debt',
                currentBalance: 5768,
                currentWinnings: 3000,
                selectedPastRounds: [{ roundId: 'r1', debt: 9157 }]
            })

            // 9157 debt - 3000 prize = 6157 member owes dealer
            expect(summary.selectedPastDebt).toBe(9157)
            expect(summary.currentRoundPrize).toBe(3000)
            expect(summary.netAmount).toBe(6157)
            expect(summary.direction).toBe('member_to_dealer')
        })

        it('calculates mode "offset_prize_past_debt" when prize > past debt', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'offset_prize_past_debt',
                currentBalance: -5000,
                currentWinnings: 5000,
                selectedPastRounds: [{ roundId: 'r1', debt: 2000 }]
            })

            // 2000 debt - 5000 prize = -3000 (dealer owes member 3000)
            expect(summary.netAmount).toBe(3000)
            expect(summary.direction).toBe('dealer_to_member')
        })

        it('calculates mode "combine_all" (หักลบทั้งหมด) correctly', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'combine_all',
                currentBalance: 5768,
                currentWinnings: 0,
                selectedPastRounds: [{ roundId: 'r1', debt: 9157 }]
            })

            // 5768 + 9157 = 14925
            expect(summary.netAmount).toBe(14925)
            expect(summary.direction).toBe('member_to_dealer')
        })
    })

    describe('formatPaymentNoticeMessage', () => {
        it('formats LINE text message correctly with bank details', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่ชัช',
                roundDate: '2026-09-01',
                lotteryTypeName: 'หวยไทย',
                mode: 'offset_prize_past_debt',
                summary: {
                    netAmount: 9157,
                    direction: 'member_to_dealer',
                    currentRoundDebt: 5768,
                    currentRoundPrize: 0,
                    selectedPastDebt: 9157
                },
                bankAccount: {
                    bank_name: 'ไทยพาณิชย์',
                    bank_account: '9972081291',
                    account_name: 'สมชาย ใจดี'
                }
            })

            expect(msg).toContain('ใบแจ้งชำระเงิน')
            expect(msg).toContain('พี่ชัช')
            expect(msg).toContain('9,157')
            expect(msg).toContain('ไทยพาณิชย์')
            expect(msg).toContain('9972081291')
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/paymentNoticeHelper.test.js`
Expected: FAIL with module not found / functions not defined.

- [ ] **Step 3: Implement `src/utils/paymentNoticeHelper.js`**

Create `src/utils/paymentNoticeHelper.js`:
```javascript
/**
 * Calculates payment notice summary according to selected mode
 * @param {Object} params
 * @param {'current_debt' | 'offset_prize_past_debt' | 'combine_all'} params.mode
 * @param {number} params.currentBalance - Current round net balance (+ member owes dealer, - dealer owes member)
 * @param {number} params.currentWinnings - Total winning prize in current round
 * @param {Array<Object>} params.selectedPastRounds - Array of selected past unpaid round objects
 * @returns {Object} Calculated summary
 */
export function calculatePaymentNoticeSummary({
    mode = 'offset_prize_past_debt',
    currentBalance = 0,
    currentWinnings = 0,
    selectedPastRounds = []
}) {
    const curBal = Number(currentBalance || 0)
    const prize = Math.max(0, Number(currentWinnings || 0))

    const pastDebtTotal = selectedPastRounds
        .filter(r => Number(r.debt || 0) > 0)
        .reduce((sum, r) => sum + Number(r.debt || 0), 0)

    const pastPrizeTotal = selectedPastRounds
        .filter(r => Number(r.debt || 0) < 0)
        .reduce((sum, r) => sum + Math.abs(Number(r.debt || 0)), 0)

    const pastNetTotal = selectedPastRounds.reduce((sum, r) => sum + Number(r.debt || 0), 0)

    if (mode === 'current_debt') {
        const net = Math.abs(curBal)
        let direction = 'even'
        if (curBal > 0) direction = 'member_to_dealer'
        else if (curBal < 0) direction = 'dealer_to_member'

        return {
            mode,
            modeLabel: 'หนี้งวดนี้',
            netAmount: net,
            direction,
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
            selectedPastDebt: 0,
            selectedPastPrize: 0
        }
    }

    if (mode === 'offset_prize_past_debt') {
        // Offset current prize against past net debt
        const diff = pastNetTotal - prize
        let direction = 'even'
        if (diff > 0) direction = 'member_to_dealer'
        else if (diff < 0) direction = 'dealer_to_member'

        return {
            mode,
            modeLabel: 'หักลบรางวัลกับหนี้เก่า',
            netAmount: Math.abs(diff),
            direction,
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: prize,
            selectedPastDebt: pastDebtTotal,
            selectedPastPrize: pastPrizeTotal
        }
    }

    // combine_all: Current balance + all selected past debts
    const totalCombined = curBal + pastNetTotal
    let direction = 'even'
    if (totalCombined > 0) direction = 'member_to_dealer'
    else if (totalCombined < 0) direction = 'dealer_to_member'

    return {
        mode,
        modeLabel: 'หักลบทั้งหมด',
        netAmount: Math.abs(totalCombined),
        direction,
        currentRoundDebt: curBal > 0 ? curBal : 0,
        currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
        selectedPastDebt: pastDebtTotal,
        selectedPastPrize: pastPrizeTotal
    }
}

/**
 * Resolves bank account for the payment notice
 */
export async function resolvePaymentNoticeBankAccount({
    direction = 'member_to_dealer',
    dealerId,
    memberUserId,
    supabase,
    cachedDealerBanks = [],
    assignedBankAccountId = null
}) {
    if (!supabase) return null

    if (direction === 'dealer_to_member') {
        // Dealer pays member -> fetch member's bank account
        try {
            const { data: userBanks } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', memberUserId)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (userBanks && userBanks.length > 0) {
                const b = userBanks[0]
                return {
                    bank_name: b.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: b.bank_account || '',
                    account_name: b.account_name || '',
                    source: 'member_bank_accounts'
                }
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('bank_name, bank_account, bank_account_number, bank_account_name')
                .eq('id', memberUserId)
                .maybeSingle()

            if (profile?.bank_account || profile?.bank_account_number) {
                return {
                    bank_name: profile.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: profile.bank_account || profile.bank_account_number || '',
                    account_name: profile.bank_account_name || '',
                    source: 'member_profile'
                }
            }
        } catch (err) {
            console.error('Error resolving member bank account:', err)
        }
        return null
    }

    // Member pays dealer -> fetch dealer's assigned or default bank account
    try {
        let assignedId = assignedBankAccountId
        if (!assignedId && dealerId && memberUserId) {
            const { data: membership } = await supabase
                .from('user_dealer_memberships')
                .select('assigned_bank_account_id')
                .eq('dealer_id', dealerId)
                .eq('user_id', memberUserId)
                .maybeSingle()
            if (membership?.assigned_bank_account_id) {
                assignedId = membership.assigned_bank_account_id
            }
        }

        if (assignedId) {
            const cachedAssigned = cachedDealerBanks.find(b => b.id === assignedId)
            if (cachedAssigned) {
                return {
                    bank_name: cachedAssigned.bank_name || '',
                    bank_account: cachedAssigned.bank_account || '',
                    account_name: cachedAssigned.account_name || '',
                    source: 'dealer_assigned'
                }
            }

            const { data: assignedBank } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('id', assignedId)
                .maybeSingle()

            if (assignedBank) {
                return {
                    bank_name: assignedBank.bank_name || '',
                    bank_account: assignedBank.bank_account || '',
                    account_name: assignedBank.account_name || '',
                    source: 'dealer_assigned'
                }
            }
        }

        // Fallback: Dealer's default account
        if (cachedDealerBanks.length > 0) {
            const def = cachedDealerBanks.find(b => b.is_default) || cachedDealerBanks[0]
            if (def) {
                return {
                    bank_name: def.bank_name || '',
                    bank_account: def.bank_account || '',
                    account_name: def.account_name || '',
                    source: 'dealer_default'
                }
            }
        }

        const { data: dealerBanks } = await supabase
            .from('dealer_bank_accounts')
            .select('*')
            .eq('dealer_id', dealerId)
            .order('is_default', { ascending: false })

        if (dealerBanks && dealerBanks.length > 0) {
            const b = dealerBanks[0]
            return {
                bank_name: b.bank_name || '',
                bank_account: b.bank_account || '',
                account_name: b.account_name || '',
                source: 'dealer_default'
            }
        }

        // Fallback: Dealer profile
        const { data: dealerProf } = await supabase
            .from('profiles')
            .select('bank_name, bank_account, bank_account_number, bank_account_name')
            .eq('id', dealerId)
            .maybeSingle()

        if (dealerProf?.bank_account || dealerProf?.bank_account_number) {
            return {
                bank_name: dealerProf.bank_name || '',
                bank_account: dealerProf.bank_account || dealerProf.bank_account_number || '',
                account_name: dealerProf.bank_account_name || '',
                source: 'dealer_profile'
            }
        }
    } catch (err) {
        console.error('Error resolving dealer bank account:', err)
    }

    return null
}

/**
 * Formats LINE text message for payment notice
 */
export function formatPaymentNoticeMessage({
    memberName = 'สมาชิก',
    roundDate = '',
    lotteryTypeName = 'หวย',
    mode = 'offset_prize_past_debt',
    summary,
    bankAccount,
    customNotes = ''
}) {
    const lines = []
    lines.push('📋 ใบแจ้งชำระเงิน')
    lines.push(`👤 สมาชิก: ${memberName}`)
    if (roundDate) {
        lines.push(`🎲 งวดวันที่: ${roundDate} (${lotteryTypeName})`)
    }
    lines.push(`📌 รูปแบบ: ${summary?.modeLabel || 'แจ้งชำระ'}`)
    lines.push('----------------------------')

    if (mode === 'current_debt') {
        lines.push(`- ยอดค้างงวดปัจจุบัน: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
    } else if (mode === 'offset_prize_past_debt') {
        lines.push(`- รวมหนี้งวดเก่าที่เลือก: ฿${Number(summary?.selectedPastDebt || 0).toLocaleString()}`)
        lines.push(`- รางวัลงวดนี้ที่นำมาหักล้าง: ฿${Number(summary?.currentRoundPrize || 0).toLocaleString()}`)
    } else if (mode === 'combine_all') {
        lines.push(`- ยอดค้างงวดปัจจุบัน: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
        lines.push(`- รวมหนี้งวดเก่าที่เลือก: ฿${Number(summary?.selectedPastDebt || 0).toLocaleString()}`)
    }

    lines.push('----------------------------')

    const netAmt = Number(summary?.netAmount || 0).toLocaleString()
    if (summary?.direction === 'member_to_dealer') {
        lines.push(`💰 ยอดที่ต้องโอนชำระ: ฿${netAmt}`)
        lines.push('(🟢 สมาชิกโอนชำระให้เจ้ามือ)')
    } else if (summary?.direction === 'dealer_to_member') {
        lines.push(`💰 ยอดที่เจ้ามือต้องโอน: ฿${netAmt}`)
        lines.push('(🔴 เจ้ามือโอนคืนให้สมาชิก)')
    } else {
        lines.push(`💰 ยอดหักล้างพอดี: ฿0`)
        lines.push('(⚪ ไม่มียอดต้องโอน)')
    }

    if (bankAccount && (bankAccount.bank_account || bankAccount.bank_name)) {
        lines.push('')
        lines.push('💳 บัญชีโอนเงิน:')
        if (bankAccount.bank_name) lines.push(`ธนาคาร: ${bankAccount.bank_name}`)
        if (bankAccount.bank_account) lines.push(`เลขบัญชี: ${bankAccount.bank_account}`)
        if (bankAccount.account_name) lines.push(`ชื่อบัญชี: ${bankAccount.account_name}`)
    }

    if (customNotes && customNotes.trim()) {
        lines.push('')
        lines.push(`📝 หมายเหตุ: ${customNotes.trim()}`)
    }

    return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/paymentNoticeHelper.test.js`
Expected: PASS (all tests passing)

- [ ] **Step 5: Commit**

```bash
git add src/utils/paymentNoticeHelper.js src/utils/paymentNoticeHelper.test.js
git commit -m "feat: add payment notice calculation and formatting helpers with unit tests"
```

---

### Task 2: Supabase Edge Function Handler in `line-bot`

**Files:**
- Modify: `supabase/functions/line-bot/index.ts:4815-4830`

**Interfaces:**
- Consumes: HTTP POST request with `{ action: 'send_payment_notice', line_user_id: string, message_text: string }`
- Produces: JSON response `{ success: true }` or `{ success: false, error: string }`

- [ ] **Step 1: Check existing action handlers in `supabase/functions/line-bot/index.ts`**

Inspect lines 4810-4830 of `supabase/functions/line-bot/index.ts` where `apiPayload.action === 'ping'` is defined.

- [ ] **Step 2: Add `send_payment_notice` action handler**

Add the handler in `supabase/functions/line-bot/index.ts`:
```typescript
    if (apiPayload && apiPayload.action === 'send_payment_notice') {
      const targetLineUserId = (apiPayload.line_user_id || '').trim();
      const messageText = (apiPayload.message_text || '').trim();

      if (!targetLineUserId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing line_user_id' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!messageText) {
        return new Response(JSON.stringify({ success: false, error: 'Missing message_text' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      try {
        await sendLinePush(targetLineUserId, messageText);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      } catch (pushErr: any) {
        console.error('Error sending payment notice push:', pushErr);
        return new Response(JSON.stringify({ success: false, error: pushErr.message || String(pushErr) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/line-bot/index.ts
git commit -m "feat: add send_payment_notice action to line-bot edge function"
```

---

### Task 3: Build `PaymentNoticeModal.jsx` and CSS

**Files:**
- Create: `src/components/dealer/PaymentNoticeModal.jsx`
- Create: `src/components/dealer/PaymentNoticeModal.css`

**Interfaces:**
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `member: Object` (user history row / member object)
  - `round: Object` (current round)
  - `dealerId: string`
  - `pastUnpaidRounds: Array<Object>`
  - `currentBalance: number`
  - `currentWinnings: number`
  - `availableWinnings: number`

- [ ] **Step 1: Create `PaymentNoticeModal.css`**

Create `src/components/dealer/PaymentNoticeModal.css` with responsive, dark modern glassmorphism styling, clean toggle buttons for the 3 modes, past rounds selection list, calculation summary card, input fields, and action buttons.

- [ ] **Step 2: Create `PaymentNoticeModal.jsx`**

Implement `src/components/dealer/PaymentNoticeModal.jsx`:
- State:
  - `mode`: `'offset_prize_past_debt'` (default as in image 2), `'current_debt'`, or `'combine_all'`
  - `selectedRoundIds`: selected past round IDs
  - `customAmount`: custom amount override or empty
  - `noticeDate`: today's date ISO
  - `customNotes`: optional note
  - `bankInfo`: `{ bank_name, bank_account, account_name }` (resolved via `resolvePaymentNoticeBankAccount`)
  - `bankAccountText`: editable string (e.g. "ไทยพาณิชย์ 9972081291")
  - `sending`: loading flag
  - `copied`: clipboard feedback flag
- Dynamic resolution of bank accounts when `direction` changes
- "ส่งใบแจ้งชำระ" button:
  - Checks if member has `line_user_id` (from `member.profiles?.line_user_id` or fetched profile)
  - If `line_user_id`: calls `supabase.functions.invoke('line-bot', { body: { action: 'send_payment_notice', line_user_id, message_text } })` and shows success notification
  - If no `line_user_id`: shows alert with a "คัดลอกข้อความ" (Copy Text) button
- Keyboard Escape listener and click outside to close.

- [ ] **Step 3: Run unit tests to ensure no breakages**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/dealer/PaymentNoticeModal.jsx src/components/dealer/PaymentNoticeModal.css
git commit -m "feat: create PaymentNoticeModal component with 3 billing modes and LINE dispatch"
```

---

### Task 4: Integrate `PaymentNoticeModal` into `MemberSettlementInline.jsx`

**Files:**
- Modify: `src/components/dealer/MemberSettlementInline.jsx:90-140, 300-335, 4100+`

**Interfaces:**
- Banner condition changed to:
  ```javascript
  const hasCurrentDebt = currentBalance !== 0;
  const hasPastDebt = pastUnpaidRounds.length > 0;
  const showPaymentNoticeBanner = hasCurrentDebt && hasPastDebt;
  ```
- Banner button changed from `⚡ หักล้างยอดข้ามงวด` to:
  `<button type="button" className="btn-payment-notice" onClick={() => setShowPaymentNoticeModal(true)}>แจ้งชำระเงิน</button>`
- Renders `<PaymentNoticeModal>` inside `MemberSettlementInline.jsx`.

- [ ] **Step 1: Update `MemberSettlementInline.jsx`**

1. Import `PaymentNoticeModal` from `./PaymentNoticeModal`
2. Add state `const [showPaymentNoticeModal, setShowPaymentNoticeModal] = useState(false)`
3. Update condition on smart banner:
   ```javascript
   {showPaymentNoticeBanner && (
       <div className="cross-round-smart-banner">
           <div className="banner-left">
               ...
           </div>
           <button
               type="button"
               className="btn-payment-notice"
               onClick={() => setShowPaymentNoticeModal(true)}
               style={{
                   background: '#10b981',
                   color: '#ffffff',
                   fontWeight: 700,
                   border: 'none',
                   borderRadius: '6px',
                   padding: '0.45rem 1rem',
                   cursor: 'pointer'
               }}
           >
               แจ้งชำระเงิน
           </button>
       </div>
   )}
   ```
4. Render `<PaymentNoticeModal>`:
   ```jsx
   {showPaymentNoticeModal && (
       <PaymentNoticeModal
           isOpen={showPaymentNoticeModal}
           onClose={() => setShowPaymentNoticeModal(false)}
           member={member}
           round={round}
           dealerId={dealerId}
           pastUnpaidRounds={pastUnpaidRounds}
           currentBalance={currentBalance}
           currentWinnings={totalWinnings}
           availableWinnings={availableWinnings}
       />
   )}
   ```

- [ ] **Step 2: Run unit tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/dealer/MemberSettlementInline.jsx
git commit -m "feat: replace redundant cross-offset banner button with payment notice button in MemberSettlementInline"
```

---

### Task 5: Verification & Full Regression Testing

**Files:**
- All modified files

- [ ] **Step 1: Run all test suites**

Run: `npm run test`
Expected: All tests pass with zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Production build succeeds with 0 errors.

- [ ] **Step 3: Commit and verify working tree**

Run: `git status`
Expected: clean working directory.
