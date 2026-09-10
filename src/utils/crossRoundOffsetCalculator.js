import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance
} from './memberSettlementCalculator'

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
    const debt = Math.max(0, Number(pastDebtTotal) || 0)
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
    const prize = Math.max(0, Number(offsetPrizeAmount) || 0)
    const slip = Math.max(0, Number(actualSlipAmount) || 0)
    const totalAvailableToClear = Math.round(prize + slip)

    const curRoundId = currentRound.id || currentRound.round_id
    const curRoundDate = currentRound.round_date || (currentRound.close_time ? currentRound.close_time.split('T')[0] : 'งวดปัจจุบัน')

    const pastDateList = selectedPastRounds.map(r => r.roundDate || r.round_date || 'งวดก่อน').join(', ')

    // 1. Current round prize record
    const currentRoundPayment = {
        dealer_id: dealerId,
        round_id: curRoundId,
        lottery_type: currentRound.lottery_type || null,
        round_date: curRoundDate,
        amount: prize,
        paid_at: paidAt,
        notes: `หักล้างหนี้งวดเก่า (${pastDateList}) ฿${prize.toLocaleString()}${slip > 0 ? ` [สลิปโอน ฿${slip.toLocaleString()}]` : ''}`,
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

    // 2. Allocate across selected past rounds in chronological order (FIFO)
    let remainingToAllocate = totalAvailableToClear
    const pastRoundPayments = []

    for (const past of selectedPastRounds) {
        if (remainingToAllocate <= 0) break
        const roundDebt = Math.max(0, Number(past.debt || 0))
        const allocatedAmount = Math.min(roundDebt, remainingToAllocate)

        if (allocatedAmount > 0) {
            const pastPayment = {
                dealer_id: dealerId,
                round_id: past.roundId || past.round_id,
                lottery_type: past.lotteryType || past.lottery_type || null,
                round_date: past.roundDate || past.round_date || null,
                payment_type: 'net_settlement',
                amount: allocatedAmount,
                paid_at: paidAt,
                notes: `หักล้างรางวัลจากงวด ${curRoundDate} (฿${prize.toLocaleString()})${slip > 0 ? ` + สลิปโอน ฿${slip.toLocaleString()}` : ''}`,
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
 * Finds all past rounds where a member has outstanding unpaid debt (currentBalance > 0).
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.currentRoundId]
 * @param {string} [params.currentRoundDate]
 * @param {Array<Object>} [params.userHistories=[]]
 * @param {Array<Object>} [params.memberPayments=[]]
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number }>}
 */
export function findMemberPastUnpaidRounds({
    userId,
    currentRoundId,
    currentRoundDate,
    userHistories = [],
    memberPayments = []
}) {
    if (!userId) return []
    const results = []

    const relevant = userHistories.filter(h => {
        if (h.user_id !== userId) return false
        const roundId = h.round_id || h.id
        if (currentRoundId && roundId === currentRoundId) return false
        if (currentRoundDate && h.round_date && h.round_date >= currentRoundDate && roundId === currentRoundId) return false
        return true
    })

    for (const h of relevant) {
        const roundId = h.round_id || h.id
        const initial = calculateMemberInitialBalance(h)
        const roundPayments = memberPayments.filter(p => (p.round_id === roundId || p.roundId === roundId) && p.user_id === userId)
        const currentBalance = calculateMemberCurrentBalance(initial, roundPayments)

        if (currentBalance > 0) {
            results.push({
                roundId,
                roundDate: h.round_date || '',
                lotteryType: h.lottery_type || '',
                debt: currentBalance
            })
        }
    }

    return results.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))
}

/**
 * Finds all past rounds where the dealer owes an upstream dealer debt (currentBalance > 0).
 * 
 * @param {Object} params
 * @param {string} params.dealerName
 * @param {string} [params.currentRoundId]
 * @param {string} [params.currentRoundDate]
 * @param {Array<Object>} [params.transfers=[]]
 * @param {Array<Object>} [params.upstreamPayments=[]]
 * @returns {Array<{ roundId: string, roundDate: string, lotteryType: string, debt: number, upstreamDealerName: string }>}
 */
export function findUpstreamPastUnpaidRounds({
    dealerName,
    currentRoundId,
    currentRoundDate,
    transfers = [],
    upstreamPayments = []
}) {
    if (!dealerName) return []
    const results = []
    const normalizedTarget = dealerName.trim().toLowerCase()

    // Group transfers by round_id
    const roundMap = {}
    for (const t of transfers) {
        const tName = (t.target_dealer_name || t.upstream_dealer_name || t.dealerName || '').trim().toLowerCase()
        if (tName !== normalizedTarget) continue

        const roundId = t.round_id || t.id
        if (currentRoundId && roundId === currentRoundId) continue

        if (!roundMap[roundId]) {
            roundMap[roundId] = {
                roundId,
                roundDate: t.round_date || '',
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
        if (t.round_date && !roundMap[roundId].roundDate) {
            roundMap[roundId].roundDate = t.round_date
        }
    }

    for (const roundId of Object.keys(roundMap)) {
        const aggregatedTransfer = roundMap[roundId]
        if (currentRoundDate && aggregatedTransfer.roundDate && aggregatedTransfer.roundDate >= currentRoundDate && roundId === currentRoundId) {
            continue
        }

        const initial = calculateUpstreamInitialBalance(aggregatedTransfer)
        const roundPayments = upstreamPayments.filter(p => {
            const pRound = p.round_id || p.roundId
            const pName = (p.upstream_dealer_name || '').trim().toLowerCase()
            return pRound === roundId && (pName === normalizedTarget || !p.upstream_dealer_name)
        })
        const currentBalance = calculateUpstreamCurrentBalance(initial, roundPayments)

        if (currentBalance > 0) {
            results.push({
                roundId,
                roundDate: aggregatedTransfer.roundDate,
                lotteryType: aggregatedTransfer.lotteryType,
                debt: currentBalance,
                upstreamDealerName: aggregatedTransfer.upstreamDealerName
            })
        }
    }

    return results.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))
}
