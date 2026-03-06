import { supabase } from '../lib/supabase'

/**
 * Fetch all active number limits for a round
 */
export async function fetchNumberLimits(roundId) {
    // Query without is_active filter to support pre-migration 113 schemas
    // Filter is_active in JS instead
    const { data, error } = await supabase
        .from('number_limits')
        .select('*')
        .eq('round_id', roundId)

    if (error) {
        console.error('[NumberLimits] Error fetching number limits:', error)
        return []
    }

    // Filter: only active limits (if is_active column exists, respect it; otherwise treat all as active)
    const activeLimits = (data || []).filter(nl => nl.is_active === undefined || nl.is_active === true)
    console.log('[NumberLimits] fetchNumberLimits: total from DB:', data?.length, ', active:', activeLimits.length, activeLimits.map(nl => ({ id: nl.id, bet_type: nl.bet_type, numbers: nl.numbers, max_amount: nl.max_amount, limit_type: nl.limit_type, is_active: nl.is_active })))
    return activeLimits
}

/**
 * Fetch current totals for all numbers in a round (grouped by bet_type + numbers)
 * Returns a Map: key = `${bet_type}|${numbers}` => total amount
 */
export async function fetchCurrentTotals(roundId) {
    const { data, error } = await supabase
        .from('submissions')
        .select('bet_type, numbers, amount')
        .eq('round_id', roundId)
        .eq('is_deleted', false)

    if (error) {
        console.error('Error fetching current totals:', error)
        return new Map()
    }

    const totals = new Map()
    ;(data || []).forEach(s => {
        const key = `${s.bet_type}|${s.numbers}`
        totals.set(key, (totals.get(key) || 0) + parseFloat(s.amount || 0))
    })
    return totals
}

/**
 * Find matching number limit for a given bet_type + numbers
 * Checks direct match first, then reversed match
 */
export function findMatchingLimit(numberLimits, betType, numbers) {
    // 1. Direct match: same bet_type and same numbers
    const directMatch = numberLimits.find(
        nl => nl.bet_type === betType && nl.numbers === numbers
    )
    if (directMatch) return directMatch

    // 2. Reversed match: same bet_type, include_reversed=true, and numbers is in reversed_numbers
    const reversedMatch = numberLimits.find(
        nl => nl.bet_type === betType &&
            nl.include_reversed &&
            Array.isArray(nl.reversed_numbers) &&
            nl.reversed_numbers.includes(numbers)
    )
    return reversedMatch || null
}

/**
 * Get effective payout percent considering time condition
 */
export function getEffectivePayoutPercent(limit) {
    if (!limit) return 100

    let payoutPercent = limit.payout_percent || 100

    // Check time condition
    if (limit.time_condition && limit.time_condition.after_time) {
        const now = new Date()
        const [hours, minutes] = limit.time_condition.after_time.split(':').map(Number)
        const afterTime = new Date()
        afterTime.setHours(hours, minutes, 0, 0)

        if (now >= afterTime) {
            payoutPercent = limit.time_condition.payout_percent || payoutPercent
        }
    }

    return payoutPercent
}

/**
 * Check a single submission line against number limits
 * Returns: { status, limit, currentTotal, maxAllowed, remaining, overflow, payoutPercent }
 * 
 * status:
 *   - 'ok': no limit or within limit
 *   - 'limited': within limit but payout reduced (เลขอั้น)
 *   - 'overflow': exceeds limit, overflow amount tracked
 *   - 'blocked': exceeds limit and blocked (เลขปิด)
 */
