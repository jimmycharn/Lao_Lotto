# Automated LINE Slip Verification & Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างระบบรับชำระเงินอัตโนมัติเมื่อสมาชิกส่ง Slip ธนาคารลงในกลุ่ม LINE โดยตรวจสอบความถูกต้องของสลิปผ่าน SlipOK API ประจำตัวของ Dealer แต่ละคน คำนวณตัดหนี้ตามโหมดของหวย (งวดต่องวด หรือ งวดชนงวด) รองรับการตั้งค่าส่วนต่างยอดเงิน (Tolerance) บันทึกลงในตาราง `member_round_payments` และส่งข้อความสรุปยืนยันในกลุ่ม LINE ทันที

**Architecture:** ออกแบบระบบแบบแยกชั้น (Layered & Modular):
1. **Database Schema:** เพิ่มคอลัมน์เก็บ SlipOK credentials, Tolerance settings ใน `profiles`, โหมด `settlement_mode` ใน `line_groups`, และ metadata ใน `used_slips`
2. **Core Settlement Engine (`slipSettlementHelper.ts`):** โมดูลทดสอบได้อิสระ (Pure Functions) สำหรับคำนวณ Tolerance, ตรวจสอบยอด และสร้างข้อความตอบกลับ LINE
3. **SlipOK Integration (`slipOkClient.ts`):** ดึงรูปภาพจาก LINE Content API และตรวจสอบความถูกต้องของสลิปและบัญชีผู้รับ
4. **LINE Bot Event Handler (`index.ts`):** ดักจับ Image events ในกลุ่ม LINE ดำเนินการตรวจสอบและลงบันทึกในฐานข้อมูลแบบ Transaction
5. **Dealer Settings UI (`DealerLineBotTab.jsx`):** หน้าต่างตั้งค่า SlipOK API Key, ส่วนต่าง Tolerance, และเลือกโหมดของแต่ละกลุ่ม LINE

**Tech Stack:** TypeScript (Deno runtime for Supabase Edge Functions), React 18, Supabase Database & Storage, Vitest

## Global Constraints
- **กฎเหล็กเรื่องงวดวันที่:** ฟิลด์ `round_date` และการอ้างอิงงวดต้องใช้ `close_time` / `close_date` ของงวดเสมอ (ห้ามใช้ `open_date` เด็ดขาด)
- **กฎเหล็กเรื่อง Supabase 1,000 แถว:** การคิวรี่ข้อมูลประวัติการชำระเงินหรือหนี้ค้างต้องใช้ `fetchAllRows` และระบุ `.order('created_at', { ascending: false })` (หรือคอลัมน์ลำดับที่ชัดเจน) เสมอ
- **กฎเหล็กด้านความปลอดภัยของข้อมูล:** ห้ามลบ แก้ไข หรือสร้าง Mock Data ในฐานข้อมูลจริงโดยไม่ได้รับอนุญาต
- **การทดสอบ Unit Tests:** รันผ่านคำสั่ง `npm.cmd test -- --run supabase/functions/line-bot/slipSettlementHelper.test.ts` และ `npm.cmd test`

---

### Task 1: Database Migration for Dealer Slip Settings & Group Settlement Mode

**Files:**
- Create: `supabase/migrations/256_add_dealer_slip_settings_and_group_settlement_mode.sql`

**Interfaces:**
- Produces Database Columns:
  - `profiles.slip_provider` (TEXT DEFAULT 'slipok')
  - `profiles.slipok_api_key` (TEXT)
  - `profiles.slipok_branch_id` (TEXT)
  - `profiles.slip_tolerance_amount` (NUMERIC(10,2) DEFAULT 0.00)
  - `profiles.slip_tolerance_mode` (TEXT DEFAULT 'forgive_difference')
  - `profiles.auto_slip_verification_enabled` (BOOLEAN DEFAULT FALSE)
  - `line_groups.settlement_mode` (TEXT DEFAULT 'immediate')
  - `used_slips.member_id` (UUID REFERENCES profiles(id))
  - `used_slips.payment_id` (UUID REFERENCES member_round_payments(id))
  - `used_slips.slip_data` (JSONB)

- [ ] **Step 1: Write Migration SQL**

