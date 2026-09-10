import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance
} from './memberSettlementCalculator'

/**
 * Extracts and formats the true round date (YYYY-MM-DD) which ALWAYS corresponds
 * to the draw/closing date (close_time / close_date), NOT open_time / open_date.
 * Uses 'Asia/Bangkok' timezone formatting to guarantee local lottery day consistency.
 *
 * @param {Object|string|Date} roundOrVal - Round object or timestamp
 * @returns {string} Formatted date YYYY-MM-DD
 */
export function getRoundCloseDate(roundOrVal) {
    if (!roundOrVal) return ''

    let raw = roundOrVal
    if (typeof roundOrVal === 'object' && !(roundOrVal instanceof Date)) {
        // Strict priority: close_time > close_date > round_date > open_time > created_at
        raw = roundOrVal.close_time || roundOrVal.close_date || roundOrVal.round_date || roundOrVal.open_time || roundOrVal.created_at || ''
    }

    if (!raw) return ''
    if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed
        }
    }

    try {
        const d = new Date(raw)
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        }
    } catch {
        // Fallback
    }

    return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

/**
 * Calculates net difference and direction between past debt total and current prize amount.
 * 
 * @param {Object} params
 * @param {number|string} [params.pastDebtTotal=0] - Total debt from selected past rounds
 * @param {number|string} [params.prizeAmount=0] - Prize winnings available from current round
 * @param {number|string} [params.slipAmount=0] - User-input or suggested slip amount
 * @returns {Object} summary
 */
export function calculateOffsetSummary({ pastDebtTotal = 0, prizeAmount = 0, slipAmount = 0 }) {
    const debt = Number(pastDebtTotal) || 0
    const prize = Math.max(0, Number(prizeAmount) || 0)
    const netDifference = Math.round(debt - prize)

    let direction = 'even'
    if (netDifference > 0) {
        direction = 'member_to_dealer'
    } else if (netDifference < 0) {
        direction = 'dealer_to_member'
    }

    return {
        pastDebtTotal: debt,
        prizeAmount: prize,
        netDifference,
        direction,
        isExactMatch: netDifference === 0,
        suggestedSlipAmount: Math.abs(netDifference)
    }
}

/**
 * Allocates offset funds across selected past rounds sequentially (FIFO).
 * Generates records ready to be inserted into member_round_payments or upstream_round_payments.
 * Supports both debt clearance and past prize credit clearance.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.selectedPastRounds - List of past unpaid rounds [{ roundId, roundDate, lotteryType, debt }]
 * @param {number|string} params.offsetPrizeAmount - Prize amount from current round used for offset
 * @param {number|string} params.actualSlipAmount - Actual bank slip transferred
 * @param {string} [params.paidAt] - ISO date string (YYYY-MM-DD)
 * @param {Object} params.currentRound - Current lottery round object
 * @param {string|null} [params.memberUserId=null] - Target member user_id (null if upstream)
 * @param {string|null} [params.dealerId=null] - Dealer user_id
 * @param {boolean} [params.isUpstream=false] - Whether this offset is for an upstream layoff
 * @param {string|null} [params.upstreamDealerName=null] - Upstream dealer name (if upstream)
 * @param {string|null} [params.upstreamDealerId=null] - Upstream dealer ID (if upstream)
 * @returns {Object} { currentRoundPayment, pastRoundPayments }
 */
