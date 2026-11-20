import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import MemberChipsFilter from '../MemberChipsFilter'
import { isMemberMatched } from '../../../utils/memberFilterHelper'

describe('MemberChipsFilter Integration & Gating Logic', () => {
    describe('Submission filtering matching logic', () => {
        const sampleSubmissions = [
            { id: 1, user_name: 'คุณเบญ', amount: 100 },
            { id: 2, user_name: 'คุณสมชาย', amount: 200 },
            { id: 3, user_name: 'คุณวิชัย', amount: 300 }
        ]

        it('returns all submissions when selectedMembers is empty', () => {
            const filtered = sampleSubmissions.filter(s => isMemberMatched(s.user_name, [], 'include'))
            expect(filtered).toHaveLength(3)
        })

        it('filters to single selected member in include mode', () => {
            const filtered = sampleSubmissions.filter(s => isMemberMatched(s.user_name, ['คุณเบญ'], 'include'))
            expect(filtered).toHaveLength(1)
            expect(filtered[0].user_name).toBe('คุณเบญ')
        })

        it('filters to multiple selected members in include mode', () => {
            const filtered = sampleSubmissions.filter(s => isMemberMatched(s.user_name, ['คุณเบญ', 'คุณวิชัย'], 'include'))
            expect(filtered).toHaveLength(2)
            expect(filtered.map(s => s.user_name)).toEqual(['คุณเบญ', 'คุณวิชัย'])
        })

        it('excludes specified members in exclude mode', () => {
            const filtered = sampleSubmissions.filter(s => isMemberMatched(s.user_name, ['คุณสมชาย'], 'exclude'))
            expect(filtered).toHaveLength(2)
            expect(filtered.map(s => s.user_name)).toEqual(['คุณเบญ', 'คุณวิชัย'])
        })
    })

    describe('canWriteBet gating logic as implemented in RoundAccordionItem', () => {
        const allowedMembers = [
            { id: 'm1', full_name: 'คุณเบญ', dealerCanSubmit: true, is_blocked: false },
            { id: 'm2', full_name: 'คุณสมชาย', dealerCanSubmit: false, is_blocked: false }
        ]

        const checkCanWrite = (selectedMembers, mode) => {
            if (mode !== 'include') return false
            if (selectedMembers.length !== 1) return false
            const memberName = selectedMembers[0]
            const member = allowedMembers.find(m => (m.full_name || m.email) === memberName)
            return Boolean(member && member.dealerCanSubmit && !member.is_blocked)
        }

        it('disallows writing bet when no member is selected', () => {
            expect(checkCanWrite([], 'include')).toBe(false)
        })

        it('allows writing bet when exactly 1 allowed member is selected in include mode', () => {
            expect(checkCanWrite(['คุณเบญ'], 'include')).toBe(true)
        })

        it('disallows writing bet when member has dealerCanSubmit = false', () => {
            expect(checkCanWrite(['คุณสมชาย'], 'include')).toBe(false)
        })

        it('disallows writing bet when multiple members are selected in include mode', () => {
            expect(checkCanWrite(['คุณเบญ', 'คุณสมชาย'], 'include')).toBe(false)
        })

        it('disallows writing bet in exclude mode even if 1 member selected', () => {
            expect(checkCanWrite(['คุณเบญ'], 'exclude')).toBe(false)
        })
    })

    describe('Sender name formatting in copy total', () => {
        const getSenderName = (selectedMembers, mode) => {
            let senderName = 'ทั้งหมด'
            if (selectedMembers.length > 0) {
                senderName = mode === 'exclude'
                    ? `ยกเว้น (${selectedMembers.join(', ')})`
                    : selectedMembers.join(', ')
            }
            return senderName
        }

        it('formats sender name correctly for empty selection', () => {
            expect(getSenderName([], 'include')).toBe('ทั้งหมด')
        })

        it('formats sender name correctly for single member include', () => {
            expect(getSenderName(['คุณเบญ'], 'include')).toBe('คุณเบญ')
        })

        it('formats sender name correctly for multiple members include', () => {
            expect(getSenderName(['คุณเบญ', 'คุณสมชาย'], 'include')).toBe('คุณเบญ, คุณสมชาย')
        })

        it('formats sender name correctly for exclude mode', () => {
            expect(getSenderName(['คุณสมชาย'], 'exclude')).toBe('ยกเว้น (คุณสมชาย)')
            expect(getSenderName(['คุณสมชาย', 'คุณวิชัย'], 'exclude')).toBe('ยกเว้น (คุณสมชาย, คุณวิชัย)')
        })
    })

    describe('UI rendering of MemberChipsFilter with gating states', () => {
        it('renders with write bet button when canWriteBet is true', () => {
            const html = renderToString(
                <MemberChipsFilter
                    selectedMembers={['คุณเบญ']}
                    mode="include"
                    canWriteBet={true}
                    memberOptions={[{ label: 'คุณเบญ', value: 'คุณเบญ' }]}
                />
            )
            expect(html).toContain('เขียนโพย')
        })

        it('hides write bet button when canWriteBet is false', () => {
            const html = renderToString(
                <MemberChipsFilter
                    selectedMembers={['คุณเบญ', 'คุณสมชาย']}
                    mode="include"
                    canWriteBet={false}
                    memberOptions={[{ label: 'คุณเบญ', value: 'คุณเบญ' }]}
                />
            )
            expect(html).not.toContain('เขียนโพย')
        })
    })
})