Create `supabase/migrations/256_add_dealer_slip_settings_and_group_settlement_mode.sql`:
```sql
-- Migration 256: Add dealer slip verification settings and line group settlement mode

-- 1. Add slip verification settings to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slip_provider TEXT DEFAULT 'slipok',
ADD COLUMN IF NOT EXISTS slipok_api_key TEXT,
ADD COLUMN IF NOT EXISTS slipok_branch_id TEXT,
ADD COLUMN IF NOT EXISTS slip_tolerance_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS slip_tolerance_mode TEXT DEFAULT 'forgive_difference',
ADD COLUMN IF NOT EXISTS auto_slip_verification_enabled BOOLEAN DEFAULT FALSE;

-- Add check constraint for slip_tolerance_mode if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_profiles_slip_tolerance_mode'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT chk_profiles_slip_tolerance_mode
        CHECK (slip_tolerance_mode IN ('forgive_difference', 'carry_remainder'));
    END IF;
END $$;

-- 2. Add settlement mode to line_groups table
ALTER TABLE public.line_groups
ADD COLUMN IF NOT EXISTS settlement_mode TEXT DEFAULT 'immediate';

-- Add check constraint for settlement_mode if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_line_groups_settlement_mode'
    ) THEN
        ALTER TABLE public.line_groups
        ADD CONSTRAINT chk_line_groups_settlement_mode
        CHECK (settlement_mode IN ('immediate', 'cross_round'));
    END IF;
END $$;

-- 3. Enhance used_slips table for member and payment linking
ALTER TABLE public.used_slips
ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.member_round_payments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS slip_data JSONB;

-- 4. Create index for fast duplicate checks on dealer level
CREATE INDEX IF NOT EXISTS idx_used_slips_dealer_trans ON public.used_slips(dealer_id, trans_ref);
CREATE INDEX IF NOT EXISTS idx_line_groups_dealer_mode ON public.line_groups(dealer_id, settlement_mode);
```

- [ ] **Step 2: Commit Migration**

```bash
git add supabase/migrations/256_add_dealer_slip_settings_and_group_settlement_mode.sql
git commit -m "feat(db): add dealer slip settings and line group settlement mode migration"
```

---

### Task 2: Pure Settlement Calculator & Slip Matching Helper (`slipSettlementHelper.ts`)

**Files:**
- Create: `supabase/functions/line-bot/slipSettlementHelper.ts`
- Test: `supabase/functions/line-bot/slipSettlementHelper.test.ts`

**Interfaces:**
- Produces:
  - `validateSlipTolerance(params: ToleranceParams): ToleranceResult`
  - `calculateImmediateDebt(submissions: any[], totalCommission: number, totalWinnings: number, pastPayments: any[]): number`
  - `formatSlipSettlementLineMessage(params: SlipResultMessageParams): string`
  - Types: `ToleranceParams`, `ToleranceResult`, `SlipResultMessageParams`

- [ ] **Step 1: Write Unit Tests in `slipSettlementHelper.test.ts`**

