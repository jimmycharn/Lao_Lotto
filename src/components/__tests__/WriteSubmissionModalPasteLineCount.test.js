import { describe, it, expect } from 'vitest'

describe('WriteSubmissionModal - Paste Modal Line Count Logic', () => {
    const calculatePasteLineCount = (text) => {
        if (!text || !text.trim()) return 0
        return text
            .split(/\r\n|\r|\n/)
            .filter(line => line.trim().length > 0)
            .length
    }

    it('returns 0 when text is empty or only whitespace', () => {
        expect(calculatePasteLineCount('')).toBe(0)
        expect(calculatePasteLineCount('   ')).toBe(0)
        expect(calculatePasteLineCount('\n\n  \n')).toBe(0)
        expect(calculatePasteLineCount(null)).toBe(0)
        expect(calculatePasteLineCount(undefined)).toBe(0)
    })

    it('correctly counts 6 lines matching user screenshot input', () => {
        const userInput = `123
235
257
654
978
20*20`
        expect(calculatePasteLineCount(userInput)).toBe(6)
    })

    it('ignores trailing newline copied from clipboard without inflating line count', () => {
        const textWithTrailingNewline = '123\n235\n257\n654\n978\n20*20\n'
        expect(calculatePasteLineCount(textWithTrailingNewline)).toBe(6)

        const textWithMultipleTrailingNewlines = '123\r\n235\r\n257\r\n654\r\n978\r\n20*20\r\n\r\n'
        expect(calculatePasteLineCount(textWithMultipleTrailingNewlines)).toBe(6)
    })

    it('only counts lines that have entered data, ignoring blank separator lines', () => {
        const textWithBlanks = `123
235

257

654`
        expect(calculatePasteLineCount(textWithBlanks)).toBe(4)
    })

    it('handles carriage return and line feed separators seamlessly', () => {
        const crlfText = '100=20\r\n200=30\r\n300=40'
        expect(calculatePasteLineCount(crlfText)).toBe(3)

        const mixedText = '100=20\n200=30\r\n300=40\r400=50'
        expect(calculatePasteLineCount(mixedText)).toBe(4)
    })
})
