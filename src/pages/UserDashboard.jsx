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
    FiPercent
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

export default function UserDashboard() {
    const { user, profile } = useAuth()
    const [rounds, setRounds] = useState([])
    const [selectedRound, setSelectedRound] = useState(null)
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('rounds') // rounds, history, commission
    const [userSettings, setUserSettings] = useState(null)

    // Submit form state
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [submitForm, setSubmitForm] = useState({
        bet_type: '2_top',
        numbers: '',
        amount: ''
    })
    const [submitting, setSubmitting] = useState(false)
    const [toast, setToast] = useState(null)
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

    // Submit numbers
    async function handleSubmit(betTypeOverride = null) {
        const betType = betTypeOverride || submitForm.bet_type
        if (!submitForm.numbers || !submitForm.amount || !betType) {
            alert('กรุณากรอกเลขและจำนวนเงิน')
            return
        }

        // Handle amount with * (e.g. 10*10)
        const amountParts = submitForm.amount.toString().split('*').map(p => parseFloat(p) || 0)
        const totalAmount = amountParts.reduce((sum, p) => sum + p, 0)

        if (totalAmount <= 0) {
            alert('จำนวนเงินต้องมากกว่า 0')
            return
        }

        const betTypeInfo = BET_TYPES[betType] || { label: betType, digits: 0 }
        const digitsOnly = submitForm.numbers.replace(/\*/g, '')

        // Strict digit check unless it's a permutation case
        const isSpecial3Digit = ['3_perm_from_4', '3_perm_from_5', '3_perm_from_3', '3_straight_tod', '3_straight_perm'].includes(betType)
        if (!isSpecial3Digit && digitsOnly.length !== betTypeInfo.digits) {
            if (!(betType === '3_top' && submitForm.numbers.includes('*'))) {
                alert(`${betTypeInfo.label} ต้องมี ${betTypeInfo.digits} หลัก`)
                return
            }
        }

        setSubmitting(true)
        try {
            if (betType === '3_perm_from_4' || betType === '3_perm_from_5' || betType === '3_perm_from_3') {
                let perms = []
                if (betType === '3_perm_from_4') perms = getUnique3DigitPermsFrom4(submitForm.numbers)
                else if (betType === '3_perm_from_5') perms = getUnique3DigitPermsFrom5(submitForm.numbers)
                else if (betType === '3_perm_from_3') perms = getPermutations(submitForm.numbers)

                const commissionRate = userSettings?.commission_rates?.['3_top'] || 0
                const commissionAmount = (totalAmount * commissionRate) / 100

                const inserts = perms.map(p => ({
                    round_id: selectedRound.id,
                    user_id: user.id,
                    bet_type: '3_top',
                    numbers: p,
                    amount: totalAmount,
                    commission_rate: commissionRate,
                    commission_amount: commissionAmount
                }))

                const { error } = await supabase.from('submissions').insert(inserts)
                if (error) throw error
            } else if (betType === '3_straight_tod') {
                const [straightAmt, todAmt] = amountParts
                const inserts = []

                if (straightAmt > 0) {
                    const rate = userSettings?.commission_rates?.['3_top'] || 0
                    inserts.push({
                        round_id: selectedRound.id,
                        user_id: user.id,
                        bet_type: '3_top',
                        numbers: submitForm.numbers,
                        amount: straightAmt,
                        commission_rate: rate,
                        commission_amount: (straightAmt * rate) / 100
                    })
                }

                if (todAmt > 0) {
                    const rate = userSettings?.commission_rates?.['3_tod'] || 0
                    inserts.push({
                        round_id: selectedRound.id,
                        user_id: user.id,
                        bet_type: '3_tod',
                        numbers: submitForm.numbers,
                        amount: todAmt,
                        commission_rate: rate,
                        commission_amount: (todAmt * rate) / 100
                    })
                }

                if (inserts.length > 0) {
                    const { error } = await supabase.from('submissions').insert(inserts)
                    if (error) throw error
                }
            } else if (betType === '3_straight_perm') {
                const [straightAmt, permAmt] = amountParts
                const perms = getPermutations(submitForm.numbers).filter(p => p !== submitForm.numbers)
                const inserts = []

                if (straightAmt > 0) {
                    const rate = userSettings?.commission_rates?.['3_top'] || 0
                    inserts.push({
                        round_id: selectedRound.id,
                        user_id: user.id,
                        bet_type: '3_top',
                        numbers: submitForm.numbers,
                        amount: straightAmt,
                        commission_rate: rate,
                        commission_amount: (straightAmt * rate) / 100
                    })
                }

                if (permAmt > 0 && perms.length > 0) {
                    const rate = userSettings?.commission_rates?.['3_top'] || 0
                    perms.forEach(p => {
                        inserts.push({
                            round_id: selectedRound.id,
                            user_id: user.id,
                            bet_type: '3_top',
                            numbers: p,
                            amount: permAmt,
                            commission_rate: rate,
                            commission_amount: (permAmt * rate) / 100
                        })
                    })
                }

                if (inserts.length > 0) {
                    const { error } = await supabase.from('submissions').insert(inserts)
                    if (error) throw error
                }
            } else {
                // Standard submission
                // 1. Check number limits (Specific + Type)
                const checkAmount = amountParts[0]

                const { data: limitCheck, error: limitError } = await supabase
                    .rpc('check_number_limit', {
                        p_round_id: selectedRound.id,
                        p_bet_type: betType,
                        p_numbers: submitForm.numbers,
                        p_amount: checkAmount
                    })

                if (limitError) throw limitError

                const { is_exceeded, current_total, max_allowed, limit_type } = limitCheck[0]

                if (is_exceeded) {
                    const remaining = max_allowed - current_total
                    const limitMsg = limit_type === 'number' ? 'เลขอั้นเฉพาะเลข' : 'เลขอั้นประเภท'
                    alert(`ขออภัย! ${limitMsg} นี้เต็มแล้ว\nรับได้สูงสุด: ${max_allowed}\nยอดปัจจุบัน: ${current_total}\nคงเหลือที่รับได้: ${remaining > 0 ? remaining : 0}`)
                    setSubmitting(false)
                    return
                }

                const commissionRate = userSettings?.commission_rates?.[betType] || 0
                const commissionAmount = (totalAmount * commissionRate) / 100

                const { error } = await supabase
                    .from('submissions')
                    .insert({
                        round_id: selectedRound.id,
                        user_id: user.id,
                        bet_type: betType,
                        numbers: submitForm.numbers,
                        amount: totalAmount,
                        commission_rate: commissionRate,
                        commission_amount: commissionAmount
                    })

                if (error) throw error
            }

            // Reset form
            setSubmitForm({ ...submitForm, numbers: submitForm.numbers, amount: submitForm.amount })
            fetchSubmissions()

            // Show toast instead of alert
            setToast({ message: 'ส่งเลขสำเร็จ!', type: 'success' })

            // Select all text in number input for next entry (with mobile fix)
            if (numberInputRef.current) {
                setTimeout(() => {
                    numberInputRef.current.focus()
                    numberInputRef.current.select()
                    numberInputRef.current.setSelectionRange(0, 9999)
                }, 50)
            }

        } catch (error) {
            console.error('Error:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Delete submission
    async function handleDelete(submissionId) {
        if (!confirm('ต้องการลบรายการนี้?')) return

        try {
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .eq('id', submissionId)

            if (!error) {
                fetchSubmissions()
            }
        } catch (error) {
            console.error('Error:', error)
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
                        className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <FiList /> ประวัติ
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'commission' ? 'active' : ''}`}
                        onClick={() => setActiveTab('commission')}
                    >
                        <FiPercent /> ค่าคอม
                    </button>
                </div>

                {activeTab === 'rounds' && (
                    <div className="rounds-layout">
                        {/* Rounds List */}
                        <div className="rounds-sidebar">
                            <h3>งวดหวย</h3>
                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : rounds.length === 0 ? (
                                <p className="text-muted">ไม่มีงวดที่เปิดรับ</p>
                            ) : (
                                <div className="round-list">
                                    {rounds.map(round => (
                                        <button
                                            key={round.id}
                                            className={`round-item ${selectedRound?.id === round.id ? 'active' : ''}`}
                                            onClick={() => setSelectedRound(round)}
                                        >
                                            <span className={`lottery-badge ${round.lottery_type}`}>
                                                {LOTTERY_TYPES[round.lottery_type]}
                                            </span>
                                            <span className="round-name">{round.lottery_name}</span>
                                            <span className="round-date">
                                                {new Date(round.round_date).toLocaleDateString('th-TH', {
                                                    day: 'numeric',
                                                    month: 'short'
                                                })}
                                            </span>
                                            <span className={`round-status ${round.status}`}>
                                                {round.status === 'open' ? (
                                                    <><FiClock /> {formatTimeRemaining(round.close_time)}</>
                                                ) : (
                                                    'ปิดรับแล้ว'
                                                )}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Main Content */}
                        <div className="rounds-main">
                            {selectedRound ? (
                                <>
                                    {/* Round Info */}
                                    <div className="round-info-card card">
                                        <div className="round-header">
                                            <div>
                                                <h2>{selectedRound.lottery_name}</h2>
                                                <p>
                                                    {new Date(selectedRound.round_date).toLocaleDateString('th-TH', {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric'
                                                    })}
                                                </p>
                                            </div>
                                            {canSubmit() && (
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => setShowSubmitModal(true)}
                                                >
                                                    <FiPlus /> ส่งเลข
                                                </button>
                                            )}
                                        </div>

                                        <div className="time-info">
                                            <div className="time-item">
                                                <FiClock />
                                                <span>เปิดรับ: {new Date(selectedRound.open_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="time-item">
                                                <FiClock />
                                                <span>ปิดรับ: {new Date(selectedRound.close_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            {selectedRound.status === 'open' && (
                                                <div className="time-remaining">
                                                    {formatTimeRemaining(selectedRound.close_time)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Submissions Summary */}
                                    <div className="submissions-summary">
                                        <div className="summary-card">
                                            <span className="summary-value">{submissions.length}</span>
                                            <span className="summary-label">รายการ</span>
                                        </div>
                                        <div className="summary-card">
                                            <span className="summary-value">
                                                {selectedRound.currency_symbol}{totalAmount.toLocaleString()}
                                            </span>
                                            <span className="summary-label">ยอดรวม</span>
                                        </div>
                                        <div className="summary-card highlight">
                                            <span className="summary-value">
                                                {selectedRound.currency_symbol}{totalCommission.toLocaleString()}
                                            </span>
                                            <span className="summary-label">ค่าคอม</span>
                                        </div>
                                    </div>

                                    {/* Submissions List */}
                                    <div className="submissions-list card">
                                        <h3>รายการที่ส่ง</h3>
                                        {submissions.length === 0 ? (
                                            <div className="empty-state">
                                                <FiList className="empty-icon" />
                                                <p>ยังไม่มีรายการ</p>
                                            </div>
                                        ) : (
                                            <div className="submissions-table-wrap">
                                                <table className="submissions-table">
                                                    <thead>
                                                        <tr>
                                                            <th>ประเภท</th>
                                                            <th>เลข</th>
                                                            <th>จำนวน</th>
                                                            <th>ค่าคอม</th>
                                                            <th>เวลา</th>
                                                            <th></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {submissions.map(sub => (
                                                            <tr key={sub.id} className={sub.is_winner ? 'winner' : ''}>
                                                                <td>
                                                                    <span className="type-badge">
                                                                        {BET_TYPES[sub.bet_type]?.label}
                                                                    </span>
                                                                </td>
                                                                <td className="number-cell">{sub.numbers}</td>
                                                                <td>{selectedRound.currency_symbol}{sub.amount?.toLocaleString()}</td>
                                                                <td className="commission-cell">
                                                                    {selectedRound.currency_symbol}{sub.commission_amount?.toLocaleString()}
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
                                                                            onClick={() => handleDelete(sub.id)}
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
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state card">
                                    <FiCalendar className="empty-icon" />
                                    <h3>เลือกงวดหวย</h3>
                                    <p>เลือกงวดจากรายการด้านซ้าย</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <HistoryTab user={user} profile={profile} />
                )}

                {activeTab === 'commission' && (
                    <CommissionTab user={user} profile={profile} userSettings={userSettings} />
                )}
            </div>

            {/* Submit Modal */}
            {showSubmitModal && selectedRound && (
                <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiPlus /> ส่งเลข</h3>
                            <button className="modal-close" onClick={() => setShowSubmitModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    เลข ({BET_TYPES[submitForm.bet_type]?.digits || '-'} หลัก)
                                </label>
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
                                                setTimeout(() => {
                                                    amountInputRef.current.focus()
                                                    amountInputRef.current.select()
                                                    amountInputRef.current.setSelectionRange(0, 9999)
                                                }, 50)
                                            }
                                        }
                                    }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">จำนวนเงิน ({selectedRound.currency_name})</label>
                                <input
                                    ref={amountInputRef}
                                    type="text"
                                    className="form-input"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={submitForm.amount}
                                    onChange={e => setSubmitForm({
                                        ...submitForm,
                                        amount: e.target.value.replace(/[ \-.,]/g, '*').replace(/[^\d*]/g, '')
                                    })}
                                />
                            </div>

                            {/* Bet Type Selection */}
                            <div className="form-group">
                                <label className="form-label">ประเภท</label>
                                <div className="bet-type-grid">
                                    {(() => {
                                        const digits = submitForm.numbers.replace(/\*/g, '').length
                                        const hasStarInNumbers = submitForm.numbers.includes('*')
                                        const hasStarInAmount = submitForm.amount.toString().includes('*')
                                        const lotteryType = selectedRound.lottery_type
                                        const amount = submitForm.amount.toString()
                                        const isAmountEmpty = !amount || amount === '0' || amount === ''

                                        let available = []

                                        if (digits === 1) {
                                            available = ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1']
                                        } else if (digits === 2) {
                                            available = ['2_top', '2_front', '2_spread', '2_bottom']
                                            if (!hasStarInAmount) available.splice(3, 0, '2_have')
                                        } else if (digits === 3) {
                                            if (!isAmountEmpty) {
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
                                        } else if (digits === 4) {
                                            if (lotteryType === 'lao') {
                                                if (isAmountEmpty) {
                                                    available = ['4_set']
                                                } else {
                                                    const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                    available = [
                                                        '4_set',
                                                        '4_float',
                                                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            } else { // thai, hanoi
                                                if (!isAmountEmpty) {
                                                    const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                    available = [
                                                        '4_float',
                                                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            }
                                        } else if (digits === 5) {
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
                                                    className={`bet-type-btn ${submitForm.bet_type === key ? 'active' : ''}`}
                                                    onClick={() => handleSubmit(key)}
                                                    disabled={submitting}
                                                >
                                                    {submitting && submitForm.bet_type === key ? 'กำลังส่ง...' : label}
                                                </button>
                                            )
                                        })
                                    })()}
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
                </div >
            )
            }
        </div >
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
