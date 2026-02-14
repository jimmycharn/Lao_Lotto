import { describe, it, expect } from 'vitest'
import {
    normalizeNumber,
    getPermutations,
    getUnique3DigitPermsFrom4,
    getUnique3DigitPermsFrom5,
    getDefaultLimitsForType,
    getDefaultSetPricesForType,
    getLotteryTypeKey,
    calculate4SetPrizes,
    generateBatchId,
    PERMUTATION_BET_TYPES,
    BET_TYPES_BY_LOTTERY,
    BET_TYPES,
    DEFAULT_4_SET_SETTINGS
} from './lotteryTypes'

// ─── normalizeNumber ──────────────────────────────────────────

describe('normalizeNumber', () => {
    it('sorts digits for permutation bet types (2_run)', () => {
        expect(normalizeNumber('52', '2_run')).toBe('25')
    })

    it('sorts digits for 3_tod', () => {
        expect(normalizeNumber('321', '3_tod')).toBe('123')
    })

    it('sorts digits for 4_float', () => {
        expect(normalizeNumber('4321', '4_float')).toBe('1234')
    })

    it('sorts digits for 5_float', () => {
        expect(normalizeNumber('54321', '5_float')).toBe('12345')
    })

    it('does NOT sort for non-permutation types (3_top)', () => {
        expect(normalizeNumber('321', '3_top')).toBe('321')
    })

    it('does NOT sort for 2_top', () => {
        expect(normalizeNumber('52', '2_top')).toBe('52')
    })

    it('handles already-sorted input', () => {
        expect(normalizeNumber('123', '3_tod')).toBe('123')
    })

    it('handles duplicate digits', () => {
        expect(normalizeNumber('331', '3_tod')).toBe('133')
    })
})

// ─── getPermutations ──────────────────────────────────────────

describe('getPermutations', () => {
    it('returns single char as-is', () => {
        expect(getPermutations('1')).toEqual(['1'])
    })

    it('returns 2 permutations for 2 unique chars', () => {
        const perms = getPermutations('12')
        expect(perms).toHaveLength(2)
        expect(perms).toContain('12')
        expect(perms).toContain('21')
    })

    it('returns 6 permutations for 3 unique chars', () => {
        const perms = getPermutations('123')
        expect(perms).toHaveLength(6)
        expect(perms).toContain('123')
        expect(perms).toContain('132')
        expect(perms).toContain('213')
        expect(perms).toContain('231')
        expect(perms).toContain('312')
        expect(perms).toContain('321')
    })

    it('returns 3 unique permutations for 3 chars with duplicates (e.g. 112)', () => {
        const perms = getPermutations('112')
        expect(perms).toHaveLength(3)
        expect(perms).toContain('112')
        expect(perms).toContain('121')
        expect(perms).toContain('211')
    })

    it('returns 1 permutation for all-same digits', () => {
        const perms = getPermutations('111')
        expect(perms).toHaveLength(1)
        expect(perms).toContain('111')
    })

    it('returns empty string in array for empty input', () => {
        expect(getPermutations('')).toEqual([''])
    })
})

// ─── getUnique3DigitPermsFrom4 ────────────────────────────────

describe('getUnique3DigitPermsFrom4', () => {
    it('returns correct permutations for "1234"', () => {
        const result = getUnique3DigitPermsFrom4('1234')
        // 4 combinations of 3 from 4, each with 6 permutations = 24 max
        expect(result.length).toBeGreaterThan(0)
        expect(result.length).toBeLessThanOrEqual(24)
        // Should contain some expected values
        expect(result).toContain('123')
        expect(result).toContain('234')
        expect(result).toContain('134')
    })

    it('returns fewer unique results with duplicate digits', () => {
        const result = getUnique3DigitPermsFrom4('1122')
        expect(result.length).toBeGreaterThan(0)
        // Duplicates should be removed
        const uniqueCheck = new Set(result)
        expect(uniqueCheck.size).toBe(result.length)
    })

    it('returns empty array for non-4-digit input', () => {
        expect(getUnique3DigitPermsFrom4('123')).toEqual([])
        expect(getUnique3DigitPermsFrom4('12345')).toEqual([])
        expect(getUnique3DigitPermsFrom4('')).toEqual([])
    })
})

// ─── getUnique3DigitPermsFrom5 ────────────────────────────────

