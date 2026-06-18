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
})
