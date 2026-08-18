import { describe, it, expect } from 'vitest'
import { parseWinningNumbers, getWinningNumberFormatHelp, THAI_MAX_3_BOTTOM } from './winningNumbers.ts'

describe('parseWinningNumbers - lao / hanoi', () => {
    it('parses a 4-digit set and derives the sub-prizes', () => {
        expect(parseWinningNumbers('1234', 'lao')).toEqual({
            '4_set': '1234',
            '3_top': '234',
            '2_top': '34',
            '2_bottom': '12'
        })
    })

    it('works for hanoi and is case-insensitive on the type', () => {
        expect(parseWinningNumbers('5678', 'HANOI')).toEqual({
            '4_set': '5678',
            '3_top': '678',
            '2_top': '78',
            '2_bottom': '56'
        })
    })

    it('rejects anything that is not exactly 4 digits', () => {
        expect(parseWinningNumbers('123', 'lao')).toBeNull()
        expect(parseWinningNumbers('12345', 'lao')).toBeNull()
        expect(parseWinningNumbers('123456/25', 'lao')).toBeNull()
    })
})

describe('parseWinningNumbers - thai two-part (123456/25)', () => {
    it('parses the first prize and 2 ตัวล่าง', () => {
        expect(parseWinningNumbers('123456/25', 'thai')).toEqual({
            '6_top': '123456',
            '3_top': '456',
            '2_top': '56',
            '2_bottom': '25',
            '3_bottom': []
        })
    })

    it('leaves 3_bottom empty so no 3 ตัวล่าง bet can win', () => {
        expect(parseWinningNumbers('123456/25', 'thai')['3_bottom']).toEqual([])
    })
})

describe('parseWinningNumbers - thai three-part (123456/124,456,254,784/25)', () => {
    it('parses all 4 three-digit ล่าง prizes', () => {
        expect(parseWinningNumbers('123456/124,456,254,784/25', 'thai')).toEqual({
            '6_top': '123456',
            '3_top': '456',
            '2_top': '56',
            '2_bottom': '25',
            '3_bottom': ['124', '456', '254', '784']
        })
    })

    it('derives 3_top and 2_top from the first prize, not from the middle group', () => {
        const result = parseWinningNumbers('987654/111,222/33', 'thai')
        expect(result['3_top']).toBe('654')
        expect(result['2_top']).toBe('54')
        expect(result['2_bottom']).toBe('33')
    })

    it('accepts fewer than 4 three-digit prizes', () => {
        expect(parseWinningNumbers('123456/124/25', 'thai')['3_bottom']).toEqual(['124'])
        expect(parseWinningNumbers('123456/124,456/25', 'thai')['3_bottom']).toEqual(['124', '456'])
        expect(parseWinningNumbers('123456/124,456,254/25', 'thai')['3_bottom']).toEqual(['124', '456', '254'])
    })

    it('ignores spaces around the commas', () => {
        expect(parseWinningNumbers('123456 / 124, 456, 254, 784 / 25', 'thai')['3_bottom'])
            .toEqual(['124', '456', '254', '784'])
    })

    it('keeps duplicate prizes rather than silently deduping', () => {
        expect(parseWinningNumbers('123456/124,124/25', 'thai')['3_bottom']).toEqual(['124', '124'])
    })

    it(`rejects more than ${THAI_MAX_3_BOTTOM} three-digit prizes`, () => {
        expect(parseWinningNumbers('123456/124,456,254,784,999/25', 'thai')).toBeNull()
    })

    it('rejects a middle group that is not exactly 3 digits per entry', () => {
        expect(parseWinningNumbers('123456/12,456/25', 'thai')).toBeNull()
        expect(parseWinningNumbers('123456/1244,456/25', 'thai')).toBeNull()
    })

    it('rejects a trailing or leading comma', () => {
        expect(parseWinningNumbers('123456/124,/25', 'thai')).toBeNull()
        expect(parseWinningNumbers('123456/,124/25', 'thai')).toBeNull()
    })

    it('rejects a wrong-length first prize or 2 ตัวล่าง', () => {
        expect(parseWinningNumbers('12345/124/25', 'thai')).toBeNull()
        expect(parseWinningNumbers('123456/124/5', 'thai')).toBeNull()
    })
})

describe('parseWinningNumbers - stock', () => {
    it('parses 2 ตัวบน / 2 ตัวล่าง', () => {
        expect(parseWinningNumbers('25/49', 'stock')).toEqual({
            '2_top': '25',
            '2_bottom': '49'
        })
    })

    it('rejects a missing separator', () => {
        expect(parseWinningNumbers('2549', 'stock')).toBeNull()
    })
})

describe('parseWinningNumbers - member code must never look like winning numbers', () => {
    // /สรุป 10048 must fall through to the member lookup for every lottery type,
    // otherwise typing a member code would announce a result.
    const codes = ['10001', '10048', '99999', '100000']

    for (const type of ['lao', 'hanoi', 'thai', 'stock']) {
        it(`does not parse a bare member code as ${type} winning numbers`, () => {
            for (const code of codes) {
                expect(parseWinningNumbers(code, type)).toBeNull()
            }
        })
    }
})

describe('parseWinningNumbers - unsupported types', () => {
    it('returns null for types the announce command cannot handle yet', () => {
        expect(parseWinningNumbers('1234', 'yeekee')).toBeNull()
        expect(parseWinningNumbers('1234', 'lao_extra')).toBeNull()
        expect(parseWinningNumbers('1234', 'lao_vip')).toBeNull()
    })
})

describe('getWinningNumberFormatHelp', () => {
    it('shows both thai formats', () => {
        const help = getWinningNumberFormatHelp('thai')
        expect(help).toContain('123456/25')
        expect(help).toContain('123456/124,456,254,784/25')
    })

    it('shows the 4-digit example for lao and hanoi', () => {
        expect(getWinningNumberFormatHelp('lao')).toContain('/สรุป 1234')
        expect(getWinningNumberFormatHelp('hanoi')).toContain('/สรุป 1234')
    })

    it('shows the stock example', () => {
        expect(getWinningNumberFormatHelp('stock')).toContain('25/49')
    })

    it('explains that other types are unsupported', () => {
        expect(getWinningNumberFormatHelp('yeekee')).toContain('ยังไม่รองรับ')
    })
})
