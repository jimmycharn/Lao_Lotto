import { describe, it, expect } from 'vitest'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    getMemberSettlementStatus,
    getPaymentPresetAmount
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
