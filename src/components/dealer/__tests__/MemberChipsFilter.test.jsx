import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import MemberChipsFilter from '../MemberChipsFilter'

describe('MemberChipsFilter component', () => {
    const defaultProps = {
        memberFilterMode: 'all',
        onMemberFilterModeChange: vi.fn(),
        allMembersCount: 35,
        submittedMembersCount: 26,
        selectedMembers: [],
        onSelectedMembersChange: vi.fn(),
        mode: 'include',
        onModeChange: vi.fn(),
        memberOptions: [
            { label: 'ทุกคน', value: 'all' },
            { label: 'คุณเบญ', value: 'คุณเบญ' },
            { label: 'สุพรรณี', value: 'สุพรรณี' }
        ],
        canWriteBet: false,
        onWriteBet: vi.fn(),
        onCopy: vi.fn(),
        onExtend: vi.fn(),
        isAnnounced: false,
        hasSubmissions: true
    }

    it('renders mode buttons and member count buttons', () => {
        const html = renderToString(<MemberChipsFilter {...defaultProps} />)
        expect(html).toContain('สมาชิกทั้งหมด (35)')
        expect(html).toContain('สมาชิกส่งเลข (26)')
        expect(html).toContain('แสดงเฉพาะ')
        expect(html).toContain('ไม่เอา')
    })

    it('renders chips for selected members in include mode', () => {
        const html = renderToString(
            <MemberChipsFilter {...defaultProps} selectedMembers={['คุณเบญ', 'สุพรรณี']} mode="include" />
        )
        expect(html).toContain('สมาชิกที่เลือก (2):')
        expect(html).toContain('คุณเบญ')
        expect(html).toContain('สุพรรณี')
    })

    it('renders chips for selected members in exclude mode', () => {
        const html = renderToString(
            <MemberChipsFilter {...defaultProps} selectedMembers={['คุณเบญ']} mode="exclude" />
        )
        expect(html).toContain('🚫 ยกเว้นสมาชิก (1):')
        expect(html).toContain('คุณเบญ')
    })

    describe('Write Bet button gating', () => {
        it('renders Write Bet button when canWriteBet is true', () => {
            const html = renderToString(<MemberChipsFilter {...defaultProps} canWriteBet={true} />)
            expect(html).toContain('เขียนโพย')
        })

        it('does NOT render Write Bet button when canWriteBet is false', () => {
            const html = renderToString(<MemberChipsFilter {...defaultProps} canWriteBet={false} />)
            expect(html).not.toContain('เขียนโพย')
        })
    })
})
