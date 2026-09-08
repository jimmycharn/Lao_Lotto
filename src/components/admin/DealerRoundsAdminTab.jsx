import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import DeleteRoundConfirmModal from './DeleteRoundConfirmModal'
import BulkCleanupConfirmModal from './BulkCleanupConfirmModal'
import {
    FiCalendar,
    FiUser,
    FiClock,
    FiDatabase,
    FiTrash2,
    FiRefreshCw,
    FiSearch,
    FiX,
    FiAlertTriangle,
    FiCheckCircle,
    FiArchive,
    FiLayers
} from 'react-icons/fi'
import './DealerRoundsAdminTab.css'

export function formatRoundDate(round) {
    if (!round) return '-'
    const dateVal = round.close_time || round.round_date
    if (!dateVal) return '-'
    return new Date(dateVal).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
}

export function getRoundDateISO(round) {
    if (!round) return ''
    const dateVal = round.close_time || round.round_date
    if (!dateVal) return ''
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return ''

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
    return formatter.format(d)
}

export function getTodayDateString() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
    return formatter.format(new Date())
}

export function formatDateValueThai(dateStr) {
    if (!dateStr) return ''
    const parts = dateStr.split('-').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr
    const [y, m, d] = parts
    const dateObj = new Date(y, m - 1, d)
    return dateObj.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
}

export function computeOverviewStats(rounds = []) {
    let totalRounds = rounds.length
    let openRounds = 0
    let closedRounds = 0
    let announcedRounds = 0
    let totalSubmissions = 0
    let totalAmount = 0

    rounds.forEach(r => {
        const isAnnounced = r.status === 'announced' || r.is_result_announced === true
        if (isAnnounced) {
            announcedRounds++
        } else if (r.status === 'closed') {
            closedRounds++
        } else {
            openRounds++
        }

        totalSubmissions += Number(r.submission_count) || 0
        totalAmount += Number(r.total_amount) || 0
    })

    return {
        totalRounds,
        openRounds,
        closedRounds,
        announcedRounds,
        totalSubmissions,
        totalAmount
    }
}

export function filterRounds(
    rounds = [],
    {
        dealerId = 'all',
        statusFilter = 'all',
        searchTerm = '',
        dateFilterType = 'all',
        dateFilterValue = ''
    } = {}
) {
    return rounds.filter(r => {
        // 1. Filter by Dealer
        if (dealerId !== 'all' && r.dealer_id !== dealerId) {
            return false
        }

        // 2. Filter by Status
        const isAnnounced = r.status === 'announced' || r.is_result_announced === true
        if (statusFilter === 'open') {
            if (isAnnounced || r.status !== 'open') return false
        } else if (statusFilter === 'closed') {
            if (isAnnounced || r.status !== 'closed') return false
        } else if (statusFilter === 'announced') {
            if (!isAnnounced) return false
        }

        // 3. Filter by Round Date (based on close_time, fallback to round_date)
        if (dateFilterType !== 'all' && dateFilterValue) {
            const roundDateISO = getRoundDateISO(r)
            if (roundDateISO) {
                if (dateFilterType === 'before') {
                    if (roundDateISO >= dateFilterValue) return false
                } else if (dateFilterType === 'exact') {
                    if (roundDateISO !== dateFilterValue) return false
                }
            } else {
                return false
            }
        }

        // 4. Filter by Search Term
        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase().trim()
            const matchName = (r.lottery_name || '').toLowerCase().includes(term)
            const matchType = (r.lottery_type || '').toLowerCase().includes(term)
            const matchDealer = (r.dealer_name || '').toLowerCase().includes(term)
            const matchEmail = (r.dealer_email || '').toLowerCase().includes(term)
            if (!matchName && !matchType && !matchDealer && !matchEmail) {
                return false
            }
        }

        return true
    }).sort((a, b) => {
        const timeA = new Date(a.close_time || a.round_date).getTime() || 0
        const timeB = new Date(b.close_time || b.round_date).getTime() || 0
        return timeB - timeA
    })
}

