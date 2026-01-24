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
        // Get dealer's subscription with package info
        const { data: subscription, error: subError } = await supabase
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
            .eq('status', 'active')
            .single()

        if (subError || !subscription) {
            // No active subscription, allow the bet
            return { allowed: true, message: 'No active subscription', details: {} }
        }

        const pkg = subscription.subscription_packages
        
        // Only check for percentage billing model
        if (pkg?.billing_model !== 'percentage') {
            return { allowed: true, message: 'Not percentage billing', details: {} }
        }

        const percentageRate = pkg.percentage_rate || 0
        const minAmount = pkg.min_amount_before_charge || 0

        // Get dealer's current credit
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction')
            .eq('dealer_id', dealerId)
            .single()

        const currentBalance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0

        // Calculate current volume in this round
        const { data: currentVolume } = await supabase
            .from('submissions')
            .select('amount')
            .eq('round_id', roundId)
            .eq('user_id', dealerId)
            .eq('is_deleted', false)

        const dealerVolume = (currentVolume || []).reduce((sum, s) => sum + (s.amount || 0), 0)
        
        // Calculate new total volume
        const newTotalVolume = dealerVolume + newBetAmount
        
        // Calculate chargeable volume (apply min threshold)
        let chargeableVolume = 0
        if (newTotalVolume > minAmount) {
            chargeableVolume = newTotalVolume - minAmount
        }
        
        // Calculate pending fee
        const pendingFee = chargeableVolume * (percentageRate / 100)
        
        // Check if credit is sufficient
        const availableCredit = currentBalance - pendingDeduction
        const hasEnoughCredit = availableCredit >= pendingFee

        return {
            allowed: hasEnoughCredit,
            message: hasEnoughCredit 
                ? 'เครดิตเพียงพอ' 
                : `เครดิตไม่เพียงพอ ต้องการ ฿${pendingFee.toLocaleString()} แต่มี ฿${availableCredit.toLocaleString()}`,
            details: {
                currentBalance,
                pendingDeduction,
                availableCredit,
                dealerVolume,
                newBetAmount,
                newTotalVolume,
                minAmount,
                chargeableVolume,
                percentageRate,
                pendingFee,
                shortfall: hasEnoughCredit ? 0 : pendingFee - availableCredit
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
        // Get upstream dealer's subscription with package info
        const { data: subscription } = await supabase
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
            .eq('status', 'active')
            .single()

        if (!subscription) {
            return { allowed: true, message: 'No active subscription', details: {} }
        }

        const pkg = subscription.subscription_packages
        
        if (pkg?.billing_model !== 'percentage') {
            return { allowed: true, message: 'Not percentage billing', details: {} }
        }

        const percentageRate = pkg.percentage_rate || 0

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
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction, warning_threshold, is_blocked')
            .eq('dealer_id', dealerId)
            .single()

        // Get subscription info
        const { data: subscription } = await supabase
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
            .eq('status', 'active')
            .single()

        const balance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0
        const availableCredit = balance - pendingDeduction
        const warningThreshold = creditData?.warning_threshold || 1000
        const isBlocked = creditData?.is_blocked || false
        const isLowCredit = availableCredit <= warningThreshold

        return {
            balance,
            pendingDeduction,
            availableCredit,
            warningThreshold,
            isBlocked,
            isLowCredit,
            subscription: subscription ? {
                packageName: subscription.subscription_packages?.name,
                billingModel: subscription.subscription_packages?.billing_model,
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
        // Get dealer's subscription
        const { data: subscription } = await supabase
            .from('dealer_subscriptions')
            .select(`
                subscription_packages (
                    billing_model,
                    percentage_rate,
                    min_amount_before_charge
                )
            `)
            .eq('dealer_id', dealerId)
            .eq('status', 'active')
            .single()

        if (!subscription || subscription.subscription_packages?.billing_model !== 'percentage') {
            return
        }

        const percentageRate = subscription.subscription_packages.percentage_rate || 0
        const minAmount = subscription.subscription_packages.min_amount_before_charge || 0

        // Get all open rounds for this dealer
        const { data: rounds } = await supabase
            .from('lottery_rounds')
            .select('id')
            .eq('dealer_id', dealerId)
            .in('status', ['open', 'closed'])
            .eq('is_result_announced', false)

        if (!rounds || rounds.length === 0) {
            // No open rounds, clear pending deduction
            await supabase
                .from('dealer_credits')
                .update({ pending_deduction: 0, updated_at: new Date().toISOString() })
                .eq('dealer_id', dealerId)
            return
        }

        // Calculate total pending for all open rounds
        let totalPending = 0

        for (const round of rounds) {
            // Get dealer's own volume
            const { data: dealerSubs } = await supabase
                .from('submissions')
                .select('amount')
                .eq('round_id', round.id)
                .eq('user_id', dealerId)
                .eq('is_deleted', false)

            const dealerVolume = (dealerSubs || []).reduce((sum, s) => sum + (s.amount || 0), 0)

            // Get member volume
            const { data: memberSubs } = await supabase
                .from('submissions')
                .select('amount, user_id')
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .neq('user_id', dealerId)

            // Filter to only members of this dealer
            const { data: memberships } = await supabase
                .from('user_dealer_memberships')
                .select('user_id')
                .eq('dealer_id', dealerId)
                .eq('status', 'active')

            const memberIds = new Set((memberships || []).map(m => m.user_id))
            const memberVolume = (memberSubs || [])
                .filter(s => memberIds.has(s.user_id))
                .reduce((sum, s) => sum + (s.amount || 0), 0)

            // Calculate chargeable volume
            let chargeableVolume = memberVolume
            if (dealerVolume > minAmount) {
                chargeableVolume += (dealerVolume - minAmount)
            }

            // Calculate pending fee for this round
            const roundPending = chargeableVolume * (percentageRate / 100)
            totalPending += roundPending
        }

        // Update pending deduction
        await supabase
            .from('dealer_credits')
            .update({ 
                pending_deduction: totalPending, 
                updated_at: new Date().toISOString() 
            })
            .eq('dealer_id', dealerId)

    } catch (error) {
        console.error('Error updating pending deduction:', error)
    }
}
