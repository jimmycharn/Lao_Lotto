import { describe, it, expect } from 'vitest'
import {
    calculateOffsetSummary,
    allocateCrossRoundOffsetPayments,
    findMemberPastUnpaidRounds,
    findUpstreamPastUnpaidRounds
} from './crossRoundOffsetCalculator'

describe('crossRoundOffsetCalculator', () => {
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
    })

    describe('findUpstreamPastUnpaidRounds', () => {
        it('returns only past rounds where dealer owes upstream debt', () => {
            const transfers = [
                // Past round 1: amount 5000, comm 500, win 0 -> Layoff 4500 - 0 = 4500 debt
                { round_id: 'r-1', target_dealer_name: 'เฮียเบิร์ด', amount: 5000, commission_earned: 500, winnings: 0, round_date: '2026-08-01', lottery_type: 'lao' },
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

            expect(unpaid).toHaveLength(1)
            expect(unpaid[0]).toEqual({
                roundId: 'r-1',
                roundDate: '2026-08-01',
                lotteryType: 'lao',
                debt: 4500,
                upstreamDealerName: 'เฮียเบิร์ด'
            })
        })
    })
})
