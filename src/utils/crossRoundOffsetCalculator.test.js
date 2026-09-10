import { describe, it, expect } from 'vitest'
import {
    calculateOffsetSummary,
    allocateCrossRoundOffsetPayments
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
})
