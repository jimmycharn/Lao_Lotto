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

            expect(msg).toContain('👤 สมาชิก: พี่ชัช')
            expect(msg).toContain('9,157')
            expect(msg).toContain('ไทยพาณิชย์ 9972081291 (สมชาย ใจดี)')
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

        it('formats payment notice matching user example template for combine_all mode with all unpaid rounds listed', () => {
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
                selectedPastRounds: [
                    { roundId: 'r1', lotteryType: 'lao', roundDate: '2026-09-04', debt: 328 },
                    { roundId: 'r2', lotteryType: 'lao', roundDate: '2026-09-02', debt: 232 },
                    { roundId: 'r3', lotteryType: 'lao', roundDate: '2026-08-26', debt: 95 }
                ],
                bankAccount: {
                    bank_name: 'ธนาคารออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)',
                    bank_account: '',
                    account_name: ''
                }
            })

            const expected = [
                '👤 สมาชิก: พี่แตง',
                '📌 รูปแบบ: หักลบทั้งหมด',
                '----------------------------',
                '- ยอดค้างงวด(หวยลาว) 8 ก.ย. 2569: ฿214',
                '- ยอดค้างงวด(หวยลาว) 4 ก.ย. 2569: ฿328',
                '- ยอดค้างงวด(หวยลาว) 2 ก.ย. 2569: ฿232',
                '- ยอดค้างงวด(หวยลาว) 26 ส.ค. 2569: ฿95',
                '----------------------------',
                '💰 รวมยอดที่ต้องโอน/ชำระ: ฿869',
                '🟢 สมาชิกโอนชำระให้เจ้ามือ',
                '',
                '💳 บัญชีโอนเงิน:',
                'ธนาคารออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)'
            ].join('\n')

            expect(msg).toBe(expected)
        })

        it('formats combine_all correctly when dealer owes member in current round (matching user exact scenario)', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'combine_all',
                currentBalance: -4964,
                currentWinnings: 5500,
                selectedPastRounds: [
                    { roundId: 'r1', lotteryType: 'lao', roundDate: '24 ก.ย. 2569', debt: 798 },
                    { roundId: 'r2', lotteryType: 'lao', roundDate: '23 ก.ย. 2569', debt: 832 }
                ]
            })

            expect(summary.netAmount).toBe(3334)
            expect(summary.direction).toBe('dealer_to_member')
            expect(summary.currentRoundPrize).toBe(4964)
            expect(summary.currentRoundDebt).toBe(0)

            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่ไอซ์',
                roundDate: '25 ก.ย. 2569',
                lotteryTypeName: 'หวยลาว',
                mode: 'combine_all',
                summary,
                selectedPastRounds: [
                    { roundId: 'r1', lotteryType: 'lao', roundDate: '24 ก.ย. 2569', debt: 798 },
                    { roundId: 'r2', lotteryType: 'lao', roundDate: '23 ก.ย. 2569', debt: 832 }
                ]
            })

            const expected = [
                '👤 สมาชิก: พี่ไอซ์',
                '📌 รูปแบบ: หักลบทั้งหมด',
                '----------------------------',
                '- เจ้ามือจ่าย(หวยลาว) 25 ก.ย. 2569: ฿4,964',
                '- ยอดค้างงวด(หวยลาว) 24 ก.ย. 2569: ฿798',
                '- ยอดค้างงวด(หวยลาว) 23 ก.ย. 2569: ฿832',
                '----------------------------',
                '💰 รวมยอดที่เจ้ามือต้องโอน: -฿3,334',
                '🔴 เจ้ามือโอนคืนให้สมาชิก'
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

            expect(msg).toContain('- ยอดค้างงวด(หวยลาว) 8 ก.ย. 2569: ฿214')
            expect(msg).toContain('💰 ยอดที่ต้องโอน/ชำระ: ฿214')
            expect(msg).toContain('🟢 สมาชิกโอนชำระให้เจ้ามือ')
        })
    })

    describe('buildSettlementDefaultNote', () => {
        it('returns empty string when bank is null or empty', () => {
            expect(buildSettlementDefaultNote(null)).toBe('')
            expect(buildSettlementDefaultNote({})).toBe('')
        })

        it('formats note with stripped bank name (without "ธนาคาร"), account number, and account name prefixed with "โอนไป "', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารไทยพาณิชย์',
                bank_account: '9972081291',
                account_name: 'ยุทธศักดิ์ ทองมั่นคง'
            })
            expect(note).toBe('โอนไป ไทยพาณิชย์ 9972081291 (ยุทธศักดิ์ ทองมั่นคง)')
        })

        it('formats note without account name if account_name is missing prefixed with "โอนไป "', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารกสิกรไทย',
                bank_account: '123-4-56789-0'
            })
            expect(note).toBe('โอนไป กสิกรไทย 123-4-56789-0')
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

        it('resolves upstream dealer bank account when dealer pays upstream (external connection)', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'dealer_upstream_connections') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { id: 'conn-ext-1', is_linked: false }
                                    })
                                })
                            })
                        }
                    }
                    if (table === 'upstream_dealer_bank_accounts') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    order: () => ({
                                        order: async () => ({
                                            data: [
                                                {
                                                    bank_name: 'กสิกรไทย',
                                                    bank_account: '111-222-333',
                                                    account_name: 'พี่จึ๋ม อ้อมค่าย',
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
                direction: 'dealer_to_upstream',
                dealerId: 'my-dealer-id',
                connectionId: 'conn-ext-1',
                isUpstream: true,
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('กสิกรไทย')
            expect(bank.bank_account).toBe('111-222-333')
            expect(bank.account_name).toBe('พี่จึ๋ม อ้อมค่าย')
            expect(bank.source).toBe('upstream_dealer_bank_accounts')
        })

        it('resolves our bank account when upstream pays dealer using my_bank_account_id', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'dealer_upstream_connections') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { my_bank_account_id: 'my-bank-999' }
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
                                            id: 'my-bank-999',
                                            bank_name: 'ไทยพาณิชย์',
                                            bank_account: '999-888-777',
                                            account_name: 'บัญชีร้านเรา'
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
                direction: 'upstream_to_dealer',
                dealerId: 'my-dealer-id',
                connectionId: 'conn-1',
                isUpstream: true,
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('ไทยพาณิชย์')
            expect(bank.bank_account).toBe('999-888-777')
            expect(bank.account_name).toBe('บัญชีร้านเรา')
            expect(bank.source).toBe('dealer_my_bank_account')
        })

        it('resolves our default dealer bank account when upstream pays dealer without specific my_bank_account_id', async () => {
            const mockSupabase = {
                from: (table) => {
                    if (table === 'dealer_upstream_connections') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { my_bank_account_id: null }
                                    })
                                })
                            })
                        }
                    }
                    if (table === 'dealer_bank_accounts') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    order: async () => ({
                                        data: [
                                            {
                                                bank_name: 'กรุงเทพ',
                                                bank_account: '555-666-777',
                                                account_name: 'เจ้าของร้าน',
                                                is_default: true
                                            }
                                        ]
                                    })
                                })
                            })
                        }
                    }
                    return {}
                }
            }

            const bank = await resolvePaymentNoticeBankAccount({
                direction: 'upstream_to_dealer',
                dealerId: 'my-dealer-id',
                connectionId: 'conn-1',
                isUpstream: true,
                supabase: mockSupabase
            })

            expect(bank).not.toBeNull()
            expect(bank.bank_name).toBe('กรุงเทพ')
            expect(bank.bank_account).toBe('555-666-777')
            expect(bank.account_name).toBe('เจ้าของร้าน')
            expect(bank.source).toBe('dealer_default')
        })
    })

    describe('upstream payment notice', () => {
        it('calculates summary when dealer owes upstream (dealer_to_upstream)', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'current_debt',
                currentBalance: 6092,
                currentWinnings: 0,
                selectedPastRounds: [],
                isUpstream: true
            })

            expect(summary.netAmount).toBe(6092)
            expect(summary.direction).toBe('dealer_to_upstream')
            expect(summary.modeLabel).toBe('ยอดงวดนี้')
        })

        it('calculates summary when upstream owes dealer (upstream_to_dealer)', () => {
            const summary = calculatePaymentNoticeSummary({
                mode: 'current_debt',
                currentBalance: -4500,
                currentWinnings: 4500,
                selectedPastRounds: [],
                isUpstream: true
            })

            expect(summary.netAmount).toBe(4500)
            expect(summary.direction).toBe('upstream_to_dealer')
            expect(summary.modeLabel).toBe('ยอดงวดนี้')
        })

        it('calculates offset_prize_past_debt for upstream', () => {
            // past debts = 5605, prize = 6092 -> net = 5605 - 6092 = -487 (upstream owes dealer 487)
            const summary = calculatePaymentNoticeSummary({
                mode: 'offset_prize_past_debt',
                currentBalance: 0,
                currentWinnings: 6092,
                selectedPastRounds: [{ roundId: 'r1', debt: 5605 }],
                isUpstream: true
            })

            expect(summary.netAmount).toBe(487)
            expect(summary.direction).toBe('upstream_to_dealer')
            expect(summary.modeLabel).toBe('หักลบรางวัลกับยอดเก่า')
        })

        it('formats LINE message correctly when dealer owes upstream', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่จึ๋ม อ้อมค่าย',
                roundDate: '2026-09-17',
                lotteryTypeName: 'หวยไทย',
                mode: 'current_debt',
                summary: {
                    modeLabel: 'ยอดงวดนี้',
                    netAmount: 6092,
                    direction: 'dealer_to_upstream',
                    currentRoundDebt: 6092,
                    currentRoundPrize: 0,
                    selectedPastDebt: 0
                },
                bankAccount: {
                    bank_name: 'กสิกรไทย',
                    bank_account: '111-222-333',
                    account_name: 'พี่จึ๋ม อ้อมค่าย'
                },
                isUpstream: true
            })

            expect(msg).toContain('🏢 เจ้ามือรับตีออก: พี่จึ๋ม อ้อมค่าย')
            expect(msg).toContain('📌 รูปแบบ: ยอดงวดนี้')
            expect(msg).toContain('ประเภทหวย: หวยไทย')
            expect(msg).toContain('- ยอดตีออก งวด 17 ก.ย. 2569: ฿6,092')
            expect(msg).toContain('💰 รวมยอดที่ต้องโอน: ฿6,092')
            expect(msg).toContain('🔴 ต้องโอนชำระให้กับ:  พี่จึ๋ม อ้อมค่าย')
            expect(msg).toContain('💳 บัญชีโอนเงิน:')
            expect(msg).toContain('กสิกรไทย 111-222-333 (พี่จึ๋ม อ้อมค่าย)')
        })

        it('formats LINE message correctly when upstream owes dealer', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่จึ๋ม อ้อมค่าย',
                roundDate: '2026-09-17',
                lotteryTypeName: 'หวยไทย',
                mode: 'current_debt',
                summary: {
                    modeLabel: 'ยอดงวดนี้',
                    netAmount: 4500,
                    direction: 'upstream_to_dealer',
                    currentRoundDebt: 0,
                    currentRoundPrize: 4500,
                    selectedPastDebt: 0
                },
                bankAccount: {
                    bank_name: 'ไทยพาณิชย์',
                    bank_account: '999-888-777',
                    account_name: 'บัญชีร้านเรา'
                },
                isUpstream: true
            })

            expect(msg).toContain('🏢 เจ้ามือรับตีออก: พี่จึ๋ม อ้อมค่าย')
            expect(msg).toContain('📌 รูปแบบ: ยอดงวดนี้')
            expect(msg).toContain('ประเภทหวย: หวยไทย')
            expect(msg).toContain('- ยอดถูกรางวัล งวด 17 ก.ย. 2569: ฿4,500')
            expect(msg).toContain('💰 รวมยอดที่เจ้ามือต้องโอน: ฿4,500')
            expect(msg).toContain('🟢 เจ้ามือโอนชำระให้กับเรา')
            expect(msg).toContain('💳 บัญชีรับเงิน (บัญชีของเรา):')
            expect(msg).toContain('ไทยพาณิชย์ 999-888-777 (บัญชีร้านเรา)')
        })

        it('formats LINE message matching user exact upstream template with offset_prize_past_debt and bank account', () => {
            const msg = formatPaymentNoticeMessage({
                memberName: 'พี่จิ้ม อ้อมค่าย',
                roundDate: '2026-09-17',
                lotteryTypeName: 'thai',
                mode: 'offset_prize_past_debt',
                summary: {
                    modeLabel: 'หักลบรางวัลกับยอดเก่า',
                    netAmount: 5605,
                    direction: 'dealer_to_upstream',
                    currentRoundDebt: 0,
                    currentRoundPrize: 0,
                    selectedPastDebt: 5605
                },
                selectedPastRounds: [
                    { roundDate: '2026-09-01', debt: 5605, lottery_type: 'thai' }
                ],
                bankAccount: {
                    bank_name: 'ไทยพาณิชย์ 9972081291'
                },
                isUpstream: true
            })

            expect(msg).toContain('🏢 เจ้ามือรับตีออก: พี่จิ้ม อ้อมค่าย')
            expect(msg).toContain('📌 รูปแบบ: หักลบรางวัลกับยอดเก่า')
            expect(msg).toContain('🎯 ประเภทหวย: หวยไทย')
            expect(msg).toContain('----------------------------')
            expect(msg).toContain('- ยอดตีออก งวด 1 ก.ย. 2569: ฿5,605')
            expect(msg).toContain('----------------------------')
            expect(msg).toContain('💰 รวมยอดที่ต้องโอน: ฿5,605')
            expect(msg).toContain('🔴 ต้องโอนชำระให้กับ:  พี่จิ้ม อ้อมค่าย')
            expect(msg).toContain('💳 บัญชีโอนเงิน:')
            expect(msg).toContain('ไทยพาณิชย์ 9972081291')
        })
    })

    describe('buildSettlementDefaultNote with fallbackAccountName', () => {
        it('formats correctly with full bank details', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารกสิกรไทย',
                bank_account: '123-4-56789-0',
                account_name: 'พี่น้ำ'
            })
            expect(note).toBe('โอนไป กสิกรไทย 123-4-56789-0 (พี่น้ำ)')
        })

        it('formats correctly using fallbackAccountName when bank account_name is missing', () => {
            const note = buildSettlementDefaultNote({
                bank_name: 'ธนาคารไทยพาณิชย์',
                bank_account: '987-6-54321-0',
                account_name: ''
            }, 'พี่น้ำ')
            expect(note).toBe('โอนไป ไทยพาณิชย์ 987-6-54321-0 (พี่น้ำ)')
        })

        it('returns empty string when bank is null or empty', () => {
            expect(buildSettlementDefaultNote(null)).toBe('')
            expect(buildSettlementDefaultNote({})).toBe('')
        })
    })

    describe('resolvePaymentNoticeBankAccount dealer bank resolution', () => {
        it('resolves assigned dealer bank from cachedDealerBanks when member has assigned_bank_account_id', async () => {
            const mockSupabase = {
                auth: { getUser: async () => ({ data: { user: { id: 'dealer-1' } } }) }
            }
            const cachedBanks = [
                { id: 'bank-default', bank_name: 'กสิกรไทย', bank_account: '111-111', is_default: true },
                { id: 'bank-assigned', bank_name: 'กรุงไทย', bank_account: '222-222', is_default: false }
            ]

            const result = await resolvePaymentNoticeBankAccount({
                direction: 'member_to_dealer',
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                assignedBankAccountId: 'bank-assigned',
                cachedDealerBanks: cachedBanks,
                supabase: mockSupabase
            })

            expect(result.bank_name).toBe('กรุงไทย')
            expect(result.bank_account).toBe('222-222')
            expect(result.source).toBe('dealer_assigned')
        })

        it('falls back to default dealer bank when member has no assigned bank', async () => {
            const mockSupabase = {
                auth: {
                    getUser: async () => ({ data: { user: { id: 'dealer-1' } } })
                },
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: null })
                            })
                        })
                    })
                })
            }
            const cachedBanks = [
                { id: 'bank-default', bank_name: 'กสิกรไทย', bank_account: '111-111', is_default: true },
                { id: 'bank-other', bank_name: 'กรุงเทพ', bank_account: '333-333', is_default: false }
            ]

            const result = await resolvePaymentNoticeBankAccount({
                direction: 'member_to_dealer',
                dealerId: 'dealer-1',
                memberUserId: 'member-1',
                assignedBankAccountId: null,
                cachedDealerBanks: cachedBanks,
                supabase: mockSupabase
            })

            expect(result.bank_name).toBe('กสิกรไทย')
            expect(result.bank_account).toBe('111-111')
            expect(result.source).toBe('dealer_cached')
        })
    })
})

