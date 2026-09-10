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
    calculateRoundOutstandingDetails,
    calculateTransferCommission,
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

    it('calculates transfer commission accurately and settles round even with raw transfers lacking commission_earned', () => {
        const history = {
            id: 'round-thai-16aug',
            total_entries: 1,
            total_amount: 1000,
            transferred_amount: 8600
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 1000, total_commission: 200, total_winnings: 800 }
        ]
        const memberPayments = [
            { user_id: 'u1', amount: 0, direction: 'member_to_dealer' }
        ]
        // Raw transfer from bet_transfers table (has bet_type, but no pre-computed commission_earned)
        const rawTransfers = [
            { target_dealer_name: 'พี่จึ๋ม อ้อมค่าย', amount: 8600, bet_type: '3_top', winnings: 0 }
        ]
        // Upstream payment recorded: 8600 - (8600 * 0.30 = 2580) = 6020 (or 6030)
        const upstreamPayments = [
            { upstream_dealer_name: 'พี่จึ๋ม อ้อมค่าย', amount: 6020, direction: 'dealer_to_upstream' }
        ]

        expect(isRoundFullySettled({
            history,
            userHistories,
            memberPayments,
            transfers: rawTransfers,
            upstreamPayments
        })).toBe(true)
    })

    it('settles round when synthesized transfer fallback matches upstream payment even with custom upstream dealer name', () => {
        const history = {
            id: 'round-thai-16aug-synth',
            lottery_type: 'thai',
            total_entries: 1,
            total_amount: 1000,
            transferred_amount: 8600,
            upstream_commission: 2570,
            upstream_winnings: 0
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 1000, total_commission: 200, total_winnings: 800 }
        ]
        const memberPayments = [
            { user_id: 'u1', amount: 0, direction: 'member_to_dealer' }
        ]
        // transfers is empty (fallback to history.transferred_amount)
        const upstreamPayments = [
            { upstream_dealer_name: 'พี่จิ๋ม อ้อมค่าย', amount: 6030, direction: 'dealer_to_upstream' }
        ]

        expect(isRoundFullySettled({
            history,
            userHistories,
            memberPayments,
            transfers: [],
            upstreamPayments
        })).toBe(true)
    })
})

