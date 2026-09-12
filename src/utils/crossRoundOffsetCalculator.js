import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance
} from './memberSettlementCalculator'
import { THAI_BANKS } from '../constants/bankConstants'

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
 * Formats a round or date string to Thai Day-Month-Year format ("วันที่-เดือน-ปี", e.g. "10 ก.ย. 2569").
 * Uses direct component parsing on the resolved Bangkok round date to avoid UTC/local timezone shifts.
 *
 * @param {Object|string|Date} roundOrVal - Round object, ISO date string, or Date
 * @returns {string} Formatted Thai date string, e.g. "10 ก.ย. 2569"
 */
export function formatThaiDate(roundOrVal) {
    const isoDate = getRoundCloseDate(roundOrVal)
    if (!isoDate) return '-'

    const parts = isoDate.split('-')
    if (parts.length === 3) {
        const [y, m, d] = parts.map(Number)
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            const thaiYear = y > 2500 ? y : y + 543
            const thaiMonthsShort = [
                'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
            ]
            const monthText = thaiMonthsShort[m - 1] || `${m}`
            return `${d} ${monthText} ${thaiYear}`
        }
    }

    try {
        const d = new Date(isoDate)
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })
        }
    } catch {
        // Fallback
    }

    return isoDate
}

/**
 * Formats a round or date string to numeric Thai Day-Month-Year format ("วันที่-เดือน-ปี", e.g. "10-09-2569" or "10/09/2569").
 *
 * @param {Object|string|Date} roundOrVal - Round object, ISO date string, or Date
 * @param {string} [separator='-'] - Separator character, default '-'
 * @returns {string} Formatted Thai numeric date string
 */
export function formatThaiDateDDMMYYYY(roundOrVal, separator = '-') {
    const isoDate = getRoundCloseDate(roundOrVal)
    if (!isoDate) return '-'

    const parts = isoDate.split('-')
    if (parts.length === 3) {
        const [y, m, d] = parts.map(Number)
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            const thaiYear = y > 2500 ? y : y + 543
            const dd = String(d).padStart(2, '0')
            const mm = String(m).padStart(2, '0')
            return `${dd}${separator}${mm}${separator}${thaiYear}`
        }
    }

    return isoDate
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
 * @param {string} [params.lotteryType] - Optional lottery type filter (e.g. 'lao', 'thai', or 'all')
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number }>}
 */
