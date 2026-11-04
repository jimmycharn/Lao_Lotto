import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import GraphLayoffModal from '../GraphLayoffModal'

describe('GraphLayoffModal', () => {
    const mockRound = {
        lottery_type: 'lao',
        lottery_name: 'หวยลาวพัฒนา',
        round_date: '2026-11-04',
        close_time: '2026-11-04T13:30:00Z',
        currency_symbol: '฿'
    }

    const mockItems = [
        { numbers: '872', bet_type: '3_top', excess: 450, display_bet_type: '3 ตัวบน' },
        { numbers: '25', bet_type: '2_top', excess: 150, display_bet_type: '2 ตัวบน' },
        { numbers: '25', bet_type: '2_bottom', excess: 100, display_bet_type: '2 ตัวล่าง' }
    ]

    it('returns null when isOpen is false', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={false}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )
        expect(html).toBe('')
    })

    it('renders modal header, category tabs, and source badge when open', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('ตัดยอดตีออกจากกราฟ')
        expect(html).toContain('หวยลาวพัฒนา')
        expect(html).toContain('3 ตัว')
        expect(html).toContain('2 ตัว')
        expect(html).toContain('เลขวิ่ง')
        expect(html).toContain('แท็บ: ยอดเกิน')
    })

    it('renders source badge for remaining tab', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="remaining"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('แท็บ: ยอดเหลือ')
    })

    it('renders control toolbar with 1-line buttons and cut modes', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        // Line button & badges
        expect(html).toContain('เพิ่มเส้นราคา')
        expect(html).toContain('ตัดบนเส้น')
        expect(html).toContain('ตัดล่างเส้น')
        expect(html).toContain('ตัดเฉพาะส่วนต่าง')
        expect(html).toContain('ตัดเต็มจำนวน')
        expect(html).toContain('ตัดยอดเข้าตะกร้า')
    })

    it('renders 2-line mode with between and outside buttons', () => {
        const twoLines = [
            { id: 1, value: 400, color: '#ef4444' },
            { id: 2, value: 100, color: '#3b82f6' }
        ]
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                initialLines={twoLines}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('ตัดระหว่างเส้น')
        expect(html).toContain('ตัดนอกเส้น')
        expect(html).toContain('เส้นบน')
        expect(html).toContain('เส้นล่าง')
    })

    it('highlights active category tab when initialCategory is passed', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="remaining"
                items={mockItems}
                initialCategory="2_digit"
                onProceedToTransfer={vi.fn()}
            />
        )

        // 2_digit button should have active class
        expect(html).toMatch(/class="[^"]*btn[^"]*active[^"]*"[^>]*>🎯 2 ตัว/)
    })

    it('renders staging basket drawer with staged items and clear/transfer actions', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                initialBasket={[
                    { numbers: '872', bet_type: '3_top', excess: 200, display_bet_type: '3 ตัวบน' }
                ]}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('ตะกร้าพักยอดตีออก')
        expect(html).toContain('872')
        expect(html).toContain('3 ตัวบน')
        expect(html).toContain('ล้างตะกร้า')
        expect(html).toContain('ดำเนินการส่งตีออก')
    })

    it('handles empty items array gracefully without crash', () => {
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={[]}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('ตัดยอดตีออกจากกราฟ')
        expect(html).toContain('เข้าเงื่อนไข:')
    })

    it('respects round currency symbol', () => {
        const customRound = {
            ...mockRound,
            currency_symbol: '₭'
        }
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={customRound}
                sourceTab="excess"
                items={mockItems}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('₭')
    })
})
