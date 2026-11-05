/**
 * Pure functions for Graph-based Layoff calculations.
 */

export function getNumberDomainForCategory(category) {
    if (category === '3_digit') {
        const arr = new Array(1000)
        for (let i = 0; i < 1000; i++) {
            arr[i] = String(i).padStart(3, '0')
        }
        return arr
    }
    if (category === '2_digit') {
        const arr = new Array(100)
        for (let i = 0; i < 100; i++) {
            arr[i] = String(i).padStart(2, '0')
        }
        return arr
    }
    if (category === 'run') {
        const arr = new Array(10)
        for (let i = 0; i < 10; i++) {
            arr[i] = String(i)
        }
        return arr
    }
    return []
}

export function mapBetTypeToCategory(betType) {
    if (!betType) return null
    if (['3_top', '3_straight', '3_tod', '3_tod_single', '3_front', '3_bottom', '3_set', '3_straight_set', '3_tod_set'].includes(betType)) return '3_digit'
    if (['2_top', '2_top_rev', '2_back', '2_bottom', '2_bottom_rev', '2_front', '2_front_rev', '2_front_single', '2_center', '2_spread', '2_tang', '2_spread_rev', '2_center_rev', '2_run', '2_have', '2_teng', '2_run_rev', '2_front_set', '2_back_set'].includes(betType)) return '2_digit'
    if (['run_top', 'run_bottom', '1_top', '1_bottom', 'pak_top', 'pak_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1', 'pak_top_front', 'pak_top_center', 'pak_top_back'].includes(betType)) return 'run'
    if (betType.startsWith('4_')) return '4_digit'
    return null
}

export const GRAPH_BET_TYPE_ALIASES = {
    // 3 Digits
    '3_top': ['3_top', '3_straight'],
    '3_tod': ['3_tod', '3_tod_single'],
    '3_bottom': ['3_bottom'],
    '3_front': ['3_front'],

    // 2 Digits
    '2_top': ['2_top', '2_top_rev', '2_back'],
    '2_front': ['2_front', '2_front_rev', '2_front_single', '2_front_set'],
    '2_center': ['2_center', '2_spread', '2_tang', '2_spread_rev', '2_center_rev'],
    '2_bottom': ['2_bottom', '2_bottom_rev', '2_back_set'],
    '2_run': ['2_run', '2_have', '2_teng', '2_run_rev'],

    // 1 Digit
    'run_top': ['run_top', '1_top'],
    'run_bottom': ['run_bottom', '1_bottom'],
    'front_top_1': ['front_top_1', 'pak_top_front'],
    'middle_top_1': ['middle_top_1', 'pak_top_center'],
    'back_top_1': ['back_top_1', 'pak_top_back'],
    'front_bottom_1': ['front_bottom_1', 'pak_bottom_front'],
    'back_bottom_1': ['back_bottom_1', 'pak_bottom_back']
}

/**
 * Checks if a bet type matches the filter (including aliases)
 */
export function isBetTypeMatchingFilter(betType, filterBetType) {
    if (!filterBetType || filterBetType === 'all') {
        return true
    }
    if (!betType) return false

    // Category matching for group 'all' options
    if (filterBetType === '3_all') {
        return mapBetTypeToCategory(betType) === '3_digit'
    }
    if (filterBetType === '2_all') {
        return mapBetTypeToCategory(betType) === '2_digit'
    }
    if (filterBetType === 'run_all' || filterBetType === '1_all') {
        return mapBetTypeToCategory(betType) === 'run'
    }

    if (betType === filterBetType) return true

    const aliases = GRAPH_BET_TYPE_ALIASES[filterBetType]
    if (aliases && aliases.includes(betType)) {
        return true
    }
    return false
}

/**
 * Returns available bet types for each digit group in the graph modal
 */
