/**
 * historyKeyboardNavigation.js
 * Pure navigation helper for keyboard traversal in Dealer History tab.
 */

/**
 * Calculates the next focus target when ArrowDown is pressed.
 *
 * @param {Object} params
 * @param {Object|null} params.currentTarget - Current { cardIndex, section, rowIndex }
 * @param {number} params.totalCards - Total number of round cards
 * @param {Function} params.getCardContent - Function(cardIndex) returning { isExpanded, memberCount, upstreamCount }
 * @returns {Object|null} New target { cardIndex, section, rowIndex }
 */
export function getNextKeyboardFocusTarget({
    currentTarget,
    totalCards = 0,
    getCardContent = () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })
}) {
    if (totalCards <= 0) return null

    if (!currentTarget || currentTarget.cardIndex === undefined || currentTarget.cardIndex === null) {
        return { cardIndex: 0, section: 'header', rowIndex: 0 }
    }

    const { cardIndex, section = 'header', rowIndex = 0 } = currentTarget
    const safeCardIndex = Math.max(0, Math.min(cardIndex, totalCards - 1))
    const currentCard = getCardContent(safeCardIndex) || { isExpanded: false, memberCount: 0, upstreamCount: 0 }
    const { isExpanded = false, memberCount = 0, upstreamCount = 0 } = currentCard

    if (section === 'header') {
        if (isExpanded) {
            if (memberCount > 0) {
                return { cardIndex: safeCardIndex, section: 'member', rowIndex: 0 }
            }
            if (upstreamCount > 0) {
                return { cardIndex: safeCardIndex, section: 'upstream', rowIndex: 0 }
            }
        }
        // Jump to next card header if possible
        if (safeCardIndex + 1 < totalCards) {
            return { cardIndex: safeCardIndex + 1, section: 'header', rowIndex: 0 }
        }
        return { cardIndex: safeCardIndex, section: 'header', rowIndex: 0 }
    }

    if (section === 'member') {
        if (rowIndex + 1 < memberCount) {
            return { cardIndex: safeCardIndex, section: 'member', rowIndex: rowIndex + 1 }
        }
        // Past last member: move to upstream or next card
        if (upstreamCount > 0) {
            return { cardIndex: safeCardIndex, section: 'upstream', rowIndex: 0 }
        }
        if (safeCardIndex + 1 < totalCards) {
            return { cardIndex: safeCardIndex + 1, section: 'header', rowIndex: 0 }
        }
        return { cardIndex: safeCardIndex, section: 'member', rowIndex }
    }

    if (section === 'upstream') {
        if (rowIndex + 1 < upstreamCount) {
            return { cardIndex: safeCardIndex, section: 'upstream', rowIndex: rowIndex + 1 }
        }
        // Past last upstream: move to next card header
        if (safeCardIndex + 1 < totalCards) {
            return { cardIndex: safeCardIndex + 1, section: 'header', rowIndex: 0 }
        }
        return { cardIndex: safeCardIndex, section: 'upstream', rowIndex }
    }

    return { cardIndex: safeCardIndex, section: 'header', rowIndex: 0 }
}

/**
 * Calculates the previous focus target when ArrowUp is pressed.
 *
 * @param {Object} params
 * @param {Object|null} params.currentTarget - Current { cardIndex, section, rowIndex }
 * @param {number} params.totalCards - Total number of round cards
 * @param {Function} params.getCardContent - Function(cardIndex) returning { isExpanded, memberCount, upstreamCount }
 * @returns {Object|null} New target { cardIndex, section, rowIndex }
 */
export function getPrevKeyboardFocusTarget({
    currentTarget,
    totalCards = 0,
    getCardContent = () => ({ isExpanded: false, memberCount: 0, upstreamCount: 0 })
}) {
    if (totalCards <= 0) return null

    if (!currentTarget || currentTarget.cardIndex === undefined || currentTarget.cardIndex === null) {
        return { cardIndex: 0, section: 'header', rowIndex: 0 }
    }

    const { cardIndex, section = 'header', rowIndex = 0 } = currentTarget
    const safeCardIndex = Math.max(0, Math.min(cardIndex, totalCards - 1))
    const currentCard = getCardContent(safeCardIndex) || { isExpanded: false, memberCount: 0, upstreamCount: 0 }
    const { memberCount = 0 } = currentCard

    if (section === 'header') {
        if (safeCardIndex > 0) {
            const prevIndex = safeCardIndex - 1
            const prevCard = getCardContent(prevIndex) || { isExpanded: false, memberCount: 0, upstreamCount: 0 }
            if (prevCard.isExpanded) {
                if (prevCard.upstreamCount > 0) {
                    return { cardIndex: prevIndex, section: 'upstream', rowIndex: prevCard.upstreamCount - 1 }
                }
                if (prevCard.memberCount > 0) {
                    return { cardIndex: prevIndex, section: 'member', rowIndex: prevCard.memberCount - 1 }
                }
            }
            return { cardIndex: prevIndex, section: 'header', rowIndex: 0 }
        }
        return { cardIndex: 0, section: 'header', rowIndex: 0 }
    }

    if (section === 'member') {
        if (rowIndex > 0) {
            return { cardIndex: safeCardIndex, section: 'member', rowIndex: rowIndex - 1 }
        }
        return { cardIndex: safeCardIndex, section: 'header', rowIndex: 0 }
    }

    if (section === 'upstream') {
        if (rowIndex > 0) {
            return { cardIndex: safeCardIndex, section: 'upstream', rowIndex: rowIndex - 1 }
        }
        // At top upstream row, move to last member or header
        if (memberCount > 0) {
            return { cardIndex: safeCardIndex, section: 'member', rowIndex: memberCount - 1 }
        }
        return { cardIndex: safeCardIndex, section: 'header', rowIndex: 0 }
    }

    return { cardIndex: safeCardIndex, section: 'header', rowIndex: 0 }
}
