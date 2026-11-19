import { describe, it, expect } from 'vitest'
import {
    isSearchNumberMatched,
    isSearchNoteMatched,
    isSubmissionSearchMatched,
    isBillItemSearchMatched
} from '../../../utils/betTypeFilterHelper'

describe('Round Search & Filter — Include vs Exclude Mode', () => {
    describe('isSearchNoteMatched', () => {
        it('should match target keyword inside bill_note', () => {
            expect(isSearchNoteMatched('โพยคุณหญิง', ['หญิง'])).toBe(true)
            expect(isSearchNoteMatched('หญิง', ['หญิง'])).toBe(true)
            expect(isSearchNoteMatched('โพยนายสมชาย', ['หญิง'])).toBe(false)
        })

        it('should return false if bill_note is empty or undefined', () => {
            expect(isSearchNoteMatched('', ['หญิง'])).toBe(false)
            expect(isSearchNoteMatched(null, ['หญิง'])).toBe(false)
            expect(isSearchNoteMatched(undefined, ['หญิง'])).toBe(false)
        })
    })

    describe('isSubmissionSearchMatched', () => {
        const targets = ['หญิง', '123']

        describe('Include Mode (แสดงเฉพาะ)', () => {
            it('should include submission if its numbers match any target', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '123',
                    note: 'สมชาย',
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(true)
            })

            it('should include submission if its note matches any target', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '999',
                    note: 'โพยคุณหญิง',
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(true)
            })

            it('should exclude submission if neither numbers nor note match', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '999',
                    note: 'สมชาย',
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(false)
            })
        })

        describe('Exclude Mode (ไม่เอา / ยกเว้น)', () => {
            it('should exclude (return false) if numbers match any target', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '123',
                    note: 'สมชาย',
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(false)
            })

            it('should exclude (return false) if note matches any target', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '999',
                    note: 'โพยคุณหญิง',
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(false)
            })

            it('should keep (return true) if neither numbers nor note match', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '999',
                    note: 'สมชาย',
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(true)
            })

            it('should keep everything when targets are empty in exclude mode', () => {
                expect(isSubmissionSearchMatched({
                    numbers: '123',
                    note: 'หญิง',
                    searchTargets: [],
                    searchMode: 'exclude'
                })).toBe(true)
            })
        })
    })

    describe('isBillItemSearchMatched — Behavior in Separate Bills (แยกใบโพย)', () => {
        const targets = ['หญิง', '123']

        describe('Exclude Mode', () => {
            it('should exclude ALL items of a bill when bill note matches exclude target', () => {
                // If bill has note 'หญิง', and targets contains 'หญิง':
                // All items in that bill must be dropped (returned false)
                const hasBillNoteMatch = true
                expect(isBillItemSearchMatched({
                    numbers: '999',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(false)

                expect(isBillItemSearchMatched({
                    numbers: '456',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(false)
            })

            it('should exclude matching number but keep non-matching numbers when bill note does NOT match', () => {
                const hasBillNoteMatch = false
                // Number 123 is in targets -> excluded
                expect(isBillItemSearchMatched({
                    numbers: '123',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(false)

                // Number 456 is not in targets -> kept
                expect(isBillItemSearchMatched({
                    numbers: '456',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'exclude'
                })).toBe(true)
            })
        })

        describe('Include Mode', () => {
            it('should include all items if bill note matches target', () => {
                const hasBillNoteMatch = true
                expect(isBillItemSearchMatched({
                    numbers: '999',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(true)
            })

            it('should only include matching numbers if bill note does NOT match', () => {
                const hasBillNoteMatch = false
                expect(isBillItemSearchMatched({
                    numbers: '123',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(true)

                expect(isBillItemSearchMatched({
                    numbers: '456',
                    hasBillNoteMatch,
                    searchTargets: targets,
                    searchMode: 'include'
                })).toBe(false)
            })
        })
    })

    describe('Composite Search with Exclude Mode', () => {
        it('should exclude composite permutations when isComposite is true', () => {
            const targets = ['123']
            // '321' has composite match for '123'
            expect(isSearchNumberMatched('321', targets, true)).toBe(true)

            // Therefore in exclude mode with composite true, it must be excluded
            expect(isSubmissionSearchMatched({
                numbers: '321',
                note: '',
                searchTargets: targets,
                isComposite: true,
                searchMode: 'exclude'
            })).toBe(false)

            // '999' does not match composite '123' -> kept
            expect(isSubmissionSearchMatched({
                numbers: '999',
                note: '',
                searchTargets: targets,
                isComposite: true,
                searchMode: 'exclude'
            })).toBe(true)
        })
    })
})
