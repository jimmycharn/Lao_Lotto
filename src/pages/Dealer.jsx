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
    'stock': 'หวยหุ้น'
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
    const [showSummaryModal, setShowSummaryModal] = useState(false)
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

                                            {/* Show button if closed OR time has passed, and result not announced */}
                                            {(round.status === 'closed' || new Date() > new Date(round.close_time)) &&
                                                round.status !== 'announced' && !round.is_result_announced && (
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

                                            {/* Show edit button for announced rounds */}
                                            {round.status === 'announced' && round.is_result_announced && (
                                                <>
                                                    <button
                                                        className="btn btn-primary btn-sm full-width"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedRound(round)
                                                            setShowSummaryModal(true)
                                                        }}
                                                    >
                                                        <FiDollarSign /> ดูสรุปยอด
                                                    </button>
                                                    <button
                                                        className="btn btn-outline btn-sm full-width"
                                                        style={{ marginTop: '0.5rem' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedRound(round)
                                                            setShowResultsModal(true)
                                                        }}
                                                    >
                                                        <FiEdit2 /> แก้ไขผลรางวัล
                                                    </button>
                                                </>
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

            {/* Summary Modal */}
            {showSummaryModal && selectedRound && (
                <SummaryModal
                    round={selectedRound}
                    onClose={() => setShowSummaryModal(false)}
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
    const lotteryType = round.lottery_type
    const isEditing = round.is_result_announced // Check if we're editing existing results

    // State for different lottery types
    const [thaiForm, setThaiForm] = useState({
        '6_top': '',
        '2_bottom': '',
        '3_bottom_1': '',
        '3_bottom_2': '',
        '3_bottom_3': '',
        '3_bottom_4': ''
    })

    const [laoForm, setLaoForm] = useState({
        '4_set': ''
    })

    const [hanoiForm, setHanoiForm] = useState({
        '4_set': '',
        '2_bottom': ''
    })

    const [stockForm, setStockForm] = useState({
        '2_top': '',
        '2_bottom': ''
    })

    const [loading, setLoading] = useState(false)

    // Load existing winning numbers if editing
    useEffect(() => {
        if (isEditing && round.winning_numbers) {
            const wn = round.winning_numbers
            console.log('Loading existing winning numbers:', wn)

            if (lotteryType === 'thai') {
                setThaiForm({
                    '6_top': wn['6_top'] || '',
                    '2_bottom': wn['2_bottom'] || '',
                    '3_bottom_1': wn['3_bottom']?.[0] || '',
                    '3_bottom_2': wn['3_bottom']?.[1] || '',
                    '3_bottom_3': wn['3_bottom']?.[2] || '',
                    '3_bottom_4': wn['3_bottom']?.[3] || ''
                })
            } else if (lotteryType === 'lao') {
                setLaoForm({
                    '4_set': wn['4_set'] || ''
                })
            } else if (lotteryType === 'hanoi') {
                setHanoiForm({
                    '4_set': wn['4_set'] || '',
                    '2_bottom': wn['2_bottom'] || ''
                })
            } else if (lotteryType === 'stock') {
                setStockForm({
                    '2_top': wn['2_top'] || '',
                    '2_bottom': wn['2_bottom'] || ''
                })
            }
        }
    }, [round, isEditing, lotteryType])

    // Auto-derive numbers for display
    const getDerivedNumbers = () => {
        if (lotteryType === 'lao') {
            const set4 = laoForm['4_set']
            return {
                '2_top': set4.length >= 2 ? set4.slice(-2) : '',
                '2_bottom': set4.length >= 2 ? set4.slice(0, 2) : '',
                '3_top': set4.length >= 3 ? set4.slice(-3) : ''
            }
        }
        if (lotteryType === 'hanoi') {
            const set4 = hanoiForm['4_set']
            return {
                '2_top': set4.length >= 2 ? set4.slice(-2) : '',
                '3_top': set4.length >= 3 ? set4.slice(-3) : ''
            }
        }
        if (lotteryType === 'thai') {
            const six = thaiForm['6_top']
            return {
                '2_top': six.length >= 2 ? six.slice(-2) : '',
                '3_top': six.length >= 3 ? six.slice(-3) : ''
            }
        }
        return {}
    }

    const derived = getDerivedNumbers()

    // Build final winning numbers object for database
    const buildWinningNumbers = () => {
        if (lotteryType === 'thai') {
            const result = {
                '6_top': thaiForm['6_top'],
                '2_top': derived['2_top'],
                '3_top': derived['3_top'],
                '2_bottom': thaiForm['2_bottom'],
                '3_bottom': [
                    thaiForm['3_bottom_1'],
                    thaiForm['3_bottom_2'],
                    thaiForm['3_bottom_3'],
                    thaiForm['3_bottom_4']
                ].filter(n => n.length === 3)
            }
            return result
        }
        if (lotteryType === 'lao') {
            return {
                '4_set': laoForm['4_set'],
                '2_top': derived['2_top'],
                '2_bottom': derived['2_bottom'],
                '3_top': derived['3_top']
            }
        }
        if (lotteryType === 'hanoi') {
            return {
                '4_set': hanoiForm['4_set'],
                '2_top': derived['2_top'],
                '2_bottom': hanoiForm['2_bottom'],
                '3_top': derived['3_top']
            }
        }
        if (lotteryType === 'stock') {
            return {
                '2_top': stockForm['2_top'],
                '2_bottom': stockForm['2_bottom']
            }
        }
        return {}
    }

    async function handleAnnounce() {
        console.log('handleAnnounce called - proceeding directly')
        setLoading(true)

        try {
            const winningNumbers = buildWinningNumbers()
            console.log('Winning numbers:', winningNumbers)

            // Update round with winning numbers
            const { data: updateData, error: roundError } = await supabase
                .from('lottery_rounds')
                .update({
                    winning_numbers: winningNumbers,
                    is_result_announced: true,
                    status: 'announced'
                })
                .eq('id', round.id)
                .select()

            console.log('Update result:', updateData, roundError)

            if (roundError) {
                console.error('Round update error:', roundError)
                throw roundError
            }

            // If editing, reset all winner statuses first
            if (isEditing) {
                console.log('Resetting previous winner statuses...')
                const { error: resetError } = await supabase
                    .from('submissions')
                    .update({ is_winner: false, prize_amount: 0 })
                    .eq('round_id', round.id)
                    .eq('is_deleted', false)

                if (resetError) {
                    console.warn('Error resetting winners:', resetError)
                }
            }

            // Try to calculate winners (RPC function might not exist)
            let winCount = 0
            try {
                const { data, error: calcError } = await supabase
                    .rpc('calculate_round_winners', { p_round_id: round.id })

                console.log('RPC result:', data, calcError)

                if (calcError) {
                    console.warn('RPC error (ignored):', calcError)
                    // Don't throw - just continue without calculating winners
                } else {
                    winCount = data || 0
                }
            } catch (rpcError) {
                console.warn('RPC function not available:', rpcError)
                // Continue anyway - the round was updated successfully
            }

            const message = isEditing
                ? `อัปเดตผลรางวัลสำเร็จ! มีผู้ถูกรางวัล ${winCount} รายการ`
                : `ประกาศผลสำเร็จ! มีผู้ถูกรางวัล ${winCount} รายการ`
            alert(message)
            onClose()

        } catch (error) {
            console.error('Error announcing:', error)
            alert('เกิดข้อผิดพลาด: ' + (error.message || 'Unknown error'))
        } finally {
            setLoading(false)
        }
    }

    // Render input helper
    const renderNumberInput = (label, value, onChange, maxLength, placeholder, isLarge = false) => (
        <div className={`form-group ${isLarge ? 'full-width' : ''}`}>
            <label className="form-label">{label}</label>
            <input
                type="text"
                inputMode="numeric"
                className={`form-input result-input ${isLarge ? 'result-input-large' : ''}`}
                maxLength={maxLength}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
            />
        </div>
    )

    // Render derived preview
    const renderDerivedPreview = (numbers) => (
        <div className="derived-preview">
            <span className="derived-label">เลขที่จะบันทึก:</span>
            <div className="derived-numbers">
                {Object.entries(numbers).filter(([k, v]) => v).map(([key, val]) => (
                    <span key={key} className="derived-item">
                        <span className="derived-key">{key.replace('_', ' ')}</span>
                        <span className="derived-value">{val}</span>
                    </span>
                ))}
            </div>
        </div>
    )

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiCheck /> ใส่ผลรางวัล - {LOTTERY_TYPES[lotteryType]}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        กรอกเลขที่ออกรางวัลสำหรับ <strong>{round.lottery_name}</strong>
                    </p>

                    {/* Thai Lottery Form */}
                    {lotteryType === 'thai' && (
                        <div className="results-form results-form-thai">
                            {renderNumberInput(
                                '🏆 รางวัลที่ 1 (6 ตัว)',
                                thaiForm['6_top'],
                                val => setThaiForm({ ...thaiForm, '6_top': val }),
                                6,
                                '000000',
                                true
                            )}

                            {derived['2_top'] && (
                                <div className="auto-derived-info">
                                    <span>→ 2 ตัวบน: <strong>{derived['2_top']}</strong></span>
                                    <span>→ 3 ตัวบน: <strong>{derived['3_top']}</strong></span>
                                </div>
                            )}

                            <div className="form-divider"></div>

                            {renderNumberInput(
                                '2 ตัวล่าง',
                                thaiForm['2_bottom'],
                                val => setThaiForm({ ...thaiForm, '2_bottom': val }),
                                2,
                                '00'
                            )}

                            <div className="form-divider"></div>

                            <div className="form-section-label">3 ตัวล่าง (4 รางวัล)</div>
                            <div className="three-bottom-grid">
                                {renderNumberInput(
                                    'ชุดที่ 1',
                                    thaiForm['3_bottom_1'],
                                    val => setThaiForm({ ...thaiForm, '3_bottom_1': val }),
                                    3,
                                    '000'
                                )}
                                {renderNumberInput(
                                    'ชุดที่ 2',
                                    thaiForm['3_bottom_2'],
                                    val => setThaiForm({ ...thaiForm, '3_bottom_2': val }),
                                    3,
                                    '000'
                                )}
                                {renderNumberInput(
                                    'ชุดที่ 3',
                                    thaiForm['3_bottom_3'],
                                    val => setThaiForm({ ...thaiForm, '3_bottom_3': val }),
                                    3,
                                    '000'
                                )}
                                {renderNumberInput(
                                    'ชุดที่ 4',
                                    thaiForm['3_bottom_4'],
                                    val => setThaiForm({ ...thaiForm, '3_bottom_4': val }),
                                    3,
                                    '000'
                                )}
                            </div>
                        </div>
                    )}

                    {/* Lao Lottery Form */}
                    {lotteryType === 'lao' && (
                        <div className="results-form results-form-lao">
                            {renderNumberInput(
                                '🎯 เลขชุด 4 ตัว',
                                laoForm['4_set'],
                                val => setLaoForm({ ...laoForm, '4_set': val }),
                                4,
                                '0000',
                                true
                            )}

                            {laoForm['4_set'].length >= 2 && renderDerivedPreview({
                                '2 ตัวบน': derived['2_top'],
                                '2 ตัวล่าง': derived['2_bottom'],
                                '3 ตัวบน': derived['3_top']
                            })}
                        </div>
                    )}

                    {/* Hanoi Lottery Form */}
                    {lotteryType === 'hanoi' && (
                        <div className="results-form results-form-hanoi">
                            {renderNumberInput(
                                '🎯 เลขชุด 4 ตัว',
                                hanoiForm['4_set'],
                                val => setHanoiForm({ ...hanoiForm, '4_set': val }),
                                4,
                                '0000',
                                true
                            )}

                            {hanoiForm['4_set'].length >= 2 && (
                                <div className="auto-derived-info">
                                    <span>→ 2 ตัวบน: <strong>{derived['2_top']}</strong></span>
                                    <span>→ 3 ตัวบน: <strong>{derived['3_top']}</strong></span>
                                </div>
                            )}

                            <div className="form-divider"></div>

                            {renderNumberInput(
                                '2 ตัวล่าง (กรอกเอง)',
                                hanoiForm['2_bottom'],
                                val => setHanoiForm({ ...hanoiForm, '2_bottom': val }),
                                2,
                                '00'
                            )}
                        </div>
                    )}

                    {/* Stock Lottery Form */}
                    {lotteryType === 'stock' && (
                        <div className="results-form results-form-stock">
                            <p className="form-note">หวยหุ้น - แทงเลข 2 ตัว บนและล่าง</p>

                            <div className="stock-inputs-row">
                                {renderNumberInput(
                                    '2 ตัวบน',
                                    stockForm['2_top'],
                                    val => setStockForm({ ...stockForm, '2_top': val }),
                                    2,
                                    '00'
                                )}
                                {renderNumberInput(
                                    '2 ตัวล่าง',
                                    stockForm['2_bottom'],
                                    val => setStockForm({ ...stockForm, '2_bottom': val }),
                                    2,
                                    '00'
                                )}
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
                        onClick={handleAnnounce}
                        disabled={loading}
                    >
                        {loading ? (isEditing ? 'กำลังอัปเดต...' : 'กำลังประกาศ...') : (
                            <>{isEditing ? <><FiEdit2 /> อัปเดตผล</> : <><FiCheck /> ประกาศผล</>}</>
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

// Summary Modal Component - Shows user profit/loss summary
function SummaryModal({ round, onClose }) {
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchSubmissions()
    }, [round.id])

    async function fetchSubmissions() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select(`
                    *,
                    profiles (id, full_name, email)
                `)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!error) setSubmissions(data || [])
        } catch (error) {
            console.error('Error fetching submissions:', error)
        } finally {
            setLoading(false)
        }
    }

    // Group submissions by user
    const userSummaries = submissions.reduce((acc, sub) => {
        const userId = sub.user_id
        if (!acc[userId]) {
            acc[userId] = {
                userId,
                userName: sub.profiles?.full_name || sub.profiles?.email || 'ไม่ระบุชื่อ',
                email: sub.profiles?.email || '',
                totalBet: 0,
                totalWin: 0,
                winCount: 0,
                ticketCount: 0
            }
        }
        acc[userId].totalBet += sub.amount || 0
        acc[userId].totalWin += sub.prize_amount || 0
        acc[userId].ticketCount++
        if (sub.is_winner) acc[userId].winCount++
        return acc
    }, {})

    const userList = Object.values(userSummaries).sort((a, b) => {
        // Sort by net profit (descending - winners first)
        const aNet = a.totalWin - a.totalBet
        const bNet = b.totalWin - b.totalBet
        return bNet - aNet
    })

    // Calculate totals
    const grandTotalBet = userList.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userList.reduce((sum, u) => sum + u.totalWin, 0)
    const dealerProfit = grandTotalBet - grandTotalWin

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiDollarSign /> สรุปยอดได้-เสีย - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Grand Summary Cards */}
                    <div className="summary-cards-row">
                        <div className="summary-stat-card">
                            <span className="stat-label">ยอดแทงรวม</span>
                            <span className="stat-value">{round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                        </div>
                        <div className="summary-stat-card">
                            <span className="stat-label">ยอดจ่ายรางวัล</span>
                            <span className="stat-value danger">{round.currency_symbol}{grandTotalWin.toLocaleString()}</span>
                        </div>
                        <div className={`summary-stat-card ${dealerProfit >= 0 ? 'profit' : 'loss'}`}>
                            <span className="stat-label">กำไร/ขาดทุน</span>
                            <span className="stat-value">
                                {dealerProfit >= 0 ? '+' : ''}{round.currency_symbol}{dealerProfit.toLocaleString()}
                            </span>
                        </div>
                        <div className="summary-stat-card">
                            <span className="stat-label">จำนวนผู้ส่ง</span>
                            <span className="stat-value">{userList.length} คน</span>
                        </div>
                    </div>

                    {/* User Summary Table */}
                    <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>รายละเอียดแต่ละคน</h4>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : userList.length === 0 ? (
                        <p className="text-muted">ไม่มีรายการส่งเลขในงวดนี้</p>
                    ) : (
                        <div className="user-summary-list">
                            {userList.map(user => {
                                const net = user.totalWin - user.totalBet
                                return (
                                    <div key={user.userId} className={`user-summary-card ${net > 0 ? 'winner' : net < 0 ? 'loser' : ''}`}>
                                        <div className="user-summary-header">
                                            <div className="user-info">
                                                <span className="user-name">{user.userName}</span>
                                                <span className="user-email">{user.email}</span>
                                            </div>
                                            <div className={`net-amount ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`}>
                                                {net > 0 ? '+' : ''}{round.currency_symbol}{net.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="user-summary-details">
                                            <div className="detail-item">
                                                <span className="detail-label">แทง</span>
                                                <span className="detail-value">{user.ticketCount} รายการ</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">ยอดแทง</span>
                                                <span className="detail-value">{round.currency_symbol}{user.totalBet.toLocaleString()}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">ถูกรางวัล</span>
                                                <span className="detail-value text-success">{user.winCount > 0 ? `${user.winCount} รายการ` : '-'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">ยอดได้</span>
                                                <span className={`detail-value ${user.totalWin > 0 ? 'text-success' : ''}`}>
                                                    {user.totalWin > 0 ? `${round.currency_symbol}${user.totalWin.toLocaleString()}` : '-'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="user-summary-footer">
                                            {net > 0 ? (
                                                <span className="status-badge won">ต้องจ่าย {round.currency_symbol}{net.toLocaleString()}</span>
                                            ) : net < 0 ? (
                                                <span className="status-badge lost">ต้องเก็บ {round.currency_symbol}{Math.abs(net).toLocaleString()}</span>
                                            ) : (
                                                <span className="status-badge pending">เสมอ</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            <div className="user-summary-card total-card">
                                <div className="user-summary-header">
                                    <div className="user-info">
                                        <span className="user-name">รวมทั้งหมด</span>
                                        <span className="user-email">{userList.length} คน, {submissions.length} รายการ</span>
                                    </div>
                                    <div className={`net-amount ${dealerProfit >= 0 ? 'positive' : 'negative'}`}>
                                        {dealerProfit >= 0 ? '+' : ''}{round.currency_symbol}{dealerProfit.toLocaleString()}
                                    </div>
                                </div>
                                <div className="user-summary-details">
                                    <div className="detail-item">
                                        <span className="detail-label">ยอดแทงรวม</span>
                                        <span className="detail-value">{round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">ยอดจ่ายรางวัล</span>
                                        <span className="detail-value text-danger">{round.currency_symbol}{grandTotalWin.toLocaleString()}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">ถูกรางวัล</span>
                                        <span className="detail-value">{submissions.filter(s => s.is_winner).length} รายการ</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">กำไร/ขาดทุน</span>
                                        <span className={`detail-value ${dealerProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {dealerProfit >= 0 ? '+' : ''}{round.currency_symbol}{dealerProfit.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
