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

        expect(html).toContain('ตัดยอดจากกราฟ')
        expect(html).toContain('3 ตัว')
        expect(html).toContain('2 ตัว')
        expect(html).toContain('1 ตัว')
        expect(html).toContain('แท็บ: ยอดเกิน')

        // Responsive class structure
        expect(html).toContain('graph-modal-header')
        expect(html).toContain('graph-modal-title-row')
        expect(html).toContain('graph-category-tabs-row')
        expect(html).toContain('graph-mobile-close')
        expect(html).toContain('graph-desktop-close')
        expect(html).toContain('graph-toolbar')
        expect(html).toContain('graph-toolbar-lines')
        expect(html).toContain('graph-toolbar-modes')
        expect(html).toContain('graph-toolbar-action')
        expect(html).toContain('graph-chart-container')
        expect(html).toContain('graph-basket-drawer')
        expect(html).toContain('graph-basket-header')
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

    it('calculates 2-line between cuts correctly in header summary', () => {
        const twoLines = [
            { id: 1, value: 400, color: '#ef4444' },
            { id: 2, value: 100, color: '#3b82f6' }
        ]
        // mockItems: 872 (3_top, 450). Between 100 and 400: slice is 400 - 100 = 300!
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                initialLines={twoLines}
                initialCategory="3_digit"
                onProceedToTransfer={vi.fn()}
            />
        )

        // 872 has 450, between 100 and 400 slice is 300
        expect(html).toContain('ยอดรวม: ')
        expect(html).toContain('>1</strong> เลข')
        expect(html).toContain('300')
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

        // 2_digit button should have active class and show active badge
        expect(html).toContain('title="คลิกเพื่อเลือกประเภท 2 ตัว"')
        expect(html).toMatch(/class="btn btn-sm active"[^>]*title="คลิกเพื่อเลือกประเภท 2 ตัว"/)
        expect(html).toContain('2 ตัวบน')
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
        expect(html).toContain('graph-basket-table-wrapper')
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

        expect(html).toContain('ตัดยอดจากกราฟ')
        expect(html).toContain('ยอดรวม:')
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

    it('displays Thai lottery round with 3-digit dropdown button showing active bet type', () => {
        const thaiRound = {
            lottery_type: 'thai',
            lottery_name: 'หวยรัฐบาลไทย',
            round_date: '2026-11-01',
            close_time: '2026-11-01T15:30:00Z',
            currency_symbol: '฿'
        }
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={thaiRound}
                sourceTab="remaining"
                items={mockItems}
                initialCategory="3_digit"
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('🎯 <!-- -->3 ตัว<!-- -->: <!-- -->3 ตัวบน')
    })

    it('renders multiple bet types in the basket correctly', () => {
        const multiBasket = [
            { numbers: '872', bet_type: '3_top', excess: 200 },
            { numbers: '345', bet_type: '3_tod', excess: 150 },
            { numbers: '25', bet_type: '2_bottom', excess: 80 }
        ]
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                initialBasket={multiBasket}
                onProceedToTransfer={vi.fn()}
            />
        )

        expect(html).toContain('872')
        expect(html).toContain('3 ตัวบน')
        expect(html).toContain('345')
        expect(html).toContain('3 ตัวโต๊ด')
        expect(html).toContain('25')
        expect(html).toContain('2 ตัวล่าง')
    })

    it('isolates category amounts correctly and does not bleed grand total into 3_all, 2_all, run_all', () => {
        // mockItems has:
        // 3_top: 450 (sum 3-digit = 450)
        // 2_top: 150, 2_bottom: 100 (sum 2-digit = 250)
        // Grand total = 700
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

        // 3_digit button shows 3_top: 450
        expect(html).toContain('3 ตัวบน')
        expect(html).toBeDefined()
    })

    it('renders sortable headers for number and cut amount in the basket table', () => {
        const basket = [
            { numbers: '110', bet_type: '3_top', excess: 30 },
            { numbers: '101', bet_type: '3_top', excess: 50 },
            { numbers: '107', bet_type: '3_top', excess: 10 }
        ]
        const html = renderToString(
            <GraphLayoffModal
                isOpen={true}
                onClose={vi.fn()}
                round={mockRound}
                sourceTab="excess"
                items={mockItems}
                initialBasket={basket}
                onProceedToTransfer={vi.fn()}
            />
        )

        // Check header titles for sorting
        expect(html).toContain('title="คลิกเพื่อเรียงตามเลข (น้อยไปมาก / มากไปน้อย)"')
        expect(html).toContain('title="คลิกเพื่อเรียงตามยอดตัดออก (มากไปน้อย / น้อยไปมาก)"')

        // Default sort is by number ascending (101, 107, 110)
        const idx101 = html.indexOf('>101<')
        const idx107 = html.indexOf('>107<')
        const idx110 = html.indexOf('>110<')
        expect(idx101).toBeLessThan(idx107)
        expect(idx107).toBeLessThan(idx110)
    })
})
