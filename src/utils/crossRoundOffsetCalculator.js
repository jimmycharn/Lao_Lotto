/**
 * Cross-Round Offset Calculator
 * Handles arithmetic and FIFO allocation for cross-round settlement offsets.
 */

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
