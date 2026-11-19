/**
 * Sort remaining layoff bet items
 * 
 * @param {Array} items - List of remaining items
 * @param {'number'|'remaining'|'total'} sortBy - Sort column key
 * @param {'asc'|'desc'} sortOrder - Sort direction
 * @returns {Array} New sorted array
 */
export function sortRemainingItems(items, sortBy = 'number', sortOrder = 'asc') {
    if (!Array.isArray(items)) return []
    if (items.length <= 1) return [...items]

    return [...items].sort((a, b) => {
        if (sortBy === 'remaining') {
            const aRem = Number(a?.remainingAmount) || 0
            const bRem = Number(b?.remainingAmount) || 0
            const diff = aRem - bRem
            if (diff !== 0) {
                return sortOrder === 'asc' ? diff : -diff
            }
            // Tie-breaker: sort by numbers ascending
            return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
        }

        if (sortBy === 'total') {
            const aTot = Number(a?.totalAmount) || 0
            const bTot = Number(b?.totalAmount) || 0
            const diff = aTot - bTot
            if (diff !== 0) {
                return sortOrder === 'asc' ? diff : -diff
            }
            // Tie-breaker: sort by numbers ascending
            return String(a?.numbers ?? '').localeCompare(String(b?.numbers ?? ''), undefined, { numeric: true })
        }

        // Default: sort by 'number'
        const aNum = String(a?.numbers ?? '')
        const bNum = String(b?.numbers ?? '')
        const digitDiff = aNum.length - bNum.length
        if (digitDiff !== 0) {
            return sortOrder === 'asc' ? digitDiff : -digitDiff
        }
        const cmp = aNum.localeCompare(bNum, undefined, { numeric: true })
        return sortOrder === 'asc' ? cmp : -cmp
    })
}

/**
 * Sort transfer modal items by number or transfer amount (excess)
 * 
 * @param {Array} items - List of items in the transfer modal
 * @param {'number'|'amount'} sortBy - Sort column key ('number' | 'amount')
 * @param {'asc'|'desc'} sortOrder - Sort direction ('asc' | 'desc')
 * @returns {Array} New sorted array
 */
export function sortTransferModalItems(items, sortBy = 'number', sortOrder = 'asc') {
    if (!Array.isArray(items)) return []
    if (items.length <= 1) return [...items]

    return [...items].sort((a, b) => {
        if (sortBy === 'amount') {
            const aAmt = Number(a?.excess) || 0
            const bAmt = Number(b?.excess) || 0
            const diff = aAmt - bAmt
            if (diff !== 0) {
                return sortOrder === 'asc' ? diff : -diff
            }
            // Tie-breaker: sort by numbers ascending
            const aNum = String(a?.displayNumbers ?? a?.numbers ?? '')
            const bNum = String(b?.displayNumbers ?? b?.numbers ?? '')
            const digitDiff = aNum.length - bNum.length
            if (digitDiff !== 0) return digitDiff
            return aNum.localeCompare(bNum, undefined, { numeric: true })
        }

        // Default: sort by 'number'
        const aNum = String(a?.displayNumbers ?? a?.numbers ?? '')
        const bNum = String(b?.displayNumbers ?? b?.numbers ?? '')
        const digitDiff = aNum.length - bNum.length
        if (digitDiff !== 0) {
            return sortOrder === 'asc' ? digitDiff : -digitDiff
        }
        const cmp = aNum.localeCompare(bNum, undefined, { numeric: true })
        if (cmp !== 0) {
            return sortOrder === 'asc' ? cmp : -cmp
        }
        // Tie-breaker: sort by excess amount descending
        const aAmt = Number(a?.excess) || 0
        const bAmt = Number(b?.excess) || 0
        return bAmt - aAmt
    })
}

