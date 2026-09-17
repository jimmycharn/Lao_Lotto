import { describe, it, expect } from 'vitest'

// Helper mirroring getExpectedSubmissionPayout logic across components
function getExpectedSubmissionPayout(sub, lotteryType, userSettings = {}, setPrice = 120) {
    if (!sub.is_winner) return 0
    if (sub.bet_type === '4_set') {
        const numSets = Math.max(1, Math.floor((sub.amount || 0) / setPrice))
        return (sub.prize_amount || 0) * numSets
    }
    if (sub.prize_amount !== undefined && sub.prize_amount !== null && Number(sub.prize_amount) > 0) {
        return Number(sub.prize_amount)
    }
    const lotteryKey = lotteryType === 'thai' ? 'thai' : 'lao'
    const settings = userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]
    if (settings?.payout !== undefined) return (sub.amount || 0) * settings.payout
    return (sub.amount || 0) * 65
}

describe('getExpectedSubmissionPayout priority test', () => {
    it('prioritizes official recorded prize_amount over user_settings dynamic payout', () => {
        // Scenario: Bee Patcha had winning bet with prize_amount 700 stored in DB (rate 70),
        // but current user_settings has payout: 65.
        const sub = {
            id: 'sub-1',
            user_id: 'user-bee',
            bet_type: '2_bottom',
            amount: 10,
            prize_amount: 700,
            is_winner: true
        }

        const userSettings = {
            'user-bee': {
                lottery_settings: {
                    thai: {
                        '2_bottom': { payout: 65, commission: 15 }
                    }
                }
            }
        }

        const payout = getExpectedSubmissionPayout(sub, 'thai', userSettings)
        // Must return 700 (from DB prize_amount), NOT 10 * 65 = 650
        expect(payout).toBe(700)
    })

    it('falls back to userSettings payout if prize_amount is not yet recorded (e.g. unannounced or zero)', () => {
        const sub = {
            id: 'sub-2',
            user_id: 'user-bee',
            bet_type: '2_bottom',
            amount: 10,
            prize_amount: 0,
            is_winner: true
        }

        const userSettings = {
            'user-bee': {
                lottery_settings: {
                    thai: {
                        '2_bottom': { payout: 65, commission: 15 }
                    }
                }
            }
        }

        const payout = getExpectedSubmissionPayout(sub, 'thai', userSettings)
        expect(payout).toBe(650)
    })

    it('calculates 4_set prize correctly with numSets', () => {
        const sub = {
            id: 'sub-3',
            user_id: 'user-bee',
            bet_type: '4_set',
            amount: 240, // 2 sets
            prize_amount: 3000,
            is_winner: true
        }

        const payout = getExpectedSubmissionPayout(sub, 'lao', {}, 120)
        expect(payout).toBe(6000)
    })

    it('returns 0 for non-winner', () => {
        const sub = {
            id: 'sub-4',
            user_id: 'user-bee',
            bet_type: '2_bottom',
            amount: 10,
            prize_amount: 0,
            is_winner: false
        }

        const payout = getExpectedSubmissionPayout(sub, 'thai', {})
        expect(payout).toBe(0)
    })
})
