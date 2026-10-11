import { describe, it, expect } from 'vitest'
import { isReceiverMatchingDealer } from './slipOkClient'

describe('slipOkClient', () => {
    describe('isReceiverMatchingDealer', () => {
        const dealerAccounts = [
            {
                bank_name: 'ธนาคารกสิกรไทย',
                bank_account: '1234567890',
                account_name: 'นายเจ้ามือ รวยทรัพย์'
            },
            {
                bank_name: 'ธนาคารไทยพาณิชย์',
                bank_account: '9876543210',
                account_name: 'นายเจ้ามือ รวยทรัพย์'
            }
        ]

        it('matches receiver by partial account number (last 4 digits)', () => {
            const receiver = {
                displayName: 'นายเจ้ามือ รวยทรัพย์',
                name: 'MR. DEALER',
                account: {
                    bank: '004',
                    name: 'KBANK',
                    value: 'xxx-x-x7890-x'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(true)
        })

        it('matches receiver by exact account digits', () => {
            const receiver = {
                displayName: 'นายเจ้ามือ รวยทรัพย์',
                account: {
                    value: '1234567890'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(true)
        })

        it('rejects if account number does not match any dealer account', () => {
            const receiver = {
                displayName: 'นายอื่น',
                account: {
                    value: 'xxx-x-x1111-x'
                }
            }
            expect(isReceiverMatchingDealer(receiver, dealerAccounts)).toBe(false)
        })

        it('returns true if dealer has no bank accounts registered (fallback permissive)', () => {
            expect(isReceiverMatchingDealer({ displayName: 'ใครก็ได้' }, [])).toBe(true)
        })
    })
})
