/**
 * Calculates the initial dealer profit / net balance for a member in a round.
 * Initial Balance = (total_amount - total_commission) - total_winnings
 * Positive (+) => Member owes dealer
 * Negative (-) => Dealer owes member
 * Zero (0) => Even
 */
export function calculateMemberInitialBalance(uh) {
    if (!uh) return 0
    const amount = Number(uh.total_amount || 0)
    const comm = Number(uh.total_commission || 0)
    const win = Number(uh.total_winnings || 0)
    return Math.round(amount - comm - win)
}

/**
 * Calculates current outstanding balance after applying payment logs.
 * Current = Initial - paid_by_member + paid_by_dealer
 */
export function calculateMemberCurrentBalance(initialBalance, payments = []) {
    const init = Number(initialBalance || 0)
    if (!Array.isArray(payments) || payments.length === 0) return init

    let paidByMember = 0
    let paidByDealer = 0

    payments.forEach(p => {
        const amt = Number(p.amount || 0)
        if (p.direction === 'member_to_dealer') {
            paidByMember += amt
        } else if (p.direction === 'dealer_to_member') {
            paidByDealer += amt
        }
    })

    return Math.round(init - paidByMember + paidByDealer)
}

/**
 * Returns formatted settlement status metadata
 */
export function getMemberSettlementStatus(currentBalance) {
    const bal = Math.round(Number(currentBalance || 0))
    if (bal === 0) {
        return {
            balance: 0,
            isSettled: true,
            owesDealer: false,
            owesMember: false,
            formattedText: '฿0',
            label: 'ชำระครบแล้ว',
            color: 'var(--color-success, #10b981)',
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.3)'
        }
    }

    if (bal > 0) {
        return {
            balance: bal,
            isSettled: false,
            owesDealer: true,
            owesMember: false,
            formattedText: `+฿${bal.toLocaleString()}`,
            label: 'คนส่งค้างเจ้ามือ',
            color: 'var(--color-warning, #f59e0b)',
            badgeBg: 'rgba(245, 158, 11, 0.15)',
            badgeBorder: 'rgba(245, 158, 11, 0.3)'
        }
    }

    const absBal = Math.abs(bal)
    return {
        balance: bal,
        isSettled: false,
        owesDealer: false,
        owesMember: true,
        formattedText: `-฿${absBal.toLocaleString()}`,
        label: 'เจ้ามือค้างคนส่ง',
        color: 'var(--color-danger, #ef4444)',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeBorder: 'rgba(239, 68, 68, 0.3)'
    }
}

/**
 * Calculates preset amount for payment form
 */
export function getPaymentPresetAmount(memberHistory, payments = [], paymentType = 'net_settlement', direction = 'member_to_dealer') {
    if (paymentType === 'prize_payout') {
        const totalWinnings = Number(memberHistory?.total_winnings || 0)
        // Check how much prize was already paid
        const prizePaid = payments
            .filter(p => p.payment_type === 'prize_payout')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return Math.max(0, Math.round(totalWinnings - prizePaid))
    }

    const initial = calculateMemberInitialBalance(memberHistory)
    const current = calculateMemberCurrentBalance(initial, payments)
    return Math.abs(current)
}

/**
 * ==========================================
 * Upstream Layoff Settlement Calculations
 * ==========================================
 */

/**
 * Calculates commission earned on an upstream layoff transfer based on bet type.
 * 4_set is fixed Baht per set (default 25 Baht / 120 Baht set).
 * 3 digits = 30%, 2 digits = 28%, 1 digit / run = 12%, other = 25%.
 */
export function calculateTransferCommission(t, setPrice = 120) {
    if (t?.commission_earned !== undefined && t?.commission_earned !== null && Number(t.commission_earned) > 0) {
        return Number(t.commission_earned)
    }
    const amt = Number(t?.amount || 0)
    if (amt <= 0) return 0

    if (t?.bet_type === '4_set') {
        const numSets = Math.max(1, Math.floor(amt / setPrice))
        const commPerSet = 25
        return numSets * commPerSet
    } else if (t?.bet_type === '3_top' || t?.bet_type === '3_tod' || t?.bet_type === '3_front' || t?.bet_type === '3_straight') {
        return Math.round(amt * 0.30)
    } else if (t?.bet_type === '2_top' || t?.bet_type === '2_bottom' || t?.bet_type === '2_front' || t?.bet_type === '2_spread') {
        return Math.round(amt * 0.28)
    } else if (t?.bet_type === '1_top' || t?.bet_type === '1_bottom' || t?.bet_type === 'run_top') {
        return Math.round(amt * 0.12)
    } else {
        return Math.round(amt * 0.25)
    }
}

/**
 * Calculates initial balance for an upstream dealer layoff:
 * Net Layoff = (amount - commission_earned)
 * Initial Balance = Net Layoff - winnings
 * Positive = Dealer owes Upstream (เราค้างเจ้ามือ)
 * Negative = Upstream owes Dealer (เจ้ามือค้างเรา)
 */
export function calculateUpstreamInitialBalance(transfer) {
    const amount = Number(transfer?.amount || 0)
    const comm = Number(transfer?.commission_earned || 0)
    const netLayoff = Math.round(amount - comm)
    const winnings = Number(transfer?.winnings || 0)
    return Math.round(netLayoff - winnings)
}

/**
 * Calculates current balance based on initial balance and payment transactions:
 * Current = Initial - paid_by_dealer + paid_by_upstream
 */
export function calculateUpstreamCurrentBalance(initialBalance, payments = []) {
    const paidByDealer = payments
        .filter(p => p.direction === 'dealer_to_upstream')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    
    const paidByUpstream = payments
        .filter(p => p.direction === 'upstream_to_dealer')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    
    return Math.round(initialBalance - paidByDealer + paidByUpstream)
}