export function getGraphBetTypesByCategory(category, lotteryType = 'thai', items = []) {
    if (category === '3_digit') {
        const has3Bottom = (lotteryType === 'thai') || (Array.isArray(items) && items.some(it => it && (it.bet_type === '3_bottom' || it.display_bet_type?.includes('ล่าง'))))
        const options = [
            { id: '3_top', label: '3 ตัวบน', shortLabel: '3 ตัวบน' },
            { id: '3_tod', label: '3 ตัวโต๊ด', shortLabel: '3 ตัวโต๊ด' }
        ]
        if (has3Bottom) {
            options.push({ id: '3_bottom', label: '3 ตัวล่าง', shortLabel: '3 ตัวล่าง' })
        }
        options.push({ id: '3_all', label: 'รวม 3 ตัวทุกประเภท', shortLabel: 'รวม 3 ตัว' })
        return options
    }

    if (category === '2_digit') {
        return [
            { id: '2_top', label: '2 ตัวบน', shortLabel: '2 ตัวบน' },
            { id: '2_front', label: '2 ตัวหน้า', shortLabel: '2 ตัวหน้า' },
            { id: '2_center', label: '2 ตัวถ่าง', shortLabel: '2 ตัวถ่าง' },
            { id: '2_bottom', label: '2 ตัวล่าง', shortLabel: '2 ตัวล่าง' },
            { id: '2_run', label: '2 ตัวลอย', shortLabel: '2 ตัวลอย' },
            { id: '2_all', label: 'รวม 2 ตัวทุกประเภท', shortLabel: 'รวม 2 ตัว' }
        ]
    }

    if (category === 'run') {
        return [
            { id: 'run_top', label: 'ลอยบน', shortLabel: 'ลอยบน' },
            { id: 'run_bottom', label: 'ลอยล่าง', shortLabel: 'ลอยล่าง' },
            { id: 'front_top_1', label: 'ปักหน้าบน', shortLabel: 'ปักหน้าบน' },
            { id: 'middle_top_1', label: 'ปักกลางบน', shortLabel: 'ปักกลางบน' },
            { id: 'back_top_1', label: 'ปักหลังบน', shortLabel: 'ปักหลังบน' },
            { id: 'front_bottom_1', label: 'ปักหน้าล่าง', shortLabel: 'ปักหน้าล่าง' },
            { id: 'back_bottom_1', label: 'ปักหลังล่าง', shortLabel: 'ปักหลังล่าง' },
            { id: 'run_all', label: 'รวม 1 ตัวทุกประเภท', shortLabel: 'รวม 1 ตัว' }
        ]
    }

    return []
}

export function groupItemsByNumber(items, category, filterBetType = null) {
    const grouped = {}
    if (!Array.isArray(items)) return grouped

    items.forEach(item => {
        if (!item || !item.numbers) return
        const cat = mapBetTypeToCategory(item.bet_type)
        if (cat !== category) return

        if (filterBetType && !isBetTypeMatchingFilter(item.bet_type, filterBetType)) {
            return
        }

        const numStr = String(item.numbers)
        const amt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
        if (amt <= 0) return

        const origAmt = Number(item.originalTotalAmount ?? item.originalExcess ?? amt)

        if (!grouped[numStr]) {
            grouped[numStr] = {
                numbers: numStr,
                totalAmount: 0,
                originalTotalAmount: 0,
                items: []
            }
        }
        grouped[numStr].totalAmount += amt
        grouped[numStr].originalTotalAmount += origAmt
        grouped[numStr].items.push(item)
    })

    return grouped
}

export function evaluateLineCut({
    amount,
    originalAmount,
    stagedAmount = 0,
    lineCount,
    singleLine = 0,
    upperLine = 0,
    lowerLine = 0,
    cutMode = 'above',
    amountMode = 'difference'
}) {
    const staged = Math.max(0, Number(stagedAmount) || 0)
    const avail = Math.max(0, Number(amount) || 0)
    const orig = originalAmount !== undefined ? Math.max(0, Number(originalAmount) || 0) : (avail + staged)

    if (orig <= 0 && avail <= 0) {
        return { isMatched: false, cutAmount: 0, retainedAmount: 0 }
    }

    let targetCut = 0

    if (lineCount === 1) {
        const line = Number(singleLine) || 0
        if (cutMode === 'above') {
            if (orig > line) {
                targetCut = amountMode === 'difference' ? orig - line : orig
            }
        } else if (cutMode === 'below') {
            if (orig < line) {
                targetCut = orig
            }
        }
    } else if (lineCount === 2) {
        const upper = Math.max(Number(upperLine) || 0, Number(lowerLine) || 0)
        const lower = Math.min(Number(upperLine) || 0, Number(lowerLine) || 0)

        if (cutMode === 'between') {
            if (amountMode === 'difference') {
                targetCut = Math.max(0, Math.min(orig, upper) - lower)
            } else {
                // full mode: only cut full amount if total amount is within [lower, upper]
                targetCut = (orig >= lower && orig <= upper) ? orig : 0
            }
        } else if (cutMode === 'outside') {
            if (amountMode === 'difference') {
                const betweenPortion = Math.max(0, Math.min(orig, upper) - lower)
                targetCut = Math.max(0, orig - betweenPortion)
            } else {
                // full mode: cut full amount if outside [lower, upper]
                targetCut = (orig > upper || orig < lower) ? orig : 0
            }
        }
    }

    const rawCut = Math.max(0, targetCut - staged)
    const cutAmount = Math.min(avail, rawCut)
    const retainedAmount = Math.max(0, avail - cutAmount)
    const isMatched = cutAmount > 0

    return {
        isMatched,
        cutAmount,
        retainedAmount
    }
}

