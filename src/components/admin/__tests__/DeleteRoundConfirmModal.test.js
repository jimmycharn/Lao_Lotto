import { describe, it, expect } from 'vitest'
import {
    getRoundStatusLabel,
    formatSubmissionCount,
    getDeletionWarningType
} from '../DeleteRoundConfirmModal'

describe('DeleteRoundConfirmModal Helpers', () => {
    describe('getRoundStatusLabel', () => {
        it('returns "ประกาศผลแล้ว" when status is announced or is_result_announced is true', () => {
            expect(getRoundStatusLabel('announced', true)).toBe('ประกาศผลแล้ว')
            expect(getRoundStatusLabel('closed', true)).toBe('ประกาศผลแล้ว')
            expect(getRoundStatusLabel('announced', false)).toBe('ประกาศผลแล้ว')
        })

        it('returns "ปิดรับแทง (รอผล)" when status is closed and result is not announced', () => {
            expect(getRoundStatusLabel('closed', false)).toBe('ปิดรับแทง (รอผล)')
        })

        it('returns "เปิดรับแทง" when status is open', () => {
            expect(getRoundStatusLabel('open', false)).toBe('เปิดรับแทง')
        })
    })

    describe('formatSubmissionCount', () => {
        it('formats numbers with thousand separators and suffix', () => {
            expect(formatSubmissionCount(0)).toBe('0 รายการ')
            expect(formatSubmissionCount(516)).toBe('516 รายการ')
            expect(formatSubmissionCount(12020)).toBe('12,020 รายการ')
            expect(formatSubmissionCount(null)).toBe('0 รายการ')
        })
    })

    describe('getDeletionWarningType', () => {
        it('returns "archive" if round is announced', () => {
            expect(getDeletionWarningType({ status: 'announced', is_result_announced: true })).toBe('archive')
            expect(getDeletionWarningType({ status: 'closed', is_result_announced: true })).toBe('archive')
        })

        it('returns "danger" if round is still open or closed without results', () => {
            expect(getDeletionWarningType({ status: 'open', is_result_announced: false })).toBe('danger')
            expect(getDeletionWarningType({ status: 'closed', is_result_announced: false })).toBe('danger')
        })
    })
})
