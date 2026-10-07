import { describe, it, expect } from 'vitest'
import {
    FILTER_BET_TYPES_BY_LOTTERY,
    getFilterBetTypes,
    getDigitGroups,
    isBetTypeMatched
} from './betTypeFilterHelper'

describe('betTypeFilterHelper', () => {
    describe('getFilterBetTypes', () => {
        it('should return exactly 17 bet types for Thai lottery', () => {
            const types = getFilterBetTypes('thai')
            expect(types.length).toBe(17)
            const labels = types.map(t => t.label)
            expect(labels).toEqual([
                'ลอยบน',
                'ลอยล่าง',
                'ปักหน้าบน',
                'ปักกลางบน',
                'ปักหลังบน',
                'ปักหน้าล่าง',
                'ปักหลังล่าง',
                '2 ตัวบน',
                '2 ตัวหน้า',
                '2 ตัวถ่าง',
                '2 ตัวล่าง',
                '2 ตัวลอย',
                '3 ตัวบน',
                '3 ตัวโต๊ด',
                '3 ตัวล่าง',
                '4 ตัวลอย',
                '5 ตัวลอย'
            ])
        })

        it('should return exactly 18 bet types for Lao lottery including 4 ตัวชุด', () => {
            const types = getFilterBetTypes('lao')
            expect(types.length).toBe(18)
            const labels = types.map(t => t.label)
            expect(labels).toEqual([
                'เลข 4ตัวชุด',
                'ลอยบน',
                'ลอยล่าง',
                'ปักหน้าบน',
                'ปักกลางบน',
                'ปักหลังบน',
                'ปักหน้าล่าง',
                'ปักหลังล่าง',
                '2 ตัวบน',
                '2 ตัวหน้า',
                '2 ตัวถ่าง',
                '2 ตัวล่าง',
                '2 ตัวลอย',
                '3 ตัวบน',
                '3 ตัวโต๊ด',
                '3 ตัวล่าง',
                '4 ตัวลอย',
                '5 ตัวลอย'
            ])
        })

        it('should return exactly 18 bet types for Hanoi lottery', () => {
            const types = getFilterBetTypes('hanoi')
            expect(types.length).toBe(18)
            expect(types[0].label).toBe('เลข 4ตัวชุด')
        })

        it('should return exactly 2 bet types for Stock lottery', () => {
            const types = getFilterBetTypes('stock')
            expect(types.length).toBe(2)
            const labels = types.map(t => t.label)
            expect(labels).toEqual(['2 ตัวบน', '2 ตัวล่าง'])
        })

        it('should fallback to Thai lottery types for unknown lottery type', () => {
            const types = getFilterBetTypes('unknown')
            expect(types.length).toBe(17)
        })
    })

    describe('getDigitGroups', () => {
        it('should return 5 digit groups for Thai lottery', () => {
            const groups = getFilterBetTypes ? getDigitGroups('thai') : []
            expect(groups.length).toBe(5)
            const g2 = groups.find(g => g.id === '2_digit')
            expect(g2.types).toEqual(['2_top', '2_front', '2_center', '2_bottom', '2_run'])
            const g3 = groups.find(g => g.id === '3_digit')
            expect(g3.types).toEqual(['3_top', '3_tod', '3_bottom'])
        })

        it('should return Lao digit groups with 4_set in 4_digit group', () => {
            const groups = getDigitGroups('lao')
            expect(groups.length).toBe(5)
            const g4 = groups.find(g => g.id === '4_digit')
            expect(g4.types).toEqual(['4_set', '4_float'])
        })

        it('should return 1 group for stock lottery (2_digit only)', () => {
            const groups = getDigitGroups('stock')
            expect(groups.length).toBe(1)
            expect(groups[0].types).toEqual(['2_top', '2_bottom'])
        })
    })

    describe('isBetTypeMatched', () => {
        it('should return true when no bet types are selected or empty array', () => {
            expect(isBetTypeMatched('2_top', [])).toBe(true)
            expect(isBetTypeMatched('3_top', null)).toBe(true)
            expect(isBetTypeMatched('run_top', undefined)).toBe(true)
        })

        it('should match direct bet types', () => {
            expect(isBetTypeMatched('2_top', ['2_top'])).toBe(true)
            expect(isBetTypeMatched('3_top', ['2_top'])).toBe(false)
            expect(isBetTypeMatched('3_top', ['2_top', '3_top'])).toBe(true)
            expect(isBetTypeMatched('front_top_1', ['front_top_1'])).toBe(true)
            expect(isBetTypeMatched('front_top_1', ['back_top_1'])).toBe(false)
        })

        it('should match 2_top aliases (2_top_rev, 2_back)', () => {
            expect(isBetTypeMatched('2_top_rev', ['2_top'])).toBe(true)
            expect(isBetTypeMatched('2_back', ['2_top'])).toBe(true)
        })

        it('should match 2_front aliases (2_front_rev, 2_front_single)', () => {
            expect(isBetTypeMatched('2_front_rev', ['2_front'])).toBe(true)
            expect(isBetTypeMatched('2_front_single', ['2_front'])).toBe(true)
        })

        it('should match 2_center aliases (2_spread, 2_tang, 2_spread_rev)', () => {
            expect(isBetTypeMatched('2_spread', ['2_center'])).toBe(true)
            expect(isBetTypeMatched('2_tang', ['2_center'])).toBe(true)
            expect(isBetTypeMatched('2_spread_rev', ['2_center'])).toBe(true)
        })

        it('should match 2_bottom aliases (2_bottom_rev)', () => {
            expect(isBetTypeMatched('2_bottom_rev', ['2_bottom'])).toBe(true)
        })

        it('should match 2_run aliases (2_have, 2_teng)', () => {
            expect(isBetTypeMatched('2_have', ['2_run'])).toBe(true)
            expect(isBetTypeMatched('2_teng', ['2_run'])).toBe(true)
        })

        it('should match 3_top aliases (3_straight)', () => {
            expect(isBetTypeMatched('3_straight', ['3_top'])).toBe(true)
        })

        it('should match 3_tod aliases (3_tod_single)', () => {
            expect(isBetTypeMatched('3_tod_single', ['3_tod'])).toBe(true)
        })

        it('should match 4_set aliases (4_straight_set, 3_set, 3_straight_set, 3_tod_set, 2_front_set, 2_back_set)', () => {
            expect(isBetTypeMatched('4_straight_set', ['4_set'])).toBe(true)
            expect(isBetTypeMatched('3_set', ['4_set'])).toBe(true)
            expect(isBetTypeMatched('3_straight_set', ['4_set'])).toBe(true)
            expect(isBetTypeMatched('3_tod_set', ['4_set'])).toBe(true)
            expect(isBetTypeMatched('2_front_set', ['4_set'])).toBe(true)
            expect(isBetTypeMatched('2_back_set', ['4_set'])).toBe(true)
        })

        it('should match pak_top / pak_bottom when position is selected', () => {
            expect(isBetTypeMatched('pak_top', ['front_top_1'])).toBe(true)
            expect(isBetTypeMatched('pak_top', ['middle_top_1'])).toBe(true)
            expect(isBetTypeMatched('pak_bottom', ['front_bottom_1'])).toBe(true)
        })
    })
})
