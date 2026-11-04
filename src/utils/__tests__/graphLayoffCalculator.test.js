import { describe, it, expect } from 'vitest'
import {
    getNumberDomainForCategory,
    mapBetTypeToCategory,
    groupItemsByNumber,
    evaluateLineCut,
    calculateGraphCuts,
    aggregateStagedLayoffItems,
    getAvailableItemsAfterStaging
} from '../graphLayoffCalculator'

describe('graphLayoffCalculator', () => {
    describe('getNumberDomainForCategory', () => {
        it('returns 1000 items from 000 to 999 for 3_digit', () => {
            const domain = getNumberDomainForCategory('3_digit')
            expect(domain).toHaveLength(1000)
            expect(domain[0]).toBe('000')
            expect(domain[999]).toBe('999')
        })

        it('returns 100 items from 00 to 99 for 2_digit', () => {
            const domain = getNumberDomainForCategory('2_digit')
            expect(domain).toHaveLength(100)
            expect(domain[0]).toBe('00')
            expect(domain[99]).toBe('99')
        })

        it('returns 10 items from 0 to 9 for run', () => {
            const domain = getNumberDomainForCategory('run')
            expect(domain).toHaveLength(10)
            expect(domain[0]).toBe('0')
            expect(domain[9]).toBe('9')
        })
    })

    describe('mapBetTypeToCategory', () => {
        it('maps 3-digit bet types correctly', () => {
            expect(mapBetTypeToCategory('3_top')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_tod')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_bottom')).toBe('3_digit')
            expect(mapBetTypeToCategory('3_front')).toBe('3_digit')
        })

        it('maps 2-digit bet types correctly', () => {
            expect(mapBetTypeToCategory('2_top')).toBe('2_digit')
            expect(mapBetTypeToCategory('2_bottom')).toBe('2_digit')
        })

        it('maps run bet types correctly', () => {
            expect(mapBetTypeToCategory('run_top')).toBe('run')
            expect(mapBetTypeToCategory('run_bottom')).toBe('run')
        })
    })

    describe('groupItemsByNumber', () => {
        it('groups and sums items with identical numbers in the same category', () => {
            const items = [
                { numbers: '25', bet_type: '2_top', excess: 100 },
                { numbers: '25', bet_type: '2_bottom', excess: 50 },
                { numbers: '99', bet_type: '2_top', excess: 200 },
                { numbers: '123', bet_type: '3_top', excess: 500 } // different category
            ]
            const grouped = groupItemsByNumber(items, '2_digit')
            expect(grouped['25']).toBeDefined()
            expect(grouped['25'].totalAmount).toBe(150)
            expect(grouped['25'].items).toHaveLength(2)
            expect(grouped['99'].totalAmount).toBe(200)
            expect(grouped['123']).toBeUndefined()
        })
    })

    describe('evaluateLineCut (1 line)', () => {
        it('cuts above line with difference mode', () => {
            // amount = 500, line = 350 -> cut 150, keep 350
            const res = evaluateLineCut({
                amount: 500,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(150)
            expect(res.retainedAmount).toBe(350)
        })

        it('cuts above line with full amount mode', () => {
            // amount = 500, line = 350 -> cut 500, keep 0
            const res = evaluateLineCut({
                amount: 500,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(500)
            expect(res.retainedAmount).toBe(0)
        })

        it('ignores amount below line when mode is above', () => {
            const res = evaluateLineCut({
                amount: 300,
                lineCount: 1,
                singleLine: 350,
                cutMode: 'above',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(false)
            expect(res.cutAmount).toBe(0)
            expect(res.retainedAmount).toBe(300)
        })

        it('cuts below line with full amount mode', () => {
            // amount = 100, line = 200 -> cut 100
            const res = evaluateLineCut({
                amount: 100,
                lineCount: 1,
                singleLine: 200,
                cutMode: 'below',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(100)
            expect(res.retainedAmount).toBe(0)
        })
    })

    describe('evaluateLineCut (2 lines)', () => {
        it('cuts between lines with difference mode', () => {
            // lower = 100, upper = 400, amount = 250 -> cut (250 - 100) = 150
            const res = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'between',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(150)
            expect(res.retainedAmount).toBe(100)
        })

        it('cuts between lines with full amount mode', () => {
            const res = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'between',
                amountMode: 'full'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(250)
            expect(res.retainedAmount).toBe(0)
        })

        it('cuts outside lines (both above upper and below lower)', () => {
            // Case A: above upper (500 > 400)
            const resA = evaluateLineCut({
                amount: 500,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(resA.isMatched).toBe(true)
            expect(resA.cutAmount).toBe(100) // 500 - 400

            // Case B: below lower (80 < 100)
            const resB = evaluateLineCut({
                amount: 80,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'full'
            })
            expect(resB.isMatched).toBe(true)
            expect(resB.cutAmount).toBe(80)

            // Case C: between lines (250) -> not matched
            const resC = evaluateLineCut({
                amount: 250,
                lineCount: 2,
                lowerLine: 100,
                upperLine: 400,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(resC.isMatched).toBe(false)
            expect(resC.cutAmount).toBe(0)
        })
    })

    describe('calculateGraphCuts', () => {
        it('calculates cuts across multiple buckets and allocates cuts sequentially', () => {
            const buckets = {
                '25': {
                    numbers: '25',
                    totalAmount: 300,
                    items: [
                        { numbers: '25', bet_type: '2_top', excess: 200 },
                        { numbers: '25', bet_type: '2_bottom', excess: 100 }
                    ]
                },
                '50': {
                    numbers: '50',
                    totalAmount: 100,
                    items: [
                        { numbers: '50', bet_type: '2_top', excess: 100 }
                    ]
                }
            }
            const result = calculateGraphCuts({
                buckets,
                lineCount: 1,
                singleLine: 150,
                cutMode: 'above',
                amountMode: 'difference'
            })
            expect(result.matchedNumbersCount).toBe(1)
            expect(result.totalCutAmount).toBe(150)
            expect(result.cutItems).toHaveLength(1)
            expect(result.cutItems[0].numbers).toBe('25')
            expect(result.cutItems[0].excess).toBe(150)
            expect(result.cutItems[0].originalExcess).toBe(200)
            expect(result.cutItems[0].cutFromGraph).toBe(true)
        })
    })

    describe('aggregateStagedLayoffItems', () => {
        it('merges new cuts with existing basket summing amounts for identical numbers and bet types', () => {
            const existingBasket = [
                { numbers: '872', bet_type: '3_top', excess: 100, display_bet_type: '3 ตัวบน' },
                { numbers: '25', bet_type: '2_top', excess: 50, display_bet_type: '2 ตัวบน' }
            ]
            const newCuts = [
                { numbers: '872', bet_type: '3_top', excess: 50, display_bet_type: '3 ตัวบน' }, // repeat
                { numbers: '99', bet_type: '2_bottom', excess: 200, display_bet_type: '2 ตัวล่าง' } // new
            ]

            const merged = aggregateStagedLayoffItems(existingBasket, newCuts)
            expect(merged).toHaveLength(3)

            const item872 = merged.find(i => i.numbers === '872' && i.bet_type === '3_top')
            expect(item872.excess).toBe(150)

            const item25 = merged.find(i => i.numbers === '25')
            expect(item25.excess).toBe(50)

            const item99 = merged.find(i => i.numbers === '99')
            expect(item99.excess).toBe(200)
        })
    })

    describe('getAvailableItemsAfterStaging', () => {
        const originalItems = [
            { numbers: '101', bet_type: '3_top', excess: 100 },
            { numbers: '202', bet_type: '3_top', excess: 50 },
            { numbers: '303', bet_type: '3_top', excess: 80 }
        ]

        it('returns original items if stagedBasket is empty', () => {
            const result = getAvailableItemsAfterStaging(originalItems, [])
            expect(result).toHaveLength(3)
            expect(result[0].excess).toBe(100)
        })

        it('deducts staged amount and reduces available height', () => {
            // Cut 20 from '101' (reducing from 100 to 80)
            const stagedBasket = [
                { numbers: '101', bet_type: '3_top', excess: 20 }
            ]
            const result = getAvailableItemsAfterStaging(originalItems, stagedBasket)
            expect(result).toHaveLength(3)

            const item101 = result.find(i => i.numbers === '101')
            expect(item101.excess).toBe(80)
            expect(item101.totalAmount).toBe(80)

            // Other items remain unchanged
            const item202 = result.find(i => i.numbers === '202')
            expect(item202.excess).toBe(50)
        })

        it('completely removes items whose amount is fully staged', () => {
            // Cut all 50 from '202'
            const stagedBasket = [
                { numbers: '202', bet_type: '3_top', excess: 50 }
            ]
            const result = getAvailableItemsAfterStaging(originalItems, stagedBasket)
            expect(result).toHaveLength(2)
            expect(result.some(i => i.numbers === '202')).toBe(false)
        })

        it('prevents repeated cut when line stays at the same threshold', () => {
            // 1. Initial state: line at 80, cutting above difference
            const buckets1 = groupItemsByNumber(originalItems, '3_digit')
            const cut1 = calculateGraphCuts({
                buckets: buckets1,
                lineCount: 1,
                singleLine: 80,
                cutMode: 'above',
                amountMode: 'difference'
            })
            // Only '101' has 100 > 80, so cutAmount is 20
            expect(cut1.matchedNumbersCount).toBe(1)
            expect(cut1.totalCutAmount).toBe(20)

            // 2. Stage into basket
            const stagedBasket = aggregateStagedLayoffItems([], cut1.cutItems)
            expect(stagedBasket).toHaveLength(1)
            expect(stagedBasket[0].excess).toBe(20)

            // 3. Re-calculate available items after staging
            const availableItems = getAvailableItemsAfterStaging(originalItems, stagedBasket)
            const buckets2 = groupItemsByNumber(availableItems, '3_digit')

            // Number 101 now has 80 (capped at line 80)
            expect(buckets2['101'].totalAmount).toBe(80)

            // 4. Re-evaluating cut at line 80
            const cut2 = calculateGraphCuts({
                buckets: buckets2,
                lineCount: 1,
                singleLine: 80,
                cutMode: 'above',
                amountMode: 'difference'
            })
            // Nothing exceeds 80 anymore! Matched count is 0, total cut amount is 0!
            expect(cut2.matchedNumbersCount).toBe(0)
            expect(cut2.totalCutAmount).toBe(0)
            expect(cut2.cutItems).toHaveLength(0)
        })
    })
})
