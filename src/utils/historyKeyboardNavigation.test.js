import { describe, it, expect } from 'vitest'
import {
    getNextKeyboardFocusTarget,
    getPrevKeyboardFocusTarget
} from './historyKeyboardNavigation'

describe('historyKeyboardNavigation', () => {
    describe('getNextKeyboardFocusTarget', () => {
        it('returns first card header if current target is null', () => {
            const target = getNextKeyboardFocusTarget({
                currentTarget: null,
                totalCards: 3,
                getCardContent: () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })
            })
            expect(target).toEqual({ cardIndex: 0, section: 'header', rowIndex: 0 })
        })

        it('jumps between collapsed cards sequentially', () => {
            const getCardContent = () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })

            let target = { cardIndex: 0, section: 'header', rowIndex: 0 }
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 1, section: 'header', rowIndex: 0 })

            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 2, section: 'header', rowIndex: 0 })

            // At the end, stays at the last card
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 2, section: 'header', rowIndex: 0 })
        })

        it('enters first member row when current card is expanded', () => {
            const cards = [
                { isExpanded: true, memberCount: 3, upstreamCount: 1 },
                { isExpanded: false, memberCount: 2, upstreamCount: 0 }
            ]
            const getCardContent = (idx) => cards[idx] || { isExpanded: false, memberCount: 0, upstreamCount: 0 }

            let target = { cardIndex: 0, section: 'header', rowIndex: 0 }
            // From header -> member 0
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'member', rowIndex: 0 })

            // member 0 -> member 1
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'member', rowIndex: 1 })

            // member 1 -> member 2
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'member', rowIndex: 2 })

            // member 2 -> upstream 0
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'upstream', rowIndex: 0 })

            // upstream 0 (last row) -> card 1 header
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 1, section: 'header', rowIndex: 0 })
        })

        it('handles card with only upstream rows (no members)', () => {
            const cards = [
                { isExpanded: true, memberCount: 0, upstreamCount: 2 },
                { isExpanded: false, memberCount: 0, upstreamCount: 0 }
            ]
            const getCardContent = (idx) => cards[idx]

            let target = { cardIndex: 0, section: 'header', rowIndex: 0 }
            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'upstream', rowIndex: 0 })

            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'upstream', rowIndex: 1 })

            target = getNextKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 1, section: 'header', rowIndex: 0 })
        })
    })

    describe('getPrevKeyboardFocusTarget', () => {
        it('returns first card header if current target is null', () => {
            const target = getPrevKeyboardFocusTarget({
                currentTarget: null,
                totalCards: 3,
                getCardContent: () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })
            })
            expect(target).toEqual({ cardIndex: 0, section: 'header', rowIndex: 0 })
        })

        it('moves backwards between collapsed cards', () => {
            const getCardContent = () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })

            let target = { cardIndex: 2, section: 'header', rowIndex: 0 }
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 1, section: 'header', rowIndex: 0 })

            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'header', rowIndex: 0 })

            // Stays at beginning
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 3, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'header', rowIndex: 0 })
        })

        it('moves backwards from rows up to header and into previous expanded card', () => {
            const cards = [
                { isExpanded: true, memberCount: 2, upstreamCount: 1 },
                { isExpanded: true, memberCount: 1, upstreamCount: 0 }
            ]
            const getCardContent = (idx) => cards[idx]

            // Start at card 1 member 0
            let target = { cardIndex: 1, section: 'member', rowIndex: 0 }
            // Move up to card 1 header
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 1, section: 'header', rowIndex: 0 })

            // Move up from card 1 header -> enters card 0 last row (upstream 0)
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'upstream', rowIndex: 0 })

            // upstream 0 -> member 1
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'member', rowIndex: 1 })

            // member 1 -> member 0
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'member', rowIndex: 0 })

            // member 0 -> card 0 header
            target = getPrevKeyboardFocusTarget({ currentTarget: target, totalCards: 2, getCardContent })
            expect(target).toEqual({ cardIndex: 0, section: 'header', rowIndex: 0 })
        })
    })
})
