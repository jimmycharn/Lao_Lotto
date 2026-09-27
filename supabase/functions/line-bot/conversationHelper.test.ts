import { describe, it, expect } from 'vitest'
import { isConversationMessage } from './conversationHelper.ts'

describe('isConversationMessage', () => {
  it('identifies messages starting with ".." followed by text', () => {
    expect(isConversationMessage('..สวัสดีครับ')).toBe(true)
    expect(isConversationMessage('.. ยอดค้างชำระคุณแพร 1038 บาท')).toBe(true)
    expect(isConversationMessage('..งวดนี้มีใครส่งบ้าง')).toBe(true)
  })

  it('identifies multiline messages where ".." is on its own line or followed by newlines', () => {
    const multiline1 = `..
ยอดค้างชำระคุณแพร
งวด 24: 1038
งวด 25: -365`
    expect(isConversationMessage(multiline1)).toBe(true)

    const multiline2 = `.. แจ้งยอด
123=100
456=200`
    expect(isConversationMessage(multiline2)).toBe(true)
  })

  it('handles leading and trailing whitespace properly', () => {
    expect(isConversationMessage('   .. ข้อความ')).toBe(true)
    expect(isConversationMessage('\n\n.. ข้อความ')).toBe(true)
    expect(isConversationMessage('..\n')).toBe(true)
    expect(isConversationMessage('..')).toBe(true)
  })

  it('identifies keyboard variants like ellipsis or fullwidth dots', () => {
    expect(isConversationMessage('…คุยกัน')).toBe(true)
    expect(isConversationMessage('‥คุยกัน')).toBe(true)
    expect(isConversationMessage('．．คุยกัน')).toBe(true)
    expect(isConversationMessage('...สวัสดี')).toBe(true)
  })

  it('does NOT match normal bets, commands, or regular messages without ".." prefix', () => {
    expect(isConversationMessage('123=100')).toBe(false)
    expect(isConversationMessage('12.5=100')).toBe(false)
    expect(isConversationMessage('.50=100')).toBe(false)
    expect(isConversationMessage('/สรุป')).toBe(false)
    expect(isConversationMessage('/help')).toBe(false)
    expect(isConversationMessage('สวัสดีครับ')).toBe(false)
    expect(isConversationMessage('ยอดค้างชำระ 1038')).toBe(false)
    expect(isConversationMessage('')).toBe(false)
    expect(isConversationMessage(null)).toBe(false)
    expect(isConversationMessage(undefined)).toBe(false)
  })
})
