import { describe, it, expect } from 'vitest'
import {
    getNumberDomainForCategory,
    mapBetTypeToCategory,
    groupItemsByNumber,
    evaluateLineCut,
    calculateGraphCuts,
    aggregateStagedLayoffItems
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
})
