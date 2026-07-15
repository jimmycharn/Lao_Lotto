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
    console.log("RESULT BOTH 45x50:", JSON.stringify(result, null, 2))
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

  it('should parse bare numbers followed by ตัวละ30 (e.g. 237\n377\n560\n490\n192\nตัวละ30\nป้าเปลื้อง)', () => {
    const text = '237\n377\n560\n490\n192\nตัวละ30\nป้าเปลื้อง'
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Pa Pleung:', result)
    expect(result.length).toBe(5)
  })

  it('should parse bare numbers followed by ตัวตรง ตัวละ30 (e.g. 237\n377\n560\n490\n192\nตัวตรง ตัวละ30\nป้าเปลื้อง)', () => {
    const text = '237\n377\n560\n490\n192\nตัวตรง ตัวละ30\nป้าเปลื้อง'
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Pa Pleung with ตัวตรง:', result)
    expect(result.length).toBe(5)
    expect(result[0]).toMatchObject({ numbers: '237', amount: 30, betType: '3_top' })
  })

  it('should parse space-separated amount operators like 150=10 x10, 150=10 x 10, 150=10 * 10', () => {
    const cases = [
      '150=10 x10',
      '150=10 x 10',
      '150=10 * 10'
    ]
    for (const text of cases) {
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '150', amount: 10, amount2: 10, betType: '3_top', specialType: 'tengTod' })
    }
  })

  it('should parse the exact Jack Kra Pao Rua paste correctly', () => {
    const text = `723
891
339
330
500
100
=10xชุด
150=10 x10

ไก่`
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Jack Kra Pao Rua:', result)
    expect(result.length).toBe(7)
    expect(result[0]).toMatchObject({ numbers: '723', amount: 10, betType: '3_top', specialType: 'set6' })
    expect(result[6]).toMatchObject({ numbers: '150', amount: 10, amount2: 10, betType: '3_top', specialType: 'tengTod' })
  })

  it('should parse abbreviations ช and ซ as ชุด correctly (e.g., 10*ช, 10ช, 10ซ, 10 * ซ)', () => {
    const cases = [
      '453 10*ช',
      '453 10ช',
      '453 10ซ',
      '453 10 * ซ'
    ]
    for (const text of cases) {
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '453', amount: 10, amount2: 6, betType: '3_top', specialType: 'set6' })
    }
  })

  it('should parse the exact Mim paste correctly with 10*ช abbreviation', () => {
    const text = `868
874
186
881
643
739
712
253
870
453 10*ช
มิม`
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Mim:', result)
    expect(result.length).toBe(10)
    expect(result[0]).toMatchObject({ numbers: '868', amount: 10, amount2: 3, betType: '3_top', specialType: 'set3' })
    expect(result[1]).toMatchObject({ numbers: '874', amount: 10, amount2: 6, betType: '3_top', specialType: 'set6' })
    expect(result[9]).toMatchObject({ numbers: '453', amount: 10, amount2: 6, betType: '3_top', specialType: 'set6' })
  })

  it('should parse the exact Nong Bow paste correctly with trailing note on amount line', () => {
    const text = `140
418
409
10xชุด น้องโบว์`
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Nong Bow:', result)
    expect(result.length).toBe(3)
    expect(result[0]).toMatchObject({ numbers: '140', amount: 10, amount2: 6, betType: '3_top', specialType: 'set6' })
    expect(result[2]).toMatchObject({ numbers: '409', amount: 10, amount2: 6, betType: '3_top', specialType: 'set6' })
    
    const note = extractBuyerNote(text, 'lao')
    expect(note).toBe('น้องโบว์')
  })

  it('should parse parenthesis-separated list with trailing amount and name (e.g. 305)307)=50xชุด พี่รี)', () => {
    const text = '305)307)=50xชุด พี่รี'
    const result = parseMultiLinePaste(text, 'lao')
    console.log('Result for Pee Ree:', result)
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '305', amount: 50, amount2: 6, betType: '3_top', specialType: 'set6' })
    expect(result[1]).toMatchObject({ numbers: '307', amount: 50, amount2: 6, betType: '3_top', specialType: 'set6' })
    
    const note = extractBuyerNote(text, 'lao')
    expect(note).toBe('พี่รี')
  })

  it('should parse colon-separated number and amount (e.g. 610:10*10 and 510:100*100)', () => {
    const text = '610:10*10\n510:100*100\nพี่สา'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2) // 1 entry per line, with teng (amount) and tod (amount2)
    expect(result[0]).toMatchObject({ numbers: '610', amount: 10, amount2: 10, betType: '3_top', specialType: 'tengTod' })
    expect(result[1]).toMatchObject({ numbers: '510', amount: 100, amount2: 100, betType: '3_top', specialType: 'tengTod' })
    
    const note = extractBuyerNote(text, 'lao')
    expect(note).toBe('พี่สา')
  })

  it('should parse parenthesis-separated bare list followed by trailing amount line', () => {
    const text = '305)307)\nตัวละ50\nพี่รี'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '305', amount: 50, betType: '3_top' })
    expect(result[1]).toMatchObject({ numbers: '307', amount: 50, betType: '3_top' })
    
    const note = extractBuyerNote(text, 'lao')
    expect(note).toBe('พี่รี')
  })

  it('should strip leading list index prefixes like 1) 305 and 2. 307', () => {
    const text = '1) 305=50\n2. 307=50\nพี่รี'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ numbers: '305', amount: 50, betType: '3_top' })
    expect(result[1]).toMatchObject({ numbers: '307', amount: 50, betType: '3_top' })
    
    const note = extractBuyerNote(text, 'lao')
    expect(note).toBe('พี่รี')
  })
  it('should parse 3-digit reverse bets with perm-1 indicator in the middle or end (e.g. 852=1000*5*500 and 852=1000*500*5)', () => {
    const text1 = '852=1000*5*500'
    const result1 = parseMultiLinePaste(text1, 'lao')
    expect(result1.length).toBe(1)
    expect(result1[0]).toMatchObject({
      numbers: '852',
      amount: 1000,
      amount2: 500,
      betType: '3_top',
      specialType: 'reverse',
      typeLabel: 'กลับ (6)'
    })

    const text2 = '852=1000*500*5'
    const result2 = parseMultiLinePaste(text2, 'lao')
    expect(result2.length).toBe(1)
    expect(result2[0]).toMatchObject({
      numbers: '852',
      amount: 1000,
      amount2: 500,
      betType: '3_top',
      specialType: 'reverse',
      typeLabel: 'กลับ (6)'
    })
  })

  it('should parse parenthetical reverse shorthand (e.g. 508=40(10x5)) as กลับ, not เต็งโต๊ด', () => {
    const text = '508=40(10x5)'
    const result = parseMultiLinePaste(text, 'lao')
    expect(result.length).toBe(1)
    expect(result[0]).toMatchObject({
      numbers: '508',
      amount: 40,
      amount2: 10,
      betType: '3_top',
      specialType: 'reverse',
      typeLabel: 'กลับ (6)'
    })
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

    it('should extract buyer note from amount line with trailing note (e.g. 10xชุด น้องโบว์)', () => {
      const text = '140\n418\n409\n10xชุด น้องโบว์'
      const note = extractBuyerNote(text, 'lao')
      expect(note).toBe('น้องโบว์')
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

  describe('No-space inline context', () => {
    it('should parse single digit runner with มี separator (e.g. 8บนมี300) correctly', () => {
      const text = '8บนมี300\nบุศรินทร์'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '8',
        amount: 300,
        betType: 'run_top',
        typeLabel: 'ลอยบน'
      })
      expect(extractBuyerNote(text, 'lao')).toBe('บุศรินทร์')
    })

    it('should parse 79ล่าง100 correctly', () => {
      const text = '79ล่าง100\nพี่ดาว'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '79',
        amount: 100,
        betType: '2_bottom',
        typeLabel: 'ล่าง'
      })
      expect(extractBuyerNote(text, 'lao')).toBe('พี่ดาว')
    })

    it('should parse 79บน100 correctly', () => {
      const text = '79บน100'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '79',
        amount: 100,
        betType: '2_top',
        typeLabel: 'บน'
      })
    })

    it('should parse 79บล100 correctly', () => {
      const text = '79บล100'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({
        numbers: '79',
        amount: 100,
        betType: '2_top'
      })
      expect(result[1]).toMatchObject({
        numbers: '79',
        amount: 100,
        betType: '2_bottom'
      })
    })

    it('should parse 123โต๊ด50 correctly', () => {
      const text = '123โต๊ด50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '123',
        amount: 50,
        betType: '3_tod',
        typeLabel: 'โต๊ด'
      })
    })

    it('should parse 123บน100ล่าง50 correctly for Lao (no 3_bottom, defaults to 3_top/ตรง)', () => {
      const text = '123บน100\n456ล่าง50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({
        numbers: '123',
        amount: 100,
        betType: '3_top'
      })
      expect(result[1]).toMatchObject({
        numbers: '456',
        amount: 50,
        betType: '3_top'
      })
    })

    it('should parse 123บน100ล่าง50 correctly for Thai (supports 3_bottom)', () => {
      const text = '123บน100\n456ล่าง50'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({
        numbers: '123',
        amount: 100,
        betType: '3_top'
      })
      expect(result[1]).toMatchObject({
        numbers: '456',
        amount: 50,
        betType: '3_bottom'
      })
    })

    it('should parse 47-ล่าง 50*50 correctly', () => {
      const text = '47-ล่าง 50*50 น้ำค้าง'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '47',
        amount: 50,
        amount2: 50,
        betType: '2_bottom',
        specialType: 'reverse',
        typeLabel: 'ล่างกลับ'
      })
      expect(extractBuyerNote(text, 'lao')).toBe('น้ำค้าง')
    })
  })

  describe('Parenthetical multipliers', () => {
    it('should parse 742 = 20(10x5) correctly', () => {
      const text = '742 = 20(10x5) พี่แดง'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '742',
        amount: 20,
        amount2: 10,
        betType: '3_top',
        specialType: 'reverse',
        typeLabel: 'กลับ (6)'
      })
      expect(extractBuyerNote(text, 'lao')).toBe('พี่แดง')
    })

    it('should parse 728 = 20(10*5) correctly', () => {
      const text = '728 = 20(10*5)'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '728',
        amount: 20,
        amount2: 10,
        betType: '3_top',
        specialType: 'reverse'
      })
    })

    it('should parse 748 = 20 (10 x 5) with spaces correctly', () => {
      const text = '748 = 20 (10 x 5)'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '748',
        amount: 20,
        amount2: 10,
        betType: '3_top',
        specialType: 'reverse'
      })
    })

    it('should parse duplicate digit number 334 = 20(10x2) correctly', () => {
      const text = '334 = 20(10x2)'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '334',
        amount: 20,
        amount2: 10,
        betType: '3_top',
        specialType: 'reverse',
        typeLabel: 'กลับ (3)'
      })
    })

    it('should auto-reset float context to top when transitioning to 3-digit from non-3-digit', () => {
      const text = 'ลอย\n74310=50\n74219=100\n74210=50\n7594=50\n7594=100\n759=20*6'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(6)
      const entry759 = result.find(r => r.numbers === '759')
      expect(entry759).toBeDefined()
      expect(entry759).toMatchObject({
        numbers: '759',
        amount: 20,
        amount2: 6,
        betType: '3_top',
        specialType: 'set6',
        typeLabel: 'คูณชุด'
      })
    })

    it('should ignore conversational lines with a single set of numbers (e.g. มีลูกค้าโอนทะลุไปออกนั้น200)', () => {
      const text = 'มีลูกค้าโอนทะลุไปออกนั้น200'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(0)
    })

    it('should ignore short conversational single number lines like โอน 200, ยอด 500, สลิป 200', () => {
      const cases = ['โอน 200', 'ยอด 500', 'สลิป 200', 'โอนแล้ว 200', 'จ่ายแล้ว 150']
      for (const text of cases) {
        const result = parseMultiLinePaste(text, 'lao')
        expect(result.length).toBe(0)
      }
    })

    it('should not ignore multiple number sets or valid lottery formats in text (e.g. ซื้อ 23 20*20 บน)', () => {
      const text = 'ซื้อ 23 20*20 บน'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '23',
        amount: 20,
        amount2: 20,
        betType: '2_top',
        specialType: 'reverse'
      })
    })

    it('should not ignore bare number with names or trailing notes (e.g. 20 พี่รี, 10xชุด น้องโบว์)', () => {
      // 20 พี่รี should be ignored because it has text and no betting keywords
      const text1 = '20 พี่รี\n=100'
      const result1 = parseMultiLinePaste(text1, 'lao')
      expect(result1.length).toBe(0)

      // 10xชุด น้องโบว์ should be trailing amount line (contains 'ชุด' which is a bet keyword)
      const text2 = '140\n10xชุด น้องโบว์'
      const result2 = parseMultiLinePaste(text2, 'lao')
      expect(result2.length).toBe(1)
      expect(result2[0]).toMatchObject({
        numbers: '140',
        amount: 10,
        amount2: 6
      })
    })

    it('should ignore list sequence labels like พี่ป้อม 2', () => {
      const text = 'พี่ป้อม 2\n867 = 50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '867',
        amount: 50,
        betType: '3_top'
      })
    })

    it('should ignore list sequence labels with other numbers like พี่นุ้ย 22 or โกชัย 55', () => {
      const text = 'พี่นุ้ย 22\nโกชัย 55\n867 = 50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '867',
        amount: 50,
        betType: '3_top'
      })
    })
  })

  describe('dash-equal typo, "ลอยทั่วไป" context, and 2-digit float_bottom routing', () => {
    it('should normalize z-operator typos as multiplication operators (e.g. 50z50 -> 50*50) correctly', () => {
      const text = '485=50z50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '485',
        amount: 50,
        amount2: 50,
        betType: '3_top',
        specialType: 'tengTod',
        typeLabel: 'เต็งโต๊ด'
      })
    })

    it('should normalize dash-equals typos correctly', () => {
      const text = 'ลอยทั่วไป\n11-=50\n22-=50\n66-=50\n88=50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(4)
      expect(result[0]).toMatchObject({ numbers: '11', amount: 50, betType: '2_run', typeLabel: 'ลอย' })
      expect(result[1]).toMatchObject({ numbers: '22', amount: 50, betType: '2_run', typeLabel: 'ลอย' })
      expect(result[2]).toMatchObject({ numbers: '66', amount: 50, betType: '2_run', typeLabel: 'ลอย' })
      expect(result[3]).toMatchObject({ numbers: '88', amount: 50, betType: '2_run', typeLabel: 'ลอย' })
    })

    it('should parse inline ลอยทั่วไป correctly', () => {
      const text = '11=50 ลอยทั่วไป'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '11', amount: 50, betType: '2_run', typeLabel: 'ลอย' })
    })

    it('should route 2-digit running bottom bets to 2_bottom (ล่าง)', () => {
      const text = 'วิ่งล่าง\n11=50\n22=50'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '11', amount: 50, betType: '2_bottom', typeLabel: 'ล่าง' })
      expect(result[1]).toMatchObject({ numbers: '22', amount: 50, betType: '2_bottom', typeLabel: 'ล่าง' })
    })

    it('should route 2-digit running bottom inline bets to 2_bottom (ล่าง)', () => {
      const text = '11=50 วิ่งล่าง'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '11', amount: 50, betType: '2_bottom', typeLabel: 'ล่าง' })
    })

    it('should parse 16=บน30x30 correctly', () => {
      const text = '16=บน30×30\n16=ล่าง30×30'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({
        numbers: '16',
        amount: 30,
        amount2: 30,
        betType: '2_top',
        specialType: 'reverse',
        typeLabel: 'บนกลับ'
      })
      expect(result[1]).toMatchObject({
        numbers: '16',
        amount: 30,
        amount2: 30,
        betType: '2_bottom',
        specialType: 'reverse',
        typeLabel: 'ล่างกลับ'
      })
    })

    it('should parse bare numbers with trailing both-context amount (e.g. 79, 29, 77 and =50 บนล่าง)', () => {
      const text = '79\n29\n77\n\n=50 บนล่าง'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(6)
      
      // 79 top & bottom
      expect(result[0]).toMatchObject({ numbers: '79', amount: 50, betType: '2_top' })
      expect(result[1]).toMatchObject({ numbers: '79', amount: 50, betType: '2_bottom' })
      
      // 29 top & bottom
      expect(result[2]).toMatchObject({ numbers: '29', amount: 50, betType: '2_top' })
      expect(result[3]).toMatchObject({ numbers: '29', amount: 50, betType: '2_bottom' })
      
      // 77 top & bottom
      expect(result[4]).toMatchObject({ numbers: '77', amount: 50, betType: '2_top' })
      expect(result[5]).toMatchObject({ numbers: '77', amount: 50, betType: '2_bottom' })
    })

    it('should parse dash-separated number lists with prefixes (e.g. บ05-50=20 and ล.05-50=20)', () => {
      const text = 'บ05-50=20\nล.05-50=20\nบ.87-78=20\nล.87-78=20'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(8)
      
      // บ05-50=20 (two top entries)
      expect(result[0]).toMatchObject({ numbers: '05', amount: 20, betType: '2_top' })
      expect(result[1]).toMatchObject({ numbers: '50', amount: 20, betType: '2_top' })

      // ล.05-50=20 (two bottom entries)
      expect(result[2]).toMatchObject({ numbers: '05', amount: 20, betType: '2_bottom' })
      expect(result[3]).toMatchObject({ numbers: '50', amount: 20, betType: '2_bottom' })

      // บ.87-78=20 (two top entries)
      expect(result[4]).toMatchObject({ numbers: '87', amount: 20, betType: '2_top' })
      expect(result[5]).toMatchObject({ numbers: '78', amount: 20, betType: '2_top' })

      // ล.87-78=20 (two bottom entries)
      expect(result[6]).toMatchObject({ numbers: '87', amount: 20, betType: '2_bottom' })
      expect(result[7]).toMatchObject({ numbers: '78', amount: 20, betType: '2_bottom' })
    })

    it('should parse trailing บล. context correctly (e.g. 08=20 บล.)', () => {
      const text = '08=20 บล.'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '08', amount: 20, betType: '2_top' })
      expect(result[1]).toMatchObject({ numbers: '08', amount: 20, betType: '2_bottom' })
    })

    it('should parse single runner with hyphen separator (e.g. บน9-500, ล่าง9-500, 9-500)', () => {
      const text = '9-500\nบน9-500\nล่าง9-500'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(3)
      expect(result[0]).toMatchObject({ numbers: '9', amount: 500, betType: 'run_top', typeLabel: 'ลอยบน' })
      expect(result[1]).toMatchObject({ numbers: '9', amount: 500, betType: 'run_top', typeLabel: 'ลอยบน' })
      expect(result[2]).toMatchObject({ numbers: '9', amount: 500, betType: 'run_bottom', typeLabel: 'ลอยล่าง' })
    })

    it('should parse 4-digit float bets with descriptive noise (e.g. ลอย 4 ตัว 9452 = 100)', () => {
      const text = 'ลอย 4 ตัว 9452 = 100\nลอย 4 ตัว\n9452=100'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '9452', amount: 100, betType: '4_float', typeLabel: 'ลอยแพ' })
      expect(result[1]).toMatchObject({ numbers: '9452', amount: 100, betType: '4_float', typeLabel: 'ลอยแพ' })
    })

    it('should parse บนล่างกลับ context suffix correctly (e.g. 80-60-40 50*50 บนล่างกลับ)', () => {
      const text = '80-60-40  50*50 บนล่างกลับ'
      const result = parseMultiLinePaste(text, 'lao')
      // 3 numbers * (บน + ล่าง) = 6 entries. (Each has amount 50 and amount2 50, specialType: reverse)
      expect(result.length).toBe(6)
      
      // 80 top and bottom
      expect(result.some(r => r.numbers === '80' && r.betType === '2_top' && r.amount === 50 && r.amount2 === 50)).toBe(true)
      expect(result.some(r => r.numbers === '80' && r.betType === '2_bottom' && r.amount === 50 && r.amount2 === 50)).toBe(true)
      
      // 60 top and bottom
      expect(result.some(r => r.numbers === '60' && r.betType === '2_top' && r.amount === 50 && r.amount2 === 50)).toBe(true)
      expect(result.some(r => r.numbers === '60' && r.betType === '2_bottom' && r.amount === 50 && r.amount2 === 50)).toBe(true)

      // 40 top and bottom
      expect(result.some(r => r.numbers === '40' && r.betType === '2_top' && r.amount === 50 && r.amount2 === 50)).toBe(true)
      expect(result.some(r => r.numbers === '40' && r.betType === '2_bottom' && r.amount === 50 && r.amount2 === 50)).toBe(true)
    })

    it('should parse 5-digit number with กลับทุกประตู ตูละ30 correctly (e.g. 79083= กลับทุกประตู ตูละ30)', () => {
      const text = '79083= กลับทุกประตู ตูละ30'
      const result = parseMultiLinePaste(text, 'lao')
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({
        numbers: '79083',
        amount: 30,
        amount2: 60,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด'
      })
    })

    it('should parse กลับตูละ, กลับตัวละ, กลับประตูละ for 3-5 digits correctly as คูณชุด', () => {
      const text1 = '54098= กลับตูละ 15'
      const text2 = '54098= กลับตัวละ 15'
      const text3 = '540= กลับประตูละ 15'
      
      const result1 = parseMultiLinePaste(text1, 'lao')
      expect(result1.length).toBe(1)
      expect(result1[0]).toMatchObject({
        numbers: '54098',
        amount: 15,
        amount2: 60,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด'
      })

      const result2 = parseMultiLinePaste(text2, 'lao')
      expect(result2.length).toBe(1)
      expect(result2[0]).toMatchObject({
        numbers: '54098',
        amount: 15,
        amount2: 60,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด'
      })

      const result3 = parseMultiLinePaste(text3, 'lao')
      expect(result3.length).toBe(1)
      expect(result3[0]).toMatchObject({
        numbers: '540',
        amount: 15,
        amount2: 6,
        betType: '3_top',
        specialType: 'set6',
        typeLabel: 'คูณชุด'
      })
    })
  })

  describe('Tod/Tood parsing enhancements for 10 common betting styles', () => {
    it('should parse Case 1: Header style correctly', () => {
      const text = 'โต๊ด\n615=18\n156=85'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 2: Inline style with space correctly', () => {
      const text = '615=18 โต๊ด\n156=85 โต๊ด'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 3: Inline style without space correctly', () => {
      const text = '615=18โต๊ด\n156=85โต๊ด'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 4: Thai shorthand "ต" correctly', () => {
      const text = '615=18 ต\n156=85 ต'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 5: Thai shorthand "ต" without space correctly', () => {
      const text = '615=18ต\n156=85ต'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 6: Thai shorthand "โตด" (no tone mark) correctly', () => {
      const text = '615=18 โตด\n156=85 โตด'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 7: Thai shorthand "โตด" without space correctly', () => {
      const text = '615=18โตด\n156=85โตด'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 8: Bracket style correctly', () => {
      const text = '[โต๊ด]\n615=18\n156=85'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 9: Space separation instead of equals correctly', () => {
      const text = '615 18 โต๊ด\n156 85 โต๊ด'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse Case 10: Mixed with other text (e.g. โต๊ด นะคะ) correctly', () => {
      const text = 'โต๊ด นะคะ\n615=18\n156=85'
      const result = parseMultiLinePaste(text, 'thai')
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '615', amount: 18, betType: '3_tod', typeLabel: 'โต๊ด' })
      expect(result[1]).toMatchObject({ numbers: '156', amount: 85, betType: '3_tod', typeLabel: 'โต๊ด' })
    })

    it('should parse space-separated multi-bet PDF grid paste correctly', () => {
      const text = `ลอยบน
6=2,300 9=10,400 3=1,000 5=1,900
7=7,100 0=200
2 ตัวบน
47=480 74=410
2 ตัวล่าง
27=155 47=1,070 74=1,000 56=200
29=205 92=85
3 ตัวบน
409=127 081=171 047=420 074=8
407=587 470=873 704=815 740=317
930=69 713=218 173=402 761=712
561=123 544=154 209=86 307=325
305=175 170=92 570=438 557=214
267=91 539=126 092=9 902=250
920=180 168=274 516=143 651=20
615=18 156=85 332=100 814=195
804=182 574=132 744=386 908=118
390=22 702=1,090 701=27 784=636
228=125 071=11
3 ตัวโต๊ด
029=15 457=30 047=795`

      const result = parseMultiLinePaste(text, 'thai')
      // ลอยบน: 6 (2300), 9 (10400), 3 (1000), 5 (1900), 7 (7100), 0 (200) -> 6 items
      // 2 ตัวบน: 47 (480), 74 (410) -> 2 items
      // 2 ตัวล่าง: 27 (155), 47 (1070), 74 (1000), 56 (200), 29 (205), 92 (85) -> 6 items
      // 3 ตัวบน: 42 items -> 42 items
      // 3 ตัวโต๊ด: 3 items -> 3 items
      // Total = 6 + 2 + 6 + 42 + 3 = 59 items
      expect(result.length).toBe(59)

      // Verify specific items
      const entry6 = result.find(r => r.numbers === '6')
      expect(entry6).toMatchObject({ amount: 2300, betType: 'run_top', typeLabel: 'ลอยบน' })

      const entry9 = result.find(r => r.numbers === '9')
      expect(entry9).toMatchObject({ amount: 10400, betType: 'run_top', typeLabel: 'ลอยบน' })

      const entry47_top = result.find(r => r.numbers === '47' && r.betType === '2_top')
      expect(entry47_top).toMatchObject({ amount: 480, typeLabel: 'บน' })

      const entry47_bot = result.find(r => r.numbers === '47' && r.betType === '2_bottom')
      expect(entry47_bot).toMatchObject({ amount: 1070, typeLabel: 'ล่าง' })

      const entry047_top = result.find(r => r.numbers === '047' && r.betType === '3_top')
      expect(entry047_top).toMatchObject({ amount: 420, typeLabel: 'บน' })

      const entry047_tod = result.find(r => r.numbers === '047' && r.betType === '3_tod')
      expect(entry047_tod).toMatchObject({ amount: 795, typeLabel: 'โต๊ด' })

      const entry029_tod = result.find(r => r.numbers === '029' && r.betType === '3_tod')
      expect(entry029_tod).toMatchObject({ amount: 15, typeLabel: 'โต๊ด' })
    })
  })

  describe('stock lottery - fixed front digit (รูดหน้า)', () => {
    it('should parse น1 20 correctly (fixed front digit 1, top)', () => {
      const text = 'น1 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse น 1 20 ล่าง correctly (fixed front digit 1, bottom)', () => {
      const text = 'น 1 20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })

    it('should parse หน้า1=20 correctly', () => {
      const text = 'หน้า1=20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_top'
        })
      }
    })

    it('should parse รูดหน้า1=20 ล่าง correctly', () => {
      const text = 'รูดหน้า1=20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_bottom'
        })
      }
    })

    it('should parse บน น1 50*50 correctly (with split amount and prefix context)', () => {
      const text = 'บน น1 50*50'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        if (i === 1) {
          expect(result[i]).toMatchObject({
            numbers: '11',
            amount: 100,
            amount2: null,
            betType: '2_top'
          })
          expect(result[i].specialType).toBeUndefined()
        } else {
          expect(result[i]).toMatchObject({
            numbers: `1${i}`,
            amount: 50,
            amount2: 50,
            betType: '2_top',
            specialType: 'reverse'
          })
        }
      }
    })
  })

  describe('stock lottery - fixed back digit (รูดหลัง)', () => {
    it('should parse ห1 20 correctly (fixed back digit 1, top)', () => {
      const text = 'ห1 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse ห 1 20 ล่าง correctly (fixed back digit 1, bottom)', () => {
      const text = 'ห 1 20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })

    it('should parse หลัง1=20 correctly', () => {
      const text = 'หลัง1=20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_top'
        })
      }
    })

    it('should parse รูดหลัง1=20 ล่าง correctly', () => {
      const text = 'รูดหลัง1=20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_bottom'
        })
      }
    })

    it('should parse บน ห1 50*50 correctly (with split amount and prefix context)', () => {
      const text = 'บน ห1 50*50'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      for (let i = 0; i <= 9; i++) {
        if (i === 1) {
          expect(result[i]).toMatchObject({
            numbers: '11',
            amount: 100,
            amount2: null,
            betType: '2_top'
          })
          expect(result[i].specialType).toBeUndefined()
        } else {
          expect(result[i]).toMatchObject({
            numbers: `${i}1`,
            amount: 50,
            amount2: 50,
            betType: '2_top',
            specialType: 'reverse'
          })
        }
      }
    })
  })

  describe('stock lottery - fixed front & back digit (หน้าหลัง)', () => {
    it('should parse นห1 20 correctly (fixed front and back digit 1, top)', () => {
      const text = 'นห1 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20)
      
      // First 10 should be 10, 11, ..., 19 (front fixed)
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
      // Next 10 should be 01, 11, ..., 91 (back fixed)
      for (let i = 0; i <= 9; i++) {
        expect(result[10 + i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse หน้าหลัง 1=20 ล่าง correctly (fixed front and back digit 1, bottom)', () => {
      const text = 'หน้าหลัง 1=20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20)
      
      for (let i = 0; i <= 9; i++) {
        expect(result[i]).toMatchObject({
          numbers: `1${i}`,
          amount: 20,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
        expect(result[10 + i]).toMatchObject({
          numbers: `${i}1`,
          amount: 20,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - sibling numbers (เลขพี่น้อง)', () => {
    it('should parse พน 20 correctly (sibling numbers, top)', () => {
      const text = 'พน 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20)
      
      const siblingNumbers = [
        '01', '12', '23', '34', '45', '56', '67', '78', '89', '90',
        '10', '21', '32', '43', '54', '65', '76', '87', '98', '09'
      ]
      for (let i = 0; i < 20; i++) {
        expect(result[i]).toMatchObject({
          numbers: siblingNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse พี่น้อง=50 ล่าง correctly (sibling numbers, bottom)', () => {
      const text = 'พี่น้อง=50 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20)
      
      const siblingNumbers = [
        '01', '12', '23', '34', '45', '56', '67', '78', '89', '90',
        '10', '21', '32', '43', '54', '65', '76', '87', '98', '09'
      ]
      for (let i = 0; i < 20; i++) {
        expect(result[i]).toMatchObject({
          numbers: siblingNumbers[i],
          amount: 50,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - double numbers (เลขคู่/เลขเบิ้ล)', () => {
    it('should parse คู่ 20 correctly (double numbers, top)', () => {
      const text = 'คู่ 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      
      const doubleNumbers = [
        '00', '11', '22', '33', '44', '55', '66', '77', '88', '99'
      ]
      for (let i = 0; i < 10; i++) {
        expect(result[i]).toMatchObject({
          numbers: doubleNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse เบิ้ล=50 ล่าง correctly (double numbers, bottom)', () => {
      const text = 'เบิ้ล=50 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10)
      
      const doubleNumbers = [
        '00', '11', '22', '33', '44', '55', '66', '77', '88', '99'
      ]
      for (let i = 0; i < 10; i++) {
        expect(result[i]).toMatchObject({
          numbers: doubleNumbers[i],
          amount: 50,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - even-odd numbers (เลขคู่คี่)', () => {
    it('should parse คู่คี่ 20 correctly (even-odd numbers, top)', () => {
      const text = 'คู่คี่ 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(50)
      
      const evenOddNumbers = [
        '98', '96', '94', '92', '90',
        '89', '87', '85', '83', '81',
        '78', '76', '74', '72', '70',
        '69', '67', '65', '63', '61',
        '58', '56', '54', '52', '50',
        '49', '47', '45', '43', '41',
        '38', '36', '34', '32', '30',
        '29', '27', '25', '23', '21',
        '18', '16', '14', '12', '10',
        '09', '07', '05', '03', '01'
      ]
      for (let i = 0; i < 50; i++) {
        expect(result[i]).toMatchObject({
          numbers: evenOddNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse คู่คี=50 ล่าง correctly (even-odd numbers, bottom)', () => {
      const text = 'คู่คี=50 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(50)
      
      const evenOddNumbers = [
        '98', '96', '94', '92', '90',
        '89', '87', '85', '83', '81',
        '78', '76', '74', '72', '70',
        '69', '67', '65', '63', '61',
        '58', '56', '54', '52', '50',
        '49', '47', '45', '43', '41',
        '38', '36', '34', '32', '30',
        '29', '27', '25', '23', '21',
        '18', '16', '14', '12', '10',
        '09', '07', '05', '03', '01'
      ]
      for (let i = 0; i < 50; i++) {
        expect(result[i]).toMatchObject({
          numbers: evenOddNumbers[i],
          amount: 50,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - even-even numbers (เลขคู่คู่)', () => {
    it('should parse คู่คู่ 20 correctly (even-even numbers, top)', () => {
      const text = 'คู่คู่ 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(25)
      
      const evenEvenNumbers = [
        '88', '86', '84', '82', '80',
        '68', '66', '64', '62', '60',
        '48', '46', '44', '42', '40',
        '28', '26', '24', '22', '20',
        '08', '06', '04', '02', '00'
      ]
      for (let i = 0; i < 25; i++) {
        expect(result[i]).toMatchObject({
          numbers: evenEvenNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse คู่คู=50 ล่าง correctly (even-even numbers, bottom)', () => {
      const text = 'คู่คู=50 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(25)
      
      const evenEvenNumbers = [
        '88', '86', '84', '82', '80',
        '68', '66', '64', '62', '60',
        '48', '46', '44', '42', '40',
        '28', '26', '24', '22', '20',
        '08', '06', '04', '02', '00'
      ]
      for (let i = 0; i < 25; i++) {
        expect(result[i]).toMatchObject({
          numbers: evenEvenNumbers[i],
          amount: 50,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - odd-odd numbers (เลขคี่คี่)', () => {
    it('should parse คี่คี่ 20 correctly (odd-odd numbers, top)', () => {
      const text = 'คี่คี่ 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(25)
      
      const oddOddNumbers = [
        '99', '97', '95', '93', '91',
        '79', '77', '75', '73', '71',
        '59', '57', '55', '53', '51',
        '39', '37', '35', '33', '31',
        '19', '17', '15', '13', '11'
      ]
      for (let i = 0; i < 25; i++) {
        expect(result[i]).toMatchObject({
          numbers: oddOddNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse คี่คี=50 ล่าง correctly (odd-odd numbers, bottom)', () => {
      const text = 'คี่คี=50 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(25)
      
      const oddOddNumbers = [
        '99', '97', '95', '93', '91',
        '79', '77', '75', '73', '71',
        '59', '57', '55', '53', '51',
        '39', '37', '35', '33', '31',
        '19', '17', '15', '13', '11'
      ]
      for (let i = 0; i < 25; i++) {
        expect(result[i]).toMatchObject({
          numbers: oddOddNumbers[i],
          amount: 50,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - win numbers (เลขวิน)', () => {
    it('should parse วิน 12345 20 correctly (win without doubles, top)', () => {
      const text = 'วิน 12345 20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(10) // 10 pairs
      
      const expectedPairs = ['12', '13', '14', '15', '23', '24', '25', '34', '35', '45']
      for (let i = 0; i < 10; i++) {
        expect(result[i]).toMatchObject({
          numbers: expectedPairs[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse วินกลับ 12345=20 correctly (win with reversals, top)', () => {
      const text = 'วินกลับ 12345=20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20) // 20 pairs (direct + reverse)
      
      const expectedPairs = [
        '12', '21', '13', '31', '14', '41', '15', '51',
        '23', '32', '24', '42', '25', '52',
        '34', '43', '35', '53',
        '45', '54'
      ]
      for (let i = 0; i < 20; i++) {
        expect(result[i]).toMatchObject({
          numbers: expectedPairs[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse วินเบิ้ล 12345 20 ล่าง correctly (win with reversals, bottom)', () => {
      const text = 'วินเบิ้ล 12345 20 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(20) // 20 pairs (direct + reverse)
      
      const expectedPairs = [
        '12', '21', '13', '31', '14', '41', '15', '51',
        '23', '32', '24', '42', '25', '52',
        '34', '43', '35', '53',
        '45', '54'
      ]
      for (let i = 0; i < 20; i++) {
        expect(result[i]).toMatchObject({
          numbers: expectedPairs[i],
          amount: 20,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })
  })

  describe('stock lottery - hang numbers (19 หาง)', () => {
    it('should parse หาง1=20 correctly (19 sets, top)', () => {
      const text = 'หาง1=20'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(19)
      
      const expectedNumbers = [
        '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
        '01', '21', '31', '41', '51', '61', '71', '81', '91'
      ]
      
      for (let i = 0; i < 19; i++) {
        expect(result[i]).toMatchObject({
          numbers: expectedNumbers[i],
          amount: 20,
          betType: '2_top',
          typeLabel: 'บน'
        })
      }
    })

    it('should parse 19หาง 2 30 ล่าง correctly (19 sets, bottom)', () => {
      const text = '19หาง 2 30 ล่าง'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(19)
      
      const expectedNumbers = [
        '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
        '02', '12', '32', '42', '52', '62', '72', '82', '92'
      ]
      
      for (let i = 0; i < 19; i++) {
        expect(result[i]).toMatchObject({
          numbers: expectedNumbers[i],
          amount: 30,
          betType: '2_bottom',
          typeLabel: 'ล่าง'
        })
      }
    })

    it('should parse บล หาง 5=50 correctly (19 sets, both)', () => {
      const text = 'บล หาง 5=50'
      const result = parseMultiLinePaste(text, 'stock')
      expect(result.length).toBe(38) // 19 top + 19 bottom
      
      // Check that we have exactly 19 top and 19 bottom bets
      const topBets = result.filter(r => r.betType === '2_top')
      const bottomBets = result.filter(r => r.betType === '2_bottom')
      expect(topBets.length).toBe(19)
      expect(bottomBets.length).toBe(19)
    })
  })

  describe('Smart Auto-Default x/* separator behavior', () => {
    it('should auto-revert 2-digit number when behavior is auto and lotteryType is stock', () => {
      const text = '25x30'
      const result = parseMultiLinePaste(text, 'stock', { x_separator_behavior: 'auto' })
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '25', amount: 30 })
      expect(result[1]).toMatchObject({ numbers: '52', amount: 30 })
    })

    it('should unique-revert double 2-digit number (11x30) to only 1 entry when behavior is auto and lotteryType is stock', () => {
      const text = '11x30'
      const result = parseMultiLinePaste(text, 'stock', { x_separator_behavior: 'auto' })
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '11', amount: 30 })
    })

    it('should generate permutations for 3-digit number (123*20) when behavior is auto and lotteryType is stock', () => {
      const text = '123*20'
      const result = parseMultiLinePaste(text, 'stock', { x_separator_behavior: 'auto' })
      expect(result.length).toBe(6) // 123, 132, 213, 231, 312, 321
      const numbers = result.map(r => r.numbers)
      expect(numbers).toContain('123')
      expect(numbers).toContain('321')
    })

    it('should not auto-revert 2-digit number when behavior is auto but lotteryType is normal (lao)', () => {
      const text = '25x30'
      const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'auto' })
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '25', amount: 30 })
    })

    it('should auto-revert 2-digit number when behavior is revert even on normal (lao) lottery', () => {
      const text = '25x30'
      const result = parseMultiLinePaste(text, 'lao', { x_separator_behavior: 'revert' })
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({ numbers: '25', amount: 30 })
      expect(result[1]).toMatchObject({ numbers: '52', amount: 30 })
    })

    it('should not auto-revert 2-digit number when behavior is straight even on stock lottery', () => {
      const text = '25x30'
      const result = parseMultiLinePaste(text, 'stock', { x_separator_behavior: 'straight' })
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '25', amount: 30 })
    })

    it('should skip auto-reversion for 3 parts or more like 25x20x20 even on stock lottery', () => {
      const text = '25x20x20'
      const result = parseMultiLinePaste(text, 'stock', { x_separator_behavior: 'auto' })
      expect(result.length).toBe(1)
      expect(result[0]).toMatchObject({ numbers: '25', amount: 20, amount2: 20 })
    })
  })
})


