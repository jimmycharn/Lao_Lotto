import { supabase, fetchAllRows } from '../lib/supabase'
import { getLotteryTypeKey, DEFAULT_COMMISSIONS, DEFAULT_PAYOUTS } from '../constants/lotteryTypes'

/**
 * Check if dealer has sufficient credit for a new bet
 * @param {string} dealerId - The dealer's user ID
 * @param {string} roundId - The round ID
 * @param {number} newBetAmount - The amount of the new bet
 * @returns {Promise<{allowed: boolean, message: string, details: object}>}
 */
export async function checkDealerCreditForBet(dealerId, roundId, newBetAmount) {
    try {
        // Get dealer's subscription with package info (include both active and trial status)
        const { data: subscriptions, error: subError } = await supabase
            .from('dealer_subscriptions')
            .select(`
                *,
                subscription_packages (
                    id,
                    billing_model,
                    percentage_rate,
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null

        if (subError || !subscription) {
            // No active subscription, allow the bet
            return { allowed: true, message: 'No active subscription', details: {} }
        }

        const pkg = subscription.subscription_packages
        
        // Use billing_model from dealer_subscriptions (updated when package is assigned)
        const billingModel = subscription.billing_model || pkg?.billing_model
        
        // Only check for percentage or profit_percentage billing model
        if (billingModel !== 'percentage' && billingModel !== 'profit_percentage') {
            return { allowed: true, message: 'Not percentage billing', details: {} }
        }

        const percentageRate = pkg?.percentage_rate || 0
        const minAmount = pkg?.min_amount_before_charge || 0

        // Get dealer's current credit
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction')
            .eq('dealer_id', dealerId)
            .single()

        const currentBalance = creditData?.balance || 0
        const currentPendingDeduction = creditData?.pending_deduction || 0

        // Calculate new pending fee after adding this bet
        // We need to estimate what the new pending_deduction will be
        const newPendingFee = newBetAmount * (percentageRate / 100)
        const estimatedTotalPending = currentPendingDeduction + newPendingFee
        
        // Check if credit is sufficient
        const availableCredit = currentBalance - currentPendingDeduction
        const hasEnoughCredit = availableCredit >= newPendingFee


        return {
            allowed: hasEnoughCredit,
            message: hasEnoughCredit 
                ? 'เครดิตเพียงพอ' 
                : `เครดิตไม่เพียงพอ ต้องการ ฿${newPendingFee.toLocaleString('th-TH', {minimumFractionDigits: 2})} แต่มีเครดิตคงเหลือ ฿${availableCredit.toLocaleString('th-TH', {minimumFractionDigits: 2})}`,
            details: {
                currentBalance,
                currentPendingDeduction,
                availableCredit,
                newBetAmount,
                minAmount,
                percentageRate,
                newPendingFee,
                estimatedTotalPending,
                shortfall: hasEnoughCredit ? 0 : newPendingFee - availableCredit
            }
        }
    } catch (error) {
        console.error('Error checking dealer credit:', error)
        // On error, allow the bet but log the issue
        return { allowed: true, message: 'Error checking credit', details: { error: error.message } }
    }
}

/**
 * Check if upstream dealer has sufficient credit before forwarding bets
 * @param {string} upstreamDealerId - The upstream dealer's user ID
 * @param {string} roundId - The round ID
 * @param {number} betAmount - The amount being forwarded
 * @returns {Promise<{allowed: boolean, message: string, details: object}>}
 */
export async function checkUpstreamDealerCredit(upstreamDealerId, roundId, betAmount) {
    try {
        // Get upstream dealer's subscription with package info (include both active and trial status)
        const { data: subscriptions } = await supabase
            .from('dealer_subscriptions')
            .select(`
                *,
                subscription_packages (
                    id,
                    billing_model,
                    percentage_rate,
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', upstreamDealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null

        if (!subscription) {
            return { allowed: true, message: 'No active subscription', details: {} }
        }

        const pkg = subscription.subscription_packages
        
        // Use billing_model from dealer_subscriptions (updated when package is assigned)
        const billingModel = subscription.billing_model || pkg?.billing_model
        
        if (billingModel !== 'percentage' && billingModel !== 'profit_percentage') {
            return { allowed: true, message: 'Not percentage billing', details: {} }
        }

        const percentageRate = pkg?.percentage_rate || 0

        // Get upstream dealer's current credit
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction')
            .eq('dealer_id', upstreamDealerId)
            .single()

        const currentBalance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0
        const availableCredit = currentBalance - pendingDeduction

        // Calculate fee for this bet
        const betFee = betAmount * (percentageRate / 100)
        
        const hasEnoughCredit = availableCredit >= betFee

        return {
            allowed: hasEnoughCredit,
            message: hasEnoughCredit 
                ? 'เครดิตเจ้ามือปลายทางเพียงพอ' 
                : `เครดิตเจ้ามือปลายทางไม่เพียงพอ ต้องการ ฿${betFee.toLocaleString()} แต่มี ฿${availableCredit.toLocaleString()}`,
            details: {
                upstreamDealerId,
                currentBalance,
                pendingDeduction,
                availableCredit,
                betAmount,
                percentageRate,
                betFee,
                shortfall: hasEnoughCredit ? 0 : betFee - availableCredit
            }
        }
    } catch (error) {
        console.error('Error checking upstream dealer credit:', error)
        return { allowed: true, message: 'Error checking credit', details: { error: error.message } }
    }
}

/**
 * Get dealer's credit summary for display
 * @param {string} dealerId - The dealer's user ID
 * @returns {Promise<object>}
 */
export async function getDealerCreditSummary(dealerId) {
    try {
        // Get credit balance
        const { data: creditData, error: creditError } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction, warning_threshold, is_blocked')
            .eq('dealer_id', dealerId)
            .single()

        // Get subscription info (include both active and trial status)
        const { data: subscriptions, error: subError } = await supabase
            .from('dealer_subscriptions')
            .select(`
                *,
                subscription_packages (
                    id,
                    name,
                    billing_model,
                    percentage_rate,
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null
        
        const balance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0
        const availableCredit = balance - pendingDeduction
        const warningThreshold = creditData?.warning_threshold || 1000
        const isBlocked = creditData?.is_blocked || false
        const isLowCredit = availableCredit <= warningThreshold

        // Use subscription_packages.billing_model as primary source of truth
        const billingModel = subscription?.subscription_packages?.billing_model || subscription?.billing_model

        return {
            balance,
            pendingDeduction,
            availableCredit,
            warningThreshold,
            isBlocked,
            isLowCredit,
            subscription: subscription ? {
                packageName: subscription.subscription_packages?.name,
                billingModel: billingModel,
                percentageRate: subscription.subscription_packages?.percentage_rate,
                minAmountBeforeCharge: subscription.subscription_packages?.min_amount_before_charge
            } : null
        }
    } catch (error) {
        console.error('Error getting dealer credit summary:', error)
        return {
            balance: 0,
            pendingDeduction: 0,
            availableCredit: 0,
            warningThreshold: 1000,
            isBlocked: false,
            isLowCredit: false,
            subscription: null,
            error: error.message
        }
    }
}

/**
 * Update pending deduction for a dealer based on current open rounds
 * @param {string} dealerId - The dealer's user ID
 */
export async function updatePendingDeduction(dealerId) {
    try {
        // Get dealer's subscription (include both active and trial status)
        // Use order by created_at desc and limit 1 to get the latest subscription
        const { data: subscriptions, error: subError } = await supabase
            .from('dealer_subscriptions')
            .select(`
                id,
                package_id,
                billing_model,
                status,
                subscription_packages (
                    id,
                    name,
                    billing_model,
                    percentage_rate,
                    min_amount_before_charge,
                    min_deduction,
                    max_deduction
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null

        // Use subscription_packages.billing_model as primary source of truth
        // dealer_subscriptions.billing_model may be stale/incorrect for older records
        const billingModel = subscription?.subscription_packages?.billing_model || subscription?.billing_model
        
        if (!subscription || (billingModel !== 'percentage' && billingModel !== 'profit_percentage')) {
            return { totalPending: 0, roundBreakdown: [] }
        }

        // Get percentage_rate, min_amount, min_deduction, max_deduction from subscription_packages
        const percentageRate = subscription.subscription_packages?.percentage_rate || 0
        const minAmount = subscription.subscription_packages?.min_amount_before_charge || 0
        const minDeduction = subscription.subscription_packages?.min_deduction || 0
        const maxDeduction = subscription.subscription_packages?.max_deduction || 100000

        // Get all open rounds for this dealer (only status = 'open', not 'closed')
        // Closed rounds have already been charged, so don't include them in pending
        const { data: rounds } = await supabase
            .from('lottery_rounds')
            .select('id, lottery_type, lottery_name')
            .eq('dealer_id', dealerId)
            .eq('status', 'open') // Only open rounds, closed rounds are already charged

        if (!rounds || rounds.length === 0) {
            // No open rounds, clear pending deduction and round_pending_credits
            await supabase
                .from('dealer_credits')
                .update({ pending_deduction: 0, updated_at: new Date().toISOString() })
                .eq('dealer_id', dealerId)
            // Clear old round_pending_credits for this dealer
            await supabase
                .from('round_pending_credits')
                .delete()
                .eq('dealer_id', dealerId)
            return { totalPending: 0, roundBreakdown: [] }
        }

        // Get all members of this dealer
        const { data: memberships, error: memberErr } = await supabase
            .from('user_dealer_memberships')
            .select('user_id')
            .eq('dealer_id', dealerId)
            .eq('status', 'active')

        const memberUserIds = (memberships || []).map(m => m.user_id)
        const memberIds = new Set(memberUserIds)
        
        // Fetch profiles for these members to check password_changed
        // If a member hasn't changed their password, the dealer still controls the account
        let dealerCreatedUnchangedIds = new Set()
        if (memberUserIds.length > 0) {
            const { data: memberProfiles } = await supabase
                .from('profiles')
                .select('id, password_changed')
                .in('id', memberUserIds)
            
            dealerCreatedUnchangedIds = new Set(
                (memberProfiles || [])
                    .filter(p => !p.password_changed)
                    .map(p => p.id)
            )
        }
        
        // Get downstream dealers (dealers who send bets TO this dealer)
        const { data: downstreamConnections } = await supabase
            .from('dealer_upstream_connections')
            .select('dealer_id, status, is_blocked')
            .eq('upstream_dealer_id', dealerId)
        
        // Filter to active connections (status = 'active' OR status is null/undefined AND not blocked)
        const activeDownstream = (downstreamConnections || []).filter(d => 
            (d.status === 'active' || !d.status) && !d.is_blocked
        )
        const downstreamDealerIds = new Set(activeDownstream.map(d => d.dealer_id))

        // Calculate pending for each open round separately
        let totalPending = 0
        const roundBreakdown = []

        for (const round of rounds) {
            // Get all submissions for this round INCLUDING submitted_by_type
            const { data: allSubs } = await fetchAllRows(
                (from, to) => supabase
                    .from('submissions')
                    .select('id, amount, user_id, source, submitted_by_type')
                    .eq('round_id', round.id)
                    .eq('is_deleted', false)
                    .range(from, to)
            )

            // Get bet_transfers FROM this round (outgoing transfers)
            const { data: outgoingTransfers } = await supabase
                .from('bet_transfers')
                .select('numbers, bet_type, amount, status, is_linked')
                .eq('round_id', round.id)
            
            // Filter out returned transfers (status !== 'returned')
            const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')

            // Only subtract LINKED (in-system) transfers from chargeable volume
            // External (non-linked) transfers should NOT reduce pending credit
            // because that volume disappears from the system entirely
            const linkedTransfers = activeTransfers.filter(t => t.is_linked)
            const transferredOutAmount = linkedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

            // === NEW LOGIC v3: Separate volumes by input type ===
            // 1. dealerInputForOwnUsers: dealer ป้อนแทน user ที่ dealer สร้าง (password_changed=false) → ใช้ min_amount
            // 2. selfInputVolume: user ป้อนเอง (submitted_by_type='user') → คิดทันที ไม่ใช้ min_amount
            // 3. dealerOwnVolume: dealer ป้อนเอง (user_id = dealerId) → ใช้ min_amount
            // 4. downstreamVolume: จาก downstream dealer → คิดทันที
            let dealerOwnVolume = 0         // dealer's own bets
            let dealerInputForOwnUsers = 0  // dealer entered ON BEHALF of own users (password not changed)
            let selfInputVolume = 0         // users entered their own bets from their dashboard
            let downstreamVolume = 0        // from downstream dealers

            for (const sub of (allSubs || [])) {
                const amount = parseFloat(sub.amount || 0)
                
                // Skip submissions that came from transfers (source = 'transfer') - incoming from downstream
                if (sub.source === 'transfer') {
                    downstreamVolume += amount
                } else if (sub.user_id === dealerId) {
                    // Dealer's own bets
                    dealerOwnVolume += amount
                } else if (downstreamDealerIds.has(sub.user_id)) {
                    // Submission from a downstream dealer (not marked as transfer)
                    downstreamVolume += amount
                } else if (memberIds.has(sub.user_id)) {
                    // Member's bet - classify by user type and who entered
                    if (dealerCreatedUnchangedIds.has(sub.user_id)) {
                        // User was created by this dealer AND hasn't changed password
                        // → dealer controls this account → min_amount_before_charge applies
                        // (covers submitted_by_type='dealer', null, or undefined for legacy data)
                        dealerInputForOwnUsers += amount
                    } else if (sub.submitted_by_type === 'user') {
                        // User explicitly entered from their own dashboard
                        // → charge immediately, no min_amount benefit
                        selfInputVolume += amount
                    } else {
                        // Dealer entered for a user who HAS changed password
                        // or user not created by this dealer
                        // → still dealer input but no min_amount benefit (user is independent)
                        selfInputVolume += amount
                    }
                } else {
                    // Submission in dealer's round but user_id not in memberIds
                    // This can happen when dealer enters bets for users not yet in memberships
                    // Or when memberships query fails
                    // If submitted_by_type is explicitly 'user' → self-input (no min_amount)
                    // Otherwise (dealer, null, undefined) → dealer entered it → count as dealer input (with min_amount)
                    if (sub.submitted_by_type === 'user') {
                        selfInputVolume += amount
                    } else {
                        dealerInputForOwnUsers += amount
                    }
                }
            }

            // Subtract transferred out amount from volumes
            // Priority: subtract from dealerInputForOwnUsers first, then dealerOwnVolume, then selfInput, then downstream
            let remainingTransfer = transferredOutAmount
            let netDealerInputForOwnUsers = dealerInputForOwnUsers
            let netDealerOwnVolume = dealerOwnVolume
            let netSelfInputVolume = selfInputVolume
            let netDownstreamVolume = downstreamVolume

            if (remainingTransfer > 0) {
                const deductFromDealerInput = Math.min(remainingTransfer, netDealerInputForOwnUsers)
                netDealerInputForOwnUsers -= deductFromDealerInput
                remainingTransfer -= deductFromDealerInput
            }
            if (remainingTransfer > 0) {
                const deductFromDealerOwn = Math.min(remainingTransfer, netDealerOwnVolume)
                netDealerOwnVolume -= deductFromDealerOwn
                remainingTransfer -= deductFromDealerOwn
            }
            if (remainingTransfer > 0) {
                const deductFromSelfInput = Math.min(remainingTransfer, netSelfInputVolume)
                netSelfInputVolume -= deductFromSelfInput
                remainingTransfer -= deductFromSelfInput
            }
            if (remainingTransfer > 0) {
                const deductFromDownstream = Math.min(remainingTransfer, netDownstreamVolume)
                netDownstreamVolume -= deductFromDownstream
                remainingTransfer -= deductFromDownstream
            }

            // === Calculate chargeable volume ===
            // Total volume = all groups combined (after transfer deduction)
            const totalVolume = netDealerOwnVolume + netDealerInputForOwnUsers + netSelfInputVolume + netDownstreamVolume

            // Apply minAmount to total volume: only charge amount exceeding minAmount
            let totalChargeableVolume = 0
            if (totalVolume > minAmount) {
                totalChargeableVolume = totalVolume - minAmount
            }

            // Keep breakdown for reference
            const chargeableFromThreshold = Math.max(netDealerOwnVolume + netDealerInputForOwnUsers - minAmount, 0)
            const chargeableFromSelfInput = netSelfInputVolume
            const chargeableFromDownstream = netDownstreamVolume
            const thresholdVolume = netDealerOwnVolume + netDealerInputForOwnUsers

            // Calculate pending fee for this round
            let roundPending = totalChargeableVolume * (percentageRate / 100)

            // Apply per-round min/max deduction limits
            if (roundPending > 0 && roundPending < minDeduction) {
                roundPending = minDeduction
            }
            if (roundPending > maxDeduction) {
                roundPending = maxDeduction
            }

            totalPending += roundPending

            // Store per-round breakdown
            const roundDetail = {
                round_id: round.id,
                lottery_type: round.lottery_type,
                lottery_name: round.lottery_name,
                dealer_own_volume: netDealerOwnVolume,
                dealer_input_for_own_users: netDealerInputForOwnUsers,
                self_input_volume: netSelfInputVolume,
                downstream_volume: netDownstreamVolume,
                transferred_out: transferredOutAmount,
                threshold_volume: thresholdVolume,
                chargeable_from_threshold: chargeableFromThreshold,
                chargeable_from_self_input: chargeableFromSelfInput,
                chargeable_from_downstream: chargeableFromDownstream,
                total_chargeable: totalChargeableVolume,
                pending_fee: roundPending,
                percentage_rate: percentageRate,
                min_amount: minAmount
            }
            roundBreakdown.push(roundDetail)

            // Upsert round_pending_credits for this round
            // Include both old schema columns and new details JSONB for compatibility
            const upsertData = {
                round_id: round.id,
                dealer_id: dealerId,
                dealer_input_volume: netDealerOwnVolume + netDealerInputForOwnUsers,
                member_input_volume: netSelfInputVolume,
                upstream_volume: netDownstreamVolume,
                total_chargeable_volume: totalChargeableVolume,
                percentage_rate: percentageRate,
                pending_fee: roundPending,
                is_finalized: false,
                updated_at: new Date().toISOString()
            }
            
            // Try with details column first (migration 043), fallback without it
            const { error: upsertErr } = await supabase
                .from('round_pending_credits')
                .upsert({ ...upsertData, details: roundDetail }, { onConflict: 'round_id,dealer_id' })
            
            if (upsertErr) {
                // Fallback: upsert without details column (migration 043 not yet applied)
                const { error: fallbackErr } = await supabase
                    .from('round_pending_credits')
                    .upsert(upsertData, { onConflict: 'round_id,dealer_id' })
            }
        }

        // Clean up round_pending_credits for rounds that are no longer open
        const openRoundIds = rounds.map(r => r.id)
        const { data: oldPending } = await supabase
            .from('round_pending_credits')
            .select('round_id')
            .eq('dealer_id', dealerId)
        
        const oldPendingIds = (oldPending || []).map(p => p.round_id)
        const idsToDelete = oldPendingIds.filter(id => !openRoundIds.includes(id))
        if (idsToDelete.length > 0) {
            await supabase
                .from('round_pending_credits')
                .delete()
                .eq('dealer_id', dealerId)
                .in('round_id', idsToDelete)
        }

        // Update total pending deduction
        const { data: existingCredit } = await supabase
            .from('dealer_credits')
            .select('id')
            .eq('dealer_id', dealerId)
            .single()

        if (existingCredit) {
            await supabase
                .from('dealer_credits')
                .update({ 
                    pending_deduction: totalPending, 
                    updated_at: new Date().toISOString() 
                })
                .eq('dealer_id', dealerId)
        } else {
            // Create new record if doesn't exist
            await supabase
                .from('dealer_credits')
                .insert({
                    dealer_id: dealerId,
                    balance: 0,
                    pending_deduction: totalPending,
                    warning_threshold: 1000
                })
        }

        return { totalPending, roundBreakdown }

    } catch (error) {
        console.error('Error updating pending deduction:', error)
        return { totalPending: 0, roundBreakdown: [], error: error.message }
    }
}

/**
 * Calculate the credit fee for a specific round based on current submissions
 * Used to determine additional credit to deduct when submissions are modified after round is closed
 * @param {string} dealerId - The dealer's user ID
 * @param {string} roundId - The round ID
 * @returns {Promise<{fee: number, details: object}>}
 */
export async function calculateRoundCreditFee(dealerId, roundId) {
    try {
        // Get dealer's subscription
        const { data: subscriptions } = await supabase
            .from('dealer_subscriptions')
            .select(`
                *,
                subscription_packages (
                    id,
                    billing_model,
                    percentage_rate,
                    profit_percentage_rate,
                    min_amount_before_charge,
                    min_deduction,
                    max_deduction
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null
        // Use subscription_packages.billing_model as primary source of truth
        const billingModel = subscription?.subscription_packages?.billing_model || subscription?.billing_model

        if (!subscription || (billingModel !== 'percentage' && billingModel !== 'profit_percentage')) {
            return { fee: 0, details: { reason: 'Not percentage billing', billingModel } }
        }

        const percentageRate = subscription.subscription_packages?.percentage_rate || 0
        const minAmount = subscription.subscription_packages?.min_amount_before_charge || 0
        const minDeduction = subscription.subscription_packages?.min_deduction || 0
        const maxDeduction = subscription.subscription_packages?.max_deduction || 100000

        // Get all members of this dealer
        const { data: memberships2 } = await supabase
            .from('user_dealer_memberships')
            .select('user_id')
            .eq('dealer_id', dealerId)
            .eq('status', 'active')

        const memberUserIds2 = (memberships2 || []).map(m => m.user_id)
        const memberIds = new Set(memberUserIds2)
        
        let dealerCreatedUnchangedIds = new Set()
        if (memberUserIds2.length > 0) {
            const { data: memberProfiles } = await supabase
                .from('profiles')
                .select('id, password_changed')
                .in('id', memberUserIds2)
            
            dealerCreatedUnchangedIds = new Set(
                (memberProfiles || [])
                    .filter(p => !p.password_changed)
                    .map(p => p.id)
            )
        }

        // Get downstream dealers
        const { data: downstreamConnections } = await supabase
            .from('dealer_upstream_connections')
            .select('dealer_id, status, is_blocked')
            .eq('upstream_dealer_id', dealerId)
        
        const activeDownstream = (downstreamConnections || []).filter(d => 
            (d.status === 'active' || !d.status) && !d.is_blocked
        )
        const downstreamDealerIds = new Set(activeDownstream.map(d => d.dealer_id))

        // Get all submissions for this round INCLUDING submitted_by_type
        const { data: allSubs } = await fetchAllRows(
            (from, to) => supabase
                .from('submissions')
                .select('id, amount, user_id, source, submitted_by_type')
                .eq('round_id', roundId)
                .eq('is_deleted', false)
                .range(from, to)
        )

        // Get bet_transfers FROM this round (outgoing transfers)
        const { data: outgoingTransfers } = await supabase
            .from('bet_transfers')
            .select('amount, status, is_linked')
            .eq('round_id', roundId)
        
        const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')
        // Only subtract LINKED (in-system) transfers from chargeable volume
        // External (non-linked) transfers should NOT reduce pending credit
        const linkedTransfers = activeTransfers.filter(t => t.is_linked)
        const transferredOutAmount = linkedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

        // Separate volumes by input type (same logic as updatePendingDeduction v3)
        let dealerOwnVolume = 0
        let dealerInputForOwnUsers = 0
        let selfInputVolume = 0
        let downstreamVolume = 0

        for (const sub of (allSubs || [])) {
            const amount = parseFloat(sub.amount || 0)
            if (sub.source === 'transfer') {
                downstreamVolume += amount
            } else if (sub.user_id === dealerId) {
                dealerOwnVolume += amount
            } else if (downstreamDealerIds.has(sub.user_id)) {
                downstreamVolume += amount
            } else if (memberIds.has(sub.user_id)) {
                if (dealerCreatedUnchangedIds.has(sub.user_id)) {
                    // User created by this dealer AND hasn't changed password
                    // → dealer controls this account → min_amount_before_charge applies
                    dealerInputForOwnUsers += amount
                } else if (sub.submitted_by_type === 'user') {
                    selfInputVolume += amount
                } else {
                    selfInputVolume += amount
                }
            } else {
                // Fallback: submission in dealer's round but user not in memberships
                // Only treat as self-input if explicitly submitted_by_type='user'
                if (sub.submitted_by_type === 'user') {
                    selfInputVolume += amount
                } else {
                    dealerInputForOwnUsers += amount
                }
            }
        }

        // Subtract transferred out amount
        // Priority: dealerInputForOwnUsers → dealerOwnVolume → selfInput → downstream
        let remainingTransfer = transferredOutAmount
        let netDealerInputForOwnUsers = dealerInputForOwnUsers
        let netDealerOwnVolume = dealerOwnVolume
        let netSelfInputVolume = selfInputVolume
        let netDownstreamVolume = downstreamVolume

        if (remainingTransfer > 0) {
            const d = Math.min(remainingTransfer, netDealerInputForOwnUsers)
            netDealerInputForOwnUsers -= d
            remainingTransfer -= d
        }
        if (remainingTransfer > 0) {
            const d = Math.min(remainingTransfer, netDealerOwnVolume)
            netDealerOwnVolume -= d
            remainingTransfer -= d
        }
        if (remainingTransfer > 0) {
            const d = Math.min(remainingTransfer, netSelfInputVolume)
            netSelfInputVolume -= d
            remainingTransfer -= d
        }
        if (remainingTransfer > 0) {
            const d = Math.min(remainingTransfer, netDownstreamVolume)
            netDownstreamVolume -= d
            remainingTransfer -= d
        }

        // Calculate chargeable volume — apply minAmount to total volume
        const totalVolume = netDealerOwnVolume + netDealerInputForOwnUsers + netSelfInputVolume + netDownstreamVolume
        let totalChargeableVolume = 0
        if (totalVolume > minAmount) {
            totalChargeableVolume = totalVolume - minAmount
        }

        const thresholdVolume = netDealerOwnVolume + netDealerInputForOwnUsers
        const chargeableFromThreshold = Math.max(thresholdVolume - minAmount, 0)

        // Calculate fee with min/max limits
        let fee = totalChargeableVolume * (percentageRate / 100)
        if (fee > 0 && fee < minDeduction) fee = minDeduction
        if (fee > maxDeduction) fee = maxDeduction

        return {
            fee,
            billingModel,
            details: {
                billingModel,
                dealerOwnVolume: netDealerOwnVolume,
                dealerInputForOwnUsers: netDealerInputForOwnUsers,
                selfInputVolume: netSelfInputVolume,
                downstreamVolume: netDownstreamVolume,
                transferredOutAmount,
                thresholdVolume,
                chargeableFromThreshold,
                chargeableFromSelfInput: netSelfInputVolume,
                chargeableFromDownstream: netDownstreamVolume,
                totalChargeableVolume,
                percentageRate,
                minAmount,
                minDeduction,
                maxDeduction
            }
        }
    } catch (error) {
        console.error('Error calculating round credit fee:', error)
        return { fee: 0, details: { error: error.message } }
    }
}

/**
 * Deduct additional credit for a closed/announced round when submissions are modified
 * Only deducts the difference if the new fee is higher than what was already charged
 * @param {string} dealerId - The dealer's user ID
 * @param {string} roundId - The round ID
 * @param {number} previouslyChargedAmount - Amount already charged for this round (stored in round or calculated)
 * @returns {Promise<{success: boolean, amountDeducted: number, message: string}>}
 */
export async function deductAdditionalCreditForRound(dealerId, roundId, previouslyChargedAmount = 0) {
    try {
        // Calculate current fee based on submissions
        const { fee: currentFee, details } = await calculateRoundCreditFee(dealerId, roundId)

        // Calculate additional amount to deduct
        const additionalAmount = Math.max(0, currentFee - previouslyChargedAmount)

        if (additionalAmount <= 0) {
            return {
                success: true,
                amountDeducted: 0,
                message: 'ไม่มียอดเครดิตที่ต้องตัดเพิ่ม',
                details: { currentFee, previouslyChargedAmount, additionalAmount: 0 }
            }
        }

        // Get current credit balance
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance')
            .eq('dealer_id', dealerId)
            .single()

        const currentBalance = creditData?.balance || 0

        // Ensure we don't deduct more than available (no negative balance)
        const actualDeduction = Math.min(additionalAmount, currentBalance)

        if (actualDeduction > 0) {
            // Deduct from balance
            const { error: updateError } = await supabase
                .from('dealer_credits')
                .update({
                    balance: currentBalance - actualDeduction,
                    updated_at: new Date().toISOString()
                })
                .eq('dealer_id', dealerId)

            if (updateError) throw updateError

            // Record the transaction
            await supabase
                .from('credit_transactions')
                .insert({
                    dealer_id: dealerId,
                    transaction_type: 'deduction',
                    amount: -actualDeduction,
                    balance_after: currentBalance - actualDeduction,
                    reference_type: 'round',
                    reference_id: roundId,
                    description: `ค่าธรรมเนียมเพิ่มเติมจากการแก้ไขงวด`,
                    metadata: { type: 'additional_deduction', currentFee, previouslyChargedAmount }
                })
        }

        // Update the round's charged_amount for future reference
        await supabase
            .from('lottery_rounds')
            .update({
                charged_credit_amount: currentFee
            })
            .eq('id', roundId)

        return {
            success: true,
            amountDeducted: actualDeduction,
            message: actualDeduction > 0 
                ? `ตัดเครดิตเพิ่ม ฿${actualDeduction.toLocaleString('th-TH', {minimumFractionDigits: 2})}` 
                : 'ไม่มียอดเครดิตที่ต้องตัดเพิ่ม',
            details: { currentFee, previouslyChargedAmount, additionalAmount, actualDeduction, ...details }
        }
    } catch (error) {
        console.error('Error deducting additional credit:', error)
        return {
            success: false,
            amountDeducted: 0,
            message: 'เกิดข้อผิดพลาดในการตัดเครดิต: ' + error.message,
            details: { error: error.message }
        }
    }
}

/**
 * Calculate profit for a round (used by profit_percentage billing model)
 * Profit = (Total Incoming Bets - Outgoing Transfers - Total Commission - Total Payout) 
 *        + (Outgoing: wins + commission - bet amount)
 * @param {string} dealerId - The dealer's user ID
 * @param {string} roundId - The round ID
 * @returns {Promise<{profit: number, details: object}>}
 */
export async function calculateRoundProfit(dealerId, roundId) {
    try {
        // Get round info (lottery_type + set_prices needed for commission/payout)
        const { data: roundData } = await supabase
            .from('lottery_rounds')
            .select('lottery_type, set_prices')
            .eq('id', roundId)
            .single()

        const lotteryType = roundData?.lottery_type
        const lotteryKey = getLotteryTypeKey(lotteryType)
        const setPrices = roundData?.set_prices || {}

        // Helper: map bet_type to settings key (Lao/Hanoi use different keys)
        const getSettingsKey = (betType) => {
            if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
                const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                return LAO_MAP[betType] || betType
            }
            return betType
        }

        // Get all submissions for this round (incoming bets)
        const { data: allSubs } = await fetchAllRows(
            (from, to) => supabase
                .from('submissions')
                .select('id, amount, user_id, source, commission_amount, prize_amount, is_winner, bet_type')
                .eq('round_id', roundId)
                .eq('is_deleted', false)
                .range(from, to)
        )

        // Get user settings for commission/payout calculation
        const allUserIds = [...new Set((allSubs || []).map(s => s.user_id))]
        let userSettingsMap = {}
        if (allUserIds.length > 0) {
            const { data: userSettings } = await supabase
                .from('user_settings')
                .select('user_id, lottery_settings')
                .eq('dealer_id', dealerId)
                .in('user_id', allUserIds)
            
            for (const us of (userSettings || [])) {
                userSettingsMap[us.user_id] = us.lottery_settings
            }
        }

        // Commission calculation — matches dealer dashboard getCommission() exactly
        const calcCommission = (sub) => {
            const amount = parseFloat(sub.amount || 0)
            const settingsKey = getSettingsKey(sub.bet_type)
            const settings = userSettingsMap[sub.user_id]?.[lotteryKey]?.[settingsKey]

            // Special handling for 4_set/4_top: commission is fixed amount per set
            if (sub.bet_type === '4_set' || sub.bet_type === '4_top') {
                if (settings?.isSet && settings?.commission !== undefined) {
                    const setPrice = settings.setPrice || setPrices['4_top'] || 120
                    const numSets = Math.floor(amount / setPrice)
                    return numSets * settings.commission
                }
                const defaultSetPrice = setPrices['4_top'] || 120
                const numSets = Math.floor(amount / defaultSetPrice)
                return numSets * 25
            }

            if (settings?.commission !== undefined) {
                return settings.isFixed ? settings.commission : amount * (settings.commission / 100)
            }
            return amount * ((DEFAULT_COMMISSIONS[sub.bet_type] || 15) / 100)
        }

        // Payout calculation — matches dealer dashboard getExpectedPayout() exactly
        const calcPayout = (sub) => {
            if (!sub.is_winner) return 0
            // For 4_set, use stored prize_amount (FIXED amount, not multiplied)
            if (sub.bet_type === '4_set') {
                return parseFloat(sub.prize_amount || 0)
            }
            const amount = parseFloat(sub.amount || 0)
            const settingsKey = getSettingsKey(sub.bet_type)
            const settings = userSettingsMap[sub.user_id]?.[lotteryKey]?.[settingsKey]
            if (settings?.payout !== undefined) return amount * settings.payout
            return amount * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
        }

        // Get outgoing bet_transfers for this round
        const { data: outgoingTransfers } = await supabase
            .from('bet_transfers')
            .select('id, amount, status, target_submission_id, upstream_dealer_id, bet_type')
            .eq('round_id', roundId)
        
        const activeOutgoing = (outgoingTransfers || []).filter(t => t.status !== 'returned')
        const outgoingBetAmount = activeOutgoing.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

        // Calculate incoming totals (same as dealer dashboard)
        let totalBet = 0
        let totalCommission = 0
        let totalPayout = 0

        for (const sub of (allSubs || [])) {
            totalBet += parseFloat(sub.amount || 0)
            totalCommission += calcCommission(sub)
            totalPayout += calcPayout(sub)
        }

        // dealerProfit = totalBet - totalPayout - totalCommission (matches dealer dashboard)
        const dealerProfit = totalBet - totalPayout - totalCommission

        // Outgoing (ตีออก) — matches dealer dashboard upstreamSummaries logic
        let outgoingTotalWin = 0
        let outgoingTotalCommission = 0

        if (activeOutgoing.length > 0) {
            const linkedOutgoing = activeOutgoing.filter(t => t.target_submission_id)
            const externalOutgoing = activeOutgoing.filter(t => !t.target_submission_id)
            
            if (linkedOutgoing.length > 0) {
                const targetSubIds = linkedOutgoing.map(t => t.target_submission_id)
                const { data: targetSubs } = await supabase
                    .from('submissions')
                    .select('id, amount, prize_amount, is_winner, bet_type')
                    .in('id', targetSubIds)
                    .eq('is_deleted', false)

                for (const ts of (targetSubs || [])) {
                    if (ts.is_winner) {
                        outgoingTotalWin += parseFloat(ts.prize_amount || 0)
                    }
                    const commRate = DEFAULT_COMMISSIONS[ts.bet_type] || 15
                    outgoingTotalCommission += parseFloat(ts.amount || 0) * (commRate / 100)
                }
            }

            for (const t of externalOutgoing) {
                const commRate = DEFAULT_COMMISSIONS[t.bet_type] || 15
                outgoingTotalCommission += parseFloat(t.amount || 0) * (commRate / 100)
            }
        }

        // outgoingProfit = win + commission - betAmount (matches dealer dashboard)
        const outgoingProfit = outgoingTotalWin + outgoingTotalCommission - outgoingBetAmount
        const totalProfit = dealerProfit + outgoingProfit

        return {
            profit: totalProfit,
            details: {
                totalBet,
                outgoingBetAmount,
                totalCommission,
                totalPayout,
                dealerProfit,
                outgoingTotalWin,
                outgoingTotalCommission,
                outgoingProfit,
                totalProfit
            }
        }
    } catch (error) {
        console.error('Error calculating round profit:', error)
        return { profit: 0, details: { error: error.message } }
    }
}

/**
 * Deduct credit based on profit for profit_percentage billing model
 * Called after results are announced. Refunds pending deduction and applies profit-based fee.
 * Allows negative balance (outstanding debt tracked in dealer_credits.outstanding_debt)
 * @param {string} dealerId - The dealer's user ID
 * @param {string} roundId - The round ID
 * @param {number} previousPendingAmount - The pending amount that was held during data entry (to be refunded)
 * @returns {Promise<{success: boolean, amountDeducted: number, profitAmount: number, message: string, details: object}>}
 */
export async function deductProfitBasedCredit(dealerId, roundId, previousPendingAmount = 0) {
    try {
        // 1. Get dealer's subscription to get profit_percentage_rate
        const { data: subscriptions } = await supabase
            .from('dealer_subscriptions')
            .select(`
                *,
                subscription_packages (
                    id,
                    billing_model,
                    percentage_rate,
                    profit_percentage_rate,
                    min_amount_before_charge,
                    min_deduction,
                    max_deduction
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)

        const subscription = subscriptions?.[0] || null
        const billingModel = subscription?.subscription_packages?.billing_model || subscription?.billing_model

        if (!subscription || billingModel !== 'profit_percentage') {
            return {
                success: true,
                amountDeducted: 0,
                profitAmount: 0,
                message: 'Not profit_percentage billing',
                details: { billingModel }
            }
        }

        const profitPercentageRate = subscription.subscription_packages?.profit_percentage_rate || 0
        const minDeduction = subscription.subscription_packages?.min_deduction || 0
        const maxDeduction = subscription.subscription_packages?.max_deduction || 100000

        // 2. Calculate profit for this round
        const { profit, details: profitDetails } = await calculateRoundProfit(dealerId, roundId)

        // 3. Find any existing percentage-based deduction for this round
        // (e.g. 1% "ค่าธรรมเนียมทันที" that was charged when closing the round)
        // This must be refunded before applying profit-based fee
        const { data: existingDeductions } = await supabase
            .from('credit_transactions')
            .select('id, amount')
            .eq('dealer_id', dealerId)
            .eq('reference_id', roundId)
            .eq('reference_type', 'round')
            .eq('transaction_type', 'deduction')
            .not('metadata->>type', 'eq', 'profit_percentage_deduction')

        // Sum up all previous deductions for this round (amount is negative)
        const previouslyDeducted = (existingDeductions || []).reduce(
            (sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0
        )
        // Use whichever is larger: the param passed in or what we found in DB
        const refundAmount = Math.max(previousPendingAmount, previouslyDeducted)

        // 4. Get current credit balance
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction, outstanding_debt')
            .eq('dealer_id', dealerId)
            .single()

        const currentBalance = creditData?.balance || 0
        const currentPending = creditData?.pending_deduction || 0
        const currentDebt = creditData?.outstanding_debt || 0

        // 5. Refund the previous deduction first (add back to balance, reduce pending)
        let newBalance = currentBalance + refundAmount
        let newPending = Math.max(0, currentPending - refundAmount)

        // 6. Calculate profit-based fee
        let profitFee = 0
        if (profit > 0) {
            profitFee = profit * (profitPercentageRate / 100)

            // Apply min/max deduction limits
            if (profitFee > 0 && profitFee < minDeduction) {
                profitFee = minDeduction
            }
            if (profitFee > maxDeduction) {
                profitFee = maxDeduction
            }
        }
        // If profit <= 0, no fee to charge

        // 7. Apply deduction (allow negative balance)
        let actualDeduction = profitFee
        let newOutstandingDebt = currentDebt

        if (profitFee > 0) {
            newBalance = newBalance - profitFee
            // If balance goes negative, track as outstanding debt
            if (newBalance < 0) {
                newOutstandingDebt = currentDebt + Math.abs(newBalance)
                // Keep balance at the negative value — it will be recovered on top-up
            }
        }

        // 8. Update dealer_credits
        const { error: updateError } = await supabase
            .from('dealer_credits')
            .update({
                balance: newBalance,
                pending_deduction: newPending,
                outstanding_debt: newOutstandingDebt,
                updated_at: new Date().toISOString()
            })
            .eq('dealer_id', dealerId)

        if (updateError) throw updateError

        // 9. Record refund transaction (if there was a previous deduction to refund)
        if (refundAmount > 0) {
            await supabase
                .from('credit_transactions')
                .insert({
                    dealer_id: dealerId,
                    transaction_type: 'refund',
                    amount: refundAmount,
                    balance_after: newBalance + profitFee, // balance after refund but before profit deduction
                    reference_type: 'round',
                    reference_id: roundId,
                    description: `คืนเครดิตค่าธรรมเนียมทันที (ก่อนคำนวณกำไร) ฿${refundAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}`,
                    metadata: { type: 'profit_percentage_refund', refundAmount, previousPendingAmount, previouslyDeducted }
                })
        }

        // 10. Record profit-based deduction transaction
        if (profitFee > 0) {
            await supabase
                .from('credit_transactions')
                .insert({
                    dealer_id: dealerId,
                    transaction_type: 'deduction',
                    amount: -profitFee,
                    balance_after: newBalance,
                    reference_type: 'round',
                    reference_id: roundId,
                    description: `ค่าบริการจากกำไร (${profitPercentageRate}%) กำไร ฿${profit.toLocaleString('th-TH', {minimumFractionDigits: 2})}`,
                    metadata: {
                        type: 'profit_percentage_deduction',
                        profit,
                        profitPercentageRate,
                        profitFee,
                        minDeduction,
                        maxDeduction,
                        ...profitDetails
                    }
                })
        }

        // 11. Update the round's charged_credit_amount
        await supabase
            .from('lottery_rounds')
            .update({ charged_credit_amount: profitFee })
            .eq('id', roundId)

        // 12. Clean up round_pending_credits for this round
        await supabase
            .from('round_pending_credits')
            .delete()
            .eq('round_id', roundId)
            .eq('dealer_id', dealerId)

        return {
            success: true,
            amountDeducted: profitFee,
            profitAmount: profit,
            message: profit > 0
                ? `ตัดเครดิตจากกำไร ฿${profitFee.toLocaleString('th-TH', {minimumFractionDigits: 2})} (กำไร ฿${profit.toLocaleString('th-TH', {minimumFractionDigits: 2})} × ${profitPercentageRate}%)`
                : 'ไม่มีกำไร ไม่ตัดเครดิต',
            details: {
                profit,
                profitPercentageRate,
                profitFee,
                refundAmount,
                previousPendingAmount,
                previouslyDeducted,
                balanceBefore: currentBalance,
                balanceAfterRefund: currentBalance + refundAmount,
                balanceAfter: newBalance,
                outstandingDebt: newOutstandingDebt,
                minDeduction,
                maxDeduction,
                ...profitDetails
            }
        }
    } catch (error) {
        console.error('Error deducting profit-based credit:', error)
        return {
            success: false,
            amountDeducted: 0,
            profitAmount: 0,
            message: 'เกิดข้อผิดพลาดในการตัดเครดิตจากกำไร: ' + error.message,
            details: { error: error.message }
        }
    }
}
