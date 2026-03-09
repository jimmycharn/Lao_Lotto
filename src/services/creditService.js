import { supabase } from '../lib/supabase'

/**
 * Create a credit topup request from a bank slip
 * @param {Object} data - Topup request data
 * @returns {Promise<{ data: any, error: any }>}
 */
export const createTopupRequest = async (data) => {
    try {
        const { data: result, error } = await supabase
            .from('credit_topup_requests')
            .insert(data)
            .select()
            .single()

        if (error) throw error
        return { data: result, error: null }

    } catch (error) {
        console.error('Error in createTopupRequest:', error)
        return { data: null, error }
    }
}

/**
 * Record a used slip to prevent reuse
 * @param {Object} data - Used slip data
 * @returns {Promise<{ data: any, error: any }>}
 */
export const recordUsedSlip = async (data) => {
    try {
        const { error } = await supabase
            .from('used_slips')
            .insert(data)

        if (error) throw error
        return { error: null }

    } catch (error) {
        console.error('Error in recordUsedSlip:', error)
        return { error }
    }
}

/**
 * Fetch dealer credit balance
 * @param {string} dealerId 
 * @returns {Promise<{ data: any, error: any }>}
 */
export const fetchDealerCredit = async (dealerId) => {
    try {
        const { data, error } = await supabase
            .from('dealer_credits')
            .select('*')
            .eq('dealer_id', dealerId)
            .maybeSingle()

        if (error) throw error
        return { data, error: null }

    } catch (error) {
        console.error('Error in fetchDealerCredit:', error)
        return { data: null, error }
    }
}

/**
 * Update dealer credit balance (increment)
 * @param {string} dealerId 
 * @param {number} amount 
 * @returns {Promise<{ newBalance: number, error: any }>}
 */
export const updateDealerCredit = async (dealerId, amount) => {
    try {
        // Fetch current credit
        const { data: creditData, error: fetchError } = await fetchDealerCredit(dealerId)
        if (fetchError) throw fetchError

        let newBalance = amount
        let error = null
        let debtRecovered = 0

        if (creditData) {
            const currentBalance = creditData.balance || 0
            const outstandingDebt = creditData.outstanding_debt || 0
            
            newBalance = currentBalance + amount

            // Auto-recover outstanding debt from top-up
            let newDebt = outstandingDebt
            if (outstandingDebt > 0 && newBalance > 0) {
                debtRecovered = Math.min(outstandingDebt, newBalance)
                newBalance -= debtRecovered
                newDebt = outstandingDebt - debtRecovered
            }

            const { error: updateError } = await supabase
                .from('dealer_credits')
                .update({
                    balance: newBalance,
                    outstanding_debt: newDebt,
                    is_blocked: false,
                    updated_at: new Date().toISOString()
                })
                .eq('dealer_id', dealerId)

            error = updateError

            // Record debt recovery transaction if any
            if (!error && debtRecovered > 0) {
                await supabase
                    .from('credit_transactions')
                    .insert({
                        dealer_id: dealerId,
                        transaction_type: 'debt_recovery',
                        amount: -debtRecovered,
                        balance_after: newBalance,
                        description: `หักยอดค้างชำระ ฿${debtRecovered.toLocaleString('th-TH', {minimumFractionDigits: 2})} จากเครดิตที่เติม`,
                        metadata: { 
                            debt_before: outstandingDebt, 
                            debt_after: newDebt, 
                            topup_amount: amount 
                        }
                    })
            }
        } else {
            // Create new record
            const { error: insertError } = await supabase
                .from('dealer_credits')
                .insert({
                    dealer_id: dealerId,
                    balance: amount,
                    outstanding_debt: 0
                })
            error = insertError
        }

        if (error) throw error
        return { newBalance, debtRecovered, error: null }

    } catch (error) {
        console.error('Error in updateDealerCredit:', error)
        return { newBalance: null, debtRecovered: 0, error }
    }
}

/**
 * Record a credit transaction history
 * @param {Object} data - Transaction data
 * @returns {Promise<{ error: any }>}
 */
export const createCreditTransaction = async (data) => {
    try {
        const { error } = await supabase
            .from('credit_transactions')
            .insert(data)

        if (error) throw error
        return { error: null }

    } catch (error) {
        console.error('Error in createCreditTransaction:', error)
        return { error }
    }
}

/**
 * Process a complete credit topup workflow (Atomic-like)
 * 1. Create topup request (approved)
 * 2. Record used slip
 * 3. Update dealer credit
 * 4. Record transaction log
 */
export const processTopup = async ({
    dealerId,
    bankAccountId,
    amount, // Verified amount
    slipUrl,
    slipData,
    transRef
}) => {
    try {
        // 1. Create approved topup request
        const topupData = {
            dealer_id: dealerId,
            bank_account_id: bankAccountId,
            amount,
            slip_image_url: slipUrl,
            slip_data: slipData,
            trans_ref: transRef,
            sender_name: slipData.sender?.displayName,
            receiver_name: slipData.receiver?.displayName,
            status: 'approved',
            verified_at: new Date().toISOString()
        }

        const { data: topupRequest, error: topupError } = await createTopupRequest(topupData)
        if (topupError) throw topupError

        // 2. Record used slip
        const { error: slipError } = await recordUsedSlip({
            trans_ref: transRef,
            topup_request_id: topupRequest.id,
            dealer_id: dealerId,
            amount
        })
        if (slipError) throw slipError

        // 3. Update dealer credit (auto-deducts outstanding debt if any)
        const { newBalance, debtRecovered, error: creditError } = await updateDealerCredit(dealerId, amount)
        if (creditError) throw creditError

        // 4. Record transaction
        const { error: transError } = await createCreditTransaction({
            dealer_id: dealerId,
            transaction_type: 'topup',
            amount,
            balance_after: newBalance,
            description: debtRecovered > 0 
                ? `เติมเครดิตจากสลิป (อัตโนมัติ) - หักยอดค้าง ฿${debtRecovered.toLocaleString('th-TH', {minimumFractionDigits: 2})}`
                : 'เติมเครดิตจากสลิป (อัตโนมัติ)'
        })
        if (transError) throw transError // Non-critical but good to know

        return { success: true, newBalance, debtRecovered: debtRecovered || 0 }

    } catch (error) {
        console.error('Error in processTopup:', error)
        return { success: false, error }
    }
}
