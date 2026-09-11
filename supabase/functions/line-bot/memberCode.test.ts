import { describe, it, expect } from 'vitest'
import {
    isMemberCodeParam,
    matchMembersByCode,
    parseRoundDateParam,
    parseMemberAndRoundDateParam
} from './memberCode.ts'

type Member = { user_id: string; member_code: string | null; name: string }

const members: Member[] = [
    { user_id: 'u1', member_code: '10048', name: 'พี่ไอซ์' },
    { user_id: 'u2', member_code: '10027', name: 'พี่เอ' },
    { user_id: 'u3', member_code: '10002', name: 'พี่น้ำค้า' },
    { user_id: 'u4', member_code: null, name: 'ยังไม่มีรหัส' }
]

const byCode = (m: Member) => m.member_code

describe('isMemberCodeParam', () => {
    it('accepts a 5-digit member code', () => {
        expect(isMemberCodeParam('10048')).toBe(true)
        expect(isMemberCodeParam('10001')).toBe(true)
    })

    it('accepts 6+ digits for when the sequence passes 99999', () => {
        expect(isMemberCodeParam('100000')).toBe(true)
    })

    it('tolerates surrounding spaces', () => {
        expect(isMemberCodeParam('  10048  ')).toBe(true)
    })

    it('rejects fewer than 5 digits', () => {
        expect(isMemberCodeParam('1004')).toBe(false)
        expect(isMemberCodeParam('')).toBe(false)
    })

    it('rejects non-numeric text such as Thai names', () => {
        expect(isMemberCodeParam('พี่ไอซ์')).toBe(false)
        expect(isMemberCodeParam('10048a')).toBe(false)
    })

    it('does not collide with the other /สรุป params', () => {
        // Round dates always carry a separator
        expect(isMemberCodeParam('10-6-69')).toBe(false)
        expect(isMemberCodeParam('10/6/69')).toBe(false)
        // lao/hanoi winning numbers are exactly 4 digits
        expect(isMemberCodeParam('1234')).toBe(false)
        // thai winning numbers carry a '/'
        expect(isMemberCodeParam('123456/25')).toBe(false)
        // stock winning numbers carry a '/'
        expect(isMemberCodeParam('25/49')).toBe(false)
    })

    it('treats a bare 6-digit number as a code, not thai winning numbers', () => {
        // /สรุป 123456 is not a valid thai announcement (needs 123456/25),
        // so routing it to the member lookup is safe.
        expect(isMemberCodeParam('123456')).toBe(true)
    })
})

describe('matchMembersByCode', () => {
    it('finds the single member owning the code', () => {
        const matches = matchMembersByCode(members, '10048', byCode)
        expect(matches).toHaveLength(1)
        expect(matches[0].name).toBe('พี่ไอซ์')
    })

    it('trims the param before comparing', () => {
        expect(matchMembersByCode(members, ' 10027 ', byCode)).toHaveLength(1)
    })

    it('matches exactly, never as a substring', () => {
        expect(matchMembersByCode(members, '1004', byCode)).toEqual([])
        expect(matchMembersByCode(members, '100480', byCode)).toEqual([])
    })

    it('returns nothing for an unknown code', () => {
        expect(matchMembersByCode(members, '99999', byCode)).toEqual([])
    })

    it('returns nothing for an empty param instead of matching everyone', () => {
        expect(matchMembersByCode(members, '', byCode)).toEqual([])
        expect(matchMembersByCode(members, '   ', byCode)).toEqual([])
    })

    it('skips members without a code', () => {
        expect(matchMembersByCode(members, '', byCode)).toEqual([])
        expect(matchMembersByCode(members, 'null', byCode)).toEqual([])
    })
})

