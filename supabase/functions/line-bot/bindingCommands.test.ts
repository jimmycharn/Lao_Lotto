import { describe, it, expect } from 'vitest'
import {
  parseLotteryType,
  parseBindingCommand,
  formatBindSuccessMessage,
  formatCreateBindCodeMessages,
  formatExistingBindCodeMessages,
  LOTTERY_DISPLAY_NAMES
} from './bindingHelper.ts'

describe('parseLotteryType', () => {
  it('parses Thai lottery aliases', () => {
    expect(parseLotteryType('ไทย')).toBe('thai')
    expect(parseLotteryType('หวยไทย')).toBe('thai')
    expect(parseLotteryType('thai')).toBe('thai')
  })

  it('parses Lao lottery aliases', () => {
    expect(parseLotteryType('ลาว')).toBe('lao')
    expect(parseLotteryType('หวยลาว')).toBe('lao')
    expect(parseLotteryType('lao')).toBe('lao')
  })

  it('parses Hanoi lottery aliases', () => {
    expect(parseLotteryType('ฮานอย')).toBe('hanoi')
    expect(parseLotteryType('หวยฮานอย')).toBe('hanoi')
    expect(parseLotteryType('hanoi')).toBe('hanoi')
  })

  it('parses Stock lottery aliases', () => {
    expect(parseLotteryType('หุ้น')).toBe('stock')
    expect(parseLotteryType('หวยหุ้น')).toBe('stock')
    expect(parseLotteryType('stock')).toBe('stock')
  })

  it('parses Yeekee lottery aliases', () => {
    expect(parseLotteryType('ยี่กี่')).toBe('yeekee')
    expect(parseLotteryType('ยี่กี')).toBe('yeekee')
    expect(parseLotteryType('หวยยี่กี่')).toBe('yeekee')
    expect(parseLotteryType('หวยยี่กี')).toBe('yeekee')
    expect(parseLotteryType('yeekee')).toBe('yeekee')
  })

  it('returns null for unknown input', () => {
    expect(parseLotteryType('unknown')).toBeNull()
    expect(parseLotteryType('')).toBeNull()
  })
})

describe('parseBindingCommand', () => {
  const sampleUuid = 'b35b3ade-7a2f-4e37-b1cd-8a9c522a68e7'

  it('handles default /ขอรหัส without arguments', () => {
    const res = parseBindingCommand('/ขอรหัส')
    expect(res.requestedLotteryType).toBe('thai')
    expect(res.baseCmd).toBe('/ขอรหัส')
    expect(res.dealerId).toBeNull()
    expect(res.isValidFormat).toBe(true)
  })

  it('handles /ขอรหัส with dealer UUID', () => {
    const res = parseBindingCommand(`/ขอรหัส ${sampleUuid}`)
    expect(res.requestedLotteryType).toBe('thai')
    expect(res.baseCmd).toBe('/ขอรหัส')
    expect(res.dealerId).toBe(sampleUuid)
    expect(res.isValidFormat).toBe(true)
  })

  it('handles /ขอรหัสไทย and sets thai type', () => {
    const res = parseBindingCommand('/ขอรหัสไทย')
    expect(res.requestedLotteryType).toBe('thai')
    expect(res.baseCmd).toBe('/ขอรหัสไทย')
    expect(res.dealerId).toBeNull()
    expect(res.isValidFormat).toBe(true)
  })

  it('handles /ขอรหัสลาว and /ขอรหัสลาว [uuid]', () => {
    const res1 = parseBindingCommand('/ขอรหัสลาว')
    expect(res1.requestedLotteryType).toBe('lao')
    expect(res1.baseCmd).toBe('/ขอรหัสลาว')

    const res2 = parseBindingCommand(`/ขอรหัสลาว ${sampleUuid}`)
    expect(res2.requestedLotteryType).toBe('lao')
    expect(res2.baseCmd).toBe('/ขอรหัสลาว')
    expect(res2.dealerId).toBe(sampleUuid)
  })

  it('handles /ขอรหัสฮานอย and sets hanoi type', () => {
    const res = parseBindingCommand(`/ขอรหัสฮานอย ${sampleUuid}`)
    expect(res.requestedLotteryType).toBe('hanoi')
    expect(res.baseCmd).toBe('/ขอรหัสฮานอย')
    expect(res.dealerId).toBe(sampleUuid)
  })

  it('handles /ขอรหัสหุ้น and sets stock type', () => {
    const res = parseBindingCommand(`/ขอรหัสหุ้น ${sampleUuid}`)
    expect(res.requestedLotteryType).toBe('stock')
    expect(res.baseCmd).toBe('/ขอรหัสหุ้น')
    expect(res.dealerId).toBe(sampleUuid)
  })

  it('handles /ขอรหัสยี่กี่ and /ขอรหัสยี่กี', () => {
    const res1 = parseBindingCommand('/ขอรหัสยี่กี่')
    expect(res1.requestedLotteryType).toBe('yeekee')
    expect(res1.baseCmd).toBe('/ขอรหัสยี่กี่')

    const res2 = parseBindingCommand(`/ขอรหัสยี่กี ${sampleUuid}`)
    expect(res2.requestedLotteryType).toBe('yeekee')
    expect(res2.baseCmd).toBe('/ขอรหัสยี่กี่')
    expect(res2.dealerId).toBe(sampleUuid)
  })

  it('handles space separated format like /ขอรหัส ลาว [uuid]', () => {
    const res = parseBindingCommand(`/ขอรหัส ลาว ${sampleUuid}`)
    expect(res.requestedLotteryType).toBe('lao')
    expect(res.baseCmd).toBe('/ขอรหัสลาว')
    expect(res.dealerId).toBe(sampleUuid)
  })

  it('flags invalid dealer UUID argument', () => {
    const res = parseBindingCommand('/ขอรหัส not-a-uuid')
    expect(res.isValidFormat).toBe(false)
    expect(res.dealerId).toBeNull()
  })
})

