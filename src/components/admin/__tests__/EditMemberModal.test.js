import { describe, it, expect } from 'vitest'
import { generateSecurePassword, validateEmailFormat } from '../EditMemberModal'

describe('EditMemberModal Helpers', () => {
    describe('generateSecurePassword', () => {
        it('generates secure 8-character password by default', () => {
            const pwd = generateSecurePassword()
            expect(pwd).toHaveLength(8)
            expect(/^[A-Za-z0-9]+$/.test(pwd)).toBe(true)
        })

        it('generates password with custom length', () => {
            const pwd12 = generateSecurePassword(12)
            expect(pwd12).toHaveLength(12)

            const pwd16 = generateSecurePassword(16)
            expect(pwd16).toHaveLength(16)
        })

        it('generates random distinct passwords on subsequent calls', () => {
            const pwd1 = generateSecurePassword()
            const pwd2 = generateSecurePassword()
            expect(pwd1).not.toEqual(pwd2)
        })
    })

    describe('validateEmailFormat', () => {
        it('validates standard email formats correctly', () => {
            expect(validateEmailFormat('test@example.com')).toBe(true)
            expect(validateEmailFormat('dealer.vip@biglotto.co.th')).toBe(true)
            expect(validateEmailFormat('user123@sub.domain.org')).toBe(true)
            expect(validateEmailFormat('user+tag@gmail.com')).toBe(true)
        })

        it('rejects invalid email formats', () => {
            expect(validateEmailFormat('invalid-email')).toBe(false)
            expect(validateEmailFormat('missingatsign.com')).toBe(false)
            expect(validateEmailFormat('@nodomain.com')).toBe(false)
            expect(validateEmailFormat('user@')).toBe(false)
            expect(validateEmailFormat('user@domain')).toBe(false)
            expect(validateEmailFormat('')).toBe(false)
            expect(validateEmailFormat('   ')).toBe(false)
        })
    })
})
