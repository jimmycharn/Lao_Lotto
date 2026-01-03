import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    FiClock,
    FiCalendar,
    FiPlus,
    FiTrash2,
    FiCheck,
    FiX,
    FiDollarSign,
    FiGift,
    FiSend,
    FiList,
    FiPercent,
    FiChevronDown,
    FiChevronUp,
    FiGrid,
    FiLayers,
    FiAward
} from 'react-icons/fi'
import './UserDashboard.css'

// Bet type labels
const BET_TYPES = {
    // 1 Digit
    'run_top': { label: 'วิ่งบน', digits: 1 },
    'run_bottom': { label: 'วิ่งล่าง', digits: 1 },
    'front_top_1': { label: 'หน้าบน', digits: 1 },
    'middle_top_1': { label: 'กลางบน', digits: 1 },
    'back_top_1': { label: 'หลังบน', digits: 1 },
    'front_bottom_1': { label: 'หน้าล่าง', digits: 1 },
    'back_bottom_1': { label: 'หลังล่าง', digits: 1 },

    // 2 Digits
    '2_top': { label: '2 ตัวบน', digits: 2 },
    '2_front': { label: '2 ตัวหน้า', digits: 2 },
    '2_spread': { label: '2 ตัวถ่าง', digits: 2 },
    '2_have': { label: '2 ตัวมี', digits: 2 },
    '2_bottom': { label: '2 ตัวล่าง', digits: 2 },
    // 2 Digits Reversed (กลับ)
    '2_top_rev': { label: '2 ตัวบนกลับ', digits: 2 },
    '2_front_rev': { label: '2 ตัวหน้ากลับ', digits: 2 },
    '2_spread_rev': { label: '2 ตัวถ่างกลับ', digits: 2 },
    '2_bottom_rev': { label: '2 ตัวล่างกลับ', digits: 2 },


    // 3 Digits
    '3_top': { label: '3 ตัวตรง', digits: 3 },
    '3_tod': { label: '3 ตัวโต๊ด', digits: 3 },
    '3_bottom': { label: '3 ตัวล่าง', digits: 3 },

    // 4 Digits
    '4_set': { label: '4 ตัวชุด', digits: 4 },
    '4_float': { label: '4 ตัวลอย', digits: 4 },

    // 5 Digits
    '5_float': { label: '5 ตัวลอย', digits: 5 },

    // 6 Digits
    '6_top': { label: '6 ตัว (รางวัลที่ 1)', digits: 6 }
}

// Lottery type labels
const LOTTERY_TYPES = {
    'thai': 'หวยไทย',
    'lao': 'หวยลาว',
    'hanoi': 'หวยฮานอย',
    'yeekee': 'หวยยี่กี',
    'other': 'อื่นๆ'
}

// Helper to get all permutations
const getPermutations = (str) => {
    if (str.length <= 1) return [str]
    const perms = []
    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        const remainingChars = str.slice(0, i) + str.slice(i + 1)
        for (const subPerm of getPermutations(remainingChars)) {
            perms.push(char + subPerm)
        }
    }
    return [...new Set(perms)]
}

// Helper to get unique 3-digit permutations from 4 digits
const getUnique3DigitPermsFrom4 = (str) => {
    if (str.length !== 4) return []
    const results = new Set()
    // Get all combinations of 3 digits out of 4
    for (let i = 0; i < 4; i++) {
        const combination = str.slice(0, i) + str.slice(i + 1)
        const perms = getPermutations(combination)
        perms.forEach(p => results.add(p))
    }
    return Array.from(results)
}

// Helper to get unique 3-digit permutations from 5 digits
const getUnique3DigitPermsFrom5 = (str) => {
    if (str.length !== 5) return []
    const results = new Set()
    const chars = str.split('')
    // Pick 3 out of 5
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
                const combination = chars[i] + chars[j] + chars[k]
                const perms = getPermutations(combination)
                perms.forEach(p => results.add(p))
            }
        }
    }
    return Array.from(results)
}

// Helper to generate UUID (compatible with older browsers)
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    // Fallback for browsers without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

