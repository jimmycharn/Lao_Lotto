import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import UserHistoryTab, { formatMonthLabel, getRoundYearMonth } from '../UserHistoryTab'

describe('UserHistoryTab', () => {
    describe('formatMonthLabel & getRoundYearMonth', () => {
        it('should format year-month into Thai label correctly', () => {
            expect(formatMonthLabel('2026-10')).toContain('ตุลาคม')
            expect(formatMonthLabel('2026-10')).toContain('2569')
            expect(formatMonthLabel('all')).toBe('ทุกเดือน')
            expect(formatMonthLabel('')).toBe('ทุกเดือน')
        })

        it('should extract year-month from round item using close date priority', () => {
            const itemWithClose = {
                close_time: '2026-10-05T13:15:00Z',
                round_date: '2026-10-04'
            }
            expect(getRoundYearMonth(itemWithClose)).toBe('2026-10')

            const itemWithRoundDateOnly = {
                round_date: '2026-09-15'
            }
            expect(getRoundYearMonth(itemWithRoundDateOnly)).toBe('2026-09')
        })
    })

    describe('Rendering & Grouping', () => {
        const mockHistory = [
            {
                id: '1',
                lottery_type: 'lao',
                lottery_name: 'หวยลาวพัฒนา',
                close_time: '2026-10-05T13:15:00Z',
                round_date: '2026-10-05',
                total_amount: 2806,
                total_commission: 572,
                total_winnings: 1000,
                profit_loss: -1234
            },
            {
                id: '2',
                lottery_type: 'lao',
                lottery_name: 'หวยลาวพัฒนา',
                close_time: '2026-10-02T13:15:00Z',
                round_date: '2026-10-02',
                total_amount: 2760,
                total_commission: 561,
                total_winnings: 0,
                profit_loss: -2199
            },
            {
                id: '3',
                lottery_type: 'thai',
                lottery_name: 'หวยรัฐบาลไทย',
                close_time: '2026-10-01T08:30:00Z',
                round_date: '2026-10-01',
                total_amount: 5000,
                total_commission: 1000,
                total_winnings: 6000,
                profit_loss: 2000
            },
            {
                id: '4',
                lottery_type: 'hanoi',
                lottery_name: 'หวยฮานอยพิเศษ',
                close_time: '2026-09-30T10:30:00Z',
                round_date: '2026-09-30',
                total_amount: 1500,
                total_commission: 300,
                total_winnings: 0,
                profit_loss: -1200
            }
        ]

        it('renders empty state when history is empty', () => {
            const html = renderToString(<UserHistoryTab history={[]} initialMonth="all" />)
            expect(html).toContain('ไม่มีประวัติ')
        })

        it('starts with current month selected and cards collapsed by default', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} />)
            expect(html).toContain('ขยายทั้งหมด')
            expect(html).not.toContain('user-history-table')
            // Profit card has dedicated class
            expect(html).toContain('user-history-summary-card-profit')
        })

        it('renders separate cards for each lottery type (หวยไทย, หวยลาว, หวยฮานอย)', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} initialMonth="all" />)
            expect(html).toContain('หวยไทย')
            expect(html).toContain('หวยลาว')
            expect(html).toContain('หวยฮานอย')
            // Lao has 2 rounds
            expect(html).toContain('2 งวด')
            // Thai has 1 round
            expect(html).toContain('1 งวด')
        })

        it('renders table headers and row data when expanded', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} initialMonth="all" initialExpandedAll={true} />)
            expect(html).toContain('งวดวันที่')
            expect(html).toContain('ยอดส่ง')
            expect(html).toContain('ค่าคอม')
            expect(html).toContain('รางวัล')
            expect(html).toContain('กำไร')
            expect(html).toContain('user-history-table')
        })

        it('renders the formatted Thai date and amounts matching the user request when expanded', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} initialMonth="all" initialExpandedAll={true} />)
            // 5 ต.ค. 2569
            expect(html).toContain('5 ต.ค. 2569')
            expect(html).toContain('2,806')
            expect(html).toContain('572')
            expect(html).toContain('1,000')
            expect(html).toContain('-฿1,234')

            // 2 ต.ค. 2569
            expect(html).toContain('2 ต.ค. 2569')
            expect(html).toContain('2,760')
            expect(html).toContain('561')
            expect(html).toContain('-฿2,199')

            // Thai lottery positive profit: +฿2,000
            expect(html).toContain('1 ต.ค. 2569')
            expect(html).toContain('+฿2,000')
        })

        it('renders filter bar with month and lottery type dropdowns', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} initialMonth="all" />)
            expect(html).toContain('เลือกเดือน:')
            expect(html).toContain('ประเภทหวย:')
            expect(html).toContain('ทุกเดือน')
            expect(html).toContain('ทุกประเภทหวย')
        })

        it('renders overall summary stats header', () => {
            const html = renderToString(<UserHistoryTab history={mockHistory} initialMonth="all" />)
            expect(html).toContain('งวดทั้งหมด')
            expect(html).toContain('4 งวด')
            expect(html).toContain('ยอดส่งรวม')
            expect(html).toContain('ค่าคอมรวม')
            expect(html).toContain('รางวัลรวม')
            expect(html).toContain('กำไร/ขาดทุนสุทธิ')
        })

        it('calculates profit_loss correctly if profit_loss is null (winnings + comm - sent)', () => {
            const historyWithNullProfit = [
                {
                    id: '10',
                    lottery_type: 'stock',
                    close_time: '2026-10-09T09:30:00Z',
                    total_amount: 1000,
                    total_commission: 200,
                    total_winnings: 1500,
                    profit_loss: null
                }
            ]
            const html = renderToString(<UserHistoryTab history={historyWithNullProfit} initialMonth="all" initialExpandedAll={true} />)
            expect(html).toContain('หวยหุ้น')
            // Profit = 1500 + 200 - 1000 = +700
            expect(html).toContain('+฿700')
        })

        it('supports custom currency symbol', () => {
            const historyCustom = [
                {
                    id: '11',
                    lottery_type: 'lao',
                    close_time: '2026-10-09T13:30:00Z',
                    total_amount: 100000,
                    total_commission: 20000,
                    total_winnings: 0,
                    profit_loss: -80000
                }
            ]
            const html = renderToString(<UserHistoryTab history={historyCustom} currencySymbol="₭" initialMonth="all" initialExpandedAll={true} />)
            expect(html).toContain('₭100,000')
            expect(html).toContain('-₭80,000')
        })

        it('displays active announced rounds (is_active_announced) seamlessly in tables and stats', () => {
            const historyWithActiveAnnounced = [
                {
                    id: 'active_round_123',
                    round_id: 'round_123',
                    lottery_type: 'thai',
                    lottery_name: 'หวยรัฐบาลไทย',
                    close_time: '2026-10-16T15:30:00Z',
                    round_date: '2026-10-16',
                    total_entries: 5,
                    total_amount: 3000,
                    total_commission: 600,
                    total_winnings: 4000,
                    profit_loss: 1600,
                    is_active_announced: true
                }
            ]
            const html = renderToString(<UserHistoryTab history={historyWithActiveAnnounced} initialExpandedAll={true} />)
            expect(html).toContain('หวยไทย')
            expect(html).toContain('16 ต.ค. 2569')
            expect(html).toContain('฿3,000')
            expect(html).toContain('฿600')
            expect(html).toContain('฿4,000')
            expect(html).toContain('+฿1,600')
        })

        it('rounds decimal commission, amount, and prize to integers in table rows', () => {
            const decimalHistory = [
                {
                    id: 'thai_1',
                    lottery_type: 'thai',
                    lottery_name: 'หวยไทย',
                    close_time: '2026-10-01T08:30:00Z',
                    round_date: '2026-10-01',
                    total_amount: 62141,
                    total_commission: 14022.65,
                    total_winnings: 45600,
                    profit_loss: -2518.35
                }
            ]
            const html = renderToString(<UserHistoryTab history={decimalHistory} initialMonth="all" initialExpandedAll={true} />)
            // Commission 14022.65 must be rounded to 14,023 instead of 14,022.65
            expect(html).toContain('฿14,023')
            expect(html).not.toContain('14,022.65')
            // Profit -2518.35 must be rounded to -฿2,518
            expect(html).toContain('-฿2,518')
            expect(html).not.toContain('2,518.35')
        })
    })
})