export function calculateGraphCuts({
    buckets = {},
    lineCount = 1,
    singleLine = 0,
    upperLine = 0,
    lowerLine = 0,
    cutMode = 'above',
    amountMode = 'difference'
}) {
    let matchedNumbersCount = 0
    let totalCutAmount = 0
    const cutItems = []

    Object.values(buckets).forEach(bucket => {
        const origAmt = bucket.originalTotalAmount !== undefined ? bucket.originalTotalAmount : bucket.totalAmount
        const stagedAmt = Math.max(0, origAmt - bucket.totalAmount)

        const evalRes = evaluateLineCut({
            amount: bucket.totalAmount,
            originalAmount: origAmt,
            stagedAmount: stagedAmt,
            lineCount,
            singleLine,
            upperLine,
            lowerLine,
            cutMode,
            amountMode
        })

        if (evalRes.isMatched && evalRes.cutAmount > 0) {
            matchedNumbersCount += 1
            totalCutAmount += evalRes.cutAmount

            // Allocate cutAmount across underlying items proportionally or sequentially
            let remainingCutToAllocate = evalRes.cutAmount
            const items = bucket.items || []

            for (let i = 0; i < items.length; i++) {
                if (remainingCutToAllocate <= 0) break
                const item = items[i]
                const itemAmt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
                const itemCut = Math.min(itemAmt, remainingCutToAllocate)

                if (itemCut > 0) {
                    cutItems.push({
                        ...item,
                        excess: itemCut,
                        originalExcess: itemAmt,
                        cutFromGraph: true
                    })
                    remainingCutToAllocate -= itemCut
                }
            }
        }
    })

    return {
        matchedNumbersCount,
        totalCutAmount,
        cutItems
    }
}

export function aggregateStagedLayoffItems(existingBasket = [], newCutItems = []) {
    const map = new Map()

    existingBasket.forEach(item => {
        if (!item || !item.bet_type || !item.numbers) return
        const key = `${item.bet_type}|${item.numbers}`
        map.set(key, { ...item, excess: Number(item.excess) || 0 })
    })

    newCutItems.forEach(item => {
        if (!item || !item.bet_type || !item.numbers) return
        const key = `${item.bet_type}|${item.numbers}`
        const amt = Number(item.excess) || 0
        if (map.has(key)) {
            const existing = map.get(key)
            existing.excess += amt
        } else {
            map.set(key, { ...item, excess: amt })
        }
    })

    return Array.from(map.values()).filter(item => (item.excess || 0) > 0)
}

/**
 * Calculates remaining available items after deducting amounts already staged in the basket.
 *
 * @param {Array} items - Original items list (with bet_type, numbers, and excess/remainingAmount/amount)
 * @param {Array} stagedBasket - Current staged items in basket (with bet_type, numbers, and excess)
 * @returns {Array} List of items with remaining amounts > 0
 */
export function getAvailableItemsAfterStaging(items = [], stagedBasket = []) {
    if (!stagedBasket || stagedBasket.length === 0) {
        return items
    }

    // Build mutable map of staged amounts by key: `${item.bet_type}|${item.numbers}`
    const stagedMap = new Map()
    stagedBasket.forEach(staged => {
        if (!staged || !staged.bet_type || !staged.numbers) return
        const key = `${staged.bet_type}|${staged.numbers}`
        const current = stagedMap.get(key) || 0
        stagedMap.set(key, current + (Number(staged.excess) || 0))
    })

    if (stagedMap.size === 0) {
        return items
    }

    return items.map(item => {
        if (!item) return item
        const key = `${item.bet_type}|${item.numbers}`
        const stagedAvailable = stagedMap.get(key) || 0
        if (stagedAvailable <= 0) return item

        const origAmt = Number(
            item.excess !== undefined ? item.excess :
            (item.remainingAmount !== undefined ? item.remainingAmount : item.amount)
        ) || 0

        const deductAmt = Math.min(origAmt, stagedAvailable)
        const remAmt = Math.max(0, origAmt - deductAmt)
        stagedMap.set(key, stagedAvailable - deductAmt)

        return {
            ...item,
            excess: remAmt,
            remainingAmount: remAmt,
            totalAmount: remAmt,
            originalTotalAmount: origAmt
        }
    }).filter(item => {
        const amt = Number(
            item.excess !== undefined ? item.excess :
            (item.remainingAmount !== undefined ? item.remainingAmount : item.amount)
        ) || 0
        return amt > 0
    })
}

/**
 * Sorts items staged in the basket.
 *
 * @param {Array} items - List of staged basket items
 * @param {'number'|'amount'} sortBy - Sort column ('number' | 'amount')
 * @param {'asc'|'desc'} sortOrder - Sort direction ('asc' | 'desc')
 * @returns {Array} Sorted shallow copy of items
 */
export function sortBasketItems(items = [], sortBy = 'number', sortOrder = 'asc') {
    if (!Array.isArray(items)) return []
    if (items.length <= 1) return [...items]

    return [...items].sort((a, b) => {
        if (sortBy === 'amount' || sortBy === 'excess') {
            const aAmt = Number(a?.excess ?? a?.remainingAmount ?? a?.amount ?? 0)
            const bAmt = Number(b?.excess ?? b?.remainingAmount ?? b?.amount ?? 0)
            const diff = aAmt - bAmt
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
        if (cmp !== 0) {
            return sortOrder === 'asc' ? cmp : -cmp
        }
        // Tie-breaker: sort by bet_type
        return String(a?.bet_type ?? '').localeCompare(String(b?.bet_type ?? ''))
    })
}
