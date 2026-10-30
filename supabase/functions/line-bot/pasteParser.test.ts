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

  it('should parse 2-digit float/tod with T or t prefix as 2_run (ลอย) (e.g. T49 = 200, T 49=200, t49 200)', () => {
      const cases = [
        'T49 = 200',
        'T 49=200',
        't49 = 200',
        't 49=200',
        'T49 200',
        't49 200',
        'T 49 200',
        't 49 200',
        'T-49 = 200',
        'T.49 = 200',
        'T49*200',
        'T49-200'
      ]

      for (const text of cases) {
        const res = parseMultiLinePaste(text, 'lao')
        expect(res).toHaveLength(1)
        expect(res[0]).toMatchObject({
          numbers: '49',
          amount: 200,
          betType: '2_run',
          typeLabel: 'ลอย',
          formattedLine: '49=200 ลอย'
        })
      }
    })

    it('should parse the exact user screenshot message with T prefix and suffix correctly', () => {
      const text = `974 = 55 x 6\nT 49 = 300\nT 47 = 200 โต๊ด`
      const res = parseMultiLinePaste(text, 'lao')
      expect(res).toHaveLength(3)

      expect(res[0]).toMatchObject({
        numbers: '974',
        amount: 55,
        amount2: 6,
        betType: '3_top',
        specialType: 'set6',
        typeLabel: 'คูณชุด',
        formattedLine: '974=55*6 คูณชุด'
      })

      expect(res[1]).toMatchObject({
        numbers: '49',
        amount: 300,
        amount2: null,
        betType: '2_run',
        typeLabel: 'ลอย',
        formattedLine: '49=300 ลอย'
      })

      expect(res[2]).toMatchObject({
        numbers: '47',
        amount: 200,
        amount2: null,
        betType: '2_run',
        typeLabel: 'ลอย',
        formattedLine: '47=200 ลอย'
      })
    })

    it('should parse T context header and multi-number lines with T prefix', () => {
      const contextRes = parseMultiLinePaste('T\n49=200\n58=100', 'lao')
      expect(contextRes).toHaveLength(2)
      expect(contextRes[0]).toMatchObject({
        numbers: '49',
        amount: 200,
        betType: '2_run',
        typeLabel: 'ลอย'
      })
      expect(contextRes[1]).toMatchObject({
        numbers: '58',
        amount: 100,
        betType: '2_run',
        typeLabel: 'ลอย'
      })

      const multiRes = parseMultiLinePaste('T 49, 58 = 200', 'lao')
      expect(multiRes).toHaveLength(2)
      expect(multiRes[0]).toMatchObject({
        numbers: '49',
        amount: 200,
        betType: '2_run',
        typeLabel: 'ลอย'
      })
      expect(multiRes[1]).toMatchObject({
        numbers: '58',
        amount: 200,
        betType: '2_run',
        typeLabel: 'ลอย'
      })
    })
})
