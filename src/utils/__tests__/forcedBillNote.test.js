import { describe, it, expect } from 'vitest'
import { getForcedBillNote } from '../forcedBillNote'

describe('forcedBillNote utility', () => {
    describe('Closed but not announced (!isAnnounced)', () => {
        it('should return (ปิดรับแล้ว) when currentNote is empty string', () => {
            expect(getForcedBillNote('', false)).toBe('(ปิดรับแล้ว)')
        })

        it('should return (ปิดรับแล้ว) when currentNote is null or undefined', () => {
            expect(getForcedBillNote(null, false)).toBe('(ปิดรับแล้ว)')
            expect(getForcedBillNote(undefined, false)).toBe('(ปิดรับแล้ว)')
        })

        it('should return (ปิดรับแล้ว) when currentNote is whitespace only', () => {
            expect(getForcedBillNote('   ', false)).toBe('(ปิดรับแล้ว)')
        })

        it('should append (ปิดรับแล้ว) when currentNote has existing content', () => {
            expect(getForcedBillNote('พี่สมชาย', false)).toBe('พี่สมชาย (ปิดรับแล้ว)')
            expect(getForcedBillNote('  พี่สมชาย  ', false)).toBe('พี่สมชาย (ปิดรับแล้ว)')
        })

        it('should not duplicate tag if note already contains (ปิดรับแล้ว)', () => {
            expect(getForcedBillNote('พี่สมชาย (ปิดรับแล้ว)', false)).toBe('พี่สมชาย (ปิดรับแล้ว)')
            expect(getForcedBillNote('(ปิดรับแล้ว)', false)).toBe('(ปิดรับแล้ว)')
        })
    })

    describe('Closed and announced (isAnnounced)', () => {
        it('should return (ออกรางวัลแล้ว) when currentNote is empty string', () => {
            expect(getForcedBillNote('', true)).toBe('(ออกรางวัลแล้ว)')
        })

        it('should return (ออกรางวัลแล้ว) when currentNote is null or undefined', () => {
            expect(getForcedBillNote(null, true)).toBe('(ออกรางวัลแล้ว)')
            expect(getForcedBillNote(undefined, true)).toBe('(ออกรางวัลแล้ว)')
        })

        it('should return (ออกรางวัลแล้ว) when currentNote is whitespace only', () => {
            expect(getForcedBillNote('   ', true)).toBe('(ออกรางวัลแล้ว)')
        })

        it('should append (ออกรางวัลแล้ว) when currentNote has existing content', () => {
            expect(getForcedBillNote('พี่สมชาย', true)).toBe('พี่สมชาย (ออกรางวัลแล้ว)')
            expect(getForcedBillNote('  พี่สมชาย  ', true)).toBe('พี่สมชาย (ออกรางวัลแล้ว)')
        })

        it('should replace previous (ปิดรับแล้ว) with (ออกรางวัลแล้ว)', () => {
            expect(getForcedBillNote('พี่สมชาย (ปิดรับแล้ว)', true)).toBe('พี่สมชาย (ออกรางวัลแล้ว)')
            expect(getForcedBillNote('(ปิดรับแล้ว)', true)).toBe('(ออกรางวัลแล้ว)')
        })

        it('should not duplicate tag if note already contains (ออกรางวัลแล้ว)', () => {
            expect(getForcedBillNote('พี่สมชาย (ออกรางวัลแล้ว)', true)).toBe('พี่สมชาย (ออกรางวัลแล้ว)')
            expect(getForcedBillNote('(ออกรางวัลแล้ว)', true)).toBe('(ออกรางวัลแล้ว)')
        })
    })
})
