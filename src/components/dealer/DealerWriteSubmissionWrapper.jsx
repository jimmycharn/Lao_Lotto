import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { updatePendingDeduction, checkDealerCreditForBet } from '../../utils/creditCheck'
import { generateUUID } from '../../constants/lotteryTypes'
import { fetchNumberLimits, fetchCurrentTotals, checkBatchSubmissions, generateLimitWarnings } from '../../utils/numberLimits'
import WriteSubmissionModal from '../WriteSubmissionModal'

/**
 * Wrapper component that uses the numpad-style WriteSubmissionModal
 * but handles the dealer-specific logic for saving submissions
 */
export default function DealerWriteSubmissionWrapper({
    round,
    targetUser,
    dealerId,
    allMembers = [],
    onMemberChange,
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
            '4_top': 25, '4_set': 25, '4_float': 15,
            '5_float': 15
        }
        return defaults[betType] || 15
    }

    // Handle submission from WriteSubmissionModal
    async function handleWriteSubmit({ entries, billNote, isPaid }) {
        if (!entries || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Permission is now controlled by user's dealerCanSubmit setting (enforced at UI layer in RoundAccordionItem).

        // Calculate total amount
        const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0)

        // Check dealer credit before saving
        const creditCheck = await checkDealerCreditForBet(dealerId, round.id, totalAmount)
        if (!creditCheck.allowed) {
            throw new Error(creditCheck.message)
        }

        // Check number limits
        const [numberLimits, currentTotals] = await Promise.all([
            fetchNumberLimits(round.id),
            fetchCurrentTotals(round.id)
        ])

        const limitLines = entries.map(e => ({
            betType: e.betType || e.bet_type,
            numbers: e.numbers,
            amount: e.amount
        }))
        const limitResults = checkBatchSubmissions(numberLimits, currentTotals, limitLines)

        // Block all blocked entries (เลขปิด — reject entire submission if any blocked number found)
        const blockedEntries = limitResults.filter(r => r.status === 'blocked')
        if (blockedEntries.length > 0) {
            const blockedDetails = [...new Set(blockedEntries.map(r => {
                const limitAmt = r.maxAllowed || 0
                const currentAmt = r.currentTotal || 0
                if (currentAmt >= limitAmt) {
                    return `${r.numbers} (ปิดรับแล้ว)`
                }
                return `${r.numbers} (รับได้อีก ${Math.max(limitAmt - currentAmt, 0).toLocaleString()} จาก ${limitAmt.toLocaleString()})`
            }))]
            throw new Error(`🔴 เลขปิด: ${blockedDetails.join(', ')} — ไม่สามารถรับได้`)
        }

        // Show warnings for limited/overflow entries
        const warnings = generateLimitWarnings(limitResults)
        if (warnings && warnings.length > 0) {
            warnings.forEach(w => toast.warning(w))
        }

        const billId = generateUUID()
        const baseTimestamp = new Date()

        // Transform entries to submissions format
        // Note: WriteSubmissionModal ส่ง betType (camelCase) แต่ database ใช้ bet_type (snake_case)
        const inserts = entries.map((entry, index) => {
            const betType = entry.betType || entry.bet_type  // รองรับทั้ง camelCase และ snake_case
            const commissionRate = getCommissionRate(betType)
            const isSetBet = betType === '4_set'
            let commissionAmount
            if (isSetBet) {
                const setPrice = userSettings?.lottery_settings?.[round.lottery_type]?.['4_set']?.setPrice || round?.set_prices?.['4_top'] || 120
                const numSets = Math.floor((entry.amount || 0) / setPrice)
                commissionAmount = numSets * commissionRate
            } else {
                commissionAmount = (entry.amount * commissionRate) / 100
            }
            
            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            // Get limit check result for this entry
            const lr = limitResults[index]
            const isOverflow = lr && (lr.status === 'overflow' || (lr.status === 'blocked' && lr.remaining > 0))
            const overflowAmount = lr ? lr.overflow : 0
            const actualPayoutPercent = lr ? lr.payoutPercent : 100

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
                is_paid: isPaid || false,
                submitted_by: dealerId,
                submitted_by_type: 'dealer',
                created_at: entryTimestamp,
                is_overflow: isOverflow,
                overflow_amount: overflowAmount,
                actual_payout_percent: actualPayoutPercent
            }
        })

        const { error, data: insertedData } = await supabase.from('submissions').insert(inserts).select()
        if (error) throw error

        // Verify all entries were inserted
        const expectedCount = inserts.length
        const actualCount = insertedData?.length || 0
        if (actualCount < expectedCount) {
            console.error(`[PARTIAL INSERT] Expected ${expectedCount} rows but only ${actualCount} were inserted. Bill: ${billId}`)
            toast.warning(`⚠️ บันทึกได้ ${actualCount}/${expectedCount} รายการ กรุณาตรวจสอบ`)
        }

        // Update pending deduction in background
        if (dealerId) {
            updatePendingDeduction(dealerId).catch(err => {
                console.error('Background pending deduction update failed:', err)
            })
        }

        toast.success(`บันทึกโพยให้ ${targetUser.full_name || targetUser.email} สำเร็จ! (${actualCount} รายการ)`)
        
        if (onSuccess) onSuccess()
        // ไม่ปิด modal หลังบันทึก - ให้ผู้ใช้กดปิดเอง
    }

    // Handle edit submission from WriteSubmissionModal
    async function handleEditSubmit({ entries, billNote, isPaid, originalBillId, originalItems }) {
        if (!entries || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Permission is now controlled by user's dealerCanSubmit setting (enforced at UI layer in RoundAccordionItem).

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

        // Check number limits (after soft delete so totals are recalculated)
        const [numberLimits, currentTotals] = await Promise.all([
            fetchNumberLimits(round.id),
            fetchCurrentTotals(round.id)
        ])

        const limitLines = entries.map(e => ({
            betType: e.betType || e.bet_type,
            numbers: e.numbers,
            amount: e.amount
        }))
        const limitResults = checkBatchSubmissions(numberLimits, currentTotals, limitLines)

        // Block all blocked entries (เลขปิด — reject entire submission if any blocked number found)
        const blockedEntries = limitResults.filter(r => r.status === 'blocked')
        if (blockedEntries.length > 0) {
            const blockedDetails = [...new Set(blockedEntries.map(r => {
                const limitAmt = r.maxAllowed || 0
                const currentAmt = r.currentTotal || 0
                if (currentAmt >= limitAmt) {
                    return `${r.numbers} (ปิดรับแล้ว)`
                }
                return `${r.numbers} (รับได้อีก ${Math.max(limitAmt - currentAmt, 0).toLocaleString()} จาก ${limitAmt.toLocaleString()})`
            }))]
            throw new Error(`🔴 เลขปิด: ${blockedDetails.join(', ')} — ไม่สามารถรับได้`)
        }

        // Show warnings for limited/overflow entries
        const warnings = generateLimitWarnings(limitResults)
        if (warnings && warnings.length > 0) {
            warnings.forEach(w => toast.warning(w))
        }

        const billId = originalBillId || generateUUID()
        // Use original created_at so editing doesn't extend the delete/edit deadline
        const originalCreatedAt = originalItems?.[0]?.created_at
        const baseTimestamp = originalCreatedAt ? new Date(originalCreatedAt) : new Date()

        // Transform entries to submissions format
        const inserts = entries.map((entry, index) => {
            const betType = entry.betType || entry.bet_type
            const commissionRate = getCommissionRate(betType)
            const isSetBet = betType === '4_set'
            let commissionAmount
            if (isSetBet) {
                const setPrice = userSettings?.lottery_settings?.[round.lottery_type]?.['4_set']?.setPrice || round?.set_prices?.['4_top'] || 120
                const numSets = Math.floor((entry.amount || 0) / setPrice)
                commissionAmount = numSets * commissionRate
            } else {
                commissionAmount = (entry.amount * commissionRate) / 100
            }
            
            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            // Get limit check result for this entry
            const lr = limitResults[index]
            const isOverflow = lr && (lr.status === 'overflow' || (lr.status === 'blocked' && lr.remaining > 0))
            const overflowAmount = lr ? lr.overflow : 0
            const actualPayoutPercent = lr ? lr.payoutPercent : 100

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
                is_paid: isPaid || false,
                submitted_by: dealerId,
                submitted_by_type: 'dealer',
                created_at: entryTimestamp,
                is_overflow: isOverflow,
                overflow_amount: overflowAmount,
                actual_payout_percent: actualPayoutPercent
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

    // Build bonusSettings from userSettings for this lottery type
    // Maps settings keys to submission bet types (e.g. 3_straight → 3_top for Lao/Hanoi)
    const bonusSettings = (() => {
        const tabSettings = userSettings?.lottery_settings?.[lotteryKey]
        if (!tabSettings?.bonusEnabled) return null
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryKey)
        // Reverse map: settings key → submission bet type
        const REVERSE_LAO_MAP = { '3_straight': '3_top', '3_tod_single': '3_tod' }
        const betTypeBonus = {}
        Object.entries(tabSettings).forEach(([key, val]) => {
            if (key === 'bonusEnabled' || key === '4_set' || typeof val !== 'object') return
            if (val.bonus && val.bonus > 0) {
                betTypeBonus[key] = val.bonus
                // Also map to submission bet type key for Lao/Hanoi
                if (isLaoOrHanoi && REVERSE_LAO_MAP[key]) {
                    betTypeBonus[REVERSE_LAO_MAP[key]] = val.bonus
                }
            }
        })
        if (Object.keys(betTypeBonus).length === 0) return null
        return { bonusEnabled: true, betTypeBonus }
    })()

    return (
        <WriteSubmissionModal
            isOpen={true}
            onClose={onClose}
            onSubmit={handleWriteSubmit}
            roundInfo={{ 
                name: `${round.lottery_name || round.lottery_type}` 
            }}
            currencySymbol={round.currency_symbol || '฿'}
            lotteryType={round.lottery_type}
            setPrice={setPrice}
            editingData={editingData}
            onEditSubmit={handleEditSubmit}
            allMembers={allMembers}
            selectedMember={targetUser}
            onMemberChange={onMemberChange}
            isDealerMode={true}
            bonusSettings={bonusSettings}
        />
    )
}
