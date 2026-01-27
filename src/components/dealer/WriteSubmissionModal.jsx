import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { updatePendingDeduction, checkDealerCreditForBet } from '../../utils/creditCheck'
import {
    FiPlus,
    FiTrash2,
    FiCheck,
    FiX,
    FiFileText
} from 'react-icons/fi'
import {
    LOTTERY_TYPES,
    BET_TYPES_WITH_DIGITS as BET_TYPES,
    BET_TYPES_BY_LOTTERY,
    getPermutations,
    getUnique3DigitPermsFrom4,
    getUnique3DigitPermsFrom5,
    generateUUID
} from '../../constants/lotteryTypes'

export default function WriteSubmissionModal({ 
    round, 
    targetUser, // The user we're writing bets for
    dealerId,   // The dealer who is writing the bets
    onClose, 
    onSuccess 
}) {
    const { toast } = useToast()
    const numberInputRef = useRef(null)
    const amountInputRef = useRef(null)
    const audioContextRef = useRef(null)

    const [submitForm, setSubmitForm] = useState({
        bet_type: '2_top',
        numbers: '',
        amount: ''
    })
    const [drafts, setDrafts] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [billNote, setBillNote] = useState('')
    const [userSettings, setUserSettings] = useState(null)
    const [isReversed, setIsReversed] = useState(false) // Toggle for 2-digit reversed bets
    const [showPasteModal, setShowPasteModal] = useState(false)
    const [pasteText, setPasteText] = useState('')
    const [lastClickedBetType, setLastClickedBetType] = useState(null) // Track last clicked bet type button
    const [showCloseConfirm, setShowCloseConfirm] = useState(false) // Confirm before closing modal

    // Play sound when adding to draft
    function playAddSound() {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
            }
            const ctx = audioContextRef.current
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)
            oscillator.frequency.value = 800
            oscillator.type = 'sine'
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + 0.1)
        } catch (e) {
            console.log('Audio not supported')
        }
    }

    useEffect(() => {
        if (targetUser?.id && dealerId) {
            fetchUserSettings()
        }
        // Focus on number input when modal opens
        setTimeout(() => numberInputRef.current?.focus(), 100)
    }, [targetUser?.id, dealerId])

    async function fetchUserSettings() {
        try {
            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', targetUser.id)
                .eq('dealer_id', dealerId)
                .single()
            setUserSettings(data)
        } catch (error) {
            console.log('No user settings found, using defaults')
        }
    }

    function getCommissionForBetType(betType, settings = userSettings) {
        const lotteryKey = round.lottery_type === 'lao' ? 'lao' : round.lottery_type === 'hanoi' ? 'hanoi' : 'thai'
        
        // Map bet_type to settings key for Lao/Hanoi lottery
        let settingsKey = betType
        if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',      // 3 ตัวตรง
                '3_tod': '3_tod_single',    // 3 ตัวโต๊ด
                '4_top': '4_set'            // 4 ตัวตรง (ชุด)
            }
            settingsKey = LAO_BET_TYPE_MAP[betType] || betType
        }
        
        const betSettings = settings?.lottery_settings?.[lotteryKey]?.[settingsKey]
        if (betSettings?.commission !== undefined) {
            return { rate: betSettings.commission, isFixed: betSettings.isFixed || false }
        }

        // Default rates for Lao/Hanoi set-based bets
        if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
            const LAO_SET_DEFAULTS = {
                '4_top': { commission: 25, isFixed: true },
                '4_set': { commission: 25, isFixed: true }
            }
            if (LAO_SET_DEFAULTS[betType]) {
                return { rate: LAO_SET_DEFAULTS[betType].commission, isFixed: true }
            }
        }

        // Default commission rates (percentage)
        const DEFAULT_COMMISSIONS = {
            '2_top': 15, '2_bottom': 15, '2_front': 15, '2_spread': 15,
            '3_top': 15, '3_tod': 15, '3_bottom': 15,
            'run_top': 15, 'run_bottom': 15
        }
        return { rate: DEFAULT_COMMISSIONS[betType] || 15, isFixed: false }
    }

    function addToDraft(betType) {
        const cleanNumbers = submitForm.numbers.replace(/\*/g, '')
        const amountStr = submitForm.amount.toString()

        if (!cleanNumbers) {
            toast.error('กรุณากรอกตัวเลข')
            return
        }
        
        // Track last clicked bet type for highlighting
        setLastClickedBetType(betType)

        // Parse amount - handle "100*50" format
        let amountParts = amountStr.split('*').map(p => parseFloat(p) || 0)
        let totalAmount = amountParts[0]

        // For 4-digit set bets on Lao/Hanoi, amount can be empty (uses set price)
        const isSetBet = betType === '4_set'
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
        if (isSetBet && isLaoOrHanoi && !totalAmount) {
            totalAmount = round.set_prices?.['4_top'] || 120
        }

        if (!totalAmount && !isSetBet) {
            toast.error('กรุณากรอกจำนวนเงิน')
            return
        }

        const entryId = generateUUID()
        const timestamp = new Date().toISOString()
        const newDrafts = []

        // Determine display label
        let displayLabel = BET_TYPES[betType]?.label || betType

        if (betType === '3_perm_from_3') {
            const permCount = getPermutations(cleanNumbers).length
            displayLabel = `คูณชุด ${permCount}`
        } else if (betType === '3_perm_from_4') {
            const permCount = getUnique3DigitPermsFrom4(cleanNumbers).length
            displayLabel = `3 X ${permCount}`
        } else if (betType === '3_perm_from_5') {
            const permCount = getUnique3DigitPermsFrom5(cleanNumbers).length
            displayLabel = `3 X ${permCount}`
        } else if (betType === '3_straight_tod') {
            displayLabel = 'เต็ง-โต๊ด'
        } else if (betType === '3_straight_perm') {
            const permCount = getPermutations(cleanNumbers).length
            displayLabel = `1+กลับ (${permCount - 1})`
        } else if (betType === 'run_top') {
            displayLabel = 'วิ่งบน'
        } else if (betType === 'run_bottom') {
            displayLabel = 'วิ่งล่าง'
        } else if (betType === 'front_top_1') {
            displayLabel = 'หน้าบน'
        } else if (betType === 'middle_top_1') {
            displayLabel = 'กลางบน'
        } else if (betType === 'back_top_1') {
            displayLabel = 'หลังบน'
        } else if (betType === 'front_bottom_1') {
            displayLabel = 'หน้าล่าง'
        } else if (betType === 'back_bottom_1') {
            displayLabel = 'หลังล่าง'
        } else if (betType === '2_top') {
            displayLabel = '2 ตัวบน'
        } else if (betType === '2_bottom') {
            displayLabel = '2 ตัวล่าง'
        } else if (betType === '2_have') {
            displayLabel = '2 มี'
        } else if (betType === '2_front') {
            displayLabel = '2 ตัวหน้า'
        } else if (betType === '2_spread') {
            displayLabel = '2 ตัวถ่าง'
        } else if (betType === '2_top_rev') {
            displayLabel = '2 ตัวบนกลับ'
        } else if (betType === '2_bottom_rev') {
            displayLabel = '2 ตัวล่างกลับ'
        } else if (betType === '2_front_rev') {
            displayLabel = '2 ตัวหน้ากลับ'
        } else if (betType === '2_spread_rev') {
            displayLabel = '2 ตัวถ่างกลับ'
        } else if (betType === '3_top') {
            // หวยไทย: 3 ตัวบน, หวยลาว/ฮานอย: 3 ตัวตรง
            const isLaoHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
            displayLabel = isLaoHanoi ? '3 ตัวตรง' : '3 ตัวบน'
        } else if (betType === '3_tod') {
            displayLabel = '3 ตัวโต๊ด'
        } else if (betType === '3_bottom') {
            displayLabel = '3 ตัวล่าง'
        } else if (betType === '4_set') {
            displayLabel = '4 ตัวชุด'
        } else if (betType === '4_float') {
            displayLabel = '4 ตัวลอย'
        } else if (betType === '5_float') {
            displayLabel = '5 ตัวลอย'
        }

        // Handle different bet types
        if (betType === '3_perm_from_4' || betType === '3_perm_from_5' || betType === '3_perm_from_3') {
            let perms = []
            if (betType === '3_perm_from_4') perms = getUnique3DigitPermsFrom4(cleanNumbers)
            else if (betType === '3_perm_from_5') perms = getUnique3DigitPermsFrom5(cleanNumbers)
            else if (betType === '3_perm_from_3') perms = getPermutations(cleanNumbers)

            const commInfo = getCommissionForBetType('3_top')
            // คำนวณค่าคอมต่อ 1 รายการ (totalAmount * rate / 100)
            const commissionPerItem = commInfo.isFixed ? commInfo.rate : (totalAmount * commInfo.rate) / 100
            
            perms.forEach(p => {
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: p,
                    amount: totalAmount,
                    commission_rate: commInfo.rate,
                    commission_amount: commissionPerItem,
                    display_numbers: cleanNumbers,
                    display_amount: `${totalAmount} (${perms.length} ชุด)`,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            })
        } else if (betType === '3_straight_tod') {
            // เต็ง-โต๊ด: ถ้าไม่มี * ใช้จำนวนเงินเดียวกันสำหรับทั้ง 3 ตัวบนและ 3 ตัวโต๊ด
            // ถ้ามี * ใช้จำนวนเงินแรกสำหรับ 3 ตัวบน และจำนวนเงินที่สองสำหรับ 3 ตัวโต๊ด
            const hasStarInAmount = amountStr.includes('*')
            let straightAmt, todAmt
            if (hasStarInAmount && amountParts.length === 2) {
                straightAmt = amountParts[0]
                todAmt = amountParts[1]
            } else {
                // ไม่มี * - ใช้จำนวนเงินเดียวกันทั้ง 2 ประเภท
                straightAmt = totalAmount
                todAmt = totalAmount
            }
            
            if (straightAmt > 0) {
                const commInfo = getCommissionForBetType('3_top')
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (todAmt > 0) {
                const commInfo = getCommissionForBetType('3_tod')
                const sortedNumbers = cleanNumbers.split('').sort().join('')
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_tod',
                    numbers: sortedNumbers,
                    amount: todAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (todAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
        } else if (betType === '3_straight_perm') {
            const [straightAmt, permAmt] = amountParts
            const perms = getPermutations(cleanNumbers).filter(p => p !== cleanNumbers)

            if (straightAmt > 0) {
                const commInfo = getCommissionForBetType('3_top')
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (permAmt > 0 && perms.length > 0) {
                const commInfo = getCommissionForBetType('3_top')
                perms.forEach(p => {
                    newDrafts.push({
                        entry_id: entryId,
                        bet_type: '3_top',
                        numbers: p,
                        amount: permAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (permAmt * commInfo.rate) / 100,
                        display_numbers: cleanNumbers,
                        display_amount: submitForm.amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                })
            }
        } else if (betType === '4_set') {
            // 4 ตัวชุด for Lao/Hanoi - same logic as UserDashboard
            // Get set price from user_settings (targetUser's settings), fallback to round.set_prices, then default 120
            const lotteryKey = round.lottery_type === 'lao' ? 'lao' : round.lottery_type === 'hanoi' ? 'hanoi' : 'thai'
            const userSetPrice = userSettings?.lottery_settings?.[lotteryKey]?.['4_set']?.setPrice
            const setPrice = userSetPrice || round.set_prices?.['4_top'] || 120
            
            // amount field = number of sets (default: 1 if empty)
            // Use submitForm.amount directly as set count, not totalAmount
            const setCount = parseInt(submitForm.amount) || 1
            const finalAmount = setCount * setPrice
            const commInfo = getCommissionForBetType('4_top')

            newDrafts.push({
                entry_id: entryId,
                bet_type: '4_set',
                numbers: cleanNumbers,
                amount: finalAmount,
                commission_rate: commInfo.rate,
                commission_amount: setCount * commInfo.rate,
                display_numbers: cleanNumbers,
                display_amount: `${finalAmount} บาท (${setCount} ชุด)`,
                display_bet_type: '4 ตัวชุด',
                created_at: timestamp
            })
        } else if (betType.includes('_rev')) {
            // กลับ (2 หลัก): สร้างทั้งเลขต้นฉบับและเลขกลับ
            // ถ้าไม่มี * ใช้จำนวนเงินเดียวกันสำหรับทั้ง 2 รายการ
            // ถ้ามี * ใช้จำนวนเงินแรกสำหรับเลขต้นฉบับ และจำนวนเงินที่สองสำหรับเลขกลับ
            const baseBetType = betType.replace('_rev', '')
            const reversedNumbers = cleanNumbers.split('').reverse().join('')
            const hasStarInAmount = amountStr.includes('*')
            
            let amt1, amt2
            if (hasStarInAmount && amountParts.length === 2) {
                amt1 = amountParts[0]
                amt2 = amountParts[1]
            } else {
                // ไม่มี * - ใช้จำนวนเงินเดียวกันทั้ง 2 เลข
                amt1 = totalAmount
                amt2 = totalAmount
            }

            // เลขต้นฉบับกับจำนวนเงินแรก
            if (amt1 > 0) {
                const commInfo = getCommissionForBetType(baseBetType)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt1,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt1 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            
            // เลขกลับกับจำนวนเงินที่สอง (ถ้าเลขไม่เหมือนกัน เช่น 12 → 21)
            if (amt2 > 0 && reversedNumbers !== cleanNumbers) {
                const commInfo = getCommissionForBetType(baseBetType)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: reversedNumbers,
                    amount: amt2,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt2 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            } else if (amt2 > 0 && reversedNumbers === cleanNumbers) {
                // เลขเหมือนกัน (เช่น 11, 22) - เพิ่มจำนวนเงินที่สองให้เลขเดิม
                const commInfo = getCommissionForBetType(baseBetType)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt2,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt2 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
        } else {
            // Normal single bet
            const commInfo = getCommissionForBetType(betType)
            newDrafts.push({
                entry_id: entryId,
                bet_type: betType,
                numbers: cleanNumbers,
                amount: totalAmount,
                commission_rate: commInfo.rate,
                commission_amount: commInfo.isFixed ? commInfo.rate : (totalAmount * commInfo.rate) / 100,
                display_numbers: cleanNumbers,
                display_amount: submitForm.amount.toString(),
                display_bet_type: displayLabel,
                created_at: timestamp
            })
        }

        setDrafts([...drafts, ...newDrafts])
        playAddSound() // Play sound feedback
        // ไม่เคลียร์ช่องป้อน แต่ให้ select all เพื่อรอป้อนเลขรายการถัดไป
        if (numberInputRef.current) {
            numberInputRef.current.focus()
            numberInputRef.current.select()
        }
    }

    // Handle paste numbers for 4-digit sets (Lao/Hanoi)
    function handlePasteNumbers() {
        if (!pasteText.trim()) {
            toast.warning('กรุณาวางข้อมูลก่อน')
            return
        }

        const isLaoOrHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
        if (!isLaoOrHanoi) {
            toast.warning('ฟีเจอร์นี้ใช้ได้เฉพาะหวยลาว และ หวยฮานอย')
            return
        }

        const lotteryKey = round.lottery_type
        const userSetPrice = userSettings?.lottery_settings?.[lotteryKey]?.['4_set']?.setPrice
        const setPrice = userSetPrice || round.set_prices?.['4_top'] || 120
        const commInfo = getCommissionForBetType('4_top')
        const commissionPerSet = commInfo.rate

        const lines = pasteText.split('\n')
        const newDrafts = []
        const timestamp = new Date().toISOString()
        let addedCount = 0

        lines.forEach(line => {
            const matches = line.match(/\d{4}/g)
            if (matches) {
                matches.forEach(numbers => {
                    const entryId = generateUUID()
                    newDrafts.push({
                        entry_id: entryId,
                        bet_type: '4_set',
                        numbers: numbers,
                        amount: setPrice,
                        commission_rate: commissionPerSet,
                        commission_amount: commissionPerSet,
                        display_numbers: numbers,
                        display_amount: `${setPrice} บาท (1 ชุด)`,
                        display_bet_type: '4 ตัวชุด',
                        created_at: timestamp
                    })
                    addedCount++
                })
            }
        })

        if (newDrafts.length > 0) {
            setDrafts(prev => [...prev, ...newDrafts])
            setShowPasteModal(false)
            setPasteText('')
            playAddSound()
            toast.success(`เพิ่ม ${addedCount} รายการสำเร็จ`)
        } else {
            toast.warning('ไม่พบเลข 4 ตัวในข้อความ')
        }
    }

    function removeDraft(entryId) {
        setDrafts(drafts.filter(d => d.entry_id !== entryId))
    }

    async function handleSubmit() {
        if (drafts.length === 0) {
            toast.error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ')
            return
        }

        setSubmitting(true)
        try {
            // Calculate total amount of new bets
            const totalNewAmount = drafts.reduce((sum, d) => sum + (d.amount || 0), 0)
            
            // Check dealer credit before saving
            const creditCheck = await checkDealerCreditForBet(dealerId, round.id, totalNewAmount)
            console.log('Credit check result:', creditCheck)
            
            if (!creditCheck.allowed) {
                toast.error(creditCheck.message)
                setSubmitting(false)
                return
            }

            const billId = generateUUID()
            const timestamp = new Date().toISOString()

            const inserts = drafts.map(d => ({
                ...d,
                round_id: round.id,
                user_id: targetUser.id,
                bill_id: billId,
                bill_note: billNote || null,
                is_deleted: false,
                // Track who submitted: dealer submitted on behalf of user
                submitted_by: dealerId,
                submitted_by_type: 'dealer'
            }))

            const { error } = await supabase.from('submissions').insert(inserts)
            if (error) throw error

            // Show success immediately - don't wait for pending deduction update
            toast.success(`บันทึกโพยให้ ${targetUser.full_name || targetUser.email} สำเร็จ!`)

            // Update pending deduction in background (non-blocking)
            if (dealerId) {
                console.log('=== WriteSubmissionModal Credit Update (async) ===')
                // Don't await - let it run in background
                updatePendingDeduction(dealerId).then(() => {
                    console.log('WriteSubmissionModal: updatePendingDeduction completed (background)')
                }).catch(err => {
                    console.error('Background pending deduction update failed:', err)
                })
            }
            setDrafts([])
            setBillNote('')
            if (onSuccess) onSuccess()
            onClose()
        } catch (error) {
            console.error('Error saving bets:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Get available bet types based on number of digits
    function getAvailableBetTypes() {
        const digits = submitForm.numbers.replace(/\*/g, '').length
        const amount = submitForm.amount.toString()
        const hasStarInAmount = amount.includes('*')
        const lotteryType = round.lottery_type
        const isAmountEmpty = !amount || amount === '0' || amount === ''
        
        const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
        
        let available = []

        // 1. ป้อนเลข 1 ตัว - ใช้ทั้งหวยไทย ลาว ฮานอย
        if (digits === 1) {
            // ถ้าช่องจำนวนเงินว่าง ไม่แสดงปุ่ม
            if (!isAmountEmpty) {
                available = [
                    { id: 'run_top', label: 'วิ่งบน' },
                    { id: 'run_bottom', label: 'วิ่งล่าง' },
                    { id: 'front_top_1', label: 'หน้าบน' },
                    { id: 'middle_top_1', label: 'กลางบน' },
                    { id: 'back_top_1', label: 'หลังบน' },
                    { id: 'front_bottom_1', label: 'หน้าล่าง' },
                    { id: 'back_bottom_1', label: 'หลังล่าง' }
                ]
            }
        }
        // 2. ป้อนเลข 2 ตัว - ใช้ทั้งหวยไทย ลาว ฮานอย
        else if (digits === 2) {
            // ถ้าช่องจำนวนเงินว่าง ไม่แสดงปุ่ม
            if (!isAmountEmpty) {
                if (hasStarInAmount && amtParts.length === 2) {
                    // มีเครื่องหมาย * เช่น 100*100
                    available = [
                        { id: '2_top_rev', label: '2 ตัวบนกลับ' },
                        { id: '2_front_rev', label: '2 ตัวหน้ากลับ' },
                        { id: '2_spread_rev', label: '2 ตัวถ่างกลับ' },
                        { id: '2_bottom_rev', label: '2 ตัวล่างกลับ' }
                    ]
                } else if (amtParts.length === 1 && !hasStarInAmount) {
                    // ตัวเลขอย่างเดียวเช่น 100
                    if (isReversed) {
                        available = [
                            { id: '2_top_rev', label: '2 ตัวบนกลับ' },
                            { id: '2_front_rev', label: '2 ตัวหน้ากลับ' },
                            { id: '2_spread_rev', label: '2 ตัวถ่างกลับ' },
                            { id: '2_bottom_rev', label: '2 ตัวล่างกลับ' }
                        ]
                    } else {
                        available = [
                            { id: '2_top', label: '2 ตัวบน' },
                            { id: '2_bottom', label: '2 ตัวล่าง' },
                            { id: '2_have', label: '2 มี' },
                            { id: '2_front', label: '2 ตัวหน้า' },
                            { id: '2_spread', label: '2 ตัวถ่าง' }
                        ]
                    }
                }
            }
        }
        // 3. ป้อนเลข 3 ตัว - ใช้ทั้งหวยไทย ลาว ฮานอย
        else if (digits === 3) {
            // ถ้าช่องจำนวนเงินว่าง ไม่แสดงปุ่ม
            if (!isAmountEmpty) {
                if (hasStarInAmount && amtParts.length === 2) {
                    // มีเครื่องหมาย * เช่น 100*100
                    const permCount = getPermutations(submitForm.numbers).length
                    available = [
                        { id: '3_straight_tod', label: 'เต็ง-โต๊ด' },
                        { id: '3_straight_perm', label: `1+กลับ (${permCount - 1})` }
                    ]
                } else if (amtParts.length === 1 && !hasStarInAmount) {
                    // ตัวเลขอย่างเดียวเช่น 100
                    const permCount = getPermutations(submitForm.numbers).length
                    const isLaoHanoi = ['lao', 'hanoi'].includes(lotteryType)
                    available = [
                        { id: '3_perm_from_3', label: `คูณชุด ${permCount}` },
                        { id: '3_straight_tod', label: 'เต็ง-โต๊ด' },
                        { id: '3_top', label: isLaoHanoi ? '3 ตัวตรง' : '3 ตัวบน' },
                        { id: '3_tod', label: '3 ตัวโต๊ด' }
                    ]
                    if (lotteryType === 'thai') {
                        available.push({ id: '3_bottom', label: '3 ตัวล่าง' })
                    }
                }
            }
        }
        // 4. ป้อนเลข 4 ตัว - หวยไทย ลาว ฮานอย
        else if (digits === 4) {
            const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
            
            if (isLaoOrHanoi) {
                // หวยลาว ฮานอย
                // ถ้าว่างทั้ง 2 ช่องจะไม่แสดงปุ่ม
                if (submitForm.numbers && !isAmountEmpty) {
                    const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                    available = [
                        '4_set',
                        '4_float',
                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                    ]
                } else if (submitForm.numbers && isAmountEmpty) {
                    // ช่องจำนวนเงินว่าง แสดงเฉพาะ "4 ตัวชุด"
                    available = ['4_set']
                }
            } else {
                // หวยไทย
                // ถ้าช่องจำนวนเงินว่าง ไม่แสดงปุ่ม
                if (!isAmountEmpty) {
                    const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                    available = [
                        '4_float',
                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                    ]
                }
            }
        }
        // 5. ป้อนเลข 5 ตัว - หวยไทย ลาว ฮานอย
        else if (digits === 5) {
            // ถ้าช่องจำนวนเงินว่าง ไม่แสดงปุ่ม
            if (!isAmountEmpty) {
                const permCount = getUnique3DigitPermsFrom5(submitForm.numbers).length
                available = [
                    '5_float',
                    { id: '3_perm_from_5', label: `3 X ${permCount}` }
                ]
            }
        }

        return available
    }

    const totalAmount = drafts.reduce((sum, d) => sum + d.amount, 0)
    const totalCommission = drafts.reduce((sum, d) => sum + (d.commission_amount || 0), 0)

    // Handle close with confirmation if there are drafts
    function handleCloseAttempt() {
        if (drafts.length > 0) {
            setShowCloseConfirm(true)
        } else {
            onClose()
        }
    }

    return (
        <>
        <div className="modal-overlay" onClick={handleCloseAttempt}>
            <div className="modal submission-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <div className="header-title">
                        <h3><FiFileText /> เขียนโพยให้ {targetUser?.full_name || targetUser?.email}</h3>
                    </div>
                    <button className="modal-close" onClick={handleCloseAttempt}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Round Info */}
                    <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                        งวด: {round.lottery_name || LOTTERY_TYPES[round.lottery_type]} ({round.round_date})
                    </p>

                    {/* Bill Note Input */}
                    <div className="bill-note-section" style={{ marginBottom: '1rem' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ชื่อผู้ซื้อ / บันทึกช่วยจำ (ไม่บังคับ)"
                            value={billNote}
                            onChange={e => setBillNote(e.target.value)}
                        />
                    </div>

                    {/* Input Section */}
                    <div className="input-section card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                        {/* Action Buttons - วางเลข และ บันทึกโพย */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            {['lao', 'hanoi'].includes(round.lottery_type) && (
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setShowPasteModal(true)}
                                    style={{ flex: 1 }}
                                >
                                    <FiPlus style={{ marginRight: '0.25rem' }} /> วางเลข
                                </button>
                            )}
                            <button
                                type="button"
                                className={`btn ${drafts.length > 0 ? 'btn-primary' : 'btn-outline'} btn-sm`}
                                onClick={handleSubmit}
                                disabled={drafts.length === 0 || submitting}
                                style={{ flex: 1 }}
                            >
                                <FiCheck style={{ marginRight: '0.25rem' }} /> บันทึกโพย ({drafts.length})
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">ตัวเลข</label>
                                <input
                                    ref={numberInputRef}
                                    type="text"
                                    className="form-input"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="ป้อนตัวเลข"
                                    value={submitForm.numbers}
                                    onChange={e => {
                                        // Only allow digits (0-9)
                                        const newNumbers = e.target.value.replace(/[^\d]/g, '')
                                        const digits = newNumbers.length
                                        const isLaoOrHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
                                        
                                        // Reset last clicked bet type when numbers change
                                        setLastClickedBetType(null)
                                        
                                        // For Lao/Hanoi: clear amount when entering 4+ digits
                                        if (isLaoOrHanoi && digits >= 4) {
                                            setSubmitForm({
                                                ...submitForm,
                                                numbers: newNumbers,
                                                amount: ''
                                            })
                                        } else {
                                            setSubmitForm({
                                                ...submitForm,
                                                numbers: newNumbers
                                            })
                                        }
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            amountInputRef.current?.focus()
                                            amountInputRef.current?.select()
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">จำนวนเงิน ({round.currency_name})</label>
                                <input
                                    ref={amountInputRef}
                                    type="text"
                                    className="form-input"
                                    inputMode="numeric"
                                    pattern="[0-9*]*"
                                    placeholder="0"
                                    value={submitForm.amount}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                        let value = e.target.value
                                        const digits = submitForm.numbers.replace(/\*/g, '').length
                                        
                                        // สำหรับ 1, 4, 5 หลัก - รับเฉพาะตัวเลขเท่านั้น ไม่รับ * หรือเครื่องหมายอื่น
                                        if (digits === 1 || digits === 4 || digits === 5 || digits === 0) {
                                            value = value.replace(/[^\d]/g, '')
                                        } else {
                                            // สำหรับ 2, 3 หลัก - รับตัวเลขและ * (แปลงจาก space, -, ., ,)
                                            value = value.replace(/[ \-.,]/g, '*')
                                            value = value.replace(/[^\d*]/g, '')
                                            value = value.replace(/^\*+/, '')
                                            // อนุญาตให้มี * ได้แค่ 1 ตัว
                                            const starCount = (value.match(/\*/g) || []).length
                                            if (starCount > 1) {
                                                const firstStarIndex = value.indexOf('*')
                                                value = value.substring(0, firstStarIndex + 1) + value.substring(firstStarIndex + 1).replace(/\*/g, '')
                                            }
                                        }
                                        setSubmitForm({ ...submitForm, amount: value })
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            const digits = submitForm.numbers.replace(/\*/g, '').length
                                            if (digits === 2) addToDraft('2_top')
                                            else if (digits === 3) addToDraft('3_top')
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Bet Type Buttons */}
                        <div className="bet-type-selection">
                            <label className="form-label">เลือกประเภท</label>
                            {(() => {
                                const digits = submitForm.numbers.replace(/\*/g, '').length
                                const available = getAvailableBetTypes()
                                const isLaoOrHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
                                const isAmountEmpty = !submitForm.amount || submitForm.amount === '0' || submitForm.amount === ''
                                const hasStarInAmount = submitForm.amount.includes('*')
                                
                                // ไม่แสดงอะไรถ้าไม่มีปุ่ม
                                if (available.length === 0) {
                                    return null
                                }
                                
                                // สำหรับ 2 หลัก ที่ไม่มี * ให้แสดงปุ่ม toggle "กลับ" เป็นปุ่มแรก
                                const show2DigitToggle = digits === 2 && !hasStarInAmount
                                
                                // คำนวณจำนวนปุ่มทั้งหมด (รวม toggle ถ้ามี)
                                const totalButtons = available.length + (show2DigitToggle ? 1 : 0)
                                
                                // กำหนด layout ตามจำนวนปุ่ม
                                // 2-3 ปุ่ม: 1 แถว
                                // 4 ปุ่ม: 2x2
                                // 5 ปุ่ม: 3+2
                                // 6 ปุ่ม: 3x2
                                // 7 ปุ่ม: 3+3+1
                                let gridStyle = { display: 'grid', gap: '0.5rem' }
                                if (totalButtons <= 3) {
                                    gridStyle.gridTemplateColumns = `repeat(${totalButtons}, 1fr)`
                                } else if (totalButtons === 4) {
                                    gridStyle.gridTemplateColumns = 'repeat(2, 1fr)'
                                } else if (totalButtons === 5) {
                                    gridStyle.gridTemplateColumns = 'repeat(6, 1fr)'
                                } else if (totalButtons === 6) {
                                    gridStyle.gridTemplateColumns = 'repeat(3, 1fr)'
                                } else if (totalButtons >= 7) {
                                    gridStyle.gridTemplateColumns = 'repeat(3, 1fr)'
                                }
                                
                                // Style สำหรับปุ่มแต่ละตัว
                                const buttonStyle = {
                                    fontSize: '0.9rem',
                                    minHeight: '48px',
                                    padding: '0.75rem 0.5rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    transition: 'all 0.15s ease'
                                }
                                
                                // สำหรับ 5 ปุ่ม: แถวบน 3 ปุ่ม (span 2), แถวล่าง 2 ปุ่ม (span 3)
                                const getGridSpan = (index) => {
                                    if (totalButtons === 5) {
                                        if (index < 3) return { gridColumn: 'span 2' }
                                        return { gridColumn: 'span 3' }
                                    }
                                    if (totalButtons === 7 && index === 6) {
                                        return { gridColumn: 'span 3' }
                                    }
                                    return {}
                                }
                                
                                let buttonIndex = 0
                                
                                return (
                                    <div style={gridStyle}>
                                        {/* ปุ่ม toggle กลับ/ไม่กลับ สำหรับ 2 หลัก (แสดงเป็นปุ่มแรก) */}
                                        {show2DigitToggle && (
                                            <button
                                                type="button"
                                                onClick={() => setIsReversed(!isReversed)}
                                                style={{ 
                                                    ...buttonStyle,
                                                    border: '2px solid #9b59b6',
                                                    background: isReversed ? '#9b59b6' : 'transparent',
                                                    color: isReversed ? '#fff' : '#9b59b6',
                                                    ...getGridSpan(buttonIndex++)
                                                }}
                                            >
                                                กลับ
                                            </button>
                                        )}
                                        
                                        {/* ปุ่มประเภทเลข */}
                                        {available.map((item, idx) => {
                                            const key = typeof item === 'string' ? item : item.id
                                            const label = typeof item === 'string' ? (BET_TYPES[key]?.label || key) : item.label
                                            const currentIndex = show2DigitToggle ? idx + 1 : idx
                                            const isLastClicked = lastClickedBetType === key
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    className="btn btn-outline"
                                                    onClick={() => addToDraft(key)}
                                                    style={{ 
                                                        ...buttonStyle,
                                                        border: isLastClicked ? '2px solid var(--color-primary)' : '1px solid var(--color-primary)',
                                                        background: isLastClicked ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
                                                        color: 'var(--color-primary)',
                                                        ...getGridSpan(currentIndex)
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                        </div>
                    </div>

                    {/* Drafts List */}
                    <div className="drafts-section card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 style={{ margin: 0 }}>รายการที่เลือก ({drafts.length})</h4>
                            {drafts.length > 0 && (
                                <button 
                                    className="btn btn-sm" 
                                    style={{ color: 'var(--color-danger)' }}
                                    onClick={() => setDrafts([])}
                                >
                                    ล้างทั้งหมด
                                </button>
                            )}
                        </div>

                        {drafts.length === 0 ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                ยังไม่มีรายการ
                            </div>
                        ) : (
                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <th style={{ textAlign: 'left', padding: '0.5rem' }}>เลข</th>
                                            <th style={{ textAlign: 'left', padding: '0.5rem' }}>ประเภท</th>
                                            <th style={{ textAlign: 'right', padding: '0.5rem' }}>จำนวน</th>
                                            <th style={{ width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.values(
                                            drafts.reduce((acc, d) => {
                                                const key = d.entry_id
                                                if (!acc[key]) {
                                                    acc[key] = {
                                                        entry_id: d.entry_id,
                                                        display_numbers: d.display_numbers || d.numbers,
                                                        display_bet_type: d.display_bet_type || BET_TYPES[d.bet_type]?.label,
                                                        display_amount: d.display_amount || d.amount.toString(),
                                                        totalAmount: d.amount,
                                                        items: [d]
                                                    }
                                                } else {
                                                    acc[key].totalAmount += d.amount
                                                    acc[key].items.push(d)
                                                }
                                                return acc
                                            }, {})
                                        ).map((group, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                    {group.display_numbers}
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>{group.display_bet_type}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                    {round.currency_symbol}{group.totalAmount.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ padding: '0.25rem', color: 'var(--color-danger)' }}
                                                        onClick={() => removeDraft(group.entry_id)}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Summary */}
                        {drafts.length > 0 && (
                            <div style={{ 
                                marginTop: '1rem', 
                                paddingTop: '1rem', 
                                borderTop: '1px solid var(--color-border)',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>ยอดรวม:</span>
                                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                    {round.currency_symbol}{totalAmount.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Note */}
                    <div style={{ 
                        marginTop: '1rem', 
                        padding: '0.75rem', 
                        background: 'rgba(212, 175, 55, 0.1)', 
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(212, 175, 55, 0.3)',
                        fontSize: '0.85rem'
                    }}>
                        <strong>หมายเหตุ:</strong> โพยนี้จะถูกบันทึกในชื่อของ {targetUser?.full_name || targetUser?.email} 
                        โดยระบบจะบันทึกว่าเจ้ามือเป็นผู้ป้อนข้อมูลแทน
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleCloseAttempt}>
                        ยกเลิก
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={handleSubmit}
                        disabled={submitting || drafts.length === 0}
                    >
                        {submitting ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกโพย ({drafts.length} รายการ)</>}
                    </button>
                </div>
            </div>

            {/* Paste Modal */}
            {showPasteModal && (
                <div className="modal-overlay" onClick={() => setShowPasteModal(false)} style={{ zIndex: 1001 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>วางเลข 4 ตัว</h3>
                            <button className="modal-close" onClick={() => setShowPasteModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                วางข้อความที่มีเลข 4 ตัว ระบบจะดึงเลข 4 ตัวทั้งหมดมาเพิ่มเป็น "4 ตัวชุด"
                            </p>
                            <textarea
                                className="form-input"
                                rows={6}
                                placeholder="วางข้อความที่นี่..."
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowPasteModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handlePasteNumbers}>
                                <FiPlus /> เพิ่มเลข
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Close Confirmation Modal */}
        {showCloseConfirm && (
            <div className="modal-overlay" onClick={() => setShowCloseConfirm(false)} style={{ zIndex: 1002 }}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                    <div className="modal-header">
                        <h3>ยืนยันการปิด</h3>
                        <button className="modal-close" onClick={() => setShowCloseConfirm(false)}>
                            <FiX />
                        </button>
                    </div>
                    <div className="modal-body">
                        <p style={{ textAlign: 'center', fontSize: '1rem' }}>
                            คุณมีรายการที่ยังไม่ได้บันทึก {drafts.length} รายการ
                        </p>
                        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                            ต้องการปิดหน้าต่างนี้หรือไม่?
                        </p>
                    </div>
                    <div className="modal-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={() => setShowCloseConfirm(false)}>
                            ไม่ปิด
                        </button>
                        <button 
                            className="btn btn-danger" 
                            onClick={() => {
                                setShowCloseConfirm(false)
                                onClose()
                            }}
                        >
                            ปิดเลย
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
