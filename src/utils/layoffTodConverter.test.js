import { describe, it, expect } from 'vitest'
import {
    get3DigitPermutations,
    convertTodItemToTopItems,
    mergeTodToTopExcessItems,
    encodeTodConversionNote,
    parseTodConversionNote
} from './layoffTodConverter'

describe('layoffTodConverter', () => {
    describe('get3DigitPermutations', () => {
        it('should return 6 permutations for unique 3 digits', () => {
            const perms = get3DigitPermutations('123')
            expect(perms).toHaveLength(6)
            expect(perms.sort()).toEqual(['123', '132', '213', '231', '312', '321'].sort())
        })

        it('should return 3 permutations for double digits', () => {
            const perms = get3DigitPermutations('122')
            expect(perms).toHaveLength(3)
            expect(perms.sort()).toEqual(['122', '212', '221'].sort())
        })

        it('should return 1 permutation for triple digits', () => {
            const perms = get3DigitPermutations('111')
            expect(perms).toHaveLength(1)
            expect(perms).toEqual(['111'])
        })

        it('should fallback to original string if not 3 digits', () => {
            expect(get3DigitPermutations('25')).toEqual(['25'])
        })
    })

    describe('convertTodItemToTopItems', () => {
        it('should divide excess amount and ceil correctly (exact division)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 6
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.bet_type).toBe('3_top')
                expect(item.excess).toBe(1)
                expect(item.isConvertedFromTod).toBe(true)
                expect(item.originalTodNumbers).toBe('123')
                expect(item.originalTodExcess).toBe(6)
            })
        })

        it('should apply Math.ceil when excess is not evenly divisible (123=5 -> 1 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 5
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(1) // Math.ceil(5/6) = 1
            })
        })

        it('should apply Math.ceil for double digits (122=25 -> 9 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '122',
                excess: 25
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(3)
            converted.forEach(item => {
                expect(item.excess).toBe(9) // Math.ceil(25/3) = 9
            })
        })

        it('should calculate for screenshot example (123=200 -> 34 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 200
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(34) // Math.ceil(200/6) = 34
            })
        })
    })

    describe('mergeTodToTopExcessItems (Approach A)', () => {
        it('should merge converted item with existing 3_top item of same number', () => {
            const excessItems = [
                { bet_type: '2_top', numbers: '25', excess: 1000 },
                { bet_type: '3_tod', numbers: '123', excess: 200 },
                { bet_type: '3_top', numbers: '123', excess: 380 }
            ]
            const merged = mergeTodToTopExcessItems(excessItems)
            
            // 2_top stays untouched
            expect(merged.find(i => i.bet_type === '2_top' && i.numbers === '25')).toBeDefined()
            // 3_tod is removed/converted
            expect(merged.find(i => i.bet_type === '3_tod')).toBeUndefined()
            
            // 123 3_top is merged
            const item123 = merged.find(i => i.bet_type === '3_top' && i.numbers === '123')
            expect(item123).toBeDefined()
            expect(item123.excess).toBe(414) // 380 + 34
            expect(item123.isMergedWithTod).toBe(true)
            expect(item123.originalTopExcess).toBe(380)
            expect(item123.convertedTodExcess).toBe(34)
            expect(item123.originalTodNumbers).toBe('123')
            expect(item123.originalTodFullExcess).toBe(200)

            // other permutations are separate standalone 3_top items
            const item132 = merged.find(i => i.bet_type === '3_top' && i.numbers === '132')
            expect(item132).toBeDefined()
            expect(item132.excess).toBe(34)
            expect(item132.isConvertedFromTod).toBe(true)
        })
    })

    describe('encodeTodConversionNote & parseTodConversionNote', () => {
        it('should encode and decode metadata correctly', () => {
            const item = {
                isConvertedFromTod: true,
                originalTodNumbers: '123',
                originalTodExcess: 200,
                convertedTodExcess: 34,
                isMergedWithTod: true,
                originalTopExcess: 380
            }
            const note = encodeTodConversionNote(item, 'ส่งเจ้ามือใหญ่')
            expect(note).toContain('[TOD_CONV:')
            expect(note).toContain('ส่งเจ้ามือใหญ่')

            const parsed = parseTodConversionNote(note)
            expect(parsed).toBeDefined()
            expect(parsed.originalTodNumbers).toBe('123')
            expect(parsed.originalTodExcess).toBe(200)
            expect(parsed.isMergedWithTod).toBe(true)
            expect(parsed.userNote).toBe('ส่งเจ้ามือใหญ่')
        })
    })
})