Create `supabase/functions/line-bot/slipSettlementHelper.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
    validateSlipTolerance,
    calculateImmediateDebt,
    formatSlipSettlementLineMessage
} from './slipSettlementHelper'

describe('slipSettlementHelper', () => {
    describe('validateSlipTolerance', () => {
        it('accepts exact amount match', () => {
            const res = validateSlipTolerance({
                slipAmount: 500,
                expectedAmount: 500,
                toleranceAmount: 5,
                toleranceMode: 'forgive_difference'
            })
            expect(res.isValid).toBe(true)
            expect(res.diff).toBe(0)
            expect(res.recordedAmount).toBe(500)
            expect(res.adjustmentNote).toBeNull()
        })

        it('accepts underpayment within tolerance with forgive_difference', () => {
            const res = validateSlipTolerance({
                slipAmount: 500,
                expectedAmount: 505,
                toleranceAmount: 5,
                toleranceMode: 'forgive_difference'
            })
            expect(res.isValid).toBe(true)
            expect(res.diff).toBe(-5)
            // Under forgive_difference, recorded as full expected to clear round
            expect(res.recordedAmount).toBe(505)
            expect(res.adjustmentNote).toContain('ปัดเศษส่วนต่าง ฿5.00')
        })

        it('accepts underpayment within tolerance with carry_remainder', () => {
            const res = validateSlipTolerance({
                slipAmount: 500,
                expectedAmount: 505,
                toleranceAmount: 5,
                toleranceMode: 'carry_remainder'
            })
            expect(res.isValid).toBe(true)
            expect(res.diff).toBe(-5)
            // Under carry_remainder, recorded as exact slip amount
            expect(res.recordedAmount).toBe(500)
            expect(res.adjustmentNote).toContain('ชำระตามสลิป ฿500.00 (คงเหลือค้าง ฿5.00)')
        })

        it('accepts overpayment within tolerance', () => {
            const res = validateSlipTolerance({
                slipAmount: 500,
                expectedAmount: 498,
                toleranceAmount: 5,
                toleranceMode: 'forgive_difference'
            })
            expect(res.isValid).toBe(true)
            expect(res.diff).toBe(2)
            expect(res.recordedAmount).toBe(500)
            expect(res.adjustmentNote).toContain('โอนเกิน ฿2.00')
        })

        it('rejects underpayment exceeding tolerance', () => {
            const res = validateSlipTolerance({
                slipAmount: 500,
                expectedAmount: 550,
                toleranceAmount: 5,
                toleranceMode: 'forgive_difference'
            })
            expect(res.isValid).toBe(false)
            expect(res.diff).toBe(-50)
        })
    })

    describe('calculateImmediateDebt', () => {
        it('calculates net debt correctly', () => {
            const debt = calculateImmediateDebt(1000, 100, 200, 300)
            // 1000 total - 100 comm - 200 prize - 300 paid = 400
            expect(debt).toBe(400)
        })

        it('returns 0 if already paid in full or prize exceeds bet', () => {
            const debt = calculateImmediateDebt(1000, 100, 1200, 0)
            expect(debt).toBe(0)
        })
    })

    describe('formatSlipSettlementLineMessage', () => {
        it('formats success message for immediate settlement', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'success',
                memberName: 'คุณสมชาย',
                memberCode: 'M-008',
                lotteryTypeName: 'หวยฮานอยพิเศษ',
                settlementMode: 'immediate',
                roundDateText: '11 ต.ค. 2569',
                expectedAmount: 500,
                slipAmount: 500,
                bankAccountText: 'กสิกรไทย (xxx-x-x1234-x)'
            })
            expect(msg).toContain('🧾 บันทึกการชำระเงินอัตโนมัติ')
            expect(msg).toContain('คุณสมชาย (M-008)')
            expect(msg).toContain('หวยฮานอยพิเศษ')
            expect(msg).toContain('฿500.00')
            expect(msg).toContain('✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว')
        })

        it('formats error message for amount mismatch', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'amount_mismatch',
                memberName: 'คุณสมชาย',
                memberCode: 'M-008',
                lotteryTypeName: 'หวยฮานอย',
                settlementMode: 'immediate',
                roundDateText: '11 ต.ค. 2569',
                expectedAmount: 550,
                slipAmount: 500,
                toleranceAmount: 5
            })
            expect(msg).toContain('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
            expect(msg).toContain('ยอดที่ต้องชำระ: ฿550.00')
            expect(msg).toContain('ยอดเงินในสลิป: ฿500.00')
            expect(msg).toContain('❌ ยังไม่ได้ตัดยอดในระบบ')
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --run supabase/functions/line-bot/slipSettlementHelper.test.ts`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Write Implementation in `slipSettlementHelper.ts`**

