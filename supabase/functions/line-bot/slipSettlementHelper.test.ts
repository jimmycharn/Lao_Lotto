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