export function findMemberPastUnpaidRounds({
    userId,
    currentRoundId,
    currentRoundDate,
    userHistories = [],
    memberPayments = [],
    roundHistory = [],
    lotteryType = null
}) {
    if (!userId) return []
    const results = []

    const normalizedLotteryFilter = (lotteryType && lotteryType !== 'all')
        ? String(lotteryType).trim().toLowerCase()
        : null

    const roundCloseDateMap = {}
    const roundLotteryTypeMap = {}
    if (Array.isArray(roundHistory)) {
        for (const r of roundHistory) {
            const cDate = getRoundCloseDate(r)
            const lType = r.lottery_type || r.lotteryType
            if (r.round_id) {
                if (cDate) roundCloseDateMap[String(r.round_id)] = cDate
                if (lType) roundLotteryTypeMap[String(r.round_id)] = lType
            }
            if (r.id) {
                if (cDate) roundCloseDateMap[String(r.id)] = cDate
                if (lType) roundLotteryTypeMap[String(r.id)] = lType
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

        const itemLotteryType = roundLotteryTypeMap[String(roundId)] || h.lottery_type || h.lotteryType || ''
        if (normalizedLotteryFilter) {
            if (String(itemLotteryType).trim().toLowerCase() !== normalizedLotteryFilter) {
                continue
            }
        }

        if (!roundMap[roundId]) {
            roundMap[roundId] = {
                roundId,
                roundDate,
                lotteryType: itemLotteryType,
                total_amount: 0,
                total_commission: 0,
                total_winnings: 0
            }
        }
        roundMap[roundId].total_amount += Number(h.total_amount || 0)
        const itemComm = (h.total_commission !== undefined && h.total_commission !== null && Number(h.total_commission) > 0)
            ? Number(h.total_commission)
            : (Number(h.total_amount || 0) > 0 ? Math.round(Number(h.total_amount) * 0.20) : 0)
        roundMap[roundId].total_commission += itemComm
        roundMap[roundId].total_winnings += Number(h.total_winnings || 0)
        if (!roundMap[roundId].roundDate && roundDate) {
            roundMap[roundId].roundDate = roundDate
        }
        if (!roundMap[roundId].lotteryType && itemLotteryType) {
            roundMap[roundId].lotteryType = itemLotteryType
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
 * @param {string} [params.lotteryType] - Optional lottery type filter (e.g. 'lao', 'thai', or 'all')
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number, upstreamDealerName: string }>}
 */
export function findUpstreamPastUnpaidRounds({
    dealerName,
    currentRoundId,
    currentRoundDate,
    transfers = [],
    upstreamPayments = [],
    roundHistory = [],
    lotteryType = null
}) {
    if (!dealerName) return []
    const results = []
    const normalizedTarget = dealerName.trim().toLowerCase()
    const normalizedLotteryFilter = (lotteryType && lotteryType !== 'all')
        ? String(lotteryType).trim().toLowerCase()
        : null

    const roundCloseDateMap = {}
    const roundLotteryTypeMap = {}
    if (Array.isArray(roundHistory)) {
        for (const r of roundHistory) {
            const cDate = getRoundCloseDate(r)
            const lType = r.lottery_type || r.lotteryType
            if (r.round_id) {
                if (cDate) roundCloseDateMap[String(r.round_id)] = cDate
                if (lType) roundLotteryTypeMap[String(r.round_id)] = lType
            }
            if (r.id) {
                if (cDate) roundCloseDateMap[String(r.id)] = cDate
                if (lType) roundLotteryTypeMap[String(r.id)] = lType
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

        const roundLotteryType = roundLotteryTypeMap[String(roundId)] || t.lottery_type || t.lotteryType || ''
        if (normalizedLotteryFilter) {
            if (String(roundLotteryType).trim().toLowerCase() !== normalizedLotteryFilter) {
                continue
            }
        }

        if (!roundMap[roundId]) {
            roundMap[roundId] = {
                roundId,
                roundDate: resolvedDate,
                lotteryType: roundLotteryType,
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
        if (!roundMap[roundId].lotteryType && roundLotteryType) {
            roundMap[roundId].lotteryType = roundLotteryType
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

/**
 * Calculates payment summary according to the 4 settlement modes:
 * - 'current_debt': Pay debt of current round only
 * - 'current_prize': Payout prize of current round only
 * - 'offset_prize_past_debt': Offset current prize against selected past debt
 * - 'combine_all': Combine current round balance with all selected past debt
 *
 * @param {Object} params
 * @param {'current_debt' | 'current_prize' | 'offset_prize_past_debt' | 'combine_all'} [params.mode='offset_prize_past_debt']
 * @param {number} [params.currentBalance=0]
 * @param {number} [params.currentWinnings=0]
 * @param {number} [params.availableWinnings=0]
 * @param {Array<Object>} [params.selectedPastRounds=[]]
 * @param {boolean} [params.isUpstream=false]
 * @returns {Object} summary
 */
export function calculateCrossRoundPaymentSummary({
    mode = 'offset_prize_past_debt',
    currentBalance = 0,
    currentWinnings = 0,
    availableWinnings,
    selectedPastRounds = [],
    isUpstream = false
}) {
    const curBal = Number(currentBalance || 0)
    const effectiveWinnings = (availableWinnings !== undefined && availableWinnings !== null)
        ? availableWinnings
        : currentWinnings
    const prize = Math.max(0, Number(effectiveWinnings) || 0)

    const pastDebts = selectedPastRounds.filter(r => Number(r.debt || 0) > 0)
    const pastPrizes = selectedPastRounds.filter(r => Number(r.debt || 0) < 0)

    const pastDebtsTotal = pastDebts.reduce((sum, r) => sum + Number(r.debt || 0), 0)
    const pastPrizesTotal = pastPrizes.reduce((sum, r) => sum + Math.abs(Number(r.debt || 0)), 0)
    const pastNetTotal = selectedPastRounds.reduce((sum, r) => sum + Number(r.debt || 0), 0)

    if (mode === 'current_debt') {
        let direction = 'even'
        if (curBal > 0) {
            direction = isUpstream ? 'dealer_to_upstream' : 'member_to_dealer'
        } else if (curBal < 0) {
            direction = isUpstream ? 'upstream_to_dealer' : 'dealer_to_member'
        }
        return {
            mode,
            modeLabel: 'จ่ายหนี้งวดนี้',
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
            pastDebtsTotal: 0,
            pastPrizesTotal: 0,
            pastNetTotal: 0,
            netDifference: Math.abs(curBal),
            direction,
            suggestedSlipAmount: Math.abs(curBal)
        }
    }

    if (mode === 'current_prize') {
        const direction = isUpstream ? 'upstream_to_dealer' : 'dealer_to_member'
        return {
            mode,
            modeLabel: 'รางวัลงวดนี้',
            currentRoundDebt: 0,
            currentRoundPrize: prize,
            pastDebtsTotal: 0,
            pastPrizesTotal: 0,
            pastNetTotal: 0,
            netDifference: prize,
            direction,
            suggestedSlipAmount: prize
        }
    }

    if (mode === 'offset_prize_past_debt') {
        const netDiff = pastNetTotal - prize
        let direction = 'even'
        if (netDiff > 0) {
            direction = isUpstream ? 'dealer_to_upstream' : 'member_to_dealer'
        } else if (netDiff < 0) {
            direction = isUpstream ? 'upstream_to_dealer' : 'dealer_to_member'
        }
        return {
            mode,
            modeLabel: 'หักลบรางวัลกับหนี้เก่า',
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: prize,
            pastDebtsTotal,
            pastPrizesTotal,
            pastNetTotal,
            netDifference: Math.abs(netDiff),
            direction,
            suggestedSlipAmount: Math.abs(netDiff)
        }
    }

    // combine_all
    const totalCombined = curBal + pastNetTotal
    let direction = 'even'
    if (totalCombined > 0) {
        direction = isUpstream ? 'dealer_to_upstream' : 'member_to_dealer'
    } else if (totalCombined < 0) {
        direction = isUpstream ? 'upstream_to_dealer' : 'dealer_to_member'
    }
    return {
        mode,
        modeLabel: 'หักลบหนี้ทั้งหมด',
        currentRoundDebt: curBal > 0 ? curBal : 0,
        currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
        pastDebtsTotal,
        pastPrizesTotal,
        pastNetTotal,
        netDifference: Math.abs(totalCombined),
        direction,
        suggestedSlipAmount: Math.abs(totalCombined)
    }
}

/**
 * Allocates payments according to selected mode:
 * - 'current_debt': Generates single net_settlement for current round
 * - 'current_prize': Generates single prize_payout/prize_collection for current round
 * - 'offset_prize_past_debt': Uses allocateCrossRoundOffsetPayments
 * - 'combine_all': Clears past debts (FIFO) and current round debt/prize with slip amount
 */
export function allocateSettlementPaymentsByMode({
    mode = 'offset_prize_past_debt',
    selectedPastRounds = [],
    currentBalance = 0,
    currentWinnings = 0,
    availableWinnings,
    actualSlipAmount = 0,
    paidAt = new Date().toISOString().split('T')[0],
    paidTime = '',
    referenceDoc = '',
    currentRound = {},
    memberUserId = null,
    dealerId = null,
    isUpstream = false,
    upstreamDealerName = null,
    upstreamDealerId = null,
    customNotes = '',
    senderBank = ''
}) {
    const curBal = Number(currentBalance || 0)
    const effectiveWinnings = (availableWinnings !== undefined && availableWinnings !== null)
        ? availableWinnings
        : currentWinnings
    const prize = Math.max(0, Number(effectiveWinnings) || 0)
    const slip = Math.max(0, Number(actualSlipAmount) || 0)
    const curRoundId = currentRound.round_id || currentRound.id
    const curRoundDateIso = getRoundCloseDate(currentRound) || (/^\d{4}-\d{2}-\d{2}$/.test(String(currentRound.round_date)) ? currentRound.round_date : null)
    
    const cleanSender = senderBank ? String(senderBank).replace(/^ธนาคาร\s*/, '').trim() : ''
    let fullCustomNote = customNotes && customNotes.trim() ? customNotes.trim() : ''
    if (cleanSender && shouldPrependSenderBank(fullCustomNote, cleanSender)) {
        fullCustomNote = `${cleanSender} ${fullCustomNote}`.trim()
    }

    const noteDetails = [
        fullCustomNote,
        paidTime && paidTime.trim() ? `เวลา ${paidTime.trim()}` : '',
        referenceDoc && referenceDoc.trim() ? `#${referenceDoc.trim()}` : ''
    ].filter(Boolean).join(' ')

    const noteSuffix = noteDetails ? ` (${noteDetails})` : ''

    if (mode === 'current_debt') {
        const curPayment = {
            dealer_id: dealerId,
            round_id: curRoundId,
            lottery_type: currentRound.lottery_type || null,
            round_date: curRoundDateIso,
            payment_type: 'net_settlement',
            direction: isUpstream
                ? (curBal >= 0 ? 'dealer_to_upstream' : 'upstream_to_dealer')
                : (curBal >= 0 ? 'member_to_dealer' : 'dealer_to_member'),
            amount: slip,
            paid_at: paidAt,
            notes: `ชำระหนี้งวดนี้${noteSuffix}`,
            created_by: dealerId
        }
        if (isUpstream) {
            curPayment.upstream_dealer_name = upstreamDealerName || 'เจ้ามือรับตีออก'
            curPayment.upstream_dealer_id = upstreamDealerId || null
        } else {
            curPayment.user_id = memberUserId
        }
        return {
            currentRoundPayment: curPayment,
            pastRoundPayments: []
        }
    }

    if (mode === 'current_prize') {
        const curPayment = {
            dealer_id: dealerId,
            round_id: curRoundId,
            lottery_type: currentRound.lottery_type || null,
            round_date: curRoundDateIso,
            payment_type: isUpstream ? 'prize_collection' : 'prize_payout',
            direction: isUpstream ? 'upstream_to_dealer' : 'dealer_to_member',
            amount: slip,
            paid_at: paidAt,
            notes: `${isUpstream ? 'รับคืนเงินถูกรางวัลงวดนี้' : 'จ่ายเงินถูกรางวัลงวดนี้'}${noteSuffix}`,
            created_by: dealerId
        }
        if (isUpstream) {
            curPayment.upstream_dealer_name = upstreamDealerName || 'เจ้ามือรับตีออก'
            curPayment.upstream_dealer_id = upstreamDealerId || null
        } else {
            curPayment.user_id = memberUserId
        }
        return {
            currentRoundPayment: curPayment,
            pastRoundPayments: []
        }
    }

    if (mode === 'offset_prize_past_debt') {
        const allocations = allocateCrossRoundOffsetPayments({
            selectedPastRounds,
            offsetPrizeAmount: prize,
            actualSlipAmount: slip,
            paidAt,
            currentRound,
            memberUserId,
            dealerId,
            isUpstream,
            upstreamDealerName,
            upstreamDealerId
        })
        if (noteSuffix) {
            if (allocations.currentRoundPayment) {
                allocations.currentRoundPayment.notes += noteSuffix
            }
            allocations.pastRoundPayments.forEach(p => {
                p.notes += noteSuffix
            })
        }
        return allocations
    }

    // combine_all:
    // First, clear any past prize credits (< 0)
    const pastDebts = selectedPastRounds.filter(r => Number(r.debt || 0) > 0)
    const pastPrizes = selectedPastRounds.filter(r => Number(r.debt || 0) < 0)

    const pastRoundPayments = []
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
            notes: `หักล้างหนี้รวม (รางวัลเก่า)${noteSuffix}`,
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

    let remainingFunds = Math.round(slip + totalPastPrizeCredit)

    // Allocate to past debts FIFO
    for (const past of pastDebts) {
        if (remainingFunds <= 0) break
        const debtAmt = Math.max(0, Number(past.debt || 0))
        const allocated = Math.min(debtAmt, remainingFunds)
        if (allocated > 0) {
            const pastRoundDateIso = getRoundCloseDate(past) || (/^\d{4}-\d{2}-\d{2}$/.test(String(past.roundDate || past.round_date)) ? (past.roundDate || past.round_date) : null)
            const pastPayment = {
                dealer_id: dealerId,
                round_id: past.roundId || past.round_id,
                lottery_type: past.lotteryType || past.lottery_type || null,
                round_date: pastRoundDateIso,
                payment_type: 'net_settlement',
                amount: allocated,
                paid_at: paidAt,
                notes: `ชำระหนี้รวม (งวด ${pastRoundDateIso || 'งวดก่อน'})${noteSuffix}`,
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
            remainingFunds -= allocated
        }
    }

    // Allocate remaining funds to current round
    let currentRoundPayment = null
    if (curBal > 0 && remainingFunds > 0) {
        const curAllocated = Math.min(curBal, remainingFunds)
        currentRoundPayment = {
            dealer_id: dealerId,
            round_id: curRoundId,
            lottery_type: currentRound.lottery_type || null,
            round_date: curRoundDateIso,
            payment_type: 'net_settlement',
            direction: isUpstream ? 'dealer_to_upstream' : 'member_to_dealer',
            amount: curAllocated,
            paid_at: paidAt,
            notes: `ชำระหนี้รวม (งวดปัจจุบัน)${noteSuffix}`,
            created_by: dealerId
        }
        if (isUpstream) {
            currentRoundPayment.upstream_dealer_name = upstreamDealerName || 'เจ้ามือรับตีออก'
            currentRoundPayment.upstream_dealer_id = upstreamDealerId || null
        } else {
            currentRoundPayment.user_id = memberUserId
        }
        remainingFunds -= curAllocated
    } else if (curBal < 0) {
        currentRoundPayment = {
            dealer_id: dealerId,
            round_id: curRoundId,
            lottery_type: currentRound.lottery_type || null,
            round_date: curRoundDateIso,
            payment_type: isUpstream ? 'prize_collection' : 'prize_payout',
            direction: isUpstream ? 'upstream_to_dealer' : 'dealer_to_member',
            amount: Math.abs(curBal),
            paid_at: paidAt,
            notes: `หักล้างหนี้รวม (งวดปัจจุบัน)${noteSuffix}`,
            created_by: dealerId
        }
        if (isUpstream) {
            currentRoundPayment.upstream_dealer_name = upstreamDealerName || 'เจ้ามือรับตีออก'
            currentRoundPayment.upstream_dealer_id = upstreamDealerId || null
        } else {
            currentRoundPayment.user_id = memberUserId
        }
    }

    return {
        currentRoundPayment,
        pastRoundPayments
    }
}

/**
 * Determines if senderBank should be prepended to customNotes.
 * Returns false if customNotes already starts with senderBank (with or without 'จาก' or 'ธนาคาร').
 */
export function shouldPrependSenderBank(notes, senderBank) {
    const cleanSender = senderBank ? String(senderBank).replace(/^ธนาคาร\s*/, '').trim() : ''
    if (!cleanSender) return false
    if (!notes || !notes.trim()) return true
    const trimmed = notes.trim()
    const escaped = cleanSender.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const startPattern = new RegExp(`^(จาก\\s*)?(ธนาคาร\\s*)?${escaped}(\\s+|$)`, 'i')
    return !startPattern.test(trimmed)
}

/**
 * Parses a payment record note string into its constituent parts:
 * customNotes, paidTime (HH:mm), referenceDoc (without '#'), prefix, and senderBank.
 *
 * @param {string} notes - Full payment notes string
 * @returns {{ customNotes: string, paidTime: string, referenceDoc: string, prefix: string, senderBank: string }}
 */
export function parsePaymentNotes(notes) {
    if (!notes || typeof notes !== 'string') {
        return { customNotes: '', paidTime: '', referenceDoc: '', prefix: '', senderBank: '' }
    }
    const raw = notes.trim()
    if (!raw) {
        return { customNotes: '', paidTime: '', referenceDoc: '', prefix: '', senderBank: '' }
    }

    let prefix = ''
    let detailsPart = raw

    // Look for outermost/last parentheses: e.g. "Prefix (...)"
    const matchSuffix = raw.match(/^(.*?)\s*\((.*)\)$/)
    if (matchSuffix) {
        prefix = matchSuffix[1].trim()
        detailsPart = matchSuffix[2].trim()
    }

    let ref = ''
    let time = ''

    // Extract reference: #[something]
    const refMatch = detailsPart.match(/#([^\s\)]+)/)
    if (refMatch) {
        ref = refMatch[1].trim()
        detailsPart = detailsPart.replace(/#([^\s\)]+)/, '').trim()
    }

    // Extract time: เวลา [HH:mm]
    const timeMatch = detailsPart.match(/เวลา\s*(\d{1,2}:\d{2})/)
    if (timeMatch) {
        time = timeMatch[1].padStart(5, '0')
        detailsPart = detailsPart.replace(/เวลา\s*\d{1,2}:\d{2}/, '').trim()
    }

    let customNotes = detailsPart.replace(/\s+/g, ' ').trim()
    let senderBank = ''

    // If there was no parenthesized suffix and no extracted tokens, the entire string is customNotes
    if (!matchSuffix && !ref && !time) {
        customNotes = raw
        prefix = ''
    } else {
        // 1. If detailsPart has "... โอนไป ..." pattern, extract senderBank
        const transferMatch = customNotes.match(/^(.*?)\s+(โอนไป\s+.*)$/)
        if (transferMatch) {
            senderBank = transferMatch[1].replace(/^จาก\s*/, '').trim()
            customNotes = transferMatch[2].trim()
        } else {
            // If the entire customNotes is a bank name (e.g. "ออมสิน" or "ธนาคารออมสิน")
            const matchedExactBank = THAI_BANKS.find(b => {
                const clean = b.replace(/^ธนาคาร\s*/, '').trim().toLowerCase()
                const cleanNote = customNotes.replace(/^ธนาคาร\s*/, '').trim().toLowerCase()
                return clean === cleanNote
            })
            if (matchedExactBank) {
                senderBank = matchedExactBank
            }
        }
    }

    return { customNotes, paidTime: time, referenceDoc: ref, prefix, senderBank }
}

/**
 * Reconstructs the full note string from constituent parts in the standard system format:
 * [prefix] ([customNotes] เวลา [paidTime] #[referenceDoc])
 *
 * @param {Object} params
 * @param {string} [params.paymentType]
 * @param {string} [params.direction]
 * @param {boolean} [params.isUpstream=false]
 * @param {string} [params.customNotes='']
 * @param {string} [params.paidTime='']
 * @param {string} [params.referenceDoc='']
 * @param {string} [params.originalPrefix='']
 * @param {string} [params.senderBank='']
 * @returns {string} Formatted full note string
 */
export function buildPaymentNotes({
    paymentType,
    direction = 'member_to_dealer',
    isUpstream = false,
    customNotes = '',
    paidTime = '',
    referenceDoc = '',
    originalPrefix = '',
    senderBank = ''
}) {
    let basePrefix = originalPrefix ? originalPrefix.trim() : ''
    if (!basePrefix) {
        if (paymentType === 'prize_payout' || paymentType === 'prize_collection') {
            basePrefix = isUpstream ? 'รับคืนเงินถูกรางวัลงวดนี้' : 'จ่ายเงินถูกรางวัลงวดนี้'
        } else {
            if (!isUpstream) {
                basePrefix = direction === 'member_to_dealer' ? 'ชำระหนี้งวดนี้' : 'เคลียร์ยอดคงค้าง'
            } else {
                basePrefix = direction === 'dealer_to_upstream' ? 'ชำระหนี้งวดนี้' : 'เคลียร์ยอดคงค้าง'
            }
        }
    }

    const cleanSender = senderBank ? String(senderBank).replace(/^ธนาคาร\s*/, '').trim() : ''
    let fullCustomNote = customNotes && customNotes.trim() ? customNotes.trim() : ''
    if (cleanSender && shouldPrependSenderBank(fullCustomNote, cleanSender)) {
        fullCustomNote = `${cleanSender} ${fullCustomNote}`.trim()
    }

    const noteDetails = [
        fullCustomNote,
        paidTime && paidTime.trim() ? `เวลา ${paidTime.trim()}` : '',
        referenceDoc && referenceDoc.trim() ? `#${referenceDoc.trim()}` : ''
    ].filter(Boolean).join(' ')

    if (noteDetails) {
        return `${basePrefix} (${noteDetails})`
    }
    return basePrefix
}


