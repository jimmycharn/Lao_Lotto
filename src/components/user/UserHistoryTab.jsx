import React, { useState, useMemo } from 'react'
import { 
    FiCalendar, 
    FiClock, 
    FiChevronDown, 
    FiChevronUp, 
    FiRefreshCw, 
    FiTrendingUp, 
    FiTrendingDown,
    FiPlus,
    FiMinus
} from 'react-icons/fi'
import { LOTTERY_TYPES } from '../../constants/lotteryTypes'
import { formatThaiDate, getRoundCloseDate } from '../../utils/crossRoundOffsetCalculator'
import './UserHistoryTab.css'

// Default lottery type ordering
const LOTTERY_TYPE_ORDER = ['thai', 'lao', 'hanoi', 'stock', 'yeekee', 'other']

/**
 * Format Year-Month string (e.g. "2026-10") to Thai Month Label (e.g. "ตุลาคม 2569")
 */
export function formatMonthLabel(yearMonthStr) {
    if (!yearMonthStr || yearMonthStr === 'all') return 'ทุกเดือน'
    const parts = yearMonthStr.split('-')
    if (parts.length < 2) return yearMonthStr
    const [year, month] = parts
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    if (isNaN(d.getTime())) return yearMonthStr
    return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
}

/**
 * Resolve standard Year-Month ("YYYY-MM") key from a round history item
 */
export function getRoundYearMonth(item) {
    if (!item) return ''
    const closeDate = getRoundCloseDate(item) || (item.round_date ? String(item.round_date).split('T')[0] : '')
    if (closeDate && /^\d{4}-\d{2}/.test(closeDate)) {
        return closeDate.slice(0, 7)
    }
    const dateStr = item.close_time || item.round_date || item.created_at || item.open_time
    if (dateStr) {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
    }
    return ''
}

/**
 * Get current year-month (YYYY-MM) in Asia/Bangkok timezone
 */