Create `supabase/functions/line-bot/slipSettlementHelper.ts`:
```typescript
export interface ToleranceParams {
    slipAmount: number
    expectedAmount: number
    toleranceAmount: number
    toleranceMode: 'forgive_difference' | 'carry_remainder'
}

export interface ToleranceResult {
    isValid: boolean
    diff: number
    recordedAmount: number
    adjustmentNote: string | null
}

export interface SlipResultMessageParams {
    status: 'success' | 'amount_mismatch' | 'duplicate_slip' | 'unlinked_member' | 'wrong_bank' | 'no_debt'
    memberName?: string
    memberCode?: string
    lotteryTypeName?: string
    settlementMode?: 'immediate' | 'cross_round'
    roundDateText?: string
    expectedAmount?: number
    slipAmount?: number
    toleranceAmount?: number
    bankAccountText?: string
    pastDebtTotal?: number
    currentRoundPrize?: number
    adjustmentNote?: string | null
    transRef?: string
    transferDateText?: string
}

/**
 * Validates slip amount against expected payment amount taking dealer tolerance into account.
 */
export function validateSlipTolerance({
    slipAmount,
    expectedAmount,
    toleranceAmount = 0,
    toleranceMode = 'forgive_difference'
}: ToleranceParams): ToleranceResult {
    const sAmt = Number(slipAmount) || 0
    const expAmt = Number(expectedAmount) || 0
    const tol = Math.max(0, Number(toleranceAmount) || 0)

    const diff = Math.round((sAmt - expAmt) * 100) / 100

    if (Math.abs(diff) <= tol) {
        if (diff === 0) {
            return {
                isValid: true,
                diff: 0,
                recordedAmount: sAmt,
                adjustmentNote: null
            }
        }

        if (diff < 0) {
            // Underpaid but within tolerance
            const underpaid = Math.abs(diff)
            if (toleranceMode === 'forgive_difference') {
                return {
                    isValid: true,
                    diff,
                    recordedAmount: expAmt,
                    adjustmentNote: `ปัดเศษส่วนต่าง ฿${underpaid.toFixed(2)} ให้สมาชิก (ยอดสลิปจริง ฿${sAmt.toFixed(2)})`
                }
            } else {
                return {
                    isValid: true,
                    diff,
                    recordedAmount: sAmt,
                    adjustmentNote: `ชำระตามสลิป ฿${sAmt.toFixed(2)} (คงเหลือค้าง ฿${underpaid.toFixed(2)})`
                }
            }
        } else {
            // Overpaid within tolerance
            return {
                isValid: true,
                diff,
                recordedAmount: sAmt,
                adjustmentNote: `โอนเกิน ฿${diff.toFixed(2)} (ยอดเรียกเก็บ ฿${expAmt.toFixed(2)})`
            }
        }
    }

    return {
        isValid: false,
        diff,
        recordedAmount: sAmt,
        adjustmentNote: null
    }
}

/**
 * Calculates net debt for immediate settlement round.
 */
export function calculateImmediateDebt(
    totalAmount: number,
    totalCommission: number,
    totalWinnings: number,
    alreadyPaid: number = 0
): number {
    const net = (Number(totalAmount) || 0) - (Number(totalCommission) || 0) - (Number(totalWinnings) || 0) - (Number(alreadyPaid) || 0)
    return Math.max(0, Math.round(net * 100) / 100)
}

/**
 * Formats user-friendly LINE reply message.
 */
export function formatSlipSettlementLineMessage(params: SlipResultMessageParams): string {
    const lines: string[] = []
    const memberLabel = params.memberName
        ? `${params.memberName}${params.memberCode ? ` (${params.memberCode})` : ''}`
        : 'สมาชิก'

    if (params.status === 'success') {
        lines.push('🧾 บันทึกการชำระเงินอัตโนมัติ')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        lines.push(`📌 รูปแบบ: ${params.settlementMode === 'cross_round' ? 'เคลียร์งวดชนงวด (หักล้างรางวัล)' : 'เคลียร์งวดต่องวด'}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'cross_round') {
            if (params.pastDebtTotal !== undefined) {
                lines.push(`- รวมหนี้งวดค้างเก่า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                lines.push(`- หักลบรางวัลงวดนี้: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
        }

        if (params.expectedAmount !== undefined) {
            lines.push(`- ยอดที่ต้องโอนสุทธิ: ฿${params.expectedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        }
        if (params.slipAmount !== undefined) {
            lines.push(`💰 ยอดเงินตามสลิป: ฿${params.slipAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        }
        if (params.adjustmentNote) {
            lines.push(`ℹ️ หมายเหตุ: ${params.adjustmentNote}`)
        }
        if (params.bankAccountText) {
            lines.push(`💳 โอนเข้าบัญชี: ${params.bankAccountText}`)
        }
        lines.push('----------------------------')
        lines.push('✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว')
    } else if (params.status === 'amount_mismatch') {
        lines.push('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        lines.push('----------------------------')
        lines.push(`- ยอดที่ต้องชำระ: ฿${(params.expectedAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        lines.push(`- ยอดเงินในสลิป: ฿${(params.slipAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        const diff = Math.abs((params.slipAmount || 0) - (params.expectedAmount || 0))
        lines.push(`- ส่วนต่าง: ฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (ยอมรับได้ไม่เกิน ฿${(params.toleranceAmount || 0).toFixed(2)})`)
        lines.push('----------------------------')
        lines.push('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
    } else if (params.status === 'duplicate_slip') {
        lines.push('⚠️ สลิปนี้เคยใช้งานในระบบแล้ว')
        if (params.transRef) lines.push(`- รหัสธุรกรรม: ${params.transRef}`)
        if (params.transferDateText) lines.push(`- วันที่โอน: ${params.transferDateText}`)
        lines.push('❌ ระบบปฏิเสธการทำรายการซ้ำ')
    } else if (params.status === 'wrong_bank') {
        lines.push('⚠️ บัญชีปลายทางไม่ตรงกับบัญชีของเจ้ามือ')
        lines.push('❌ กรุณาตรวจสอบสลิปการโอนเงินอีกครั้ง')
    } else if (params.status === 'unlinked_member') {
        lines.push('ℹ️ ตรวจพบสลิปโอนเงิน')
        if (params.slipAmount) lines.push(`💰 ยอดเงิน: ฿${params.slipAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        lines.push('⚠️ บัญชี LINE ของท่านยังไม่ได้ผูกกับรหัสสมาชิกในระบบ')
        lines.push('กรุณาติดต่อเจ้ามือเพื่อผูกรหัสสมาชิกก่อนทำรายการ')
    } else if (params.status === 'no_debt') {
        lines.push('ℹ️ ตรวจสอบสลิปเรียบร้อย')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        lines.push('⚪ ปัจจุบันไม่มียอดหนี้ค้างชำระในงวดนี้')
    }

    return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --run supabase/functions/line-bot/slipSettlementHelper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-bot/slipSettlementHelper.ts supabase/functions/line-bot/slipSettlementHelper.test.ts
git commit -m "feat(line-bot): add slipSettlementHelper with tolerance and message formatting"
```

---

### Task 3: SlipOK Client & Bank Account Validation Module

**Files:**
- Create: `supabase/functions/line-bot/slipOkClient.ts`
- Test: `supabase/functions/line-bot/slipOkClient.test.ts`

**Interfaces:**
- Produces:
  - `fetchLineMessageImage(channelAccessToken: string, messageId: string): Promise<Uint8Array | null>`
  - `verifySlipWithSlipOk(imageBytes: Uint8Array, apiKey: string, branchId?: string): Promise<SlipOkResponse>`
  - `isReceiverMatchingDealer(receiverData: any, dealerBankAccounts: any[]): boolean`

- [ ] **Step 1: Write Unit Tests in `slipOkClient.test.ts`**

Create `supabase/functions/line-bot/slipOkClient.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isReceiverMatchingDealer } from './slipOkClient'

describe('slipOkClient', () => {
    describe('isReceiverMatchingDealer', () => {
        const dealerAccounts = [
            {
                bank_name: 'ธนาคารกสิกรไทย',
                bank_account: '1234567890',
                account_name: 'นายเจ้ามือ รวยทรัพย์'
            },
            {
                bank_name: 'ธนาคารไทยพาณิชย์',
                bank_account: '9876543210',
                account_name: 'นายเจ้ามือ รวยทรัพย์'
            }
        ]

        it('matches receiver by partial account number (last 4 digits)', () => {
            const receiver = {
                displayName: 'นายเจ้ามือ รวยทรัพย์',
                name: 'MR. DEALER',
                account: {
                    bank: '004',
                    name: 'KBANK',
                    value: 'xxx-x-x7890-x'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(true)
        })

        it('matches receiver by exact account digits', () => {
            const receiver = {
                displayName: 'นายเจ้ามือ รวยทรัพย์',
                account: {
                    value: '1234567890'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(true)
        })

        it('rejects if account number does not match any dealer account', () => {
            const receiver = {
                displayName: 'นายอื่น',
                account: {
                    value: 'xxx-x-x1111-x'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(false)
        })

        it('returns true if dealer has no bank accounts registered (fallback permissive)', () => {
            expect(isReceiverMatchingDealer({ displayName: 'ใครก็ได้' }, [])).toBe(true)
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --run supabase/functions/line-bot/slipOkClient.test.ts`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Implement `slipOkClient.ts`**

Create `supabase/functions/line-bot/slipOkClient.ts`:
```typescript
export interface SlipOkResponse {
    success: boolean
    data?: {
        success: boolean
        transRef: string
        date: string
        amount: number
        sender?: {
            displayName?: string
            name?: string
            account?: { bank?: string; name?: string; value?: string }
        }
        receiver?: {
            displayName?: string
            name?: string
            account?: { bank?: string; name?: string; value?: string }
        }
    }
    message?: string
}

/**
 * Downloads image binary content from LINE Messaging API.
 */
export async function fetchLineMessageImage(
    channelAccessToken: string,
    messageId: string
): Promise<Uint8Array | null> {
    try {
        const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${channelAccessToken}`
            }
        })
        if (!response.ok) {
            console.error(`Failed to fetch image from LINE API: ${response.status} ${response.statusText}`)
            return null
        }
        const arrayBuffer = await response.arrayBuffer()
        return new Uint8Array(arrayBuffer)
    } catch (err) {
        console.error('Error fetching LINE message image:', err)
        return null
    }
}

/**
 * Forwards image binary to SlipOK API using dealer's specific API Key.
 */
export async function verifySlipWithSlipOk(
    imageBytes: Uint8Array,
    apiKey: string,
    branchId?: string
): Promise<SlipOkResponse> {
    try {
        const endpoint = branchId
            ? `https://api.slipok.com/api/line/apikey/${branchId}`
            : 'https://api.slipok.com/api/line/apikey/1'

        const blob = new Blob([imageBytes], { type: 'image/jpeg' })
        const formData = new FormData()
        formData.append('files', blob, 'slip.jpg')
        formData.append('log', 'true')

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'x-authorization': apiKey
            },
            body: formData
        })

        const data = await response.json()
        return data as SlipOkResponse
    } catch (err: any) {
        console.error('Error verifying slip with SlipOK:', err)
        return {
            success: false,
            message: err.message || 'Error connecting to SlipOK'
        }
    }
}

/**
 * Verifies whether the receiver in the slip matches one of the dealer's active bank accounts.
 */
export function isReceiverMatchingDealer(receiverData: any, dealerBankAccounts: any[]): boolean {
    if (!dealerBankAccounts || dealerBankAccounts.length === 0) {
        return true // Permissive fallback if dealer hasn't configured bank accounts
    }

    if (!receiverData || !receiverData.account || !receiverData.account.value) {
        return false
    }

    // Clean account strings to digits only
    const rawSlipVal = String(receiverData.account.value).trim()
    const slipDigitsOnly = rawSlipVal.replace(/\D/g, '')

    for (const dAcc of dealerBankAccounts) {
        const dealerDigits = String(dAcc.bank_account || '').replace(/\D/g, '')
        if (!dealerDigits) continue

        // 1. Exact digit match
        if (dealerDigits === slipDigitsOnly) return true

        // 2. Partial match (e.g. xxx-x-x7890-x -> check if last 4 digits match)
        if (slipDigitsOnly.length >= 4 && dealerDigits.endsWith(slipDigitsOnly.slice(-4))) {
            return true
        }

        // 3. Name fuzzy match if receiver displayName exists
        if (receiverData.displayName && dAcc.account_name) {
            const cleanAccName = dAcc.account_name.replace(/^(นาย|นาง|นางสาว|บจก\.|หจก\.)\s*/, '').trim()
            if (cleanAccName && receiverData.displayName.includes(cleanAccName)) {
                return true
            }
        }
    }

    return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --run supabase/functions/line-bot/slipOkClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-bot/slipOkClient.ts supabase/functions/line-bot/slipOkClient.test.ts
git commit -m "feat(line-bot): add slipOkClient module with bank account matching"
```

---

### Task 4: Dealer Web Settings UI in `DealerLineBotTab.jsx`

**Files:**
- Modify: `src/components/dealer/DealerLineBotTab.jsx`
- Modify: `src/components/dealer/DealerLineBotTab.css`

**Interfaces:**
- Consumes: `profiles.slipok_api_key`, `profiles.slip_tolerance_amount`, `profiles.slip_tolerance_mode`, `profiles.auto_slip_verification_enabled`, `line_groups.settlement_mode`
- Produces: Interactive settings card for SlipOK + settlement mode dropdown per LINE group

- [ ] **Step 1: Add Slip Verification Settings State & Handlers to `DealerLineBotTab.jsx`**

Add state in `DealerLineBotTab.jsx`:
```javascript
const [slipSettings, setSlipSettings] = useState({
    auto_slip_verification_enabled: false,
    slip_provider: 'slipok',
    slipok_api_key: '',
    slipok_branch_id: '',
    slip_tolerance_amount: 0,
    slip_tolerance_mode: 'forgive_difference'
})
const [savingSlipSettings, setSavingSlipSettings] = useState(false)
const [showApiKey, setShowApiKey] = useState(false)
```

Fetch dealer profile slip settings on load and add `handleSaveSlipSettings`:
```javascript
const handleSaveSlipSettings = async () => {
    setSavingSlipSettings(true)
    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                auto_slip_verification_enabled: slipSettings.auto_slip_verification_enabled,
                slip_provider: slipSettings.slip_provider,
                slipok_api_key: slipSettings.slipok_api_key.trim(),
                slipok_branch_id: slipSettings.slipok_branch_id.trim() || null,
                slip_tolerance_amount: Number(slipSettings.slip_tolerance_amount) || 0,
                slip_tolerance_mode: slipSettings.slip_tolerance_mode
            })
            .eq('id', user.id)

        if (error) throw error
        toast.success('บันทึกการตั้งค่าระบบตรวจสลิปเรียบร้อยแล้ว')
    } catch (err) {
        console.error('Error saving slip settings:', err)
        toast.error('ไม่สามารถบันทึกการตั้งค่าได้')
    } finally {
        setSavingSlipSettings(false)
    }
}
```

Add handler for changing group settlement mode:
```javascript
const handleUpdateGroupSettlementMode = async (groupId, newMode) => {
    try {
        const { error } = await supabase
            .from('line_groups')
            .update({ settlement_mode: newMode })
            .eq('id', groupId)

        if (error) throw error
        toast.success('อัปเดตรูปแบบการเคลียร์เงินของกลุ่มเรียบร้อย')
        setLineGroups(prev => prev.map(g => g.id === groupId ? { ...g, settlement_mode: newMode } : g))
    } catch (err) {
        console.error('Error updating group settlement mode:', err)
        toast.error('ไม่สามารถเปลี่ยนรูปแบบการเคลียร์เงินได้')
    }
}
```

- [ ] **Step 2: Add UI Markup in `DealerLineBotTab.jsx`**

Add the "ระบบตรวจสลิปอัตโนมัติ (SlipOK)" settings card with:
- Toggle switch for `auto_slip_verification_enabled`
- Password input for `slipok_api_key` with show/hide button
- Text input for `slipok_branch_id`
- Number input for `slip_tolerance_amount`
- Radio buttons for `slip_tolerance_mode`:
  - `🔘 ปัดเศษยกประโยชน์ให้สมาชิก (เคลียร์ยอดงวดนั้นให้ครบ)`
  - `🔘 ตัดตามยอดโอนจริง (ยอดที่เหลือค้างไว้เคลียร์ต่องวดถัดไป)`
- In the existing LINE Groups table, add a column for "รูปแบบเคลียร์เงิน":
  - `<select value={group.settlement_mode || 'immediate'} onChange={e => handleUpdateGroupSettlementMode(group.id, e.target.value)}>...`

- [ ] **Step 3: Add CSS Styling in `DealerLineBotTab.css`**

Add responsive styles for the slip verification card, inputs, and mode radio buttons.

- [ ] **Step 4: Verify syntax and run tests**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dealer/DealerLineBotTab.jsx src/components/dealer/DealerLineBotTab.css
git commit -m "feat(ui): add dealer slip verification settings and group settlement mode selector"
```

