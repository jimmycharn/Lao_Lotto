import { describe, it, expect } from 'vitest'
import {
    filterRounds,
    computeOverviewStats,
    formatRoundDate,
    getRoundDateISO,
    formatDateValueThai,
    getTodayDateString
} from '../DealerRoundsAdminTab'

describe('DealerRoundsAdminTab Helpers', () => {
    const mockRounds = [
        {
            id: 'r1',
            dealer_id: 'd1',
            dealer_name: 'เกมส์ สุราษฎร์',
            dealer_email: 'game@gmail.com',
            lottery_type: 'lao',
            lottery_name: 'หวยลาวพัฒนา',
            round_date: '2026-09-08',
            close_time: '2026-09-08T16:59:00Z',
            status: 'open',
            is_result_announced: false,
            submission_count: 10,
            total_amount: 1500
        },
        {
            id: 'r2',
            dealer_id: 'd1',
            dealer_name: 'เกมส์ สุราษฎร์',
            dealer_email: 'game@gmail.com',
            lottery_type: 'thai',
            lottery_name: 'หวยไทย',
            round_date: '2026-09-01',
            close_time: '2026-09-01T16:59:00Z',
            status: 'announced',
            is_result_announced: true,
            submission_count: 12020,
            total_amount: 550000
        },
        {
            id: 'r3',
            dealer_id: 'd2',
            dealer_name: 'จิมมี่ ชาน',
            dealer_email: 'jimmy@gmail.com',
            lottery_type: 'thai',
            lottery_name: 'หวยไทย',
            round_date: '2026-09-05',
            close_time: '2026-09-05T16:59:00Z',
            status: 'closed',
            is_result_announced: false,
            submission_count: 61,
            total_amount: 12000
        },
        {
            id: 'r4',
            dealer_id: 'd2',
            dealer_name: 'จิมมี่ ชาน',
            dealer_email: 'jimmy@gmail.com',
            lottery_type: 'lao',
            lottery_name: 'หวยลาว',
            round_date: '2026-08-25',
            close_time: '2026-08-25T16:59:00Z',
            status: 'announced',
            is_result_announced: true,
            submission_count: 1251,
            total_amount: 80000
        }
    ]

    describe('computeOverviewStats', () => {
        it('calculates aggregate statistics correctly', () => {
            const stats = computeOverviewStats(mockRounds)
            expect(stats.totalRounds).toBe(4)
            expect(stats.openRounds).toBe(1)
            expect(stats.closedRounds).toBe(1)
            expect(stats.announcedRounds).toBe(2)
            expect(stats.totalSubmissions).toBe(13342) // 10 + 12020 + 61 + 1251
            expect(stats.totalAmount).toBe(643500)
        })

        it('handles empty rounds array safely', () => {
            const stats = computeOverviewStats([])
            expect(stats.totalRounds).toBe(0)
            expect(stats.openRounds).toBe(0)
            expect(stats.closedRounds).toBe(0)
            expect(stats.announcedRounds).toBe(0)
            expect(stats.totalSubmissions).toBe(0)
            expect(stats.totalAmount).toBe(0)
        })
    })

    describe('filterRounds', () => {
        it('filters by dealerId', () => {
            const d1Rounds = filterRounds(mockRounds, { dealerId: 'd1', statusFilter: 'all', searchTerm: '' })
            expect(d1Rounds).toHaveLength(2)
            expect(d1Rounds.every(r => r.dealer_id === 'd1')).toBe(true)

            const d2Rounds = filterRounds(mockRounds, { dealerId: 'd2', statusFilter: 'all', searchTerm: '' })
            expect(d2Rounds).toHaveLength(2)
            expect(d2Rounds.every(r => r.dealer_id === 'd2')).toBe(true)
        })

        it('filters by statusFilter: open', () => {
            const openOnly = filterRounds(mockRounds, { dealerId: 'all', statusFilter: 'open', searchTerm: '' })
            expect(openOnly).toHaveLength(1)
            expect(openOnly[0].id).toBe('r1')
        })

        it('filters by statusFilter: closed (pending results)', () => {
            const closedOnly = filterRounds(mockRounds, { dealerId: 'all', statusFilter: 'closed', searchTerm: '' })
            expect(closedOnly).toHaveLength(1)
            expect(closedOnly[0].id).toBe('r3')
        })

        it('filters by statusFilter: announced', () => {
            const announcedOnly = filterRounds(mockRounds, { dealerId: 'all', statusFilter: 'announced', searchTerm: '' })
            expect(announcedOnly).toHaveLength(2)
            expect(announcedOnly.map(r => r.id)).toEqual(['r2', 'r4'])
        })

        it('filters by searchTerm matching dealer name or lottery name', () => {
            const searchLao = filterRounds(mockRounds, { dealerId: 'all', statusFilter: 'all', searchTerm: 'ลาว' })
            expect(searchLao).toHaveLength(2)

            const searchJimmy = filterRounds(mockRounds, { dealerId: 'all', statusFilter: 'all', searchTerm: 'จิมมี่' })
            expect(searchJimmy).toHaveLength(2)
        })

        it('filters by dateFilterType: all (shows all dates)', () => {
            const allDates = filterRounds(mockRounds, {
                dealerId: 'all',
                statusFilter: 'all',
                searchTerm: '',
                dateFilterType: 'all',
                dateFilterValue: '2026-09-05'
            })
            expect(allDates).toHaveLength(4)
        })

        it('filters by dateFilterType: before (shows rounds strictly before given date)', () => {
            // Given date: 2026-09-05
            // Rounds strictly before 2026-09-05 are r2 (2026-09-01) and r4 (2026-08-25)
            const beforeRounds = filterRounds(mockRounds, {
                dealerId: 'all',
                statusFilter: 'all',
                searchTerm: '',
                dateFilterType: 'before',
                dateFilterValue: '2026-09-05'
            })
            expect(beforeRounds).toHaveLength(2)
            expect(beforeRounds.map(r => r.id)).toEqual(['r2', 'r4'])
        })

        it('filters by dateFilterType: exact (shows only rounds matching given date)', () => {
            const exactRounds = filterRounds(mockRounds, {
                dealerId: 'all',
                statusFilter: 'all',
                searchTerm: '',
                dateFilterType: 'exact',
                dateFilterValue: '2026-09-08'
            })
            expect(exactRounds).toHaveLength(1)
            expect(exactRounds[0].id).toBe('r1')
        })

        it('returns empty list if exact date has no matches', () => {
            const exactRounds = filterRounds(mockRounds, {
                dealerId: 'all',
                statusFilter: 'all',
                searchTerm: '',
                dateFilterType: 'exact',
                dateFilterValue: '2026-01-01'
            })
            expect(exactRounds).toHaveLength(0)
        })
    })

    describe('formatRoundDate', () => {
        it('prioritizes close_time date over round_date', () => {
            const round = {
                round_date: '2026-08-31',
                close_time: '2026-09-01T16:59:59.000Z'
            }
            const formatted = formatRoundDate(round)
            expect(formatted).toContain('2569')
            expect(formatted).toContain('ก.ย.')
        })

        it('falls back to round_date if close_time is missing', () => {
            const round = {
                round_date: '2026-08-31',
                close_time: null
            }
            const formatted = formatRoundDate(round)
            expect(formatted).toContain('2569')
            expect(formatted).toContain('ส.ค.')
        })

        it('returns "-" if round or date fields are missing', () => {
            expect(formatRoundDate(null)).toBe('-')
            expect(formatRoundDate({})).toBe('-')
        })
    })

    describe('Date Helpers', () => {
        it('getRoundDateISO formats dates to YYYY-MM-DD in Asia/Bangkok', () => {
            const round = {
                close_time: '2026-09-07T16:59:00Z' // 23:59 Bangkok on 2026-09-07
            }
            expect(getRoundDateISO(round)).toBe('2026-09-07')
            expect(getRoundDateISO(null)).toBe('')
            expect(getRoundDateISO({})).toBe('')
        })

        it('formatDateValueThai formats YYYY-MM-DD string into Thai date', () => {
            expect(formatDateValueThai('2026-09-07')).toContain('7 ก.ย. 2569')
            expect(formatDateValueThai('')).toBe('')
        })

        it('getTodayDateString returns a valid YYYY-MM-DD string', () => {
            const today = getTodayDateString()
            expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        })
    })
})

