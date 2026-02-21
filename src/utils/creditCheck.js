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

        console.log('checkDealerCreditForBet:', {
            currentBalance,
            currentPendingDeduction,
            availableCredit,
            newBetAmount,
            percentageRate,
            newPendingFee,
            hasEnoughCredit
        })

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
        console.log('getDealerCreditSummary called for dealer:', dealerId)
        
        // Get credit balance
        const { data: creditData, error: creditError } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction, warning_threshold, is_blocked')
            .eq('dealer_id', dealerId)
            .single()

        console.log('Credit data:', creditData, 'Error:', creditError)

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
        
        console.log('Subscription data:', subscription, 'Error:', subError)

        const balance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0
        const availableCredit = balance - pendingDeduction
        const warningThreshold = creditData?.warning_threshold || 1000
        const isBlocked = creditData?.is_blocked || false
        const isLowCredit = availableCredit <= warningThreshold

        // Use billing_model from dealer_subscriptions (updated when package is assigned)
        const billingModel = subscription?.billing_model || subscription?.subscription_packages?.billing_model

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
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null

        // Use billing_model from dealer_subscriptions (updated when package is assigned)
        // Fall back to subscription_packages if not set
        const billingModel = subscription?.billing_model || subscription?.subscription_packages?.billing_model
        
        if (!subscription || billingModel !== 'percentage') {
            return
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
            .select('id')
            .eq('dealer_id', dealerId)
            .eq('status', 'open') // Only open rounds, closed rounds are already charged

        if (!rounds || rounds.length === 0) {
            // No open rounds, clear pending deduction
            await supabase
                .from('dealer_credits')
                .update({ pending_deduction: 0, updated_at: new Date().toISOString() })
                .eq('dealer_id', dealerId)
            return
        }

        // Get all members of this dealer
        const { data: memberships } = await supabase
            .from('user_dealer_memberships')
            .select('user_id')
            .eq('dealer_id', dealerId)
            .eq('status', 'active')

        const memberIds = new Set((memberships || []).map(m => m.user_id))

        // Get downstream dealers (dealers who send bets TO this dealer)
        // Include both active status and records without status (backward compatibility)
        const { data: downstreamConnections, error: downstreamError } = await supabase
            .from('dealer_upstream_connections')
            .select('dealer_id, status, is_blocked')
            .eq('upstream_dealer_id', dealerId)
        
        // Filter to active connections (status = 'active' OR status is null/undefined AND not blocked)
        const activeDownstream = (downstreamConnections || []).filter(d => 
            (d.status === 'active' || !d.status) && !d.is_blocked
        )
        const downstreamDealerIds = new Set(activeDownstream.map(d => d.dealer_id))

        // Calculate total pending for all open rounds
        let totalPending = 0

        for (const round of rounds) {
            // Get all submissions for this round
            const { data: allSubs, error: subError } = await supabase
                .from('submissions')
                .select('id, amount, user_id, source')
                .eq('round_id', round.id)
                .eq('is_deleted', false)

            // Get bet_transfers FROM this round (outgoing transfers - these amounts should NOT be charged)
            const { data: outgoingTransfers, error: outTransferError } = await supabase
                .from('bet_transfers')
                .select('numbers, bet_type, amount, status')
                .eq('round_id', round.id)
            
            // Filter out returned transfers (status !== 'returned')
            const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')

            // Calculate total amount that was transferred OUT (should not be charged)
            const transferredOutAmount = activeTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

            // Separate dealer's own volume, member volume, and downstream dealer volume
            let dealerVolume = 0
            let memberVolume = 0
            let downstreamVolume = 0

            for (const sub of (allSubs || [])) {
                const amount = parseFloat(sub.amount || 0)
                // Skip submissions that came from transfers (source = 'transfer') - these are incoming, counted separately
                if (sub.source === 'transfer') {
                    // This is an incoming transfer from downstream dealer
                    downstreamVolume += amount
                } else if (sub.user_id === dealerId) {
                    dealerVolume += amount
                } else if (memberIds.has(sub.user_id)) {
                    memberVolume += amount
                } else if (downstreamDealerIds.has(sub.user_id)) {
                    // This is a submission from a downstream dealer (not marked as transfer)
                    downstreamVolume += amount
                }
            }

            // Subtract transferred out amount from member/dealer volume
            // Because those bets were passed to upstream dealer, this dealer shouldn't be charged for them
            let netMemberVolume = Math.max(0, memberVolume - transferredOutAmount)
            let remainingTransfer = Math.max(0, transferredOutAmount - memberVolume)
            let netDealerVolume = Math.max(0, dealerVolume - remainingTransfer)

            // Calculate chargeable volume - NEW CODE v2
            // Total volume from dealer's own bets + member bets is subject to minAmount threshold
            // Only the amount EXCEEDING minAmount is charged
            // Downstream dealer volume is always charged (they send bets to us)
            const totalOwnVolume = netDealerVolume + netMemberVolume
            let chargeableVolume = downstreamVolume
            
            if (totalOwnVolume > minAmount) {
                const excessAmount = totalOwnVolume - minAmount
                chargeableVolume += excessAmount
            }

            // Calculate pending fee for this round
            const roundPending = chargeableVolume * (percentageRate / 100)
            totalPending += roundPending
        }

        // Apply min/max deduction limits
        let finalPending = totalPending
        if (finalPending > 0 && finalPending < minDeduction) {
            finalPending = minDeduction
        }
        if (finalPending > maxDeduction) {
            finalPending = maxDeduction
        }

        // Update pending deduction (upsert to handle case where record doesn't exist)
        const { data: existingCredit } = await supabase
            .from('dealer_credits')
            .select('id')
            .eq('dealer_id', dealerId)
            .single()

        if (existingCredit) {
            await supabase
                .from('dealer_credits')
                .update({ 
                    pending_deduction: finalPending, 
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
                    pending_deduction: finalPending,
                    warning_threshold: 1000
                })
        }

    } catch (error) {
        console.error('Error updating pending deduction:', error)
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
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', dealerId)
            .in('status', ['active', 'trial'])
            .order('created_at', { ascending: false })
            .limit(1)
        
        const subscription = subscriptions?.[0] || null
        const billingModel = subscription?.billing_model || subscription?.subscription_packages?.billing_model

        if (!subscription || billingModel !== 'percentage') {
            return { fee: 0, details: { reason: 'Not percentage billing' } }
        }

        const percentageRate = subscription.subscription_packages?.percentage_rate || 0
        const minAmount = subscription.subscription_packages?.min_amount_before_charge || 0

        // Get all members of this dealer
        const { data: memberships } = await supabase
            .from('user_dealer_memberships')
            .select('user_id')
            .eq('dealer_id', dealerId)
            .eq('status', 'active')

        const memberIds = new Set((memberships || []).map(m => m.user_id))

        // Get all submissions for this round
        const { data: allSubs } = await supabase
            .from('submissions')
            .select('id, amount, user_id, source')
            .eq('round_id', roundId)
            .eq('is_deleted', false)

        // Get bet_transfers FROM this round (outgoing transfers)
        const { data: outgoingTransfers } = await supabase
            .from('bet_transfers')
            .select('amount, status')
            .eq('round_id', roundId)
        
        const activeTransfers = (outgoingTransfers || []).filter(t => t.status !== 'returned')
        const transferredOutAmount = activeTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)

        // Calculate volumes
        let dealerVolume = 0
        let memberVolume = 0
        let downstreamVolume = 0

        for (const sub of (allSubs || [])) {
            const amount = parseFloat(sub.amount || 0)
            if (sub.source === 'transfer') {
                downstreamVolume += amount
            } else if (sub.user_id === dealerId) {
                dealerVolume += amount
            } else if (memberIds.has(sub.user_id)) {
                memberVolume += amount
            }
        }

        // Subtract transferred out amount
        let netMemberVolume = Math.max(0, memberVolume - transferredOutAmount)
        let remainingTransfer = Math.max(0, transferredOutAmount - memberVolume)
        let netDealerVolume = Math.max(0, dealerVolume - remainingTransfer)

        // Calculate chargeable volume
        const totalOwnVolume = netDealerVolume + netMemberVolume
        let chargeableVolume = downstreamVolume
        
        if (totalOwnVolume > minAmount) {
            chargeableVolume += (totalOwnVolume - minAmount)
        }

        // Calculate fee
        const fee = chargeableVolume * (percentageRate / 100)

        return {
            fee,
            details: {
                dealerVolume,
                memberVolume,
                downstreamVolume,
                transferredOutAmount,
                netDealerVolume,
                netMemberVolume,
                totalOwnVolume,
                chargeableVolume,
                percentageRate,
                minAmount
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