---

### Task 5: LINE Bot Image Webhook Handler & Settlement Automation

**Files:**
- Modify: `supabase/functions/line-bot/index.ts`

**Interfaces:**
- Consumes:
  - `fetchLineMessageImage`, `verifySlipWithSlipOk`, `isReceiverMatchingDealer` from `slipOkClient.ts`
  - `validateSlipTolerance`, `calculateImmediateDebt`, `formatSlipSettlementLineMessage` from `slipSettlementHelper.ts`
  - `allocateCrossRoundOffsetPayments`, `getRoundCloseDate` from `crossRoundOffsetCalculator.js`
- Produces:
  - Automated slip processing pipeline when `event.type === 'message' && event.message?.type === 'image'`

- [ ] **Step 1: Implement Image Message Handler in `line-bot/index.ts`**

In `supabase/functions/line-bot/index.ts`:
1. Check event type:
```typescript
if (event.type === 'message' && event.message?.type === 'image') {
    const groupId = event.source.groupId || event.source.roomId
    const lineUserId = event.source.userId
    const messageId = event.message.id
    const replyToken = event.replyToken

    // Process slip asynchronously or within event loop
    await handleLineSlipMessage({
        supabase,
        groupId,
        lineUserId,
        messageId,
        replyToken,
        channelAccessToken
    })
}
```

