import { describe, it, expect } from 'vitest'
import {
    validateSlipTolerance,
    calculateImmediateDebt,
    formatSlipSettlementLineMessage,
    getRoundCloseDate,
    allocateCrossRoundOffset,
    extractSlipTransferDetails,
    getSenderBankShortName,
    getSlipTransferDate,
    getSlipTransferTime,
    getSlipDestinationAccountNote,
    calculateMemberPastDebts,
    calculateImmediateModeDebt,
    allocateImmediateSettlement,
    calculateCrossRoundModeDebt
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

        it('formats error message for unlinked member with line user id', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'unlinked_member',
                slipAmount: 520,
                senderLineUserId: 'U2349165a78cb409e8c06de4aa664cc01'
            })
            expect(msg).toContain('ℹ️ ตรวจพบสลิปโอนเงิน')
            expect(msg).toContain('ยอดเงิน: ฿520.00')
            expect(msg).toContain('⚠️ บัญชี LINE ของท่านยังไม่ได้ผูกกับรหัสสมาชิกในระบบ')
            expect(msg).toContain('(LINE UID: U2349165a78cb409e8c06de4aa664cc01)')
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

        it('uses extractSlipTransferDetails when slipData is provided', () => {
            const pastDebts = [
                { roundId: 'round-1', roundDate: '2026-10-08', debt: 80 }
            ]
            const slipData = {
                transRef: '016287203327BOR03490',
                transDate: '20261014',
                transTime: '20:33:27',
                sendingBank: '004',
                receiver: {
                    account: { value: 'xxx-x-x2578-xxx', name: 'นาย ธีระเดช บรรจงแก้ว' },
                    displayName: 'นาย ธีระเดช บ'
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: true }
            ]

            const result = allocateCrossRoundOffset({
                pastDebts,
                currentRoundPrize: 0,
                slipAmount: 80,
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                currentRound: { id: 'round-current', round_date: '2026-10-14', lottery_type: 'lao' },
                paidAt: '2026-10-14',
                transRef: '016287203327BOR03490',
                slipData,
                dealerAccounts
            })

            expect(result.payments).toHaveLength(1)
            const p = result.payments[0]
            expect(p.paid_at).toBe('2026-10-14')
            expect(p.notes).toBe('ชำระหนี้งวดนี้ (กสิกรไทย โอนไป ออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว) เวลา 20:33 #016287203327BOR03490)')
        })

        it('allocates to current round debt when member has no past debts (Case: พี่น้ำ)', () => {
            const slipData = {
                transRef: 'Ab6b8ffb82f894deb',
                transDate: '20261015',
                transTime: '19:13:00',
                sendingBank: '006',
                receiver: {
                    account: { value: 'xxx-x-xxxx8-092', name: 'นาย ธีระเดช บรรจงแก้ว' },
                    displayName: 'นาย ธีระเดช บรรจงแก้ว'
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: true }
            ]

            const result = allocateCrossRoundOffset({
                pastDebts: [],
                currentRoundPrize: 0,
                slipAmount: 2599,
                currentRoundDebt: 2599,
                dealerId: 'dealer-1',
                memberUserId: 'member-10039',
                currentRound: { id: 'round-lao-oct-14', round_date: '2026-10-14', lottery_type: 'lao' },
                paidAt: '2026-10-15',
                transRef: 'Ab6b8ffb82f894deb',
                slipData,
                dealerAccounts
            })

            expect(result.payments).toHaveLength(1)
            const p = result.payments[0]
            expect(p.round_id).toBe('round-lao-oct-14')
            expect(p.payment_type).toBe('net_settlement')
            expect(p.direction).toBe('member_to_dealer')
            expect(p.amount).toBe(2599)
            expect(result.remainingFunds).toBe(0)
        })

        it('allocates to past debts first, then remaining funds to current round debt (combine_all)', () => {
            const pastDebts = [
                { roundId: 'round-lao-oct-12', roundDate: '2026-10-12', debt: 1000 }
            ]
            const result = allocateCrossRoundOffset({
                pastDebts,
                currentRoundPrize: 0,
                slipAmount: 3599,
                currentRoundDebt: 2599,
                dealerId: 'dealer-1',
                memberUserId: 'member-10039',
                currentRound: { id: 'round-lao-oct-14', round_date: '2026-10-14', lottery_type: 'lao' },
                paidAt: '2026-10-15',
                transRef: 'Ref-Combined'
            })

            expect(result.payments).toHaveLength(2)
            expect(result.payments[0].round_id).toBe('round-lao-oct-12')
            expect(result.payments[0].amount).toBe(1000)
            expect(result.payments[1].round_id).toBe('round-lao-oct-14')
            expect(result.payments[1].amount).toBe(2599)
            expect(result.remainingFunds).toBe(0)
        })
    })

    describe('extractSlipTransferDetails', () => {
        it('extracts date, time, sender bank, destination bank, and ref cleanly', () => {
            const slipData = {
                transRef: '016287203327BOR03490',
                transDate: '20261014',
                transTime: '20:33:27',
                sendingBank: '004',
                receiver: {
                    account: { value: 'xxx-x-x2578-xxx' },
                    displayName: 'นาย ธีระเดช บ'
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: true }
            ]

            const details = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: dealerAccounts
            })

            expect(details.paidAt).toBe('2026-10-14')
            expect(details.paidTime).toBe('20:33')
            expect(details.senderBank).toBe('กสิกรไทย')
            expect(details.destinationNote).toBe('โอนไป ออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)')
            expect(details.referenceDoc).toBe('016287203327BOR03490')
            expect(details.fullNotes).toBe('ชำระหนี้งวดนี้ (กสิกรไทย โอนไป ออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว) เวลา 20:33 #016287203327BOR03490)')
        })

        it('handles ISO transTimestamp when transDate and transTime are absent', () => {
            const slipData = {
                transRef: 'REF_ISO_123',
                transTimestamp: '2026-10-14T13:33:27.000Z',
                sendingBank: '014',
                receiver: {
                    account: { value: '1234567890' },
                    bank: { name: 'ธนาคารกรุงเทพ' }
                }
            }

            const details = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: []
            })

            expect(details.paidAt).toBe('2026-10-14')
            expect(details.paidTime).toBe('20:33')
            expect(details.senderBank).toBe('ไทยพาณิชย์')
            expect(details.destinationNote).toBe('โอนไป กรุงเทพ 1234567890')
            expect(details.referenceDoc).toBe('REF_ISO_123')
            expect(details.fullNotes).toBe('ชำระหนี้งวดนี้ (ไทยพาณิชย์ โอนไป กรุงเทพ 1234567890 เวลา 20:33 #REF_ISO_123)')
        })
    })

    describe('calculateMemberPastDebts', () => {
        it('isolates Lao lotto debts and eliminates Thai debts, uncalculated commissions, and satang fractions (User Case: 8,421.90 -> 284)', () => {
            const userId = 'user-ice-10048'
            const currentRoundId = 'round-current-lao-14'
            const currentRoundDate = '2026-10-14'

            const userHistories = [
                // 1. Thai lotto round (2026-10-01) - Initial 3,127.25 + 3,900 prize payout = 7,027.25
                {
                    round_id: 'round-thai-01',
                    user_id: userId,
                    lottery_type: 'thai',
                    round_date: '2026-10-01',
                    total_amount: 9680,
                    total_commission: 2652.75,
                    total_winnings: 3900
                },
                // 2. Ancient Lao round (2026-01-26) - total_commission was 0 in DB, member paid 2272 in full (80%)
                {
                    round_id: 'round-lao-jan-26',
                    user_id: userId,
                    lottery_type: 'lao',
                    round_date: '2026-01-26',
                    total_amount: 2840,
                    total_commission: 0,
                    total_winnings: 0
                },
                // 3. Ancient Lao round (2026-01-23) - total_commission was 0 in DB, member paid 2160 in full (80%)
                {
                    round_id: 'round-lao-jan-23',
                    user_id: userId,
                    lottery_type: 'lao',
                    round_date: '2026-01-23',
                    total_amount: 2700,
                    total_commission: 0,
                    total_winnings: 0
                },
                // 4. Lao round with tiny satang noise (0.40 satang leftover)
                {
                    round_id: 'round-lao-noise',
                    user_id: userId,
                    lottery_type: 'lao',
                    round_date: '2026-06-01',
                    total_amount: 1000.40,
                    total_commission: 200,
                    total_winnings: 0
                },
                // 5. The REAL active unpaid Lao round (2026-10-13) - debt 284
                {
                    round_id: 'round-lao-oct-13',
                    user_id: userId,
                    lottery_type: 'lao',
                    round_date: '2026-10-13',
                    total_amount: 355,
                    total_commission: 71,
                    total_winnings: 0
                }
            ]

            const payments = [
                // Payment for Thai round (prize payout)
                {
                    round_id: 'round-thai-01',
                    direction: 'dealer_to_member',
                    amount: 3900
                },
                // Payment in full for Lao round Jan 26 (2840 - 20% = 2272)
                {
                    round_id: 'round-lao-jan-26',
                    direction: 'member_to_dealer',
                    amount: 2272
                },
                // Payment in full for Lao round Jan 23 (2700 - 20% = 2160)
                {
                    round_id: 'round-lao-jan-23',
                    direction: 'member_to_dealer',
                    amount: 2160
                },
                // Payment of 800 for noise round leaving 0.40
                {
                    round_id: 'round-lao-noise',
                    direction: 'member_to_dealer',
                    amount: 800
                }
            ]

            const pastDebts = calculateMemberPastDebts({
                userId,
                currentRoundId,
                currentRoundDate,
                targetLotteryType: 'lao',
                userHistories,
                payments
            })

            // ONLY the 2026-10-13 Lao round should remain, with EXACT debt ฿284!
            expect(pastDebts).toHaveLength(1)
            expect(pastDebts[0].roundId).toBe('round-lao-oct-13')
            expect(pastDebts[0].roundDate).toBe('2026-10-13')
            expect(pastDebts[0].lotteryType).toBe('lao')
            expect(pastDebts[0].debt).toBe(284)
        })

        it('strictly excludes future rounds beyond currentRoundDate', () => {
            const userHistories = [
                {
                    round_id: 'round-future',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-15',
                    total_amount: 500,
                    total_commission: 100,
                    total_winnings: 0
                }
            ]
            const debts = calculateMemberPastDebts({
                userId: 'u1',
                currentRoundId: 'round-current',
                currentRoundDate: '2026-10-14',
                targetLotteryType: 'lao',
                userHistories,
                payments: []
            })
            expect(debts).toHaveLength(0)
        })
    })

    describe('calculateImmediateModeDebt (Mode 1: งวดต่องวด)', () => {
        const latestRound = {
            id: 'round-latest',
            round_date: '2026-10-15',
            close_time: '2026-10-15 20:30:00+07',
            lottery_type: 'lao'
        }

        it('Rule 1.1: When no past debts exist, member pays net = (amount - comm) - winnings', () => {
            const userHistories = [
                {
                    round_id: 'round-latest',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-15',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 300
                }
            ]
            const res = calculateImmediateModeDebt({
                userId: 'u1',
                latestRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })
            // (1000 - 200) - 300 = 500
            expect(res.currentRoundDebt).toBe(500)
            expect(res.pastDebtsTotal).toBe(0)
            expect(res.pastCreditsTotal).toBe(0)
            expect(res.totalExpectedAmount).toBe(500)
            expect(res.debtsToPay).toHaveLength(1)
            expect(res.debtsToPay[0].roundId).toBe('round-latest')
        })

        it('Rule 1.2: Combines past unpaid debts from previous rounds in the same lottery type', () => {
            const userHistories = [
                // Past round 1: debt 284
                {
                    round_id: 'round-past-1',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-13',
                    total_amount: 355,
                    total_commission: 71,
                    total_winnings: 0
                },
                // Latest round: net bet 500
                {
                    round_id: 'round-latest',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-15',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 300
                }
            ]
            const res = calculateImmediateModeDebt({
                userId: 'u1',
                latestRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })
            // Latest: 500, Past: 284 => Total: 784
            expect(res.currentRoundDebt).toBe(500)
            expect(res.pastDebtsTotal).toBe(284)
            expect(res.totalExpectedAmount).toBe(784)
            expect(res.debtsToPay).toHaveLength(2)
            expect(res.debtsToPay[0].roundId).toBe('round-past-1')
            expect(res.debtsToPay[1].roundId).toBe('round-latest')
        })

        it('Rule 1.3: Deducts past unclaimed prizes (credits) where dealer owed member', () => {
            const userHistories = [
                // Past round 1: member won 500 prize with bet 100 => credit 420
                {
                    round_id: 'round-past-credit',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-13',
                    total_amount: 100,
                    total_commission: 20,
                    total_winnings: 500
                },
                // Latest round: net bet 800
                {
                    round_id: 'round-latest',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-15',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 0
                }
            ]
            const res = calculateImmediateModeDebt({
                userId: 'u1',
                latestRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })
            // Latest: 800, Past credit: 420 => Net total: 800 - 420 = 380
            expect(res.currentRoundDebt).toBe(800)
            expect(res.pastDebtsTotal).toBe(0)
            expect(res.pastCreditsTotal).toBe(420)
            expect(res.totalExpectedAmount).toBe(380)
            expect(res.pastCredits).toHaveLength(1)
        })

        it('Rule 1.4: Strictly excludes past debts from other lottery types (e.g. thai in lao group)', () => {
            const userHistories = [
                // Thai round debt: 5000
                {
                    round_id: 'round-thai',
                    user_id: 'u1',
                    lottery_type: 'thai',
                    round_date: '2026-10-01',
                    total_amount: 5000,
                    total_commission: 0,
                    total_winnings: 0
                },
                // Lao latest round: 400
                {
                    round_id: 'round-latest',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-15',
                    total_amount: 500,
                    total_commission: 100,
                    total_winnings: 0
                }
            ]
            const res = calculateImmediateModeDebt({
                userId: 'u1',
                latestRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })
            // Should strictly ignore Thai debt 5000 and only expect 400
            expect(res.pastDebtsTotal).toBe(0)
            expect(res.totalExpectedAmount).toBe(400)
        })

        it('Rule 1.5: Rounds fractional decimal debt (e.g. 1566.5) to integer (1567) to match History tab and clears debt with forgive_difference tolerance', () => {
            // Member Fame: 2060 total, 493.5 commission, 0 winnings => net 1566.5 => rounded integer 1567
            const userHistories = [
                {
                    round_id: 'round-thai-latest',
                    user_id: '10058',
                    lottery_type: 'thai',
                    round_date: '2026-10-01',
                    total_amount: 2060,
                    total_commission: 493.5,
                    total_winnings: 0
                }
            ]
            const debtRes = calculateImmediateModeDebt({
                userId: '10058',
                latestRound: {
                    id: 'round-thai-latest',
                    round_date: '2026-10-01',
                    close_time: '2026-10-01 15:30:00+07',
                    lottery_type: 'thai'
                },
                userHistories,
                payments: [],
                targetLotteryType: 'thai'
            })

            // Expected amount must be integer 1567 (not 1566.50)
            expect(debtRes.currentRoundDebt).toBe(1567)
            expect(debtRes.totalExpectedAmount).toBe(1567)

            // Slip is 1566, tolerance is 9 with forgive_difference
            const tolRes = validateSlipTolerance({
                slipAmount: 1566,
                expectedAmount: debtRes.totalExpectedAmount,
                toleranceAmount: 9,
                toleranceMode: 'forgive_difference'
            })
            expect(tolRes.isValid).toBe(true)
            expect(tolRes.diff).toBe(-1)
            expect(tolRes.recordedAmount).toBe(1567)
            expect(tolRes.adjustmentNote).toContain('ปัดเศษส่วนต่าง ฿1.00')

            // Allocate payment
            const alloc = allocateImmediateSettlement({
                debtsToPay: debtRes.debtsToPay,
                pastCredits: debtRes.pastCredits,
                slipAmount: tolRes.recordedAmount,
                dealerId: 'dealer-1',
                memberUserId: '10058',
                latestRound: { id: 'round-thai-latest', round_date: '2026-10-01', lottery_type: 'thai' },
                paidAt: '2026-10-15',
                adjustmentNote: tolRes.adjustmentNote
            })
            expect(alloc.payments).toHaveLength(1)
            expect(alloc.payments[0].amount).toBe(1567)
        })
    })

    describe('allocateImmediateSettlement', () => {
        it('allocates prize payout for past credits and pays oldest debts first then latest round', () => {
            const latestRound = { id: 'round-latest', round_date: '2026-10-15', lottery_type: 'lao' }
            const debtsToPay = [
                { roundId: 'round-past-1', roundDate: '2026-10-13', lotteryType: 'lao', debt: 300 },
                { roundId: 'round-latest', roundDate: '2026-10-15', lotteryType: 'lao', debt: 500 }
            ]
            const pastCredits = [
                { roundId: 'round-past-credit', roundDate: '2026-10-12', lotteryType: 'lao', debt: -100 }
            ]

            // Member transfers 700 (300 past debt + 500 latest debt - 100 credit = 700)
            const alloc = allocateImmediateSettlement({
                debtsToPay,
                pastCredits,
                slipAmount: 700,
                dealerId: 'dealer-1',
                memberUserId: 'u1',
                latestRound,
                paidAt: '2026-10-15'
            })

            // 1 credit payment (dealer_to_member) + 2 debt payments (member_to_dealer) = 3 payments
            expect(alloc.payments).toHaveLength(3)

            // Credit offset payment
            expect(alloc.payments[0].direction).toBe('dealer_to_member')
            expect(alloc.payments[0].payment_type).toBe('prize_payout')
            expect(alloc.payments[0].amount).toBe(100)
            expect(alloc.payments[0].round_id).toBe('round-past-credit')

            // Past debt paid in full: 300
            expect(alloc.payments[1].direction).toBe('member_to_dealer')
            expect(alloc.payments[1].payment_type).toBe('net_settlement')
            expect(alloc.payments[1].amount).toBe(300)
            expect(alloc.payments[1].round_id).toBe('round-past-1')

            // Latest round debt paid in full: 500
            expect(alloc.payments[2].direction).toBe('member_to_dealer')
            expect(alloc.payments[2].payment_type).toBe('net_settlement')
            expect(alloc.payments[2].amount).toBe(500)
            expect(alloc.payments[2].round_id).toBe('round-latest')

            expect(alloc.remainingFunds).toBe(0)
        })
    })

    describe('calculateCrossRoundModeDebt (Mode 2: งวดชนงวด)', () => {
        const latestAnnouncedRound = {
            id: 'round-lao-oct-14',
            round_date: '2026-10-14',
            close_time: '2026-10-14 20:30:00+07',
            lottery_type: 'lao',
            status: 'announced'
        }

        it('Rule 2.1: If member did NOT win in latest announced round, member pays ONLY debts from rounds before it', () => {
            const userHistories = [
                // Past round (Oct 12): debt 284
                {
                    round_id: 'round-lao-oct-12',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-12',
                    total_amount: 355,
                    total_commission: 71,
                    total_winnings: 0
                },
                // Latest announced round (Oct 14): net bet (1000 - 200 = 800), NO winning!
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 0
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            // Expected amount must ONLY be past debts (284). Oct 14 net bet (800) is EXCLUDED!
            expect(res.latestRoundPrize).toBe(0)
            expect(res.pastDebtsTotal).toBe(284)
            expect(res.expectedAmount).toBe(284)
            expect(res.pastDebts).toHaveLength(1)
            expect(res.pastDebts[0].roundId).toBe('round-lao-oct-12')
        })

        it('Rule 2.2: If member WON in latest announced round, prize offsets past debts; net bet of latest round is NOT paid', () => {
            const userHistories = [
                // Past round (Oct 12): debt 1000
                {
                    round_id: 'round-lao-oct-12',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-12',
                    total_amount: 1250,
                    total_commission: 250,
                    total_winnings: 0
                },
                // Latest announced round (Oct 14): net bet 800, WON prize 600!
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 600
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            // Past debt = 1000, latest prize = 600 => member transfers 1000 - 600 = 400.
            // Oct 14 net bet (800) is NOT paid now!
            expect(res.latestRoundPrize).toBe(600)
            expect(res.pastDebtsTotal).toBe(1000)
            expect(res.expectedAmount).toBe(400)
        })

        it('Rule 2.3: If latest prize covers all past debts, expected amount is 0', () => {
            const userHistories = [
                // Past round debt: 284
                {
                    round_id: 'round-lao-oct-12',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-12',
                    total_amount: 355,
                    total_commission: 71,
                    total_winnings: 0
                },
                // Latest announced round: prize 500 (greater than past debt 284)
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 100,
                    total_commission: 20,
                    total_winnings: 500
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            expect(res.expectedAmount).toBe(0)
        })

        it('Rule 2.4: If member had NO past debts before latest announced round, but owes debt in latest round, expected amount is the latest round debt (Case: พี่น้ำ)', () => {
            const userHistories = [
                // Latest announced round only: bet 3251, comm 652, win 0 => net 2599
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 3251,
                    total_commission: 652,
                    total_winnings: 0
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            expect(res.pastDebtsTotal).toBe(0)
            expect(res.currentRoundDebt).toBe(2599)
            expect(res.expectedAmount).toBe(2599)
            expect(res.totalDebtWithCurrent).toBe(2599)
        })

        it('Rule 2.5: If member has past debt AND latest round debt, returns both primary past debt and combined debt', () => {
            const userHistories = [
                // Past round (Oct 12): debt 1000
                {
                    round_id: 'round-lao-oct-12',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-12',
                    total_amount: 1250,
                    total_commission: 250,
                    total_winnings: 0
                },
                // Latest announced round: net 2599
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 3251,
                    total_commission: 652,
                    total_winnings: 0
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            expect(res.pastDebtsTotal).toBe(1000)
            expect(res.currentRoundDebt).toBe(2599)
            expect(res.expectedAmount).toBe(1000) // primary past debt
            expect(res.totalDebtWithCurrent).toBe(3599) // combined
        })

        it('Rule 2.6: If member has NO past debts and NO current debt, expected amount is 0', () => {
            const userHistories = [
                // Latest announced round only: bet 1000, comm 200, win 800 => 0 debt
                {
                    round_id: 'round-lao-oct-14',
                    user_id: 'u1',
                    lottery_type: 'lao',
                    round_date: '2026-10-14',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 800
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u1',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            expect(res.pastDebtsTotal).toBe(0)
            expect(res.currentRoundDebt).toBe(0)
            expect(res.expectedAmount).toBe(0)
            expect(res.totalDebtWithCurrent).toBe(0)
        })
    })
})


