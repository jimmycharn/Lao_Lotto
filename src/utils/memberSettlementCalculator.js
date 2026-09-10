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
 * Calculates commission earned on an upstream layoff transfer based on bet type and upstream dealer settings.
 * If upstream settings (lottery_settings) are provided, uses the exact commission rates configured for that upstream dealer.
 * Otherwise falls back to defaults:
 * 4_set is fixed Baht per set (default 25 Baht / 120 Baht set).
 * 3 digits = 30%, 2 digits = 28%, 1 digit / run = 12%, other = 25%.
 */
export function calculateTransferCommission(t, setPrice = 120, upstreamSource = null, lotteryType = 'thai') {
    // If t already has a valid pre-computed commission_earned, and no explicit upstreamSource override is provided, use it
    if (!upstreamSource && t?.commission_earned !== undefined && t?.commission_earned !== null && Number(t.commission_earned) > 0) {
        return Number(t.commission_earned)
    }
    const amt = Number(t?.amount || 0)
    if (amt <= 0) return 0

    // Resolve upstream settings
    let connSettings = null
    const dName = (t?.upstream_dealer?.full_name || t?.target_dealer_name || t?.dealerName || '').trim()
    const dId = t?.upstream_dealer_id

    if (upstreamSource) {
        if (upstreamSource.lottery_settings) {
            connSettings = upstreamSource.lottery_settings
        } else if (upstreamSource.thai || upstreamSource.lao || upstreamSource.hanoi || upstreamSource.stock) {
            connSettings = upstreamSource
        } else if (Array.isArray(upstreamSource)) {
            const found = upstreamSource.find(d => 
                (d.upstream_name && d.upstream_name.trim() === dName) ||
                (dId && d.upstream_dealer_id === dId) ||
                (d.id === dId)
            )
            connSettings = found?.lottery_settings || null
        } else if (typeof upstreamSource === 'object') {
            connSettings = (dName && (upstreamSource[dName]?.lottery_settings || upstreamSource[dName])) ||
                           (dId && (upstreamSource[dId]?.lottery_settings || upstreamSource[dId])) ||
                           null
        }
    }
    if (!connSettings && t?.upstream_settings) {
        connSettings = t.upstream_settings.lottery_settings || t.upstream_settings
    }
    if (!connSettings && t?.lottery_settings) {
        connSettings = t.lottery_settings
    }

    // Resolve lotteryKey (thai | lao | hanoi | stock)
    const rawType = String(lotteryType || t?.lottery_type || 'thai').toLowerCase()
    let lKey = 'thai'
    if (rawType.includes('lao')) lKey = 'lao'
    else if (rawType.includes('hanoi')) lKey = 'hanoi'
    else if (rawType.includes('stock')) lKey = 'stock'
    else lKey = 'thai'

    // Map bet_type to settings key (matching UpstreamDealerSettingsInline.jsx)
    const POSITION_MAP = {
        'front_top_1': 'pak_top', 'middle_top_1': 'pak_top', 'back_top_1': 'pak_top',
        'front_bottom_1': 'pak_bottom', 'back_bottom_1': 'pak_bottom',
        '2_spread': '2_center', '2_tang': '2_center',
        '2_teng': '2_run', '2_have': '2_run',
        '2_back': '2_top', '2_front_single': '2_front',
        '1_top': 'run_top', '1_bottom': 'run_bottom'
    }
    let settingsKey = POSITION_MAP[t?.bet_type] || t?.bet_type
    if (lKey === 'lao' || lKey === 'hanoi') {
        const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
        settingsKey = LAO_MAP[settingsKey] || settingsKey
    }

    const betSettings = connSettings?.[lKey]?.[settingsKey]

    if (t?.bet_type === '4_set') {
        const setPriceToUse = Number(betSettings?.setPrice || setPrice || 120)
        const numSets = Math.max(1, Math.floor(amt / setPriceToUse))
        const commPerSet = betSettings?.commission !== undefined && betSettings?.commission !== null
            ? Number(betSettings.commission)
            : 25
        return numSets * commPerSet
    }

    if (betSettings?.commission !== undefined && betSettings?.commission !== null && !isNaN(Number(betSettings.commission))) {
        const rate = Number(betSettings.commission) / 100
        return amt * rate
    }

    // Fallback if no custom settings configured
    if (t?.bet_type === '3_top' || t?.bet_type === '3_tod' || t?.bet_type === '3_front' || t?.bet_type === '3_straight') {
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
 * Calculates comprehensive settlement and outstanding balances for an entire lottery round.
 * Sums up:
 * - Members who owe dealer (memberOwesDealer)
 * - Dealer owes members (dealerOwesMember)
 * - Dealer owes upstream layoff dealers (dealerOwesUpstream)
 * - Upstream layoff dealers owe dealer (upstreamOwesDealer)
 * 
 * Net Outstanding from Dealer's perspective:
 * netOutstanding = (memberOwesDealer - dealerOwesMember) - (dealerOwesUpstream - upstreamOwesDealer)
 * Positive (+) => Dealer has net money to collect
 * Negative (-) => Dealer has net money to pay out
 * Zero (0) => Completely even / settled
 */
export function calculateRoundOutstandingDetails({
    history,
    userHistories = [],
    memberPayments = [],
    transfers = [],
    upstreamPayments = [],
    upstreamSettings = null
} = {}) {
    if (!history) {
        return {
            isSettled: false,
            netOutstanding: 0,
            memberOwesDealer: 0,
            dealerOwesMember: 0,
            dealerOwesUpstream: 0,
            upstreamOwesDealer: 0,
            hasActivity: false
        }
    }

    const hasActivity = (
        Number(history?.total_entries || 0) > 0 ||
        Number(history?.total_amount || 0) > 0 ||
        Number(history?.transferred_amount || 0) > 0 ||
        userHistories.length > 0 ||
        transfers.length > 0
    )

    if (!hasActivity) {
        return {
            isSettled: false,
            netOutstanding: 0,
            memberOwesDealer: 0,
            dealerOwesMember: 0,
            dealerOwesUpstream: 0,
            upstreamOwesDealer: 0,
            hasActivity: false
        }
    }

    let memberOwesDealer = 0
    let dealerOwesMember = 0

    // 1. Check member balances
    if (userHistories.length > 0) {
        for (const uh of userHistories) {
            const mPayments = memberPayments.filter(p => p.user_id === uh.user_id)
            const comm = (uh.total_commission !== undefined && uh.total_commission !== null)
                ? Number(uh.total_commission)
                : (Number(uh.total_amount || 0) > 0 ? Math.round(Number(uh.total_amount) * 0.20) : 0)
            const initBal = calculateMemberInitialBalance({ ...uh, total_commission: comm })
            const currBal = calculateMemberCurrentBalance(initBal, mPayments)
            if (currBal > 0.01) {
                memberOwesDealer += currBal
            } else if (currBal < -0.01) {
                dealerOwesMember += Math.abs(currBal)
            }
        }
    } else if (Number(history?.total_amount || 0) > 0) {
        // Fallback if individual user histories are missing
        const inAmt = Number(history.total_amount || 0)
        const inComm = Number(history.total_commission || 0) > 0 ? Number(history.total_commission) : Math.round(inAmt * 0.20)
        const inPay = Number(history.total_payout || 0)
        const initInBal = inAmt - inComm - inPay
        const paidByMembers = memberPayments
            .filter(p => p.direction === 'member_to_dealer')
            .reduce((s, p) => s + Number(p.amount || 0), 0)
        const paidToMembers = memberPayments
            .filter(p => p.direction === 'dealer_to_member')
            .reduce((s, p) => s + Number(p.amount || 0), 0)
        const currInBal = initInBal - paidByMembers + paidToMembers
        if (currInBal > 0.01) {
            memberOwesDealer += currInBal
        } else if (currInBal < -0.01) {
            dealerOwesMember += Math.abs(currInBal)
        }
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
            const comm = calculateTransferCommission(t, 120, upstreamSettings || t.upstream_settings, history?.lottery_type)
            groupedMap[dName].commission_earned += comm
            groupedMap[dName].winnings += Number(t.winnings || 0)
        })
    }

    const outAmt = Number(history?.transferred_amount || 0)
    const isThai = String(history?.lottery_type || '').toLowerCase().includes('thai')
    const outComm = Number(history?.upstream_commission || 0) > 0
        ? Number(history.upstream_commission)
        : Math.round(outAmt * (isThai ? 0.30 : (25 / 120)))
    const outWin = Number(history?.upstream_winnings || 0)

    const effectiveTransfers = Object.values(groupedMap).length > 0
        ? Object.values(groupedMap)
        : (outAmt > 0 ? [{
            dealerName: "เจ้ามือ (สรุปในประวัติ)",
            amount: outAmt,
            commission_earned: outComm,
            winnings: outWin
        }] : [])

    let dealerOwesUpstream = 0
    let upstreamOwesDealer = 0

    if (effectiveTransfers.length > 0) {
        for (const t of effectiveTransfers) {
            const upstreamName = t.dealerName || "เจ้ามือ"
            const upPayments = upstreamPayments.filter(p => 
                p.upstream_dealer_name === upstreamName ||
                effectiveTransfers.length === 1
            )
            const initBal = calculateUpstreamInitialBalance(t)
            const currBal = calculateUpstreamCurrentBalance(initBal, upPayments)
            if (currBal > 0.01) {
                dealerOwesUpstream += currBal
            } else if (currBal < -0.01) {
                upstreamOwesDealer += Math.abs(currBal)
            }
        }
    } else if (outAmt > 0) {
        const initBal = Math.round((outAmt - outComm) - outWin)
        const paidByDealer = upstreamPayments
            .filter(p => p.direction === 'dealer_to_upstream')
            .reduce((s, p) => s + Number(p.amount || 0), 0)
        const paidByUpstream = upstreamPayments
            .filter(p => p.direction === 'upstream_to_dealer')
            .reduce((s, p) => s + Number(p.amount || 0), 0)
        const currBal = initBal - paidByDealer + paidByUpstream
        if (currBal > 0.01) {
            dealerOwesUpstream += currBal
        } else if (currBal < -0.01) {
            upstreamOwesDealer += Math.abs(currBal)
        }
    }

    const isSettled = (
        memberOwesDealer <= 0.01 &&
        dealerOwesMember <= 0.01 &&
        dealerOwesUpstream <= 0.01 &&
        upstreamOwesDealer <= 0.01
    )

    const netOutstanding = (memberOwesDealer - dealerOwesMember) - (dealerOwesUpstream - upstreamOwesDealer)

    return {
        isSettled,
        netOutstanding: Math.round(netOutstanding),
        memberOwesDealer: Math.round(memberOwesDealer),
        dealerOwesMember: Math.round(dealerOwesMember),
        dealerOwesUpstream: Math.round(dealerOwesUpstream),
        upstreamOwesDealer: Math.round(upstreamOwesDealer),
        hasActivity
    }
}

/**
 * Determines whether an entire lottery round is fully settled (no outstanding balances).
 */
export function isRoundFullySettled(params = {}) {
    return calculateRoundOutstandingDetails(params).isSettled
}