export function allocateCrossRoundOffsetPayments({
    selectedPastRounds = [],
    offsetPrizeAmount = 0,
    actualSlipAmount = 0,
    paidAt = new Date().toISOString().split('T')[0],
    currentRound = {},
    memberUserId = null,
    dealerId = null,
    isUpstream = false,
    upstreamDealerName = null,
    upstreamDealerId = null
}) {
    const curRoundPrize = Math.max(0, Number(offsetPrizeAmount) || 0)
    const slip = Math.max(0, Number(actualSlipAmount) || 0)

    const curRoundId = currentRound.round_id || currentRound.id
    const curRoundDateIso = getRoundCloseDate(currentRound) || (/^\d{4}-\d{2}-\d{2}$/.test(String(currentRound.round_date)) ? currentRound.round_date : null)
    const curRoundDateLabel = curRoundDateIso || currentRound.round_date || 'งวดปัจจุบัน'

    const pastDateList = selectedPastRounds.map(r => r.roundDate || getRoundCloseDate(r) || r.round_date || 'งวดก่อน').join(', ')

    // Separate past rounds into debts (> 0) and unpaid prize credits (< 0)
    const pastDebts = selectedPastRounds.filter(r => Number(r.debt || 0) > 0)
    const pastPrizes = selectedPastRounds.filter(r => Number(r.debt || 0) < 0)

    const pastRoundPayments = []

    // 1. For each past round with unpaid prize credit (debt < 0), record prize payout to clear it
    let totalPastPrizeCredit = 0
    for (const past of pastPrizes) {
        const prizeAmt = Math.abs(Number(past.debt || 0))
        totalPastPrizeCredit += prizeAmt

        const pastPrizeRoundDateIso = getRoundCloseDate(past) || (/^\d{4}-\d{2}-\d{2}$/.test(String(past.roundDate || past.round_date)) ? (past.roundDate || past.round_date) : null)

        const pastPrizePayment = {
            dealer_id: dealerId,
            round_id: past.roundId || past.round_id,
            lottery_type: past.lotteryType || past.lottery_type || null,
            round_date: pastPrizeRoundDateIso,
            payment_type: isUpstream ? 'prize_collection' : 'prize_payout',
            direction: isUpstream ? 'upstream_to_dealer' : 'dealer_to_member',
            amount: prizeAmt,
            paid_at: paidAt,
            notes: `นำรางวัลไปหักล้างยอดข้ามงวด (งวด ${curRoundDateLabel})`,
            created_by: dealerId
        }

        if (isUpstream) {
            pastPrizePayment.upstream_dealer_name = upstreamDealerName || past.upstreamDealerName || 'เจ้ามือรับตีออก'
            pastPrizePayment.upstream_dealer_id = upstreamDealerId || past.upstreamDealerId || null
        } else {
            pastPrizePayment.user_id = memberUserId
        }

        pastRoundPayments.push(pastPrizePayment)
    }

    // 2. Current round prize record (if current round has prize to offset)
    let currentRoundPayment = null
    if (curRoundPrize > 0) {
        currentRoundPayment = {
            dealer_id: dealerId,
            round_id: curRoundId,
            lottery_type: currentRound.lottery_type || null,
            round_date: curRoundDateIso,
            amount: curRoundPrize,
            paid_at: paidAt,
            notes: `หักล้างหนี้งวดเก่า (${pastDateList}) ฿${curRoundPrize.toLocaleString()}${slip > 0 ? ` [สลิปโอน ฿${slip.toLocaleString()}]` : ''}`,
            created_by: dealerId
        }

        if (isUpstream) {
            currentRoundPayment.upstream_dealer_name = upstreamDealerName || 'เจ้ามือรับตีออก'
            currentRoundPayment.upstream_dealer_id = upstreamDealerId || null
            currentRoundPayment.payment_type = 'prize_collection'
            currentRoundPayment.direction = 'upstream_to_dealer'
        } else {
            currentRoundPayment.user_id = memberUserId
            currentRoundPayment.payment_type = 'prize_payout'
            currentRoundPayment.direction = 'dealer_to_member'
        }
    }

    // 3. Allocate total available clearing funds (curRoundPrize + totalPastPrizeCredit + slip) to past debts
    let remainingToAllocate = Math.round(curRoundPrize + totalPastPrizeCredit + slip)

    for (const past of pastDebts) {
        if (remainingToAllocate <= 0) break
        const roundDebt = Math.max(0, Number(past.debt || 0))
        const allocatedAmount = Math.min(roundDebt, remainingToAllocate)

        if (allocatedAmount > 0) {
            const pastRoundDateIso = getRoundCloseDate(past) || (/^\d{4}-\d{2}-\d{2}$/.test(String(past.roundDate || past.round_date)) ? (past.roundDate || past.round_date) : null)
            let noteDesc = ''
            if (curRoundPrize > 0) {
                noteDesc = `หักล้างรางวัลจากงวด ${curRoundDateLabel} (฿${curRoundPrize.toLocaleString()})`
            } else if (totalPastPrizeCredit > 0) {
                noteDesc = `หักล้างยอดค้างจ่ายรางวัลงวดเก่า (฿${totalPastPrizeCredit.toLocaleString()})`
            }
            if (slip > 0) {
                noteDesc = noteDesc ? `${noteDesc} + สลิปโอน ฿${slip.toLocaleString()}` : `ชำระตามสลิปโอน ฿${slip.toLocaleString()}`
            }
            if (!noteDesc) {
                noteDesc = `หักล้างยอดข้ามงวด`
            }

            const pastPayment = {
                dealer_id: dealerId,
                round_id: past.roundId || past.round_id,
                lottery_type: past.lotteryType || past.lottery_type || null,
                round_date: pastRoundDateIso,
                payment_type: 'net_settlement',
                amount: allocatedAmount,
                paid_at: paidAt,
                notes: noteDesc,
                created_by: dealerId
            }

            if (isUpstream) {
                pastPayment.upstream_dealer_name = upstreamDealerName || past.upstreamDealerName || 'เจ้ามือรับตีออก'
                pastPayment.upstream_dealer_id = upstreamDealerId || past.upstreamDealerId || null
                pastPayment.direction = 'dealer_to_upstream'
            } else {
                pastPayment.user_id = memberUserId
                pastPayment.direction = 'member_to_dealer'
            }

            pastRoundPayments.push(pastPayment)
            remainingToAllocate -= allocatedAmount
        }
    }

    return {
        currentRoundPayment,
        pastRoundPayments
    }
}

