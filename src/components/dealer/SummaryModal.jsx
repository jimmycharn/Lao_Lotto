import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FiDollarSign, FiX } from 'react-icons/fi'
import { DEFAULT_COMMISSIONS, DEFAULT_PAYOUTS, getLotteryTypeKey } from '../../constants/lotteryTypes'

export default function SummaryModal({ round, onClose }) {
    const [submissions, setSubmissions] = useState([])
    const [userSettings, setUserSettings] = useState({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [round.id])

    async function fetchData() {
        setLoading(true)
        try {
            const { data: submissionsData } = await supabase
                .from('submissions')
                .select(`*, profiles (id, full_name, email)`)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (submissionsData) setSubmissions(submissionsData)

            const { data: settingsData } = await supabase
                .from('user_settings')
                .select('*')
                .eq('dealer_id', round.dealer_id)

            if (settingsData) {
                const settingsMap = {}
                settingsData.forEach(s => { settingsMap[s.user_id] = s })
                setUserSettings(settingsMap)
            }
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Map bet_type to settings key for Lao/Hanoi lottery
    const getSettingsKey = (betType, lotteryKey) => {
        if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',
                '3_tod': '3_tod_single'
            }
            return LAO_BET_TYPE_MAP[betType] || betType
        }
        return betType
    }

    const getCommission = (sub) => {
        // Use commission_amount that was recorded when submission was made
        // This ensures consistency between dealer and user dashboards
        if (sub.commission_amount !== undefined && sub.commission_amount !== null) {
            return sub.commission_amount
        }
        // Fallback to calculation if commission_amount not recorded
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
        const settings = userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]

        if (settings?.commission !== undefined) {
            return settings.isFixed ? settings.commission : sub.amount * (settings.commission / 100)
        }
        return sub.amount * ((DEFAULT_COMMISSIONS[sub.bet_type] || 15) / 100)
    }

    const getExpectedPayout = (sub) => {
        if (!sub.is_winner) return 0
        
        // For 4_set, use prize_amount from database (FIXED amount, not multiplied)
        if (sub.bet_type === '4_set') {
            return sub.prize_amount || 0
        }
        
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
        const settings = userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]

        if (settings?.payout !== undefined) return sub.amount * settings.payout
        return sub.amount * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
    }

    const userSummaries = submissions.reduce((acc, sub) => {
        const userId = sub.user_id
        if (!acc[userId]) {
            acc[userId] = {
                userId,
                userName: sub.profiles?.full_name || sub.profiles?.email || 'ไม่ระบุชื่อ',
                email: sub.profiles?.email || '',
                totalBet: 0, totalWin: 0, totalCommission: 0, winCount: 0, ticketCount: 0
            }
        }
        acc[userId].totalBet += sub.amount || 0
        acc[userId].totalWin += getExpectedPayout(sub)
        acc[userId].totalCommission += getCommission(sub)
        acc[userId].ticketCount++
        if (sub.is_winner) acc[userId].winCount++
        return acc
    }, {})

    const userList = Object.values(userSummaries).sort((a, b) => {
        const aNet = a.totalWin + a.totalCommission - a.totalBet
        const bNet = b.totalWin + b.totalCommission - b.totalBet
        return bNet - aNet
    })

    const grandTotalBet = userList.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userList.reduce((sum, u) => sum + u.totalWin, 0)
    const grandTotalCommission = userList.reduce((sum, u) => sum + u.totalCommission, 0)
    const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiDollarSign /> สรุปยอดได้-เสีย - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>

                <div className="modal-body">
                    <div className="user-summary-card total-card" style={{ marginBottom: '1.5rem' }}>
                        <div className="user-summary-header">
                            <div className="user-info">
                                <span className="user-name">สรุปยอดรวม</span>
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

                    <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>รายละเอียดแต่ละคน</h4>

                    {loading ? (
                        <div className="loading-state"><div className="spinner"></div></div>
                    ) : userList.length === 0 ? (
                        <p className="text-muted">ไม่มีรายการส่งเลขในงวดนี้</p>
                    ) : (
                        <div className="user-summary-list">
                            {userList.map(user => {
                                const net = user.totalWin + user.totalCommission - user.totalBet
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
                                                <span className="detail-label">ค่าคอม</span>
                                                <span className="detail-value" style={{ color: 'var(--color-warning)' }}>{round.currency_symbol}{user.totalCommission.toLocaleString()}</span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">ถูก/ยอดได้</span>
                                                <span className={`detail-value ${user.totalWin > 0 ? 'text-success' : ''}`}>
                                                    {user.winCount > 0 ? `${user.winCount}/${round.currency_symbol}${user.totalWin.toLocaleString()}` : '-'}
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
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
                </div>
            </div>
        </div>
    )
}
