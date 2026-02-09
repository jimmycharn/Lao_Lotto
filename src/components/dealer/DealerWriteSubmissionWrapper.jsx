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
    onSuccess,
    editingData = null
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
        
        // Map bet_type to settings key for Lao/Hanoi lottery
        // In user_settings, Lao uses different keys than the actual bet_type used in submissions
        let settingsKey = betType
        if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',      // 3 ตัวตรง
                '3_tod': '3_tod_single',    // 3 ตัวโต๊ด
                '4_top': '4_set'            // 4 ตัวตรง (ชุด)
            }
            settingsKey = LAO_BET_TYPE_MAP[betType] || betType
        }
        
        // First check with mapped settings key
        if (settings?.[settingsKey]?.commission !== undefined) {
            return settings[settingsKey].commission
        }
        
        // Fallback: check with original betType
        if (settings?.[betType]?.commission !== undefined) {
            return settings[betType].commission
        }
        
        // Default commissions
        const defaults = {
            'run_top': 15, 'run_bottom': 15,
            '2_top': 15, '2_bottom': 15, '2_front': 15, '2_center': 15, '2_run': 15,
            '3_top': 15, '3_tod': 15, '3_straight': 15, '3_tod_single': 15,
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
        const baseTimestamp = new Date()

        // Transform entries to submissions format
        // Note: WriteSubmissionModal ส่ง betType (camelCase) แต่ database ใช้ bet_type (snake_case)
        const inserts = entries.map((entry, index) => {
            const betType = entry.betType || entry.bet_type  // รองรับทั้ง camelCase และ snake_case
            const commissionRate = getCommissionRate(betType)
            const isSetBet = betType === '4_set'
            const commissionAmount = isSetBet ? commissionRate : (entry.amount * commissionRate) / 100
            
            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            return {
                entry_id: entry.entryId || entry.entry_id || generateUUID(),
                round_id: round.id,
                user_id: targetUser.id,
                bill_id: billId,
                bill_note: billNote || null,
                bet_type: betType,
                numbers: entry.numbers,
                amount: entry.amount,
                display_numbers: entry.displayText || entry.display_numbers || entry.numbers,
                display_amount: entry.displayAmount?.toString() || entry.display_amount || entry.amount.toString(),
                commission_rate: commissionRate,
                commission_amount: commissionAmount,
                is_deleted: false,
                submitted_by: dealerId,
                submitted_by_type: 'dealer',
                created_at: entryTimestamp
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
        // ไม่ปิด modal หลังบันทึก - ให้ผู้ใช้กดปิดเอง
    }

    // Handle edit submission from WriteSubmissionModal
    async function handleEditSubmit({ entries, billNote, originalBillId, originalItems }) {
        if (!entries || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Soft delete old entries
        if (originalItems && originalItems.length > 0) {
            const oldIds = originalItems.map(item => item.id)
            const { error: deleteError } = await supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .in('id', oldIds)
            
            if (deleteError) throw deleteError
        }

        // Calculate total amount
        const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0)

        // Check dealer credit before saving
        const creditCheck = await checkDealerCreditForBet(dealerId, round.id, totalAmount)
        if (!creditCheck.allowed) {
            throw new Error(creditCheck.message)
        }

        const billId = originalBillId || generateUUID()
        const baseTimestamp = new Date()

        // Transform entries to submissions format
        const inserts = entries.map((entry, index) => {
            const betType = entry.betType || entry.bet_type
            const commissionRate = getCommissionRate(betType)
            const isSetBet = betType === '4_set'
            const commissionAmount = isSetBet ? commissionRate : (entry.amount * commissionRate) / 100
            
            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            return {
                entry_id: entry.entryId || entry.entry_id || generateUUID(),
                round_id: round.id,
                user_id: targetUser.id,
                bill_id: billId,
                bill_note: billNote || null,
                bet_type: betType,
                numbers: entry.numbers,
                amount: entry.amount,
                display_numbers: entry.displayText || entry.display_numbers || entry.numbers,
                display_amount: entry.displayAmount?.toString() || entry.display_amount || entry.amount.toString(),
                commission_rate: commissionRate,
                commission_amount: commissionAmount,
                is_deleted: false,
                submitted_by: dealerId,
                submitted_by_type: 'dealer',
                created_at: entryTimestamp
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

        toast.success(`แก้ไขโพยให้ ${targetUser.full_name || targetUser.email} สำเร็จ! (${entries.length} รายการ)`)
        
        if (onSuccess) onSuccess()
        // ไม่ปิด modal หลังบันทึก - ให้ผู้ใช้กดปิดเอง
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
            editingData={editingData}
            onEditSubmit={handleEditSubmit}
        />
    )
}
