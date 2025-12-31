import { useState, useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import QRCode from 'react-qr-code'
import {
    FiPlus,
    FiUsers,
    FiFileText,
    FiSettings,
    FiCalendar,
    FiClock,
    FiDollarSign,
    FiEdit2,
    FiTrash2,
    FiCheck,
    FiX,
    FiShare2,
    FiCopy,
    FiAlertTriangle,
    FiEye,
    FiLock
} from 'react-icons/fi'
import './Dealer.css'

// Bet type labels
const BET_TYPES = {
    '2_top': '2 ตัวบน',
    '2_bottom': '2 ตัวล่าง',
    '3_top': '3 ตัวบน',
    '3_tod': '3 ตัวโต๊ด',
    '3_front': '3 ตัวหน้า',
    '3_back': '3 ตัวล่าง',
    '4_tod': '4 ตัวโต๊ด',
    '6_top': '6 ตัวบน (รางวัลที่ 1)'
}

// Lottery type labels
const LOTTERY_TYPES = {
    'thai': 'หวยไทย',
    'lao': 'หวยลาว',
    'hanoi': 'หวยฮานอย',
    'yeekee': 'หวยยี่กี',
    'other': 'อื่นๆ'
}

// Default payout rates
const DEFAULT_PAYOUTS = {
    '2_top': 90,
    '2_bottom': 90,
    '3_top': 500,
    '3_tod': 150,
    '3_front': 500,
    '3_back': 500,
    '4_tod': 5000,
    '6_top': 100000
}

// Default limits
const DEFAULT_LIMITS = {
    '2_top': 1000,
    '2_bottom': 1000,
    '3_top': 500,
    '3_tod': 500,
    '3_front': 500,
    '3_back': 500,
    '4_tod': 200,
    '6_top': 100
}

export default function Dealer() {
    const { user, profile, isDealer, isSuperAdmin } = useAuth()
    const [searchParams] = useSearchParams()
    const [activeTab, setActiveTab] = useState('rounds')
    const [rounds, setRounds] = useState([])
    const [members, setMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRound, setSelectedRound] = useState(null)

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showLimitsModal, setShowLimitsModal] = useState(false)
    const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
    const [showResultsModal, setShowResultsModal] = useState(false)
    const [showUserSettingsModal, setShowUserSettingsModal] = useState(false)
    const [showNumberLimitsModal, setShowNumberLimitsModal] = useState(false)
    const [selectedMember, setSelectedMember] = useState(null)

    // Form state for creating round
    const [roundForm, setRoundForm] = useState({
        lottery_type: 'lao',
        lottery_name: '',
        round_date: new Date().toISOString().split('T')[0],
        open_time: '08:00',
        close_time: '14:00',
        delete_before_minutes: 30,
        currency_symbol: '฿',
        currency_name: 'บาท',
        type_limits: { ...DEFAULT_LIMITS },
        payout_rates: { ...DEFAULT_PAYOUTS }
    })

    // Fetch data on tab change
    useEffect(() => {
        if (user && (isDealer || isSuperAdmin)) {
            fetchData()
        }
    }, [activeTab, user, isDealer, isSuperAdmin])

    async function fetchData() {
        setLoading(true)
        try {
            // Fetch rounds
            const { data: roundsData, error: roundsError } = await supabase
                .from('lottery_rounds')
                .select(`
                    *,
                    type_limits (*),
                    submissions (id)
                `)
                .eq('dealer_id', user.id)
                .order('round_date', { ascending: false })
                .limit(20)

            if (!roundsError) {
                setRounds(roundsData || [])
                if (!selectedRound && roundsData?.length > 0) {
                    setSelectedRound(roundsData[0])
                }
            }

            // Fetch members
            const { data: membersData } = await supabase
                .from('profiles')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            setMembers(membersData || [])

        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    // Redirect if not dealer or admin (after hooks)
    if (!profile) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>กำลังโหลด...</p>
            </div>
        )
    }

    if (!isDealer && !isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    // Create new round
    async function handleCreateRound() {
        try {
            // Combine date and time
            const openDateTime = new Date(`${roundForm.round_date}T${roundForm.open_time}:00`)
            const closeDateTime = new Date(`${roundForm.round_date}T${roundForm.close_time}:00`)

            // Create round
            const { data: round, error: roundError } = await supabase
                .from('lottery_rounds')
                .insert({
                    dealer_id: user.id,
                    lottery_type: roundForm.lottery_type,
                    lottery_name: roundForm.lottery_name || LOTTERY_TYPES[roundForm.lottery_type],
                    round_date: roundForm.round_date,
                    open_time: openDateTime.toISOString(),
                    close_time: closeDateTime.toISOString(),
                    delete_before_minutes: roundForm.delete_before_minutes,
                    currency_symbol: roundForm.currency_symbol,
                    currency_name: roundForm.currency_name
                })
                .select()
                .single()

            if (roundError) throw roundError

            // Create type limits
            const typeLimitsData = Object.entries(roundForm.type_limits).map(([betType, maxAmount]) => ({
                round_id: round.id,
                bet_type: betType,
                max_per_number: maxAmount,
                payout_rate: roundForm.payout_rates[betType] || DEFAULT_PAYOUTS[betType]
            }))

            const { error: limitsError } = await supabase
                .from('type_limits')
                .insert(typeLimitsData)

            if (limitsError) throw limitsError

            setShowCreateModal(false)
            fetchData()
            alert('สร้างงวดสำเร็จ!')

        } catch (error) {
            console.error('Error creating round:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Close round
    async function handleCloseRound(roundId) {
        if (!confirm('ต้องการปิดงวดนี้?')) return

        try {
            const { error } = await supabase
                .from('lottery_rounds')
                .update({ status: 'closed' })
                .eq('id', roundId)

            if (!error) fetchData()
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Delete round
    async function handleDeleteRound(roundId) {
        if (!confirm('ต้องการลบงวดนี้? (จะลบข้อมูลทั้งหมด)')) return

        try {
            const { error } = await supabase
                .from('lottery_rounds')
                .delete()
                .eq('id', roundId)

            if (!error) {
                setSelectedRound(null)
                fetchData()
            }
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Get status badge
    const getStatusBadge = (round) => {
        const now = new Date()
        const closeTime = new Date(round.close_time)

        if (round.status === 'announced') {
            return <span className="status-badge announced"><FiCheck /> ประกาศผลแล้ว</span>
        }
        if (round.status === 'closed' || now > closeTime) {
            return <span className="status-badge closed"><FiLock /> ปิดรับแล้ว</span>
        }
        return <span className="status-badge open"><FiClock /> เปิดรับอยู่</span>
    }

    // Format time
    const formatTime = (isoString) => {
        return new Date(isoString).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    return (
        <div className="dealer-page">
            <div className="container">
                <div className="page-header">
                    <h1><FiFileText /> แดชบอร์ดเจ้ามือ</h1>
                    <p>จัดการงวดหวยและดูรายการที่ส่งเข้ามา</p>
                </div>

                {/* Tabs */}
                <div className="dealer-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'rounds' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rounds')}
                    >
                        <FiCalendar /> งวดหวย
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => setActiveTab('members')}
                    >
                        <FiUsers /> สมาชิก ({members.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <FiSettings /> ตั้งค่า
                    </button>
                </div>

                {/* Tab Content */}
                <div className="dealer-content">
                    {activeTab === 'rounds' && (
                        <div className="rounds-section">
                            {/* Create Button */}
                            <div className="section-header">
                                <h2>งวดหวยทั้งหมด</h2>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowCreateModal(true)}
                                >
                                    <FiPlus /> สร้างงวดใหม่
                                </button>
                            </div>

                            {/* Rounds List */}
                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : rounds.length === 0 ? (
                                <div className="empty-state card">
                                    <FiCalendar className="empty-icon" />
                                    <h3>ยังไม่มีงวดหวย</h3>
                                    <p>กดปุ่ม "สร้างงวดใหม่" เพื่อเริ่มต้น</p>
                                </div>
                            ) : (
                                <div className="rounds-grid">
                                    {rounds.map(round => (
                                        <div
                                            key={round.id}
                                            className={`round-card card ${selectedRound?.id === round.id ? 'selected' : ''}`}
                                            onClick={() => setSelectedRound(round)}
                                        >
                                            <div className="round-header">
                                                <div className="round-type">
                                                    <span className={`lottery-badge ${round.lottery_type}`}>
                                                        {LOTTERY_TYPES[round.lottery_type]}
                                                    </span>
                                                    {getStatusBadge(round)}
                                                </div>
                                                <div className="round-actions">
                                                    <button
                                                        className="icon-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedRound(round)
                                                            setShowSubmissionsModal(true)
                                                        }}
                                                        title="ดูเลขที่ส่ง"
                                                    >
                                                        <FiEye />
                                                    </button>
                                                    {round.status === 'open' && (
                                                        <button
                                                            className="icon-btn warning"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleCloseRound(round.id)
                                                            }}
                                                            title="ปิดงวด"
                                                        >
                                                            <FiLock />
                                                        </button>
                                                    )}
                                                    <button
                                                        className="icon-btn warning"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedRound(round)
                                                            setShowNumberLimitsModal(true)
                                                        }}
                                                        title="ตั้งค่าเลขอั้น"
                                                    >
                                                        <FiAlertTriangle />
                                                    </button>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDeleteRound(round.id)
                                                        }}
                                                        title="ลบ"
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="round-info">
                                                <h3>{round.lottery_name || LOTTERY_TYPES[round.lottery_type]}</h3>
                                                <div className="round-date">
                                                    <FiCalendar />
                                                    <span>{formatDate(round.round_date)}</span>
                                                </div>
                                                <div className="round-time">
                                                    <FiClock />
                                                    <span>
                                                        {formatTime(round.open_time)} - {formatTime(round.close_time)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="round-stats">
                                                <div className="stat">
                                                    <span className="stat-value">{round.submissions?.length || 0}</span>
                                                    <span className="stat-label">รายการ</span>
                                                </div>
                                                <div className="stat">
                                                    <span className="stat-value">
                                                        {round.currency_symbol}
                                                    </span>
                                                    <span className="stat-label">{round.currency_name}</span>
                                                </div>
                                            </div>

                                            {round.status === 'closed' && !round.is_result_announced && (
                                                <button
                                                    className="btn btn-accent btn-sm full-width"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setSelectedRound(round)
                                                        setShowResultsModal(true)
                                                    }}
                                                >
                                                    <FiCheck /> ใส่ผลรางวัล
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="members-section">
                            {/* Referral Section */}
                            <div className="referral-card card">
                                <div className="referral-header">
                                    <h3><FiShare2 /> ลิงก์รับสมัครสมาชิก</h3>
                                    <p>ส่งลิงก์หรือ QR Code นี้ให้สมาชิกเพื่อเข้ากลุ่มของคุณ</p>
                                </div>
                                <div className="referral-content">
                                    <div className="qr-wrapper">
                                        <div className="qr-code-bg">
                                            <QRCode
                                                value={`${window.location.origin}/register?ref=${user?.id}`}
                                                size={120}
                                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                            />
                                        </div>
                                    </div>
                                    <div className="link-wrapper">
                                        <div className="referral-link">
                                            {`${window.location.origin}/register?ref=${user?.id}`}
                                        </div>
                                        <button
                                            className="btn btn-outline btn-sm"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user?.id}`)
                                                alert('คัดลอกลิงก์แล้ว!')
                                            }}
                                        >
                                            <FiCopy /> คัดลอก
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Members List */}
                            <div className="section-header">
                                <h2>รายชื่อสมาชิก</h2>
                                <span className="badge">{members.length} คน</span>
                            </div>

                            {members.length === 0 ? (
                                <div className="empty-state card">
                                    <FiUsers className="empty-icon" />
                                    <h3>ยังไม่มีสมาชิก</h3>
                                    <p>ส่งลิงก์ด้านบนให้คนที่ต้องการเข้าร่วม</p>
                                </div>
                            ) : (
                                <div className="table-wrap card">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>ชื่อ</th>
                                                <th>อีเมล</th>
                                                <th>เบอร์โทร</th>
                                                <th>วันที่สมัคร</th>
                                                <th>จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {members.map(member => (
                                                <tr key={member.id}>
                                                    <td>{member.full_name || '-'}</td>
                                                    <td>{member.email}</td>
                                                    <td>{member.phone || '-'}</td>
                                                    <td className="time-cell">
                                                        {formatDate(member.created_at)}
                                                    </td>
                                                    <td>
                                                        <button
                                                            className="icon-btn"
                                                            title="ตั้งค่าคอม"
                                                            onClick={() => {
                                                                setSelectedMember(member)
                                                                setShowUserSettingsModal(true)
                                                            }}
                                                        >
                                                            <FiSettings />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="settings-section">
                            <div className="card">
                                <h3>ค่าเริ่มต้น</h3>
                                <p>ตั้งค่าอัตราจ่ายและค่าอั้นเริ่มต้นสำหรับงวดใหม่</p>
                                {/* Settings form will be added later */}
                                <p className="text-muted" style={{ marginTop: '1rem' }}>
                                    (กำลังพัฒนา)
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Round Modal */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiPlus /> สร้างงวดหวยใหม่</h3>
                            <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Lottery Type */}
                            <div className="form-group">
                                <label className="form-label">ประเภทหวย</label>
                                <div className="lottery-type-grid">
                                    {Object.entries(LOTTERY_TYPES).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`type-option ${roundForm.lottery_type === key ? 'active' : ''}`}
                                            onClick={() => setRoundForm({ ...roundForm, lottery_type: key })}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Name */}
                            <div className="form-group">
                                <label className="form-label">ชื่องวด (ไม่บังคับ)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={LOTTERY_TYPES[roundForm.lottery_type]}
                                    value={roundForm.lottery_name}
                                    onChange={e => setRoundForm({ ...roundForm, lottery_name: e.target.value })}
                                />
                            </div>

                            {/* Date & Time */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">วันที่</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={roundForm.round_date}
                                        onChange={e => setRoundForm({ ...roundForm, round_date: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาเปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.open_time}
                                        onChange={e => setRoundForm({ ...roundForm, open_time: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.close_time}
                                        onChange={e => setRoundForm({ ...roundForm, close_time: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Delete Before */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">ลบเลขได้ก่อนปิดรับ (นาที)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={roundForm.delete_before_minutes}
                                        onChange={e => setRoundForm({ ...roundForm, delete_before_minutes: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">สัญลักษณ์สกุลเงิน</label>
                                    <select
                                        className="form-input"
                                        value={roundForm.currency_symbol}
                                        onChange={e => {
                                            const symbol = e.target.value
                                            const name = symbol === '฿' ? 'บาท' : 'กีบ'
                                            setRoundForm({ ...roundForm, currency_symbol: symbol, currency_name: name })
                                        }}
                                    >
                                        <option value="฿">฿ บาท</option>
                                        <option value="₭">₭ กีบ</option>
                                    </select>
                                </div>
                            </div>

                            {/* Limits & Payouts */}
                            <div className="form-section">
                                <h4>อัตราจ่าย & ค่าอั้นตามประเภท</h4>
                                <div className="limits-grid">
                                    {Object.entries(BET_TYPES).map(([key, label]) => (
                                        <div key={key} className="limit-row">
                                            <span className="limit-label">{label}</span>
                                            <div className="limit-inputs">
                                                <div className="input-group">
                                                    <span className="input-prefix">จ่าย</span>
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={roundForm.payout_rates[key]}
                                                        onChange={e => setRoundForm({
                                                            ...roundForm,
                                                            payout_rates: {
                                                                ...roundForm.payout_rates,
                                                                [key]: parseInt(e.target.value) || 0
                                                            }
                                                        })}
                                                    />
                                                    <span className="input-suffix">เท่า</span>
                                                </div>
                                                <div className="input-group">
                                                    <span className="input-prefix">อั้น</span>
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={roundForm.type_limits[key]}
                                                        onChange={e => setRoundForm({
                                                            ...roundForm,
                                                            type_limits: {
                                                                ...roundForm.type_limits,
                                                                [key]: parseInt(e.target.value) || 0
                                                            }
                                                        })}
                                                    />
                                                    <span className="input-suffix">{roundForm.currency_name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleCreateRound}>
                                <FiCheck /> สร้างงวด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Submissions Modal */}
            {showSubmissionsModal && selectedRound && (
                <SubmissionsModal
                    round={selectedRound}
                    onClose={() => setShowSubmissionsModal(false)}
                />
            )}

            {/* Results Modal */}
            {showResultsModal && selectedRound && (
                <ResultsModal
                    round={selectedRound}
                    onClose={() => {
                        setShowResultsModal(false)
                        fetchData()
                    }}
                />
            )}

            {/* Number Limits Modal */}
            {showNumberLimitsModal && selectedRound && (
                <NumberLimitsModal
                    round={selectedRound}
                    onClose={() => setShowNumberLimitsModal(false)}
                />
            )}

            {/* User Settings Modal */}
            {showUserSettingsModal && selectedMember && (
                <UserSettingsModal
                    member={selectedMember}
                    onClose={() => {
                        setShowUserSettingsModal(false)
                        setSelectedMember(null)
                    }}
                />
            )}
        </div>
    )
}

// Submissions Modal Component
function SubmissionsModal({ round, onClose }) {
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')

    useEffect(() => {
        fetchSubmissions()
    }, [])

    async function fetchSubmissions() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select(`
                    *,
                    profiles (full_name, email)
                `)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!error) setSubmissions(data || [])
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    // Group by bet type for summary
    const summaryByType = submissions.reduce((acc, sub) => {
        if (!acc[sub.bet_type]) {
            acc[sub.bet_type] = { count: 0, amount: 0 }
        }
        acc[sub.bet_type].count++
        acc[sub.bet_type].amount += sub.amount
        return acc
    }, {})

    // Filter submissions
    const filteredSubmissions = filter === 'all'
        ? submissions
        : submissions.filter(s => s.bet_type === filter)

    const totalAmount = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiEye /> รายการที่ส่งเข้ามา - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Summary */}
                    <div className="summary-grid">
                        <div className="summary-card">
                            <span className="summary-value">{submissions.length}</span>
                            <span className="summary-label">รายการทั้งหมด</span>
                        </div>
                        <div className="summary-card highlight">
                            <span className="summary-value">
                                {round.currency_symbol}{totalAmount.toLocaleString()}
                            </span>
                            <span className="summary-label">ยอดรวม</span>
                        </div>
                        {Object.entries(summaryByType).map(([type, data]) => (
                            <div key={type} className="summary-card">
                                <span className="summary-value">{data.count}</span>
                                <span className="summary-label">{BET_TYPES[type]}</span>
                            </div>
                        ))}
                    </div>

                    {/* Filter */}
                    <div className="filter-row">
                        <button
                            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                            onClick={() => setFilter('all')}
                        >
                            ทั้งหมด
                        </button>
                        {Object.entries(BET_TYPES).map(([key, label]) => (
                            <button
                                key={key}
                                className={`filter-btn ${filter === key ? 'active' : ''}`}
                                onClick={() => setFilter(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : filteredSubmissions.length === 0 ? (
                        <div className="empty-state">
                            <p>ไม่มีรายการ</p>
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ผู้ส่ง</th>
                                        <th>ประเภท</th>
                                        <th>เลข</th>
                                        <th>จำนวน</th>
                                        <th>เวลา</th>
                                        <th>สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSubmissions.map(sub => (
                                        <tr key={sub.id} className={sub.is_winner ? 'winner-row' : ''}>
                                            <td>
                                                <div className="user-cell">
                                                    <span className="user-name">{sub.profiles?.full_name || 'ไม่ระบุ'}</span>
                                                    <span className="user-email">{sub.profiles?.email}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="type-badge">{BET_TYPES[sub.bet_type]}</span>
                                            </td>
                                            <td className="number-cell">{sub.numbers}</td>
                                            <td>{round.currency_symbol}{sub.amount?.toLocaleString()}</td>
                                            <td className="time-cell">
                                                {new Date(sub.created_at).toLocaleTimeString('th-TH', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </td>
                                            <td>
                                                {round.is_result_announced ? (
                                                    sub.is_winner ? (
                                                        <span className="status-badge won"><FiCheck /> ถูกรางวัล</span>
                                                    ) : (
                                                        <span className="status-badge lost">ไม่ถูก</span>
                                                    )
                                                ) : (
                                                    <span className="status-badge pending">รอผล</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Results Modal Component
function ResultsModal({ round, onClose }) {
    const [winningNumbers, setWinningNumbers] = useState({
        '2_top': '',
        '2_bottom': '',
        '3_top': '',
        '3_front': '',
        '3_back': '',
        '6_top': ''
    })
    const [loading, setLoading] = useState(false)

    async function handleAnnounce() {
        if (!confirm('ยืนยันประกาศผลรางวัล?')) return

        setLoading(true)
        try {
            // Update round with winning numbers
            const { error: roundError } = await supabase
                .from('lottery_rounds')
                .update({
                    winning_numbers: winningNumbers,
                    is_result_announced: true,
                    status: 'announced'
                })
                .eq('id', round.id)

            if (roundError) throw roundError

            // Calculate winners (call RPC function)
            const { data: winCount, error: calcError } = await supabase
                .rpc('calculate_round_winners', { p_round_id: round.id })

            if (calcError) {
                console.error('Error calculating winners:', calcError)
            }

            alert(`ประกาศผลสำเร็จ! มีผู้ถูกรางวัล ${winCount || 0} รายการ`)
            onClose()

        } catch (error) {
            console.error('Error:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiCheck /> ใส่ผลรางวัล</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        กรอกเลขที่ออกรางวัลสำหรับงวด {round.lottery_name}
                    </p>

                    <div className="results-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">6 ตัว (รางวัลที่ 1)</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={winningNumbers['6_top']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '6_top': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">3 ตัวบน</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={3}
                                    placeholder="000"
                                    value={winningNumbers['3_top']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '3_top': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">3 ตัวหน้า</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={3}
                                    placeholder="000"
                                    value={winningNumbers['3_front']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '3_front': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">3 ตัวล่าง</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={3}
                                    placeholder="000"
                                    value={winningNumbers['3_back']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '3_back': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">2 ตัวบน</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={2}
                                    placeholder="00"
                                    value={winningNumbers['2_top']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '2_top': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">2 ตัวล่าง</label>
                                <input
                                    type="text"
                                    className="form-input result-input"
                                    maxLength={2}
                                    placeholder="00"
                                    value={winningNumbers['2_bottom']}
                                    onChange={e => setWinningNumbers({
                                        ...winningNumbers,
                                        '2_bottom': e.target.value.replace(/\D/g, '')
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleAnnounce}
                        disabled={loading}
                    >
                        {loading ? 'กำลังประกาศ...' : (
                            <><FiCheck /> ประกาศผล</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Number Limits Modal Component
function NumberLimitsModal({ round, onClose }) {
    const [limits, setLimits] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newLimit, setNewLimit] = useState({
        bet_type: '2_top',
        numbers: '',
        max_amount: ''
    })

    useEffect(() => {
        fetchLimits()
    }, [round.id])

    async function fetchLimits() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('number_limits')
                .select('*')
                .eq('round_id', round.id)
                .order('created_at', { ascending: false })

            if (!error) setLimits(data || [])
        } catch (error) {
            console.error('Error fetching limits:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleAddLimit() {
        if (!newLimit.numbers || !newLimit.max_amount) {
            alert('กรุณากรอกข้อมูลให้ครบ')
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase
                .from('number_limits')
                .insert({
                    round_id: round.id,
                    bet_type: newLimit.bet_type,
                    numbers: newLimit.numbers,
                    max_amount: parseFloat(newLimit.max_amount)
                })

            if (error) throw error

            setNewLimit({ ...newLimit, numbers: '', max_amount: '' })
            fetchLimits()
        } catch (error) {
            console.error('Error adding limit:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteLimit(id) {
        if (!confirm('ต้องการลบเลขอั้นนี้?')) return

        try {
            const { error } = await supabase
                .from('number_limits')
                .delete()
                .eq('id', id)

            if (!error) fetchLimits()
        } catch (error) {
            console.error('Error deleting limit:', error)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiAlertTriangle /> ตั้งค่าเลขอั้น - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Add Form */}
                    <div className="add-limit-form card">
                        <h4>เพิ่มเลขอั้นใหม่</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">ประเภท</label>
                                <select
                                    className="form-input"
                                    value={newLimit.bet_type}
                                    onChange={e => setNewLimit({ ...newLimit, bet_type: e.target.value })}
                                >
                                    {Object.entries(BET_TYPES).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">เลข</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 47"
                                    value={newLimit.numbers}
                                    onChange={e => setNewLimit({ ...newLimit, numbers: e.target.value.replace(/\D/g, '') })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">รับสูงสุด ({round.currency_name})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    placeholder="0"
                                    value={newLimit.max_amount}
                                    onChange={e => setNewLimit({ ...newLimit, max_amount: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button
                                    className="btn btn-primary full-width"
                                    onClick={handleAddLimit}
                                    disabled={saving}
                                >
                                    <FiPlus /> เพิ่ม
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Limits List */}
                    <div className="limits-list-section">
                        <h4>รายการเลขอั้นปัจจุบัน</h4>
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                            </div>
                        ) : limits.length === 0 ? (
                            <p className="text-muted">ยังไม่มีการตั้งค่าเลขอั้นเฉพาะเลข</p>
                        ) : (
                            <div className="table-wrap">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>ประเภท</th>
                                            <th>เลข</th>
                                            <th>รับสูงสุด</th>
                                            <th>จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {limits.map(limit => (
                                            <tr key={limit.id}>
                                                <td>{BET_TYPES[limit.bet_type]}</td>
                                                <td className="number-cell">{limit.numbers}</td>
                                                <td>{round.currency_symbol}{limit.max_amount?.toLocaleString()}</td>
                                                <td>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={() => handleDeleteLimit(limit.id)}
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
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    )
}

// User Settings Modal Component
function UserSettingsModal({ member, onClose }) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [settings, setSettings] = useState({
        commission_rates: {
            '2_top': 10, '2_bottom': 10,
            '3_top': 10, '3_tod': 10, '3_front': 10, '3_back': 10,
            '4_tod': 10,
            '6_top': 10
        }
    })

    useEffect(() => {
        fetchSettings()
    }, [member.id])

    async function fetchSettings() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', member.id)
                .eq('dealer_id', user.id)
                .single()

            if (data) {
                setSettings(data)
            }
        } catch (error) {
            console.error('Error fetching user settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: member.id,
                    dealer_id: user.id,
                    commission_rates: settings.commission_rates,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, dealer_id' })

            if (error) throw error
            alert('บันทึกการตั้งค่าสำเร็จ')
            onClose()
        } catch (error) {
            console.error('Error saving user settings:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiSettings /> ตั้งค่าสมาชิก: {member.full_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div className="settings-form">
                            <h4>% ค่าคอมมิชชั่นที่สมาชิกได้รับ</h4>
                            <p className="text-muted mb-4">ระบุเปอร์เซ็นต์ค่าคอมมิชชั่นสำหรับแต่ละประเภทหวย</p>

                            <div className="limits-grid">
                                {Object.entries(BET_TYPES).map(([key, label]) => (
                                    <div key={key} className="limit-row">
                                        <span className="limit-label">{label}</span>
                                        <div className="limit-inputs">
                                            <div className="input-group">
                                                <input
                                                    type="number"
                                                    className="form-input small"
                                                    value={settings.commission_rates[key]}
                                                    onChange={e => setSettings({
                                                        ...settings,
                                                        commission_rates: {
                                                            ...settings.commission_rates,
                                                            [key]: parseFloat(e.target.value) || 0
                                                        }
                                                    })}
                                                />
                                                <span className="input-suffix">%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading || saving}
                    >
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
