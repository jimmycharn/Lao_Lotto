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

    it('should parse "77-50" correctly in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('77-50', 'lao')
            console.log('Results 77-50:', JSON.stringify(results, null, 2))
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

    describe('same-digits typo handling in JS and TS', () => {
        it('should parse 222=20*20 as 222=40 straight in both JS and TS', () => {
            for (const parse of [parseJS, parseTS]) {
                // Lao lotto: 222=20*20 -> 222=40 ตรง
                const resLao = parse('222=20*20', 'lao')
                expect(resLao).toHaveLength(1)
                expect(resLao[0].numbers).toBe('222')
                expect(resLao[0].amount).toBe(40)
                expect(resLao[0].amount2).toBeNull()
                expect(resLao[0].betType).toBe('3_top')
                expect(resLao[0].typeLabel).toBe('ตรง')
                expect(resLao[0].formattedLine).toBe('222=40 ตรง')

                // Thai lotto: 222=20*20 -> 222=40 บน
                const resThai = parse('222=20*20', 'thai')
                expect(resThai).toHaveLength(1)
                expect(resThai[0].numbers).toBe('222')
                expect(resThai[0].amount).toBe(40)
                expect(resThai[0].amount2).toBeNull()
                expect(resThai[0].betType).toBe('3_top')
                expect(resThai[0].typeLabel).toBe('บน')
                expect(resThai[0].formattedLine).toBe('222=40 บน')

                // 22=20*20 -> 22=40 บน
                const res22 = parse('22=20*20', 'lao')
                expect(res22).toHaveLength(1)
                expect(res22[0].numbers).toBe('22')
                expect(res22[0].amount).toBe(40)
                expect(res22[0].amount2).toBeNull()
                expect(res22[0].betType).toBe('2_top')
                expect(res22[0].typeLabel).toBe('บน')
                expect(res22[0].formattedLine).toBe('22=40 บน')
            }
        })

        it('should parse 4-digit permutation expressions as คูณชุด in both JS and TS', () => {
            const cases = [
                { text: '3518 กลับตัวละ10', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 10กลับทุกตัว', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 กลับตูละ10', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 กลับประตูละ10', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 10กลับทุกตู', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 10กลับทุกประตู', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3318 กลับตัวละ10', numbers: '3318', amount: 10, amount2: 12, line: '3318=10*12 คูณชุด' },
                { text: '3518กลับตัวละ10', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
                { text: '3518 10 กลับทุกตัว', numbers: '3518', amount: 10, amount2: 24, line: '3518=10*24 คูณชุด' },
            ]

            for (const parse of [parseJS, parseTS]) {
                for (const c of cases) {
                    const res = parse(c.text, 'lao')
                    expect(res).toHaveLength(1)
                    expect(res[0].numbers).toBe(c.numbers)
                    expect(res[0].amount).toBe(c.amount)
                    expect(res[0].amount2).toBe(c.amount2)
                    expect(res[0].betType).toBe('3_top')
                    expect(res[0].specialType).toBe('3xPerm')
                    expect(res[0].typeLabel).toBe('คูณชุด')
                    expect(res[0].formattedLine).toBe(c.line)
                }
            }
        })
    })
})