export default function UserDashboard() {

    const { user, profile } = useAuth()
    const [rounds, setRounds] = useState([])
    const [selectedRound, setSelectedRound] = useState(null)
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('rounds') // rounds, results, commission
    const [userSettings, setUserSettings] = useState(null)

    // Results tab state
    const [resultsRounds, setResultsRounds] = useState([])
    const [selectedResultRound, setSelectedResultRound] = useState(null)
    const [resultSubmissions, setResultSubmissions] = useState([])
    const [resultsLoading, setResultsLoading] = useState(false)

    // Submit form state
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [submitForm, setSubmitForm] = useState({
        bet_type: '2_top',
        numbers: '',
        amount: ''
    })
    const [submitting, setSubmitting] = useState(false)
    const [toast, setToast] = useState(null)
    const [drafts, setDrafts] = useState([])
    const [displayMode, setDisplayMode] = useState('summary') // summary, detailed
    const [isGroupByBill, setIsGroupByBill] = useState(false)
    const [expandedBills, setExpandedBills] = useState([])
    const [currentBillId, setCurrentBillId] = useState(null)
    const [billNote, setBillNote] = useState('')
    const [isDraftsExpanded, setIsDraftsExpanded] = useState(false)
    const numberInputRef = useRef(null)
    const amountInputRef = useRef(null)


    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    useEffect(() => {
        if (profile?.dealer_id) {
            fetchRounds()
            fetchUserSettings()
        }
    }, [profile])

    async function fetchUserSettings() {
        try {
            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .eq('dealer_id', profile.dealer_id)
                .single()

            if (data) setUserSettings(data)
        } catch (error) {
            console.error('Error fetching user settings:', error)
        }
    }

    useEffect(() => {
        if (selectedRound) {
            fetchSubmissions()
        }
    }, [selectedRound])

    // Fetch results when switching to results tab
    useEffect(() => {
        if (activeTab === 'results' && profile?.dealer_id) {
            fetchResultsRounds()
        }
    }, [activeTab, profile])

    // Fetch winning submissions when selecting a result round
    useEffect(() => {
        if (selectedResultRound) {
            fetchResultSubmissions(selectedResultRound.id)
        }
    }, [selectedResultRound])

    async function fetchRounds() {
        setLoading(true)
        try {
            // Get open rounds from my dealer
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select(`
                    *,
                    type_limits (*)
                `)
                .eq('dealer_id', profile.dealer_id)
                .in('status', ['open', 'closed'])
                .order('round_date', { ascending: false })
                .limit(10)

            if (!error) {
                setRounds(data || [])
                // Select first open round
                const openRound = data?.find(r => r.status === 'open')
                if (openRound && !selectedRound) {
                    setSelectedRound(openRound)
                }
            }
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchSubmissions() {
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select('*')
                .eq('round_id', selectedRound.id)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!error) {
                setSubmissions(data || [])
            }
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Fetch rounds with announced results for Results tab
    async function fetchResultsRounds() {
        setResultsLoading(true)
        try {
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', profile.dealer_id)
                .eq('is_result_announced', true)
                .order('round_date', { ascending: false })
                .limit(20)

            if (!error) {
                setResultsRounds(data || [])
            }
        } catch (error) {
            console.error('Error fetching results rounds:', error)
        } finally {
            setResultsLoading(false)
        }
    }

    // Fetch winning submissions for a specific round
    async function fetchResultSubmissions(roundId) {
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select('*')
                .eq('round_id', roundId)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .eq('is_winner', true)
                .order('created_at', { ascending: false })

            if (!error) {
                setResultSubmissions(data || [])
            }
        } catch (error) {
            console.error('Error fetching result submissions:', error)
        }
    }

    // Check if can still submit (before close time)
    function canSubmit() {
        if (!selectedRound) return false
        if (selectedRound.status !== 'open') return false
        return new Date() < new Date(selectedRound.close_time)
    }

    // Check if can delete (before delete deadline)
    function canDelete(submission) {
        if (!selectedRound) return false
        if (selectedRound.status !== 'open') return false

        const closeTime = new Date(selectedRound.close_time)
        const deleteDeadline = new Date(closeTime.getTime() - (selectedRound.delete_before_minutes * 60 * 1000))
        return new Date() < deleteDeadline
    }

    // Add to draft list
    function addToDraft(betTypeOverride = null) {
        console.log('addToDraft called with:', betTypeOverride)
        console.log('submitForm:', submitForm)
        const betType = betTypeOverride || submitForm.bet_type
        // Clean numbers by removing spaces
        const cleanNumbers = (submitForm.numbers || '').replace(/\s/g, '')
        console.log('cleanNumbers:', cleanNumbers, 'betType:', betType)
        if (!cleanNumbers || !submitForm.amount || !betType) {
            console.log('Validation failed:', { cleanNumbers, amount: submitForm.amount, betType })
            alert('กรุณากรอกเลขและจำนวนเงิน')
            return
        }



        const amountParts = submitForm.amount.toString().split('*').map(p => parseFloat(p) || 0)
        const totalAmount = amountParts.reduce((sum, p) => sum + p, 0)

        if (totalAmount <= 0) {
            alert('จำนวนเงินต้องมากกว่า 0')
            return
        }

        const betTypeInfo = BET_TYPES[betType] || { label: betType, digits: 0 }
        const digitsOnly = cleanNumbers.replace(/\*/g, '')

        // Strict digit check
        const isSpecial3Digit = ['3_perm_from_4', '3_perm_from_5', '3_perm_from_3', '3_straight_tod', '3_straight_perm'].includes(betType)
        if (!isSpecial3Digit && digitsOnly.length !== betTypeInfo.digits) {
            if (!(betType === '3_top' && cleanNumbers.includes('*'))) {
                alert(`${betTypeInfo.label} ต้องมี ${betTypeInfo.digits} หลัก`)
                return
            }
        }


        const entryId = generateUUID()

        const newDrafts = []
        const timestamp = new Date().toISOString()

        // Get label for display
        let displayLabel = betTypeInfo.label
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
        }

        if (betType === '3_perm_from_4' || betType === '3_perm_from_5' || betType === '3_perm_from_3') {
            let perms = []
            if (betType === '3_perm_from_4') perms = getUnique3DigitPermsFrom4(cleanNumbers)
            else if (betType === '3_perm_from_5') perms = getUnique3DigitPermsFrom5(cleanNumbers)
            else if (betType === '3_perm_from_3') perms = getPermutations(cleanNumbers)

            const rate = userSettings?.commission_rates?.['3_top'] || 0
            perms.forEach(p => {
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: p,
                    amount: totalAmount,
                    commission_rate: rate,
                    commission_amount: (totalAmount * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            })
        } else if (betType === '3_straight_tod') {
            const [straightAmt, todAmt] = amountParts
            if (straightAmt > 0) {
                const rate = userSettings?.commission_rates?.['3_top'] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: rate,
                    commission_amount: (straightAmt * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (todAmt > 0) {
                const rate = userSettings?.commission_rates?.['3_tod'] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_tod',
                    numbers: cleanNumbers,
                    amount: todAmt,
                    commission_rate: rate,
                    commission_amount: (todAmt * rate) / 100,
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
                const rate = userSettings?.commission_rates?.['3_top'] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: rate,
                    commission_amount: (straightAmt * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (permAmt > 0 && perms.length > 0) {
                const rate = userSettings?.commission_rates?.['3_top'] || 0
                perms.forEach(p => {
                    newDrafts.push({
                        entry_id: entryId,
                        bet_type: '3_top',
                        numbers: p,
                        amount: permAmt,
                        commission_rate: rate,
                        commission_amount: (permAmt * rate) / 100,
                        display_numbers: cleanNumbers,
                        display_amount: submitForm.amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                })
            }
        } else if (betType.endsWith('_rev') && cleanNumbers.length === 2) {
            // 2-digit reversed bet types - create both normal and reversed entries
            const baseBetType = betType.replace('_rev', '')
            const reversedNumbers = cleanNumbers.split('').reverse().join('')
            const [amt1, amt2] = amountParts

            // First number with first amount
            if (amt1 > 0) {
                const rate = userSettings?.commission_rates?.[baseBetType] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt1,
                    commission_rate: rate,
                    commission_amount: (amt1 * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }

            // Reversed number with second amount (if different from original)
            if (amt2 > 0 && reversedNumbers !== cleanNumbers) {
                const rate = userSettings?.commission_rates?.[baseBetType] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: reversedNumbers,
                    amount: amt2,
                    commission_rate: rate,
                    commission_amount: (amt2 * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            } else if (amt2 > 0 && reversedNumbers === cleanNumbers) {
                // Same number (e.g., 11, 22) - just add the second amount to same number
                const rate = userSettings?.commission_rates?.[baseBetType] || 0
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt2,
                    commission_rate: rate,
                    commission_amount: (amt2 * rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
        } else {
            const rate = userSettings?.commission_rates?.[betType] || 0
            newDrafts.push({
                entry_id: entryId,
                bet_type: betType,
                numbers: cleanNumbers,
                amount: totalAmount,
                commission_rate: rate,
                commission_amount: (totalAmount * rate) / 100,
                display_numbers: cleanNumbers,
                display_amount: submitForm.amount,
                display_bet_type: displayLabel,

                created_at: timestamp
            })
        }

        // Add original_count to each draft for group tracking
        const draftsWithCount = newDrafts.map(d => ({
            ...d,
            original_count: newDrafts.length
        }))

        setDrafts(prev => [...prev, ...draftsWithCount])

        // Focus back to number input
        if (numberInputRef.current) {
            setTimeout(() => {
                numberInputRef.current.focus()
                numberInputRef.current.select()
                numberInputRef.current.setSelectionRange(0, 9999)
            }, 50)
        }
    }

    // Save all drafts to database
    async function handleSaveBill() {
        if (drafts.length === 0) return

        setSubmitting(true)
        try {
            const billId = currentBillId || generateUUID()

            const inserts = drafts.map(d => {
                // Remove original_count as it's only for UI tracking, not in DB schema
                const { original_count, ...rest } = d
                return {
                    ...rest,
                    round_id: selectedRound.id,
                    user_id: user.id,
                    bill_id: billId,
                    bill_note: billNote || null
                }
            })

            const { error } = await supabase.from('submissions').insert(inserts)
            if (error) throw error

            setDrafts([])
            setCurrentBillId(null)
            setBillNote('')
            setShowSubmitModal(false)
            fetchSubmissions()
            setToast({ message: 'บันทึกโพยสำเร็จ!', type: 'success' })

        } catch (error) {
            console.error('Error saving bill:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Toggle bill expansion
    function toggleBill(billId) {
        setExpandedBills(prev =>
            prev.includes(billId)
                ? prev.filter(id => id !== billId)
                : [...prev, billId]
        )
    }

    // Delete submission
    async function handleDelete(submission) {
        if (!confirm('ต้องการลบรายการนี้?')) return

        try {
            let query = supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })

            if (isGroupByBill && submission.entry_id) {
                query = query.eq('entry_id', submission.entry_id)
            } else if (displayMode === 'summary' && submission.entry_id) {
                query = query.eq('entry_id', submission.entry_id)
            } else {
                query = query.eq('id', submission.id)
            }

            const { error } = await query
            if (error) throw error

            fetchSubmissions()
            setToast({ message: 'ลบรายการสำเร็จ', type: 'success' })
        } catch (error) {
            console.error('Error deleting:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Format time remaining
    function formatTimeRemaining(closeTime) {
        const now = new Date()
        const close = new Date(closeTime)
        const diff = close - now

        if (diff <= 0) return 'ปิดรับแล้ว'

        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

        if (hours > 0) {
            return `เหลือ ${hours} ชม. ${minutes} นาที`
        }
        return `เหลือ ${minutes} นาที`
    }

    // Calculate totals
    const totalAmount = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)
    const totalCommission = submissions.reduce((sum, s) => sum + (s.commission_amount || 0), 0)

    // No dealer assigned
    if (!profile?.dealer_id) {
        return (
            <div className="user-dashboard">
                <div className="container">
                    <div className="no-dealer-card card">
                        <FiGift className="big-icon" />
                        <h2>ยังไม่มีเจ้ามือ</h2>
                        <p>กรุณาสมัครผ่านลิงก์ของเจ้ามือเพื่อเข้าร่วมกลุ่ม</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="user-dashboard">
            <div className="container">
                {/* Header */}
                <div className="page-header">
                    <h1><FiSend /> ส่งเลข</h1>
                    <p>ส่งเลขหวยให้เจ้ามือของคุณ</p>
                </div>

                {/* Tabs */}
                <div className="user-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'rounds' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rounds')}
                    >
                        <FiCalendar /> งวดที่เปิด
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`}
                        onClick={() => setActiveTab('results')}
                    >
                        <FiAward /> ผลรางวัล
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'commission' ? 'active' : ''}`}
                        onClick={() => setActiveTab('commission')}
                    >
                        <FiPercent /> ค่าคอม
                    </button>
                </div>

                <div className="dashboard-content">
                    {activeTab === 'rounds' && (
                        <div className="rounds-accordion">
                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : rounds.length === 0 ? (
                                <div className="empty-state card">
                                    <FiCalendar className="empty-icon" />
                                    <p>ไม่มีงวดที่เปิดรับ</p>
                                </div>
                            ) : (
                                rounds.map(round => {
                                    const isExpanded = selectedRound?.id === round.id;
                                    return (
                                        <div key={round.id} className={`round-accordion-item ${isExpanded ? 'expanded' : ''}`}>
                                            <div
                                                className={`round-accordion-header card clickable ${isExpanded ? 'expanded-header' : ''}`}
                                                onClick={() => setSelectedRound(isExpanded ? null : round)}
                                            >
                                                <div className="round-header-main">
                                                    <div className="round-header-info">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {LOTTERY_TYPES[round.lottery_type]}
                                                        </span>
                                                        <div className="round-title-group">
                                                            <h3>{round.lottery_name}</h3>
                                                            <span className="round-date">
                                                                {new Date(round.round_date).toLocaleDateString('th-TH', {
                                                                    weekday: 'long',
                                                                    day: 'numeric',
                                                                    month: 'long',
                                                                    year: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="round-header-status">
                                                        {round.status === 'open' ? (
                                                            <div className="time-remaining">
                                                                {formatTimeRemaining(round.close_time)}
                                                            </div>
                                                        ) : (
                                                            <span className="round-status closed">ปิดรับแล้ว</span>
                                                        )}
                                                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                    </div>
                                                </div>
                                                {isExpanded && (
                                                    <div className="round-header-detail">
                                                        <div className="time-grid">
                                                            <div className="time-item">
                                                                <FiClock />
                                                                <span>เปิดรับ: {new Date(round.open_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                            <div className="time-item">
                                                                <FiClock />
                                                                <span>ปิดรับ: {new Date(round.close_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </div>
                                                        {canSubmit() && (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSubmitForm({
                                                                        bet_type: '2_top',
                                                                        numbers: '',
                                                                        amount: ''
                                                                    })
                                                                    if (drafts.length === 0) {
                                                                        const shortId = 'B-' + Math.random().toString(36).substring(2, 8).toUpperCase()
                                                                        setCurrentBillId(shortId)
                                                                    }
                                                                    setShowSubmitModal(true)
                                                                }}
                                                            >
                                                                <FiPlus /> ส่งเลข
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {isExpanded && (
                                                <div className="round-accordion-content">
                                                    {/* Submissions Summary */}
                                                    <div className="submissions-summary">
                                                        <div className="summary-card">
                                                            <span className="summary-value">{submissions.length}</span>
                                                            <span className="summary-label">รายการ</span>
                                                        </div>
                                                        <div className="summary-card">
                                                            <span className="summary-value">
                                                                {round.currency_symbol}{totalAmount.toLocaleString()}
                                                            </span>
                                                            <span className="summary-label">ยอดรวม</span>
                                                        </div>
                                                        <div className="summary-card highlight">
                                                            <span className="summary-value">
                                                                {round.currency_symbol}{totalCommission.toLocaleString()}
                                                            </span>
                                                            <span className="summary-label">ค่าคอม</span>
                                                        </div>
                                                    </div>

                                                    <div className="submissions-list card">
                                                        <div className="list-header">
                                                            <h3>รายการที่ส่ง</h3>
                                                            <div className="view-toggle-group">
                                                                <div className="view-toggle-container">
                                                                    <span className="toggle-label">แสดงผล</span>
                                                                    <div className="view-toggle">
                                                                        <button
                                                                            className={`toggle-btn ${displayMode === 'summary' ? 'active' : ''}`}
                                                                            onClick={() => setDisplayMode('summary')}
                                                                            title="แบบย่อ"
                                                                        >
                                                                            <FiList /> <span>แบบย่อ</span>
                                                                        </button>
                                                                        <button
                                                                            className={`toggle-btn ${displayMode === 'detailed' ? 'active' : ''}`}
                                                                            onClick={() => setDisplayMode('detailed')}
                                                                            title="แบบขยาย"
                                                                        >
                                                                            <FiGrid /> <span>แบบขยาย</span>
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="divider-v"></div>

                                                                <div className="view-toggle-container">
                                                                    <span className="toggle-label">จัดกลุ่ม</span>
                                                                    <button
                                                                        className={`toggle-btn group-toggle ${isGroupByBill ? 'active' : ''}`}
                                                                        onClick={() => setIsGroupByBill(!isGroupByBill)}
                                                                    >
                                                                        <FiLayers /> <span>แยกใบโพย</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {submissions.length === 0 ? (
                                                            <div className="empty-state">
                                                                <FiList className="empty-icon" />
                                                                <p>ยังไม่มีรายการ</p>
                                                            </div>
                                                        ) : (
                                                            <div className="submissions-table-wrap">
                                                                {(() => {
                                                                    // Helper to process items based on displayMode
                                                                    const processItems = (items) => {
                                                                        if (displayMode === 'detailed') return items
                                                                        return items.reduce((acc, sub) => {
                                                                            if (sub.entry_id) {
                                                                                const existing = acc.find(a => a.entry_id === sub.entry_id)
                                                                                if (existing) {
                                                                                    existing.amount += sub.amount
                                                                                    existing.commission_amount += sub.commission_amount
                                                                                    return acc
                                                                                }
                                                                                acc.push({ ...sub })
                                                                            } else {
                                                                                acc.push({ ...sub })
                                                                            }
                                                                            return acc
                                                                        }, [])
                                                                    }

                                                                    if (isGroupByBill) {
                                                                        const bills = submissions.reduce((acc, sub) => {
                                                                            const billId = sub.bill_id || 'no-bill'
                                                                            if (!acc[billId]) acc[billId] = []
                                                                            acc[billId].push(sub)
                                                                            return acc
                                                                        }, {})

                                                                        return (
                                                                            <div className="bill-view-container">
                                                                                {Object.entries(bills).sort((a, b) => {
                                                                                    const latestA = new Date(a[1][0].created_at)
                                                                                    const latestB = new Date(b[1][0].created_at)
                                                                                    return latestB - latestA
                                                                                }).map(([billId, billItems]) => {
                                                                                    const billTotal = billItems.reduce((sum, item) => sum + item.amount, 0)
                                                                                    const billCommission = billItems.reduce((sum, item) => sum + item.commission_amount, 0)
                                                                                    const billTime = new Date(billItems[0].created_at).toLocaleTimeString('th-TH', {
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit'
                                                                                    })
                                                                                    const isExpandedBill = expandedBills.includes(billId)
                                                                                    const processedBillItems = processItems(billItems)

                                                                                    return (
                                                                                        <div key={billId} className={`bill-group card ${isExpandedBill ? 'expanded' : ''}`}>
                                                                                            <div
                                                                                                className="bill-group-header clickable"
                                                                                                onClick={() => toggleBill(billId)}
                                                                                            >
                                                                                                <div className="bill-header-grid">
                                                                                                    <div className="bill-header-labels">
                                                                                                        <span>ใบโพย</span>
                                                                                                        <span>รวม</span>
                                                                                                        <span>คอม</span>
                                                                                                        <span></span>
                                                                                                    </div>
                                                                                                    <div className="bill-header-values">
                                                                                                        <span className="bill-id-value">{billId === 'no-bill' ? '-' : billId}</span>
                                                                                                        <span className="bill-total">{round.currency_symbol}{billTotal.toLocaleString()}</span>
                                                                                                        <span className="bill-commission">{round.currency_symbol}{billCommission.toLocaleString()}</span>
                                                                                                        <span className="expand-icon">
                                                                                                            {isExpandedBill ? <FiChevronUp /> : <FiChevronDown />}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <div className="bill-sub-row">
                                                                                                        <span className="bill-time">🕐 {billTime}</span>
                                                                                                        {billItems[0]?.bill_note && (
                                                                                                            <span className="bill-note-display">📝 {billItems[0].bill_note}</span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>

                                                                                            </div>



                                                                                            {isExpandedBill && (
                                                                                                <div className="bill-details-content">
                                                                                                    <table className="submissions-table mini">
                                                                                                        <thead>
                                                                                                            <tr>
                                                                                                                <th>เลข</th>
                                                                                                                <th>จำนวน</th>
                                                                                                                <th>ค่าคอม</th>
                                                                                                                <th></th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody>
                                                                                                            {processedBillItems.map(sub => (
                                                                                                                <tr key={sub.id || sub.entry_id}>
                                                                                                                    <td className="number-cell">
                                                                                                                        <div className="number-display">
                                                                                                                            <span className="main-number">{sub.display_numbers || sub.numbers}</span>
                                                                                                                            <span className="sub-type">{sub.display_bet_type || BET_TYPES[sub.bet_type]?.label}</span>
                                                                                                                        </div>
                                                                                                                    </td>
                                                                                                                    <td>{sub.display_amount || sub.amount?.toLocaleString()}</td>
                                                                                                                    <td>{sub.commission_amount?.toLocaleString()}</td>
                                                                                                                    <td>
                                                                                                                        {canDelete(sub) && (
                                                                                                                            <button
                                                                                                                                className="icon-btn danger"
                                                                                                                                onClick={(e) => {
                                                                                                                                    e.stopPropagation()
                                                                                                                                    handleDelete(sub)
                                                                                                                                }}
                                                                                                                                title="ลบ"
                                                                                                                            >
                                                                                                                                <FiTrash2 />
                                                                                                                            </button>
                                                                                                                        )}
                                                                                                                    </td>
                                                                                                                </tr>
                                                                                                            ))}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )
                                                                                })}
                                                                            </div>
                                                                        )
                                                                    } else {
                                                                        // Single table view
                                                                        const displayItems = processItems(submissions)
                                                                        return (
                                                                            <table className="submissions-table">
                                                                                <thead>
                                                                                    <tr>
                                                                                        <th>เลข</th>
                                                                                        <th>จำนวน</th>
                                                                                        <th>ค่าคอม</th>
                                                                                        <th>เวลา</th>
                                                                                        <th></th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {displayItems.map(sub => (
                                                                                        <tr key={sub.id || sub.entry_id} className={sub.is_winner ? 'winner' : ''}>
                                                                                            <td className="number-cell">
                                                                                                <div className="number-display">
                                                                                                    <span className="main-number">
                                                                                                        {displayMode === 'summary' ? (sub.display_numbers || sub.numbers) : sub.numbers}
                                                                                                    </span>
                                                                                                    <span className="sub-type">
                                                                                                        {displayMode === 'summary' ? (sub.display_bet_type || BET_TYPES[sub.bet_type]?.label) : BET_TYPES[sub.bet_type]?.label}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td>{round.currency_symbol}{(displayMode === 'summary' ? sub.display_amount : sub.amount)?.toLocaleString()}</td>
                                                                                            <td className="commission-cell">
                                                                                                {round.currency_symbol}{sub.commission_amount?.toLocaleString()}
                                                                                            </td>
                                                                                            <td className="time-cell">
                                                                                                {new Date(sub.created_at).toLocaleTimeString('th-TH', {
                                                                                                    hour: '2-digit',
                                                                                                    minute: '2-digit'
                                                                                                })}
                                                                                            </td>
                                                                                            <td>
                                                                                                {canDelete(sub) && (
                                                                                                    <button
                                                                                                        className="icon-btn danger"
                                                                                                        onClick={() => handleDelete(sub)}
                                                                                                        title="ลบ"
                                                                                                    >
                                                                                                        <FiTrash2 />
                                                                                                    </button>
                                                                                                )}
                                                                                                {sub.is_winner && (
                                                                                                    <span className="winner-badge">
                                                                                                        <FiCheck /> ถูก!
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        )
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'results' && (
                        <div className="rounds-accordion">
                            {resultsLoading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : resultsRounds.length === 0 ? (
                                <div className="empty-state card">
                                    <FiAward className="empty-icon" />
                                    <p>ยังไม่มีผลรางวัล</p>
                                </div>
                            ) : (
                                resultsRounds.map(round => {
                                    const isExpanded = selectedResultRound?.id === round.id

                                    // Calculate summary for expanded round
                                    const winningCount = resultSubmissions.length
                                    const totalPrize = resultSubmissions.reduce((sum, s) => sum + (s.prize_amount || 0), 0)

                                    // Group by bill for display
                                    const billGroups = resultSubmissions.reduce((acc, sub) => {
                                        const billId = sub.bill_id || 'no-bill'
                                        if (!acc[billId]) acc[billId] = []
                                        acc[billId].push(sub)
                                        return acc
                                    }, {})

                                    return (
                                        <div key={round.id} className={`round-accordion-item ${isExpanded ? 'expanded' : ''}`}>
                                            <div
                                                className={`round-accordion-header card clickable ${isExpanded ? 'expanded-header' : ''}`}
                                                onClick={() => setSelectedResultRound(isExpanded ? null : round)}
                                            >
                                                <div className="round-header-main">
                                                    <div className="round-header-info">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {round.lottery_name || round.lottery_type}
                                                        </span>
                                                        <div className="round-title-group">
                                                            <h3>{round.lottery_name || getLotteryTypeName(round.lottery_type)}</h3>
                                                            <span className="round-date">
                                                                {new Date(round.round_date).toLocaleDateString('th-TH', {
                                                                    weekday: 'short',
                                                                    day: 'numeric',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="round-header-status">
                                                        <span className="status-badge announced">
                                                            <FiCheck /> ประกาศผลแล้ว
                                                        </span>
                                                        <FiChevronDown />
                                                    </div>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="round-accordion-content">
                                                    {/* Summary Cards */}
                                                    <div className="submissions-summary">
                                                        <div className="summary-card">
                                                            <span className="summary-value">{winningCount}</span>
                                                            <span className="summary-label">รายการที่ถูก</span>
                                                        </div>
                                                        <div className="summary-card highlight">
                                                            <span className="summary-value">
                                                                {round.currency_symbol || '฿'}{totalPrize.toLocaleString()}
                                                            </span>
                                                            <span className="summary-label">รางวัลที่ได้</span>
                                                        </div>
                                                    </div>

                                                    {/* Winning List */}
                                                    {winningCount === 0 ? (
                                                        <div className="empty-state card" style={{ padding: '2rem' }}>
                                                            <p>ไม่มีรายการที่ถูกรางวัลในงวดนี้</p>
                                                        </div>
                                                    ) : (
                                                        <div className="result-winners-list">
                                                            {Object.entries(billGroups).map(([billId, items]) => {
                                                                const billTotal = items.reduce((sum, s) => sum + (s.prize_amount || 0), 0)
                                                                return (
                                                                    <div key={billId} className="result-bill-group card">
                                                                        <div className="result-bill-header">
                                                                            <span className="bill-label">
                                                                                <FiGift /> โพย {billId === 'no-bill' ? '-' : billId.slice(-6).toUpperCase()}
                                                                            </span>
                                                                            <span className="bill-prize">
                                                                                +{round.currency_symbol || '฿'}{billTotal.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        <div className="result-bill-items">
                                                                            {items.map(sub => (
                                                                                <div key={sub.id} className="result-item">
                                                                                    <div className="result-number">
                                                                                        <span className="number-value">{sub.display_numbers || sub.numbers}</span>
                                                                                        <span className="bet-type">{BET_TYPES[sub.bet_type]?.label || sub.bet_type}</span>
                                                                                    </div>
                                                                                    <div className="result-amounts">
                                                                                        <span className="bet-amount">{round.currency_symbol || '฿'}{sub.amount}</span>
                                                                                        <span className="arrow">→</span>
                                                                                        <span className="prize-amount">{round.currency_symbol || '฿'}{(sub.prize_amount || 0).toLocaleString()}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'commission' && (
                        <CommissionTab user={user} profile={profile} userSettings={userSettings} />
                    )}
                </div>
            </div>

            {/* Submit Modal */}
            {showSubmitModal && selectedRound && (
                <div className="modal-overlay" onClick={() => {
                    if (drafts.length > 0) {
                        if (confirm('ต้องการยกเลิกการส่งเลขทั้งหมดในรายการร่าง?')) {
                            setDrafts([])
                            setCurrentBillId(null)
                            setShowSubmitModal(false)
                        }
                    } else {
                        setShowSubmitModal(false)
                    }
                }}>
                    <div className="modal submission-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="header-title">
                                <h3><FiPlus /> ส่งเลข</h3>
                                <span className="bill-id-badge">{currentBillId}</span>
                            </div>
                            <button className="modal-close" onClick={() => {
                                if (drafts.length > 0) {
                                    if (confirm('ต้องการยกเลิกการส่งเลขทั้งหมดในรายการร่าง?')) {
                                        setDrafts([])
                                        setCurrentBillId(null)
                                        setShowSubmitModal(false)
                                    }
                                } else {
                                    setShowSubmitModal(false)
                                }
                            }}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Bill Note Input */}
                            <div className="bill-note-section">
                                <input
                                    type="text"
                                    className="form-input bill-note-input"
                                    placeholder="ชื่อผู้ซื้อ / บันทึกช่วยจำ (ไม่บังคับ)"
                                    value={billNote}
                                    onChange={e => setBillNote(e.target.value)}
                                />
                            </div>

                            <div className="input-section card">

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">ตัวเลข</label>
                                        <input
                                            ref={numberInputRef}
                                            type="text"
                                            className="form-input number-input"
                                            inputMode="decimal"
                                            placeholder="ป้อนตัวเลข"
                                            value={submitForm.numbers}
                                            onChange={e => setSubmitForm({
                                                ...submitForm,
                                                numbers: e.target.value.replace(/[ \-.,]/g, '*').replace(/[^\d*]/g, '')
                                            })}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    if (amountInputRef.current) {
                                                        amountInputRef.current.focus()
                                                        amountInputRef.current.select()
                                                    }
                                                }
                                            }}
                                        />
                                    </div>

                                    <div className="form-group amount-group">
                                        <label className="form-label">จำนวนเงิน ({selectedRound.currency_name})</label>
                                        <div className="input-with-clear">
                                            <input
                                                ref={amountInputRef}
                                                type="text"
                                                className="form-input amount-input"
                                                inputMode="decimal"
                                                placeholder="0"
                                                value={submitForm.amount}
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                    let value = e.target.value
                                                    // Convert separators to *
                                                    value = value.replace(/[ \-.,]/g, '*')
                                                    // Remove non-digit and non-* characters
                                                    value = value.replace(/[^\d*]/g, '')
                                                    // Rule 1: Cannot start with *
                                                    value = value.replace(/^\*+/, '')

                                                    // Special rule for 4-digit inputs on Lao/Hanoi: No "*" allowed
                                                    const digits = submitForm.numbers.replace(/\*/g, '').length
                                                    const isLaoOrHanoi = ['lao', 'hanoi'].includes(selectedRound?.lottery_type)
                                                    if (digits === 4 && isLaoOrHanoi) {
                                                        value = value.replace(/\*/g, '')
                                                    } else {
                                                        // Rule 2: Only allow one *
                                                        const starCount = (value.match(/\*/g) || []).length
                                                        if (starCount > 1) {
                                                            // Keep only the first *
                                                            const firstStarIndex = value.indexOf('*')
                                                            value = value.substring(0, firstStarIndex + 1) + value.substring(firstStarIndex + 1).replace(/\*/g, '')
                                                        }
                                                    }
                                                    setSubmitForm({ ...submitForm, amount: value })
                                                }}

                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        // Auto-add default bet type if possible
                                                        const digits = submitForm.numbers.replace(/\*/g, '').length
                                                        if (digits === 2) addToDraft('2_top')
                                                        else if (digits === 3) addToDraft('3_top')
                                                    }
                                                }}
                                            />
                                            {submitForm.amount && (
                                                <button
                                                    type="button"
                                                    className="clear-btn"
                                                    onClick={() => {
                                                        setSubmitForm({ ...submitForm, amount: '' })
                                                        amountInputRef.current?.focus()
                                                    }}
                                                >
                                                    <FiX />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                <div className="bet-type-selection">
                                    <label className="form-label">เลือกประเภท</label>
                                    <div className="bet-type-grid">
                                        {(() => {
                                            const digits = submitForm.numbers.replace(/\*/g, '').length
                                            const hasStarInAmount = submitForm.amount.toString().includes('*')
                                            const lotteryType = selectedRound.lottery_type
                                            const amount = submitForm.amount.toString()
                                            const isAmountEmpty = !amount || amount === '0' || amount === ''

                                            let available = []

                                            // Check if amount is incomplete (ends with * but no second number)
                                            const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
                                            const isIncompleteAmount = amount.includes('*') && amtParts.length < 2

                                            // Only show bet type buttons if amount is also entered and complete
                                            // Exception: For 4-digit on Lao/Hanoi, show "4 ตัวชุด" even when amount is empty
                                            const isLaoOrHanoi4Digit = digits === 4 && ['lao', 'hanoi'].includes(lotteryType)
                                            if ((isAmountEmpty || isIncompleteAmount) && !isLaoOrHanoi4Digit) {
                                                // Don't show any buttons if amount is empty or incomplete
                                                available = []
                                            } else if (digits === 1) {
                                                available = ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1']
                                            } else if (digits === 2) {

                                                // Check if we have 2 complete amount parts (e.g., "100*50")
                                                const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
                                                const hasTwoAmounts = amtParts.length === 2

                                                if (hasTwoAmounts) {
                                                    // With 2 amounts - show reversed types (กลับ)
                                                    available = ['2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev']
                                                } else if (amtParts.length === 1 && !amount.includes('*')) {
                                                    // Single amount without "*" - show normal types
                                                    available = ['2_top', '2_front', '2_spread', '2_have', '2_bottom']
                                                }
                                                // If amount ends with "*" but doesn't have 2nd number, show nothing


                                            } else if (digits === 3) {
                                                if (hasStarInAmount) {
                                                    const permCount = getPermutations(submitForm.numbers).length
                                                    available = [
                                                        { id: '3_straight_tod', label: 'เต็ง-โต๊ด' },
                                                        { id: '3_straight_perm', label: `1+กลับ (${permCount - 1})` }
                                                    ]
                                                } else {
                                                    const permCount = getPermutations(submitForm.numbers).length
                                                    available = [
                                                        '3_top',
                                                        '3_tod',
                                                        { id: '3_perm_from_3', label: `คูณชุด ${permCount}` }
                                                    ]
                                                    if (lotteryType === 'thai') available.push('3_bottom')
                                                }
                                            }
                                            else if (digits === 4) {
                                                const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
                                                if (isLaoOrHanoi) {
                                                    // For Lao and Hanoi: special logic for 4-digit
                                                    if (isAmountEmpty) {
                                                        // When amount is empty, only show "4 ตัวชุด"
                                                        available = ['4_set']
                                                    } else {
                                                        // When amount has value, show all options
                                                        const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                        available = [
                                                            '4_set',
                                                            '4_float',
                                                            { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                        ]
                                                    }
                                                } else {
                                                    // For other lottery types (Thai, etc.)
                                                    if (!isAmountEmpty) {
                                                        const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                        available = [
                                                            '4_float',
                                                            { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                        ]
                                                    }
                                                }
                                            }
                                            else if (digits === 5) {
                                                if (!isAmountEmpty) {
                                                    const permCount = getUnique3DigitPermsFrom5(submitForm.numbers).length
                                                    available = [
                                                        '5_float',
                                                        { id: '3_perm_from_5', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            }

                                            return available.map(item => {
                                                const key = typeof item === 'string' ? item : item.id
                                                const label = typeof item === 'string' ? (BET_TYPES[key]?.label || key) : item.label
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        className="bet-type-btn"
                                                        onClick={() => addToDraft(key)}
                                                    >
                                                        {label}
                                                    </button>
                                                )
                                            })
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Drafts List */}
                            <div className="drafts-section card">
                                <div className="section-header">
                                    <h4>รายการที่เลือก ({drafts.length})</h4>
                                    <div className="section-header-actions">
                                        {drafts.length > 0 && (
                                            <>
                                                <button
                                                    className={`toggle-btn compact ${isDraftsExpanded ? 'active' : ''}`}
                                                    onClick={() => setIsDraftsExpanded(!isDraftsExpanded)}
                                                >
                                                    {isDraftsExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                    {isDraftsExpanded ? 'ย่อ' : 'ขยาย'}
                                                </button>
                                                <button className="text-btn danger" onClick={() => setDrafts([])}>
                                                    ล้างทั้งหมด
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className={`drafts-list ${isDraftsExpanded ? 'expanded' : 'collapsed'}`}>
                                    {drafts.length === 0 ? (
                                        <div className="empty-draft">ยังไม่มีรายการ</div>
                                    ) : (
                                        <table className="drafts-table">
                                            <thead>
                                                <tr>
                                                    <th>เลข</th>
                                                    <th>ประเภท</th>
                                                    <th>จำนวน</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {isDraftsExpanded ? (
                                                    // Expanded mode: show all individual items
                                                    drafts.map((d, idx) => (
                                                        <tr key={idx}>
                                                            <td>{d.numbers}</td>
                                                            <td>{BET_TYPES[d.bet_type]?.label}</td>
                                                            <td>{d.amount.toLocaleString()}</td>
                                                            <td>
                                                                <button
                                                                    className="icon-btn danger mini"
                                                                    onClick={() => setDrafts(prev => prev.filter((_, i) => i !== idx))}
                                                                >
                                                                    <FiTrash2 />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    // Summary mode: group by entry_id and show display values
                                                    // If group is broken (items were deleted), show actual values
                                                    Object.values(
                                                        drafts.reduce((acc, d) => {
                                                            const key = d.entry_id || d.id || Math.random()
                                                            if (!acc[key]) {
                                                                acc[key] = {
                                                                    entry_id: d.entry_id,
                                                                    display_numbers: d.display_numbers || d.numbers,
                                                                    display_bet_type: d.display_bet_type || BET_TYPES[d.bet_type]?.label,
                                                                    display_amount: d.display_amount || d.amount.toString(),
                                                                    originalCount: d.original_count || 1,
                                                                    totalAmount: d.amount,
                                                                    items: [d]
                                                                }
                                                            } else {
                                                                acc[key].totalAmount += d.amount
                                                                acc[key].items.push(d)
                                                            }
                                                            return acc
                                                        }, {})
                                                    ).flatMap((group, idx) => {
                                                        // Check if group is intact (same number of items as original)
                                                        // A group is only intact if current count equals original count
                                                        const originalCount = group.items[0]?.original_count || 1
                                                        const isGroupIntact = group.items.length === originalCount

                                                        if (isGroupIntact && group.items.length > 1) {
                                                            // Group is intact, show summarized view
                                                            return [(
                                                                <tr key={idx}>
                                                                    <td>{group.display_numbers}</td>
                                                                    <td>{group.display_bet_type}</td>
                                                                    <td>{group.display_amount}</td>
                                                                    <td>
                                                                        <button
                                                                            className="icon-btn danger mini"
                                                                            onClick={() => setDrafts(prev => prev.filter(d => d.entry_id !== group.entry_id))}
                                                                        >
                                                                            <FiTrash2 />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            )]
                                                        } else {
                                                            // Group is broken or single item, show actual values
                                                            return group.items.map((d, itemIdx) => (
                                                                <tr key={`${idx}-${itemIdx}`}>
                                                                    <td>{d.numbers}</td>
                                                                    <td>{BET_TYPES[d.bet_type]?.label}</td>
                                                                    <td>{d.amount.toLocaleString()}</td>
                                                                    <td>
                                                                        <button
                                                                            className="icon-btn danger mini"
                                                                            onClick={() => setDrafts(prev => prev.filter((_, i) =>
                                                                                prev.indexOf(d) !== i
                                                                            ).filter(item => item !== d))}
                                                                        >
                                                                            <FiTrash2 />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        }
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                <div className="drafts-footer">
                                    <div className="total-row">
                                        <span>ยอดรวม:</span>
                                        <span className="total-value">
                                            {selectedRound.currency_symbol}
                                            {drafts.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <button
                                        className="btn btn-primary btn-block"
                                        disabled={drafts.length === 0 || submitting}
                                        onClick={handleSaveBill}
                                    >
                                        {submitting ? 'กำลังบันทึก...' : 'บันทึกโพย'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Toast Notification */}
                        {toast && (
                            <div className={`toast-notification ${toast.type}`}>
                                <FiCheck /> {toast.message}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// History Tab Component
function HistoryTab({ user, profile }) {
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistory()
    }, [])

    async function fetchHistory() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select(`
                    *,
                    lottery_rounds (
                        lottery_name,
                        lottery_type,
                        round_date,
                        is_result_announced,
                        currency_symbol
                    )
                `)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error) setSubmissions(data || [])
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    const totalWon = submissions.filter(s => s.is_winner).reduce((sum, s) => sum + (s.prize_amount || 0), 0)
    const totalSpent = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)

    return (
        <div className="history-section">
            <div className="stats-row">
                <div className="stat-card">
                    <span className="stat-value">{submissions.length}</span>
                    <span className="stat-label">รายการทั้งหมด</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">฿{totalSpent.toLocaleString()}</span>
                    <span className="stat-label">ยอดรวม</span>
                </div>
                <div className="stat-card highlight">
                    <span className="stat-value">฿{totalWon.toLocaleString()}</span>
                    <span className="stat-label">รางวัลที่ได้</span>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                </div>
            ) : (
                <div className="history-list">
                    {submissions.map(sub => (
                        <div key={sub.id} className={`history-card card ${sub.is_winner ? 'winner' : ''}`}>
                            <div className="history-header">
                                <span className={`lottery-badge ${sub.lottery_rounds?.lottery_type}`}>
                                    {sub.lottery_rounds?.lottery_name}
                                </span>
                                <span className="history-date">
                                    {new Date(sub.lottery_rounds?.round_date).toLocaleDateString('th-TH')}
                                </span>
                            </div>
                            <div className="history-content">
                                <span className="type-badge">{BET_TYPES[sub.bet_type]?.label}</span>
                                <span className="number-cell">{sub.numbers}</span>
                                <span className="amount">
                                    {sub.lottery_rounds?.currency_symbol}{sub.amount?.toLocaleString()}
                                </span>
                            </div>
                            <div className="history-status">
                                {sub.lottery_rounds?.is_result_announced ? (
                                    sub.is_winner ? (
                                        <span className="status-badge won">
                                            <FiCheck /> ถูกรางวัล +{sub.lottery_rounds?.currency_symbol}{sub.prize_amount?.toLocaleString()}
                                        </span>
                                    ) : (
                                        <span className="status-badge lost">ไม่ถูกรางวัล</span>
                                    )
                                ) : (
                                    <span className="status-badge pending"><FiClock /> รอผล</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// Commission Tab Component
function CommissionTab({ user, profile, userSettings }) {
    const [loading, setLoading] = useState(false)
    const [totalCommission, setTotalCommission] = useState(0)

    useEffect(() => {
        fetchTotalCommission()
    }, [])

    async function fetchTotalCommission() {
        setLoading(true)
        try {
            // Get total commission earned
            const { data: subs } = await supabase
                .from('submissions')
                .select('commission_amount')
                .eq('user_id', user.id)
                .eq('is_deleted', false)

            const total = subs?.reduce((sum, s) => sum + (s.commission_amount || 0), 0) || 0
            setTotalCommission(total)

        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
            </div>
        )
    }

    return (
        <div className="commission-section">
            <div className="commission-total card">
                <FiDollarSign className="big-icon" />
                <h2>ค่าคอมมิชชั่นรวม</h2>
                <span className="total-value">฿{totalCommission.toLocaleString()}</span>
            </div>

            <div className="commission-rates card">
                <h3>อัตราค่าคอมมิชชั่น</h3>
                {userSettings?.commission_rates ? (
                    <div className="rates-grid">
                        {Object.entries(BET_TYPES).map(([key, info]) => (
                            <div key={key} className="rate-item">
                                <span className="rate-label">{info.label}</span>
                                <span className="rate-value">
                                    {userSettings.commission_rates[key] || 0}%
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">ยังไม่ได้ตั้งค่าอัตราคอมมิชชั่น</p>
                )}
            </div>
        </div>
    )
}
