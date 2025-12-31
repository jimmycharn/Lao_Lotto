import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiClock, FiCheck, FiX, FiCalendar, FiDollarSign, FiGift } from 'react-icons/fi'
import './History.css'

export default function History() {
    const { user } = useAuth()
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') // all, pending, won, lost

    useEffect(() => {
        if (user) {
            fetchHistory()
        }
    }, [user])

    async function fetchHistory() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select(`
                    *,
                    lottery_rounds (
                        lottery_name,
                        round_date,
                        status,
                        is_result_announced
                    )
                `)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error:', error)
            } else {
                setSubmissions(data || [])
            }
        } catch (error) {
            console.error('Error fetching history:', error)
        } finally {
            setLoading(false)
        }
    }

    const getBetTypeLabel = (type) => {
        const labels = {
            '2_top': '2 ตัวบน',
            '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวบน',
            '3_tod': '3 ตัวโต๊ด',
            '3_bottom': '3 ตัวล่าง',
            '4_tod': '4 ตัวโต๊ด',
            '6_top': '6 ตัวบน',
            'run_top': 'วิ่งบน',
            'run_bottom': 'วิ่งล่าง',
            'front_top_1': 'หน้าบน',
            'middle_top_1': 'กลางบน',
            'back_top_1': 'หลังบน',
            'front_bottom_1': 'หน้าล่าง',
            'back_bottom_1': 'หลังล่าง'
        }
        return labels[type] || type
    }

    const getStatus = (submission) => {
        if (!submission.lottery_rounds?.is_result_announced) {
            return { label: 'รอผล', status: 'pending', icon: <FiClock /> }
        }
        if (submission.is_winner) {
            return { label: 'ถูกรางวัล', status: 'won', icon: <FiCheck /> }
        }
        return { label: 'ไม่ถูกรางวัล', status: 'lost', icon: <FiX /> }
    }

    const filteredSubmissions = submissions.filter(s => {
        if (filter === 'all') return true
        const status = getStatus(s).status
        return status === filter
    })

    const getTotalStats = () => {
        const total = submissions.length
        const pending = submissions.filter(s => !s.lottery_rounds?.is_result_announced).length
        const won = submissions.filter(s => s.is_winner).length
        const lost = total - pending - won
        const totalSpent = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)
        const totalWon = submissions.reduce((sum, s) => sum + (s.prize_amount || 0), 0)

        return { total, pending, won, lost, totalSpent, totalWon }
    }

    const stats = getTotalStats()

    return (
        <div className="history-page">
            <div className="container">
                <div className="page-header">
                    <h1>
                        <FiClock />
                        ประวัติการซื้อ
                    </h1>
                    <p>รายการหวยที่คุณซื้อทั้งหมด</p>
                </div>

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon-wrap">
                            <FiGift />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">{stats.total}</div>
                            <div className="stat-label">รายการทั้งหมด</div>
                        </div>
                    </div>
                    <div className="stat-card pending">
                        <div className="stat-icon-wrap">
                            <FiClock />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">{stats.pending}</div>
                            <div className="stat-label">รอผล</div>
                        </div>
                    </div>
                    <div className="stat-card won">
                        <div className="stat-icon-wrap">
                            <FiCheck />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">{stats.won}</div>
                            <div className="stat-label">ถูกรางวัล</div>
                        </div>
                    </div>
                    <div className="stat-card money">
                        <div className="stat-icon-wrap">
                            <FiDollarSign />
                        </div>
                        <div className="stat-content">
                            <div className="stat-value">฿{stats.totalWon.toLocaleString()}</div>
                            <div className="stat-label">รางวัลที่ได้รับ</div>
                        </div>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="filter-tabs">
                    {[
                        { id: 'all', label: 'ทั้งหมด' },
                        { id: 'pending', label: 'รอผล' },
                        { id: 'won', label: 'ถูกรางวัล' },
                        { id: 'lost', label: 'ไม่ถูก' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`filter-tab ${filter === tab.id ? 'active' : ''}`}
                            onClick={() => setFilter(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Submission List */}
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : filteredSubmissions.length === 0 ? (
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ไม่มีรายการ</h3>
                        <p>{filter === 'all' ? 'คุณยังไม่เคยซื้อหวย' : 'ไม่มีรายการในหมวดนี้'}</p>
                    </div>
                ) : (
                    <div className="purchase-list">
                        {filteredSubmissions.map((submission, index) => {
                            const status = getStatus(submission)
                            return (
                                <div
                                    key={submission.id}
                                    className={`purchase-card card animate-slideUp ${status.status}`}
                                    style={{ animationDelay: `${index * 0.03}s` }}
                                >
                                    <div className="purchase-header">
                                        <div className="purchase-type">
                                            <span className="type-badge">{getBetTypeLabel(submission.bet_type)}</span>
                                            <span className="purchase-numbers">{submission.numbers}</span>
                                        </div>
                                        <div className={`purchase-status status-${status.status}`}>
                                            {status.icon}
                                            <span>{status.label}</span>
                                        </div>
                                    </div>

                                    <div className="purchase-details">
                                        <div className="detail-item">
                                            <FiCalendar />
                                            <span>
                                                {submission.lottery_rounds?.lottery_name || 'หวยลาว'} - {submission.lottery_rounds?.round_date
                                                    ? new Date(submission.lottery_rounds.round_date).toLocaleDateString('th-TH')
                                                    : 'รอประกาศ'
                                                }
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <FiDollarSign />
                                            <span>เดิมพัน ฿{submission.amount?.toLocaleString()}</span>
                                        </div>
                                        {submission.is_winner && (
                                            <div className="detail-item prize">
                                                <FiGift />
                                                <span>รางวัล ฿{submission.prize_amount?.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="purchase-time">
                                        ซื้อเมื่อ {new Date(submission.created_at).toLocaleString('th-TH')}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
