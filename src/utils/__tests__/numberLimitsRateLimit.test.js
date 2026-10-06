import { describe, it, expect } from 'vitest'
import { isRateLimitDefault, checkSingleSubmission, findMatchingLimit } from '../numberLimits'

describe('NumberLimits Rate Limit and Default Limit', () => {
    it('isRateLimitDefault correctly identifies rate limit with use_default_limit', () => {
        expect(isRateLimitDefault(null)).toBe(false)
        expect(isRateLimitDefault({ limit_type: 'limited', max_amount: 1000 })).toBe(false)
        expect(isRateLimitDefault({ limit_type: 'blocked' })).toBe(false)
        
        // Direct properties
        expect(isRateLimitDefault({ limit_type: 'rate_limit', use_default_limit: true })).toBe(true)
        expect(isRateLimitDefault({ limit_type: 'rate_limit', use_default_limit: false })).toBe(false)

        // Stored inside time_condition JSONB fallback
        expect(isRateLimitDefault({
            limit_type: 'limited',
            time_condition: { is_rate_limit: true, use_default_limit: true }
        })).toBe(true)
    })

    it('checkSingleSubmission does not block or cap when rate_limit with default limit (อั้นปกติ) is active', () => {
        const numberLimits = [
            {
                round_id: 'round-1',
                bet_type: '2_top',
                numbers: '25',
                limit_type: 'rate_limit',
                use_default_limit: true,
                max_amount: 0,
                payout_percent: 50,
                is_active: true
            }
        ]
        const currentTotals = new Map([
            ['2_top|25', 5000] // already has 5000 bet
        ])

        const result = checkSingleSubmission(numberLimits, currentTotals, '2_top', '25', 1000)

        // When use_default_limit is true:
        // status is 'limited' (since payoutPercent 50 < 100)
        // maxAllowed is Infinity (no limit on this specific number; adheres to bet type default)
        // overflow is 0
        // payoutPercent is 50
        expect(result.status).toBe('limited')
        expect(result.maxAllowed).toBe(Infinity)
        expect(result.overflow).toBe(0)
        expect(result.payoutPercent).toBe(50)
    })

    it('checkSingleSubmission still checks max_amount when rate_limit has explicit max_amount (อั้นปกติ unchecked)', () => {
        const numberLimits = [
            {
                round_id: 'round-1',
                bet_type: '2_top',
                numbers: '25',
                limit_type: 'rate_limit',
                use_default_limit: false,
                max_amount: 2000,
                payout_percent: 50,
                is_active: true
            }
        ]
        const currentTotals = new Map([
            ['2_top|25', 1500]
        ])

        // Bet 1000: total would be 2500 > 2000 => overflow of 500
        const result = checkSingleSubmission(numberLimits, currentTotals, '2_top', '25', 1000)

        expect(result.status).toBe('overflow')
        expect(result.maxAllowed).toBe(2000)
        expect(result.overflow).toBe(500)
        expect(result.payoutPercent).toBe(50)
    })
})