/**
 * Finds all past rounds where a member has an outstanding balance (currentBalance !== 0).
 * This includes both unpaid debts (currentBalance > 0) and unpaid prize credits (currentBalance < 0).
 * Prioritizes the true round closing date from roundHistory.
 * Results are sorted descending (most recent past round on top, down to oldest).
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.currentRoundId]
 * @param {string} [params.currentRoundDate]
 * @param {Array<Object>} [params.userHistories=[]]
 * @param {Array<Object>} [params.memberPayments=[]]
 * @param {Array<Object>} [params.roundHistory=[]]
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number }>}
 */
export function findMemberPastUnpaidRounds({
    userId,
    currentRoundId,
    currentRoundDate,
    userHistories = [],
    memberPayments = [],
    roundHistory = []
}) {
    if (!userId) return []
    const results = []

    const roundCloseDateMap = {}
    if (Array.isArray(roundHistory)) {
        for (const r of roundHistory) {
            const rId = r.round_id || r.id
            if (rId) {
                const cDate = getRoundCloseDate(r)
                if (cDate) {
                    roundCloseDateMap[String(rId)] = cDate
                }
            }
        }
    }

    // Group userHistories by roundId to avoid duplicate calculations
    const roundMap = {}
    for (const h of userHistories) {
        if (h.user_id !== userId) continue
        const roundId = h.round_id || h.id
        if (!roundId) continue
        if (currentRoundId && String(roundId) === String(currentRoundId)) continue

        const roundDate = roundCloseDateMap[String(roundId)] || getRoundCloseDate(h) || h.round_date || ''
        if (currentRoundDate && roundDate && roundDate > currentRoundDate) continue

        if (!roundMap[roundId]) {
            roundMap[roundId] = {
                roundId,
                roundDate,
                lotteryType: h.lottery_type || '',
                total_amount: 0,
                total_commission: 0,
                total_winnings: 0
            }
        }
        roundMap[roundId].total_amount += Number(h.total_amount || 0)
        roundMap[roundId].total_commission += Number(h.total_commission || 0)
        roundMap[roundId].total_winnings += Number(h.total_winnings || 0)
        if (!roundMap[roundId].roundDate && roundDate) {
            roundMap[roundId].roundDate = roundDate
        }
    }

    for (const roundId of Object.keys(roundMap)) {
        const aggregated = roundMap[roundId]
        const initial = calculateMemberInitialBalance(aggregated)
        const roundPayments = memberPayments.filter(p => (String(p.round_id || p.roundId) === String(roundId)) && p.user_id === userId)
        const currentBalance = calculateMemberCurrentBalance(initial, roundPayments)

        if (Math.round(currentBalance) !== 0) {
            results.push({
                roundId,
                roundDate: aggregated.roundDate,
                lotteryType: aggregated.lotteryType,
                debt: currentBalance
            })
        }
    }

    // Sort descending: most recent past round first (top to bottom)
    return results.sort((a, b) => (b.roundDate || '').localeCompare(a.roundDate || ''))
}

