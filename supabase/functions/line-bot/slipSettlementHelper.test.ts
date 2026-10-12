import { describe, it, expect } from 'vitest'
import {
    validateSlipTolerance,
    calculateImmediateDebt,
    formatSlipSettlementLineMessage,
    getRoundCloseDate,
    allocateCrossRoundOffset
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

        it('formats error message for duplicate slip', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'duplicate_slip',
                transRef: 'REF123456',
                transferDateText: '11 ต.ค. 2569'
            })
            expect(msg).toContain('⚠️ สลิปนี้เคยใช้งานในระบบแล้ว')
            expect(msg).toContain('REF123456')
            expect(msg).toContain('❌ ระบบปฏิเสธการทำรายการซ้ำ')
        })

        it('formats error message for invalid slip', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'invalid_slip',
                adjustmentNote: 'ไม่พบข้อมูลสลิปในระบบธนาคาร'
            })
            expect(msg).toContain('⚠️ ไม่พบข้อมูลสลิปการโอนเงิน')
            expect(msg).toContain('ไม่พบข้อมูลสลิปในระบบธนาคาร')
            expect(msg).toContain('❌ กรุณาตรวจสอบ QR Code หรือความชัดเจนของรูปภาพอีกครั้งค่ะ')
        })
    })

    describe('getRoundCloseDate', () => {
        it('prefers close_time or close_date over round_date or open_date', () => {
            const r = {
                open_date: '2026-10-10',
                close_time: '2026-10-11T13:30:00Z',
                round_date: '2026-10-10'
            }
            expect(getRoundCloseDate(r)).toBe('2026-10-11')
        })

        it('handles plain string YYYY-MM-DD', () => {
            expect(getRoundCloseDate('2026-10-11')).toBe('2026-10-11')
        })
    })

    describe('allocateCrossRoundOffset', () => {
        it('allocates slip and current prize to past debts in FIFO order', () => {
            const pastDebts = [
                { roundId: 'round-1', roundDate: '2026-10-08', debt: 300 },
                { roundId: 'round-2', roundDate: '2026-10-09', debt: 200 }
            ]
            const result = allocateCrossRoundOffset({
                pastDebts,
                currentRoundPrize: 100,
                slipAmount: 400,
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                currentRound: { id: 'round-current', round_date: '2026-10-11', lottery_type: 'lao' },
                paidAt: '2026-10-11',
                transRef: 'REF123456'
            })

            // Should have 1 prize payout on round-current + 2 net settlements on past rounds
            expect(result.payments).toHaveLength(3)

            // Current round prize payout:
            const prizePayment = result.payments.find(p => p.round_id === 'round-current')
            expect(prizePayment).toBeDefined()
            expect(prizePayment?.payment_type).toBe('prize_payout')
            expect(prizePayment?.direction).toBe('dealer_to_member')
            expect(prizePayment?.amount).toBe(100)

            // Past round 1:
            const past1 = result.payments.find(p => p.round_id === 'round-1')
            expect(past1?.payment_type).toBe('net_settlement')
            expect(past1?.direction).toBe('member_to_dealer')
            expect(past1?.amount).toBe(300)

            // Past round 2:
            const past2 = result.payments.find(p => p.round_id === 'round-2')
            expect(past2?.payment_type).toBe('net_settlement')
            expect(past2?.direction).toBe('member_to_dealer')
            expect(past2?.amount).toBe(200)
        })

        it('handles when current prize is 0 and slip clears past debts', () => {
            const pastDebts = [
                { roundId: 'round-1', roundDate: '2026-10-08', debt: 150 }
            ]
            const result = allocateCrossRoundOffset({
                pastDebts,
                currentRoundPrize: 0,
                slipAmount: 150,
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                currentRound: { id: 'round-current', round_date: '2026-10-11', lottery_type: 'lao' },
                paidAt: '2026-10-11',
                transRef: 'REF999'
            })

            expect(result.payments).toHaveLength(1)
            expect(result.payments[0].round_id).toBe('round-1')
            expect(result.payments[0].amount).toBe(150)
            expect(result.payments[0].payment_type).toBe('net_settlement')
        })
    })
})