describe('getUnique3DigitPermsFrom5', () => {
    it('returns correct permutations for "12345"', () => {
        const result = getUnique3DigitPermsFrom5('12345')
        expect(result.length).toBeGreaterThan(0)
        // C(5,3) = 10 combinations, each up to 6 perms = max 60
        expect(result.length).toBeLessThanOrEqual(60)
        expect(result).toContain('123')
        expect(result).toContain('345')
    })

    it('handles duplicate digits', () => {
        const result = getUnique3DigitPermsFrom5('11234')
        expect(result.length).toBeGreaterThan(0)
        const uniqueCheck = new Set(result)
        expect(uniqueCheck.size).toBe(result.length)
    })

    it('returns empty array for non-5-digit input', () => {
        expect(getUnique3DigitPermsFrom5('1234')).toEqual([])
        expect(getUnique3DigitPermsFrom5('123456')).toEqual([])
        expect(getUnique3DigitPermsFrom5('')).toEqual([])
    })
})

// ─── getDefaultLimitsForType ──────────────────────────────────

describe('getDefaultLimitsForType', () => {
    it('returns limits for thai lottery', () => {
        const limits = getDefaultLimitsForType('thai')
        expect(limits).toHaveProperty('run_top', 5000)
        expect(limits).toHaveProperty('2_top', 1000)
        expect(limits).toHaveProperty('3_top', 500)
    })

    it('returns limits for lao lottery including 4_set', () => {
        const limits = getDefaultLimitsForType('lao')
        expect(limits).toHaveProperty('4_set', 1)
        expect(limits).toHaveProperty('run_top', 5000)
    })

    it('returns limits for stock lottery', () => {
        const limits = getDefaultLimitsForType('stock')
        expect(Object.keys(limits)).toHaveLength(2)
        expect(limits).toHaveProperty('2_top', 1000)
        expect(limits).toHaveProperty('2_bottom', 1000)
    })

    it('returns empty object for unknown type', () => {
        const limits = getDefaultLimitsForType('unknown')
        expect(limits).toEqual({})
    })
})

// ─── getDefaultSetPricesForType ───────────────────────────────

describe('getDefaultSetPricesForType', () => {
    it('returns set prices for lao (has set types)', () => {
        const setPrices = getDefaultSetPricesForType('lao')
        expect(setPrices).toHaveProperty('4_set', 120)
    })

    it('returns set prices for hanoi (has set types)', () => {
        const setPrices = getDefaultSetPricesForType('hanoi')
        expect(setPrices).toHaveProperty('4_set', 120)
    })

    it('returns empty for thai (no set types)', () => {
        const setPrices = getDefaultSetPricesForType('thai')
        expect(Object.keys(setPrices)).toHaveLength(0)
    })

    it('returns empty for unknown type', () => {
        const setPrices = getDefaultSetPricesForType('unknown')
        expect(Object.keys(setPrices)).toHaveLength(0)
    })
})

// ─── getLotteryTypeKey ────────────────────────────────────────

describe('getLotteryTypeKey', () => {
    it('thai → thai', () => {
        expect(getLotteryTypeKey('thai')).toBe('thai')
    })

    it('lao → lao', () => {
        expect(getLotteryTypeKey('lao')).toBe('lao')
    })

    it('hanoi → lao (shares same settings)', () => {
        expect(getLotteryTypeKey('hanoi')).toBe('lao')
    })

    it('stock → stock', () => {
        expect(getLotteryTypeKey('stock')).toBe('stock')
    })

    it('unknown → thai (default)', () => {
        expect(getLotteryTypeKey('xyz')).toBe('thai')
    })
})

// ─── calculate4SetPrizes ──────────────────────────────────────

