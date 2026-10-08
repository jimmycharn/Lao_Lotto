import { describe, it, expect } from 'vitest'
import {
    FILTER_BET_TYPES_BY_LOTTERY,
    getFilterBetTypes,
    getDigitGroups,
    isBetTypeMatched,
    matchesCompositeDigits,
    isSearchNumberMatched
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

    describe('matchesCompositeDigits', () => {
        it('should match exact permutations of 123 (3-digit)', () => {
            expect(matchesCompositeDigits('123', '123')).toBe(true)
            expect(matchesCompositeDigits('132', '123')).toBe(true)
            expect(matchesCompositeDigits('213', '123')).toBe(true)
            expect(matchesCompositeDigits('231', '123')).toBe(true)
            expect(matchesCompositeDigits('312', '123')).toBe(true)
            expect(matchesCompositeDigits('321', '123')).toBe(true)
        })

        it('should match 4-digit numbers containing all digits of 123', () => {
            expect(matchesCompositeDigits('1243', '123')).toBe(true)
            expect(matchesCompositeDigits('2513', '123')).toBe(true)
            expect(matchesCompositeDigits('9123', '123')).toBe(true)
            expect(matchesCompositeDigits('3201', '123')).toBe(true)
        })

        it('should return false if any search digit is missing', () => {
            expect(matchesCompositeDigits('124', '123')).toBe(false)
            expect(matchesCompositeDigits('25', '123')).toBe(false)
            expect(matchesCompositeDigits('789', '123')).toBe(false)
        })

        it('should correctly handle multiset repeated digits (e.g. 22)', () => {
            expect(matchesCompositeDigits('22', '22')).toBe(true)
            expect(matchesCompositeDigits('228', '22')).toBe(true)
            expect(matchesCompositeDigits('252', '22')).toBe(true)
            expect(matchesCompositeDigits('25', '22')).toBe(false) // only one 2
        })

        it('should match 276 example from user screenshot', () => {
            expect(matchesCompositeDigits('276', '276')).toBe(true)
            expect(matchesCompositeDigits('267', '276')).toBe(true)
            expect(matchesCompositeDigits('726', '276')).toBe(true)
            expect(matchesCompositeDigits('762', '276')).toBe(true)
            expect(matchesCompositeDigits('627', '276')).toBe(true)
            expect(matchesCompositeDigits('672', '276')).toBe(true)
            expect(matchesCompositeDigits('1276', '276')).toBe(true)
            expect(matchesCompositeDigits('2760', '276')).toBe(true)
            expect(matchesCompositeDigits('275', '276')).toBe(false)
        })

        it('should return false for empty or null inputs', () => {
            expect(matchesCompositeDigits('', '123')).toBe(false)
            expect(matchesCompositeDigits('123', '')).toBe(false)
            expect(matchesCompositeDigits(null, '123')).toBe(false)
            expect(matchesCompositeDigits('123', null)).toBe(false)
        })
    })

    describe('isSearchNumberMatched', () => {
        it('should return true when searchStr is empty or null', () => {
            expect(isSearchNumberMatched('123', '', false)).toBe(true)
            expect(isSearchNumberMatched('123', null, false)).toBe(true)
            expect(isSearchNumberMatched('123', '', true)).toBe(true)
            expect(isSearchNumberMatched('123', null, true)).toBe(true)
        })

        it('should use substring match when isComposite is false', () => {
            expect(isSearchNumberMatched('123', '12', false)).toBe(true)
            expect(isSearchNumberMatched('1234', '23', false)).toBe(true)
            expect(isSearchNumberMatched('321', '123', false)).toBe(false)
        })

        it('should use composite match when isComposite is true', () => {
            expect(isSearchNumberMatched('321', '123', true)).toBe(true)
            expect(isSearchNumberMatched('1243', '123', true)).toBe(true)
            expect(isSearchNumberMatched('2513', '123', true)).toBe(true)
            expect(isSearchNumberMatched('999', '123', true)).toBe(false)
        })

        it('should match any number in an array of search targets', () => {
            const targets = ['123', '465', '789']
            expect(isSearchNumberMatched('123', targets, false)).toBe(true)
            expect(isSearchNumberMatched('465', targets, false)).toBe(true)
            expect(isSearchNumberMatched('789', targets, false)).toBe(true)
            expect(isSearchNumberMatched('000', targets, false)).toBe(false)
            expect(isSearchNumberMatched('12', targets, false)).toBe(false)
        })

        it('should match any number in an array with composite matching', () => {
            const targets = ['123', '465']
            expect(isSearchNumberMatched('321', targets, true)).toBe(true)
            expect(isSearchNumberMatched('564', targets, true)).toBe(true)
            expect(isSearchNumberMatched('999', targets, true)).toBe(false)
        })

        it('should return true if array of search targets is empty', () => {
            expect(isSearchNumberMatched('123', [], false)).toBe(true)
            expect(isSearchNumberMatched('123', [], true)).toBe(true)
            expect(isSearchNumberMatched('123', ['', null], false)).toBe(true)
        })
    })
})

