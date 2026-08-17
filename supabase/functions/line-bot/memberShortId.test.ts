import { describe, it, expect } from 'vitest'
import {
    MEMBER_SHORT_ID_LENGTH,
    getMemberShortId,
    isMemberShortIdParam,
    matchMembersByShortId
} from './memberShortId.ts'

const UUID_A = 'a3f9c1d2-4b5e-4f81-9c3a-7e2d5f8b1c04'
const UUID_B = 'a3f9c7ab-1122-4333-8444-555566667777' // shares the 5-char prefix with A
const UUID_C = '12345678-aaaa-4bbb-8ccc-ddddeeeeffff' // purely numeric short ID
const UUID_D = 'ff00aa11-2222-4333-8444-555566667777'

type Member = { user_id: string; name: string }

const members: Member[] = [
    { user_id: UUID_A, name: 'สมชาย' },
    { user_id: UUID_B, name: 'สมชาย' },
    { user_id: UUID_C, name: 'สมหญิง' },
    { user_id: UUID_D, name: 'อาทิตย์' }
]

const byId = (m: Member) => m.user_id

describe('getMemberShortId', () => {
    it('returns the first 5 hex chars of the UUID', () => {
        expect(getMemberShortId(UUID_A)).toBe('a3f9c')
        expect(getMemberShortId(UUID_C)).toBe('12345')
        expect(getMemberShortId(UUID_D)).toBe('ff00a')
    })

    it('is always MEMBER_SHORT_ID_LENGTH chars for a real UUID', () => {
        expect(getMemberShortId(UUID_A)).toHaveLength(MEMBER_SHORT_ID_LENGTH)
    })

    it('lowercases the output so it is case-insensitive to type', () => {
        expect(getMemberShortId(UUID_A.toUpperCase())).toBe('a3f9c')
    })

    it('returns an empty string for missing input', () => {
        expect(getMemberShortId(null)).toBe('')
        expect(getMemberShortId(undefined)).toBe('')
        expect(getMemberShortId('')).toBe('')
    })
})

describe('isMemberShortIdParam', () => {
    it('accepts 5 to 8 hex chars', () => {
        expect(isMemberShortIdParam('a3f9c')).toBe(true)
        expect(isMemberShortIdParam('a3f9c1')).toBe(true)
        expect(isMemberShortIdParam('a3f9c1d2')).toBe(true)
        expect(isMemberShortIdParam('12345')).toBe(true)
    })

    it('is case-insensitive and tolerates surrounding spaces', () => {
        expect(isMemberShortIdParam('A3F9C')).toBe(true)
        expect(isMemberShortIdParam('  a3f9c  ')).toBe(true)
    })

    it('rejects params shorter than 5 or longer than 8 chars', () => {
        expect(isMemberShortIdParam('a3f9')).toBe(false)
        expect(isMemberShortIdParam('a3f9c1d2e')).toBe(false)
    })

    it('rejects non-hex text such as Thai names', () => {
        expect(isMemberShortIdParam('สมชาย')).toBe(false)
        expect(isMemberShortIdParam('somchai')).toBe(false)
    })

    it('does not collide with the other /สรุป params', () => {
        // Round dates always carry a '-' or '/' separator
        expect(isMemberShortIdParam('10-6-69')).toBe(false)
        // lao/hanoi winning numbers are exactly 4 digits
        expect(isMemberShortIdParam('1234')).toBe(false)
        // thai winning numbers carry a '/'
        expect(isMemberShortIdParam('123456/25')).toBe(false)
        // stock winning numbers carry a '/'
        expect(isMemberShortIdParam('25/49')).toBe(false)
    })
})

describe('matchMembersByShortId', () => {
    it('finds the single member owning a short ID', () => {
        const matches = matchMembersByShortId(members, 'ff00a', byId)
        expect(matches).toHaveLength(1)
        expect(matches[0].user_id).toBe(UUID_D)
    })

    it('is case-insensitive and trims the param', () => {
        expect(matchMembersByShortId(members, ' FF00A ', byId)).toHaveLength(1)
    })

    it('returns every member sharing a colliding prefix', () => {
        const matches = matchMembersByShortId(members, 'a3f9c', byId)
        expect(matches.map(byId).sort()).toEqual([UUID_A, UUID_B].sort())
    })

    it('resolves a collision when more characters are given', () => {
        expect(matchMembersByShortId(members, 'a3f9c1', byId).map(byId)).toEqual([UUID_A])
        expect(matchMembersByShortId(members, 'a3f9c7', byId).map(byId)).toEqual([UUID_B])
    })

    it('matches an 8-char prefix across the first UUID dash', () => {
        expect(matchMembersByShortId(members, 'a3f9c1d2', byId).map(byId)).toEqual([UUID_A])
    })

    it('returns nothing for an unknown prefix', () => {
        expect(matchMembersByShortId(members, 'deadb', byId)).toEqual([])
    })

    it('returns nothing for an empty param instead of matching everyone', () => {
        expect(matchMembersByShortId(members, '', byId)).toEqual([])
        expect(matchMembersByShortId(members, '   ', byId)).toEqual([])
    })

    it('skips members without an id', () => {
        const withMissing = [{ user_id: '', name: 'ไม่มีไอดี' }, ...members]
        expect(matchMembersByShortId(withMissing, 'a3f9c', byId)).toHaveLength(2)
    })
})