describe('parseRoundDateParam', () => {
    it('parses 2-digit Buddhist year correctly (e.g. 69 -> 2569 -> 2026)', () => {
        expect(parseRoundDateParam('8-9-69')).toBe('2026-09-08')
        expect(parseRoundDateParam('10-6-69')).toBe('2026-06-10')
    })

    it('parses 2-digit Gregorian year correctly (e.g. 26 -> 2026)', () => {
        expect(parseRoundDateParam('8-9-26')).toBe('2026-09-08')
        expect(parseRoundDateParam('10-6-26')).toBe('2026-06-10')
    })

    it('parses 4-digit Buddhist year (e.g. 2569 -> 2026)', () => {
        expect(parseRoundDateParam('08-09-2569')).toBe('2026-09-08')
        expect(parseRoundDateParam('8-9-2569')).toBe('2026-09-08')
    })

    it('parses 4-digit Gregorian year (e.g. 2026)', () => {
        expect(parseRoundDateParam('08-09-2026')).toBe('2026-09-08')
        expect(parseRoundDateParam('8-9-2026')).toBe('2026-09-08')
    })

    it('supports slash separator (e.g. 8/9/69, 8/9/26)', () => {
        expect(parseRoundDateParam('8/9/69')).toBe('2026-09-08')
        expect(parseRoundDateParam('8/9/26')).toBe('2026-09-08')
        expect(parseRoundDateParam('08/09/2569')).toBe('2026-09-08')
    })

    it('rejects invalid dates or non-date strings', () => {
        expect(parseRoundDateParam('10048')).toBeNull()
        expect(parseRoundDateParam('1234')).toBeNull()
        expect(parseRoundDateParam('123456/25')).toBeNull()
        expect(parseRoundDateParam('')).toBeNull()
        expect(parseRoundDateParam('99-99-99')).toBeNull()
    })
})

describe('parseMemberAndRoundDateParam', () => {
    it('parses member ID + round date with hyphen and Buddhist year (e.g. 10039/8-9-69)', () => {
        const res = parseMemberAndRoundDateParam('10039/8-9-69')
        expect(res).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
    })

    it('parses member ID + round date with hyphen and Gregorian year (e.g. 10039/8-9-26)', () => {
        const res = parseMemberAndRoundDateParam('10039/8-9-26')
        expect(res).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8-9-26'
        })
    })

    it('parses member ID + round date with slash separator (e.g. 10039/8/9/69, 10039/8/9/26)', () => {
        expect(parseMemberAndRoundDateParam('10039/8/9/69')).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8/9/69'
        })
        expect(parseMemberAndRoundDateParam('10039/8/9/26')).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8/9/26'
        })
    })

    it('handles spaces around separators (e.g. 10039 / 8-9-69 or 10039 8-9-69)', () => {
        expect(parseMemberAndRoundDateParam('10039 / 8-9-69')).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
        expect(parseMemberAndRoundDateParam('10039 8-9-69')).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
    })

    it('handles leading slash command syntax (e.g. /10039/8-9-69)', () => {
        expect(parseMemberAndRoundDateParam('/10039/8-9-69')).toEqual({
            memberParam: '10039',
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
    })

    it('parses Thai member name + round date (e.g. สมชาย/8-9-69)', () => {
        expect(parseMemberAndRoundDateParam('สมชาย/8-9-69')).toEqual({
            memberParam: 'สมชาย',
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
    })

    it('identifies date-only params without a member (e.g. 8-9-69, 8/9/69)', () => {
        expect(parseMemberAndRoundDateParam('8-9-69')).toEqual({
            memberParam: null,
            dateStr: '2026-09-08',
            rawDate: '8-9-69'
        })
        expect(parseMemberAndRoundDateParam('8/9/69')).toEqual({
            memberParam: null,
            dateStr: '2026-09-08',
            rawDate: '8/9/69'
        })
    })

    it('identifies member-only params without a date (e.g. 10048, /10048, สมชาย)', () => {
        expect(parseMemberAndRoundDateParam('10048')).toEqual({
            memberParam: '10048',
            dateStr: null,
            rawDate: null
        })
        expect(parseMemberAndRoundDateParam('/10048')).toEqual({
            memberParam: '10048',
            dateStr: null,
            rawDate: null
        })
        expect(parseMemberAndRoundDateParam('สมชาย')).toEqual({
            memberParam: 'สมชาย',
            dateStr: null,
            rawDate: null
        })
    })

    it('does NOT misclassify Thai/Stock winning numbers as member+date', () => {
        expect(parseMemberAndRoundDateParam('123456/25')).toEqual({
            memberParam: '123456/25',
            dateStr: null,
            rawDate: null
        })
        expect(parseMemberAndRoundDateParam('25/49')).toEqual({
            memberParam: '25/49',
            dateStr: null,
            rawDate: null
        })
    })

    it('returns null for empty strings or falsy input', () => {
        expect(parseMemberAndRoundDateParam('')).toBeNull()
        expect(parseMemberAndRoundDateParam('   ')).toBeNull()
        expect(parseMemberAndRoundDateParam(null)).toBeNull()
        expect(parseMemberAndRoundDateParam(undefined)).toBeNull()
    })
})
