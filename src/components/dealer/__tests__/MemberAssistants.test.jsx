import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import MemberAccordionItem from '../MemberAccordionItem'

vi.mock('../../../lib/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null })
        })
    }
}))

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'dealer-1', role: 'dealer' }
    })
}))

describe('MemberAccordionItem — Key-in Assistants UI', () => {
    const baseMember = {
        id: 'member-10050',
        full_name: 'สุพรรณี',
        email: 'meaw@gmail.com',
        member_code: '10050',
        line_user_id: 'U4c8f56532d5253f6a2a7538bf5aee897',
        created_at: '2026-02-16T00:00:00Z'
    }

    it('renders assistants section with list, permission labels, and add form when expanded', () => {
        const assistants = [
            {
                id: 'asst-1',
                profile_id: 'member-10050',
                line_user_id: 'U11111111111111111111111111111111',
                assistant_name: 'น้องมด',
                can_view_summary: false,
                is_active: true
            },
            {
                id: 'asst-2',
                profile_id: 'member-10050',
                line_user_id: 'U22222222222222222222222222222222',
                assistant_name: 'คีย์2',
                can_view_summary: true,
                is_active: true
            }
        ]

        const html = renderToString(
            <MemberAccordionItem
                member={baseMember}
                formatDate={() => '16 ก.พ. 2569'}
                isExpanded={true}
                onToggle={vi.fn()}
                onBlock={vi.fn()}
                onDelete={vi.fn()}
                onUpdateLineUserId={vi.fn()}
                assistants={assistants}
                onAddAssistant={vi.fn()}
                onToggleAssistantSummary={vi.fn()}
                onDeleteAssistant={vi.fn()}
            />
        )

        expect(html).toContain('ผู้ช่วยคีย์ข้อมูล')
        expect(html).toContain('น้องมด')
        expect(html).toContain('U11111111111111111111111111111111')
        expect(html).toContain('คีย์อย่างเดียว')
        expect(html).toContain('คีย์2')
        expect(html).toContain('U22222222222222222222222222222222')
        expect(html).toContain('คีย์+ดูสรุป')
        expect(html).toContain('เพิ่มผู้ช่วย')
    })

    it('renders clean compact section without verbose explanations when member has no assistants yet', () => {
        const html = renderToString(
            <MemberAccordionItem
                member={baseMember}
                formatDate={() => '16 ก.พ. 2569'}
                isExpanded={true}
                onToggle={vi.fn()}
                onBlock={vi.fn()}
                onDelete={vi.fn()}
                onUpdateLineUserId={vi.fn()}
                assistants={[]}
                onAddAssistant={vi.fn()}
                onToggleAssistantSummary={vi.fn()}
                onDeleteAssistant={vi.fn()}
            />
        )

        expect(html).toContain('ผู้ช่วยคีย์ข้อมูล')
        expect(html).toContain('0<!-- --> คน')
        expect(html).not.toContain('(Line UIDs เพิ่มเติม)')
        expect(html).not.toContain('ยังไม่มีผู้ช่วยคีย์ข้อมูล')
        expect(html).not.toContain('ค่าเริ่มต้น: คีย์เลขแทงได้')
        expect(html).toContain('เพิ่มผู้ช่วย')
    })
})