export default function DealerRoundsAdminTab({ currentUser }) {
    const { toast } = useToast()
    const [rounds, setRounds] = useState([])
    const [dealers, setDealers] = useState([])
    const [selectedDealerId, setSelectedDealerId] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [dateFilterType, setDateFilterType] = useState('all') // 'all' | 'before' | 'exact'
    const [dateFilterValue, setDateFilterValue] = useState('')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Handle date filter type change
    const handleDateFilterTypeChange = (newType) => {
        setDateFilterType(newType)
        if (newType !== 'all' && !dateFilterValue) {
            setDateFilterValue(getTodayDateString())
        }
    }

    const selectedDealerObj = useMemo(() => {
        return dealers.find(d => d.id === selectedDealerId)
    }, [dealers, selectedDealerId])

    const selectedDealerName = selectedDealerObj ? selectedDealerObj.full_name : 'ทุก Dealer'

    // Modal states
    const [deletingRound, setDeletingRound] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showBulkModal, setShowBulkModal] = useState(false)
    const [isCleaning, setIsCleaning] = useState(false)

    // Fetch data
    const fetchAllData = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true)
        else setRefreshing(true)

        try {
            // 1. Fetch dealers list
            const { data: dealerData, error: dealerError } = await supabase
                .from('profiles')
                .select('id, full_name, email, role')
                .eq('role', 'dealer')
                .order('full_name', { ascending: true })

            if (!dealerError && dealerData) {
                setDealers(dealerData)
            }

            // 2. Fetch dealer rounds with server-side aggregated submission counts (bypassing 1000 limit)
            const { data: roundsData, error: roundsError } = await supabase
                .rpc('superadmin_get_dealer_rounds', { p_dealer_id: null })

            if (roundsError) {
                console.error('Error fetching dealer rounds:', roundsError)
                toast.error('ไม่สามารถโหลดข้อมูลรอบหวยได้: ' + (roundsError.message || ''))
            } else {
                setRounds(roundsData || [])
            }
        } catch (err) {
            console.error('Unexpected error fetching rounds:', err)
            toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [toast])

    useEffect(() => {
        fetchAllData()
    }, [fetchAllData])

    // Calculate overview statistics
    const stats = useMemo(() => computeOverviewStats(rounds), [rounds])

    // Filtered rounds based on controls
    const filteredRounds = useMemo(() => {
        return filterRounds(rounds, {
            dealerId: selectedDealerId,
            statusFilter,
            searchTerm,
            dateFilterType,
            dateFilterValue
        })
    }, [rounds, selectedDealerId, statusFilter, searchTerm, dateFilterType, dateFilterValue])

    // Announced rounds count in current scope (for bulk clean)
    const announcedInScope = useMemo(() => {
        return rounds.filter(r => {
            if (selectedDealerId !== 'all' && r.dealer_id !== selectedDealerId) return false
            if (dateFilterType !== 'all' && dateFilterValue) {
                const rDate = getRoundDateISO(r)
                if (rDate) {
                    if (dateFilterType === 'before' && rDate >= dateFilterValue) return false
                    if (dateFilterType === 'exact' && rDate !== dateFilterValue) return false
                } else {
                    return false
                }
            }
            return r.status === 'announced' || r.is_result_announced === true
        })
    }, [rounds, selectedDealerId, dateFilterType, dateFilterValue])

    const totalAnnouncedSubsInScope = useMemo(() => {
        return announcedInScope.reduce((sum, r) => sum + (Number(r.submission_count) || 0), 0)
    }, [announcedInScope])

    const dateScopeText = useMemo(() => {
        if (dateFilterType === 'before' && dateFilterValue) {
            return `ก่อนวันที่ ${formatDateValueThai(dateFilterValue)}`
        }
        if (dateFilterType === 'exact' && dateFilterValue) {
            return `เฉพาะวันที่ ${formatDateValueThai(dateFilterValue)}`
        }
        return ''
    }, [dateFilterType, dateFilterValue])

    // Handle single round deletion
    const handleConfirmDelete = async () => {
        if (!deletingRound) return
        setIsDeleting(true)

        try {
            const { data, error } = await supabase.rpc('superadmin_delete_round', {
                p_round_id: deletingRound.id
            })

            if (error) {
                throw error
            }

            const deletedSubs = data?.deleted_submissions ?? (deletingRound.submission_count || 0)
            const wasArchived = data?.archived ? 'และจัดเก็บสรุปยอดลงประวัติแล้ว' : ''

            toast.success(`ลบงวด ${deletingRound.lottery_name || deletingRound.lottery_type} สำเร็จ! ล้างข้อมูลโพยออกไป ${deletedSubs.toLocaleString()} รายการ ${wasArchived}`)
            setDeletingRound(null)
            fetchAllData(true)
        } catch (err) {
            console.error('Error deleting round:', err)
            toast.error('เกิดข้อผิดพลาดในการลบงวด: ' + (err.message || ''))
        } finally {
            setIsDeleting(false)
        }
    }

    // Handle bulk cleanup
    const handleConfirmBulkCleanup = async () => {
        setIsCleaning(true)
        try {
            const dealerParam = selectedDealerId === 'all' ? null : selectedDealerId
            const roundIds = announcedInScope.map(r => r.id)

            const { data, error } = await supabase.rpc('superadmin_bulk_cleanup_announced_rounds', {
                p_dealer_id: dealerParam,
                p_round_ids: roundIds
            })

            if (error) {
                throw error
            }

            const roundsDeleted = data?.rounds_deleted || announcedInScope.length
            const subsDeleted = data?.total_submissions_deleted || totalAnnouncedSubsInScope

            toast.success(`ล้างงวดที่ประกาศผลแล้วสำเร็จ ${roundsDeleted} งวด! ลบข้อมูลโพยทั้งหมด ${subsDeleted.toLocaleString()} รายการออกจากฐานข้อมูล`)
            setShowBulkModal(false)
            fetchAllData(true)
        } catch (err) {
            console.error('Error in bulk cleanup:', err)
            toast.error('เกิดข้อผิดพลาดในการล้างงวด: ' + (err.message || ''))
        } finally {
            setIsCleaning(false)
        }
    }

    return (
        <div className="dealer-rounds-admin-container">
            {/* 1. Stat Overview Cards */}
            <div className="rounds-stats-grid">
                <div className="stat-card total">
                    <div className="stat-icon-wrap">
                        <FiCalendar />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">งวดทั้งหมด</span>
                        <span className="stat-value">{stats.totalRounds}</span>
                    </div>
                </div>

                <div className="stat-card open">
                    <div className="stat-icon-wrap">
                        <span className="dot-pulse green" />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">เปิดรับแทง</span>
                        <span className="stat-value">{stats.openRounds}</span>
                    </div>
                </div>

                <div className="stat-card closed">
                    <div className="stat-icon-wrap">
                        <span className="dot-pulse orange" />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">ปิดรอผล</span>
                        <span className="stat-value">{stats.closedRounds}</span>
                    </div>
                </div>

                <div className="stat-card announced">
                    <div className="stat-icon-wrap">
                        <FiCheckCircle />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">ประกาศผลแล้ว</span>
                        <span className="stat-value">{stats.announcedRounds}</span>
                    </div>
                </div>

                <div className={`stat-card submissions ${stats.totalSubmissions > 5000 ? 'heavy-load' : ''}`}>
                    <div className="stat-icon-wrap">
                        <FiDatabase />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">โพยรวมในระบบ</span>
                        <span className="stat-value">{stats.totalSubmissions.toLocaleString('th-TH')}</span>
                        <span className="stat-sub">
                            ฿{stats.totalAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. Control Bar (Dealer selector, Status tabs, Search & Quick Actions) */}
            <div className="rounds-control-bar">
                <div className="control-left-section">
                    {/* Dealer Dropdown */}
                    <div className="dealer-select-wrap">
                        <FiUser className="select-icon" />
                        <select
                            className="dealer-dropdown"
                            value={selectedDealerId}
                            onChange={e => setSelectedDealerId(e.target.value)}
                        >
                            <option value="all">เจ้ามือทั้งหมด ({dealers.length} เจ้ามือ)</option>
                            {dealers.map(dealer => {
                                const dealerRoundsCount = rounds.filter(r => r.dealer_id === dealer.id).length
                                const dealerSubsCount = rounds
                                    .filter(r => r.dealer_id === dealer.id)
                                    .reduce((sum, r) => sum + (Number(r.submission_count) || 0), 0)
                                return (
                                    <option key={dealer.id} value={dealer.id}>
                                        {dealer.full_name} ({dealerRoundsCount} งวด • {dealerSubsCount.toLocaleString()} โพย)
                                    </option>
                                )
                            })}
                        </select>
                    </div>

                    {/* Date Filter Dropdown & Input */}
                    <div className="date-filter-group">
                        <div className="date-filter-wrap">
                            <FiCalendar className="select-icon" />
                            <select
                                className="date-filter-dropdown"
                                value={dateFilterType}
                                onChange={e => handleDateFilterTypeChange(e.target.value)}
                            >
                                <option value="all">📅 แสดงทุกงวด</option>
                                <option value="before">⏳ ก่อนงวดวันที่</option>
                                <option value="exact">🎯 เฉพาะงวดวันที่</option>
                            </select>
                        </div>

                        {dateFilterType !== 'all' && (
                            <div className="date-input-wrap">
                                <input
                                    type="date"
                                    className="date-picker-input"
                                    value={dateFilterValue}
                                    onChange={e => setDateFilterValue(e.target.value)}
                                    title={dateFilterType === 'before' ? 'แสดงงวดที่ปิดก่อนวันที่นี้' : 'แสดงงวดที่ปิดในวันที่นี้'}
                                />
                                <button
                                    type="button"
                                    className="clear-date-btn"
                                    onClick={() => {
                                        setDateFilterType('all')
                                        setDateFilterValue('')
                                    }}
                                    title="ล้างตัวกรองวันที่ (แสดงทุกงวด)"
                                >
                                    <FiX />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Status Tabs */}
                    <div className="status-pills-bar">
                        <button
                            type="button"
                            className={`status-pill ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('all')}
                        >
                            ทั้งหมด ({rounds.length})
                        </button>
                        <button
                            type="button"
                            className={`status-pill pill-open ${statusFilter === 'open' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('open')}
                        >
                            🟢 เปิดรับ ({stats.openRounds})
                        </button>
                        <button
                            type="button"
                            className={`status-pill pill-closed ${statusFilter === 'closed' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('closed')}
                        >
                            🟡 ปิดรอผล ({stats.closedRounds})
                        </button>
                        <button
                            type="button"
                            className={`status-pill pill-announced ${statusFilter === 'announced' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('announced')}
                        >
                            🟣 ประกาศแล้ว ({stats.announcedRounds})
                        </button>
                    </div>
                </div>

                <div className="control-right-section">
                    {/* Search Input */}
                    <div className="search-wrap">
                        <FiSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="ค้นหางวด หรือ เจ้ามือ..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="clear-btn"
                                onClick={() => setSearchTerm('')}
                                title="ล้างการค้นหา"
                            >
                                <FiX />
                            </button>
                        )}
                    </div>

                    {/* Refresh Button */}
                    <button
                        type="button"
                        className={`action-icon-btn ${refreshing ? 'spinning' : ''}`}
                        onClick={() => fetchAllData(true)}
                        title="รีเฟรชข้อมูล"
                        disabled={refreshing || loading}
                    >
                        <FiRefreshCw />
                    </button>

                    {/* Bulk Cleanup Button */}
                    {announcedInScope.length > 0 && (
                        <button
                            type="button"
                            className="btn-bulk-clean"
                            onClick={() => setShowBulkModal(true)}
                            title="ล้างงวดที่ประกาศผลแล้วทั้งหมดเพื่อลดภาระ DB"
                        >
                            <FiTrash2 /> ล้างที่ประกาศผลแล้ว ({announcedInScope.length})
                        </button>
                    )}
                </div>
            </div>

            {/* 3. Rounds Grid */}
            {loading ? (
                <div className="rounds-loading-state">
                    <div className="spinner-large" />
                    <p>กำลังโหลดข้อมูลรอบหวยและคำนวณจำนวนโพย...</p>
                </div>
            ) : filteredRounds.length === 0 ? (
                <div className="rounds-empty-state">
                    <FiLayers className="empty-icon" />
                    <h4>ไม่พบงวดหวยตามเงื่อนไขที่เลือก</h4>
                    <p>
                        {dateFilterType === 'before' && dateFilterValue && `ไม่มีงวดหวยก่อนวันที่ ${formatDateValueThai(dateFilterValue)} • `}
                        {dateFilterType === 'exact' && dateFilterValue && `ไม่มีงวดหวยเฉพาะวันที่ ${formatDateValueThai(dateFilterValue)} • `}
                        ลองเปลี่ยนตัวกรองเจ้ามือ, สถานะ หรือปรับเงื่อนไขวันที่ใหม่
                    </p>
                </div>
            ) : (
                <div className="rounds-cards-grid">
                    {filteredRounds.map(round => {
                        const isAnnounced = round.status === 'announced' || round.is_result_announced === true
                        const subCount = Number(round.submission_count) || 0
                        const totalAmt = Number(round.total_amount) || 0

                        return (
                            <div
                                key={round.id}
                                className={`round-card-item ${isAnnounced ? 'is-announced' : round.status === 'closed' ? 'is-closed' : 'is-open'}`}
                            >
                                {/* Card Header */}
                                <div className="card-top-header">
                                    <div className="lottery-title-block">
                                        <h4 className="lottery-name">
                                            {round.lottery_name || round.lottery_type}
                                        </h4>
                                        <span className="lottery-type-tag">
                                            {round.lottery_type}
                                        </span>
                                    </div>
                                    <span className={`status-tag ${isAnnounced ? 'announced' : round.status === 'closed' ? 'closed' : 'open'}`}>
                                        {isAnnounced ? 'ประกาศผลแล้ว' : round.status === 'closed' ? 'ปิดรับแทง' : 'เปิดรับแทง'}
                                    </span>
                                </div>

                                {/* Card Body */}
                                <div className="card-body-content">
                                    {/* Dealer row */}
                                    <div className="card-info-row dealer-row">
                                        <div className="dealer-avatar-badge">
                                            <FiUser />
                                        </div>
                                        <div className="dealer-text-wrap">
                                            <span className="dealer-name">{round.dealer_name}</span>
                                            {round.dealer_email && (
                                                <span className="dealer-email">{round.dealer_email}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Round date (close date) and close time */}
                                    <div className="card-info-row time-row">
                                        <div className="time-item">
                                            <FiCalendar className="time-icon" />
                                            <span>
                                                {formatRoundDate(round)}
                                            </span>
                                        </div>
                                        {round.close_time && (
                                            <div className="time-item">
                                                <FiClock className="time-icon" />
                                                <span>
                                                    ปิด:{' '}
                                                    {new Date(round.close_time).toLocaleTimeString('th-TH', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Submissions & Amount metric bar */}
                                    <div className={`submissions-metric-box ${subCount > 1000 ? 'warning-load' : ''}`}>
                                        <div className="metric-col">
                                            <span className="metric-label">จำนวนโพยในงวด</span>
                                            <span className="metric-value count">
                                                <FiDatabase style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                                {subCount.toLocaleString('th-TH')} รายการ
                                            </span>
                                        </div>
                                        <div className="metric-col right">
                                            <span className="metric-label">ยอดแทงรวม</span>
                                            <span className="metric-value amount">
                                                ฿{totalAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Winning numbers if announced */}
                                    {isAnnounced && round.winning_numbers && (
                                        <div className="winning-numbers-box">
                                            <span className="winning-label">ผลรางวัล:</span>
                                            <div className="winning-pills">
                                                {round.winning_numbers['3_top'] && (
                                                    <span className="win-pill top3">
                                                        3 บน: <strong>{round.winning_numbers['3_top']}</strong>
                                                    </span>
                                                )}
                                                {round.winning_numbers['2_top'] && (
                                                    <span className="win-pill top2">
                                                        2 บน: <strong>{round.winning_numbers['2_top']}</strong>
                                                    </span>
                                                )}
                                                {round.winning_numbers['2_bottom'] && (
                                                    <span className="win-pill bot2">
                                                        2 ล่าง: <strong>{round.winning_numbers['2_bottom']}</strong>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Archive indicator */}
                                    {round.is_archived && (
                                        <div className="archive-badge-tag" title="งวดนี้มีข้อมูลสรุปใน round_history แล้ว">
                                            <FiArchive /> บันทึกประวัติแล้ว
                                        </div>
                                    )}
                                </div>

                                {/* Card Footer / Delete Action */}
                                <div className="card-footer-action">
                                    <button
                                        type="button"
                                        className={`btn-delete-card ${isAnnounced ? 'btn-archive-clean' : 'btn-danger-clean'}`}
                                        onClick={() => setDeletingRound(round)}
                                        title="ลบงวดนี้"
                                    >
                                        <FiTrash2 /> {isAnnounced ? 'ลบงวด (สรุปบัญชี)' : 'ลบงวดนี้'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 4. Modals */}
            <DeleteRoundConfirmModal
                round={deletingRound}
                isOpen={Boolean(deletingRound)}
                onClose={() => setDeletingRound(null)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
            />

            <BulkCleanupConfirmModal
                isOpen={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                onConfirm={handleConfirmBulkCleanup}
                isCleaning={isCleaning}
                dealerName={selectedDealerName}
                roundCount={announcedInScope.length}
                totalSubmissions={totalAnnouncedSubsInScope}
                dateScopeText={dateScopeText}
            />
        </div>
    )
}
