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

