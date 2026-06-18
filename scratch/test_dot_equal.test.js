import { describe, it, expect } from 'vitest'
import { parseMultiLinePaste as parseJS } from '../src/utils/pasteParser.js'
import { parseMultiLinePaste as parseTS } from '../supabase/functions/line-bot/pasteParser.ts'

describe('dot-equal typo handling', () => {
    it('should parse "980.=22*10" correctly in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('980.=22*10', 'lao')
            console.log('Results:', JSON.stringify(results, null, 2))
            expect(results.length).toBe(1)
            expect(results[0].numbers).toBe('980')
            expect(results[0].amount).toBe(22)
            expect(results[0].amount2).toBe(10)
            expect(results[0].typeLabel).toBe('เต็งโต๊ด')
        }
    })

    it('should parse "980. = 22*10" correctly in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('980. = 22*10', 'lao')
            expect(results.length).toBe(1)
            expect(results[0].numbers).toBe('980')
            expect(results[0].amount).toBe(22)
            expect(results[0].amount2).toBe(10)
        }
    })

    it('should parse "980=.22*10" correctly in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('980=.22*10', 'lao')
            expect(results.length).toBe(1)
            expect(results[0].numbers).toBe('980')
            expect(results[0].amount).toBe(22)
            expect(results[0].amount2).toBe(10)
        }
    })

    it('should parse the user screenshot input correctly in JS and TS', () => {
        const input = `ล
17=50*50
20=50*50
64=50*50
90=50*50
68.50*50
22=20
55=20
25=100*100
92=50*50
93=50*50`
        for (const parse of [parseJS, parseTS]) {
            const results = parse(input, 'lao')
            console.log('Full Paste Results:', results.map(r => `${r.formattedLine} | ${r.typeLabel}`))
            expect(results.length).toBe(10)
            expect(results[4].numbers).toBe('68')
            expect(results[4].amount).toBe(50)
            expect(results[4].amount2).toBe(50)
            expect(results[4].typeLabel).toBe('ล่างกลับ')
        }
    })

    describe('parseMonthYearParam date logic', () => {
        function parseMonthYearParam(param) {
            const clean = param.replace(/\s+/g, '')
            const match = clean.match(/^(\d{1,2})[-/](\d{2,4})$/)
            if (!match) return null

            const month = parseInt(match[1], 10)
            let year = parseInt(match[2], 10)

            if (month < 1 || month > 12) return null

            if (year >= 2500) {
                year = year - 543
            } else if (year >= 50 && year < 100) {
                year = (2500 + year) - 543
            } else if (year < 50) {
                year = 2000 + year
            }

            return { month, year }
        }

        it('should correctly parse and normalize various month-year formats', () => {
            // Thai 2-digit Buddhist Era (e.g. 6-69 -> June 2026)
            expect(parseMonthYearParam('6-69')).toEqual({ month: 6, year: 2026 })
            // Thai 4-digit Buddhist Era (e.g. 6-2569 -> June 2026)
            expect(parseMonthYearParam('6-2569')).toEqual({ month: 6, year: 2026 })
            // 2-digit Common Era (e.g. 6-26 -> June 2026)
            expect(parseMonthYearParam('6-26')).toEqual({ month: 6, year: 2026 })
            // 4-digit Common Era (e.g. 6-2026 -> June 2026)
            expect(parseMonthYearParam('6-2026')).toEqual({ month: 6, year: 2026 })
            // Slash separator
            expect(parseMonthYearParam('6/2569')).toEqual({ month: 6, year: 2026 })
            // Invalid month
            expect(parseMonthYearParam('13-2569')).toBeNull()
            // Invalid formats
            expect(parseMonthYearParam('abc')).toBeNull()
        })
    })
})
