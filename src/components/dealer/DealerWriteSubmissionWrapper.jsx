import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { updatePendingDeduction, checkDealerCreditForBet } from '../../utils/creditCheck'
import { generateUUID } from '../../constants/lotteryTypes'
import WriteSubmissionModal from '../WriteSubmissionModal'

/**
 * Wrapper component that uses the numpad-style WriteSubmissionModal
 * but handles the dealer-specific logic for saving submissions
 */
export default function DealerWriteSubmissionWrapper({
    round,
    targetUser,
    dealerId,
    onClose,
    onSuccess
}) {
    const { toast } = useToast()
    const [userSettings, setUserSettings] = useState(null)

    useEffect(() => {
        if (targetUser?.id && dealerId) {
            fetchUserSettings()
        }
    }, [targetUser?.id, dealerId])

    async function fetchUserSettings() {
        try {
            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', targetUser.id)
                .eq('dealer_id', dealerId)
                .single()

            if (data) {
                setUserSettings(data)
            }
        } catch (error) {
            console.log('No user settings found, using defaults')
        }
    }

    // Get commission rate for a bet type
    function getCommissionRate(betType) {
        const lotteryKey = round.lottery_type
        const settings = userSettings?.lottery_settings?.[lotteryKey]
        
        if (settings?.[betType]?.commission !== undefined) {
            return settings[betType].commission
        }
        
        // Default commissions
        const defaults = {
            'run_top': 15, 'run_bottom': 15,
            '2_top': 15, '2_bottom': 15, '2_front': 15, '2_center': 15, '2_run': 15,
            '3_top': 30, '3_tod': 15, '3_straight': 30, '3_tod_single': 15,
            '4_top': 25, '4_set': 25, '4_run': 15,
            '5_run': 15
        }
        return defaults[betType] || 15
    }

    // Handle submission from WriteSubmissionModal
    async function handleWriteSubmit({ entries, billNote }) {
        if (!entries || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Calculate total amount
        const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0)

        // Check dealer credit before saving
        const creditCheck = await checkDealerCreditForBet(dealerId, round.id, totalAmount)
        if (!creditCheck.allowed) {
            throw new Error(creditCheck.message)
        }

        const billId = generateUUID()
        const timestamp = new Date().toISOString()

        // Transform entries to submissions format
        const inserts = entries.map(entry => {
            const commissionRate = getCommissionRate(entry.bet_type)
            const isSetBet = entry.bet_type === '4_set'
            const commissionAmount = isSetBet ? commissionRate : (entry.amount * commissionRate) / 100

            return {
                entry_id: entry.entry_id || generateUUID(),
                round_id: round.id,
                user_id: targetUser.id,
                bill_id: billId,
                bill_note: billNote || null,
                bet_type: entry.bet_type,
                numbers: entry.numbers,
                amount: entry.amount,
                commission_rate: commissionRate,
                commission_amount: commissionAmount,
                is_deleted: false,
                submitted_by: dealerId,
                submitted_by_type: 'dealer',
                created_at: timestamp
            }
        })

        const { error } = await supabase.from('submissions').insert(inserts)
        if (error) throw error

        // Update pending deduction in background
        if (dealerId) {
            updatePendingDeduction(dealerId).catch(err => {
                console.error('Background pending deduction update failed:', err)
            })
        }

        toast.success(`บันทึกโพยให้ ${targetUser.full_name || targetUser.email} สำเร็จ! (${entries.length} รายการ)`)
        
        if (onSuccess) onSuccess()
        onClose()
    }

    // Get set price from user settings or round settings
    const lotteryKey = round.lottery_type
    const setPrice = userSettings?.lottery_settings?.[lotteryKey]?.['4_set']?.setPrice 
        || round?.set_prices?.['4_top'] 
        || 120

    return (
        <WriteSubmissionModal
            isOpen={true}
            onClose={onClose}
            onSubmit={handleWriteSubmit}
            roundInfo={{ 
                name: `${round.lottery_name || round.lottery_type} - ${targetUser?.full_name || targetUser?.email}` 
            }}
            currencySymbol={round.currency_symbol || '฿'}
            lotteryType={round.lottery_type}
            setPrice={setPrice}
        />
    )
}
