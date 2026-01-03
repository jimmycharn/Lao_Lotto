import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
    FiCalendar,
    FiChevronLeft,
    FiChevronRight,
    FiGift,
    FiAward,
    FiCheck,
    FiChevronDown,
    FiChevronUp
} from 'react-icons/fi'
import './Results.css'

// Bet type labels
const BET_TYPES = {
    'run_top': { label: 'วิ่งบน', digits: 1 },
    'run_bottom': { label: 'วิ่งล่าง', digits: 1 },
    'front_top_1': { label: 'หน้าบน', digits: 1 },
    'middle_top_1': { label: 'กลางบน', digits: 1 },
    'back_top_1': { label: 'หลังบน', digits: 1 },
    'front_bottom_1': { label: 'หน้าล่าง', digits: 1 },
    'back_bottom_1': { label: 'หลังล่าง', digits: 1 },
    '2_top': { label: '2 ตัวบน', digits: 2 },
    '2_front': { label: '2 ตัวหน้า', digits: 2 },
    '2_spread': { label: '2 ตัวถ่าง', digits: 2 },
    '2_have': { label: '2 ตัวมี', digits: 2 },
    '2_bottom': { label: '2 ตัวล่าง', digits: 2 },
    '2_top_rev': { label: '2 ตัวบนกลับ', digits: 2 },
    '2_front_rev': { label: '2 ตัวหน้ากลับ', digits: 2 },
    '2_spread_rev': { label: '2 ตัวถ่างกลับ', digits: 2 },
    '2_bottom_rev': { label: '2 ตัวล่างกลับ', digits: 2 },
    '3_top': { label: '3 ตัวตรง', digits: 3 },
    '3_tod': { label: '3 ตัวโต๊ด', digits: 3 },
    '3_bottom': { label: '3 ตัวล่าง', digits: 3 },
    '4_set': { label: '4 ตัวชุด', digits: 4 },
    '4_float': { label: '4 ตัวลอย', digits: 4 },
    '5_float': { label: '5 ตัวลอย', digits: 5 },
    '6_top': { label: '6 ตัว (รางวัลที่ 1)', digits: 6 }
}

