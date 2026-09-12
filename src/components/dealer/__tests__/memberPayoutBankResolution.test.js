import { describe, it, expect } from 'vitest'
import MemberAccordionItem from '../MemberAccordionItem'

describe('Member Payout Bank Account Resolution Logic', () => {
    // Resolution helper representing the logic in Dealer.jsx & MemberAccordionItem.jsx
    const resolveMemberPayoutBank = ({ member, userBanks = [], profileBank = null }) => {
        // 1. Specific assigned bank
        if (member.member_bank_account_id) {
            const assignedBank = userBanks.find(b => b.id === member.member_bank_account_id)
            if (assignedBank) {
                return { ...assignedBank, is_assigned: true }
            }
        }

        // 2. Default user bank
        if (userBanks.length > 0) {
            const defaultBank = userBanks.find(b => b.is_default) || userBanks[0]
            if (defaultBank) {
                return { ...defaultBank, is_assigned: false, is_default: defaultBank.is_default }
            }
        }

        // 3. Profile bank fallback
        if (profileBank?.bank_name || member.bank_name) {
            return {
                bank_name: profileBank?.bank_name || member.bank_name,
                bank_account: profileBank?.bank_account || member.bank_account,
                account_name: profileBank?.bank_account_name || member.bank_account_name,
                is_assigned: false,
                is_default: false
            }
        }

        return null
    }

    it('resolves specifically assigned bank account for this dealer with is_assigned=true', () => {
        const member = { id: 'u1', member_bank_account_id: 'bank-2' }
        const userBanks = [
            { id: 'bank-1', bank_name: 'กสิกรไทย', bank_account: '111-1-11111-1', is_default: true },
            { id: 'bank-2', bank_name: 'ไทยพาณิชย์', bank_account: '222-2-22222-2', is_default: false }
        ]

        const resolved = resolveMemberPayoutBank({ member, userBanks })
        expect(resolved).not.toBeNull()
        expect(resolved.id).toBe('bank-2')
        expect(resolved.bank_name).toBe('ไทยพาณิชย์')
        expect(resolved.bank_account).toBe('222-2-22222-2')
        expect(resolved.is_assigned).toBe(true)
    })

    it('falls back to default bank account when no specific bank is assigned', () => {
        const member = { id: 'u1', member_bank_account_id: null }
        const userBanks = [
            { id: 'bank-1', bank_name: 'กรุงเทพ', bank_account: '333-3-33333-3', is_default: false },
            { id: 'bank-2', bank_name: 'กสิกรไทย', bank_account: '444-4-44444-4', is_default: true }
        ]

        const resolved = resolveMemberPayoutBank({ member, userBanks })
        expect(resolved).not.toBeNull()
        expect(resolved.id).toBe('bank-2')
        expect(resolved.bank_name).toBe('กสิกรไทย')
        expect(resolved.is_assigned).toBe(false)
        expect(resolved.is_default).toBe(true)
    })

    it('falls back to first bank account when no default is designated', () => {
        const member = { id: 'u1', member_bank_account_id: null }
        const userBanks = [
            { id: 'bank-1', bank_name: 'กรุงไทย', bank_account: '555-5-55555-5', is_default: false }
        ]

        const resolved = resolveMemberPayoutBank({ member, userBanks })
        expect(resolved).not.toBeNull()
        expect(resolved.id).toBe('bank-1')
        expect(resolved.bank_name).toBe('กรุงไทย')
        expect(resolved.is_assigned).toBe(false)
    })

    it('falls back to profile bank details if user_bank_accounts has no records', () => {
        const member = {
            id: 'u1',
            member_bank_account_id: null,
            bank_name: 'ออมสิน',
            bank_account: '666-6-66666-6',
            bank_account_name: 'นายทดสอบ บัญชี'
        }

        const resolved = resolveMemberPayoutBank({ member, userBanks: [] })
        expect(resolved).not.toBeNull()
        expect(resolved.bank_name).toBe('ออมสิน')
        expect(resolved.bank_account).toBe('666-6-66666-6')
        expect(resolved.account_name).toBe('นายทดสอบ บัญชี')
        expect(resolved.is_assigned).toBe(false)
    })

    it('returns null when member has no bank details at all', () => {
        const member = { id: 'u1', member_bank_account_id: null }
        const resolved = resolveMemberPayoutBank({ member, userBanks: [] })
        expect(resolved).toBeNull()
    })

    it('verifies MemberAccordionItem component is exported correctly', () => {
        expect(MemberAccordionItem).toBeDefined()
        expect(typeof MemberAccordionItem).toBe('function')
    })
})
