import { describe, it, expect } from 'vitest'
import { parseMultiLinePaste as parseJS } from '../src/utils/pasteParser.js'
import { parseMultiLinePaste as parseTS } from '../supabase/functions/line-bot/pasteParser.ts'

describe('colon as amount separator for เต็งโต๊ด', () => {
    it('should parse "713 33:20" as เต็งโต๊ด (3-digit, colon between amounts) in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('713 33:20', 'lao')
            expect(results.length).toBe(1)
            expect(results[0].numbers).toBe('713')
            expect(results[0].amount).toBe(33)
            expect(results[0].amount2).toBe(20)
            expect(results[0].typeLabel).toBe('เต็งโต๊ด')
            expect(results[0].specialType).toBe('tengTod')
        }
    })

    it('should parse multi-line colon format in JS and TS', () => {
        const input = `713 33:20
139 33:20
427 33:20`
        for (const parse of [parseJS, parseTS]) {
            const results = parse(input, 'lao')
            expect(results.length).toBe(3)
            results.forEach(r => {
                expect(r.amount).toBe(33)
                expect(r.amount2).toBe(20)
                expect(r.typeLabel).toBe('เต็งโต๊ด')
                expect(r.specialType).toBe('tengTod')
            })
            expect(results[0].numbers).toBe('713')
            expect(results[1].numbers).toBe('139')
            expect(results[2].numbers).toBe('427')
        }
    })

    it('should parse "610:10" (3-digit colon amount) correctly in JS and TS', () => {
        for (const parse of [parseJS, parseTS]) {
            const results = parse('610:10', 'lao')
            expect(results.length).toBe(1)
            expect(results[0].numbers).toBe('610')
            expect(results[0].amount).toBe(10)
        }
    })
})