describe('formatCreateBindCodeMessages', () => {
  it('returns exactly 2 messages: instruction and /bind code', () => {
    const messages = formatCreateBindCodeMessages('BG-4JSS7M')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe(
      '✅ สร้างรหัสผูกกลุ่มใหม่สำเร็จแล้วค่ะ!✅\n\nกรุณาคัดลอกรหัสและคำสั่งด้านล่าง ไปพิมพ์ในกลุ่ม LINE ที่ต้องการผูกกลุ่มแชทเข้ากับระบบค่ะ 🤖'
    )
    expect(messages[1]).toBe('/bind BG-4JSS7M')
  })
})

describe('formatExistingBindCodeMessages', () => {
  it('returns exactly 2 messages: existing notice and /bind code', () => {
    const messages = formatExistingBindCodeMessages('BG-4JSS7M')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('คุณมีรหัสผูกกลุ่มที่ยังไม่ได้ใช้งานอยู่แล้วค่ะ')
    expect(messages[1]).toBe('/bind BG-4JSS7M')
  })
})

describe('formatBindSuccessMessage', () => {
  it('formats Thai lottery bind confirmation correctly', () => {
    const text = formatBindSuccessMessage('เกมส์ สุราษฎร์', 'thai')
    expect(text).toBe(
      '✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: เกมส์ สุราษฎร์\nประเภทหวย: หวยไทย\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉'
    )
  })

  it('formats Lao lottery bind confirmation correctly', () => {
    const text = formatBindSuccessMessage('เกมส์ สุราษฎร์', 'lao')
    expect(text).toBe(
      '✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: เกมส์ สุราษฎร์\nประเภทหวย: หวยลาว\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉'
    )
  })

  it('formats Hanoi lottery bind confirmation correctly', () => {
    const text = formatBindSuccessMessage('เกมส์ สุราษฎร์', 'hanoi')
    expect(text).toBe(
      '✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: เกมส์ สุราษฎร์\nประเภทหวย: หวยฮานอย\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉'
    )
  })

  it('formats Stock lottery bind confirmation correctly', () => {
    const text = formatBindSuccessMessage('เกมส์ สุราษฎร์', 'stock')
    expect(text).toBe(
      '✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: เกมส์ สุราษฎร์\nประเภทหวย: หวยหุ้น\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉'
    )
  })

  it('formats Yeekee lottery bind confirmation correctly', () => {
    const text = formatBindSuccessMessage('เกมส์ สุราษฎร์', 'yeekee')
    expect(text).toBe(
      '✅ ผูกกลุ่มสำเร็จแล้วค่ะ!✅\n\nเจ้ามือ: เกมส์ สุราษฎร์\nประเภทหวย: หวยยี่กี่\n\nสมาชิกที่มีสิทธิ์สามารถส่งโพยในกลุ่มนี้ได้ทันทีค่ะ 🎉'
    )
  })
})
