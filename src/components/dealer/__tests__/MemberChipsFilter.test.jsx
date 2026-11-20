import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
        render(<MemberChipsFilter {...defaultProps} />)
        expect(screen.getByText('สมาชิกทั้งหมด (35)')).toBeInTheDocument()
        expect(screen.getByText('สมาชิกส่งเลข (26)')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'แสดงเฉพาะ' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'ไม่เอา' })).toBeInTheDocument()
    })

    it('toggles mode when mode button is clicked', () => {
        const onModeChange = vi.fn()
        render(<MemberChipsFilter {...defaultProps} onModeChange={onModeChange} />)
        
        fireEvent.click(screen.getByRole('button', { name: 'ไม่เอา' }))
        expect(onModeChange).toHaveBeenCalledWith('exclude')

        fireEvent.click(screen.getByRole('button', { name: 'แสดงเฉพาะ' }))
        expect(onModeChange).toHaveBeenCalledWith('include')
    })

    it('renders chips for selected members in include mode', () => {
        render(<MemberChipsFilter {...defaultProps} selectedMembers={['คุณเบญ', 'สุพรรณี']} mode="include" />)
        
        expect(screen.getByText('สมาชิกที่เลือก (2):')).toBeInTheDocument()
        expect(screen.getByText('คุณเบญ')).toBeInTheDocument()
        expect(screen.getByText('สุพรรณี')).toBeInTheDocument()
    })

    it('renders chips for selected members in exclude mode', () => {
        render(<MemberChipsFilter {...defaultProps} selectedMembers={['คุณเบญ']} mode="exclude" />)
        
        expect(screen.getByText('🚫 ยกเว้นสมาชิก (1):')).toBeInTheDocument()
        expect(screen.getByText('คุณเบญ')).toBeInTheDocument()
    })

    it('removes a member when its chip close button is clicked', () => {
        const onSelectedMembersChange = vi.fn()
        render(
            <MemberChipsFilter 
                {...defaultProps} 
                selectedMembers={['คุณเบญ', 'สุพรรณี']} 
                onSelectedMembersChange={onSelectedMembersChange} 
            />
        )
        
        const removeBenBtn = screen.getByTitle('ลบ คุณเบญ')
        fireEvent.click(removeBenBtn)
        expect(onSelectedMembersChange).toHaveBeenCalledWith(['สุพรรณี'])
    })

    it('clears all selected members when "ล้างสมาชิก" is clicked', () => {
        const onSelectedMembersChange = vi.fn()
        render(
            <MemberChipsFilter 
                {...defaultProps} 
                selectedMembers={['คุณเบญ', 'สุพรรณี']} 
                onSelectedMembersChange={onSelectedMembersChange} 
            />
        )
        
        fireEvent.click(screen.getByText('ล้างสมาชิก'))
        expect(onSelectedMembersChange).toHaveBeenCalledWith([])
    })

    describe('Write Bet button gating', () => {
        it('renders Write Bet button when canWriteBet is true', () => {
            const onWriteBet = vi.fn()
            render(<MemberChipsFilter {...defaultProps} canWriteBet={true} onWriteBet={onWriteBet} />)
            
            const writeBetBtn = screen.getByRole('button', { name: /เขียนโพย/ })
            expect(writeBetBtn).toBeInTheDocument()
            fireEvent.click(writeBetBtn)
            expect(onWriteBet).toHaveBeenCalledTimes(1)
        })

        it('does NOT render Write Bet button when canWriteBet is false', () => {
            render(<MemberChipsFilter {...defaultProps} canWriteBet={false} />)
            expect(screen.queryByRole('button', { name: /เขียนโพย/ })).not.toBeInTheDocument()
        })
    })
})
