import { describe, it, expect } from 'vitest'
import { getAvailableClosedLotteryTypes, filterClosedRounds } from '../closedRoundsFilterHelper'

describe('closedRoundsFilterHelper', () => {
    const mockClosedRounds = [
        { id: '1', lottery_type: 'lao', round_date: '2026-10-09' },
        { id: '2', lottery_type: 'lao', round_date: '2026-10-08' },
        { id: '3', lottery_type: 'thai', round_date: '2026-10-01' },
        { id: '4', lottery_type: 'hanoi', round_date: '2026-10-09' },
        { id: '5', lottery_type: null, round_date: '2026-10-07' }
    ]

    describe('getAvailableClosedLotteryTypes', () => {
        it('extracts unique valid lottery types from closed rounds', () => {
            const types = getAvailableClosedLotteryTypes(mockClosedRounds)
            expect(types).toEqual(['lao', 'thai', 'hanoi'])
        })

        it('returns empty array when closedRounds is empty or undefined', () => {
            expect(getAvailableClosedLotteryTypes([])).toEqual([])
            expect(getAvailableClosedLotteryTypes(null)).toEqual([])
            expect(getAvailableClosedLotteryTypes(undefined)).toEqual([])
        })
    })

    describe('filterClosedRounds', () => {
        it('returns all closed rounds when typeFilter is "all"', () => {
            const result = filterClosedRounds(mockClosedRounds, 'all')
            expect(result).toHaveLength(5)
            expect(result).toEqual(mockClosedRounds)
        })

        it('returns only rounds matching specific lottery_type', () => {
            const laoRounds = filterClosedRounds(mockClosedRounds, 'lao')
            expect(laoRounds).toHaveLength(2)
            expect(laoRounds.every(r => r.lottery_type === 'lao')).toBe(true)

            const thaiRounds = filterClosedRounds(mockClosedRounds, 'thai')
            expect(thaiRounds).toHaveLength(1)
            expect(thaiRounds[0].id).toBe('3')
        })

        it('returns empty array if no rounds match the filter', () => {
            const result = filterClosedRounds(mockClosedRounds, 'yeekee')
            expect(result).toEqual([])
        })

        it('handles null/undefined closed rounds gracefully', () => {
            expect(filterClosedRounds(null, 'all')).toEqual([])
            expect(filterClosedRounds(undefined, 'lao')).toEqual([])
        })
    })
})