export function getCurrentBangkokYearMonth() {
    try {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
    } catch {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
}

export default function UserHistoryTab({ 
    history = [], 
    loading = false, 
    onRefresh = null, 
    currencySymbol = '฿',
    initialMonth = null,
    initialExpandedAll = false
}) {
    const currentYM = useMemo(() => getCurrentBangkokYearMonth(), [])
    const [monthFilter, setMonthFilter] = useState(() => initialMonth !== null ? initialMonth : currentYM)
    const [typeFilter, setTypeFilter] = useState('all')
    // Keep track of expanded state per lottery type
    const [expandedTypes, setExpandedTypes] = useState({})

    // Extract available year-months from history (sorted newest first)
    const availableMonths = useMemo(() => {
        const monthSet = new Set()
        if (currentYM) monthSet.add(currentYM)
        history.forEach(item => {
            const ym = getRoundYearMonth(item)
            if (ym) monthSet.add(ym)
        })
        return Array.from(monthSet).sort().reverse()
    }, [history, currentYM])

    // Extract available lottery types from history (ordered by standard lottery order)
    const availableTypes = useMemo(() => {
        const typeSet = new Set()
        history.forEach(item => {
            if (item.lottery_type) typeSet.add(item.lottery_type)
        })
        return Array.from(typeSet).sort((a, b) => {
            const idxA = LOTTERY_TYPE_ORDER.indexOf(a)
            const idxB = LOTTERY_TYPE_ORDER.indexOf(b)
            if (idxA !== -1 && idxB !== -1) return idxA - idxB
            if (idxA !== -1) return -1
            if (idxB !== -1) return 1
            return a.localeCompare(b)
        })
    }, [history])

    // Filter history based on selected month and lottery type
    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            if (monthFilter !== 'all') {
                const itemYm = getRoundYearMonth(item)
                if (itemYm !== monthFilter) return false
            }
            if (typeFilter !== 'all') {
                if (item.lottery_type !== typeFilter) return false
            }
            return true
        })
    }, [history, monthFilter, typeFilter])

    // Group filtered history by lottery type with calculated totals
    const groupedByType = useMemo(() => {
        const groups = {}
        filteredHistory.forEach(item => {
            const type = item.lottery_type || 'other'
            if (!groups[type]) {
                groups[type] = []
            }
            groups[type].push(item)
        })

        // Sort items inside each group by close date descending
        Object.keys(groups).forEach(type => {
            groups[type].sort((a, b) => {
                const dateA = getRoundCloseDate(a) || a.close_time || a.round_date || a.created_at || ''
                const dateB = getRoundCloseDate(b) || b.close_time || b.round_date || b.created_at || ''
                return dateB.localeCompare(dateA)
            })
        })

        // Sort groups according to LOTTERY_TYPE_ORDER
        const sortedTypes = Object.keys(groups).sort((a, b) => {
            const idxA = LOTTERY_TYPE_ORDER.indexOf(a)
            const idxB = LOTTERY_TYPE_ORDER.indexOf(b)
            if (idxA !== -1 && idxB !== -1) return idxA - idxB
            if (idxA !== -1) return -1
            if (idxB !== -1) return 1
            return a.localeCompare(b)
        })

        return sortedTypes.map(type => {
            const items = groups[type]
            const totalSent = items.reduce((sum, i) => sum + (Number(i.total_amount) || 0), 0)
            const totalComm = items.reduce((sum, i) => sum + (Number(i.total_commission) || 0), 0)
            const totalWin = items.reduce((sum, i) => sum + (Number(i.total_winnings) || 0), 0)
            const totalProfit = items.reduce((sum, i) => {
                const profit = i.profit_loss != null 
                    ? Number(i.profit_loss)
                    : ((Number(i.total_winnings) || 0) + (Number(i.total_commission) || 0) - (Number(i.total_amount) || 0))
                return sum + profit
            }, 0)

            return {
                lotteryType: type,
                lotteryName: LOTTERY_TYPES[type] || type,
                items,
                totalSent,
                totalComm,
                totalWin,
                totalProfit
            }
        })
    }, [filteredHistory])

    // Overall summary statistics across all groups in current filter
    const overallStats = useMemo(() => {
        let sent = 0
        let comm = 0
        let win = 0
        let profit = 0
        filteredHistory.forEach(item => {
            const s = Number(item.total_amount) || 0
            const c = Number(item.total_commission) || 0
            const w = Number(item.total_winnings) || 0
            const p = item.profit_loss != null ? Number(item.profit_loss) : (w + c - s)
            sent += s
            comm += c
            win += w
            profit += p
        })
        return {
            totalRounds: filteredHistory.length,
            totalSent: sent,
            totalComm: comm,
            totalWin: win,
            totalProfit: profit
        }
    }, [filteredHistory])

    // Check if a type is expanded (defaults to initialExpandedAll, which is false / collapsed)
    const isTypeExpanded = (type) => {
        return expandedTypes[type] !== undefined ? !!expandedTypes[type] : !!initialExpandedAll
    }

    // Toggle single card
    const toggleType = (type) => {
        setExpandedTypes(prev => {
            const current = prev[type] !== undefined ? !!prev[type] : !!initialExpandedAll
            return {
                ...prev,
                [type]: !current
            }
        })
    }

    // Check if all current groups are expanded
    const areAllExpanded = useMemo(() => {
        if (groupedByType.length === 0) return false
        return groupedByType.every(g => isTypeExpanded(g.lotteryType))
    }, [groupedByType, expandedTypes])

    // Toggle expand all / collapse all
    const toggleExpandAll = () => {
        const nextState = !areAllExpanded
        const newMap = {}
        groupedByType.forEach(g => {
            newMap[g.lotteryType] = nextState
        })
        setExpandedTypes(newMap)
    }

    // Reset filters
    const handleResetFilters = () => {
        setMonthFilter('all')
        setTypeFilter('all')
    }

    if (loading) {
        return (
            <div className="loading-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                <div className="spinner"></div>
                <div style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)' }}>กำลังโหลดประวัติ...</div>
            </div>
        )
    }

    if (!history || history.length === 0) {
        return (
            <div className="empty-state card">
                <FiClock className="empty-icon" />
                <h3>ไม่มีประวัติ</h3>
                <p>ประวัติจะแสดงเมื่อเจ้ามือสรุปและบันทึกประวัติดังกล่าว</p>
                {onRefresh && (
                    <button className="btn btn-sm btn-secondary" onClick={onRefresh} style={{ marginTop: '0.75rem' }}>
                        <FiRefreshCw /> รีเฟรช
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="user-history-container">
            {/* 1. FILTERS BAR (เหมือนกับแท็บประวัติของ Dealer) */}
            <div className="user-history-filters-bar">
                <div className="user-history-filter-item">
                    <label>📅 เลือกเดือน:</label>
                    <select 
                        className="form-control" 
                        value={monthFilter} 
                        onChange={e => setMonthFilter(e.target.value)}
                    >
                        <option value="all">ทุกเดือน</option>
                        {availableMonths.map(ym => (
                            <option key={ym} value={ym}>{formatMonthLabel(ym)}</option>
                        ))}
                    </select>
                </div>

                <div className="user-history-filter-item">
                    <label>🎯 ประเภทหวย:</label>
                    <select 
                        className="form-control" 
                        value={typeFilter} 
                        onChange={e => setTypeFilter(e.target.value)}
                    >
                        <option value="all">ทุกประเภทหวย</option>
                        {availableTypes.map(type => (
                            <option key={type} value={type}>{LOTTERY_TYPES[type] || type}</option>
                        ))}
                    </select>
                </div>

                <div className="user-history-actions">
                    {groupedByType.length > 0 && (
                        <button 
                            type="button" 
                            className="user-history-btn-toggle-all"
                            onClick={toggleExpandAll}
                            title={areAllExpanded ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด'}
                        >
                            {areAllExpanded ? <FiMinus size={13} /> : <FiPlus size={13} />}
                            <span>{areAllExpanded ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด'}</span>
                        </button>
                    )}
                    {onRefresh && (
                        <button 
                            type="button"
                            className="user-history-btn-toggle-all"
                            onClick={onRefresh}
                            title="รีเฟรชประวัติ"
                        >
                            <FiRefreshCw size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. OVERALL SUMMARY CARDS */}
            <div className="user-history-overall-summary">
                <div className="user-history-summary-card">
                    <span className="summary-label">งวดทั้งหมด</span>
                    <span className="summary-value">{`${overallStats.totalRounds} งวด`}</span>
                </div>
                <div className="user-history-summary-card">
                    <span className="summary-label">ยอดส่งรวม</span>
                    <span className="summary-value" style={{ color: 'var(--color-danger, #ef4444)' }}>
                        -{currencySymbol}{Math.abs(Math.round(overallStats.totalSent)).toLocaleString()}
                    </span>
                </div>
                <div className="user-history-summary-card">
                    <span className="summary-label">ค่าคอมรวม</span>
                    <span className="summary-value" style={{ color: 'var(--color-success, #00d26a)' }}>
                        +{currencySymbol}{Math.abs(Math.round(overallStats.totalComm)).toLocaleString()}
                    </span>
                </div>
                <div className="user-history-summary-card">
                    <span className="summary-label">รางวัลรวม</span>
                    <span className="summary-value" style={{ color: overallStats.totalWin > 0 ? 'var(--color-warning, #fbbf24)' : 'var(--color-text-muted)' }}>
                        {overallStats.totalWin > 0 ? `+${currencySymbol}${Math.abs(Math.round(overallStats.totalWin)).toLocaleString()}` : `${currencySymbol}0`}
                    </span>
                </div>
                <div className={`user-history-summary-card user-history-summary-card-profit ${overallStats.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                    <span className="summary-label">กำไร/ขาดทุนสุทธิ</span>
                    <span className="summary-value">
                        {overallStats.totalProfit >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(Math.round(overallStats.totalProfit)).toLocaleString()}
                    </span>
                </div>
            </div>

            {/* 3. GROUPS BY LOTTERY TYPE (การ์ดแยกแต่ละประเภทงวดหวย) */}
            {groupedByType.length === 0 ? (
                <div className="user-history-empty">
                    <FiFilter className="user-history-empty-icon" />
                    <h4>ไม่พบข้อมูลประวัติในช่วงเวลาที่เลือก</h4>
                    <p>ลองเปลี่ยนตัวกรองเดือนหรือประเภทหวยเพื่อดูข้อมูล</p>
                    <button type="button" className="user-history-reset-btn" onClick={handleResetFilters}>
                        ล้างตัวกรอง
                    </button>
                </div>
            ) : (
                <div className="user-history-groups-list">
                    {groupedByType.map(group => {
                        const isExpanded = isTypeExpanded(group.lotteryType)
                        const isProfitable = group.totalProfit >= 0

                        return (
                            <div key={group.lotteryType} className="user-history-lottery-card">
                                {/* Accordion Header */}
                                <div 
                                    className="user-history-card-header"
                                    onClick={() => toggleType(group.lotteryType)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            toggleType(group.lotteryType)
                                        }
                                    }}
                                >
                                    <div className="user-history-header-left">
                                        <span className={`lottery-badge ${group.lotteryType}`}>
                                            {group.lotteryName}
                                        </span>
                                        <span className="user-history-lottery-title">
                                            {group.lotteryName}
                                        </span>
                                        <span className="user-history-rounds-badge">
                                            {`${group.items.length} งวด`}
                                        </span>
                                    </div>

                                    <div className="user-history-header-right">
                                        <div className="user-history-header-mini-stats">
                                            <span className="user-history-mini-stat sent" title="ยอดส่งรวม">
                                                <span className="stat-label">ส่ง:</span>
                                                <span className="stat-val">{currencySymbol}{Math.round(group.totalSent).toLocaleString()}</span>
                                            </span>
                                            <span className="user-history-mini-stat comm" title="ค่าคอมรวม">
                                                <span className="stat-label">คอม:</span>
                                                <span className="stat-val">+{currencySymbol}{Math.round(group.totalComm).toLocaleString()}</span>
                                            </span>
                                            <span className="user-history-mini-stat win" title="รางวัลรวม">
                                                <span className="stat-label">รางวัล:</span>
                                                <span className="stat-val">{group.totalWin > 0 ? `+${currencySymbol}${Math.round(group.totalWin).toLocaleString()}` : `${currencySymbol}0`}</span>
                                            </span>
                                            <span className={`user-history-mini-stat profit ${isProfitable ? 'positive' : 'negative'}`} title="กำไร/ขาดทุนรวม">
                                                <span className="stat-label">กำไร:</span>
                                                <span className="stat-val">{isProfitable ? '+' : '-'}{currencySymbol}{Math.abs(Math.round(group.totalProfit)).toLocaleString()}</span>
                                            </span>
                                        </div>

                                        <div className="user-history-expand-icon">
                                            {isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Accordion Content: Table (แสดงผลของแต่ละงวดเป็นตาราง) */}
                                {isExpanded && (
                                    <div className="user-history-table-container">
                                        <table className="user-history-table">
                                            <thead>
                                                <tr>
                                                    <th className="col-date">งวดวันที่</th>
                                                    <th className="col-num">ยอดส่ง</th>
                                                    <th className="col-num">ค่าคอม</th>
                                                    <th className="col-num">รางวัล</th>
                                                    <th className="col-num">กำไร</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(round => {
                                                    const profit = round.profit_loss != null 
                                                        ? Number(round.profit_loss)
                                                        : ((Number(round.total_winnings) || 0) + (Number(round.total_commission) || 0) - (Number(round.total_amount) || 0))
                                                    const isWin = Number(round.total_winnings || 0) > 0
                                                    const isRoundProfitable = profit >= 0

                                                    return (
                                                        <tr key={round.id || `${round.round_id}_${round.round_date}`}>
                                                            <td className="col-date">
                                                                <div className="user-history-date-cell">
                                                                    <FiCalendar className="user-history-date-icon" />
                                                                    <span className="user-history-date-text">
                                                                        {formatThaiDate(round)}
                                                                    </span>
                                                                    {round.lottery_name && round.lottery_name !== group.lotteryName && (
                                                                        <span className="user-history-sub-name">
                                                                            {round.lottery_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="col-num user-history-val-sent">
                                                                {`${currencySymbol}${(Number(round.total_amount || 0)).toLocaleString()}`}
                                                            </td>
                                                            <td className="col-num user-history-val-comm">
                                                                {`${currencySymbol}${(Number(round.total_commission || 0)).toLocaleString()}`}
                                                            </td>
                                                            <td className={`col-num user-history-val-win ${isWin ? 'winner' : ''}`}>
                                                                {`${currencySymbol}${(Number(round.total_winnings || 0)).toLocaleString()}`}
                                                            </td>
                                                            <td className={`col-num user-history-val-profit ${isRoundProfitable ? 'positive' : 'negative'}`}>
                                                                {profit < 0 
                                                                    ? `-${currencySymbol}${Math.abs(Math.round(profit)).toLocaleString()}` 
                                                                    : (profit > 0 ? `+${currencySymbol}${Math.round(profit).toLocaleString()}` : `${currencySymbol}0`)}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="summary-row">
                                                    <td className="col-date">
                                                        {`รวม (${group.items.length} งวด)`}
                                                    </td>
                                                    <td className="col-num user-history-val-sent">
                                                        {`${currencySymbol}${Math.round(group.totalSent).toLocaleString()}`}
                                                    </td>
                                                    <td className="col-num user-history-val-comm">
                                                        {`${currencySymbol}${Math.round(group.totalComm).toLocaleString()}`}
                                                    </td>
                                                    <td className={`col-num user-history-val-win ${group.totalWin > 0 ? 'winner' : ''}`}>
                                                        {`${currencySymbol}${Math.round(group.totalWin).toLocaleString()}`}
                                                    </td>
                                                    <td className={`col-num user-history-val-profit ${isProfitable ? 'positive' : 'negative'}`}>
                                                        {group.totalProfit < 0 
                                                            ? `-${currencySymbol}${Math.abs(Math.round(group.totalProfit)).toLocaleString()}` 
                                                            : (group.totalProfit > 0 ? `+${currencySymbol}${Math.round(group.totalProfit).toLocaleString()}` : `${currencySymbol}0`)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
