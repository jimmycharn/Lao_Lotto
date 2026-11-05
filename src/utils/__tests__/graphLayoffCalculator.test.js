import { describe, it, expect } from 'vitest'
import {
    getNumberDomainForCategory,
    mapBetTypeToCategory,
    groupItemsByNumber,
    evaluateLineCut,
    calculateGraphCuts,
    aggregateStagedLayoffItems,
    getAvailableItemsAfterStaging,
    getGraphBetTypesByCategory,
    isBetTypeMatchingFilter,
    sortBasketItems
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

    describe('getGraphBetTypesByCategory', () => {
        it('returns 3-digit bet types including 3_bottom for thai lottery', () => {
            const types = getGraphBetTypesByCategory('3_digit', 'thai')
            expect(types.map(t => t.id)).toEqual(['3_top', '3_tod', '3_bottom', '3_all'])
            expect(types.find(t => t.id === '3_top').label).toContain('3 ตัวบน')
        })

        it('omits 3_bottom for lao lottery if no 3_bottom items exist', () => {
            const types = getGraphBetTypesByCategory('3_digit', 'lao', [])
            expect(types.map(t => t.id)).toEqual(['3_top', '3_tod', '3_all'])
        })

        it('includes 3_bottom for lao lottery if items contain 3_bottom', () => {
            const items = [{ bet_type: '3_bottom', numbers: '123' }]
            const types = getGraphBetTypesByCategory('3_digit', 'lao', items)
            expect(types.map(t => t.id)).toContain('3_bottom')
        })

        it('returns all 5 2-digit bet types plus all option', () => {
            const types = getGraphBetTypesByCategory('2_digit', 'thai')
            expect(types.map(t => t.id)).toEqual(['2_top', '2_front', '2_center', '2_bottom', '2_run', '2_all'])
        })

        it('returns all 7 1-digit bet types plus all option', () => {
            const types = getGraphBetTypesByCategory('run', 'thai')
            expect(types.map(t => t.id)).toEqual([
                'run_top',
                'run_bottom',
                'front_top_1',
                'middle_top_1',
                'back_top_1',
                'front_bottom_1',
                'back_bottom_1',
                'run_all'
            ])
        })
    })

    describe('isBetTypeMatchingFilter', () => {
        it('matches canonical and aliases', () => {
            expect(isBetTypeMatchingFilter('3_top', '3_top')).toBe(true)
            expect(isBetTypeMatchingFilter('3_straight', '3_top')).toBe(true)
            expect(isBetTypeMatchingFilter('3_tod', '3_top')).toBe(false)
            expect(isBetTypeMatchingFilter('2_spread', '2_center')).toBe(true)
            expect(isBetTypeMatchingFilter('2_tang', '2_center')).toBe(true)
            expect(isBetTypeMatchingFilter('2_top_rev', '2_top')).toBe(true)
            expect(isBetTypeMatchingFilter('1_top', 'run_top')).toBe(true)
        })

        it('matches category all options strictly by category', () => {
            // 3_all matches 3-digit only
            expect(isBetTypeMatchingFilter('3_top', '3_all')).toBe(true)
            expect(isBetTypeMatchingFilter('3_tod', '3_all')).toBe(true)
            expect(isBetTypeMatchingFilter('2_top', '3_all')).toBe(false)
            expect(isBetTypeMatchingFilter('run_top', '3_all')).toBe(false)

            // 2_all matches 2-digit only
            expect(isBetTypeMatchingFilter('2_top', '2_all')).toBe(true)
            expect(isBetTypeMatchingFilter('2_bottom', '2_all')).toBe(true)
            expect(isBetTypeMatchingFilter('3_top', '2_all')).toBe(false)
            expect(isBetTypeMatchingFilter('run_top', '2_all')).toBe(false)

            // run_all matches run only
            expect(isBetTypeMatchingFilter('run_top', 'run_all')).toBe(true)
            expect(isBetTypeMatchingFilter('front_top_1', 'run_all')).toBe(true)
            expect(isBetTypeMatchingFilter('2_top', 'run_all')).toBe(false)
            expect(isBetTypeMatchingFilter('3_top', 'run_all')).toBe(false)

            // null matches all
            expect(isBetTypeMatchingFilter('2_bottom', null)).toBe(true)
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

        it('filters by specific bet type within a category when filterBetType is specified', () => {
            const items = [
                { numbers: '123', bet_type: '3_top', excess: 300 },
                { numbers: '123', bet_type: '3_tod', excess: 100 },
                { numbers: '456', bet_type: '3_tod', excess: 200 }
            ]
            // Filter only 3_top
            const topGrouped = groupItemsByNumber(items, '3_digit', '3_top')
            expect(topGrouped['123'].totalAmount).toBe(300)
            expect(topGrouped['456']).toBeUndefined()

            // Filter only 3_tod
            const todGrouped = groupItemsByNumber(items, '3_digit', '3_tod')
            expect(todGrouped['123'].totalAmount).toBe(100)
            expect(todGrouped['456'].totalAmount).toBe(200)

            // Filter 3_all
            const allGrouped = groupItemsByNumber(items, '3_digit', '3_all')
            expect(allGrouped['123'].totalAmount).toBe(400)
            expect(allGrouped['456'].totalAmount).toBe(200)
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
        it('cuts between lines with difference mode when amount is within range', () => {
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

        it('cuts slice between lines when amount exceeds upper line (User scenario: 011=100, upper=80, lower=60)', () => {
            // 011 = 100, upper = 80, lower = 60
            // Slice between 60 and 80 is 20. Cut = 20, Retained = 80 (60 bottom + 20 top)
            const res = evaluateLineCut({
                amount: 100,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'between',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(20)
            expect(res.retainedAmount).toBe(80)
        })

        it('does not cut when amount is below lower line in between mode', () => {
            const res = evaluateLineCut({
                amount: 50,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'between',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(false)
            expect(res.cutAmount).toBe(0)
            expect(res.retainedAmount).toBe(50)
        })

        it('cuts between lines with full amount mode only when amount is within range', () => {
            const resWithin = evaluateLineCut({
                amount: 70,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'between',
                amountMode: 'full'
            })
            expect(resWithin.isMatched).toBe(true)
            expect(resWithin.cutAmount).toBe(70)
            expect(resWithin.retainedAmount).toBe(0)

            const resExceed = evaluateLineCut({
                amount: 100,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'between',
                amountMode: 'full'
            })
            expect(resExceed.isMatched).toBe(false)
            expect(resExceed.cutAmount).toBe(0)
            expect(resExceed.retainedAmount).toBe(100)
        })

        it('cuts outside lines (both above upper and below lower) in difference mode (User scenario: 011=100, upper=80, lower=60)', () => {
            // 011 = 100, upper = 80, lower = 60
            // Cut above 80 = 20. Cut below 60 = 60. Total cut = 80. Retained = 20.
            const res = evaluateLineCut({
                amount: 100,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(80)
            expect(res.retainedAmount).toBe(20)
        })

        it('cuts outside lines when amount is below lower line in difference mode', () => {
            // amount = 50, lower = 60, upper = 80 -> entire 50 is below 60
            const res = evaluateLineCut({
                amount: 50,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(50)
            expect(res.retainedAmount).toBe(0)
        })

        it('cuts outside lines when amount is between lines in difference mode (cuts portion below lower)', () => {
            // amount = 70, lower = 60, upper = 80 -> portion below 60 is 60, portion above 80 is 0. Cut = 60, Retained = 10.
            const res = evaluateLineCut({
                amount: 70,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(res.isMatched).toBe(true)
            expect(res.cutAmount).toBe(60)
            expect(res.retainedAmount).toBe(10)
        })

        it('cuts outside lines with full amount mode', () => {
            // Case A: above upper (100 > 80)
            const resA = evaluateLineCut({
                amount: 100,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'full'
            })
            expect(resA.isMatched).toBe(true)
            expect(resA.cutAmount).toBe(100)
            expect(resA.retainedAmount).toBe(0)

            // Case B: below lower (50 < 60)
            const resB = evaluateLineCut({
                amount: 50,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'full'
            })
            expect(resB.isMatched).toBe(true)
            expect(resB.cutAmount).toBe(50)
            expect(resB.retainedAmount).toBe(0)

            // Case C: within range (70 in [60, 80]) -> not matched in full mode
            const resC = evaluateLineCut({
                amount: 70,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'full'
            })
            expect(resC.isMatched).toBe(false)
            expect(resC.cutAmount).toBe(0)
            expect(resC.retainedAmount).toBe(70)
        })

        it('correctly handles staged amounts to prevent double cutting at the same lines', () => {
            // User cut 20 in between mode (orig 100, staged 20, remaining 80)
            const resBetween = evaluateLineCut({
                amount: 80,
                originalAmount: 100,
                stagedAmount: 20,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'between',
                amountMode: 'difference'
            })
            expect(resBetween.isMatched).toBe(false)
            expect(resBetween.cutAmount).toBe(0)
            expect(resBetween.retainedAmount).toBe(80)

            // User cut 80 in outside mode (orig 100, staged 80, remaining 20)
            const resOutside = evaluateLineCut({
                amount: 20,
                originalAmount: 100,
                stagedAmount: 80,
                lineCount: 2,
                lowerLine: 60,
                upperLine: 80,
                cutMode: 'outside',
                amountMode: 'difference'
            })
            expect(resOutside.isMatched).toBe(false)
            expect(resOutside.cutAmount).toBe(0)
            expect(resOutside.retainedAmount).toBe(20)
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

    describe('sortBasketItems', () => {
        const testBasket = [
            { numbers: '110', bet_type: '3_top', excess: 30 },
            { numbers: '101', bet_type: '3_top', excess: 30 },
            { numbers: '107', bet_type: '3_top', excess: 10 },
            { numbers: '103', bet_type: '3_top', excess: 50 },
            { numbers: '111', bet_type: '3_top', excess: 20 }
        ]

        it('sorts by numbers ascending by default', () => {
            const sorted = sortBasketItems(testBasket, 'number', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['101', '103', '107', '110', '111'])
        })

        it('sorts by numbers descending', () => {
            const sorted = sortBasketItems(testBasket, 'number', 'desc')
            expect(sorted.map(i => i.numbers)).toEqual(['111', '110', '107', '103', '101'])
        })

        it('sorts by cut amount (excess) descending', () => {
            const sorted = sortBasketItems(testBasket, 'amount', 'desc')
            // excess: 50 (103), 30 (101), 30 (110), 20 (111), 10 (107)
            expect(sorted.map(i => `${i.numbers}:${i.excess}`)).toEqual([
                '103:50',
                '101:30',
                '110:30',
                '111:20',
                '107:10'
            ])
        })

        it('sorts by cut amount (excess) ascending', () => {
            const sorted = sortBasketItems(testBasket, 'amount', 'asc')
            // excess: 10 (107), 20 (111), 30 (101), 30 (110), 50 (103)
            expect(sorted.map(i => `${i.numbers}:${i.excess}`)).toEqual([
                '107:10',
                '111:20',
                '101:30',
                '110:30',
                '103:50'
            ])
        })

        it('handles empty or single item arrays safely', () => {
            expect(sortBasketItems([])).toEqual([])
            expect(sortBasketItems(null)).toEqual([])
            expect(sortBasketItems([{ numbers: '99', excess: 10 }])).toEqual([{ numbers: '99', excess: 10 }])
        })

        it('handles mixed digit lengths in numeric order', () => {
            const mixed = [
                { numbers: '100', excess: 10 },
                { numbers: '05', excess: 10 },
                { numbers: '9', excess: 10 },
                { numbers: '25', excess: 10 }
            ]
            const sorted = sortBasketItems(mixed, 'number', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['9', '05', '25', '100'])
        })
    })
})
