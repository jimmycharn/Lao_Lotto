import { describe, it, expect } from 'vitest'
import { parseMultiLinePaste } from './pasteParser.ts'

describe('line-bot pasteParser - parenthetical multipliers with operator', () => {
  it('should parse 694 = 500*(200×5) and variations correctly as กลับ', () => {
    const cases = [
      '694 = 500*(200×5)',
      '694 = 500*(200*5)',
      '694 = 500 * (200 × 5)',
      '694 = 500*(5×200)',
      '694 = 500(200×5)',
      '694 = 500*200*5',
      '694 = 500*5*200'
    ]
    for (const text of cases) {
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '694',
        amount: 500,
        amount2: 200,
        betType: '3_top',
        specialType: 'reverse',
        typeLabel: 'กลับ'
      })
    }
  })
})