export function checkSingleSubmission(numberLimits, currentTotals, betType, numbers, amount) {
    const limit = findMatchingLimit(numberLimits, betType, numbers)
    console.log(`[NumberLimits] checkSingle: betType=${betType} numbers=${numbers} amount=${amount} => matchedLimit:`, limit ? { id: limit.id, bet_type: limit.bet_type, numbers: limit.numbers, max_amount: limit.max_amount, limit_type: limit.limit_type } : 'NONE')

    if (!limit) {
        return {
            status: 'ok',
            limit: null,
            currentTotal: 0,
            maxAllowed: Infinity,
            remaining: Infinity,
            overflow: 0,
            payoutPercent: 100
        }
    }

    const key = `${betType}|${numbers}`
    const currentTotal = currentTotals.get(key) || 0
    const maxAllowed = parseFloat(limit.max_amount) || 0
    const remaining = Math.max(maxAllowed - currentTotal, 0)
    const payoutPercent = getEffectivePayoutPercent(limit)
    const amountNum = parseFloat(amount) || 0
    // Default to 'blocked' if limit_type column doesn't exist (pre-migration 113)
    const limitType = limit.limit_type || 'blocked'

    // Check if already at/over limit
    if (currentTotal >= maxAllowed) {
        if (limitType === 'blocked') {
            return {
                status: 'blocked',
                limit,
                currentTotal,
                maxAllowed,
                remaining: 0,
                overflow: amountNum,
                payoutPercent
            }
        }
        // limited type: still accept but mark as overflow
        return {
            status: 'overflow',
            limit,
            currentTotal,
            maxAllowed,
            remaining: 0,
            overflow: amountNum,
            payoutPercent
        }
    }

    // Check if this submission would exceed the limit
    if (currentTotal + amountNum > maxAllowed) {
        const overflowAmt = (currentTotal + amountNum) - maxAllowed

        if (limitType === 'blocked') {
            // For blocked: allow partial up to remaining
            return {
                status: 'blocked',
                limit,
                currentTotal,
                maxAllowed,
                remaining,
                overflow: overflowAmt,
                payoutPercent
            }
        }

        // For limited: accept full amount but mark overflow
        return {
            status: 'overflow',
            limit,
            currentTotal,
            maxAllowed,
            remaining,
            overflow: overflowAmt,
            payoutPercent
        }
    }

    // Within limit but has a limit record (could still have reduced payout)
    return {
        status: payoutPercent < 100 ? 'limited' : 'ok',
        limit,
        currentTotal,
        maxAllowed,
        remaining,
        overflow: 0,
        payoutPercent
    }
}

/**
 * Check multiple submission lines against number limits
 * Accumulates amounts as we process each line
 * Returns array of check results, one per line
 */
export function checkBatchSubmissions(numberLimits, currentTotals, lines) {
    // Create a mutable copy of totals so we can accumulate as we check each line
    const runningTotals = new Map(currentTotals)
    const results = []

    for (const line of lines) {
        const { betType, numbers, amount } = line
        const result = checkSingleSubmission(numberLimits, runningTotals, betType, numbers, amount)
        results.push({ ...result, betType, numbers, amount })

        // Update running totals
        const key = `${betType}|${numbers}`
        const amountNum = parseFloat(amount) || 0
        runningTotals.set(key, (runningTotals.get(key) || 0) + amountNum)
    }

    return results
}

/**
 * Generate summary message for limit warnings
 * Returns null if no warnings
 */
export function generateLimitWarnings(checkResults) {
    const blocked = checkResults.filter(r => r.status === 'blocked')
    const overflow = checkResults.filter(r => r.status === 'overflow')
    const limited = checkResults.filter(r => r.status === 'limited')

    if (blocked.length === 0 && overflow.length === 0 && limited.length === 0) {
        return null
    }

    const warnings = []

    if (blocked.length > 0) {
        const nums = [...new Set(blocked.map(r => r.numbers))].join(', ')
        warnings.push(`🔴 เลขปิด: ${nums} (ไม่สามารถรับได้)`)
    }

    if (overflow.length > 0) {
        const items = overflow.map(r => `${r.numbers} (เกิน ${r.overflow.toLocaleString()})`)
        warnings.push(`🔶 เลขอั้น (เกินวงเงิน): ${items.join(', ')}`)
    }

    if (limited.length > 0) {
        const items = limited.map(r => `${r.numbers} (จ่าย ${r.payoutPercent}%)`)
        warnings.push(`⚠️ เลขอั้น (จ่ายลด): ${items.join(', ')}`)
    }

    return warnings
}
