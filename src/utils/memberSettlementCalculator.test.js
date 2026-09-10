import { describe, it, expect } from 'vitest'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    getMemberSettlementStatus,
    getPaymentPresetAmount,
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance,
    getUpstreamSettlementStatus,
    getUpstreamPaymentPresetAmount,
    isRoundFullySettled
} from './memberSettlementCalculator'

describe('memberSettlementCalculator', () => {
    it('calculates initial balance correctly: (total_amount - commission) - winnings', () => {
        // Member owes dealer: 2794 - 565 - 0 = 2229
        const uh1 = { total_amount: 2794, total_commission: 565, total_winnings: 0 }
        expect(calculateMemberInitialBalance(uh1)).toBe(2229)

        // Dealer owes member: 1000 - 200 - 10000 = -9200
        const uh2 = { total_amount: 1000, total_commission: 200, total_winnings: 10000 }
        expect(calculateMemberInitialBalance(uh2)).toBe(-9200)

        // Break even: 1000 - 200 - 800 = 0
        const uh3 = { total_amount: 1000, total_commission: 200, total_winnings: 800 }
        expect(calculateMemberInitialBalance(uh3)).toBe(0)
    })

    it('calculates current balance with payments: initial - member_paid + dealer_paid', () => {
        const initial = 2229
        // Member paid 1000
        const payments1 = [{ direction: 'member_to_dealer', amount: 1000 }]
        expect(calculateMemberCurrentBalance(initial, payments1)).toBe(1229)

        // Member paid remaining 1229
        const payments2 = [
            { direction: 'member_to_dealer', amount: 1000 },
            { direction: 'member_to_dealer', amount: 1229 }
        ]
        expect(calculateMemberCurrentBalance(initial, payments2)).toBe(0)

        // Initial was -9200 (dealer owes member), dealer paid 5000
        const initialNegative = -9200
        const paymentsDealer = [{ direction: 'dealer_to_member', amount: 5000 }]
        expect(calculateMemberCurrentBalance(initialNegative, paymentsDealer)).toBe(-4200)

        // Dealer paid full remaining
        const paymentsDealerFull = [
            { direction: 'dealer_to_member', amount: 5000 },
            { direction: 'dealer_to_member', amount: 4200 }
        ]
        expect(calculateMemberCurrentBalance(initialNegative, paymentsDealerFull)).toBe(0)
    })

    it('determines status correctly: owesDealer, owesMember, isSettled', () => {
        expect(getMemberSettlementStatus(2229)).toMatchObject({
            owesDealer: true,
            owesMember: false,
            isSettled: false,
            formattedText: '+฿2,229'
        })

        expect(getMemberSettlementStatus(-1400)).toMatchObject({
            owesDealer: false,
            owesMember: true,
            isSettled: false,
            formattedText: '-฿1,400'
        })

        expect(getMemberSettlementStatus(0)).toMatchObject({
            owesDealer: false,
            owesMember: false,
            isSettled: true,
            formattedText: '฿0'
        })
    })

    it('calculates payment presets for quick buttons', () => {
        const uh = { total_amount: 2511, total_commission: 504, total_winnings: 1400 }
        const initial = calculateMemberInitialBalance(uh) // 607

        // For net settlement, preset is remaining balance absolute value
        expect(getPaymentPresetAmount(uh, [], 'net_settlement', 'member_to_dealer')).toBe(607)

        // For prize payout only, preset is winnings amount
        expect(getPaymentPresetAmount(uh, [], 'prize_payout', 'dealer_to_member')).toBe(1400)
    })
})

