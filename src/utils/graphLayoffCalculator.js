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
    if (['3_top', '3_straight', '3_tod', '3_tod_single', '3_front', '3_bottom', '3_set'].includes(betType)) return '3_digit'
    if (['2_top', '2_bottom', '2_front', '2_center', '2_spread', '2_run', '2_teng', '2_tang', '2_have'].includes(betType)) return '2_digit'
    if (['run_top', 'run_bottom', '1_top', '1_bottom', 'pak_top', 'pak_bottom', 'front_top_1', 'middle_top_1', 'back_top_1'].includes(betType)) return 'run'
    if (betType.startsWith('4_')) return '4_digit'
    return null
}

export function groupItemsByNumber(items, category) {
    const grouped = {}
    if (!Array.isArray(items)) return grouped

    items.forEach(item => {
        if (!item || !item.numbers) return
        const cat = mapBetTypeToCategory(item.bet_type)
        if (cat !== category) return

        const numStr = String(item.numbers)
        const amt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
        if (amt <= 0) return

        if (!grouped[numStr]) {
            grouped[numStr] = {
                numbers: numStr,
                totalAmount: 0,
                items: []
            }
        }
        grouped[numStr].totalAmount += amt
        grouped[numStr].items.push(item)
    })

    return grouped
}

export function evaluateLineCut({
    amount,
    lineCount,
    singleLine = 0,
    upperLine = 0,
    lowerLine = 0,
    cutMode = 'above',
    amountMode = 'difference'
}) {
    const numAmt = Number(amount) || 0
    if (numAmt <= 0) {
        return { isMatched: false, cutAmount: 0, retainedAmount: 0 }
    }

    if (lineCount === 1) {
        const line = Number(singleLine) || 0
        if (cutMode === 'above') {
            if (numAmt > line) {
                const cut = amountMode === 'difference' ? numAmt - line : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        } else if (cutMode === 'below') {
            if (numAmt < line) {
                const cut = numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: 0
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        }
    }

    if (lineCount === 2) {
        const upper = Math.max(Number(upperLine) || 0, Number(lowerLine) || 0)
        const lower = Math.min(Number(upperLine) || 0, Number(lowerLine) || 0)

        if (cutMode === 'between') {
            if (numAmt >= lower && numAmt <= upper) {
                const cut = amountMode === 'difference' ? numAmt - lower : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        } else if (cutMode === 'outside') {
            if (numAmt > upper) {
                const cut = amountMode === 'difference' ? numAmt - upper : numAmt
                return {
                    isMatched: true,
                    cutAmount: Math.max(0, cut),
                    retainedAmount: Math.max(0, numAmt - cut)
                }
            }
            if (numAmt < lower) {
                return {
                    isMatched: true,
                    cutAmount: numAmt,
                    retainedAmount: 0
                }
            }
            return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
        }
    }

    return { isMatched: false, cutAmount: 0, retainedAmount: numAmt }
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
        const evalRes = evaluateLineCut({
            amount: bucket.totalAmount,
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