describe('calculate4SetPrizes', () => {
    const defaultPrizes = DEFAULT_4_SET_SETTINGS.prizes

    describe('exact match — 4 ตัวตรงชุด', () => {
        it('returns highest prize (4_straight_set = 100,000)', () => {
            const result = calculate4SetPrizes('1234', '1234', defaultPrizes)
            expect(result.totalPrize).toBe(100000)
            expect(result.prizes).toHaveLength(1)
            expect(result.prizes[0].type).toBe('4_straight_set')
        })

        it('also matches 3_straight_set, 2_front_set, 2_back_set as allMatchedPrizes', () => {
            const result = calculate4SetPrizes('1234', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('4_straight_set')
            expect(types).toContain('3_straight_set')
            expect(types).toContain('2_front_set')
            expect(types).toContain('2_back_set')
        })
    })

    describe('4 ตัวโต๊ดชุด — same digits, different order', () => {
        it('returns 4_tod_set when all 4 digits match in different order', () => {
            const result = calculate4SetPrizes('4321', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('4_tod_set')
            // Should NOT have 4_straight_set
            expect(types).not.toContain('4_straight_set')
        })
    })

    describe('3 ตัวตรงชุด — last 3 digits exact match', () => {
        it('returns 3_straight_set when last 3 digits match exactly', () => {
            const result = calculate4SetPrizes('9234', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('3_straight_set')
        })
    })

    describe('3 ตัวโต๊ดชุด — last 3 digits same, different order', () => {
        it('returns 3_tod_set when last 3 digits same but shuffled', () => {
            const result = calculate4SetPrizes('9432', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('3_tod_set')
            expect(types).not.toContain('3_straight_set')
        })
    })

    describe('2 ตัวหน้าชุด — first 2 digits match', () => {
        it('returns 2_front_set when first 2 digits match', () => {
            const result = calculate4SetPrizes('1299', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('2_front_set')
        })
    })

    describe('2 ตัวหลังชุด — last 2 digits match', () => {
        it('returns 2_back_set when last 2 digits match', () => {
            const result = calculate4SetPrizes('9934', '1234', defaultPrizes)
            const types = result.allMatchedPrizes.map(p => p.type)
            expect(types).toContain('2_back_set')
        })
    })

    describe('no match', () => {
        it('returns empty when no prizes match', () => {
            const result = calculate4SetPrizes('5678', '1234', defaultPrizes)
            expect(result.prizes).toHaveLength(0)
            expect(result.totalPrize).toBe(0)
            expect(result.allMatchedPrizes).toHaveLength(0)
        })
    })

    describe('highest-prize-only rule', () => {
        it('prizes array only contains the single highest prize', () => {
            // Exact match gives multiple matches but prizes[] should have only 1
            const result = calculate4SetPrizes('1234', '1234', defaultPrizes)
            expect(result.prizes).toHaveLength(1)
            expect(result.prizes[0].amount).toBe(100000)
            // But allMatchedPrizes has all of them
            expect(result.allMatchedPrizes.length).toBeGreaterThan(1)
        })
    })

    describe('invalid input', () => {
        it('returns empty for null betNumber', () => {
            const result = calculate4SetPrizes(null, '1234', defaultPrizes)
            expect(result.totalPrize).toBe(0)
        })

        it('returns empty for wrong length', () => {
            const result = calculate4SetPrizes('123', '1234', defaultPrizes)
            expect(result.totalPrize).toBe(0)
        })

        it('returns empty for null winningNumber', () => {
            const result = calculate4SetPrizes('1234', null, defaultPrizes)
            expect(result.totalPrize).toBe(0)
        })

        it('returns empty for empty strings', () => {
            const result = calculate4SetPrizes('', '', defaultPrizes)
            expect(result.totalPrize).toBe(0)
        })
    })

    describe('custom prize settings', () => {
        it('uses custom prize amounts when provided', () => {
            const customPrizes = {
                '4_straight_set': 200000,
                '4_tod_set': 8000,
                '3_straight_set': 60000,
                '3_tod_set': 6000,
                '2_front_set': 2000,
                '2_back_set': 2000
            }
            const result = calculate4SetPrizes('1234', '1234', customPrizes)
            expect(result.totalPrize).toBe(200000)
        })
    })
})

// ─── generateBatchId ──────────────────────────────────────────

describe('generateBatchId', () => {
    it('returns a string in UUID v4 format', () => {
        const id = generateBatchId()
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateBatchId()))
        expect(ids.size).toBe(100)
    })
})

// ─── Data integrity checks ───────────────────────────────────

describe('constants integrity', () => {
    it('PERMUTATION_BET_TYPES contains expected types', () => {
        expect(PERMUTATION_BET_TYPES).toContain('2_run')
        expect(PERMUTATION_BET_TYPES).toContain('3_tod')
        expect(PERMUTATION_BET_TYPES).toContain('4_float')
        expect(PERMUTATION_BET_TYPES).toContain('5_float')
        // Should NOT contain ordered types
        expect(PERMUTATION_BET_TYPES).not.toContain('2_top')
        expect(PERMUTATION_BET_TYPES).not.toContain('3_top')
    })

    it('BET_TYPES has labels for all common bet types', () => {
        expect(BET_TYPES['run_top']).toBe('วิ่งบน')
        expect(BET_TYPES['2_top']).toBe('2 ตัวบน')
        expect(BET_TYPES['3_top']).toBe('3 ตัวบน')
        expect(BET_TYPES['3_tod']).toBe('3 ตัวโต๊ด')
    })

    it('BET_TYPES_BY_LOTTERY has entries for all 4 lottery types', () => {
        expect(BET_TYPES_BY_LOTTERY).toHaveProperty('thai')
        expect(BET_TYPES_BY_LOTTERY).toHaveProperty('lao')
        expect(BET_TYPES_BY_LOTTERY).toHaveProperty('hanoi')
        expect(BET_TYPES_BY_LOTTERY).toHaveProperty('stock')
    })
})
