import { describe, it, expect } from 'vitest'
import NumberLimitsModal, { generateReversedNumbers } from '../NumberLimitsModal'

describe('NumberLimitsModal', () => {
    it('should export the component and helper correctly', () => {
        expect(NumberLimitsModal).toBeDefined()
        expect(typeof NumberLimitsModal).toBe('function')
        expect(generateReversedNumbers).toBeDefined()
    })

    describe('generateReversedNumbers', () => {
        it('returns empty array for empty, null, or single digit numbers', () => {
            expect(generateReversedNumbers('')).toEqual([])
            expect(generateReversedNumbers(null)).toEqual([])
            expect(generateReversedNumbers(undefined)).toEqual([])
            expect(generateReversedNumbers('5')).toEqual([])
        })

        it('generates correct reversed numbers for 2-digit number excluding original', () => {
            const rev2 = generateReversedNumbers('12')
            expect(rev2).toEqual(['21'])
        })

        it('returns empty array for double numbers like 11', () => {
            const revDouble = generateReversedNumbers('11')
            expect(revDouble).toEqual([])
        })

        it('generates all 5 permutations for 3 distinct digits (e.g. 123)', () => {
            const rev3 = generateReversedNumbers('123')
            expect(rev3.length).toBe(5)
            expect(rev3).not.toContain('123')
            expect(rev3.sort()).toEqual(['132', '213', '231', '312', '321'].sort())
        })

        it('generates correct permutations for 3 digits with duplicates (e.g. 112)', () => {
            const revD = generateReversedNumbers('112')
            expect(revD.length).toBe(2)
            expect(revD).not.toContain('112')
            expect(revD.sort()).toEqual(['121', '211'].sort())
        })
    })
})
