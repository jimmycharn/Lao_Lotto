import { describe, it, expect } from 'vitest'
import { sortRemainingItems, sortTransferModalItems } from '../remainingSortHelper'

describe('sortRemainingItems', () => {
    const mockItems = [
        { numbers: '45', bet_type: '2_top', totalAmount: 100, remainingAmount: 50 },
        { numbers: '123', bet_type: '3_top', totalAmount: 500, remainingAmount: 200 },
        { numbers: '012', bet_type: '3_top', totalAmount: 300, remainingAmount: 200 },
        { numbers: '78', bet_type: '2_top', totalAmount: 200, remainingAmount: 10 },
        { numbers: '999', bet_type: '3_top', totalAmount: 1000, remainingAmount: 500 }
    ]

    describe('Sort by number', () => {
        it('sorts numbers ascending: shorter length first, then numeric value', () => {
            const sorted = sortRemainingItems(mockItems, 'number', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['45', '78', '012', '123', '999'])
        })

        it('sorts numbers descending: longer length first, then numeric value descending', () => {
            const sorted = sortRemainingItems(mockItems, 'number', 'desc')
            expect(sorted.map(i => i.numbers)).toEqual(['999', '123', '012', '78', '45'])
        })
    })

    describe('Sort by remaining amount', () => {
        it('sorts by remainingAmount descending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'remaining', 'desc')
            // 500 (999), 200 (012, 123), 50 (45), 10 (78)
            expect(sorted.map(i => i.numbers)).toEqual(['999', '012', '123', '45', '78'])
        })

        it('sorts by remainingAmount ascending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'remaining', 'asc')
            // 10 (78), 50 (45), 200 (012, 123), 500 (999)
            expect(sorted.map(i => i.numbers)).toEqual(['78', '45', '012', '123', '999'])
        })
    })

    describe('Sort by total amount', () => {
        it('sorts by totalAmount descending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'total', 'desc')
            // 1000 (999), 500 (123), 300 (012), 200 (78), 100 (45)
            expect(sorted.map(i => i.numbers)).toEqual(['999', '123', '012', '78', '45'])
        })

        it('sorts by totalAmount ascending with number tie-breaker', () => {
            const sorted = sortRemainingItems(mockItems, 'total', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['45', '78', '012', '123', '999'])
        })
    })

    describe('Edge cases', () => {
        it('handles empty or non-array inputs gracefully', () => {
            expect(sortRemainingItems(null, 'number', 'asc')).toEqual([])
            expect(sortRemainingItems([], 'number', 'asc')).toEqual([])
        })

        it('handles items with missing or non-numeric amounts', () => {
            const itemsWithNaN = [
                { numbers: '11', remainingAmount: null },
                { numbers: '22', remainingAmount: '20' }
            ]
            const sorted = sortRemainingItems(itemsWithNaN, 'remaining', 'desc')
            expect(sorted[0].numbers).toBe('22')
            expect(sorted[1].numbers).toBe('11')
        })
    })
})

describe('sortTransferModalItems', () => {
    const mockModalItems = [
        { numbers: '369', bet_type: '3_top', excess: 50, originalRemaining: 175 },
        { numbers: '643', bet_type: '3_top', excess: 100, originalRemaining: 175 },
        { numbers: '396', bet_type: '3_top', excess: 50, originalRemaining: 176 },
        { numbers: '685', bet_type: '3_top', excess: 200, originalRemaining: 176 },
        { numbers: '05', bet_type: '2_top', excess: 30, originalRemaining: 50 }
    ]

    describe('Sort by number', () => {
        it('sorts numbers ascending: shorter length first, then numeric value', () => {
            const sorted = sortTransferModalItems(mockModalItems, 'number', 'asc')
            expect(sorted.map(i => i.numbers)).toEqual(['05', '369', '396', '643', '685'])
        })

        it('sorts numbers descending: longer length first, then numeric value descending', () => {
            const sorted = sortTransferModalItems(mockModalItems, 'number', 'desc')
            expect(sorted.map(i => i.numbers)).toEqual(['685', '643', '396', '369', '05'])
        })

        it('uses displayNumbers when present (e.g. converted tod permutations)', () => {
            const itemsWithDisplay = [
                { numbers: '123', displayNumbers: '321', excess: 50 },
                { numbers: '999', displayNumbers: '111', excess: 50 }
            ]
            const sorted = sortTransferModalItems(itemsWithDisplay, 'number', 'asc')
            expect(sorted.map(i => i.displayNumbers)).toEqual(['111', '321'])
        })
    })

    describe('Sort by amount (excess)', () => {
        it('sorts by excess amount descending with number tie-breaker', () => {
            const sorted = sortTransferModalItems(mockModalItems, 'amount', 'desc')
            // excess: 200 (685), 100 (643), 50 (369, 396 -> 369 before 396), 30 (05)
            expect(sorted.map(i => i.numbers)).toEqual(['685', '643', '369', '396', '05'])
        })

        it('sorts by excess amount ascending with number tie-breaker', () => {
            const sorted = sortTransferModalItems(mockModalItems, 'amount', 'asc')
            // excess: 30 (05), 50 (369, 396 -> 369 before 396), 100 (643), 200 (685)
            expect(sorted.map(i => i.numbers)).toEqual(['05', '369', '396', '643', '685'])
        })
    })

    describe('Edge cases', () => {
        it('handles null, undefined or empty array', () => {
            expect(sortTransferModalItems(null)).toEqual([])
            expect(sortTransferModalItems(undefined)).toEqual([])
            expect(sortTransferModalItems([])).toEqual([])
        })

        it('handles single item without changes', () => {
            const single = [{ numbers: '123', excess: 50 }]
            expect(sortTransferModalItems(single)).toEqual(single)
        })
    })
})
