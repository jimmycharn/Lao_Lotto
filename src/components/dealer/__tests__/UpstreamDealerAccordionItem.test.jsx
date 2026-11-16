import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import UpstreamDealerAccordionItem from '../UpstreamDealerAccordionItem'

vi.mock('../../../lib/supabase', () => ({
    supabase: {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null } })
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null })
        })
    }
}))

vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({
        toast: {
            success: vi.fn(),
            error: vi.fn(),
            warning: vi.fn(),
            info: vi.fn()
        }
    })
}))

describe('UpstreamDealerAccordionItem', () => {
    it('renders the ID badge for manual dealer with upstream_code', () => {
        const dealer = {
            id: 'manual-1',
            upstream_name: 'เฮียกวง โคราช',
            upstream_contact: '0812345678',
            upstream_code: '10001',
            is_linked: false,
            status: 'active'
        }

        const html = renderToString(
            <UpstreamDealerAccordionItem
                dealer={dealer}
                isExpanded={false}
                onToggle={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggleBlock={vi.fn()}
                onSetDefault={vi.fn()}
                onSaveSettings={vi.fn()}
            />
        )

        expect(html).toContain('dealer-id-badge')
        expect(html).toContain('ID: 10001')
        expect(html).toContain('เฮียกวง โคราช')
    })

    it('renders the ID badge for linked dealer with upstream_profile.member_code', () => {
        const dealer = {
            id: 'conn-1',
            upstream_dealer_id: 'u-555',
            upstream_name: 'เจ๊สมศรี พระราม 2',
            is_linked: true,
            status: 'active',
            upstream_profile: {
                id: 'u-555',
                full_name: 'เจ๊สมศรี พระราม 2',
                email: 'somsri@example.com',
                member_code: '10005'
            }
        }

        const html = renderToString(
            <UpstreamDealerAccordionItem
                dealer={dealer}
                isExpanded={false}
                onToggle={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggleBlock={vi.fn()}
                onSetDefault={vi.fn()}
                onSaveSettings={vi.fn()}
            />
        )

        expect(html).toContain('dealer-id-badge')
        expect(html).toContain('ID: 10005')
        expect(html).toContain('เจ๊สมศรี พระราม 2')
    })

    it('does not render the ID badge when no code is available', () => {
        const dealer = {
            id: 'manual-2',
            upstream_name: 'เจ้ามือไม่มีรหัส',
            is_linked: false,
            status: 'active'
        }

        const html = renderToString(
            <UpstreamDealerAccordionItem
                dealer={dealer}
                isExpanded={false}
                onToggle={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggleBlock={vi.fn()}
                onSetDefault={vi.fn()}
                onSaveSettings={vi.fn()}
            />
        )

        expect(html).not.toContain('dealer-id-badge')
        expect(html).toContain('เจ้ามือไม่มีรหัส')
    })
})
