import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiClock, FiCheck, FiX, FiCalendar, FiDollarSign, FiGift } from 'react-icons/fi'
import './History.css'

export default function History() {
    const { user } = useAuth()
    const [purchases, setPurchases] = useState([])
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
                .from('purchases')
                .select(`
          *,
          lottery_draws (
            draw_date,
            two_digit,
            three_digit,
            four_digit,
            six_digit,
            is_published
          )
        `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error:', error)
            } else {
                setPurchases(data || [])
            }
        } catch (error) {
            console.error('Error fetching history:', error)
        } finally {
            setLoading(false)
        }
    }

    const getBetTypeLabel = (type) => {
        const labels = {
            two_digit: '2 ตัว',
            three_digit: '3 ตัว',
            four_digit: '4 ตัว',
            six_digit: '6 ตัว'
        }
        return labels[type] || type
    }

    const getStatus = (purchase) => {
        if (!purchase.lottery_draws?.is_published) {
            return { label: 'รอผล', status: 'pending', icon: <FiClock /> }
        }
        if (purchase.is_winner) {
            return { label: 'ถูกรางวัล', status: 'won', icon: <FiCheck /> }
        }
        return { label: 'ไม่ถูกรางวัล', status: 'lost', icon: <FiX /> }
    }

    const filteredPurchases = purchases.filter(p => {
        if (filter === 'all') return true
        const status = getStatus(p).status
        return status === filter
    })

    const getTotalStats = () => {
        const total = purchases.length
        const pending = purchases.filter(p => !p.lottery_draws?.is_published).length
        const won = purchases.filter(p => p.is_winner).length
        const lost = total - pending - won
        const totalSpent = purchases.reduce((sum, p) => sum + (p.amount || 0), 0)
        const totalWon = purchases.reduce((sum, p) => sum + (p.prize_amount || 0), 0)

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

                {/* Purchase List */}
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : filteredPurchases.length === 0 ? (
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ไม่มีรายการ</h3>
                        <p>{filter === 'all' ? 'คุณยังไม่เคยซื้อหวย' : 'ไม่มีรายการในหมวดนี้'}</p>
                    </div>
                ) : (
                    <div className="purchase-list">
                        {filteredPurchases.map((purchase, index) => {
                            const status = getStatus(purchase)
                            return (
                                <div
                                    key={purchase.id}
                                    className={`purchase-card card animate-slideUp ${status.status}`}
                                    style={{ animationDelay: `${index * 0.03}s` }}
                                >
                                    <div className="purchase-header">
                                        <div className="purchase-type">
                                            <span className="type-badge">{getBetTypeLabel(purchase.bet_type)}</span>
                                            <span className="purchase-numbers">{purchase.numbers}</span>
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
                                                {purchase.lottery_draws?.draw_date
                                                    ? new Date(purchase.lottery_draws.draw_date).toLocaleDateString('th-TH')
                                                    : 'รอประกาศ'
                                                }
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <FiDollarSign />
                                            <span>เดิมพัน ฿{purchase.amount?.toLocaleString()}</span>
                                        </div>
                                        {purchase.is_winner && (
                                            <div className="detail-item prize">
                                                <FiGift />
                                                <span>รางวัล ฿{purchase.prize_amount?.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="purchase-time">
                                        ซื้อเมื่อ {new Date(purchase.created_at).toLocaleString('th-TH')}
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
