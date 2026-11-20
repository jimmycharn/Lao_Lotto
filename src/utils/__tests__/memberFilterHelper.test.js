import { describe, it, expect } from 'vitest'
import { isMemberMatched } from '../memberFilterHelper'

describe('memberFilterHelper - isMemberMatched', () => {
    describe('Default / Empty selections', () => {
        it('returns true when selectedMembers is empty array', () => {
            expect(isMemberMatched('คุณเบญ', [], 'include')).toBe(true)
            expect(isMemberMatched('คุณเบญ', [], 'exclude')).toBe(true)
        })

        it('returns true when selectedMembers is null or undefined', () => {
            expect(isMemberMatched('คุณเบญ', null, 'include')).toBe(true)
            expect(isMemberMatched('คุณเบญ', undefined, 'exclude')).toBe(true)
        })
    })

    describe('Include mode', () => {
        const selected = ['คุณเบญ', 'สุพรรณี']

        it('returns true for member in the selected list', () => {
            expect(isMemberMatched('คุณเบญ', selected, 'include')).toBe(true)
            expect(isMemberMatched('สุพรรณี', selected, 'include')).toBe(true)
        })

        it('returns false for member NOT in the selected list', () => {
            expect(isMemberMatched('สมชาย', selected, 'include')).toBe(false)
            expect(isMemberMatched('ไม่ระบุ', selected, 'include')).toBe(false)
        })

        it('handles leading/trailing whitespace gracefully', () => {
            expect(isMemberMatched(' คุณเบญ ', selected, 'include')).toBe(true)
        })
    })

    describe('Exclude mode', () => {
        const selected = ['คุณเบญ', 'สุพรรณี']

        it('returns false for member in the excluded list', () => {
            expect(isMemberMatched('คุณเบญ', selected, 'exclude')).toBe(false)
            expect(isMemberMatched('สุพรรณี', selected, 'exclude')).toBe(false)
        })

        it('returns true for member NOT in the excluded list', () => {
            expect(isMemberMatched('สมชาย', selected, 'exclude')).toBe(true)
            expect(isMemberMatched('สมศักดิ์', selected, 'exclude')).toBe(true)
        })
    })
})
