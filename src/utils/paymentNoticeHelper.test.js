import { describe, it, expect } from 'vitest'
import {
    calculatePaymentNoticeSummary,
    formatPaymentNoticeMessage,
    buildSettlementDefaultNote,
    resolvePaymentNoticeBankAccount
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

        it('calculates mode "offset_prize_past_debt" when net difference is zero', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'offset_prize_past_debt',
                currentBalance: 0,
                currentWinnings: 3000,
                selectedPastRounds: [{ roundId: 'r1', debt: 3000 }]
            })

            expect(summary.netAmount).toBe(0)
            expect(summary.direction).toBe('even')
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
                    modeLabel: 'หักลบรางวัลกับหนี้เก่า',
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
            expect(msg).toContain('สมชาย ใจดี')
            expect(msg).toContain('สมาชิกโอนชำระให้เจ้ามือ')
        })

        it('formats LINE text message for dealer owing member', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่ชัช',
                roundDate: '2026-09-01',
                lotteryTypeName: 'หวยไทย',
                mode: 'current_debt',
                summary: {
                    modeLabel: 'หนี้งวดนี้',
                    netAmount: 3000,
                    direction: 'dealer_to_member',
                    currentRoundDebt: 0,
                    currentRoundPrize: 3000,
                    selectedPastDebt: 0
                },
                bankAccount: {
                    bank_name: 'กสิกรไทย',
                    bank_account: '1234567890',
                    account_name: 'พี่ชัช'
                }
            })

            expect(msg).toContain('ยอดที่เจ้ามือต้องโอน: ฿3,000')
            expect(msg).toContain('เจ้ามือโอนคืนให้สมาชิก')
            expect(msg).toContain('กสิกรไทย 1234567890 (พี่ชัช)')
        })

        it('formats payment notice matching user example template for combine_all mode', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่แตง',
                roundDate: '8 ก.ย. 2569',
                lotteryTypeName: 'หวยลาว',
                mode: 'combine_all',
                summary: {
                    modeLabel: 'หักลบทั้งหมด',
                    netAmount: 869,
                    direction: 'member_to_dealer',
                    currentRoundDebt: 214,
                    currentRoundPrize: 0,
                    selectedPastDebt: 655
                },
                bankAccount: {
                    bank_name: 'ธนาคารออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)',
                    bank_account: '',
                    account_name: ''
                }
            })

            const expected = [
                '📋 ใบแจ้งชำระเงิน',
                '👤 สมาชิก: พี่แตง',
                '🎲 งวดวันที่: 8 ก.ย. 2569 (หวยลาว)',
                '📌 รูปแบบ: หักลบทั้งหมด',
                '----------------------------',
                '- ยอดค้างงวด 8 ก.ย. 2569: ฿214',
                '- รวมหนี้งวดค้างเก่า: ฿655',
                '----------------------------',
                '💰 รวมยอดที่ต้องโอน/ชำระ: ฿869',
                '🟢 สมาชิกโอนชำระให้เจ้ามือ',
                '',
                '💳 บัญชีโอนเงิน:',
                'ธนาคารออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)'
            ].join('\n')

            expect(msg).toBe(expected)
        })

        it('formats single round debt with round date when provided', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่แตง',
                roundDate: '8 ก.ย. 2569',
                lotteryTypeName: 'หวยลาว',
                mode: 'current_debt',
                summary: {
                    modeLabel: 'หนี้งวดนี้',
                    netAmount: 214,
                    direction: 'member_to_dealer',
                    currentRoundDebt: 214,
                    currentRoundPrize: 0,
                    selectedPastDebt: 0
                }
            })

            expect(msg).toContain('- ยอดค้างงวด 8 ก.ย. 2569: ฿214')
            expect(msg).toContain('💰 ยอดที่ต้องโอน/ชำระ: ฿214')
            expect(msg).toContain('🟢 สมาชิกโอนชำระให้เจ้ามือ')
        })
    })

    describe('buildSettlementDefaultNote', () => {
        it('returns empty string when bank is null or empty', () => {
            expect(buildSettlementDefaultNote(null)).toBe('')
            expect(buildSettlementDefaultNote({})).toBe('')
        })

        it('formats note with stripped bank name (without "ธนาคาร"), account number, and account name', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารไทยพาณิชย์',
                bank_account: '9972081291',
                account_name: 'ยุทธศักดิ์ ทองมั่นคง'
            })
            expect(note).toBe('ไทยพาณิชย์ 9972081291 (ยุทธศักดิ์ ทองมั่นคง)')
        })

        it('formats note without account name if account_name is missing', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารกสิกรไทย',
                bank_account: '123-4-56789-0'
            })
            expect(note).toBe('กสิกรไทย 123-4-56789-0')
        })
    })

    describe('resolvePaymentNoticeBankAccount', () => {
        it('returns null if direction is "even" or supabase is not provided', async () => {
            const res = await resolvePaymentNoticeBankAccount({ direction: 'even', supabase: {} })
            expect(res).toBeNull()

            const resNoSupa = await resolvePaymentNoticeBankAccount({ direction: 'member_to_dealer', supabase: null })
            expect(resNoSupa).toBeNull()
        })

        it('resolves member-assigned bank account when dealer pays member', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'user_dealer_memberships') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        maybeSingle: async () => ({
                                            data: { member_bank_account_id: 'm-bank-123' }
                                        })
                                    })
                                })
                            })
                        }
                    }
                    if (table === 'user_bank_accounts') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            bank_name: 'ธนาคารไทยพาณิชย์',
                                            bank_account: '9972081291',
                                            account_name: 'ยุทธศักดิ์'
                                        }
                                    })
                                })
                            })
                        }
                    }
                    return {}
                }
            }

            const bank = await resolvePaymentNoticeBankAccount({
                direction: 'dealer_to_member',
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('ธนาคารไทยพาณิชย์')
            expect(bank.bank_account).toBe('9972081291')
            expect(bank.account_name).toBe('ยุทธศักดิ์')
            expect(bank.source).toBe('member_assigned')
        })

        it('falls back to default user_bank_accounts when no specific bank assigned', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'user_dealer_memberships') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        maybeSingle: async () => ({
                                            data: { member_bank_account_id: null }
                                        })
                                    })
                                })
                            })
                        }
                    }
                    if (table === 'user_bank_accounts') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    order: () => ({
                                        order: async () => ({
                                            data: [
                                                {
                                                    bank_name: 'ธนาคารกรุงเทพ',
                                                    bank_account: '456789',
                                                    account_name: 'สมชาย',
                                                    is_default: true
                                                }
                                            ]
                                        })
                                    })
                                })
                            })
                        }
                    }
                    return {}
                }
            }

            const bank = await resolvePaymentNoticeBankAccount({
                direction: 'dealer_to_member',
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('ธนาคารกรุงเทพ')
            expect(bank.bank_account).toBe('456789')
            expect(bank.source).toBe('member_bank_accounts')
        })

        it('resolves dealer assigned bank account when member pays dealer', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'user_dealer_memberships') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        maybeSingle: async () => ({
                                            data: { assigned_bank_account_id: 'd-bank-789' }
                                        })
                                    })
                                })
                            })
                        }
                    }
                    if (table === 'dealer_bank_accounts') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            bank_name: 'ธนาคารกสิกรไทย',
                                            bank_account: '789123456',
                                            account_name: 'เฮียเบิ้ม'
                                        }
                                    })
                                })
                            })
                        }
                    }
                    return {}
                }
            }

            const bank = await resolvePaymentNoticeBankAccount({
                direction: 'member_to_dealer',
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('ธนาคารกสิกรไทย')
            expect(bank.bank_account).toBe('789123456')
            expect(bank.account_name).toBe('เฮียเบิ้ม')
            expect(bank.source).toBe('dealer_assigned')
        })
    })
})