export default function Results() {
    const { user, profile } = useAuth()
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [expandedRound, setExpandedRound] = useState(null)
    const [winningSubmissions, setWinningSubmissions] = useState([])
    const [submissionsLoading, setSubmissionsLoading] = useState(false)
    const itemsPerPage = 10

    useEffect(() => {
        if (profile?.dealer_id) {
            fetchResults()
        }
    }, [currentPage, profile])

    useEffect(() => {
        if (expandedRound) {
            fetchWinningSubmissions(expandedRound.id)
        }
    }, [expandedRound])

    async function fetchResults() {
        setLoading(true)
        try {
            // Get total count (excluding archived rounds)
            const { count } = await supabase
                .from('lottery_rounds')
                .select('*', { count: 'exact', head: true })
                .eq('dealer_id', profile.dealer_id)
                .eq('is_result_announced', true)
                .or('is_archived.is.null,is_archived.eq.false')

            setTotalPages(Math.ceil((count || 0) / itemsPerPage))

            // Get paginated results (excluding archived rounds)
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', profile.dealer_id)
                .eq('is_result_announced', true)
                .or('is_archived.is.null,is_archived.eq.false')
                .order('round_date', { ascending: false })
                .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1)

            if (error) {
                console.error('Error:', error)
            } else {
                setResults(data || [])
            }
        } catch (error) {
            console.error('Error fetching results:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchWinningSubmissions(roundId) {
        setSubmissionsLoading(true)
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
                setWinningSubmissions(data || [])
            }
        } catch (error) {
            console.error('Error fetching winning submissions:', error)
        } finally {
            setSubmissionsLoading(false)
        }
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('th-TH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const formatShortDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('th-TH', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    // Group winning submissions by bill
    const getBillGroups = () => {
        return winningSubmissions.reduce((acc, sub) => {
            const billId = sub.bill_id || 'no-bill'
            if (!acc[billId]) acc[billId] = []
            acc[billId].push(sub)
            return acc
        }, {})
    }

    // Get summary stats
    const getSummary = () => {
        const winningCount = winningSubmissions.length
        const totalPrize = winningSubmissions.reduce((sum, s) => sum + (s.prize_amount || 0), 0)
        return { winningCount, totalPrize }
    }

    // No dealer assigned
    if (!profile?.dealer_id) {
        return (
            <div className="results-page">
                <div className="container">
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ยังไม่มีเจ้ามือ</h3>
                        <p>กรุณาสมัครผ่านลิงก์ของเจ้ามือเพื่อเข้าร่วมกลุ่ม</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="results-page">
            <div className="container">
                <div className="page-header">
                    <h1>
                        <FiAward />
                        ผลรางวัล
                    </h1>
                    <p>ดูผลรางวัลและรายการที่ถูกจากเจ้ามือของคุณ</p>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ยังไม่มีผลรางวัล</h3>
                        <p>ผลรางวัลจะปรากฏที่นี่เมื่อมีการประกาศ</p>
                    </div>
                ) : (
                    <>
                        <div className="results-list">
                            {results.map((result, index) => {
                                const isExpanded = expandedRound?.id === result.id
                                const billGroups = getBillGroups()
                                const { winningCount, totalPrize } = getSummary()

                                return (
                                    <div
                                        key={result.id}
                                        className={`result-card card animate-slideUp ${isExpanded ? 'expanded' : ''}`}
                                        style={{ animationDelay: `${index * 0.05}s` }}
                                    >
                                        {/* Round Header - Clickable */}
                                        <div
                                            className="result-header clickable"
                                            onClick={() => setExpandedRound(isExpanded ? null : result)}
                                        >
                                            <div className="result-header-main">
                                                <div className="result-date">
                                                    <FiCalendar />
                                                    <div className="result-title-group">
                                                        <span className="lottery-name">{result.lottery_name || 'หวยลาว'}</span>
                                                        <span className="round-date">{formatShortDate(result.round_date)}</span>
                                                    </div>
                                                </div>
                                                <div className="result-header-right">
                                                    <span className="status-badge announced">
                                                        <FiCheck /> ประกาศผลแล้ว
                                                    </span>
                                                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="result-expanded-content">
                                                {/* Winning Numbers Display */}
                                                <div className="winning-numbers-section">
                                                    <h4>เลขที่ออก</h4>
                                                    <div className="result-grid">
                                                        <div className="result-item">
                                                            <span className="result-label">2 ตัวบน</span>
                                                            <span className="result-number">{result.winning_numbers?.['2_top'] || '--'}</span>
                                                        </div>
                                                        <div className="result-item">
                                                            <span className="result-label">2 ตัวล่าง</span>
                                                            <span className="result-number">{result.winning_numbers?.['2_bottom'] || '--'}</span>
                                                        </div>
                                                        <div className="result-item">
                                                            <span className="result-label">3 ตัวบน</span>
                                                            <span className="result-number">{result.winning_numbers?.['3_top'] || '---'}</span>
                                                        </div>
                                                        <div className="result-item highlight">
                                                            <span className="result-label">6 ตัว (รางวัลใหญ่)</span>
                                                            <span className="result-number big">{result.winning_numbers?.['6_top'] || '------'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* My Winnings Section */}
                                                <div className="my-winnings-section">
                                                    <h4>รายการที่ถูกของฉัน</h4>

                                                    {submissionsLoading ? (
                                                        <div className="loading-state mini">
                                                            <div className="spinner small"></div>
                                                        </div>
                                                    ) : winningCount === 0 ? (
                                                        <div className="no-winnings-message">
                                                            <p>ไม่มีรายการที่ถูกรางวัลในงวดนี้</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Summary Stats */}
                                                            <div className="winnings-summary">
                                                                <div className="summary-item">
                                                                    <span className="summary-value">{winningCount}</span>
                                                                    <span className="summary-label">รายการที่ถูก</span>
                                                                </div>
                                                                <div className="summary-item highlight">
                                                                    <span className="summary-value">
                                                                        {result.currency_symbol || '฿'}{totalPrize.toLocaleString()}
                                                                    </span>
                                                                    <span className="summary-label">รางวัลที่ได้</span>
                                                                </div>
                                                            </div>

                                                            {/* Winning Items by Bill */}
                                                            <div className="winning-bills">
                                                                {Object.entries(billGroups).map(([billId, items]) => {
                                                                    const billTotal = items.reduce((sum, s) => sum + (s.prize_amount || 0), 0)
                                                                    return (
                                                                        <div key={billId} className="bill-group">
                                                                            <div className="bill-header">
                                                                                <span className="bill-label">
                                                                                    <FiGift /> โพย {billId === 'no-bill' ? '-' : billId.slice(-6).toUpperCase()}
                                                                                </span>
                                                                                <span className="bill-prize">
                                                                                    +{result.currency_symbol || '฿'}{billTotal.toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                            <div className="bill-items">
                                                                                {items.map(sub => (
                                                                                    <div key={sub.id} className="winning-item">
                                                                                        <div className="winning-number">
                                                                                            <span className="number-value">{sub.display_numbers || sub.numbers}</span>
                                                                                            <span className="bet-type">{BET_TYPES[sub.bet_type]?.label || sub.bet_type}</span>
                                                                                        </div>
                                                                                        <div className="winning-amounts">
                                                                                            <span className="bet-amount">{result.currency_symbol || '฿'}{sub.amount}</span>
                                                                                            <span className="arrow">→</span>
                                                                                            <span className="prize-amount">{result.currency_symbol || '฿'}{(sub.prize_amount || 0).toLocaleString()}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <FiChevronLeft />
                                </button>

                                <div className="pagination-info">
                                    หน้า {currentPage} จาก {totalPages}
                                </div>

                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <FiChevronRight />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
