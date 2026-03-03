import { supabase } from '../lib/supabase'

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
        
        // Only check for percentage billing model
        if (billingModel !== 'percentage') {
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
        
        if (billingModel !== 'percentage') {
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
        
        if (!subscription || billingModel !== 'percentage') {
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
            const { data: allSubs } = await supabase
                .from('submissions')
                .select('id, amount, user_id, source, submitted_by_type')
                .eq('round_id', round.id)
                .eq('is_deleted', false)

            // Get bet_transfers FROM this round (outgoing transfers - these amounts should NOT be charged)
            const { data: outgoingTransfers } = await supabase
                .from('bet_transfers')
                .select('numbers, bet_type, amount, status')
                .eq('round_id', round.id)
            
            // Filter out returned transfers (status !== 'returned')
            const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')

            // Calculate total amount that was transferred OUT (should not be charged)
            const transferredOutAmount = activeTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

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
            // Priority: subtract from dealerInputForOwnUsers first, then dealerOwnVolume
            let remainingTransfer = transferredOutAmount
            let netDealerInputForOwnUsers = dealerInputForOwnUsers
            let netDealerOwnVolume = dealerOwnVolume

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

            // === Calculate chargeable volume ===
            // Group 1: dealer's own bets + dealer-input for own users → subject to min_amount threshold
            const thresholdVolume = netDealerOwnVolume + netDealerInputForOwnUsers
            let chargeableFromThreshold = 0
            if (thresholdVolume > minAmount) {
                chargeableFromThreshold = thresholdVolume - minAmount
            }

            // Group 2: user self-input → always charged (no min_amount benefit)
            const chargeableFromSelfInput = selfInputVolume

            // Group 3: downstream volume → always charged
            const chargeableFromDownstream = downstreamVolume

            const totalChargeableVolume = chargeableFromThreshold + chargeableFromSelfInput + chargeableFromDownstream

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
                self_input_volume: selfInputVolume,
                downstream_volume: downstreamVolume,
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
                member_input_volume: selfInputVolume,
                upstream_volume: downstreamVolume,
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

        if (!subscription || billingModel !== 'percentage') {
            return { fee: 0, details: { reason: 'Not percentage billing' } }
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
        const { data: allSubs } = await supabase
            .from('submissions')
            .select('id, amount, user_id, source, submitted_by_type')
            .eq('round_id', roundId)
            .eq('is_deleted', false)

        // Get bet_transfers FROM this round (outgoing transfers)
        const { data: outgoingTransfers } = await supabase
            .from('bet_transfers')
            .select('amount, status')
            .eq('round_id', roundId)
        
        const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')
        const transferredOutAmount = activeTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

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
        let remainingTransfer = transferredOutAmount
        let netDealerInputForOwnUsers = dealerInputForOwnUsers
        let netDealerOwnVolume = dealerOwnVolume

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

        // Calculate chargeable volume
        const thresholdVolume = netDealerOwnVolume + netDealerInputForOwnUsers
        let chargeableFromThreshold = 0
        if (thresholdVolume > minAmount) {
            chargeableFromThreshold = thresholdVolume - minAmount
        }

        const totalChargeableVolume = chargeableFromThreshold + selfInputVolume + downstreamVolume

        // Calculate fee with min/max limits
        let fee = totalChargeableVolume * (percentageRate / 100)
        if (fee > 0 && fee < minDeduction) fee = minDeduction
        if (fee > maxDeduction) fee = maxDeduction

        return {
            fee,
            details: {
                dealerOwnVolume: netDealerOwnVolume,
                dealerInputForOwnUsers: netDealerInputForOwnUsers,
                selfInputVolume,
                downstreamVolume,
                transferredOutAmount,
                thresholdVolume,
                chargeableFromThreshold,
                chargeableFromSelfInput: selfInputVolume,
                chargeableFromDownstream: downstreamVolume,
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
                    amount: -actualDeduction,
                    type: 'deduction',
                    description: `ค่าธรรมเนียมเพิ่มเติมจากการแก้ไขงวด (Round ID: ${roundId})`,
                    round_id: roundId,
                    created_at: new Date().toISOString()
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
