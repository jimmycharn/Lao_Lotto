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

        it('matches receiver by middle-masked digits (e.g. KBank xxx-x-x2578-xxx to GSB)', () => {
            const gsbDealerAccounts = [
                {
                    bank_name: 'ธนาคารออมสิน',
                    bank_account: '020432578092',
                    account_name: 'นายธีระเดช บรรจงแก้ว'
                }
            ]
            const receiver = {
                displayName: 'นาย ธีระเดช บ...',
                name: 'MR. THEERADET BANJONGKAEW',
                account: {
                    value: 'xxx-x-x2578-xxx'
                }
            }
            expect(isReceiverMatchingDealer(receiver, gsbDealerAccounts)).toBe(true)
        })

        it('matches receiver by surname token when spelling varies', () => {
            const gsbDealerAccounts = [
                {
                    bank_name: 'ธนาคารออมสิน',
                    bank_account: '020432578092',
                    account_name: 'นายธีรเดช บรรจงแก้ว' // note spelling without ะ
                }
            ]
            const receiver = {
                displayName: 'นาย ธีระเดช บรรจงแก้ว',
                account: {
                    value: 'xxx-x-x9999-xxx'
                }
            }
            expect(isReceiverMatchingDealer(receiver, gsbDealerAccounts)).toBe(true)
        })

        it('matches real-world KBank slip to GSB with xxx-x-x2578-x92 and abbreviated นาย ธีระเดช บ', () => {
            const gsbDealerAccounts = [
                {
                    bank_name: 'ธนาคารออมสิน',
                    bank_account: '020432578092',
                    account_name: 'นายธีรเดช บรรจงแก้ว' // In DB: นายธีรเดช (no ะ)
                }
            ]
            const receiver = {
                displayName: 'นาย ธีระเดช บ', // In SlipOK: นาย ธีระเดช บ (with ะ and initial บ)
                name: 'นาย ธีระเดช บ',
                account: {
                    value: 'xxx-x-x2578-x92' // KBank masked account
                }
            }
            expect(isReceiverMatchingDealer(receiver, gsbDealerAccounts)).toBe(true)
        })

        it('returns true if dealer has no bank accounts registered (fallback permissive)', () => {
            expect(isReceiverMatchingDealer({ displayName: 'ใครก็ได้' }, [])).toBe(true)
        })
    })
})