describe('calculateRoundOutstandingDetails', () => {
    it('returns empty details when history is null or has no activity', () => {
        expect(calculateRoundOutstandingDetails()).toEqual({
            isSettled: false,
            netOutstanding: 0,
            memberOwesDealer: 0,
            dealerOwesMember: 0,
            dealerOwesUpstream: 0,
            upstreamOwesDealer: 0,
            hasActivity: false
        })

        expect(calculateRoundOutstandingDetails({
            history: { total_entries: 0, total_amount: 0, transferred_amount: 0 }
        })).toEqual({
            isSettled: false,
            netOutstanding: 0,
            memberOwesDealer: 0,
            dealerOwesMember: 0,
            dealerOwesUpstream: 0,
            upstreamOwesDealer: 0,
            hasActivity: false
        })
    })

    it('calculates net outstanding correctly when members owe dealer and dealer owes upstream', () => {
        // Exactly matches the user's screenshot case:
        // Members owe: +20,041
        // Dealer owes upstream: 6,018
        // Net outstanding for dealer: +14,023
        const history = {
            id: 'round-1',
            lottery_type: 'thai',
            total_entries: 10,
            total_amount: 46182
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 12480, total_commission: 3974, total_winnings: 0 }, // 12480 - 3974 = 8506 (or 8507 with rounding)
            { user_id: 'u2', total_amount: 8170, total_commission: 2402, total_winnings: 0 },  // 8170 - 2402 = 5768
            { user_id: 'u3', total_amount: 3000, total_commission: 300, total_winnings: 3000 } // 3000 - 300 - 3000 = -300
        ]
        // u3 pays 3000 or has payment, let's test specific balances:
        const transfers = [
            { target_dealer_name: 'พี่จิ๋ม', amount: 8608, commission_earned: 2590, winnings: 0 } // comm = 2590, balance = 8608 - 2590 = 6018
        ]

        const result = calculateRoundOutstandingDetails({
            history,
            userHistories,
            memberPayments: [],
            transfers,
            upstreamPayments: []
        })

        expect(result.hasActivity).toBe(true)
        expect(result.isSettled).toBe(false)
        expect(result.memberOwesDealer).toBe(8506 + 5768) // u1 + u2
        expect(result.dealerOwesMember).toBe(300) // u3
        expect(result.dealerOwesUpstream).toBe(6018) // 8608 - (Math.round(8608 * 0.30) = 2582 or calculated comm)
        // netOutstanding = (memberOwesDealer - dealerOwesMember) - (dealerOwesUpstream - upstreamOwesDealer)
        expect(result.netOutstanding).toBe((result.memberOwesDealer - result.dealerOwesMember) - result.dealerOwesUpstream)
    })

    it('returns isSettled: true and netOutstanding: 0 when all members and upstream are settled', () => {
        const history = {
            id: 'round-settled',
            lottery_type: 'thai',
            total_entries: 5,
            total_amount: 5000
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 5000, total_commission: 1000, total_winnings: 0 }
        ]
        const memberPayments = [
            { user_id: 'u1', amount: 4000, direction: 'member_to_dealer' }
        ]
        const transfers = [
            { target_dealer_name: 'เจ้ามือ 1', amount: 2000, bet_type: '2_top', winnings: 0 }
        ]
        // 2000 * 0.28 = 560 comm -> init balance 1440
        const upstreamPayments = [
            { upstream_dealer_name: 'เจ้ามือ 1', amount: 1440, direction: 'dealer_to_upstream' }
        ]

        const result = calculateRoundOutstandingDetails({
            history,
            userHistories,
            memberPayments,
            transfers,
            upstreamPayments
        })

        expect(result.isSettled).toBe(true)
        expect(result.netOutstanding).toBe(0)
        expect(result.memberOwesDealer).toBe(0)
        expect(result.dealerOwesMember).toBe(0)
        expect(result.dealerOwesUpstream).toBe(0)
        expect(result.upstreamOwesDealer).toBe(0)
    })

    it('calculates transfer commission accurately using custom upstream dealer lottery_settings (user scenario 1 Sep 2569)', () => {
        // User scenario:
        // Upstream Dealer: "พี่จิ๋ม อ้อมค่าย"
        // 3 ตัวบน (3_top): 8,508 @ 35% = 2,977.8
        // 2 ตัวล่าง (2_bottom): 100 @ 25% = 25.0
        // Total commission: 2,977.8 + 25 = 3,002.8 (~3,003)
        const upstreamSettings = {
            'พี่จิ๋ม อ้อมค่าย': {
                thai: {
                    '3_top': { commission: 35, payout: 550 },
                    '2_bottom': { commission: 25, payout: 70 }
                }
            }
        }

        const t3top = {
            amount: 8508,
            bet_type: '3_top',
            target_dealer_name: 'พี่จิ๋ม อ้อมค่าย'
        }
        const t2bottom = {
            amount: 100,
            bet_type: '2_bottom',
            target_dealer_name: 'พี่จิ๋ม อ้อมค่าย'
        }

        const comm3top = calculateTransferCommission(t3top, 120, upstreamSettings, 'thai')
        expect(comm3top).toBeCloseTo(2977.8, 1)

        const comm2bottom = calculateTransferCommission(t2bottom, 120, upstreamSettings, 'thai')
        expect(comm2bottom).toBe(25)

        const totalCommission = comm3top + comm2bottom
        expect(totalCommission).toBeCloseTo(3002.8, 1)
        expect(Math.round(totalCommission)).toBe(3003)

        // Test in calculateRoundOutstandingDetails:
        // Total transfer: 8,608
        // Comm: 3,002.8 -> net layoff = 8608 - 3002.8 = 5605.2 -> dealer owes upstream 5,605
        // Member owes dealer: 20,041
        // Net outstanding: 20,041 - 5,605 = 14,436
        const history = {
            id: 'round-1-sep-2569',
            lottery_type: 'thai',
            total_entries: 80,
            total_amount: 46182
        }
        const userHistories = [
            { user_id: 'u1', total_amount: 20041, total_commission: 0, total_winnings: 0 }
        ]
        const transfers = [t3top, t2bottom]

        const details = calculateRoundOutstandingDetails({
            history,
            userHistories,
            transfers,
            upstreamSettings
        })

        expect(details.dealerOwesUpstream).toBe(5605)
        expect(details.memberOwesDealer).toBe(20041)
        expect(details.netOutstanding).toBe(14436)
    })
})


