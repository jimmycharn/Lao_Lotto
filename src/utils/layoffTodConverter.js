/**
 * Utility for converting 3-tod excess bets to 3-top permutations.
 */

/**
 * Returns all unique permutations of a 3-digit string.
 * @param {string} numbers - 3 digit number string, e.g. "123", "122", "111"
 * @returns {string[]} Array of unique permutation strings
 */
export function get3DigitPermutations(numbers) {
    if (!numbers || typeof numbers !== 'string' || numbers.length !== 3) {
        return [numbers || '']
    }
    const chars = numbers.split('')
    const permutations = new Set()
    
    // Generate permutations
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (j === i) continue
            for (let k = 0; k < 3; k++) {
                if (k === i || k === j) continue
                permutations.add(chars[i] + chars[j] + chars[k])
            }
        }
    }
    return Array.from(permutations)
}

/**
 * Converts a 3_tod excess item into an array of 3_top items.
 * Applies Math.ceil(excess / perms.length) for each permutation.
 * @param {object} todItem - Excess item with bet_type === '3_tod'
 * @returns {object[]} Array of converted 3_top items
 */
export function convertTodItemToTopItems(todItem) {
    const perms = get3DigitPermutations(todItem.numbers)
    const perPermExcess = Math.ceil(todItem.excess / perms.length)

    return perms.map(num => ({
        ...todItem,
        bet_type: '3_top',
        numbers: num,
        excess: perPermExcess,
        isConvertedFromTod: true,
        isMergedWithTod: false,
        originalTodNumbers: todItem.numbers,
        originalTodExcess: todItem.excess,
        originalTodFullExcess: todItem.excess,
        convertedTodExcess: perPermExcess,
        convertedPermutationsCount: perms.length
    }))
}

/**
 * Merges tod-converted 3_top items with existing 3_top items in the excessItems list.
 * Approach A: Same number is combined into a single row.
 * @param {object[]} excessItems - Full list of excess items
 * @returns {object[]} Transformed excess items
 */
export function mergeTodToTopExcessItems(excessItems) {
    const nonTodItems = []
    const todItems = []

    excessItems.forEach(item => {
        if (item.bet_type === '3_tod') {
            todItems.push(item)
        } else {
            nonTodItems.push({ ...item })
        }
    })

    if (todItems.length === 0) {
        return nonTodItems
    }

    // Convert all tod items
    const convertedItems = []
    todItems.forEach(tod => {
        convertedItems.push(...convertTodItemToTopItems(tod))
    })

    // Index non-tod items by bet_type|numbers
    const resultMap = new Map()
    nonTodItems.forEach(item => {
        resultMap.set(`${item.bet_type}|${item.numbers}`, item)
    })

    // Merge converted items
    convertedItems.forEach(conv => {
        const key = `3_top|${conv.numbers}`
        if (resultMap.has(key)) {
            const existing = resultMap.get(key)
            resultMap.set(key, {
                ...existing,
                excess: (existing.excess || 0) + conv.excess,
                isMergedWithTod: true,
                isConvertedFromTod: true,
                originalTopExcess: existing.excess || 0,
                convertedTodExcess: conv.excess,
                originalTodNumbers: conv.originalTodNumbers,
                originalTodFullExcess: conv.originalTodFullExcess,
                convertedPermutationsCount: conv.convertedPermutationsCount
            })
        } else {
            resultMap.set(key, conv)
        }
    })

    return Array.from(resultMap.values())
}

const METADATA_PREFIX = '[TOD_CONV:'
const METADATA_SUFFIX = ']'

/**
 * Encodes tod conversion metadata into a transfer note string.
 * @param {object} item - Excess item
 * @param {string} userNote - Optional user notes
 * @returns {string} Combined note string
 */
export function encodeTodConversionNote(item, userNote = '') {
    if (!item.isConvertedFromTod) return userNote || ''
    const meta = {
        orig_num: item.originalTodNumbers,
        orig_excess: item.originalTodFullExcess || item.originalTodExcess,
        allocated: item.convertedTodExcess,
        is_merged: !!item.isMergedWithTod,
        top_excess: item.originalTopExcess || 0
    }
    const metaStr = `${METADATA_PREFIX}${JSON.stringify(meta)}${METADATA_SUFFIX}`
    return userNote ? `${metaStr} ${userNote}` : metaStr
}

/**
 * Parses tod conversion metadata from a transfer note string.
 * @param {string} note - Transfer note
 * @returns {object|null} Parsed metadata with userNote, or null
 */
export function parseTodConversionNote(note) {
    if (!note || typeof note !== 'string') return null
    const startIdx = note.indexOf(METADATA_PREFIX)
    const endIdx = note.indexOf(METADATA_SUFFIX)
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null

    try {
        const jsonStr = note.slice(startIdx + METADATA_PREFIX.length, endIdx)
        const parsed = JSON.parse(jsonStr)
        const remainingNote = (note.slice(0, startIdx) + note.slice(endIdx + METADATA_SUFFIX.length)).trim()
        return {
            originalTodNumbers: parsed.orig_num,
            originalTodExcess: parsed.orig_excess,
            convertedTodExcess: parsed.allocated,
            isMergedWithTod: parsed.is_merged,
            originalTopExcess: parsed.top_excess,
            userNote: remainingNote
        }
    } catch {
        return null
    }
}

/**
 * Calculates effective transferred amount for a specific bet group (e.g. 3_tod|123 or 3_top|123),
 * taking into account any transfers that were converted from 3_tod.
 * 
 * @param {object[]} transfers - Array of inlineTransfers
 * @param {string} targetBetType - e.g. '3_tod' or '3_top'
 * @param {string} targetNumbers - normalized numbers e.g. '123'
 * @returns {number} Effective transferred amount to deduct from excess
 */
export function calculateTransferDeduction(transfers, targetBetType, targetNumbers) {
    if (!Array.isArray(transfers) || transfers.length === 0) return 0

    const targetStr = String(targetNumbers ?? '')
    let total = 0
    transfers.forEach(t => {
        if (!t || t.status === 'returned') return

        const meta = parseTodConversionNote(t.notes)
        if (meta) {
            // Case A: Calculating for 3_tod
            if (targetBetType === '3_tod' && String(meta.originalTodNumbers ?? '') === targetStr) {
                total += (Number(meta.convertedTodExcess) || 0)
            }
            // Case B: Calculating for 3_top
            else if (targetBetType === '3_top' && String(t.numbers ?? '') === targetStr) {
                if (meta.isMergedWithTod) {
                    total += (Number(meta.originalTopExcess) || 0)
                }
                // If it was pure converted tod without merge, it was allocated for tod, not original 3_top
            }
        } else {
            // Standard non-converted transfer
            let tNum = String(t.numbers ?? '')
            if (t.bet_type === '3_tod' || t.bet_type === '4_tod') {
                tNum = tNum.split('').sort().join('')
            }
            if (t.bet_type === targetBetType && tNum === targetStr) {
                total += (Number(t.amount) || 0)
            }
        }
    })
    return total
}

