import { describe, it, expect } from 'vitest'
import {
    calculateOffsetSummary,
    allocateCrossRoundOffsetPayments,
    findMemberPastUnpaidRounds,
    findUpstreamPastUnpaidRounds,
    getRoundCloseDate,
    calculateCrossRoundPaymentSummary,
    allocateSettlementPaymentsByMode,
    parsePaymentNotes,
    buildPaymentNotes
} from './crossRoundOffsetCalculator'

describe('crossRoundOffsetCalculator', () => {
    describe('getRoundCloseDate', () => {
        it('prioritizes close_time over round_date and open_time', () => {
            const round = {
                id: 'r-1',
                open_date: '2026-04-15',
                open_time: '2026-04-15T08:00:00+07:00',
                round_date: '2026-04-15', // incorrectly set to open_date
                close_time: '2026-04-16T15:30:00+07:00'
            }
            expect(getRoundCloseDate(round)).toBe('2026-04-16')
        })

        it('prioritizes close_date over round_date', () => {
            const round = {
                id: 'r-2',
                round_date: '2026-05-15',
                close_date: '2026-05-16'
            }
            expect(getRoundCloseDate(round)).toBe('2026-05-16')
        })

        it('extracts date in Asia/Bangkok timezone correctly', () => {
            // 2026-04-16 08:30:00 UTC is 2026-04-16 15:30:00 Bangkok
            expect(getRoundCloseDate('2026-04-16T08:30:00Z')).toBe('2026-04-16')
            // Exact YYYY-MM-DD string returns directly
            expect(getRoundCloseDate('2026-06-01')).toBe('2026-06-01')
        })

        it('falls back to round_date if no close_time or close_date', () => {
            expect(getRoundCloseDate({ round_date: '2026-07-01' })).toBe('2026-07-01')
        })

        it('returns empty string for empty or invalid input', () => {
            expect(getRoundCloseDate(null)).toBe('')
            expect(getRoundCloseDate(undefined)).toBe('')
            expect(getRoundCloseDate('')).toBe('')
        })
    })
    describe('calculateOffsetSummary', () => {
        it('calculates debt > prize correctly (member pays dealer difference)', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 4000,
                prizeAmount: 3000,
                slipAmount: 1000
            })
            expect(result.netDifference).toBe(1000)
            expect(result.direction).toBe('member_to_dealer')
            expect(result.isExactMatch).toBe(false)
            expect(result.suggestedSlipAmount).toBe(1000)
        })

        it('calculates prize > debt correctly (dealer pays member difference)', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 2000,
                prizeAmount: 5000,
                slipAmount: 3000
            })
            expect(result.netDifference).toBe(-3000)
            expect(result.direction).toBe('dealer_to_member')
            expect(result.isExactMatch).toBe(false)
            expect(result.suggestedSlipAmount).toBe(3000)
        })

        it('calculates exact match debt === prize correctly', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 3000,
                prizeAmount: 3000,
                slipAmount: 0
            })
            expect(result.netDifference).toBe(0)
            expect(result.direction).toBe('even')
            expect(result.isExactMatch).toBe(true)
            expect(result.suggestedSlipAmount).toBe(0)
        })

        it('handles null, undefined, or string inputs gracefully', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: '4000',
                prizeAmount: null,
                slipAmount: undefined
            })
            expect(result.pastDebtTotal).toBe(4000)
            expect(result.prizeAmount).toBe(0)
            expect(result.netDifference).toBe(4000)
            expect(result.direction).toBe('member_to_dealer')
        })
    })

    describe('allocateCrossRoundOffsetPayments', () => {
        it('allocates payment across single past round for member', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-16', debt: 4000, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-2', roundDate: '2026-09-01', lotteryType: 'lao' }

            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 3000,
                actualSlipAmount: 1000,
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: 'user-1',
                dealerId: 'dealer-1',
                isUpstream: false
            })

            expect(allocation.currentRoundPayment).toMatchObject({
                round_id: 'round-2',
                payment_type: 'prize_payout',
                direction: 'dealer_to_member',
                amount: 3000,
                paid_at: '2026-09-10'
            })
            expect(allocation.pastRoundPayments).toHaveLength(1)
            expect(allocation.pastRoundPayments[0]).toMatchObject({
                round_id: 'round-1',
                payment_type: 'net_settlement',
                direction: 'member_to_dealer',
                amount: 4000,
                paid_at: '2026-09-10'
            })
        })

        it('allocates payment sequentially (FIFO) across multiple past rounds', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-01', debt: 1500, lotteryType: 'lao' },
                { roundId: 'round-2', roundDate: '2026-08-16', debt: 2500, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-3', roundDate: '2026-09-01', lotteryType: 'lao' }

            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 3000,
                actualSlipAmount: 1000, // Total funds = 4000
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: 'user-1',
                dealerId: 'dealer-1',
                isUpstream: false
            })

            expect(allocation.pastRoundPayments).toHaveLength(2)
            expect(allocation.pastRoundPayments[0].amount).toBe(1500)
            expect(allocation.pastRoundPayments[0].round_id).toBe('round-1')
            expect(allocation.pastRoundPayments[1].amount).toBe(2500)
            expect(allocation.pastRoundPayments[1].round_id).toBe('round-2')
        })

        it('allocates partial payment when funds are less than total debt', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-01', debt: 2000, lotteryType: 'lao' },
                { roundId: 'round-2', roundDate: '2026-08-16', debt: 3000, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-3', roundDate: '2026-09-01', lotteryType: 'lao' }

            // Available funds = 3000 (prize 3000 + slip 0)
            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 3000,
                actualSlipAmount: 0,
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: 'user-1',
                dealerId: 'dealer-1',
                isUpstream: false
            })

            expect(allocation.pastRoundPayments).toHaveLength(2)
            expect(allocation.pastRoundPayments[0].amount).toBe(2000) // Clears round-1 completely
            expect(allocation.pastRoundPayments[1].amount).toBe(1000) // Partially clears round-2
        })

        it('handles upstream cross-round offset correctly with prize_collection and dealer_to_upstream', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-16', debt: 2500, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-2', roundDate: '2026-09-01', lotteryType: 'lao' }

            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 2500,
                actualSlipAmount: 0,
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: null,
                dealerId: 'dealer-1',
                isUpstream: true,
                upstreamDealerName: 'เจ๊ณี'
            })

            expect(allocation.currentRoundPayment).toMatchObject({
                round_id: 'round-2',
                payment_type: 'prize_collection',
                direction: 'upstream_to_dealer',
                amount: 2500
            })
            expect(allocation.pastRoundPayments[0]).toMatchObject({
                round_id: 'round-1',
                payment_type: 'net_settlement',
                direction: 'dealer_to_upstream',
                amount: 2500
            })
        })

        it('prioritizes round_id over history id and ensures valid ISO round_date', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-01', debt: 2600, lotteryType: 'thai' }
            ]
            const currentRound = {
                id: 'history-row-id-123',
                round_id: 'actual-round-uuid-456',
                close_time: '2026-08-16T15:30:00+07:00',
                round_date: '2026-08-15',
                lottery_type: 'thai'
            }

            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 12000,
                actualSlipAmount: 9400,
                paidAt: '2026-08-16',
                currentRound,
                memberUserId: 'user-ja-kuza',
                dealerId: 'dealer-main',
                isUpstream: false
            })

            expect(allocation.currentRoundPayment.round_id).toBe('actual-round-uuid-456')
            expect(allocation.currentRoundPayment.round_date).toBe('2026-08-16')
            expect(allocation.pastRoundPayments[0].round_id).toBe('round-1')
            expect(allocation.pastRoundPayments[0].round_date).toBe('2026-08-01')
            expect(allocation.pastRoundPayments[0].amount).toBe(2600)
            expect(allocation.pastRoundPayments[0].notes).toContain('หักล้างรางวัลจากงวด 2026-08-16')
        })
    })

    describe('findMemberPastUnpaidRounds', () => {
        it('returns only past rounds where member has positive unpaid debt', () => {
            const userHistories = [
                // Past round 1: Sales 5000, comm 1000, win 0 -> Debt 4000. No payments -> Still owes 4000
                { round_id: 'r-1', user_id: 'u-1', total_amount: 5000, total_commission: 1000, total_winnings: 0, round_date: '2026-08-01', lottery_type: 'lao' },
                // Past round 2: Sales 3000, comm 500, win 2500 -> Initial 0 -> Settled
                { round_id: 'r-2', user_id: 'u-1', total_amount: 3000, total_commission: 500, total_winnings: 2500, round_date: '2026-08-16', lottery_type: 'lao' },
                // Past round 3: Sales 2000, comm 200, win 0 -> Initial 1800. Paid 1800 -> Settled
                { round_id: 'r-3', user_id: 'u-1', total_amount: 2000, total_commission: 200, total_winnings: 0, round_date: '2026-08-20', lottery_type: 'lao' },
                // Current round (should be excluded)
                { round_id: 'r-4', user_id: 'u-1', total_amount: 2000, total_commission: 200, total_winnings: 3000, round_date: '2026-09-01', lottery_type: 'lao' },
                // Other user
                { round_id: 'r-1', user_id: 'u-2', total_amount: 5000, total_commission: 0, total_winnings: 0, round_date: '2026-08-01', lottery_type: 'lao' }
            ]

            const memberPayments = [
                { round_id: 'r-3', user_id: 'u-1', amount: 1800, direction: 'member_to_dealer' }
            ]

            const unpaid = findMemberPastUnpaidRounds({
                userId: 'u-1',
                currentRoundId: 'r-4',
                currentRoundDate: '2026-09-01',
                userHistories,
                memberPayments
            })

            expect(unpaid).toHaveLength(1)
            expect(unpaid[0]).toEqual({
                roundId: 'r-1',
                roundDate: '2026-08-01',
                lotteryType: 'lao',
                debt: 4000
            })
        })

        it('calculates member debt with 20% commission fallback when past round has 0 or null commission (e.g. 510 -> 408)', () => {
            const userHistories = [
                // พี่แตง: Sales 510, comm 0 (from older round history), win 0 -> debt should be 510 - 102 = 408
                { round_id: 'r-24jan', user_id: 'u-tang', total_amount: 510, total_commission: 0, total_winnings: 0, round_date: '2026-01-24', lottery_type: 'lao' }
            ]

            const unpaid = findMemberPastUnpaidRounds({
                userId: 'u-tang',
                currentRoundId: 'r-26jan',
                currentRoundDate: '2026-01-26',
                userHistories,
                memberPayments: []
            })

            expect(unpaid).toHaveLength(1)
            expect(unpaid[0]).toEqual({
                roundId: 'r-24jan',
                roundDate: '2026-01-24',
                lotteryType: 'lao',
                debt: 408
            })
        })

        it('includes past rounds where member has negative balance (unpaid prize credit) like จา คูซ่า (-7533)', () => {
            const userHistories = [
                // Round 2026-08-01: Debt 4000
                { round_id: 'r-1', user_id: 'u-jakusa', total_amount: 5000, total_commission: 1000, total_winnings: 0, round_date: '2026-08-01', lottery_type: 'thai' },
                // Round 2026-08-16 (16-8-69): Sales 5020, comm 553, win 12000 -> Initial -7533 (Dealer owes member)
                { round_id: 'r-2', user_id: 'u-jakusa', total_amount: 5020, total_commission: 553, total_winnings: 12000, round_date: '2026-08-16', lottery_type: 'thai' }
            ]

            const unpaid = findMemberPastUnpaidRounds({
                userId: 'u-jakusa',
                currentRoundId: 'r-current',
                currentRoundDate: '2026-09-01',
                userHistories,
                memberPayments: []
            })

            expect(unpaid).toHaveLength(2)
            // Must be sorted descending (most recent 2026-08-16 first, then 2026-08-01)
            expect(unpaid[0].roundDate).toBe('2026-08-16')
            expect(unpaid[0].debt).toBe(-7533)
            expect(unpaid[1].roundDate).toBe('2026-08-01')
            expect(unpaid[1].debt).toBe(4000)
        })

        it('sorts past unpaid rounds descending (most recent past round on top)', () => {
            const userHistories = [
                { round_id: 'r-1', user_id: 'u-1', total_amount: 1000, total_commission: 0, total_winnings: 0, round_date: '2026-07-01' },
                { round_id: 'r-2', user_id: 'u-1', total_amount: 1000, total_commission: 0, total_winnings: 0, round_date: '2026-08-16' },
                { round_id: 'r-3', user_id: 'u-1', total_amount: 1000, total_commission: 0, total_winnings: 0, round_date: '2026-07-16' }
            ]

            const unpaid = findMemberPastUnpaidRounds({
                userId: 'u-1',
                userHistories
            })

            expect(unpaid.map(r => r.roundDate)).toEqual([
                '2026-08-16',
                '2026-07-16',
                '2026-07-01'
            ])
        })

        it('resolves correct close date from roundHistory if user_round_history had open_date', () => {
            const userHistories = [
                { round_id: 'r-1', user_id: 'u-1', total_amount: 5000, total_commission: 1000, total_winnings: 0, round_date: '2026-04-15', lottery_type: 'thai' }
            ]
            const roundHistory = [
                { id: 'r-1', round_date: '2026-04-15', close_time: '2026-04-16T15:30:00+07:00' }
            ]

            const unpaid = findMemberPastUnpaidRounds({
                userId: 'u-1',
                userHistories,
                roundHistory
            })

            expect(unpaid).toHaveLength(1)
            expect(unpaid[0].roundDate).toBe('2026-04-16')
        })
    })

    describe('findUpstreamPastUnpaidRounds', () => {
        it('returns only past rounds where dealer owes upstream debt and sorts descending', () => {
            const transfers = [
                // Past round 1: amount 5000, comm 500, win 0 -> Layoff 4500 - 0 = 4500 debt
                { round_id: 'r-1', target_dealer_name: 'เฮียเบิร์ด', amount: 5000, commission_earned: 500, winnings: 0, round_date: '2026-08-01', lottery_type: 'lao' },
                // Past round 2: more recent
                { round_id: 'r-3', target_dealer_name: 'เฮียเบิร์ด', amount: 3000, commission_earned: 300, winnings: 0, round_date: '2026-08-16', lottery_type: 'lao' },
                // Current round (should be excluded)
                { round_id: 'r-2', target_dealer_name: 'เฮียเบิร์ด', amount: 3000, commission_earned: 300, winnings: 5000, round_date: '2026-09-01', lottery_type: 'lao' }
            ]

            const upstreamPayments = []

            const unpaid = findUpstreamPastUnpaidRounds({
                dealerName: 'เฮียเบิร์ด',
                currentRoundId: 'r-2',
                currentRoundDate: '2026-09-01',
                transfers,
                upstreamPayments
            })

            expect(unpaid).toHaveLength(2)
            expect(unpaid[0].roundDate).toBe('2026-08-16')
            expect(unpaid[1].roundDate).toBe('2026-08-01')
        })

        it('resolves correct close date from roundHistory for upstream rounds', () => {
            const transfers = [
                { round_id: 'r-1', target_dealer_name: 'เฮียเบิร์ด', amount: 5000, commission_earned: 500, winnings: 0, round_date: '2026-05-15', lottery_type: 'thai' }
            ]
            const roundHistory = [
                { id: 'r-1', round_date: '2026-05-15', close_time: '2026-05-16T15:30:00+07:00' }
            ]

            const unpaid = findUpstreamPastUnpaidRounds({
                dealerName: 'เฮียเบิร์ด',
                transfers,
                roundHistory
            })

            expect(unpaid).toHaveLength(1)
            expect(unpaid[0].roundDate).toBe('2026-05-16')
        })
    })

    describe('calculateCrossRoundPaymentSummary', () => {
        const pastRounds = [
            { roundId: 'r-1', debt: 1000 },
            { roundId: 'r-2', debt: 500 }
        ]

        it('calculates current_debt mode correctly', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'current_debt',
                currentBalance: 2500,
                currentWinnings: 1000,
                selectedPastRounds: pastRounds
            })
            expect(summary.mode).toBe('current_debt')
            expect(summary.suggestedSlipAmount).toBe(2500)
            expect(summary.direction).toBe('member_to_dealer')
            expect(summary.pastDebtsTotal).toBe(0)
        })

        it('calculates current_prize mode correctly', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'current_prize',
                currentBalance: 2500,
                currentWinnings: 3000,
                selectedPastRounds: pastRounds
            })
            expect(summary.mode).toBe('current_prize')
            expect(summary.suggestedSlipAmount).toBe(3000)
            expect(summary.direction).toBe('dealer_to_member')
        })

        it('respects availableWinnings = 0 when prize was already paid in full (does NOT fallback to currentWinnings)', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'current_prize',
                currentBalance: 1064,
                currentWinnings: 7000,
                availableWinnings: 0,
                selectedPastRounds: []
            })
            expect(summary.mode).toBe('current_prize')
            expect(summary.currentRoundPrize).toBe(0)
            expect(summary.suggestedSlipAmount).toBe(0)
            expect(summary.netDifference).toBe(0)
        })

        it('respects partial availableWinnings (e.g. 2000 of 7000 remaining)', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'current_prize',
                currentBalance: 0,
                currentWinnings: 7000,
                availableWinnings: 2000,
                selectedPastRounds: []
            })
            expect(summary.mode).toBe('current_prize')
            expect(summary.currentRoundPrize).toBe(2000)
            expect(summary.suggestedSlipAmount).toBe(2000)
            expect(summary.direction).toBe('dealer_to_member')
        })

        it('calculates offset_prize_past_debt mode correctly', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'offset_prize_past_debt',
                currentBalance: 500,
                currentWinnings: 1000,
                selectedPastRounds: pastRounds // total debt = 1500
            })
            expect(summary.mode).toBe('offset_prize_past_debt')
            expect(summary.suggestedSlipAmount).toBe(500) // 1500 - 1000 = 500
            expect(summary.direction).toBe('member_to_dealer')
        })

        it('calculates combine_all mode correctly', () => {
            const summary = calculateCrossRoundPaymentSummary({
                mode: 'combine_all',
                currentBalance: 2000,
                currentWinnings: 0,
                selectedPastRounds: pastRounds // total debt = 1500
            })
            expect(summary.mode).toBe('combine_all')
            expect(summary.suggestedSlipAmount).toBe(3500) // 2000 + 1500 = 3500
            expect(summary.direction).toBe('member_to_dealer')
        })
    })

    describe('allocateSettlementPaymentsByMode', () => {
        const curRound = { round_id: 'cur-1', round_date: '2026-09-11', lottery_type: 'lao' }
        const pastRounds = [
            { roundId: 'past-1', debt: 1000, round_date: '2026-08-01', lottery_type: 'lao' },
            { roundId: 'past-2', debt: 500, round_date: '2026-08-16', lottery_type: 'lao' }
        ]

        it('allocates current_debt correctly', () => {
            const alloc = allocateSettlementPaymentsByMode({
                mode: 'current_debt',
                currentBalance: 1200,
                actualSlipAmount: 1200,
                paidAt: '2026-09-11',
                currentRound: curRound,
                memberUserId: 'm-1',
                dealerId: 'd-1'
            })
            expect(alloc.currentRoundPayment).toBeDefined()
            expect(alloc.currentRoundPayment.amount).toBe(1200)
            expect(alloc.currentRoundPayment.payment_type).toBe('net_settlement')
            expect(alloc.pastRoundPayments).toHaveLength(0)
        })

        it('allocates current_prize correctly', () => {
            const alloc = allocateSettlementPaymentsByMode({
                mode: 'current_prize',
                currentWinnings: 3000,
                actualSlipAmount: 3000,
                paidAt: '2026-09-11',
                currentRound: curRound,
                memberUserId: 'm-1',
                dealerId: 'd-1'
            })
            expect(alloc.currentRoundPayment).toBeDefined()
            expect(alloc.currentRoundPayment.amount).toBe(3000)
            expect(alloc.currentRoundPayment.payment_type).toBe('prize_payout')
            expect(alloc.pastRoundPayments).toHaveLength(0)
        })

        it('allocates combine_all correctly covering past debts and current debt', () => {
            const alloc = allocateSettlementPaymentsByMode({
                mode: 'combine_all',
                currentBalance: 1500,
                selectedPastRounds: pastRounds, // 1000 + 500 = 1500
                actualSlipAmount: 3000, // covers 1500 past + 1500 current
                paidAt: '2026-09-11',
                currentRound: curRound,
                memberUserId: 'm-1',
                dealerId: 'd-1'
            })
            expect(alloc.pastRoundPayments).toHaveLength(2)
            expect(alloc.pastRoundPayments[0].amount).toBe(1000)
            expect(alloc.pastRoundPayments[1].amount).toBe(500)
            expect(alloc.currentRoundPayment).toBeDefined()
            expect(alloc.currentRoundPayment.amount).toBe(1500)
        })

        it('merges customNotes, paidTime, and referenceDoc into notes', () => {
            const alloc = allocateSettlementPaymentsByMode({
                mode: 'current_debt',
                currentBalance: 1200,
                actualSlipAmount: 1200,
                paidAt: '2026-09-11',
                paidTime: '14:20',
                referenceDoc: 'SLIP-9988',
                customNotes: 'ไทยพาณิชย์ 9972081291 (ยุทธศักดิ์)',
                currentRound: curRound,
                memberUserId: 'm-1',
                dealerId: 'd-1'
            })
            expect(alloc.currentRoundPayment.notes).toBe('ชำระหนี้งวดนี้ (ไทยพาณิชย์ 9972081291 (ยุทธศักดิ์) เวลา 14:20 #SLIP-9988)')
        })
    })

    describe('parsePaymentNotes & buildPaymentNotes', () => {
        it('parses user screenshot note correctly with bank name, nested parentheses, time and ref', () => {
            const note = 'ชำระหนี้งวดนี้ (ออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว) เวลา 18:09 #Aa7bf7ec966354829)'
            const parsed = parsePaymentNotes(note)
            expect(parsed.prefix).toBe('ชำระหนี้งวดนี้')
            expect(parsed.customNotes).toBe('ออมสิน 020432578092 (นายธีรเดช บรรจงแก้ว)')
            expect(parsed.paidTime).toBe('18:09')
            expect(parsed.referenceDoc).toBe('Aa7bf7ec966354829')

            // Rebuilding should match exactly
            const rebuilt = buildPaymentNotes({
                originalPrefix: parsed.prefix,
                customNotes: parsed.customNotes,
                paidTime: parsed.paidTime,
                referenceDoc: parsed.referenceDoc
            })
            expect(rebuilt).toBe(note)
        })

        it('parses note without custom bank info but with time and ref', () => {
            const note = 'จ่ายเงินถูกรางวัลงวดนี้ (เวลา 14:00 #TX-12345)'
            const parsed = parsePaymentNotes(note)
            expect(parsed.prefix).toBe('จ่ายเงินถูกรางวัลงวดนี้')
            expect(parsed.customNotes).toBe('')
            expect(parsed.paidTime).toBe('14:00')
            expect(parsed.referenceDoc).toBe('TX-12345')
        })

        it('parses simple text note without prefix or parens', () => {
            const note = 'โอนแล้ว'
            const parsed = parsePaymentNotes(note)
            expect(parsed.prefix).toBe('')
            expect(parsed.customNotes).toBe('โอนแล้ว')
            expect(parsed.paidTime).toBe('')
            expect(parsed.referenceDoc).toBe('')
        })

        it('builds default prefix based on paymentType and direction if originalPrefix is missing', () => {
            const rebuilt = buildPaymentNotes({
                paymentType: 'net_settlement',
                direction: 'member_to_dealer',
                customNotes: 'กสิกรไทย 111-222 (สมชาย)',
                paidTime: '15:30',
                referenceDoc: 'REF99'
            })
            expect(rebuilt).toBe('ชำระหนี้งวดนี้ (กสิกรไทย 111-222 (สมชาย) เวลา 15:30 #REF99)')
        })

        it('handles null and undefined gracefully', () => {
            expect(parsePaymentNotes(null)).toEqual({ customNotes: '', paidTime: '', referenceDoc: '', prefix: '' })
            expect(parsePaymentNotes(undefined)).toEqual({ customNotes: '', paidTime: '', referenceDoc: '', prefix: '' })
            expect(buildPaymentNotes({})).toBe('ชำระหนี้งวดนี้')
        })
    })
})