/**
 * Returns settlement status, formatted text, and UI badges for upstream dealer
 */
export function getUpstreamSettlementStatus(currentBalance) {
    if (Math.abs(currentBalance) <= 0.01) {
        return {
            isSettled: true,
            formattedText: '฿0',
            color: 'var(--color-success, #10b981)',
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.3)',
            partyWhoOwes: 'none'
        }
    }

    if (currentBalance > 0) {
        // Dealer owes Upstream (เราค้างเจ้ามือ)
        return {
            isSettled: false,
            formattedText: `-฿${Math.round(currentBalance).toLocaleString()}`,
            color: '#ef4444',
            badgeBg: 'rgba(239, 68, 68, 0.15)',
            badgeBorder: 'rgba(239, 68, 68, 0.3)',
            partyWhoOwes: 'dealer'
        }
    }

    // Upstream owes Dealer (เจ้ามือค้างเรา)
    return {
        isSettled: false,
        formattedText: `+฿${Math.abs(Math.round(currentBalance)).toLocaleString()}`,
        color: 'var(--color-success, #10b981)',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.3)',
        partyWhoOwes: 'upstream'
    }
}

/**
 * Calculates preset amount for upstream payment form
 */
export function getUpstreamPaymentPresetAmount(transfer, payments = [], paymentType = 'net_settlement') {
    if (paymentType === 'prize_collection') {
        const totalWinnings = Number(transfer?.winnings || 0)
        const prizeCollected = payments
            .filter(p => p.payment_type === 'prize_collection')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return Math.max(0, Math.round(totalWinnings - prizeCollected))
    }

    const initial = calculateUpstreamInitialBalance(transfer)
    const current = calculateUpstreamCurrentBalance(initial, payments)
    return Math.abs(current)
}

/**
 * Determines whether an entire lottery round is fully settled (no outstanding balances).
 * A round is fully settled if:
 * 1. It has activity (total_entries > 0, total_amount > 0, transferred_amount > 0, or non-empty users/transfers).
 * 2. ALL members in the round have current balance = 0.
 * 3. ALL upstream layoff transfers in the round have current balance = 0.
 * If any member or upstream dealer has non-zero debt (|bal| > 0.01), returns false.
 */
export function isRoundFullySettled({
    history,
    userHistories = [],
    memberPayments = [],
    transfers = [],
    upstreamPayments = []
} = {}) {
    if (!history) return false

    const hasActivity = (
        Number(history?.total_entries || 0) > 0 ||
        Number(history?.total_amount || 0) > 0 ||
        Number(history?.transferred_amount || 0) > 0 ||
        userHistories.length > 0 ||
        transfers.length > 0
    )

    if (!hasActivity) return false

    // 1. Check member balances
    if (userHistories.length > 0) {
        for (const uh of userHistories) {
            const mPayments = memberPayments.filter(p => p.user_id === uh.user_id)
            const comm = uh.total_commission !== undefined && uh.total_commission !== null && Number(uh.total_commission) > 0
                ? Number(uh.total_commission)
                : (Number(uh.total_amount || 0) > 0 ? Math.round(Number(uh.total_amount) * 0.20) : 0)
            const initBal = calculateMemberInitialBalance({ ...uh, total_commission: comm })
            const currBal = calculateMemberCurrentBalance(initBal, mPayments)
            if (Math.abs(currBal) > 0.01) {
                return false
            }
        }
    } else if (Number(history?.total_amount || 0) > 0) {
        // Round had total amount, but individual user histories are not present
        return false
    }

    // 2. Check upstream transfers
    const groupedMap = {}
    if (transfers.length > 0) {
        transfers.forEach(t => {
            const dName = t.upstream_dealer?.full_name || t.target_dealer_name || t.dealerName || "เจ้ามือ"
            if (!groupedMap[dName]) {
                groupedMap[dName] = {
                    dealerName: dName,
                    amount: 0,
                    commission_earned: 0,
                    winnings: 0
                }
            }
            groupedMap[dName].amount += Number(t.amount || 0)
            const comm = calculateTransferCommission(t)
            groupedMap[dName].commission_earned += comm
            groupedMap[dName].winnings += Number(t.winnings || 0)
        })
    }

    const outAmt = Number(history?.transferred_amount || 0)
    const outComm = Number(history?.upstream_commission || 0) > 0
        ? Number(history.upstream_commission)
        : Math.round(outAmt * (25 / 120))
    const outWin = Number(history?.upstream_winnings || 0)

    const effectiveTransfers = Object.values(groupedMap).length > 0
        ? Object.values(groupedMap)
        : (outAmt > 0 ? [{
            dealerName: "เจ้ามือ (สรุปในประวัติ)",
            amount: outAmt,
            commission_earned: outComm,
            winnings: outWin
        }] : [])

    if (effectiveTransfers.length > 0) {
        for (const t of effectiveTransfers) {
            const upstreamName = t.dealerName || "เจ้ามือ"
            const upPayments = upstreamPayments.filter(p => 
                p.upstream_dealer_name === upstreamName ||
                (effectiveTransfers.length === 1 && (!p.upstream_dealer_name || p.upstream_dealer_name === "เจ้ามือ" || p.upstream_dealer_name === "เจ้ามือ (สรุปในประวัติ)"))
            )
            const initBal = calculateUpstreamInitialBalance(t)
            const currBal = calculateUpstreamCurrentBalance(initBal, upPayments)
            if (Math.abs(currBal) > 0.01) {
                return false
            }
        }
    } else if (outAmt > 0) {
        return false
    }

    return true
}

