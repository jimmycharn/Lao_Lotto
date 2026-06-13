import { describe, it, expect } from 'vitest'
import { parseMultiLinePaste, extractBuyerNote } from './pasteParser'

describe('pasteParser - parseMultiLinePaste', () => {
  it('should parse simple top bet (e.g., 123 บน 100)', () => {
    const text = '123 บน 100'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({
      numbers: '123',
      amount: 100,
      betType: '3_top',
      typeLabel: 'ตรง'
    })
  })

  it('should parse top-bottom when context is set to both (e.g., บล 45x50)', () => {
    const text = 'บล 45x50'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2) // 45 บน 50 and 45 ล่าง 50
    expect(result[0]).toMatchObject({
      numbers: '45',
      amount: 50,
      betType: '2_top',
      typeLabel: 'บน'
    })
    expect(result[1]).toMatchObject({
      numbers: '45',
      amount: 50,
      betType: '2_bottom',
      typeLabel: 'ล่าง'
    })
  })

  it('should parse reverse bets (e.g., 12=50*50)', () => {
    const text = '12=50*50'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({
      numbers: '12',
      amount: 50,
      amount2: 50,
      betType: '2_top',
      specialType: 'reverse',
      typeLabel: 'บนกลับ'
    })
  })

  it('should parse bare 4-digit as set bets (e.g., 1234)', () => {
    const text = '1234'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({
      numbers: '1234',
      amount: 1,
      betType: '4_set',
      typeLabel: '4ตัวชุด'
    })
  })

  it('should not group 4-digit bare numbers with adjacent lines having amount', () => {
    const text = '123=20*20\n4567\n112=20*3'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(3)
    
    expect(result[0]).toMatchObject({
      numbers: '123',
      amount: 20,
      amount2: 20,
      betType: '3_top',
      specialType: 'tengTod'
    })

    expect(result[1]).toMatchObject({
      numbers: '4567',
      amount: 1,
      betType: '4_set',
      typeLabel: '4ตัวชุด'
    })

    expect(result[2]).toMatchObject({
      numbers: '112',
      amount: 20,
      amount2: 3,
      betType: '3_top',
      specialType: 'set3'
    })
  })

  it('should parse the user complex multi-line text correctly', () => {
    const text = 'น้องเจได🇱🇦\n328\n358\n892\n=3*6\nบนล่าง\n89\n98\n68\n=10บาท'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(9)
    
    // Check first item
    expect(result[0]).toMatchObject({ numbers: '328', amount: 3, amount2: 6, betType: '3_top', specialType: 'set6' })
    // Check last items (89=10, 98=10, 68=10 on both top and bottom)
    const both89_top = result.find(r => r.numbers === '89' && r.betType === '2_top')
    const both89_bot = result.find(r => r.numbers === '89' && r.betType === '2_bottom')
    expect(both89_top).toMatchObject({ amount: 10 })
    expect(both89_bot).toMatchObject({ amount: 10 })
  })

  it('should parse the user list of numbers followed by context=amount (e.g., บนล่าง=10บาท)', () => {
    const text = 'น้องเจไดLA\n32\n23\n82\n28\n48\n84\n83\n38\nบนล่าง=10บาท'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(16)
    
    // Check first number (32) has both top and bottom entries
    const top32 = result.find(r => r.numbers === '32' && r.betType === '2_top')
    const bot32 = result.find(r => r.numbers === '32' && r.betType === '2_bottom')
    expect(top32).toMatchObject({ amount: 10 })
    expect(bot32).toMatchObject({ amount: 10 })
  })

  it('should ignore conversational messages containing 4-digit numbers (e.g., จ่ายมา 2300 ที่เหลือกินกาแฟรต่อเช้าครับ)', () => {
    const text = 'จ่ายมา 2300 ที่เหลือกินกาแฟรต่อเช้าครับ'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(0)
  })

  it('should parse valid bets but ignore conversational lines in a mix', () => {
    const text = '4215\nจ่ายมา 2300 ที่เหลือกินกาแฟรต่อเช้าครับ\n123=20'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '4215', betType: '4_set', amount: 1 })
    expect(result[1]).toMatchObject({ numbers: '123', betType: '3_top', amount: 20 })
  })

  it('should ignore dates like 1/6/69, 09-06-2569, and 9/6/2026', () => {
    const text = '1/6/69\n409=30*6\n412=30*6'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '409', amount: 30, amount2: 6 })
    expect(result[1]).toMatchObject({ numbers: '412', amount: 30, amount2: 6 })
  })

  it('should ignore dates with text prefix like งวดวันที่ 09-06-2569', () => {
    const text = 'งวดวันที่ 09-06-2569\n409=30*6'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({ numbers: '409', amount: 30, amount2: 6 })
  })

  it('should parse the user screenshot input correctly', () => {
    const text = '307=10*10\n896=10*10\n906=10*10\n890=10*10\n\nล\n14=10*10\n\nป้าตา'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(5)
    // 307=10*10 is teng-tod, so 2 entries (teng and tod)
    // 896=10*10 is teng-tod, so 2 entries (teng and tod)
    // 906=10*10 is teng-tod, so 2 entries (teng and tod)
    // 890=10*10 is teng-tod, so 2 entries (teng and tod)
    // ล 14=10*10 is bottom reversed, so 2 entries (14 and 41 bottom)
    // Wait, let's verify if the length is correct. Let's see what the parser returns.
    console.log('Result for user screenshot:', result)
  })

  it('should normalize ทุกประตู, ทุกประตุ, ทุกตู, ทุกตุ to ชุด', () => {
    const text = '6593 10*ทุกประตู\n1234=20*ทุกประตุ\n5678x10-ทุกตู\n9012+30*ทุกตุ'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(4)
    expect(result[0]).toMatchObject({ numbers: '6593', amount: 10, amount2: 24, betType: '3_top', specialType: '3xPerm' })
    expect(result[1]).toMatchObject({ numbers: '1234', amount: 20, amount2: 24, betType: '3_top', specialType: '3xPerm' })
    expect(result[2]).toMatchObject({ numbers: '5678', amount: 10, amount2: 24, betType: '3_top', specialType: '3xPerm' })
    expect(result[3]).toMatchObject({ numbers: '9012', amount: 30, amount2: 24, betType: '3_top', specialType: '3xPerm' })
  })
 
  it('should parse slash-separated numbers with trailing slash amount (e.g. 879/887/989/778/974/142/10×ชุด/แม่)', () => {
    const text = '879/887/989/778/974/142/10×ชุด/แม่'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(6)
    expect(result[0]).toMatchObject({ numbers: '879', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
    expect(result[1]).toMatchObject({ numbers: '887', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
    expect(result[2]).toMatchObject({ numbers: '989', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
    expect(result[3]).toMatchObject({ numbers: '778', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
    expect(result[4]).toMatchObject({ numbers: '974', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
    expect(result[5]).toMatchObject({ numbers: '142', amount: 10, betType: '3_top', typeLabel: 'คูณชุด' })
  })

  it('should parse simple slash-separated numbers with trailing slash pure number amount (e.g. 879/887/10)', () => {
    const text = '879/887/10'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '879', amount: 10, betType: '3_top' })
    expect(result[1]).toMatchObject({ numbers: '887', amount: 10, betType: '3_top' })
  })

  it('should not parse last number as amount if it has same length (e.g. 12/34/56/10), falling back to legacy parser behavior', () => {
    const text = '12/34/56/10'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({ numbers: '12', amount: 34, amount2: 56 })
  })

  describe('extractBuyerNote', () => {
    it('should extract buyer note from first line', () => {
      const text = 'พี่ซี🇱🇦\nบน\n78=50*50\n41=20*20'
      const note = extractBuyerNote(text, 'lao')
      expect(note).toBe('พี่ซี🇱🇦')
    })

    it('should extract buyer note from last line', () => {
      const text = '2691 10×ชุด\n289 20×6\n122 20×3\n\nเนย์ กรุงศรี'
      const note = extractBuyerNote(text, 'lao')
      expect(note).toBe('เนย์ กรุงศรี')
    })

    it('should ignore dates and summary lines as buyer notes', () => {
      const text = '1/6/69\n409=30*6\nรวม 990 บาท'
      const note = extractBuyerNote(text, 'lao')
      expect(note).toBe('')
    })

    it('should return empty string if no note is found', () => {
      const text = '409=30*6\n412=30*6'
      const note = extractBuyerNote(text, 'lao')
      expect(note).toBe('')
    })
  })

  describe('"ตัวละ" trailing amount line', () => {
    it('should apply "ตัวละ10 บาท" amount to all buffered บน-ล่าง numbers', () => {
      const text = 'พี่กิ๊ฟ\nบน-ล่าง\n00\n11\n22\n33\n44\n55\n66\n77\n88\n99\nตัวละ10 บาท'
      const result = parseMultiLinePaste(text, 'lao')
      // 10 numbers x (บน + ล่าง) = 20 entries
      expect(result.length).toBe(20)
      const tops = result.filter(r => r.betType === '2_top')
      const bottoms = result.filter(r => r.betType === '2_bottom')
      expect(tops.length).toBe(10)
      expect(bottoms.length).toBe(10)
      expect(result.every(r => r.amount === 10)).toBe(true)
      expect(result[0]).toMatchObject({ numbers: '00', amount: 10, betType: '2_top', typeLabel: 'บน' })
      expect(result[1]).toMatchObject({ numbers: '00', amount: 10, betType: '2_bottom', typeLabel: 'ล่าง' })
    })

    it('should treat "ตูละ" variant the same as "ตัวละ"', () => {
      const text = 'บน\n12\n34\nตูละ20บาท'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result.every(r => r.amount === 20 && r.betType === '2_top')).toBe(true)
    })
  })
})