/**
 * Finds all past rounds where there is an outstanding balance between dealer and upstream dealer (currentBalance !== 0).
 * Prioritizes the true round closing date from roundHistory.
 * Results are sorted descending (most recent past round on top, down to oldest).
 * 
 * @param {Object} params
 * @param {string} params.dealerName
 * @param {string} [params.currentRoundId]
 * @param {string} [params.currentRoundDate]
 * @param {Array<Object>} [params.transfers=[]]
 * @param {Array<Object>} [params.upstreamPayments=[]]
 * @param {Array<Object>} [params.roundHistory=[]]
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number, upstreamDealerName: string }>}
 */
export function findUpstreamPastUnpaidRounds({
    dealerName,
    currentRoundId,
    currentRoundDate,
    transfers = [],
    upstreamPayments = [],
    roundHistory = []
}) {
    if (!dealerName) return []
    const results = []
    const normalizedTarget = dealerName.trim().toLowerCase()

    const roundCloseDateMap = {}
    if (Array.isArray(roundHistory)) {
        for (const r of roundHistory) {
            const rId = r.round_id || r.id
            if (rId) {
                const cDate = getRoundCloseDate(r)
                if (cDate) {
                    roundCloseDateMap[String(rId)] = cDate
                }
            }
        }
    }

    // Group transfers by round_id
    const roundMap = {}
    for (const t of transfers) {
        const tName = (t.target_dealer_name || t.upstream_dealer_name || t.dealerName || '').trim().toLowerCase()
        if (tName !== normalizedTarget) continue

        const roundId = t.round_id || t.id
        if (currentRoundId && String(roundId) === String(currentRoundId)) continue

        const resolvedDate = roundCloseDateMap[String(roundId)] || getRoundCloseDate(t) || t.round_date || ''
        if (currentRoundDate && resolvedDate && resolvedDate > currentRoundDate) continue

        if (!roundMap[roundId]) {
            roundMap[roundId] = {
                roundId,
                roundDate: resolvedDate,
                lotteryType: t.lottery_type || '',
                upstreamDealerName: t.target_dealer_name || t.upstream_dealer_name || dealerName,
                amount: 0,
                commission_earned: 0,
                winnings: 0
            }
        }

        roundMap[roundId].amount += Number(t.amount || 0)
        roundMap[roundId].commission_earned += Number(t.commission_earned || 0)
        roundMap[roundId].winnings += Number(t.winnings || 0)
        if (!roundMap[roundId].roundDate && resolvedDate) {
            roundMap[roundId].roundDate = resolvedDate
        }
    }

    for (const roundId of Object.keys(roundMap)) {
        const aggregatedTransfer = roundMap[roundId]
        const initial = calculateUpstreamInitialBalance(aggregatedTransfer)
        const roundPayments = upstreamPayments.filter(p => {
            const pRound = p.round_id || p.roundId
            const pName = (p.upstream_dealer_name || '').trim().toLowerCase()
            return String(pRound) === String(roundId) && (pName === normalizedTarget || !p.upstream_dealer_name)
        })
        const currentBalance = calculateUpstreamCurrentBalance(initial, roundPayments)

        if (Math.round(currentBalance) !== 0) {
            results.push({
                roundId,
                roundDate: aggregatedTransfer.roundDate,
                lotteryType: aggregatedTransfer.lotteryType,
                debt: currentBalance,
                upstreamDealerName: aggregatedTransfer.upstreamDealerName
            })
        }
    }

    // Sort descending: most recent past round first (top to bottom)
    return results.sort((a, b) => (b.roundDate || '').localeCompare(a.roundDate || ''))
}