2. Implement `handleLineSlipMessage`:
- Find bound `line_groups` by `groupId`. If group not active or not bound, ignore.
- Fetch dealer `profiles` row (`auto_slip_verification_enabled`, `slipok_api_key`, `slipok_branch_id`, `slip_tolerance_amount`, `slip_tolerance_mode`).
- If `!dealer.auto_slip_verification_enabled || !dealer.slipok_api_key`: exit early (do not intercept regular images).
- Find member profile by `line_user_id`:
  - If member not found: reply with `unlinked_member` message.
- Fetch image binary via `fetchLineMessageImage(channelAccessToken, messageId)`.
- Call `verifySlipWithSlipOk(imageBytes, dealer.slipok_api_key, dealer.slipok_branch_id)`:
  - If not valid slip / QR unreadable: exit silently (avoid spamming general group photos).
- Check `used_slips` table for duplicate `transRef`:
  - If found: reply with `duplicate_slip` message and exit.
- Check dealer's active bank accounts in `bank_accounts` (or `dealer_bank_assignments`):
  - If receiver mismatch: reply with `wrong_bank` message and exit.
- Determine settlement mode from `group.settlement_mode` (`immediate` vs `cross_round`):
  - **If `immediate`:**
    - Query latest closed round for `group.lottery_type`
    - Calculate net debt for this member in this round
    - Validate with `validateSlipTolerance`
    - If valid:
      - Insert `member_round_payments`
      - Insert `used_slips`
      - Reply success message
    - If invalid:
      - Reply `amount_mismatch` message
  - **If `cross_round`:**
    - Query member's past unpaid rounds (FIFO) + current round prize
    - Calculate expected amount (`pastDebtTotal - currentPrize`)
    - Validate with `validateSlipTolerance`
    - If valid:
      - Call `allocateCrossRoundOffsetPayments` to generate records
      - Insert all generated payment records into `member_round_payments`
      - Insert `used_slips`
      - Reply success message
    - If invalid:
      - Reply `amount_mismatch` message

