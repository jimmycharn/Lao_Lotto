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
    calculateCrossRoundModeDebt,
    evaluateAutoSettlementCandidate
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
            expect(msg).toContain('✅ บันทึกตัดชำระเรียบร้อยแล้ว✅')
            expect(msg).toContain('🙏 ขอบคุณมากค่ะ 🙏')
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

        it('formats friendly message for delay slip (e.g. Bangkok Bank)', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'invalid_slip',
                adjustmentNote: 'เนื่องจากเป็นสลิปจากธนาคารกรุงเทพ กรุณารอการตรวจสอบสลิปหลังการโอนประมาณ 7 นาที'
            })
            expect(msg).toContain('❌ ไม่สามารถบันทึกการชำระเงินได้ ❌')
            expect(msg).toContain('- สาเหตุ: เนื่องจากเป็นสลิปจากธนาคารกรุงเทพ การประมวลผลต้องใช้เวลาประมาณ 7-10 นาที กรุณาโยนสลิปลงในกลุ่มอีกครั้งหลังโอน 7-10 นาที')
            expect(msg).toContain('และกรุณาตรวจสอบ QR Code หรือความชัดเจนของสลิปด้วยค่ะ')
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

        it('includes sender bank and PromptPay details in prize payout note when offsetting debt (Case: พี่เป๊ก)', () => {
            const pastDebts = [
                { roundId: 'past-round-1', roundDate: '2026-10-15', lotteryType: 'lao', debt: 30374 }
            ]
            const slipData = {
                transRef: '2026101720290723000077408',
                transDate: '20261017',
                transTime: '20:29:07',
                sendingBank: '002', // Bangkok Bank
                receiver: {
                    proxy: { type: 'MSISDN', value: '099-xxx-9307' },
                    account: { name: 'นาย ธีระเดช บรรจงแก้ว' },
                    displayName: 'นาย ธีระเดช บ'
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีระเดช บรรจงแก้ว', is_default: true }
            ]

            const result = allocateCrossRoundOffset({
                pastDebts,
                currentRoundPrize: 11850,
                slipAmount: 18524,
                dealerId: 'dealer-1',
                memberUserId: 'member-peck',
                currentRound: { id: 'current-round-thai', round_date: '2026-10-16', lottery_type: 'thai' },
                paidAt: '2026-10-17',
                transRef: '2026101720290723000077408',
                slipData,
                dealerAccounts
            })

            // 1 prize payout for 11850 + 1 past debt settlement for 30374
            expect(result.payments).toHaveLength(2)

            const prizePayout = result.payments.find(p => p.payment_type === 'prize_payout')
            expect(prizePayout).toBeDefined()
            expect(prizePayout?.amount).toBe(11850)
            expect(prizePayout?.direction).toBe('dealer_to_member')
            expect(prizePayout?.round_id).toBe('current-round-thai')
            expect(prizePayout?.notes).toBe(
                'หักล้างหนี้งวดเก่า [สลิปอัตโนมัติ] (กรุงเทพ โอนไป พร้อมเพย์ 099-xxx-9307 (นาย ธีระเดช บรรจงแก้ว) เวลา 20:29 #2026101720290723000077408)'
            )

            const debtSettlement = result.payments.find(p => p.payment_type === 'net_settlement')
            expect(debtSettlement).toBeDefined()
            expect(debtSettlement?.amount).toBe(30374)
            expect(debtSettlement?.direction).toBe('member_to_dealer')
            expect(debtSettlement?.round_id).toBe('past-round-1')
            expect(debtSettlement?.notes).toBe(
                'ชำระหนี้งวดนี้ (กรุงเทพ โอนไป พร้อมเพย์ 099-xxx-9307 (นาย ธีระเดช บรรจงแก้ว) เวลา 20:29 #2026101720290723000077408)'
            )
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

        it('allocates ONLY single net_settlement payment and NO prize_payout when member has no past debts (Case: คุณมุก id 10071)', () => {
            const slipData = {
                transRef: 'A9424b131614a475e',
                transDate: '20261020',
                transTime: '08:49:00',
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
                currentRoundPrize: 1000,
                slipAmount: 1758,
                currentRoundDebt: 1758,
                dealerId: 'dealer-1',
                memberUserId: 'member-10071',
                currentRound: { id: 'round-lao-oct-19', round_date: '2026-10-19', lottery_type: 'lao' },
                paidAt: '2026-10-20',
                transRef: 'A9424b131614a475e',
                slipData,
                dealerAccounts
            })

            // MUST have only 1 payment: net_settlement 1758 member_to_dealer
            // MUST NOT create any prize_payout record!
            expect(result.payments).toHaveLength(1)
            const p = result.payments[0]
            expect(p.round_id).toBe('round-lao-oct-19')
            expect(p.payment_type).toBe('net_settlement')
            expect(p.direction).toBe('member_to_dealer')
            expect(p.amount).toBe(1758)
            expect(result.remainingFunds).toBe(0)

            const prizePayout = result.payments.find(pay => pay.payment_type === 'prize_payout')
            expect(prizePayout).toBeUndefined()
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

        it('correctly identifies PromptPay when receiver transferred via PromptPay mobile number even if dealer only has GSB bank account', () => {
            const slipData = {
                transRef: '686062',
                transDate: '20261017',
                transTime: '20:29:00',
                sendingBank: '002', // Bangkok Bank
                receivingBank: '030', // SlipOK interbank resolved to GSB (030)
                receiver: {
                    displayName: 'นาย ธีระเดช บรรจงแก้ว',
                    proxy: {
                        type: 'MSISDN',
                        value: '099-xxx-9307'
                    },
                    account: {
                        value: null
                    }
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: true }
            ]

            const note = getSlipDestinationAccountNote(slipData.receiver, dealerAccounts)
            expect(note).toBe('โอนไป พร้อมเพย์ 099-xxx-9307 (นาย ธีระเดช บรรจงแก้ว)')
            expect(note).not.toContain('ออมสิน')
            expect(note).not.toContain('020432578092')

            const details = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: dealerAccounts
            })
            expect(details.destinationNote).toBe('โอนไป พร้อมเพย์ 099-xxx-9307 (นาย ธีระเดช บรรจงแก้ว)')
            expect(details.fullNotes).toBe('ชำระหนี้งวดนี้ (กรุงเทพ โอนไป พร้อมเพย์ 099-xxx-9307 (นาย ธีระเดช บรรจงแก้ว) เวลา 20:29 #686062)')
        })

        it('matches PromptPay when dealer registered PromptPay in dealerBankAccounts', () => {
            const slipData = {
                transRef: '686062',
                transDate: '20261017',
                transTime: '20:29:00',
                sendingBank: '002',
                receiver: {
                    displayName: 'นาย ธีระเดช บรรจงแก้ว',
                    proxy: {
                        type: 'MSISDN',
                        value: '099-xxx-9307'
                    }
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: false },
                { bank_name: 'พร้อมเพย์', bank_account: '0990009307', account_name: 'นายธีระเดช บรรจงแก้ว', is_default: true }
            ]

            const note = getSlipDestinationAccountNote(slipData.receiver, dealerAccounts)
            expect(note).toBe('โอนไป พร้อมเพย์ 0990009307 (นายธีระเดช บรรจงแก้ว)')
        })

        it('does not overwrite slip bank with dealer bank if banks do not match and digits do not match', () => {
            const slipData = {
                transRef: 'REF_SCB_1',
                transDate: '20261017',
                transTime: '10:00:00',
                sendingBank: '004',
                receivingBank: '014',
                receiver: {
                    displayName: 'นาย สมชาย',
                    account: { value: '987-6-54321-0' },
                    bank: { name: 'ธนาคารไทยพาณิชย์' }
                }
            }
            const dealerAccounts = [
                { bank_name: 'ธนาคารออมสิน', bank_account: '020432578092', account_name: 'นายธีรเดช บรรจงแก้ว', is_default: true }
            ]

            const note = getSlipDestinationAccountNote(slipData.receiver, dealerAccounts)
            expect(note).toBe('โอนไป ไทยพาณิชย์ 987-6-54321-0 (นาย สมชาย)')
            expect(note).not.toContain('ออมสิน')
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

        it('calculates cross round debt correctly for Phi Ning (net past debt 4596 = 6696 debt - 2100 prize)', () => {
            const latestRoundThai = {
                id: 'round-thai-oct-16',
                round_date: '2026-10-16',
                close_time: '2026-10-16T15:30:00+07:00',
                lottery_type: 'thai',
                status: 'announced'
            }
            const userHistories = [
                {
                    round_id: 'round-thai-oct-01',
                    user_id: 'u-ning',
                    lottery_type: 'thai',
                    round_date: '2026-10-01',
                    total_amount: 8370,
                    total_commission: 1674,
                    total_winnings: 0
                },
                {
                    round_id: 'round-thai-oct-16',
                    user_id: 'u-ning',
                    lottery_type: 'thai',
                    round_date: '2026-10-16',
                    total_amount: 5890,
                    total_commission: 1078,
                    total_winnings: 2100
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u-ning',
                latestAnnouncedRound: latestRoundThai,
                userHistories,
                payments: [],
                targetLotteryType: 'thai'
            })

            expect(res.latestRoundPrize).toBe(2100)
            expect(res.pastDebtsTotal).toBe(6696)
            expect(res.expectedAmount).toBe(4596)
            expect(res.currentRoundDebt).toBe(2712)
            expect(res.totalDebtWithCurrent).toBe(7308)

            const msg = formatSlipSettlementLineMessage({
                status: 'success',
                memberName: 'พี่หนิง',
                memberCode: '10043',
                lotteryTypeName: 'หวยไทย',
                settlementMode: 'cross_round',
                roundDateText: '2026-10-16',
                expectedAmount: res.expectedAmount,
                slipAmount: 4596,
                pastDebtTotal: res.pastDebtsTotal,
                currentRoundPrize: res.latestRoundPrize,
                currentRoundDebt: res.currentRoundDebt
            })

            expect(msg).toContain('พี่หนิง (10043)')
            expect(msg).toContain('รวมหนี้งวดก่อนหน้า: ฿6,696.00')
            expect(msg).toContain('หักลบรางวัลงวดล่าสุด: -฿2,100.00')
            expect(msg).not.toContain('ยอดสุทธิงวดนี้')
            expect(msg).toContain('ยอดที่ต้องโอนสุทธิ: ฿4,596.00')
            expect(msg).toContain('ยอดเงินตามสลิป: ฿4,596.00')
        })

        it('Rule 2.7: If dealer already transferred prize to member, availableWinnings becomes 0 and current round debt is the full net bet (Case: คุณน้ำ)', () => {
            const latestRoundLao = {
                id: 'round-lao-oct-19',
                round_date: '2026-10-19',
                close_time: '2026-10-19T20:30:00+07:00',
                lottery_type: 'lao',
                status: 'announced'
            }
            const userHistories = [
                {
                    round_id: 'round-lao-oct-19',
                    user_id: 'u-nam',
                    lottery_type: 'lao',
                    round_date: '2026-10-19',
                    total_amount: 3493,
                    total_commission: 705,
                    total_winnings: 1000
                }
            ]
            const payments = [
                {
                    round_id: 'round-lao-oct-19',
                    user_id: 'u-nam',
                    payment_type: 'prize_payout',
                    direction: 'dealer_to_member',
                    amount: 1000
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u-nam',
                latestAnnouncedRound: latestRoundLao,
                userHistories,
                payments,
                targetLotteryType: 'lao'
            })

            // Prize was already paid in cash, so available prize to offset is 0
            expect(res.latestRoundPrize).toBe(0)
            expect(res.pastDebtsTotal).toBe(0)
            // Net bet is 3493 - 705 = 2788. Since prize was already paid out, member owes 2788!
            expect(res.currentRoundDebt).toBe(2788)
            expect(res.expectedAmount).toBe(2788)
            expect(res.totalDebtWithCurrent).toBe(2788)

            // Auto candidate evaluation with slip of 2788
            const autoRes = evaluateAutoSettlementCandidate({
                slipAmount: 2788,
                toleranceAmount: 0,
                currentRoundDebt: res.currentRoundDebt,
                netPastDebt: res.expectedAmount,
                totalDebtWithCurrent: res.totalDebtWithCurrent,
                pastDebtsTotal: res.pastDebtsTotal
            })

            expect(autoRes.matched).toBe(true)
            expect(autoRes.expectedAmount).toBe(2788)
        })

        it('Rule 2.8: Member has past debt AND dealer already transferred current round prize', () => {
            const latestRoundLao = {
                id: 'round-lao-oct-19',
                round_date: '2026-10-19',
                close_time: '2026-10-19T20:30:00+07:00',
                lottery_type: 'lao',
                status: 'announced'
            }
            const userHistories = [
                {
                    round_id: 'round-lao-oct-12',
                    user_id: 'u-nam',
                    lottery_type: 'lao',
                    round_date: '2026-10-12',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 0
                },
                {
                    round_id: 'round-lao-oct-19',
                    user_id: 'u-nam',
                    lottery_type: 'lao',
                    round_date: '2026-10-19',
                    total_amount: 3493,
                    total_commission: 705,
                    total_winnings: 1000
                }
            ]
            const payments = [
                {
                    round_id: 'round-lao-oct-19',
                    user_id: 'u-nam',
                    payment_type: 'prize_payout',
                    direction: 'dealer_to_member',
                    amount: 1000
                }
            ]

            const res = calculateCrossRoundModeDebt({
                userId: 'u-nam',
                latestAnnouncedRound: latestRoundLao,
                userHistories,
                payments,
                targetLotteryType: 'lao'
            })

            expect(res.latestRoundPrize).toBe(0)
            expect(res.pastDebtsTotal).toBe(800)
            expect(res.expectedAmount).toBe(800)
            expect(res.currentRoundDebt).toBe(2788)
            expect(res.totalDebtWithCurrent).toBe(3588)
        })
    })

    describe('evaluateAutoSettlementCandidate', () => {
        it('matches Candidate 1 (immediate) when slip matches currentRoundDebt', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 2712,
                toleranceAmount: 5,
                currentRoundDebt: 2712,
                netPastDebt: 4596,
                totalDebtWithCurrent: 7308,
                pastDebtsTotal: 6696
            })
            expect(res.matched).toBe(true)
            expect(res.mode).toBe('immediate')
            expect(res.expectedAmount).toBe(2712)
            expect(res.label).toBe('เคลียร์งวดต่องวด')
        })

        it('matches Candidate 2 (cross_round) when slip matches netPastDebt', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 4596,
                toleranceAmount: 5,
                currentRoundDebt: 2712,
                netPastDebt: 4596,
                totalDebtWithCurrent: 7308,
                pastDebtsTotal: 6696
            })
            expect(res.matched).toBe(true)
            expect(res.mode).toBe('cross_round')
            expect(res.expectedAmount).toBe(4596)
            expect(res.label).toBe('เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)')
        })

        it('matches Candidate 3 (cross_round_all) when slip matches totalDebtWithCurrent', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 7308,
                toleranceAmount: 5,
                currentRoundDebt: 2712,
                netPastDebt: 4596,
                totalDebtWithCurrent: 7308,
                pastDebtsTotal: 6696
            })
            expect(res.matched).toBe(true)
            expect(res.mode).toBe('cross_round_all')
            expect(res.expectedAmount).toBe(7308)
            expect(res.label).toBe('เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)')
        })

        it('matches within tolerance amount', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 4598, // +2 diff
                toleranceAmount: 5,
                currentRoundDebt: 2712,
                netPastDebt: 4596,
                totalDebtWithCurrent: 7308,
                pastDebtsTotal: 6696
            })
            expect(res.matched).toBe(true)
            expect(res.mode).toBe('cross_round')
            expect(res.expectedAmount).toBe(4596)
        })

        it('returns matched: false with all candidates when no candidate matches', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 1000,
                toleranceAmount: 5,
                currentRoundDebt: 2712,
                netPastDebt: 4596,
                totalDebtWithCurrent: 7308,
                pastDebtsTotal: 6696
            })
            expect(res.matched).toBe(false)
            expect(res.candidateImmediate).toBe(2712)
            expect(res.candidateCrossRound).toBe(4596)
            expect(res.candidateCrossRoundAll).toBe(9408) // 2712 + 6696 (gross all)
        })

        it('handles member with no past debts correctly', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 500,
                toleranceAmount: 0,
                currentRoundDebt: 500,
                netPastDebt: 0,
                totalDebtWithCurrent: 500,
                pastDebtsTotal: 0
            })
            expect(res.matched).toBe(true)
            expect(res.mode).toBe('immediate') // member with no past debt is immediate settlement
            expect(res.label).toBe('เคลียร์งวดต่องวด')
            expect(res.expectedAmount).toBe(500)
        })

        it('evaluates Khun Phrae case (id 10047, slip 31,995 vs 31,130 / 29,889 / 93,969)', () => {
            const res = evaluateAutoSettlementCandidate({
                slipAmount: 31995,
                toleranceAmount: 9,
                currentRoundDebt: 31130,
                netPastDebt: 29889, // 62839 - 32950
                totalDebtWithCurrent: 61019, // 31130 + 29889
                pastDebtsTotal: 62839
            })
            expect(res.matched).toBe(false)
            expect(res.candidateImmediate).toBe(31130)
            expect(res.candidateCrossRound).toBe(29889)
            expect(res.candidateCrossRoundAll).toBe(93969) // 31130 + 62839
        })

        it('formats auto mode mismatch message with breakdown by round dates (Khun Phrae case)', () => {
            const msg = formatSlipSettlementLineMessage({
                status: 'amount_mismatch',
                memberName: 'พี่แพร',
                memberCode: '10047',
                lotteryTypeName: 'หวยไทย',
                roundDateText: '2026-10-16',
                currentRoundDateText: '2026-10-16',
                settlementMode: 'auto',
                currentRoundDebt: 31130,
                pastDebts: [
                    { roundDate: '2026-10-01', debt: 62839 }
                ],
                totalAllDebts: 93969,
                slipAmount: 31995,
                toleranceAmount: 9
            })

            expect(msg).toContain('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
            expect(msg).toContain('👤 สมาชิก: พี่แพร (10047)')
            expect(msg).toContain('🎯 ประเภทหวย: หวยไทย')
            expect(msg).toContain('📅 งวดวันที่: 16 ต.ค. 2569')
            expect(msg).toContain('📌 รูปแบบ: ตรวจสอบอัตโนมัติ')
            expect(msg).toContain('- ยอดที่ต้องชำระในระบบ:')
            expect(msg).toContain('  • ยอดงวดปัจจุบัน 16-10-2569: ฿31,130.00')
            expect(msg).toContain('  • ยอดค้างจ่ายงวด 01-10-2569: ฿62,839.00')
            expect(msg).toContain('  • รวมทุกงวด: ฿93,969.00')
            expect(msg).toContain('- ยอดเงินในสลิป: ฿31,995.00')
            expect(msg).toContain('- ยอดเงินในสลิป ไม่ตรงตามเงื่อนไขการชำระ')
            expect(msg).toContain('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
            expect(msg).not.toContain('ส่วนต่าง')
        })

        it('Rule 2.9: Pee Rung case - Round 22 announced (debt 254), Round 23 closed/unannounced, slip 254, no past debts', () => {
            // 1. Unannounced round (status: 'closed', is_result_announced: false) must NOT be selected as latestAnnouncedRound
            const recentRounds = [
                {
                    id: 'round-lao-23',
                    round_date: '2026-10-23',
                    close_time: '2026-10-23T18:20:00+07:00',
                    lottery_type: 'lao',
                    status: 'closed',
                    is_result_announced: false
                },
                {
                    id: 'round-lao-22',
                    round_date: '2026-10-22',
                    close_time: '2026-10-22T18:20:00+07:00',
                    lottery_type: 'lao',
                    status: 'announced',
                    is_result_announced: true
                }
            ]

            const latestAnnouncedRound = recentRounds.find(r => r.status === 'announced' || r.is_result_announced === true)
            expect(latestAnnouncedRound?.id).toBe('round-lao-22')

            // 2. Member data for Round 22: bet 3800, comm 546, won 3000 -> net debt 254
            const userHistories = [
                {
                    round_id: 'round-lao-22',
                    user_id: 'u-rung',
                    lottery_type: 'lao',
                    round_date: '2026-10-22',
                    total_amount: 3800,
                    total_commission: 546,
                    total_winnings: 3000
                }
            ]

            const crossDebtRes = calculateCrossRoundModeDebt({
                userId: 'u-rung',
                latestAnnouncedRound: latestAnnouncedRound!,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            // No past debts before Round 22
            expect(crossDebtRes.pastDebtsTotal).toBe(0)
            expect(crossDebtRes.pastDebts).toHaveLength(0)
            expect(crossDebtRes.currentRoundDebt).toBe(254)
            expect(crossDebtRes.expectedAmount).toBe(254)

            // 3. Auto evaluation must match strictly as 'immediate' (งวดต่องวด)
            const autoRes = evaluateAutoSettlementCandidate({
                slipAmount: 254,
                toleranceAmount: 0,
                currentRoundDebt: crossDebtRes.currentRoundDebt,
                netPastDebt: crossDebtRes.expectedAmount,
                totalDebtWithCurrent: crossDebtRes.totalDebtWithCurrent,
                pastDebtsTotal: crossDebtRes.pastDebtsTotal
            })

            expect(autoRes.matched).toBe(true)
            expect(autoRes.mode).toBe('immediate')
            expect(autoRes.label).toBe('เคลียร์งวดต่องวด')
            expect(autoRes.expectedAmount).toBe(254)

            // 4. Payment allocation in immediate mode: ONLY 1 payment of 254 (member_to_dealer), NO prize_payout!
            const immDebtRes = calculateImmediateModeDebt({
                userId: 'u-rung',
                latestRound: latestAnnouncedRound!,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })
            expect(immDebtRes.totalExpectedAmount).toBe(254)
            expect(immDebtRes.pastCredits).toHaveLength(0)

            const alloc = allocateImmediateSettlement({
                debtsToPay: immDebtRes.debtsToPay,
                pastCredits: immDebtRes.pastCredits,
                slipAmount: 254,
                dealerId: 'dealer-1',
                memberUserId: 'u-rung',
                latestRound: latestAnnouncedRound!,
                paidAt: '2026-10-23'
            })

            expect(alloc.payments).toHaveLength(1)
            expect(alloc.payments[0].direction).toBe('member_to_dealer')
            expect(alloc.payments[0].payment_type).toBe('net_settlement')
            expect(alloc.payments[0].amount).toBe(254)
            expect(alloc.payments[0].round_id).toBe('round-lao-22')

            // 5. Line message formatting for immediate mode:
            const successMsg = formatSlipSettlementLineMessage({
                status: 'success',
                memberName: 'พี่รุ้ง',
                memberCode: '10040',
                lotteryTypeName: 'หวยลาว',
                settlementMode: 'immediate',
                roundDateText: '2026-10-22',
                expectedAmount: 254,
                slipAmount: 254,
                toleranceAmount: 0
            })

            expect(successMsg).toContain('📌 รูปแบบ: เคลียร์งวดต่องวด')
            expect(successMsg).toContain('ยอดที่ต้องโอนสุทธิ: ฿254.00')
            expect(successMsg).toContain('ยอดเงินตามสลิป: ฿254.00')
            expect(successMsg).not.toContain('หักลบรางวัลงวดล่าสุด')
            expect(successMsg).not.toContain('3,000')

            // 6. allocateCrossRoundOffset (if ever called with 0 past debts) must NEVER generate prize_payout!
            const crossAlloc = allocateCrossRoundOffset({
                pastDebts: [],
                currentRoundPrize: 3000,
                slipAmount: 254,
                dealerId: 'dealer-1',
                memberUserId: 'u-rung',
                currentRound: latestAnnouncedRound!,
                paidAt: '2026-10-23',
                currentRoundDebt: 254
            })

            const prizePayouts = crossAlloc.payments.filter(p => p.payment_type === 'prize_payout')
            expect(prizePayouts).toHaveLength(0)
            expect(crossAlloc.payments).toHaveLength(1)
            expect(crossAlloc.payments[0].amount).toBe(254)
            expect(crossAlloc.payments[0].direction).toBe('member_to_dealer')
        })

        it('Rule 2.10: Nong Beer case (id 10057) - Round 23 announced debt 390, past debts 1310 (rounds 20 & 22), past credits 688 (round 21: -65 & prior: -623), slip 1,012', () => {
            const latestAnnouncedRound = {
                id: 'round-lao-23',
                round_date: '2026-10-23',
                close_time: '2026-10-23T20:30:00+07:00',
                lottery_type: 'lao',
                status: 'announced',
                is_result_announced: true
            }

            const userHistories = [
                // Prior round: prize credit 623
                {
                    round_id: 'round-lao-19',
                    user_id: 'u-beer-10057',
                    lottery_type: 'lao',
                    round_date: '2026-10-19',
                    close_time: '2026-10-19T20:30:00+07:00',
                    total_amount: 100,
                    total_commission: 20,
                    total_winnings: 703 // net: (100 - 20) - 703 = -623 (prize credit)
                },
                // Round 20: debt 758
                {
                    round_id: 'round-lao-20',
                    user_id: 'u-beer-10057',
                    lottery_type: 'lao',
                    round_date: '2026-10-20',
                    close_time: '2026-10-20T20:30:00+07:00',
                    total_amount: 948,
                    total_commission: 190,
                    total_winnings: 0 // net: 948 - 190 = 758
                },
                // Round 21: prize credit 65 (sales 4,260, comm 825, winnings 3,500 -> 3435 - 3500 = -65)
                {
                    round_id: 'round-lao-21',
                    user_id: 'u-beer-10057',
                    lottery_type: 'lao',
                    round_date: '2026-10-21',
                    close_time: '2026-10-21T20:30:00+07:00',
                    total_amount: 4260,
                    total_commission: 825,
                    total_winnings: 3500 // net: (4260 - 825) - 3500 = -65 (prize credit)
                },
                // Round 22: debt 552
                {
                    round_id: 'round-lao-22',
                    user_id: 'u-beer-10057',
                    lottery_type: 'lao',
                    round_date: '2026-10-22',
                    close_time: '2026-10-22T20:30:00+07:00',
                    total_amount: 690,
                    total_commission: 138,
                    total_winnings: 0 // net: 690 - 138 = 552
                },
                // Round 23: current announced round, debt 390
                {
                    round_id: 'round-lao-23',
                    user_id: 'u-beer-10057',
                    lottery_type: 'lao',
                    round_date: '2026-10-23',
                    close_time: '2026-10-23T20:30:00+07:00',
                    total_amount: 488,
                    total_commission: 98,
                    total_winnings: 0 // net: 488 - 98 = 390
                }
            ]

            // 1. calculateCrossRoundModeDebt calculation
            const crossRes = calculateCrossRoundModeDebt({
                userId: 'u-beer-10057',
                latestAnnouncedRound,
                userHistories,
                payments: [],
                targetLotteryType: 'lao'
            })

            // Past debts: 758 (round 20) + 552 (round 22) = 1,310
            expect(crossRes.pastDebtsTotal).toBe(1310)
            expect(crossRes.pastDebts).toHaveLength(2)

            // Past credits: 623 (round 19) + 65 (round 21) = 688
            expect(crossRes.pastCreditsTotal).toBe(688)
            expect(crossRes.pastCredits).toHaveLength(2)

            // Net past debt: 1,310 - 688 = 622
            expect(crossRes.expectedAmount).toBe(622)

            // Current round debt: 390
            expect(crossRes.currentRoundDebt).toBe(390)

            // Total debt with current: 622 + 390 = 1,012!
            expect(crossRes.totalDebtWithCurrent).toBe(1012)

            // 2. evaluateAutoSettlementCandidate with slip 1,012
            const autoRes = evaluateAutoSettlementCandidate({
                slipAmount: 1012,
                toleranceAmount: 0,
                currentRoundDebt: crossRes.currentRoundDebt,
                netPastDebt: crossRes.expectedAmount,
                totalDebtWithCurrent: crossRes.totalDebtWithCurrent,
                pastDebtsTotal: crossRes.pastDebtsTotal
            })

            expect(autoRes.matched).toBe(true)
            expect(autoRes.mode).toBe('cross_round_all')
            expect(autoRes.expectedAmount).toBe(1012)
            expect(autoRes.label).toBe('เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)')

            // 3. allocateCrossRoundOffset with 1,012 slip
            const alloc = allocateCrossRoundOffset({
                pastDebts: crossRes.pastDebts,
                pastCredits: crossRes.pastCredits || [],
                currentRoundPrize: crossRes.latestRoundPrize,
                slipAmount: 1012,
                dealerId: 'dealer-1',
                memberUserId: 'u-beer-10057',
                currentRound: latestAnnouncedRound,
                paidAt: '2026-10-26',
                transRef: '016299191017COR05184',
                currentRoundDebt: crossRes.currentRoundDebt
            })

            // Verify payments created:
            // 2 prize payouts for past credits: 623 and 65
            const prizePayoutsPast = alloc.payments.filter(p => p.payment_type === 'prize_payout' && p.direction === 'dealer_to_member')
            expect(prizePayoutsPast).toHaveLength(2)
            expect(prizePayoutsPast[0].amount).toBe(623)
            expect(prizePayoutsPast[0].round_id).toBe('round-lao-19')
            expect(prizePayoutsPast[1].amount).toBe(65)
            expect(prizePayoutsPast[1].round_id).toBe('round-lao-21')

            // 3 net settlement payments: round 20 (758), round 22 (552), round 23 (390)
            const debtPayments = alloc.payments.filter(p => p.payment_type === 'net_settlement' && p.direction === 'member_to_dealer')
            expect(debtPayments).toHaveLength(3)
            expect(debtPayments[0].amount).toBe(758)
            expect(debtPayments[0].round_id).toBe('round-lao-20')
            expect(debtPayments[1].amount).toBe(552)
            expect(debtPayments[1].round_id).toBe('round-lao-22')
            expect(debtPayments[2].amount).toBe(390)
            expect(debtPayments[2].round_id).toBe('round-lao-23')

            expect(alloc.remainingFunds).toBe(0)

            // 4. Test formatSlipSettlementLineMessage for success
            const successMsg = formatSlipSettlementLineMessage({
                status: 'success',
                memberName: 'น้องเบียร์ คลองโสด',
                memberCode: '10057',
                lotteryTypeName: 'หวยลาว',
                settlementMode: 'cross_round_all',
                roundDateText: '2026-10-23',
                expectedAmount: 1012,
                slipAmount: 1012,
                pastDebtTotal: 1310,
                pastCreditsTotal: 688,
                currentRoundDebt: 390
            })

            expect(successMsg).toContain('📌 รูปแบบ: เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)')
            expect(successMsg).toContain('รวมหนี้งวดก่อนหน้า: ฿1,310.00')
            expect(successMsg).toContain('หักลบรางวัลค้างงวดก่อนๆ: -฿688.00')
            expect(successMsg).toContain('ยอดที่ต้องโอนสุทธิ: ฿1,012.00')
            expect(successMsg).toContain('ยอดเงินตามสลิป: ฿1,012.00')

            // 5. Test formatSlipSettlementLineMessage for auto mismatch breakdown
            const mismatchMsg = formatSlipSettlementLineMessage({
                status: 'amount_mismatch',
                memberName: 'น้องเบียร์ คลองโสด',
                memberCode: '10057',
                lotteryTypeName: 'หวยลาว',
                settlementMode: 'auto',
                roundDateText: '2026-10-23',
                currentRoundDebt: 390,
                pastDebts: crossRes.pastDebts,
                pastCredits: crossRes.pastCredits,
                pastCreditsTotal: 688,
                totalAllDebts: 1012,
                expectedAmount: 1012,
                slipAmount: 900
            })

            expect(mismatchMsg).toContain('ยอดงวดปัจจุบัน 23-10-2569: ฿390.00')
            expect(mismatchMsg).toContain('ยอดค้างจ่ายงวด 20-10-2569: ฿758.00')
            expect(mismatchMsg).toContain('ยอดค้างจ่ายงวด 22-10-2569: ฿552.00')
            expect(mismatchMsg).toContain('หักลบรางวัลค้างงวด 21-10-2569: -฿65.00')
            expect(mismatchMsg).toContain('รวมทุกงวด: ฿1,012.00')
        })
    })
})



