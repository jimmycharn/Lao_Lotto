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

  it('should parse inline float bets with equals/colon/spaces correctly (e.g. 9 ลอยล่าง=500)', () => {
    const cases = [
      { text: '9 ลอยล่าง=500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 ลอยล่าง = 500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 ลอยล่าง 500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 ลอยล่าง:500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 ลอยล่าง-500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9ลอยล่าง=500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 วิ่งล่าง=500', numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' },
      { text: '9 ลอยบน=500', numbers: '9', amount: 500, betType: 'run_top', typeLabel: 'ลอยบน' },
      { text: '9 วิ่งบน=500', numbers: '9', amount: 500, betType: 'run_top', typeLabel: 'ลอยบน' },
      { text: '123 โต๊ด=50', numbers: '123', amount: 50, betType: '3_tod', typeLabel: 'โต๊ด' },
      { text: '123โต๊ด=50', numbers: '123', amount: 50, betType: '3_tod', typeLabel: 'โต๊ด' },
    ]

    for (const c of cases) {
      const res = parseMultiLinePaste(c.text, 'thai')
      expect(res).toHaveLength(1)
      expect(res[0]).toMatchObject({
        numbers: c.numbers,
        amount: c.amount,
        betType: c.betType,
        typeLabel: c.typeLabel
      })
    }
  })
})