describe('upstreamSettlementCalculator', () => {
    it('calculates upstream initial balance correctly: (amount - commission) - winnings', () => {
        // Dealer owes upstream: 8600 - 2570 - 0 = 6030
        const t1 = { amount: 8600, commission_earned: 2570, winnings: 0 }
        expect(calculateUpstreamInitialBalance(t1)).toBe(6030)

        // Upstream owes dealer: 5000 - 1000 - 12000 = -8000
        const t2 = { amount: 5000, commission_earned: 1000, winnings: 12000 }
        expect(calculateUpstreamInitialBalance(t2)).toBe(-8000)

        // Break-even
        const t3 = { amount: 5000, commission_earned: 1000, winnings: 4000 }
        expect(calculateUpstreamInitialBalance(t3)).toBe(0)
    })

    it('calculates upstream current balance with payments: initial - paid_by_dealer + paid_by_upstream', () => {
        const initial = 6030
        // Dealer paid 2000 to upstream
        const p1 = [{ direction: 'dealer_to_upstream', amount: 2000 }]
        expect(calculateUpstreamCurrentBalance(initial, p1)).toBe(4030)

        // Dealer paid remaining 4030
        const p2 = [
            { direction: 'dealer_to_upstream', amount: 2000 },
            { direction: 'dealer_to_upstream', amount: 4030 }
        ]
        expect(calculateUpstreamCurrentBalance(initial, p2)).toBe(0)

        // Upstream owed dealer 8000 (initial = -8000)
        const initialNegative = -8000
        const pUpstream = [{ direction: 'upstream_to_dealer', amount: 5000 }]
        expect(calculateUpstreamCurrentBalance(initialNegative, pUpstream)).toBe(-3000)

        const pUpstreamFull = [
            { direction: 'upstream_to_dealer', amount: 5000 },
            { direction: 'upstream_to_dealer', amount: 3000 }
        ]
        expect(calculateUpstreamCurrentBalance(initialNegative, pUpstreamFull)).toBe(0)
    })

    it('determines upstream settlement status correctly', () => {
        // Dealer owes upstream (6030) -> -฿6,030
        expect(getUpstreamSettlementStatus(6030)).toMatchObject({
            isSettled: false,
            formattedText: '-฿6,030',
            partyWhoOwes: 'dealer'
        })

        // Upstream owes dealer (-8000) -> +฿8,000
        expect(getUpstreamSettlementStatus(-8000)).toMatchObject({
            isSettled: false,
            formattedText: '+฿8,000',
            partyWhoOwes: 'upstream'
        })

        // Break even / settled
        expect(getUpstreamSettlementStatus(0)).toMatchObject({
            isSettled: true,
            formattedText: '฿0',
            partyWhoOwes: 'none'
        })
    })

    it('calculates upstream payment presets for buttons', () => {
        const t = { amount: 8600, commission_earned: 2570, winnings: 2000 }
        // Net layoff: 6030, Winnings: 2000, Initial balance: 4030 (Dealer owes 4030)
        expect(getUpstreamPaymentPresetAmount(t, [], 'net_settlement')).toBe(4030)
        expect(getUpstreamPaymentPresetAmount(t, [], 'prize_collection')).toBe(2000)

        // If 1000 prize already collected
        const pPrize = [{ payment_type: 'prize_collection', amount: 1000 }]
        expect(getUpstreamPaymentPresetAmount(t, pPrize, 'prize_collection')).toBe(1000)
    })
})

describe('isRoundFullySettled', () => {
    it('returns false for empty round with no activity', () => {
        expect(isRoundFullySettled({ history: { total_entries: 0, total_amount: 0, transferred_amount: 0 } })).toBe(false)
        expect(isRoundFullySettled({})).toBe(false)
    })

    it('returns true when all members and upstream transfers have 0 outstanding balance', () => {
        const history = {
            id: 'round-1',
            total_entries: 10,
            total_amount: 5000,
            transferred_amount: 2000
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 3000, total_commission: 600, total_winnings: 0 }, // init: 2400
            { user_id: 'u2', total_amount: 2000, total_commission: 400, total_winnings: 5000 } // init: -3400
        ]
        const memberPayments = [
            { user_id: 'u1', amount: 2400, direction: 'member_to_dealer' },
            { user_id: 'u2', amount: 3400, direction: 'dealer_to_member' }
        ]
        const transfers = [
            { dealerName: 'DealerA', amount: 2000, commission_earned: 500, winnings: 0 } // init: 1500
        ]
        const upstreamPayments = [
            { upstream_dealer_name: 'DealerA', amount: 1500, direction: 'dealer_to_upstream' }
        ]

        expect(isRoundFullySettled({
            history,
            userHistories,
            memberPayments,
            transfers,
            upstreamPayments
        })).toBe(true)
    })

    it('returns false if any member has an outstanding balance', () => {
        const history = {
            id: 'round-1',
            total_entries: 5,
            total_amount: 3000,
            transferred_amount: 0
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 3000, total_commission: 600, total_winnings: 0 } // init: 2400
        ]
        // Member only paid 2000, 400 still pending
        const memberPayments = [
            { user_id: 'u1', amount: 2000, direction: 'member_to_dealer' }
        ]

        expect(isRoundFullySettled({
            history,
            userHistories,
            memberPayments
        })).toBe(false)
    })

    it('returns false if upstream dealer has an outstanding balance', () => {
        const history = {
            id: 'round-1',
            total_entries: 2,
            total_amount: 1000,
            transferred_amount: 8600
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 1000, total_commission: 200, total_winnings: 800 } // balance 0
        ]
        const transfers = [
            { dealerName: 'UpstreamX', amount: 8600, commission_earned: 2570, winnings: 0 } // init: 6030
        ]
        // No upstream payments recorded yet
        expect(isRoundFullySettled({
            history,
            userHistories,
            transfers,
            upstreamPayments: []
        })).toBe(false)
    })
})