- [ ] **Step 2: Test edge function locally or run Vitest suite**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/line-bot/index.ts
git commit -m "feat(line-bot): integrate image slip verification and automated settlement pipeline"
```

---

### Task 6: Visual Indicator in History Tab (`MemberSettlementInline.jsx`)

**Files:**
- Modify: `src/components/dealer/MemberSettlementInline.jsx`

**Interfaces:**
- Consumes: `member_round_payments.notes`
- Produces: Slip badge and clear indication in the payment records list

- [ ] **Step 1: Add Visual Badge for Auto-Slip Payments in `MemberSettlementInline.jsx`**

In `MemberSettlementInline.jsx`, when rendering the list of payment records:
Check if `payment.notes` contains "สลิป" or "SlipOK":
Render a neat badge:
```jsx
{payment.notes && payment.notes.includes('สลิป') && (
    <span className="badge-slip-auto" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        marginLeft: '6px'
    }}>
        📱 สลิปอัตโนมัติ
    </span>
)}
```

- [ ] **Step 2: Run test suite to verify no regressions**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/dealer/MemberSettlementInline.jsx
git commit -m "feat(history): add auto-slip payment indicator badge in MemberSettlementInline"
```

---

### Task 7: Full System Verification & Edge Case Walkthrough

**Files:**
- Test: All tests across the project

- [ ] **Step 1: Run complete test suite**

Run: `npm.cmd test`
Expected: ALL PASS

- [ ] **Step 2: Verify git status and clean working tree**

Run: `git status`
Expected: Working tree clean

---
