/**
 * Extracts unique lottery types from closed rounds
 * @param {Array} closedRounds 
 * @returns {Array<string>} Unique lottery types present in closed rounds
 */
export function getAvailableClosedLotteryTypes(closedRounds) {
    if (!Array.isArray(closedRounds) || closedRounds.length === 0) {
        return []
    }
    const typeSet = new Set()
    closedRounds.forEach(round => {
        if (round && round.lottery_type) {
            typeSet.add(round.lottery_type)
        }
    })
    return Array.from(typeSet)
}

/**
 * Filters closed rounds by lottery type
 * @param {Array} closedRounds 
 * @param {string} typeFilter 'all' or specific lottery_type (e.g. 'lao', 'thai')
 * @returns {Array} Filtered closed rounds
 */
export function filterClosedRounds(closedRounds, typeFilter) {
    if (!Array.isArray(closedRounds)) {
        return []
    }
    if (!typeFilter || typeFilter === 'all') {
        return closedRounds
    }
    return closedRounds.filter(round => round && round.lottery_type === typeFilter)
}
