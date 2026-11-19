import { describe, it, expect } from 'vitest'
import {
    calculateRemainingItemTransfer,
    calculateExcessItemTransfer
} from '../../../utils/layoffTodConverter'

describe('Layoff Split Cap Logic (แบ่งตีออกไม่เกินตัวละ)', () => {
    describe('Remaining Tab (แท็บ ยอดเหลือ)', () => {
        it('Scenario 1: remaining 950, retain 100, cap 500 -> transfer 500 in round 1', () => {
            const item = { bet_type: '3_top', numbers: '123', remainingAmount: 950 }
            const result = calculateRemainingItemTransfer(item, 100, 500)

            expect(result.hasRetain).toBe(true)
            expect(result.retainAmount).toBe(100)
            expect(result.availableAfterRetain).toBe(850)
            expect(result.hasCap).toBe(true)
            expect(result.maxCap).toBe(500)
            expect(result.transferAmount).toBe(500)
        })

        it('Scenario 1 (Round 2): remaining 450 (after round 1 transfer of 500), retain 100, cap 500 -> transfer 350', () => {
            const item = { bet_type: '3_top', numbers: '123', remainingAmount: 450 }
            const result = calculateRemainingItemTransfer(item, 100, 500)

            expect(result.availableAfterRetain).toBe(350)
            expect(result.transferAmount).toBe(350) // since 350 < cap 500
        })

        it('Scenario 1 (Round 3): remaining 100 (exact retain amount), retain 100, cap 500 -> transfer 0', () => {
            const item = { bet_type: '3_top', numbers: '123', remainingAmount: 100 }
            const result = calculateRemainingItemTransfer(item, 100, 500)

            expect(result.availableAfterRetain).toBe(0)
            expect(result.transferAmount).toBe(0)
        })

        it('Case: No retain, cap 500 -> transfers Math.min(remaining, 500)', () => {
            const item = { bet_type: '3_top', numbers: '456', remainingAmount: 950 }
            const result = calculateRemainingItemTransfer(item, '', 500)

            expect(result.hasRetain).toBe(false)
            expect(result.availableAfterRetain).toBe(950)
            expect(result.transferAmount).toBe(500)
        })

        it('Case: Retain 100, cap empty/unset -> transfers 100% of remaining after retain', () => {
            const item = { bet_type: '3_top', numbers: '789', remainingAmount: 950 }
            const result = calculateRemainingItemTransfer(item, 100, '')

            expect(result.hasCap).toBe(false)
            expect(result.maxCap).toBe(null)
            expect(result.transferAmount).toBe(850)
        })

        it('Case: Remaining less than retain -> available is 0, transfer is 0', () => {
            const item = { bet_type: '2_top', numbers: '12', remainingAmount: 80 }
            const result = calculateRemainingItemTransfer(item, 100, 500)

            expect(result.availableAfterRetain).toBe(0)
            expect(result.transferAmount).toBe(0)
        })
    })

    describe('Excess Tab (แท็บ ยอดเกิน)', () => {
        it('Scenario 2: excess 850, cap 500 -> transfer 500 in round 1', () => {
            const item = { bet_type: '3_top', numbers: '123', excess: 850 }
            const result = calculateExcessItemTransfer(item, 500)

            expect(result.hasCap).toBe(true)
            expect(result.maxCap).toBe(500)
            expect(result.transferAmount).toBe(500)
        })

        it('Scenario 2 (Round 2): excess 350 (after round 1 transfer of 500), cap 500 -> transfer 350', () => {
            const item = { bet_type: '3_top', numbers: '123', excess: 350 }
            const result = calculateExcessItemTransfer(item, 500)

            expect(result.transferAmount).toBe(350)
        })

        it('Case: excess 200, cap 500 -> transfer 200 (less than cap)', () => {
            const item = { bet_type: '3_top', numbers: '456', excess: 200 }
            const result = calculateExcessItemTransfer(item, 500)

            expect(result.transferAmount).toBe(200)
        })

        it('Case: cap empty/unset -> transfers 100% of excess', () => {
            const item = { bet_type: '3_top', numbers: '789', excess: 850 }
            const result = calculateExcessItemTransfer(item, '')

            expect(result.hasCap).toBe(false)
            expect(result.transferAmount).toBe(850)
        })

        it('Case: Set-based (4_set): excess 5 sets, cap 2 sets -> transfer 2 sets', () => {
            const item = { bet_type: '4_set', numbers: '1234', excess: 5, isSetBased: true }
            const result = calculateExcessItemTransfer(item, 2)

            expect(result.hasCap).toBe(true)
            expect(result.maxCap).toBe(2)
            expect(result.transferAmount).toBe(2)
        })
    })
})
