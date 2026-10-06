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

    describe('batch adjust by bet types filtering logic', () => {
        const mockLimits = [
            { id: '1', numbers: '123', bet_type: '3_top', max_amount: 500 },
            { id: '2', numbers: '123', bet_type: '3_tod', max_amount: 1000 },
            { id: '3', numbers: '25', bet_type: '2_top', max_amount: 2000 },
            { id: '4', numbers: '25', bet_type: '2_bottom', max_amount: 2000 },
            { id: '5', numbers: '52', bet_type: '2_top', max_amount: 2000 },
            { id: '6', numbers: '52', bet_type: '2_bottom', max_amount: 2000 }
        ]

        it('should correctly filter target limits matching selected bet types (3_top, 3_tod, 2_top)', () => {
            const selectedTypes = ['3_top', '3_tod', '2_top']
            const targetItems = mockLimits.filter(l => selectedTypes.includes(l.bet_type))
            expect(targetItems.length).toBe(4) // 123 3_top, 123 3_tod, 25 2_top, 52 2_top
            expect(targetItems.map(i => i.id)).toEqual(['1', '2', '3', '5'])
            // 2_bottom items (id 4, 6) are untouched
            expect(mockLimits.filter(l => !selectedTypes.includes(l.bet_type)).map(i => i.id)).toEqual(['4', '6'])
        })

        it('should extract existing bet types with counts correctly', () => {
            const counts = {}
            mockLimits.forEach(l => {
                counts[l.bet_type] = (counts[l.bet_type] || 0) + 1
            })
            expect(counts).toEqual({
                '3_top': 1,
                '3_tod': 1,
                '2_top': 2,
                '2_bottom': 2
            })
        })
    })
})
