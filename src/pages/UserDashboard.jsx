import { useState, useEffect } from 'react'
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
    '2_top': { label: '2 ตัวบน', digits: 2 },
    '2_bottom': { label: '2 ตัวล่าง', digits: 2 },
    '3_top': { label: '3 ตัวบน', digits: 3 },
    '3_tod': { label: '3 ตัวโต๊ด', digits: 3 },
    '3_front': { label: '3 ตัวหน้า', digits: 3 },
    '3_back': { label: '3 ตัวล่าง', digits: 3 },
    '4_tod': { label: '4 ตัวโต๊ด', digits: 4 },
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

export default function UserDashboard() {
    const { user, profile } = useAuth()
    const [rounds, setRounds] = useState([])
    const [selectedRound, setSelectedRound] = useState(null)
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('rounds') // rounds, history, commission

    // Submit form state
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [submitForm, setSubmitForm] = useState({
        bet_type: '2_top',
        numbers: '',
        amount: ''
    })
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (profile?.dealer_id) {
            fetchRounds()
        }
    }, [profile])

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
    async function handleSubmit() {
        if (!submitForm.numbers || !submitForm.amount) {
            alert('กรุณากรอกเลขและจำนวนเงิน')
            return
        }

        const betTypeInfo = BET_TYPES[submitForm.bet_type]
        if (submitForm.numbers.length !== betTypeInfo.digits) {
            alert(`${betTypeInfo.label} ต้องมี ${betTypeInfo.digits} หลัก`)
            return
        }

        setSubmitting(true)
        try {
            // Get commission rate from user settings
            const { data: settings } = await supabase
                .from('user_settings')
                .select('commission_rates')
                .eq('user_id', user.id)
                .eq('dealer_id', profile.dealer_id)
                .single()

            const commissionRate = settings?.commission_rates?.[submitForm.bet_type] || 0
            const amount = parseFloat(submitForm.amount)
            const commissionAmount = (amount * commissionRate) / 100

            const { error } = await supabase
                .from('submissions')
                .insert({
                    round_id: selectedRound.id,
                    user_id: user.id,
                    bet_type: submitForm.bet_type,
                    numbers: submitForm.numbers,
                    amount: amount,
                    commission_rate: commissionRate,
                    commission_amount: commissionAmount
                })

            if (error) throw error

            // Reset form
            setSubmitForm({ ...submitForm, numbers: '', amount: '' })
            fetchSubmissions()
            alert('ส่งเลขสำเร็จ!')

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
                    <CommissionTab user={user} profile={profile} />
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
                            {/* Bet Type Selection */}
                            <div className="form-group">
                                <label className="form-label">ประเภท</label>
                                <div className="bet-type-grid">
                                    {Object.entries(BET_TYPES).map(([key, info]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`bet-type-btn ${submitForm.bet_type === key ? 'active' : ''}`}
                                            onClick={() => setSubmitForm({ ...submitForm, bet_type: key, numbers: '' })}
                                        >
                                            {info.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Number Input */}
                            <div className="form-group">
                                <label className="form-label">
                                    เลข ({BET_TYPES[submitForm.bet_type].digits} หลัก)
                                </label>
                                <input
                                    type="text"
                                    className="form-input number-input"
                                    maxLength={BET_TYPES[submitForm.bet_type].digits}
                                    placeholder={'0'.repeat(BET_TYPES[submitForm.bet_type].digits)}
                                    value={submitForm.numbers}
                                    onChange={e => setSubmitForm({
                                        ...submitForm,
                                        numbers: e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>

                            {/* Amount Input */}
                            <div className="form-group">
                                <label className="form-label">จำนวนเงิน ({selectedRound.currency_name})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    placeholder="0"
                                    value={submitForm.amount}
                                    onChange={e => setSubmitForm({
                                        ...submitForm,
                                        amount: e.target.value
                                    })}
                                />
                            </div>

                            {/* Payout Info */}
                            {selectedRound.type_limits && (
                                <div className="payout-info">
                                    <span>อัตราจ่าย:</span>
                                    <strong>
                                        {selectedRound.type_limits.find(l => l.bet_type === submitForm.bet_type)?.payout_rate || '-'}
                                        เท่า
                                    </strong>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowSubmitModal(false)}>
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? 'กำลังส่ง...' : (
                                    <><FiSend /> ส่งเลข</>
                                )}
                            </button>
                        </div>
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
function CommissionTab({ user, profile }) {
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [totalCommission, setTotalCommission] = useState(0)

    useEffect(() => {
        fetchSettings()
    }, [])

    async function fetchSettings() {
        setLoading(true)
        try {
            // Get user settings
            const { data: settingsData } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .eq('dealer_id', profile.dealer_id)
                .single()

            setSettings(settingsData)

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
                {settings?.commission_rates ? (
                    <div className="rates-grid">
                        {Object.entries(BET_TYPES).map(([key, info]) => (
                            <div key={key} className="rate-item">
                                <span className="rate-label">{info.label}</span>
                                <span className="rate-value">
                                    {settings.commission_rates[key] || 0}%
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
