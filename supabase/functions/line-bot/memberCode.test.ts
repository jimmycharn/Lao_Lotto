import { describe, it, expect } from 'vitest'
import { isMemberCodeParam, matchMembersByCode } from './memberCode.ts'

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
