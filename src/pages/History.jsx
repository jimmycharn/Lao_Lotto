import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiCalendar, FiArrowLeft, FiTrendingUp, FiTrendingDown } from 'react-icons/fi'
import { LOTTERY_TYPES } from '../constants/lotteryTypes'
import './History.css'

export default function History() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user?.id) {
            fetchHistory()
        }
    }, [user?.id])

    async function fetchHistory() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_round_history')
                .select('*')
                .eq('user_id', user.id)
                .order('deleted_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                setHistory(data)
            }
        } catch (error) {
            console.error('Error fetching history:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        return date.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    // Calculate totals
    const totalAmount = history.reduce((sum, h) => sum + (h.total_amount || 0), 0)
    const totalCommission = history.reduce((sum, h) => sum + (h.total_commission || 0), 0)
    const totalWinnings = history.reduce((sum, h) => sum + (h.total_winnings || 0), 0)
    const totalProfitLoss = history.reduce((sum, h) => sum + (h.profit_loss || 0), 0)

    return (
        <div className="history-page">
            <div className="container">
                {/* Header */}
                <div className="history-header">
                    <button className="back-btn" onClick={() => navigate('/dashboard')}>
                        <FiArrowLeft /> กลับ
                    </button>
                    <h1>ประวัติการส่งเลข</h1>
                </div>

                {/* Summary Card */}
                <div className="history-summary-card">
                    <div className="summary-item">
                        <span className="summary-label">ยอดส่งรวม</span>
                        <span className="summary-value">฿{totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">ค่าคอมรวม</span>
                        <span className="summary-value">฿{totalCommission.toLocaleString()}</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">ยอดถูกรวม</span>
                        <span className="summary-value success">฿{totalWinnings.toLocaleString()}</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">กำไร/ขาดทุน</span>
                        <span className={`summary-value ${totalProfitLoss >= 0 ? 'success' : 'danger'}`}>
                            {totalProfitLoss >= 0 ? <FiTrendingUp /> : <FiTrendingDown />}
                            {totalProfitLoss >= 0 ? '+' : ''}฿{totalProfitLoss.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* History List */}
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="empty-state">
                        <FiCalendar className="empty-icon" />
                        <h3>ไม่มีประวัติ</h3>
                        <p>ประวัติจะแสดงเมื่อเจ้ามือลบงวดหวยที่คุณส่งเลข</p>
                    </div>
                ) : (
                    <div className="history-list">
                        {history.map(item => (
                            <div key={item.id} className={`history-item ${item.lottery_type}`}>
                                <div className="history-item-header">
                                    <span className={`lottery-badge ${item.lottery_type}`}>
                                        {LOTTERY_TYPES[item.lottery_type]?.name || item.lottery_type}
                                    </span>
                                    <span className="history-date">
                                        <FiCalendar /> {formatDate(item.round_date)}
                                    </span>
                                </div>
                                <div className="history-item-stats">
                                    <div className="stat">
                                        <span className="stat-label">ยอดส่งรวม</span>
                                        <span className="stat-value">฿{item.total_amount?.toLocaleString()}</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">ค่าคอม</span>
                                        <span className="stat-value">฿{item.total_commission?.toLocaleString()}</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">รางวัลที่ได้</span>
                                        <span className="stat-value success">฿{item.total_winnings?.toLocaleString()}</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">ผลกำไร/ขาดทุน</span>
                                        <span className={`stat-value ${item.profit_loss >= 0 ? 'success' : 'danger'}`}>
                                            {item.profit_loss >= 0 ? '+' : ''}฿{item.profit_loss?.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
