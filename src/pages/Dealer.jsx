import { useState, useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import QRCode from 'react-qr-code'
import { jsPDF } from 'jspdf'
import { addThaiFont } from '../utils/thaiFontLoader'
import {
    FiPlus,
    FiUsers,
    FiUser,
    FiGrid,
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
    FiLock,
    FiSend,
    FiRotateCcw,
    FiChevronDown,
    FiChevronUp,
    FiSave,
    FiStar,
    FiPackage,
    FiAlertCircle,
    FiSearch
} from 'react-icons/fi'
import './Dealer.css'
import './SettingsTabs.css'

// Helper function to generate batch ID (UUID v4 format - works in all browsers)
const generateBatchId = () => {
    // Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

// Lottery type labels
const LOTTERY_TYPES = {
    'thai': 'หวยไทย',
    'lao': 'หวยลาว',
    'hanoi': 'หวยฮานอย',
    'stock': 'หวยหุ้น'
}

// Bet types by lottery type (matching user_settings structure)
const BET_TYPES_BY_LOTTERY = {
    thai: {
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_front': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '3_top': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '3_bottom': { label: '3 ตัวล่าง', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    lao: {
        '4_top': { label: '4 ตัวตรง', defaultLimit: 200, isSet: true, defaultSetPrice: 120 },
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_front_single': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '3_straight': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod_single': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    hanoi: {
        '4_top': { label: '4 ตัวตรง', defaultLimit: 200, isSet: true, defaultSetPrice: 120 },
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_front_single': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '3_straight': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod_single': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    stock: {
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 }
    }
}

// Legacy bet type labels (for displaying results/submissions)
const BET_TYPES = {
    // 1 Digit
    'run_top': 'วิ่งบน',
    'run_bottom': 'วิ่งล่าง',
    'front_top_1': 'หน้าบน',
    'middle_top_1': 'กลางบน',
    'back_top_1': 'หลังบน',
    'front_bottom_1': 'หน้าล่าง',
    'back_bottom_1': 'หลังล่าง',
    'pak_top': 'ปักบน',
    'pak_bottom': 'ปักล่าง',

    // 2 Digits
    '2_top': '2 ตัวบน',
    '2_bottom': '2 ตัวล่าง',
    '2_front': '2 ตัวหน้า',
    '2_front_single': '2 ตัวหน้า',
    '2_back': '2 ตัวหลัง',
    '2_center': '2 ตัวถ่าง',
    '2_spread': '2 ตัวถ่าง',
    '2_have': '2 ตัวมี',
    '2_run': '2 ตัวลอย',

    // 2 Digits Reversed (กลับ)
    '2_top_rev': '2 บนกลับ',
    '2_front_rev': '2 หน้ากลับ',
    '2_spread_rev': '2 ถ่างกลับ',
    '2_bottom_rev': '2 ล่างกลับ',

    // 3 Digits
    '3_top': '3 ตัวบน',
    '3_tod': '3 ตัวโต๊ด',
    '3_front': '3 ตัวหน้า',
    '3_back': '3 ตัวหลัง',
    '3_bottom': '3 ตัวล่าง',
    '3_straight': '3 ตัวตรง',
    '3_tod_single': '3 ตัวโต๊ด',

    // 4 Digits
    '4_top': '4 ตัวตรง',
    '4_tod': '4 ตัวโต๊ด',
    '4_set': '4 ตัวชุด',
    '4_float': '4 ตัวลอย',
    '4_run': '4 ตัวลอย',

    // 5 Digits
    '5_float': '5 ตัวลอย',
    '5_run': '5 ตัวลอย',

    // 6 Digits
    '6_top': '6 ตัว (รางวัลที่ 1)'
}

// Helper to get default limits for a lottery type
function getDefaultLimitsForType(lotteryType) {
    const betTypes = BET_TYPES_BY_LOTTERY[lotteryType] || {}
    const limits = {}
    Object.entries(betTypes).forEach(([key, config]) => {
        limits[key] = config.defaultLimit
    })
    return limits
}

// Helper to get default set prices for a lottery type
function getDefaultSetPricesForType(lotteryType) {
    const betTypes = BET_TYPES_BY_LOTTERY[lotteryType] || {}
    const setPrices = {}
    Object.entries(betTypes).forEach(([key, config]) => {
        if (config.isSet) {
            setPrices[key] = config.defaultSetPrice || 120
        }
    })
    return setPrices
}

// Bet types that should normalize numbers (order doesn't matter)
const PERMUTATION_BET_TYPES = ['2_run', '2_spread', '3_tod', '3_tod_single', '4_run', '4_tod', '4_float', '5_run', '5_float']

// Normalize number by sorting digits (for permutation bet types)
function normalizeNumber(numbers, betType) {
    if (PERMUTATION_BET_TYPES.includes(betType)) {
        return numbers.split('').sort().join('')
    }
    return numbers
}

// Round Accordion Item Component
function RoundAccordionItem({ round, isSelected, onSelect, onShowSubmissions, onCloseRound, onEditRound, onShowNumberLimits, onDeleteRound, onShowResults, getStatusBadge, formatDate, formatTime, user }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [summaryData, setSummaryData] = useState({ loading: false, submissions: [], userSettings: {} })

    // Inline submissions view states
    const [viewMode, setViewMode] = useState('summary') // 'summary' | 'submissions'
    const [inlineTab, setInlineTab] = useState('total') // 'total' | 'excess' | 'transferred'
    const [inlineSubmissions, setInlineSubmissions] = useState([])
    const [inlineTypeLimits, setInlineTypeLimits] = useState({})
    const [inlineNumberLimits, setInlineNumberLimits] = useState([])
    const [inlineTransfers, setInlineTransfers] = useState([])
    const [inlineLoading, setInlineLoading] = useState(false)
    const [inlineUserFilter, setInlineUserFilter] = useState('all')
    const [inlineBetTypeFilter, setInlineBetTypeFilter] = useState('all')
    const [isGrouped, setIsGrouped] = useState(false)
    const [inlineSearch, setInlineSearch] = useState('')

    const isAnnounced = round.status === 'announced' && round.is_result_announced

    // Check if round is currently open
    const isOpen = (() => {
        if (round.status === 'announced' || round.status === 'closed') return false
        const now = new Date()
        const closeTime = new Date(round.close_time)
        return now <= closeTime
    })()

    // Fetch summary data immediately when announced OR when open (to show totals in header)
    useEffect(() => {
        if ((isAnnounced || isOpen) && summaryData.submissions.length === 0 && !summaryData.loading) {
            fetchSummaryData()
        }
    }, [isAnnounced, isOpen])

    async function fetchSummaryData() {
        setSummaryData(prev => ({ ...prev, loading: true }))
        try {
            const { data: submissionsData } = await supabase
                .from('submissions')
                .select('*, profiles(id, full_name, email)')
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            const userIds = [...new Set((submissionsData || []).map(s => s.user_id))]
            const settingsMap = {}

            for (const userId of userIds) {
                const { data: settingsData } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('dealer_id', user?.id)
                    .single()
                if (settingsData) settingsMap[userId] = settingsData
            }

            setSummaryData({ submissions: submissionsData || [], userSettings: settingsMap, loading: false })
        } catch (error) {
            console.error('Error fetching summary:', error)
            setSummaryData(prev => ({ ...prev, loading: false }))
        }
    }

    // Fetch inline submissions data for eye button view
    async function fetchInlineSubmissions() {
        if (inlineSubmissions.length > 0) return // Already fetched
        setInlineLoading(true)
        try {
            // Fetch submissions
            const { data: subsData } = await supabase
                .from('submissions')
                .select(`*, profiles (full_name, email)`)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
            setInlineSubmissions(subsData || [])

            // Fetch type limits
            const { data: typeLimitsData } = await supabase
                .from('type_limits')
                .select('*')
                .eq('round_id', round.id)
            const limitsObj = {}
            typeLimitsData?.forEach(l => {
                limitsObj[l.bet_type] = l.max_per_number
            })
            setInlineTypeLimits(limitsObj)

            // Fetch number limits
            const { data: numLimitsData } = await supabase
                .from('number_limits')
                .select('*')
                .eq('round_id', round.id)
            setInlineNumberLimits(numLimitsData || [])

            // Fetch transfers
            const { data: transfersData } = await supabase
                .from('over_limit_transfers')
                .select('*')
                .eq('round_id', round.id)
                .order('created_at', { ascending: false })
            setInlineTransfers(transfersData || [])
        } catch (error) {
            console.error('Error fetching inline submissions:', error)
        } finally {
            setInlineLoading(false)
        }
    }

    // Handle eye button click - toggle to submissions view
    const handleEyeClick = (e) => {
        e.stopPropagation()
        if (!isExpanded) {
            setIsExpanded(true)
        }
        if (viewMode === 'submissions') {
            setViewMode('summary')
        } else {
            setViewMode('submissions')
            fetchInlineSubmissions()
        }
    }

    // Calculate excess items (with number normalization for permutation bet types)
    const calculateExcessItems = () => {
        const grouped = {}

        // Determine if this is a Lao/Hanoi lottery (set-based betting)
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        // Get set price for 4_top from round settings
        const setPrice = round?.set_prices?.['4_top'] || 120

        inlineSubmissions.forEach(sub => {
            // Normalize numbers for permutation bet types
            const normalizedNumbers = normalizeNumber(sub.numbers, sub.bet_type)
            const key = `${sub.bet_type}|${normalizedNumbers}`
            if (!grouped[key]) {
                grouped[key] = {
                    bet_type: sub.bet_type,
                    numbers: normalizedNumbers, // Use normalized number for display
                    originalNumbers: [sub.numbers], // Keep track of original numbers
                    total: 0,
                    setCount: 0, // Track number of sets for set-based bets
                    submissions: []
                }
            } else {
                // Add to original numbers list if different
                if (!grouped[key].originalNumbers.includes(sub.numbers)) {
                    grouped[key].originalNumbers.push(sub.numbers)
                }
            }
            grouped[key].total += sub.amount
            grouped[key].submissions.push(sub)

            // For set-based bets (4_set, 4_top in Lao/Hanoi), count number of sets
            if (isSetBasedLottery && (sub.bet_type === '4_set' || sub.bet_type === '4_top')) {
                // Each submission of 4_set is counted as (amount / setPrice) sets
                grouped[key].setCount += Math.ceil(sub.amount / setPrice)
            }
        })

        const excessItems = []
        Object.values(grouped).forEach(item => {
            // For 4_set, map to 4_top for limit lookup (the underlying limit type)
            const limitLookupBetType = item.bet_type === '4_set' ? '4_top' : item.bet_type

            // Check type limit
            const typeLimit = inlineTypeLimits[limitLookupBetType]
            // Check number limit - also normalize for comparison
            const numberLimit = inlineNumberLimits.find(nl => {
                const nlNormalized = normalizeNumber(nl.numbers, nl.bet_type)
                // Also check for 4_set -> 4_top mapping in number limits
                const nlBetType = nl.bet_type === '4_set' ? '4_top' : nl.bet_type
                return nlBetType === limitLookupBetType && nlNormalized === item.numbers
            })
            const effectiveLimit = numberLimit?.max_amount ?? typeLimit

            // For set-based bets in Lao/Hanoi, compare by number of sets, not money amount
            const isSetBased = isSetBasedLottery && (item.bet_type === '4_set' || item.bet_type === '4_top')

            if (effectiveLimit) {
                if (isSetBased) {
                    // For set-based: limit is in "sets", compare setCount vs limit
                    if (item.setCount > effectiveLimit) {
                        excessItems.push({
                            ...item,
                            limit: effectiveLimit,
                            excess: item.setCount - effectiveLimit, // Excess in number of sets
                            isSetBased: true
                        })
                    }
                } else {
                    // For normal bets: compare total amount vs limit
                    if (item.total > effectiveLimit) {
                        excessItems.push({
                            ...item,
                            limit: effectiveLimit,
                            excess: item.total - effectiveLimit
                        })
                    }
                }
            }
        })
        return excessItems.sort((a, b) => b.excess - a.excess)
    }

    // Calculate summary values
    const getLotteryTypeKey = () => {
        if (round.lottery_type === 'thai') return 'thai'
        if (round.lottery_type === 'lao' || round.lottery_type === 'hanoi') return 'lao'
        return 'stock'
    }

    const DEFAULT_COMMISSIONS = {
        'run_top': 15, 'run_bottom': 15, 'pak_top': 15, 'pak_bottom': 15,
        '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
        '3_top': 15, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
        '4_run': 15, '4_tod': 15, '4_set': 15, '4_float': 15, '5_run': 15, '5_float': 15, '6_top': 15
    }

    const DEFAULT_PAYOUTS = {
        'run_top': 3, 'run_bottom': 4, 'pak_top': 8, 'pak_bottom': 6,
        '2_top': 65, '2_front': 65, '2_center': 65, '2_run': 10, '2_bottom': 65,
        '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
        '4_run': 20, '4_tod': 100, '5_run': 10, '6_top': 1000000
    }

    const getCommission = (sub) => {
        // Priority 1: Calculate from user_settings (authoritative source)
        const lotteryKey = getLotteryTypeKey()
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]
        if (settings?.commission !== undefined) {
            return settings.isFixed ? settings.commission : sub.amount * (settings.commission / 100)
        }
        // Priority 2: Use stored commission_amount from submission if available
        if (sub.commission_amount !== undefined && sub.commission_amount !== null) {
            return sub.commission_amount
        }
        // Priority 3: Use default rates
        return sub.amount * ((DEFAULT_COMMISSIONS[sub.bet_type] || 15) / 100)
    }

    const getExpectedPayout = (sub) => {
        if (!sub.is_winner) return 0
        const lotteryKey = getLotteryTypeKey()
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]
        if (settings?.payout !== undefined) return sub.amount * settings.payout
        return sub.amount * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
    }

    // Calculate user summaries (for announced AND open rounds to show in header)
    const userSummaries = (isAnnounced || isOpen) && !summaryData.loading ? Object.values(
        summaryData.submissions.reduce((acc, sub) => {
            const userId = sub.user_id
            if (!acc[userId]) {
                acc[userId] = {
                    userId, userName: sub.profiles?.full_name || sub.profiles?.email || 'ไม่ระบุชื่อ',
                    email: sub.profiles?.email || '', totalBet: 0, totalWin: 0, totalCommission: 0, winCount: 0, ticketCount: 0
                }
            }
            acc[userId].totalBet += sub.amount || 0
            acc[userId].totalWin += getExpectedPayout(sub)
            acc[userId].totalCommission += getCommission(sub)
            acc[userId].ticketCount++
            if (sub.is_winner) acc[userId].winCount++
            return acc
        }, {})
    ).sort((a, b) => (b.totalWin + b.totalCommission - b.totalBet) - (a.totalWin + a.totalCommission - a.totalBet)) : []

    const grandTotalBet = userSummaries.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userSummaries.reduce((sum, u) => sum + u.totalWin, 0)
    const grandTotalCommission = userSummaries.reduce((sum, u) => sum + u.totalCommission, 0)
    const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission

    return (
        <div className={`round-accordion-item ${round.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
            <div className="round-accordion-header card" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="round-header-left">
                    <span className={`lottery-badge ${round.lottery_type}`}>{LOTTERY_TYPES[round.lottery_type]}</span>
                    {getStatusBadge(round)}
                </div>
                <div className="round-header-center">
                    <h3>{round.lottery_name || LOTTERY_TYPES[round.lottery_type]}</h3>
                    <div className="round-meta">
                        <span><FiCalendar /> {formatDate(round.round_date)}</span>
                        <span><FiClock /> {formatTime(round.open_time)} - {formatTime(round.close_time)}</span>
                        <span>{round.submissions?.length || 0} รายการ</span>
                    </div>
                    {/* Show summary inline in header for announced rounds */}
                    {isAnnounced && !summaryData.loading && (
                        <div className="header-summary">
                            <span className="summary-item"><span className="label">แทง</span> {round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                            <span className="summary-item"><span className="label">จ่าย</span> <span className="text-danger">{round.currency_symbol}{grandTotalWin.toLocaleString()}</span></span>
                            <span className="summary-item"><span className="label">คอม</span> <span style={{ color: 'var(--color-warning)' }}>{round.currency_symbol}{grandTotalCommission.toLocaleString()}</span></span>
                            <span className={`summary-item profit ${dealerProfit >= 0 ? 'positive' : 'negative'}`}>
                                <span className="label">กำไร</span> {dealerProfit >= 0 ? '+' : ''}{round.currency_symbol}{dealerProfit.toLocaleString()}
                            </span>
                        </div>
                    )}
                    {/* Show summary inline in header for open rounds (total bet and commission only) */}
                    {isOpen && !summaryData.loading && grandTotalBet > 0 && (
                        <div className="header-summary">
                            <span className="summary-item"><span className="label">ยอดรวม</span> {round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                            <span className="summary-item"><span className="label">คอม</span> <span style={{ color: 'var(--color-warning)' }}>{round.currency_symbol}{grandTotalCommission.toLocaleString()}</span></span>
                        </div>
                    )}
                </div>
                <div className="round-header-right">
                    <div className="round-actions">
                        <button className={`icon-btn ${viewMode === 'submissions' ? 'active' : ''}`} onClick={handleEyeClick} title="ดูเลขที่ส่ง"><FiEye /></button>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onEditRound(); }} title="แก้ไขงวด"><FiEdit2 /></button>
                        {round.status === 'open' && <button className="icon-btn warning" onClick={(e) => { e.stopPropagation(); onCloseRound(); }} title="ปิดงวด"><FiLock /></button>}
                        <button className="icon-btn warning" onClick={(e) => { e.stopPropagation(); onShowNumberLimits(); }} title="ตั้งค่าเลขอั้น"><FiAlertTriangle /></button>
                        <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); onDeleteRound(); }} title="ลบ"><FiTrash2 /></button>
                    </div>
                    <svg className={`chevron ${isExpanded ? 'rotated' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>

            {isExpanded && (
                <div className="round-accordion-content">
                    <div className="accordion-actions">
                        {(round.status === 'closed' || new Date() > new Date(round.close_time)) && !isAnnounced && (
                            <button className="btn btn-accent" onClick={onShowResults}><FiCheck /> ใส่ผลรางวัล</button>
                        )}
                        {isAnnounced && (
                            <button className="btn btn-outline" onClick={onShowResults}><FiEdit2 /> แก้ไขผลรางวัล</button>
                        )}
                    </div>

                    {isAnnounced && viewMode === 'summary' && (
                        summaryData.loading ? (
                            <div className="loading-state"><div className="spinner"></div></div>
                        ) : (
                            <>
                                {userSummaries.length > 0 && (
                                    <div className="user-summary-list" style={{ marginTop: '1rem' }}>
                                        <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>รายละเอียดแต่ละคน</h4>
                                        {userSummaries.map(usr => {
                                            // User's net = totalWin + totalCommission - totalBet
                                            // Dealer's perspective = inverted (dealer loses when user gains)
                                            const userNet = usr.totalWin + usr.totalCommission - usr.totalBet
                                            const dealerNet = -userNet // Invert for dealer's perspective
                                            return (
                                                // dealerNet < 0 = dealer loses = loser card (red border)
                                                // dealerNet > 0 = dealer gains = winner card (green border)
                                                <div key={usr.userId} className={`user-summary-card ${dealerNet < 0 ? 'loser' : dealerNet > 0 ? 'winner' : ''}`}>
                                                    <div className="user-summary-header">
                                                        <div className="user-info">
                                                            <span className="user-name">{usr.userName}</span>
                                                            <span className="user-email">{usr.email}</span>
                                                        </div>
                                                        {/* Show dealer's perspective: negative = red (owe user), positive = green (gain) */}
                                                        <div className={`net-amount ${dealerNet < 0 ? 'negative' : dealerNet > 0 ? 'positive' : ''}`}>
                                                            {dealerNet > 0 ? '+' : ''}{round.currency_symbol}{dealerNet.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="user-summary-details">
                                                        <div className="detail-item"><span className="detail-label">แทง</span><span className="detail-value">{usr.ticketCount} รายการ</span></div>
                                                        <div className="detail-item"><span className="detail-label">ยอดแทง</span><span className="detail-value">{round.currency_symbol}{usr.totalBet.toLocaleString()}</span></div>
                                                        <div className="detail-item"><span className="detail-label">ค่าคอม</span><span className="detail-value" style={{ color: 'var(--color-warning)' }}>{round.currency_symbol}{usr.totalCommission.toLocaleString()}</span></div>
                                                        <div className="detail-item"><span className="detail-label">ถูก/ยอดได้</span><span className={`detail-value ${usr.totalWin > 0 ? 'text-success' : ''}`}>{usr.winCount > 0 ? `${usr.winCount}/${round.currency_symbol}${usr.totalWin.toLocaleString()}` : '-'}</span></div>
                                                    </div>
                                                    <div className="user-summary-footer">
                                                        {/* Dealer's perspective: dealerNet < 0 = must pay (red), dealerNet > 0 = collect (green) */}
                                                        {dealerNet < 0 ? <span className="status-badge lost">ต้องจ่าย {round.currency_symbol}{Math.abs(dealerNet).toLocaleString()}</span>
                                                            : dealerNet > 0 ? <span className="status-badge won">ต้องเก็บ {round.currency_symbol}{dealerNet.toLocaleString()}</span>
                                                                : <span className="status-badge pending">เสมอ</span>}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )
                    )}

                    {/* Inline Submissions View - shown when eye button is clicked */}
                    {viewMode === 'submissions' && (
                        <div className="inline-submissions-view">
                            {/* Tabs */}
                            <div className="inline-tabs">
                                <button
                                    className={`inline-tab ${inlineTab === 'total' ? 'active' : ''}`}
                                    onClick={() => setInlineTab('total')}
                                >
                                    ยอดรวม <span className="tab-count">{inlineSubmissions.length}</span>
                                </button>
                                <button
                                    className={`inline-tab ${inlineTab === 'excess' ? 'active' : ''}`}
                                    onClick={() => setInlineTab('excess')}
                                >
                                    ยอดเกิน <span className="tab-count">{calculateExcessItems().length}</span>
                                </button>
                                <button
                                    className={`inline-tab ${inlineTab === 'transferred' ? 'active' : ''}`}
                                    onClick={() => setInlineTab('transferred')}
                                >
                                    ยอดตีออก <span className="tab-count">{inlineTransfers.length}</span>
                                </button>
                            </div>

                            {inlineLoading ? (
                                <div className="loading-state"><div className="spinner"></div></div>
                            ) : (
                                <>
                                    {/* Tab: ยอดรวม */}
                                    {inlineTab === 'total' && (
                                        <div className="inline-tab-content">
                                            {/* Filters with Toggle Switch */}
                                            <div className="inline-filters">
                                                <select
                                                    value={inlineUserFilter}
                                                    onChange={(e) => setInlineUserFilter(e.target.value)}
                                                    className="form-input"
                                                >
                                                    <option value="all">ทุกคน</option>
                                                    {[...new Set(inlineSubmissions.map(s => s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'))].map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={inlineBetTypeFilter}
                                                    onChange={(e) => setInlineBetTypeFilter(e.target.value)}
                                                    className="form-input"
                                                >
                                                    <option value="all">ทุกประเภท</option>
                                                    {Object.entries(BET_TYPES_BY_LOTTERY[round.lottery_type] || {}).map(([type, config]) => (
                                                        <option key={type} value={type}>{config.label || BET_TYPES[type] || type}</option>
                                                    ))}
                                                </select>
                                                <label className="toggle-switch">
                                                    <input type="checkbox" checked={isGrouped} onChange={(e) => setIsGrouped(e.target.checked)} />
                                                    <span className="toggle-slider"></span>
                                                    <span className="toggle-label">รวมเลข</span>
                                                </label>
                                            </div>

                                            {/* Summary */}
                                            <div className="inline-summary">
                                                <div className="summary-item">
                                                    <span className="label">จำนวน</span>
                                                    <span className="value">{(() => {
                                                        let filtered = inlineSubmissions.filter(s => {
                                                            const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                            if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                            if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                            return true
                                                        })
                                                        if (isGrouped) {
                                                            const grouped = {}
                                                            filtered.forEach(s => {
                                                                const normalizedNumbers = normalizeNumber(s.numbers, s.bet_type)
                                                                const key = `${normalizedNumbers}|${s.bet_type}`
                                                                if (!grouped[key]) grouped[key] = true
                                                            })
                                                            return Object.keys(grouped).length
                                                        }
                                                        return filtered.length
                                                    })()} รายการ</span>
                                                </div>
                                                <div className="summary-item">
                                                    <span className="label">ยอดรวม</span>
                                                    <span className="value">{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                        const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                        if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                        if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                        return true
                                                    }).reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</span>
                                                </div>
                                            </div>

                                            {/* Search */}
                                            <div className="inline-search">
                                                <FiSearch className="search-icon" />
                                                <input
                                                    type="text"
                                                    value={inlineSearch}
                                                    onChange={(e) => setInlineSearch(e.target.value)}
                                                    placeholder="ค้นหาเลข..."
                                                    className="form-input"
                                                />
                                                {inlineSearch && (
                                                    <button className="search-clear" onClick={() => setInlineSearch('')}>
                                                        <FiX />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Table */}
                                            <div className="inline-table-wrap">
                                                <table className="inline-table">
                                                    <thead>
                                                        <tr>
                                                            <th>เลข</th>
                                                            <th>จำนวน</th>
                                                            {!isGrouped && <th>เวลา</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(() => {
                                                            // Filter submissions
                                                            let filteredData = inlineSubmissions.filter(s => {
                                                                const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                                if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                                if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                                if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                                return true
                                                            })

                                                            if (isGrouped) {
                                                                // Group by normalized number + bet_type (for permutation bet types)
                                                                const grouped = {}
                                                                filteredData.forEach(s => {
                                                                    const normalizedNumbers = normalizeNumber(s.numbers, s.bet_type)
                                                                    const key = `${normalizedNumbers}|${s.bet_type}`
                                                                    if (!grouped[key]) {
                                                                        grouped[key] = {
                                                                            numbers: normalizedNumbers, // Use normalized for display
                                                                            originalNumbers: [s.numbers],
                                                                            bet_type: s.bet_type,
                                                                            amount: 0,
                                                                            count: 0,
                                                                            id: key
                                                                        }
                                                                    } else {
                                                                        if (!grouped[key].originalNumbers.includes(s.numbers)) {
                                                                            grouped[key].originalNumbers.push(s.numbers)
                                                                        }
                                                                    }
                                                                    grouped[key].amount += s.amount
                                                                    grouped[key].count += 1
                                                                })
                                                                filteredData = Object.values(grouped).sort((a, b) => b.amount - a.amount)
                                                            }

                                                            return filteredData.map(sub => (
                                                                <tr key={isGrouped ? sub.id : sub.id}>
                                                                    <td className="number-cell">
                                                                        <div className="number-value">{sub.numbers}</div>
                                                                        <div className="type-sub-label">{BET_TYPES[sub.bet_type] || sub.bet_type}</div>
                                                                        {isGrouped && sub.count > 1 && (
                                                                            <div className="count-sub-label">({sub.count} รายการ)</div>
                                                                        )}
                                                                    </td>
                                                                    <td>{round.currency_symbol}{sub.amount.toLocaleString()}</td>
                                                                    {!isGrouped && (
                                                                        <td className="time-cell">{new Date(sub.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                    )}
                                                                </tr>
                                                            ))
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab: ยอดเกิน */}
                                    {inlineTab === 'excess' && (
                                        <div className="inline-tab-content">
                                            {calculateExcessItems().length === 0 ? (
                                                <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                    <p style={{ color: 'var(--color-text-muted)' }}>ไม่มียอดเกิน</p>
                                                </div>
                                            ) : (
                                                <div className="inline-table-wrap">
                                                    <table className="inline-table">
                                                        <thead>
                                                            <tr>
                                                                <th>ประเภท</th>
                                                                <th>เลข</th>
                                                                <th>ยอดรวม</th>
                                                                <th>Limit</th>
                                                                <th>เกิน</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {calculateExcessItems().map(item => (
                                                                <tr key={`${item.bet_type}|${item.numbers}`}>
                                                                    <td><span className="type-badge">{BET_TYPES[item.bet_type] || item.bet_type}</span></td>
                                                                    <td className="number-cell">{item.numbers}</td>
                                                                    <td>{item.isSetBased ? `${item.setCount} ชุด` : `${round.currency_symbol}${item.total.toLocaleString()}`}</td>
                                                                    <td>{item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}</td>
                                                                    <td className="text-danger">{item.isSetBased ? `${item.excess} ชุด` : `${round.currency_symbol}${item.excess.toLocaleString()}`}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Tab: ยอดตีออก */}
                                    {inlineTab === 'transferred' && (
                                        <div className="inline-tab-content">
                                            {inlineTransfers.length === 0 ? (
                                                <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                    <p style={{ color: 'var(--color-text-muted)' }}>ยังไม่มียอดตีออก</p>
                                                </div>
                                            ) : (
                                                <div className="inline-table-wrap">
                                                    <table className="inline-table">
                                                        <thead>
                                                            <tr>
                                                                <th>ประเภท</th>
                                                                <th>เลข</th>
                                                                <th>จำนวน</th>
                                                                <th>ผู้รับ</th>
                                                                <th>สถานะ</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {inlineTransfers.map(transfer => (
                                                                <tr key={transfer.id}>
                                                                    <td><span className="type-badge">{BET_TYPES[transfer.bet_type] || transfer.bet_type}</span></td>
                                                                    <td className="number-cell">{transfer.numbers}</td>
                                                                    <td>{round.currency_symbol}{transfer.amount.toLocaleString()}</td>
                                                                    <td>{transfer.target_dealer_name || '-'}</td>
                                                                    <td><span className={`status-badge ${transfer.status}`}>{transfer.status}</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {!isAnnounced && viewMode === 'summary' && (
                        <div className="empty-state" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <p style={{ color: 'var(--color-text-muted)' }}>ยังไม่ได้ประกาศผลรางวัล</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function Dealer() {
    const { user, profile, isDealer, isSuperAdmin } = useAuth()
    const [searchParams] = useSearchParams()
    const [activeTab, setActiveTab] = useState('rounds')
    const [rounds, setRounds] = useState([])
    const [members, setMembers] = useState([])
    const [pendingMembers, setPendingMembers] = useState([])
    const [blockedMembers, setBlockedMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRound, setSelectedRound] = useState(null)

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingRound, setEditingRound] = useState(null)
    const [showLimitsModal, setShowLimitsModal] = useState(false)
    const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
    const [showResultsModal, setShowResultsModal] = useState(false)

    const [showNumberLimitsModal, setShowNumberLimitsModal] = useState(false)
    const [showSummaryModal, setShowSummaryModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [expandedMemberId, setExpandedMemberId] = useState(null)
    const [subscription, setSubscription] = useState(null)
    const [dealerBankAccounts, setDealerBankAccounts] = useState([])
    const [roundsTab, setRoundsTab] = useState('open') // 'open' | 'closed'

    // Helper to check if a round is still open
    const isRoundOpen = (round) => {
        if (round.status === 'announced' || round.status === 'closed') return false
        const now = new Date()
        const closeTime = new Date(round.close_time)
        return now <= closeTime
    }

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
        type_limits: getDefaultLimitsForType('lao'),
        set_prices: getDefaultSetPricesForType('lao')
    })

    // Update limits when lottery type changes
    const handleLotteryTypeChange = (newType) => {
        setRoundForm(prev => ({
            ...prev,
            lottery_type: newType,
            type_limits: getDefaultLimitsForType(newType),
            set_prices: getDefaultSetPricesForType(newType)
        }))
    }

    // Auto-select input content on focus
    const handleInputFocus = (e) => {
        e.target.select()
    }

    // Move to next input on Enter key
    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const form = e.target.closest('.modal-body')
            if (!form) return

            const inputs = Array.from(form.querySelectorAll('input:not([disabled]), select:not([disabled])'))
            const currentIndex = inputs.indexOf(e.target)

            if (currentIndex !== -1 && currentIndex < inputs.length - 1) {
                const nextInput = inputs[currentIndex + 1]
                nextInput.focus()
                if (nextInput.type !== 'date' && nextInput.type !== 'time' && nextInput.tagName !== 'SELECT') {
                    nextInput.select()
                }
            }
        }
    }

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
                    submissions!inner (id)
                `)
                .eq('dealer_id', user.id)
                .eq('submissions.is_deleted', false)
                .order('round_date', { ascending: false })
                .limit(20)

            // For rounds without any submissions, fetch separately
            const { data: allRoundsData } = await supabase
                .from('lottery_rounds')
                .select(`
                    *,
                    type_limits (*)
                `)
                .eq('dealer_id', user.id)
                .order('round_date', { ascending: false })
                .limit(20)

            // Merge the submission counts - this ensures rounds with 0 submissions are included
            const mergedRounds = (allRoundsData || []).map(round => {
                const roundWithSubs = roundsData?.find(r => r.id === round.id)
                return {
                    ...round,
                    submissions: roundWithSubs?.submissions || []
                }
            })

            if (!roundsError) {
                setRounds(mergedRounds)
                if (!selectedRound && mergedRounds.length > 0) {
                    setSelectedRound(mergedRounds[0])
                }
            }

            // Fetch members from memberships table
            const { data: membershipsData } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    *,
                    profiles:user_id (
                        id,
                        email,
                        full_name,
                        phone,
                        created_at
                    )
                `)
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            // Transform and categorize memberships
            const allMemberships = (membershipsData || []).map(m => ({
                ...m.profiles,
                membership_id: m.id,
                membership_status: m.status,
                membership_created_at: m.created_at,
                approved_at: m.approved_at,
                blocked_at: m.blocked_at,
                assigned_bank_account_id: m.assigned_bank_account_id
            }))

            setMembers(allMemberships.filter(m => m.membership_status === 'active'))
            setPendingMembers(allMemberships.filter(m => m.membership_status === 'pending'))
            setBlockedMembers(allMemberships.filter(m => m.membership_status === 'blocked'))

            // Fetch subscription (if table exists)
            try {
                const { data: subData } = await supabase
                    .from('dealer_subscriptions')
                    .select(`
                        *,
                        subscription_packages (
                            id,
                            name,
                            description,
                            billing_model,
                            monthly_price,
                            yearly_price,
                            max_users,
                            features
                        )
                    `)
                    .eq('dealer_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()

                setSubscription(subData)
            } catch (subError) {
                // Table might not exist yet
                console.log('Subscription table not available')
                setSubscription(null)
            }

            // Fetch dealer bank accounts for member assignment
            const { data: bankAccountsData } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', user.id)
                .order('is_default', { ascending: false })

            setDealerBankAccounts(bankAccountsData || [])

        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    // Membership Management Functions
    async function handleApproveMember(member) {
        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'active' })
                .eq('id', member.membership_id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error approving member:', error)
            alert('เกิดข้อผิดพลาดในการอนุมัติสมาชิก')
        }
    }

    async function handleRejectMember(member) {
        if (!confirm(`ต้องการปฏิเสธ "${member.full_name || member.email}" หรือไม่?`)) return

        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'rejected' })
                .eq('id', member.membership_id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error rejecting member:', error)
            alert('เกิดข้อผิดพลาดในการปฏิเสธสมาชิก')
        }
    }

    async function handleBlockMember(member) {
        if (!confirm(`ต้องการบล็อค "${member.full_name || member.email}" หรือไม่?\nสมาชิกจะไม่สามารถส่งเลขให้คุณได้`)) return

        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'blocked' })
                .eq('id', member.membership_id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error blocking member:', error)
            alert('เกิดข้อผิดพลาดในการบล็อคสมาชิก')
        }
    }

    async function handleUnblockMember(member) {
        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'active' })
                .eq('id', member.membership_id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error unblocking member:', error)
            alert('เกิดข้อผิดพลาดในการปลดบล็อคสมาชิก')
        }
    }

    // Update assigned bank account for member
    async function handleUpdateMemberBank(member, bankAccountId) {
        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ assigned_bank_account_id: bankAccountId || null })
                .eq('id', member.membership_id)

            if (error) throw error

            // Update local state immediately
            setMembers(prev => prev.map(m =>
                m.membership_id === member.membership_id
                    ? { ...m, assigned_bank_account_id: bankAccountId || null }
                    : m
            ))
        } catch (error) {
            console.error('Error updating member bank:', error)
            alert('เกิดข้อผิดพลาดในการอัปเดตบัญชีธนาคาร')
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
                    currency_name: roundForm.currency_name,
                    set_prices: roundForm.set_prices
                })
                .select()
                .single()

            if (roundError) throw roundError

            // Create type limits (no payout_rate - comes from user_settings)
            const typeLimitsData = Object.entries(roundForm.type_limits)
                .filter(([, maxAmount]) => maxAmount > 0)  // Only add limits with value > 0
                .map(([betType, maxAmount]) => ({
                    round_id: round.id,
                    bet_type: betType,
                    max_per_number: maxAmount,
                    payout_rate: 0 // Placeholder - actual payout from user_settings
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

    // Open edit modal with round data
    async function handleOpenEditModal(round) {
        // Fetch type_limits for this round
        const { data: typeLimits } = await supabase
            .from('type_limits')
            .select('*')
            .eq('round_id', round.id)

        // Build type_limits object from fetched data
        const limitsObj = {}
        const setPricesObj = round.set_prices || {}
        if (typeLimits) {
            typeLimits.forEach(limit => {
                limitsObj[limit.bet_type] = limit.max_per_number || 0
            })
        }

        // Extract time from ISO string
        const openTime = new Date(round.open_time)
        const closeTime = new Date(round.close_time)
        const formatTimeForInput = (date) => {
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        }

        // Set form with round data
        setRoundForm({
            lottery_type: round.lottery_type,
            lottery_name: round.lottery_name || '',
            round_date: round.round_date,
            open_time: formatTimeForInput(openTime),
            close_time: formatTimeForInput(closeTime),
            delete_before_minutes: round.delete_before_minutes || 30,
            currency_symbol: round.currency_symbol || '฿',
            currency_name: round.currency_name || 'บาท',
            type_limits: { ...getDefaultLimitsForType(round.lottery_type), ...limitsObj },
            set_prices: { ...getDefaultSetPricesForType(round.lottery_type), ...setPricesObj }
        })

        setEditingRound(round)
        setShowEditModal(true)
    }

    // Update existing round
    async function handleUpdateRound() {
        if (!editingRound) return

        setSaving(true)
        try {
            // Combine date and time
            const openDateTime = new Date(`${roundForm.round_date}T${roundForm.open_time}:00`)
            const closeDateTime = new Date(`${roundForm.round_date}T${roundForm.close_time}:00`)

            // Update round
            const { error: roundError } = await supabase
                .from('lottery_rounds')
                .update({
                    lottery_type: roundForm.lottery_type,
                    lottery_name: roundForm.lottery_name || LOTTERY_TYPES[roundForm.lottery_type],
                    round_date: roundForm.round_date,
                    open_time: openDateTime.toISOString(),
                    close_time: closeDateTime.toISOString(),
                    delete_before_minutes: roundForm.delete_before_minutes,
                    currency_symbol: roundForm.currency_symbol,
                    currency_name: roundForm.currency_name,
                    set_prices: roundForm.set_prices
                })
                .eq('id', editingRound.id)

            if (roundError) throw roundError

            // Delete old type_limits and create new ones
            const { error: deleteError } = await supabase
                .from('type_limits')
                .delete()
                .eq('round_id', editingRound.id)

            if (deleteError) {
                console.error('Error deleting old limits:', deleteError)
            }

            // Filter only limits that are part of the current lottery type
            const validBetTypes = Object.keys(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {})
            const typeLimitsData = Object.entries(roundForm.type_limits)
                .filter(([betType, maxAmount]) => maxAmount > 0 && validBetTypes.includes(betType))
                .map(([betType, maxAmount]) => ({
                    round_id: editingRound.id,
                    bet_type: betType,
                    max_per_number: maxAmount,
                    payout_rate: 0
                }))

            if (typeLimitsData.length > 0) {
                const { error: limitsError } = await supabase
                    .from('type_limits')
                    .insert(typeLimitsData)

                if (limitsError) {
                    console.error('Error inserting limits:', limitsError, 'Data:', typeLimitsData)
                    throw limitsError
                }
            }

            setShowEditModal(false)
            setEditingRound(null)
            fetchData()
            alert('แก้ไขงวดสำเร็จ!')

        } catch (error) {
            console.error('Error updating round:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
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
                        className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        <FiUser /> โปรไฟล์
                    </button>
                </div>

                {/* Tab Content */}
                <div className="dealer-content">
                    {activeTab === 'rounds' && (() => {
                        // Filter rounds based on selected tab
                        const openRounds = rounds.filter(r => isRoundOpen(r))
                        const closedRounds = rounds.filter(r => !isRoundOpen(r))
                        const displayedRounds = roundsTab === 'open' ? openRounds : closedRounds

                        return (
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

                                {/* Sub-tabs for Open/Closed Rounds */}
                                <div className="rounds-sub-tabs">
                                    <button
                                        className={`sub-tab-btn ${roundsTab === 'open' ? 'active' : ''}`}
                                        onClick={() => setRoundsTab('open')}
                                    >
                                        งวดที่เปิดอยู่ ({openRounds.length})
                                    </button>
                                    <button
                                        className={`sub-tab-btn ${roundsTab === 'closed' ? 'active' : ''}`}
                                        onClick={() => setRoundsTab('closed')}
                                    >
                                        งวดที่ปิดแล้ว ({closedRounds.length})
                                    </button>
                                </div>

                                {/* Rounds List */}
                                {loading ? (
                                    <div className="loading-state">
                                        <div className="spinner"></div>
                                    </div>
                                ) : displayedRounds.length === 0 ? (
                                    <div className="empty-state card">
                                        <FiCalendar className="empty-icon" />
                                        <h3>{roundsTab === 'open' ? 'ไม่มีงวดที่เปิดอยู่' : 'ไม่มีงวดที่ปิดแล้ว'}</h3>
                                        <p>{roundsTab === 'open' ? 'กดปุ่ม "สร้างงวดใหม่" เพื่อเริ่มต้น' : 'สลับไปที่แท็บ "งวดที่เปิดอยู่" เพื่อดูงวดที่ยังเปิดรับ'}</p>
                                    </div>
                                ) : (
                                    <div className="rounds-list">
                                        {displayedRounds.map(round => (
                                            <RoundAccordionItem
                                                key={round.id}
                                                round={round}
                                                isSelected={selectedRound?.id === round.id}
                                                onSelect={setSelectedRound}
                                                onShowSubmissions={() => { setSelectedRound(round); setShowSubmissionsModal(true); }}
                                                onCloseRound={() => handleCloseRound(round.id)}
                                                onEditRound={() => handleOpenEditModal(round)}
                                                onShowNumberLimits={() => { setSelectedRound(round); setShowNumberLimitsModal(true); }}
                                                onDeleteRound={() => handleDeleteRound(round.id)}
                                                onShowResults={() => { setSelectedRound(round); setShowResultsModal(true); }}
                                                getStatusBadge={getStatusBadge}
                                                formatDate={formatDate}
                                                formatTime={formatTime}
                                                user={user}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })()}

                    {activeTab === 'members' && (
                        <div className="members-section">
                            {/* Referral Section - Moved to top */}
                            <div className="referral-card card" style={{ marginBottom: '1.5rem' }}>
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

                            {/* Pending Members Section */}
                            {pendingMembers.length > 0 && (
                                <div className="pending-members-section" style={{ marginBottom: '1.5rem' }}>
                                    <div className="section-header" style={{ marginBottom: '0.75rem' }}>
                                        <h3 style={{ fontSize: '1rem', color: 'var(--color-warning)' }}>
                                            <FiClock /> รอการอนุมัติ
                                        </h3>
                                        <span className="badge" style={{ background: 'var(--color-warning)', color: '#000' }}>
                                            {pendingMembers.length} คน
                                        </span>
                                    </div>
                                    <div className="pending-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {pendingMembers.map(member => (
                                            <div key={member.id} className="pending-member-item card" style={{
                                                padding: '0.75rem 1rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: '0.5rem'
                                            }}>
                                                <div className="member-info">
                                                    <div style={{ fontWeight: 500 }}>{member.full_name || 'ไม่มีชื่อ'}</div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{member.email}</div>
                                                </div>
                                                <div className="member-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-success btn-sm"
                                                        onClick={() => handleApproveMember(member)}
                                                        style={{ padding: '0.35rem 0.75rem' }}
                                                    >
                                                        <FiCheck /> อนุมัติ
                                                    </button>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRejectMember(member)}
                                                        style={{ padding: '0.35rem 0.75rem' }}
                                                    >
                                                        <FiX /> ปฏิเสธ
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Members List - Accordion Style */}
                            <div className="section-header">
                                <h2>สมาชิกที่อนุมัติแล้ว</h2>
                                <span className="badge">{members.length} คน</span>
                            </div>

                            {members.length === 0 && pendingMembers.length === 0 ? (
                                <div className="empty-state card">
                                    <FiUsers className="empty-icon" />
                                    <h3>ยังไม่มีสมาชิก</h3>
                                    <p>ส่งลิงก์ด้านบนให้คนที่ต้องการเข้าร่วม</p>
                                </div>
                            ) : members.length === 0 ? (
                                <div className="empty-state card" style={{ padding: '1.5rem' }}>
                                    <p style={{ opacity: 0.7 }}>ยังไม่มีสมาชิกที่อนุมัติแล้ว</p>
                                </div>
                            ) : (
                                <div className="members-accordion-list">
                                    {members.map(member => (
                                        <MemberAccordionItem
                                            key={member.id}
                                            member={member}
                                            formatDate={formatDate}
                                            isExpanded={expandedMemberId === member.id}
                                            onToggle={() => setExpandedMemberId(expandedMemberId === member.id ? null : member.id)}
                                            onBlock={() => handleBlockMember(member)}
                                            dealerBankAccounts={dealerBankAccounts}
                                            onUpdateBank={(bankAccountId) => handleUpdateMemberBank(member, bankAccountId)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Blocked Members Section */}
                            {blockedMembers.length > 0 && (
                                <div className="blocked-members-section" style={{ marginTop: '1.5rem' }}>
                                    <div className="section-header" style={{ marginBottom: '0.75rem' }}>
                                        <h3 style={{ fontSize: '1rem', color: 'var(--color-error)' }}>
                                            <FiLock /> สมาชิกที่บล็อค
                                        </h3>
                                        <span className="badge" style={{ background: 'var(--color-error)' }}>
                                            {blockedMembers.length} คน
                                        </span>
                                    </div>
                                    <div className="blocked-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {blockedMembers.map(member => (
                                            <div key={member.id} className="blocked-member-item card" style={{
                                                padding: '0.75rem 1rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                opacity: 0.7
                                            }}>
                                                <div className="member-info">
                                                    <div style={{ fontWeight: 500 }}>{member.full_name || 'ไม่มีชื่อ'}</div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{member.email}</div>
                                                </div>
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => handleUnblockMember(member)}
                                                    style={{ padding: '0.35rem 0.75rem' }}
                                                >
                                                    ปลดบล็อค
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <DealerProfileTab user={user} profile={profile} subscription={subscription} formatDate={formatDate} />
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
                                            onClick={() => handleLotteryTypeChange(key)}
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
                                    onFocus={handleInputFocus}
                                    onKeyDown={handleInputKeyDown}
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
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาเปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.open_time}
                                        onChange={e => setRoundForm({ ...roundForm, open_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.close_time}
                                        onChange={e => setRoundForm({ ...roundForm, close_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
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
                                        onFocus={handleInputFocus}
                                        onKeyDown={handleInputKeyDown}
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

                            {/* Limits by Bet Type - Based on selected lottery type */}
                            <div className="form-section">
                                <h4>ค่าอั้นตามประเภทเลข ({LOTTERY_TYPES[roundForm.lottery_type]})</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '0.85rem' }}>
                                    อัตราจ่ายจะใช้ตามที่ตั้งค่าให้แต่ละลูกค้า
                                </p>

                                {/* Global set price for 4-digit (Lao/Hanoi only) */}
                                {(roundForm.lottery_type === 'lao' || roundForm.lottery_type === 'hanoi') && (
                                    <div className="global-set-price" style={{
                                        marginBottom: '1.5rem',
                                        padding: '1rem',
                                        background: 'rgba(212, 175, 55, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)'
                                    }}>
                                        <div className="input-group" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
                                            <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>เลขชุด 4 ตัว</span>
                                            <span className="input-prefix">ชุดละ</span>
                                            <input
                                                type="number"
                                                className="form-input small"
                                                value={roundForm.set_prices['4_top'] || 120}
                                                onChange={e => {
                                                    const newPrice = parseInt(e.target.value) || 0
                                                    setRoundForm({
                                                        ...roundForm,
                                                        set_prices: {
                                                            ...roundForm.set_prices,
                                                            '4_top': newPrice,
                                                            '4_tod': newPrice
                                                        }
                                                    })
                                                }}
                                            />
                                            <span className="input-suffix">{roundForm.currency_name}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="limits-grid">
                                    {Object.entries(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {}).map(([key, config]) => (
                                        <div key={key} className="limit-row">
                                            <span className="limit-label">
                                                {config.label}
                                                {config.isSet && <span className="set-badge">ชุด</span>}
                                            </span>
                                            <div className="limit-inputs">
                                                {/* Limit input */}
                                                <div className="input-group">
                                                    <span className="input-prefix">อั้น</span>
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={roundForm.type_limits[key] || 0}
                                                        onChange={e => setRoundForm({
                                                            ...roundForm,
                                                            type_limits: {
                                                                ...roundForm.type_limits,
                                                                [key]: parseInt(e.target.value) || 0
                                                            }
                                                        })}
                                                        onFocus={handleInputFocus}
                                                        onKeyDown={handleInputKeyDown}
                                                    />
                                                    <span className="input-suffix">{config.isSet ? 'ชุด' : roundForm.currency_name}</span>
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

            {/* Edit Round Modal */}
            {showEditModal && editingRound && (
                <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditingRound(null); }}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiEdit2 /> แก้ไขงวดหวย</h3>
                            <button className="modal-close" onClick={() => { setShowEditModal(false); setEditingRound(null); }}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Lottery Type - Disabled for edit */}
                            <div className="form-group">
                                <label className="form-label">ประเภทหวย</label>
                                <div className="lottery-type-grid">
                                    {Object.entries(LOTTERY_TYPES).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`type-option ${roundForm.lottery_type === key ? 'active' : ''}`}
                                            onClick={() => handleLotteryTypeChange(key)}
                                            disabled={true}
                                            style={{ opacity: roundForm.lottery_type === key ? 1 : 0.5, cursor: 'not-allowed' }}
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
                                    onFocus={handleInputFocus}
                                    onKeyDown={handleInputKeyDown}
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
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาเปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.open_time}
                                        onChange={e => setRoundForm({ ...roundForm, open_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาปิดรับ</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.close_time}
                                        onChange={e => setRoundForm({ ...roundForm, close_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
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
                                        onFocus={handleInputFocus}
                                        onKeyDown={handleInputKeyDown}
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

                            {/* Limits by Bet Type */}
                            <div className="form-section">
                                <h4>ค่าอั้นตามประเภทเลข ({LOTTERY_TYPES[roundForm.lottery_type]})</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '0.85rem' }}>
                                    อัตราจ่ายจะใช้ตามที่ตั้งค่าให้แต่ละลูกค้า
                                </p>

                                {/* Global set price for 4-digit (Lao/Hanoi only) */}
                                {(roundForm.lottery_type === 'lao' || roundForm.lottery_type === 'hanoi') && (
                                    <div className="global-set-price" style={{
                                        marginBottom: '1.5rem',
                                        padding: '1rem',
                                        background: 'rgba(212, 175, 55, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)'
                                    }}>
                                        <div className="input-group" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
                                            <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>เลขชุด 4 ตัว</span>
                                            <span className="input-prefix">ชุดละ</span>
                                            <input
                                                type="number"
                                                className="form-input small"
                                                value={roundForm.set_prices['4_top'] || 120}
                                                onChange={e => {
                                                    const newPrice = parseInt(e.target.value) || 0
                                                    setRoundForm({
                                                        ...roundForm,
                                                        set_prices: {
                                                            ...roundForm.set_prices,
                                                            '4_top': newPrice,
                                                            '4_tod': newPrice
                                                        }
                                                    })
                                                }}
                                            />
                                            <span className="input-suffix">{roundForm.currency_name}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="limits-grid">
                                    {Object.entries(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {}).map(([key, config]) => (
                                        <div key={key} className="limit-row">
                                            <span className="limit-label">
                                                {config.label}
                                                {config.isSet && <span className="set-badge">ชุด</span>}
                                            </span>
                                            <div className="limit-inputs">
                                                {/* Limit input */}
                                                <div className="input-group">
                                                    <span className="input-prefix">อั้น</span>
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={roundForm.type_limits[key] || 0}
                                                        onChange={e => setRoundForm({
                                                            ...roundForm,
                                                            type_limits: {
                                                                ...roundForm.type_limits,
                                                                [key]: parseInt(e.target.value) || 0
                                                            }
                                                        })}
                                                        onFocus={handleInputFocus}
                                                        onKeyDown={handleInputKeyDown}
                                                    />
                                                    <span className="input-suffix">{config.isSet ? 'ชุด' : roundForm.currency_name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditingRound(null); }}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleUpdateRound}>
                                <FiCheck /> บันทึกการแก้ไข
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

// Submissions Modal Component - With 3 Tabs
function SubmissionsModal({ round, onClose }) {
    const [activeTab, setActiveTab] = useState('total') // 'total' | 'excess' | 'transferred'
    const [submissions, setSubmissions] = useState([])
    const [typeLimits, setTypeLimits] = useState({})
    const [numberLimits, setNumberLimits] = useState([])
    const [transfers, setTransfers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedUser, setSelectedUser] = useState('all')
    const [betTypeFilter, setBetTypeFilter] = useState('all')
    const [selectedBatch, setSelectedBatch] = useState('all')

    // Transfer modal state
    const [showTransferModal, setShowTransferModal] = useState(false)
    const [transferTarget, setTransferTarget] = useState(null)
    const [transferForm, setTransferForm] = useState({
        amount: 0,
        target_dealer_name: '',
        target_dealer_contact: '',
        notes: ''
    })
    const [savingTransfer, setSavingTransfer] = useState(false)

    // Bulk transfer state
    const [selectedExcessItems, setSelectedExcessItems] = useState({}) // { 'betType|numbers': true/false }
    const [showBulkTransferModal, setShowBulkTransferModal] = useState(false)
    const [bulkTransferForm, setBulkTransferForm] = useState({
        target_dealer_name: '',
        target_dealer_contact: '',
        notes: ''
    })

    useEffect(() => {
        fetchAllData()
    }, [])

    async function fetchAllData() {
        setLoading(true)
        try {
            // Fetch submissions
            const { data: subsData } = await supabase
                .from('submissions')
                .select(`*, profiles (full_name, email)`)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            setSubmissions(subsData || [])

            // Fetch type limits
            const { data: typeLimitsData } = await supabase
                .from('type_limits')
                .select('*')
                .eq('round_id', round.id)

            const limitsObj = {}
            typeLimitsData?.forEach(l => {
                limitsObj[l.bet_type] = l.max_per_number
            })
            setTypeLimits(limitsObj)

            // Fetch number-specific limits
            const { data: numberLimitsData } = await supabase
                .from('number_limits')
                .select('*')
                .eq('round_id', round.id)

            setNumberLimits(numberLimitsData || [])

            // Fetch transfers
            const { data: transfersData } = await supabase
                .from('bet_transfers')
                .select('*')
                .eq('round_id', round.id)
                .order('created_at', { ascending: false })

            setTransfers(transfersData || [])

        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Calculate excess items
    const calculateExcessItems = () => {
        // Determine if this is a Lao/Hanoi lottery (set-based betting)
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        // Get set price for 4_top from round settings
        const setPrice = round?.set_prices?.['4_top'] || 120

        // Group submissions by bet_type + numbers
        const grouped = {}
        submissions.forEach(sub => {
            const key = `${sub.bet_type}|${sub.numbers}`
            if (!grouped[key]) {
                grouped[key] = {
                    bet_type: sub.bet_type,
                    numbers: sub.numbers,
                    total: 0,
                    setCount: 0, // Track number of sets for set-based bets
                    submissions: []
                }
            }
            grouped[key].total += sub.amount
            grouped[key].submissions.push(sub)

            // For set-based bets (4_set, 4_top in Lao/Hanoi), count number of sets
            if (isSetBasedLottery && (sub.bet_type === '4_set' || sub.bet_type === '4_top')) {
                grouped[key].setCount += Math.ceil(sub.amount / setPrice)
            }
        })

        // Calculate excess for each group
        const excessItems = []
        Object.values(grouped).forEach(group => {
            // For 4_set, map to 4_top for limit lookup (the underlying limit type)
            const limitLookupBetType = group.bet_type === '4_set' ? '4_top' : group.bet_type

            // Get limit: first check number_limits, then type_limits
            const numberLimit = numberLimits.find(nl => {
                // Also handle 4_set -> 4_top mapping for number limits
                const nlBetType = nl.bet_type === '4_set' ? '4_top' : nl.bet_type
                return nlBetType === limitLookupBetType && nl.numbers === group.numbers
            })
            const typeLimit = typeLimits[limitLookupBetType]
            const limit = numberLimit ? numberLimit.max_amount : (typeLimit || 999999999)

            // Calculate already transferred amount for this number
            const transferredAmount = transfers
                .filter(t => {
                    // Handle 4_set -> 4_top mapping for transfers
                    const tBetType = t.bet_type === '4_set' ? '4_top' : t.bet_type
                    return tBetType === limitLookupBetType && t.numbers === group.numbers
                })
                .reduce((sum, t) => sum + (t.amount || 0), 0)

            // For set-based bets in Lao/Hanoi, compare by number of sets, not money amount
            const isSetBased = isSetBasedLottery && (group.bet_type === '4_set' || group.bet_type === '4_top')

            // For set-based bets, transferred amount is also in sets
            const transferredSets = isSetBased ? Math.floor(transferredAmount / setPrice) : 0

            if (isSetBased) {
                // For set-based: limit is in "sets", compare setCount vs limit
                const effectiveExcess = group.setCount - limit - transferredSets
                if (effectiveExcess > 0) {
                    excessItems.push({
                        ...group,
                        limit,
                        excess: effectiveExcess, // Excess in number of sets
                        transferredAmount: transferredSets,
                        isSetBased: true
                    })
                }
            } else {
                // For normal bets: compare total amount vs limit
                const effectiveExcess = group.total - limit - transferredAmount
                if (effectiveExcess > 0) {
                    excessItems.push({
                        ...group,
                        limit,
                        excess: effectiveExcess,
                        transferredAmount
                    })
                }
            }
        })

        return excessItems
    }

    const excessItems = calculateExcessItems()

    // Get unique transfer batches (sorted by earliest created_at - oldest first)
    const uniqueBatches = [...new Set(transfers.map(t => t.transfer_batch_id))]
        .map(batchId => ({
            batchId,
            createdAt: transfers.find(t => t.transfer_batch_id === batchId)?.created_at
        }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(item => item.batchId)

    // Filter transfers by batch
    const filteredTransfers = selectedBatch === 'all'
        ? transfers
        : transfers.filter(t => t.transfer_batch_id === selectedBatch)

    // Handle transfer creation
    const handleOpenTransfer = (item) => {
        setTransferTarget(item)
        setTransferForm({
            amount: item.excess,
            target_dealer_name: '',
            target_dealer_contact: '',
            notes: ''
        })
        setShowTransferModal(true)
    }

    const handleSaveTransfer = async () => {
        if (!transferTarget || !transferForm.amount || !transferForm.target_dealer_name) {
            alert('กรุณากรอกข้อมูลให้ครบถ้วน')
            return
        }

        setSavingTransfer(true)
        try {
            const { error } = await supabase
                .from('bet_transfers')
                .insert({
                    round_id: round.id,
                    bet_type: transferTarget.bet_type,
                    numbers: transferTarget.numbers,
                    amount: transferForm.amount,
                    target_dealer_name: transferForm.target_dealer_name,
                    target_dealer_contact: transferForm.target_dealer_contact,
                    notes: transferForm.notes,
                    transfer_batch_id: generateBatchId()
                })

            if (error) throw error

            // Refresh data
            await fetchAllData()
            setShowTransferModal(false)
            setTransferTarget(null)
        } catch (error) {
            console.error('Error saving transfer:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSavingTransfer(false)
        }
    }

    // Handle undo transfer (bulk delete)
    const handleUndoTransfer = async () => {
        const itemsToUndo = filteredTransfers
        if (itemsToUndo.length === 0) return

        const undoLabel = selectedBatch === 'all'
            ? `ทั้งหมด ${itemsToUndo.length} รายการ`
            : `ครั้งนี้ ${itemsToUndo.length} รายการ`
        const totalAmount = itemsToUndo.reduce((sum, t) => sum + (t.amount || 0), 0)

        if (!confirm(`ต้องการเอาคืน${undoLabel} ยอดรวม ${round.currency_symbol}${totalAmount.toLocaleString()} หรือไม่?`)) {
            return
        }

        try {
            const ids = itemsToUndo.map(t => t.id)
            const { error } = await supabase
                .from('bet_transfers')
                .delete()
                .in('id', ids)

            if (error) throw error

            // Reset batch filter if the batch no longer exists
            setSelectedBatch('all')
            // Refresh data
            await fetchAllData()
        } catch (error) {
            console.error('Error undoing transfer:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Generate transfer text for copy/share
    const generateTransferText = () => {
        const items = filteredTransfers
        if (items.length === 0) return ''

        const batchLabel = selectedBatch === 'all'
            ? 'ทั้งหมด'
            : `ครั้งที่ ${uniqueBatches.indexOf(selectedBatch) + 1}`
        const totalAmount = items.reduce((sum, t) => sum + (t.amount || 0), 0)
        const targetDealer = items[0]?.target_dealer_name || '-'

        let text = `📤 ยอดตีออก - ${round.lottery_name}\n`
        text += `📅 ${batchLabel} (${items.length} รายการ)\n`
        text += `👤 ตีออกให้: ${targetDealer}\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${totalAmount.toLocaleString()}\n`
        text += `━━━━━━━━━━━━━━━━\n`

        // Group by bet type
        const groupedByType = {}
        items.forEach(t => {
            if (!groupedByType[t.bet_type]) {
                groupedByType[t.bet_type] = []
            }
            groupedByType[t.bet_type].push(t)
        })

        // Output each group
        Object.entries(groupedByType).forEach(([betType, typeItems]) => {
            text += `${BET_TYPES[betType]}\n`
            typeItems.forEach(t => {
                text += `${t.numbers}=${t.amount?.toLocaleString()}\n`
            })
            text += `━━━━━━━━━━━━━━━━\n`
        })

        text += `รวม: ${round.currency_symbol}${totalAmount.toLocaleString()}`

        return text
    }

    // Copy transfers to clipboard
    const handleCopyTransfers = async () => {
        const text = generateTransferText()
        if (!text) return

        try {
            await navigator.clipboard.writeText(text)
            alert('คัดลอกสำเร็จ!')
        } catch (error) {
            console.error('Error copying:', error)
            // Fallback for older browsers
            const textArea = document.createElement('textarea')
            textArea.value = text
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            alert('คัดลอกสำเร็จ!')
        }
    }

    // Generate and share PDF with Thai font support
    const handleShareTransfers = async () => {
        const items = filteredTransfers
        if (items.length === 0) return

        const batchLabel = selectedBatch === 'all'
            ? 'ทั้งหมด'
            : `ครั้งที่ ${uniqueBatches.indexOf(selectedBatch) + 1}`
        const totalAmount = items.reduce((sum, t) => sum + (t.amount || 0), 0)
        const targetDealer = items[0]?.target_dealer_name || '-'

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

        // Try to load Thai font
        const hasThaiFon = await addThaiFont(doc)
        if (!hasThaiFon) {
            doc.setFont('helvetica')
        }

        let y = 20
        const lineHeight = 7
        const pageWidth = doc.internal.pageSize.getWidth()

        // Title
        doc.setFontSize(16)
        if (hasThaiFon) {
            doc.text(`ยอดตีออก - ${round.lottery_name}`, pageWidth / 2, y, { align: 'center' })
        } else {
            doc.text('Transfer Report', pageWidth / 2, y, { align: 'center' })
        }
        y += lineHeight * 2

        // Header info
        doc.setFontSize(11)
        doc.text(`${hasThaiFon ? 'ครั้งที่' : 'Batch'}: ${batchLabel} (${items.length} ${hasThaiFon ? 'รายการ' : 'items'})`, 20, y)
        y += lineHeight
        doc.text(`${hasThaiFon ? 'ตีออกให้' : 'To'}: ${targetDealer}`, 20, y)
        y += lineHeight
        doc.text(`${hasThaiFon ? 'ยอดรวม' : 'Total'}: ${round.currency_symbol}${totalAmount.toLocaleString()}`, 20, y)
        y += lineHeight
        doc.text(`${hasThaiFon ? 'วันที่' : 'Date'}: ${new Date().toLocaleDateString('th-TH')}`, 20, y)
        y += lineHeight * 1.5

        doc.setLineWidth(0.5)
        doc.line(20, y, pageWidth - 20, y)
        y += lineHeight

        // Group by bet type
        const groupedByType = {}
        items.forEach(t => {
            if (!groupedByType[t.bet_type]) groupedByType[t.bet_type] = []
            groupedByType[t.bet_type].push(t)
        })

        // Output each group
        Object.entries(groupedByType).forEach(([betType, typeItems]) => {
            if (y > 260) { doc.addPage(); y = 20 }

            // Just the type label without count/subtotal
            doc.setFontSize(11)
            const typeLabel = BET_TYPES[betType] || betType
            doc.text(typeLabel, 20, y)
            y += lineHeight * 0.8
            doc.setFontSize(10)

            // Items in columns
            const colWidth = 40, startX = 20, itemsPerRow = 4
            let col = 0
            typeItems.forEach(t => {
                if (y > 280) { doc.addPage(); y = 20; col = 0 }
                doc.text(`${t.numbers}=${t.amount?.toLocaleString()}`, startX + (col * colWidth), y)
                col++
                if (col >= itemsPerRow) { col = 0; y += lineHeight * 0.7 }
            })
            if (col > 0) y += lineHeight * 0.7
            y += lineHeight * 0.8
        })

        // Total line
        y += lineHeight * 0.5
        doc.setLineWidth(0.5)
        doc.line(20, y, pageWidth - 20, y)
        y += lineHeight
        doc.setFontSize(12)
        doc.text(`${hasThaiFon ? 'รวมทั้งหมด' : 'TOTAL'}: ${round.currency_symbol}${totalAmount.toLocaleString()}`, 20, y)

        // Generate and share/download
        const dateStr = new Date().toISOString().split('T')[0]
        const filename = `transfer_${dateStr}.pdf`
        const pdfBlob = doc.output('blob')
        const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            try {
                await navigator.share({ title: hasThaiFon ? 'ยอดตีออก' : 'Transfer Report', files: [pdfFile] })
            } catch (error) {
                if (error.name !== 'AbortError') doc.save(filename)
            }
        } else {
            doc.save(filename)
        }
    }

    const toggleExcessItem = (item) => {
        const key = `${item.bet_type}|${item.numbers}`
        setSelectedExcessItems(prev => ({
            ...prev,
            [key]: !prev[key]
        }))
    }

    // Select/Deselect all excess items
    const toggleSelectAll = () => {
        const allSelected = excessItems.every(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])
        if (allSelected) {
            setSelectedExcessItems({})
        } else {
            const newSelected = {}
            excessItems.forEach(item => {
                newSelected[`${item.bet_type}|${item.numbers}`] = true
            })
            setSelectedExcessItems(newSelected)
        }
    }

    // Get selected excess items count
    const selectedCount = excessItems.filter(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`]).length
    const selectedTotalExcess = excessItems
        .filter(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])
        .reduce((sum, item) => sum + item.excess, 0)

    // Handle bulk transfer
    const handleOpenBulkTransfer = () => {
        if (selectedCount === 0) {
            alert('กรุณาเลือกรายการที่ต้องการตีออก')
            return
        }
        setBulkTransferForm({
            target_dealer_name: '',
            target_dealer_contact: '',
            notes: ''
        })
        setShowBulkTransferModal(true)
    }

    const handleSaveBulkTransfer = async () => {
        if (!bulkTransferForm.target_dealer_name) {
            alert('กรุณากรอกชื่อเจ้ามือที่ต้องการตีออก')
            return
        }

        setSavingTransfer(true)
        try {
            // Get all selected items
            const selectedItems = excessItems.filter(item =>
                selectedExcessItems[`${item.bet_type}|${item.numbers}`]
            )

            // Generate a batch ID for this transfer session
            const batchId = generateBatchId()

            // Create batch transfer records with same batch ID
            const transferRecords = selectedItems.map(item => ({
                round_id: round.id,
                bet_type: item.bet_type,
                numbers: item.numbers,
                amount: item.excess,
                target_dealer_name: bulkTransferForm.target_dealer_name,
                target_dealer_contact: bulkTransferForm.target_dealer_contact,
                notes: bulkTransferForm.notes,
                transfer_batch_id: batchId
            }))

            const { error } = await supabase
                .from('bet_transfers')
                .insert(transferRecords)

            if (error) throw error

            // Refresh data and reset selection
            await fetchAllData()
            setSelectedExcessItems({})
            setShowBulkTransferModal(false)
            alert(`ตีออกสำเร็จ ${selectedItems.length} รายการ!`)
        } catch (error) {
            console.error('Error saving bulk transfer:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSavingTransfer(false)
        }
    }

    // Extract unique users from submissions
    const uniqueUsers = [...new Map(
        submissions.map(s => [s.user_id, {
            id: s.user_id,
            name: s.profiles?.full_name || 'ไม่ระบุ',
            email: s.profiles?.email || ''
        }])
    ).values()]

    // Filter by user first
    const userFilteredSubmissions = selectedUser === 'all'
        ? submissions
        : submissions.filter(s => s.user_id === selectedUser)

    // Then filter by bet type
    const filteredSubmissions = betTypeFilter === 'all'
        ? userFilteredSubmissions
        : userFilteredSubmissions.filter(s => s.bet_type === betTypeFilter)

    // Group by bet type for summary (based on user-filtered submissions)
    const summaryByType = userFilteredSubmissions.reduce((acc, sub) => {
        if (!acc[sub.bet_type]) {
            acc[sub.bet_type] = { count: 0, amount: 0 }
        }
        acc[sub.bet_type].count++
        acc[sub.bet_type].amount += sub.amount
        return acc
    }, {})

    const totalAmount = userFilteredSubmissions.reduce((sum, s) => sum + (s.amount || 0), 0)
    const totalExcess = excessItems.reduce((sum, item) => sum + item.excess, 0)
    const totalTransferred = transfers.reduce((sum, t) => sum + (t.amount || 0), 0)

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiEye /> รายการที่ส่งเข้ามา - {round.lottery_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                {/* Tabs */}
                <div className="modal-tabs">
                    <button
                        className={`modal-tab-btn ${activeTab === 'total' ? 'active' : ''}`}
                        onClick={() => setActiveTab('total')}
                    >
                        ยอดรวม
                    </button>
                    <button
                        className={`modal-tab-btn ${activeTab === 'excess' ? 'active' : ''}`}
                        onClick={() => setActiveTab('excess')}
                    >
                        ยอดเกิน {excessItems.length > 0 && <span className="tab-badge">{excessItems.length}</span>}
                    </button>
                    <button
                        className={`modal-tab-btn ${activeTab === 'transferred' ? 'active' : ''}`}
                        onClick={() => setActiveTab('transferred')}
                    >
                        ยอดตีออก {transfers.length > 0 && <span className="tab-badge">{transfers.length}</span>}
                    </button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <>
                            {/* Tab: ยอดรวม (Total) */}
                            {activeTab === 'total' && (
                                <>
                                    {/* Summary - Only Total Amount */}
                                    <div className="summary-grid">
                                        <div className="summary-card highlight">
                                            <span className="summary-value">
                                                {round.currency_symbol}{totalAmount.toLocaleString()}
                                            </span>
                                            <span className="summary-label">ยอดรวม</span>
                                        </div>
                                    </div>

                                    {/* User Filter */}
                                    <div className="filter-section">
                                        <label className="filter-label"><FiUser /> เลือกผู้ส่ง:</label>
                                        <div className="filter-row">
                                            <button
                                                className={`filter-btn ${selectedUser === 'all' ? 'active' : ''}`}
                                                onClick={() => setSelectedUser('all')}
                                            >
                                                ทั้งหมด ({submissions.length})
                                            </button>
                                            {uniqueUsers.map(user => {
                                                const userCount = submissions.filter(s => s.user_id === user.id).length
                                                return (
                                                    <button
                                                        key={user.id}
                                                        className={`filter-btn ${selectedUser === user.id ? 'active' : ''}`}
                                                        onClick={() => setSelectedUser(user.id)}
                                                        title={user.email}
                                                    >
                                                        {user.name} ({userCount})
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Bet Type Filter */}
                                    <div className="filter-section">
                                        <label className="filter-label"><FiGrid /> ประเภท:</label>
                                        <div className="filter-row">
                                            <button
                                                className={`filter-btn ${betTypeFilter === 'all' ? 'active' : ''}`}
                                                onClick={() => setBetTypeFilter('all')}
                                            >
                                                ทั้งหมด
                                            </button>
                                            {Object.entries(summaryByType).map(([key, data]) => (
                                                <button
                                                    key={key}
                                                    className={`filter-btn ${betTypeFilter === key ? 'active' : ''}`}
                                                    onClick={() => setBetTypeFilter(key)}
                                                >
                                                    {BET_TYPES[key]} ({data.count})
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Table */}
                                    {filteredSubmissions.length === 0 ? (
                                        <div className="empty-state">
                                            <p>ไม่มีรายการ</p>
                                        </div>
                                    ) : (
                                        <div className="table-wrap">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
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
                                </>
                            )}

                            {/* Tab: ยอดเกิน (Excess) */}
                            {activeTab === 'excess' && (
                                <>
                                    {/* Summary */}
                                    <div className="summary-grid">
                                        <div className="summary-card warning">
                                            <span className="summary-value">
                                                {round.currency_symbol}{totalExcess.toLocaleString()}
                                            </span>
                                            <span className="summary-label">ยอดเกินรวม</span>
                                        </div>
                                        {selectedCount > 0 && (
                                            <div className="summary-card">
                                                <span className="summary-value">
                                                    {round.currency_symbol}{selectedTotalExcess.toLocaleString()}
                                                </span>
                                                <span className="summary-label">เลือกแล้ว ({selectedCount})</span>
                                            </div>
                                        )}
                                    </div>

                                    {excessItems.length === 0 ? (
                                        <div className="empty-state">
                                            <FiCheck style={{ fontSize: '2rem', color: 'var(--color-success)', marginBottom: '0.5rem' }} />
                                            <p>ไม่มีเลขที่เกินค่าอั้น</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Bulk Actions */}
                                            <div className="bulk-actions">
                                                <label className="checkbox-container">
                                                    <input
                                                        type="checkbox"
                                                        checked={excessItems.length > 0 && excessItems.every(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])}
                                                        onChange={toggleSelectAll}
                                                    />
                                                    <span className="checkmark"></span>
                                                    เลือกทั้งหมด ({excessItems.length})
                                                </label>
                                                <button
                                                    className="btn btn-warning"
                                                    onClick={handleOpenBulkTransfer}
                                                    disabled={selectedCount === 0}
                                                >
                                                    <FiSend /> ตีออกที่เลือก ({selectedCount})
                                                </button>
                                            </div>

                                            <div className="excess-list">
                                                {excessItems.map((item, idx) => {
                                                    const isSelected = selectedExcessItems[`${item.bet_type}|${item.numbers}`]
                                                    return (
                                                        <div key={idx} className={`excess-card ${isSelected ? 'selected' : ''}`}>
                                                            <label className="checkbox-container excess-checkbox">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected || false}
                                                                    onChange={() => toggleExcessItem(item)}
                                                                />
                                                                <span className="checkmark"></span>
                                                            </label>
                                                            <div className="excess-info" onClick={() => toggleExcessItem(item)}>
                                                                <span className="type-badge">{BET_TYPES[item.bet_type]}</span>
                                                                <span className="excess-number">{item.numbers}</span>
                                                            </div>
                                                            <div className="excess-details">
                                                                <div className="excess-row">
                                                                    <span>ค่าอั้น:</span>
                                                                    <span>{item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}</span>
                                                                </div>
                                                                <div className="excess-row">
                                                                    <span>ยอดรับ:</span>
                                                                    <span>{item.isSetBased ? `${item.setCount} ชุด` : `${round.currency_symbol}${item.total.toLocaleString()}`}</span>
                                                                </div>
                                                                {item.transferredAmount > 0 && (
                                                                    <div className="excess-row transferred">
                                                                        <span>ตีออกแล้ว:</span>
                                                                        <span>{item.isSetBased ? `-${item.transferredAmount} ชุด` : `-${round.currency_symbol}${item.transferredAmount.toLocaleString()}`}</span>
                                                                    </div>
                                                                )}
                                                                <div className="excess-row excess-amount">
                                                                    <span>เกิน:</span>
                                                                    <span className="text-warning">{item.isSetBased ? `${item.excess} ชุด` : `${round.currency_symbol}${item.excess.toLocaleString()}`}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                className="btn btn-warning btn-sm"
                                                                onClick={() => handleOpenTransfer(item)}
                                                            >
                                                                <FiSend /> ตีออก
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* Tab: ยอดตีออก (Transferred) */}
                            {activeTab === 'transferred' && (
                                <>
                                    {/* Summary */}
                                    <div className="summary-grid">
                                        <div className="summary-card">
                                            <span className="summary-value">
                                                {round.currency_symbol}{totalTransferred.toLocaleString()}
                                            </span>
                                            <span className="summary-label">ตีออกรวม</span>
                                        </div>
                                        {selectedBatch !== 'all' && (
                                            <div className="summary-card highlight">
                                                <span className="summary-value">
                                                    {round.currency_symbol}{filteredTransfers.reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                                                </span>
                                                <span className="summary-label">
                                                    ครั้งที่ {uniqueBatches.indexOf(selectedBatch) + 1} ({filteredTransfers.length} รายการ)
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Batch Filter */}
                                    {uniqueBatches.length >= 1 && (
                                        <div className="filter-section">
                                            <label className="filter-label"><FiClock /> ดูตาม:</label>
                                            <div className="filter-row">
                                                <button
                                                    className={`filter-btn ${selectedBatch === 'all' ? 'active' : ''}`}
                                                    onClick={() => setSelectedBatch('all')}
                                                >
                                                    ทั้งหมด ({transfers.length})
                                                </button>
                                                {uniqueBatches.map((batchId, idx) => {
                                                    const batchCount = transfers.filter(t => t.transfer_batch_id === batchId).length
                                                    const batchTime = transfers.find(t => t.transfer_batch_id === batchId)?.created_at
                                                    return (
                                                        <button
                                                            key={batchId}
                                                            className={`filter-btn ${selectedBatch === batchId ? 'active' : ''}`}
                                                            onClick={() => setSelectedBatch(batchId)}
                                                        >
                                                            ครั้งที่ {idx + 1} ({batchCount})
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    {filteredTransfers.length > 0 && (
                                        <div className="transfer-actions">
                                            <div className="action-group">
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={handleCopyTransfers}
                                                >
                                                    <FiCopy /> คัดลอก
                                                </button>
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={handleShareTransfers}
                                                >
                                                    <FiShare2 /> แชร์ PDF
                                                </button>
                                            </div>
                                            <button
                                                className="btn btn-danger"
                                                onClick={handleUndoTransfer}
                                            >
                                                <FiRotateCcw /> เอาคืน{selectedBatch === 'all' ? 'ทั้งหมด' : 'ครั้งนี้'} ({filteredTransfers.length})
                                            </button>
                                        </div>
                                    )}

                                    {filteredTransfers.length === 0 ? (
                                        <div className="empty-state">
                                            <p>ยังไม่มีรายการตีออก</p>
                                        </div>
                                    ) : (
                                        <div className="table-wrap">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>ประเภท</th>
                                                        <th>เลข</th>
                                                        <th>จำนวน</th>
                                                        <th>ตีออกให้</th>
                                                        <th>เวลา</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredTransfers.map(transfer => (
                                                        <tr key={transfer.id}>
                                                            <td>
                                                                <span className="type-badge">{BET_TYPES[transfer.bet_type]}</span>
                                                            </td>
                                                            <td className="number-cell">{transfer.numbers}</td>
                                                            <td>{round.currency_symbol}{transfer.amount?.toLocaleString()}</td>
                                                            <td>
                                                                <div className="dealer-info">
                                                                    <span>{transfer.target_dealer_name}</span>
                                                                    {transfer.target_dealer_contact && (
                                                                        <small>{transfer.target_dealer_contact}</small>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="time-cell">
                                                                {new Date(transfer.created_at).toLocaleTimeString('th-TH', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Transfer Modal */}
            {showTransferModal && transferTarget && (
                <div className="modal-overlay nested" onClick={() => setShowTransferModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiSend /> ตีออกเลข</h3>
                            <button className="modal-close" onClick={() => setShowTransferModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="transfer-info">
                                <span className="type-badge">{BET_TYPES[transferTarget.bet_type]}</span>
                                <span className="transfer-number">{transferTarget.numbers}</span>
                                <span className="transfer-excess">
                                    ยอดเกิน: {round.currency_symbol}{transferTarget.excess.toLocaleString()}
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">จำนวนที่ต้องการตีออก</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={transferForm.amount}
                                    onChange={e => setTransferForm({ ...transferForm, amount: parseFloat(e.target.value) || 0 })}
                                    max={transferTarget.excess}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">ตีออกไปให้ (ชื่อเจ้ามือ/ร้าน) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น ร้านโชคดี"
                                    value={transferForm.target_dealer_name}
                                    onChange={e => setTransferForm({ ...transferForm, target_dealer_name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เบอร์โทร / Line ID (ไม่บังคับ)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 08x-xxx-xxxx"
                                    value={transferForm.target_dealer_contact}
                                    onChange={e => setTransferForm({ ...transferForm, target_dealer_contact: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">หมายเหตุ</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                                    value={transferForm.notes}
                                    onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowTransferModal(false)}
                                disabled={savingTransfer}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveTransfer}
                                disabled={savingTransfer || !transferForm.amount || !transferForm.target_dealer_name}
                            >
                                {savingTransfer ? 'กำลังบันทึก...' : '✓ บันทึก'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Transfer Modal */}
            {showBulkTransferModal && (
                <div className="modal-overlay nested" onClick={() => setShowBulkTransferModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiSend /> ตีออกหลายรายการ</h3>
                            <button className="modal-close" onClick={() => setShowBulkTransferModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="bulk-transfer-summary">
                                <div className="bulk-summary-item">
                                    <span className="bulk-summary-label">จำนวนรายการ:</span>
                                    <span className="bulk-summary-value">{selectedCount} รายการ</span>
                                </div>
                                <div className="bulk-summary-item">
                                    <span className="bulk-summary-label">ยอดรวม:</span>
                                    <span className="bulk-summary-value text-warning">
                                        {round.currency_symbol}{selectedTotalExcess.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">ชื่อเจ้ามือที่ตีออก *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ชื่อเจ้ามือรับ"
                                    value={bulkTransferForm.target_dealer_name}
                                    onChange={e => setBulkTransferForm({ ...bulkTransferForm, target_dealer_name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เบอร์ติดต่อ</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เบอร์โทร/Line ID (ไม่บังคับ)"
                                    value={bulkTransferForm.target_dealer_contact}
                                    onChange={e => setBulkTransferForm({ ...bulkTransferForm, target_dealer_contact: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">หมายเหตุ</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
                                    value={bulkTransferForm.notes}
                                    onChange={e => setBulkTransferForm({ ...bulkTransferForm, notes: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowBulkTransferModal(false)}
                                disabled={savingTransfer}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveBulkTransfer}
                                disabled={savingTransfer || !bulkTransferForm.target_dealer_name}
                            >
                                {savingTransfer ? 'กำลังบันทึก...' : `✓ ตีออก ${selectedCount} รายการ`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
        bet_type: Object.keys(BET_TYPES_BY_LOTTERY[round.lottery_type] || {})[0] || '2_top',
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
                                    {Object.entries(BET_TYPES_BY_LOTTERY[round.lottery_type] || {}).map(([key, config]) => (
                                        <option key={key} value={key}>{config.label}</option>
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
                                    onClick={(e) => {
                                        e.target.blur()
                                        handleAddLimit()
                                    }}
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

// Dealer Profile Tab Component
function DealerProfileTab({ user, profile, subscription, formatDate }) {
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [bankAccounts, setBankAccounts] = useState([])
    const [loadingBanks, setLoadingBanks] = useState(true)
    const [showAddBankModal, setShowAddBankModal] = useState(false)
    const [editingBank, setEditingBank] = useState(null)
    const [toast, setToast] = useState(null)

    // Local profile data
    const [profileData, setProfileData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        role: profile?.role || 'dealer'
    })
    const [formData, setFormData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || ''
    })

    // Bank form data
    const [bankFormData, setBankFormData] = useState({
        bank_name: '',
        bank_account: '',
        account_name: '',
        is_default: false
    })

    const bankOptions = [
        'ธนาคารกรุงเทพ',
        'ธนาคารกสิกรไทย',
        'ธนาคารกรุงไทย',
        'ธนาคารไทยพาณิชย์',
        'ธนาคารกรุงศรีอยุธยา',
        'ธนาคารทหารไทยธนชาต',
        'ธนาคารออมสิน',
        'ธนาคารเพื่อการเกษตรฯ (ธกส.)',
        'ธนาคารอาคารสงเคราะห์',
        'ธนาคารซีไอเอ็มบี',
        'ธนาคารยูโอบี',
        'ธนาคารแลนด์ แอนด์ เฮ้าส์',
        'ธนาคารเกียรตินาคินภัทร',
        'อื่นๆ'
    ]

    // Update local state when profile prop changes
    useEffect(() => {
        if (profile) {
            setProfileData({
                full_name: profile.full_name || '',
                phone: profile.phone || '',
                role: profile.role || 'dealer'
            })
            setFormData({
                full_name: profile.full_name || '',
                phone: profile.phone || ''
            })
        }
    }, [profile])

    // Fetch bank accounts on mount
    useEffect(() => {
        fetchBankAccounts()
    }, [user?.id])

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    async function fetchBankAccounts() {
        if (!user?.id) return
        setLoadingBanks(true)
        try {
            const { data, error } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', user.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (!error) {
                setBankAccounts(data || [])
            }
        } catch (error) {
            console.error('Error fetching bank accounts:', error)
        } finally {
            setLoadingBanks(false)
        }
    }

    // Save profile changes
    async function handleSaveProfile() {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name,
                    phone: formData.phone
                })
                .eq('id', user.id)

            if (error) throw error

            setProfileData({
                ...profileData,
                full_name: formData.full_name,
                phone: formData.phone
            })

            setIsEditing(false)
            setToast({ type: 'success', message: 'บันทึกข้อมูลสำเร็จ!' })
        } catch (error) {
            console.error('Error saving profile:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        } finally {
            setSaving(false)
        }
    }

    // Add or update bank account
    async function handleSaveBank() {
        setSaving(true)
        try {
            if (editingBank) {
                // Update existing
                const { error } = await supabase
                    .from('dealer_bank_accounts')
                    .update({
                        bank_name: bankFormData.bank_name,
                        bank_account: bankFormData.bank_account,
                        account_name: bankFormData.account_name,
                        is_default: bankFormData.is_default
                    })
                    .eq('id', editingBank.id)

                if (error) throw error
                setToast({ type: 'success', message: 'แก้ไขบัญชีสำเร็จ!' })
            } else {
                // Insert new - set as default if first account
                const isFirst = bankAccounts.length === 0
                const { error } = await supabase
                    .from('dealer_bank_accounts')
                    .insert({
                        dealer_id: user.id,
                        bank_name: bankFormData.bank_name,
                        bank_account: bankFormData.bank_account,
                        account_name: bankFormData.account_name,
                        is_default: isFirst ? true : bankFormData.is_default
                    })

                if (error) throw error
                setToast({ type: 'success', message: 'เพิ่มบัญชีสำเร็จ!' })
            }

            setShowAddBankModal(false)
            setEditingBank(null)
            setBankFormData({ bank_name: '', bank_account: '', account_name: '', is_default: false })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error saving bank:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        } finally {
            setSaving(false)
        }
    }

    // Delete bank account
    async function handleDeleteBank(bankId) {
        if (!confirm('ต้องการลบบัญชีนี้?')) return

        try {
            const { error } = await supabase
                .from('dealer_bank_accounts')
                .delete()
                .eq('id', bankId)

            if (error) throw error
            setToast({ type: 'success', message: 'ลบบัญชีสำเร็จ!' })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error deleting bank:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        }
    }

    // Set as default
    async function handleSetDefault(bankId) {
        try {
            const { error } = await supabase
                .from('dealer_bank_accounts')
                .update({ is_default: true })
                .eq('id', bankId)

            if (error) throw error
            setToast({ type: 'success', message: 'ตั้งเป็นค่าเริ่มต้นสำเร็จ!' })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error setting default:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        }
    }

    // Open edit modal
    function openEditBank(bank) {
        setEditingBank(bank)
        setBankFormData({
            bank_name: bank.bank_name,
            bank_account: bank.bank_account,
            account_name: bank.account_name || '',
            is_default: bank.is_default
        })
        setShowAddBankModal(true)
    }

    // Open add modal
    function openAddBank() {
        setEditingBank(null)
        setBankFormData({ bank_name: '', bank_account: '', account_name: '', is_default: false })
        setShowAddBankModal(true)
    }

    return (
        <div className="profile-section">
            {/* Profile Header Card */}
            <div className="profile-card card">
                <div className="profile-header">
                    <div className="profile-avatar">
                        <FiUser />
                    </div>
                    <div className="profile-info">
                        <h2>{profileData.full_name || 'ไม่ระบุชื่อ'}</h2>
                        <p className="email">{user?.email}</p>
                        <div className="profile-badges">
                            <span className={`role-badge role-${profileData.role}`}>
                                {profileData.role === 'dealer' ? 'เจ้ามือ' :
                                    profileData.role === 'superadmin' ? 'Admin' : 'สมาชิก'}
                            </span>
                        </div>
                    </div>
                    {!isEditing && (
                        <button
                            className="btn btn-outline edit-btn"
                            onClick={() => setIsEditing(true)}
                        >
                            <FiEdit2 /> แก้ไข
                        </button>
                    )}
                </div>

                {/* Subscription/Package Info */}
                <div className="subscription-status-inline">
                    <div className="sub-icon">
                        <FiPackage />
                    </div>
                    <div className="sub-info">
                        {subscription?.subscription_packages ? (
                            <>
                                <div className="sub-name">
                                    {subscription.subscription_packages.name}
                                    {subscription.is_trial && (
                                        <span className="trial-badge">ทดลองใช้</span>
                                    )}
                                </div>
                                <div className="sub-details">
                                    <span className={`sub-status status-${subscription.status}`}>
                                        {subscription.status === 'active' ? 'ใช้งานอยู่' :
                                            subscription.status === 'trial' ? 'ทดลองใช้' :
                                                subscription.status === 'expired' ? 'หมดอายุ' : subscription.status}
                                    </span>
                                    {subscription.end_date && (
                                        <span className="sub-expiry">
                                            หมดอายุ: {formatDate(subscription.end_date)}
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="sub-name no-package">
                                    <FiAlertCircle /> ยังไม่มีแพ็คเกจ
                                </div>
                                <div className="sub-details">
                                    กรุณาติดต่อผู้ดูแลระบบเพื่อเลือกแพ็คเกจ
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Personal Info Card */}
            <div className="profile-details card">
                <h3>ข้อมูลส่วนตัว</h3>

                {isEditing ? (
                    <div className="profile-form">
                        <div className="form-group">
                            <label className="form-label">ชื่อ-นามสกุล</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.full_name}
                                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="ชื่อ-นามสกุล"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">เบอร์โทรศัพท์</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="0xx-xxx-xxxx"
                            />
                        </div>
                        <div className="form-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setIsEditing(false)
                                    setFormData({
                                        full_name: profileData.full_name || '',
                                        phone: profileData.phone || ''
                                    })
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveProfile}
                                disabled={saving}
                            >
                                {saving ? 'กำลังบันทึก...' : <><FiSave /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="profile-info-list">
                        <div className="info-row">
                            <span className="info-label">ชื่อ-นามสกุล</span>
                            <span className="info-value">{profileData.full_name || '-'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">อีเมล</span>
                            <span className="info-value">{user?.email || '-'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">เบอร์โทรศัพท์</span>
                            <span className="info-value">{profileData.phone || '-'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bank Accounts Card */}
            <div className="profile-details card">
                <div className="section-header" style={{ marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>บัญชีธนาคาร</h3>
                    <button className="btn btn-primary btn-sm" onClick={openAddBank}>
                        <FiPlus /> เพิ่มบัญชี
                    </button>
                </div>

                {loadingBanks ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                    </div>
                ) : bankAccounts.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                        <p className="text-muted">ยังไม่มีบัญชีธนาคาร</p>
                        <button className="btn btn-outline" onClick={openAddBank} style={{ marginTop: '1rem' }}>
                            <FiPlus /> เพิ่มบัญชีแรก
                        </button>
                    </div>
                ) : (
                    <div className="bank-accounts-list">
                        {bankAccounts.map(bank => (
                            <div key={bank.id} className={`bank-account-item ${bank.is_default ? 'default' : ''}`}>
                                <div className="bank-info">
                                    <div className="bank-header">
                                        <span className="bank-name">{bank.bank_name}</span>
                                        {bank.is_default && (
                                            <span className="default-badge">
                                                <FiStar /> ค่าเริ่มต้น
                                            </span>
                                        )}
                                    </div>
                                    <div className="bank-account-number">{bank.bank_account}</div>
                                    {bank.account_name && (
                                        <div className="account-name">ชื่อบัญชี: {bank.account_name}</div>
                                    )}
                                </div>
                                <div className="bank-actions">
                                    {!bank.is_default && (
                                        <button
                                            className="btn btn-outline btn-sm"
                                            onClick={() => handleSetDefault(bank.id)}
                                            title="ตั้งเป็นค่าเริ่มต้น"
                                        >
                                            <FiStar />
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => openEditBank(bank)}
                                        title="แก้ไข"
                                    >
                                        <FiEdit2 />
                                    </button>
                                    <button
                                        className="btn btn-outline btn-sm danger"
                                        onClick={() => handleDeleteBank(bank.id)}
                                        title="ลบ"
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Bank Modal */}
            {showAddBankModal && (
                <div className="modal-overlay" onClick={() => setShowAddBankModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingBank ? <><FiEdit2 /> แก้ไขบัญชี</> : <><FiPlus /> เพิ่มบัญชีใหม่</>}</h3>
                            <button className="modal-close" onClick={() => setShowAddBankModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">ธนาคาร</label>
                                <select
                                    className="form-input"
                                    value={bankFormData.bank_name}
                                    onChange={e => setBankFormData({ ...bankFormData, bank_name: e.target.value })}
                                >
                                    <option value="">เลือกธนาคาร</option>
                                    {bankOptions.map(bank => (
                                        <option key={bank} value={bank}>{bank}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">เลขบัญชี</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={bankFormData.bank_account}
                                    onChange={e => setBankFormData({ ...bankFormData, bank_account: e.target.value })}
                                    placeholder="xxx-x-xxxxx-x"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">ชื่อบัญชี (ไม่บังคับ)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={bankFormData.account_name}
                                    onChange={e => setBankFormData({ ...bankFormData, account_name: e.target.value })}
                                    placeholder="ชื่อเจ้าของบัญชี"
                                />
                            </div>
                            {bankAccounts.length > 0 && !editingBank && (
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={bankFormData.is_default}
                                            onChange={e => setBankFormData({ ...bankFormData, is_default: e.target.checked })}
                                        />
                                        <span>ตั้งเป็นบัญชีค่าเริ่มต้น</span>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddBankModal(false)}>
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveBank}
                                disabled={saving || !bankFormData.bank_name || !bankFormData.bank_account}
                            >
                                {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`toast-notification ${toast.type}`}>
                    <FiCheck /> {toast.message}
                </div>
            )}
        </div>
    )
}

// Member Accordion Item Component
function MemberAccordionItem({ member, formatDate, isExpanded, onToggle, onBlock, dealerBankAccounts = [], onUpdateBank }) {
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'settings'

    return (
        <div className={`member-accordion-item ${isExpanded ? 'expanded' : ''}`} style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
        }}>
            {/* Header - Click to toggle */}
            <div
                className="member-accordion-header"
                onClick={onToggle}
                style={{
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--color-surface-light)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none'
                }}
            >
                <div className="member-info-summary" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="member-avatar" style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--color-primary)',
                        color: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold'
                    }}>
                        {member.full_name ? member.full_name.charAt(0).toUpperCase() : <FiUsers />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="member-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
                            {member.full_name || 'ไม่ระบุชื่อ'}
                        </span>
                        <span className="member-email" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            {member.email}
                        </span>
                    </div>
                </div>
                <div className="accordion-icon" style={{
                    color: isExpanded ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease'
                }}>
                    <FiChevronDown size={24} />
                </div>
            </div>

            {/* Body - Only visible if expanded */}
            {isExpanded && (
                <div className="member-accordion-body" style={{ padding: '1.5rem' }}>
                    {/* Internal Tabs */}
                    <div className="member-internal-tabs" style={{
                        display: 'flex',
                        gap: '1rem',
                        marginBottom: '1.5rem',
                        borderBottom: '1px solid var(--color-border)'
                    }}>
                        <button
                            onClick={() => setActiveTab('info')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'info' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'info' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FiUsers style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                            ข้อมูลทั่วไป
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'settings' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FiSettings style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                            ตั้งค่า
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="member-tab-content">
                        {activeTab === 'info' && (
                            <div className="member-info-view" style={{ animation: 'fadeIn 0.3s ease' }}>
                                <div className="info-grid" style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '1.5rem'
                                }}>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>เบอร์โทรศัพท์</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{member.phone || '-'}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ธนาคาร</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{member.bank_name || '-'}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>เลขบัญชี</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{member.bank_account || '-'}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>วันที่สมัคร</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{formatDate(member.created_at)}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>สถานะ</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-success)' }}>
                                            <span className="status-badge open" style={{ fontSize: '0.9rem' }}>ปกติ</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Bank Account Assignment for this member */}
                                {dealerBankAccounts.length > 0 && onUpdateBank && (
                                    <div className="bank-assignment-section" style={{
                                        marginTop: '1.5rem',
                                        padding: '1rem',
                                        background: 'rgba(212, 175, 55, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)'
                                    }}>
                                        <label style={{
                                            display: 'block',
                                            color: 'var(--color-primary)',
                                            fontSize: '0.9rem',
                                            marginBottom: '0.5rem',
                                            fontWeight: '500'
                                        }}>
                                            <FiStar style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                                            บัญชีธนาคารสำหรับโอนเงิน
                                        </label>
                                        <select
                                            className="form-input"
                                            value={member.assigned_bank_account_id || ''}
                                            onChange={(e) => onUpdateBank(e.target.value || null)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                background: 'var(--color-surface)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: '0.75rem 1rem',
                                                color: 'var(--color-text)',
                                                width: '100%',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">ใช้บัญชีหลัก (Default)</option>
                                            {dealerBankAccounts.map(bank => (
                                                <option key={bank.id} value={bank.id}>
                                                    {bank.bank_name} - {bank.bank_account}
                                                    {bank.is_default ? ' (หลัก)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <p style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--color-text-muted)',
                                            marginTop: '0.5rem',
                                            opacity: 0.8
                                        }}>
                                            ลูกค้าจะเห็นบัญชีนี้ในหน้าข้อมูลเจ้ามือ
                                        </p>
                                    </div>
                                )}
                                {/* Block Button */}
                                {onBlock && (
                                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                        <button
                                            className="btn btn-outline btn-sm"
                                            onClick={(e) => { e.stopPropagation(); onBlock(); }}
                                            style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                                        >
                                            <FiLock style={{ marginRight: '0.5rem' }} /> บล็อคสมาชิก
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="member-settings-wrapper" style={{ animation: 'fadeIn 0.3s ease' }}>
                                <MemberSettings
                                    member={member}
                                    isInline={true}
                                    onClose={() => { }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// Member Settings Component - With Lottery Type Tabs
// Refactored from UserSettingsModal to support inline rendering
function MemberSettings({ member, onClose, isInline = false }) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('thai')

    // Default settings structure with commission and payout rates
    const getDefaultSettings = () => ({
        thai: {
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_top': { commission: 30, payout: 550 },
            '3_tod': { commission: 15, payout: 100 },
            '3_bottom': { commission: 15, payout: 135 },
            '4_run': { commission: 15, payout: 20 },
            '5_run': { commission: 15, payout: 10 }
        },
        lao: {
            '4_top': { commission: 25, payout: 100000, isFixed: true },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_run': { commission: 15, payout: 20 },
            '5_run': { commission: 15, payout: 10 }
        },
        stock: {
            '2_top': { commission: 15, payout: 65 },
            '2_bottom': { commission: 15, payout: 65 }
        }
    })

    const [settings, setSettings] = useState(getDefaultSettings())

    // Labels for each bet type
    const BET_LABELS = {
        thai: {
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน (หน้า/กลาง/หลัง)',
            'pak_bottom': 'ปักล่าง (หน้า/หลัง)',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวตรง',
            '3_tod': '3 ตัวโต๊ด',
            '3_bottom': '3 ตัวล่าง',
            '4_run': '4 ตัวลอย',
            '5_run': '5 ตัวลอย'
        },
        lao: {
            '4_top': '4 ตัวตรง (ชุด 120฿)',
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน (หน้า/กลาง/หลัง)',
            'pak_bottom': 'ปักล่าง (หน้า/หลัง)',
            '2_top': '2 ตัวบน',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง',
            '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย',
            '5_run': '5 ตัวลอย'
        },
        stock: {
            '2_top': '2 ตัวบน',
            '2_bottom': '2 ตัวล่าง'
        }
    }

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

            if (data && data.lottery_settings) {
                const merged = { ...getDefaultSettings() }
                Object.keys(data.lottery_settings).forEach(tab => {
                    if (merged[tab]) {
                        Object.keys(data.lottery_settings[tab]).forEach(key => {
                            if (merged[tab][key]) {
                                merged[tab][key] = { ...merged[tab][key], ...data.lottery_settings[tab][key] }
                            }
                        })
                    }
                })
                setSettings(merged)
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
                    lottery_settings: settings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, dealer_id' })

            if (error) throw error
            alert('บันทึกการตั้งค่าสำเร็จ')
            if (!isInline) onClose()
        } catch (error) {
            console.error('Error saving user settings:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const updateSetting = (tab, key, field, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                [key]: {
                    ...prev[tab][key],
                    [field]: parseFloat(value) || 0
                }
            }
        }))
    }

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว/ฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    const content = (
        <div className={isInline ? "member-settings-inline" : "modal modal-xl"} onClick={e => !isInline && e.stopPropagation()}>
            {!isInline && (
                <div className="modal-header">
                    <h3><FiSettings /> ตั้งค่าสมาชิก: {member.full_name}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <FiX />
                    </button>
                </div>
            )}

            {isInline && (
                <div className="settings-header-inline" style={{ marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>ตั้งค่า: {member.full_name}</h3>
                </div>
            )}

            <div className={isInline ? "settings-body" : "modal-body"}>
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div className="settings-form">
                        <div className="settings-tabs">
                            {LOTTERY_TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="settings-table-wrap">
                            <table className="settings-table">
                                <thead>
                                    <tr>
                                        <th>ประเภท</th>
                                        <th>ค่าคอม</th>
                                        <th>อัตราจ่าย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(settings[activeTab] || {}).map(([key, value]) => (
                                        <tr key={key} className={value.isFixed ? 'fixed-row' : ''}>
                                            <td className="type-cell">
                                                {BET_LABELS[activeTab]?.[key] || key}
                                            </td>
                                            <td>
                                                <div className="input-group">
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={value.commission}
                                                        onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                                    />
                                                    <span className="input-suffix">{value.isFixed ? '฿' : '%'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="input-group">
                                                    <input
                                                        type="number"
                                                        className="form-input small"
                                                        value={value.payout}
                                                        onChange={e => updateSetting(activeTab, key, 'payout', e.target.value)}
                                                    />
                                                    <span className="input-suffix">เท่า</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {activeTab === 'lao' && (
                            <p className="text-muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                                * หวยชุด 4 ตัว ขายชุดละ 120 บาท - ค่าคอมเป็นบาทต่อชุด
                            </p>
                        )}

                        {/* Save Button - Inline mode only */}
                        {isInline && (
                            <div className="settings-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={loading || saving}
                                    style={{ minWidth: '180px' }}
                                >
                                    {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!isInline && (
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
            )}
        </div>
    )

    if (isInline) return content

    return (
        <div className="modal-overlay" onClick={onClose}>
            {content}
        </div>
    )
}

// Summary Modal Component - Shows user profit/loss summary
function SummaryModal({ round, onClose }) {
    const [submissions, setSubmissions] = useState([])
    const [userSettings, setUserSettings] = useState({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [round.id])

    async function fetchData() {
        setLoading(true)
        try {
            // Fetch submissions
            const { data: submissionsData, error: subError } = await supabase
                .from('submissions')
                .select(`
                    *,
                    profiles (id, full_name, email)
                `)
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!subError) setSubmissions(submissionsData || [])

            // Fetch user_settings for all users in this round
            const { data: settingsData, error: setError } = await supabase
                .from('user_settings')
                .select('*')
                .eq('dealer_id', round.dealer_id)

            if (!setError && settingsData) {
                const settingsMap = {}
                settingsData.forEach(s => {
                    settingsMap[s.user_id] = s
                })
                setUserSettings(settingsMap)
            }
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Get lottery type category
    const getLotteryTypeKey = () => {
        if (round.lottery_type === 'thai') return 'thai'
        if (round.lottery_type === 'lao' || round.lottery_type === 'hanoi') return 'lao'
        if (round.lottery_type === 'stock') return 'stock'
        return 'thai'
    }

    // Default commission rates per bet type (percentage) - same as UserDashboard
    const DEFAULT_COMMISSIONS = {
        'run_top': 15, 'run_bottom': 15,
        'pak_top': 15, 'pak_bottom': 15,
        '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
        '3_top': 15, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
        '4_run': 15, '4_tod': 15, '4_set': 15, '4_float': 15, '5_run': 15, '5_float': 15, '6_top': 15
    }

    // Calculate commission for a submission
    const getCommission = (sub) => {
        const lotteryKey = getLotteryTypeKey()
        const settings = userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]

        if (settings && settings.commission !== undefined) {
            if (settings.isFixed) {
                return settings.commission // Fixed amount per bet
            }
            return sub.amount * (settings.commission / 100) // Percentage
        }

        // Use default commission rate for this bet type
        const defaultRate = DEFAULT_COMMISSIONS[sub.bet_type] || 15
        return sub.amount * (defaultRate / 100)
    }

    // Default payout rates per bet type
    const DEFAULT_PAYOUTS = {
        'run_top': 3, 'run_bottom': 4,
        'pak_top': 8, 'pak_bottom': 6,
        '2_top': 65, '2_front': 65, '2_center': 65, '2_run': 10, '2_bottom': 65,
        '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
        '4_run': 20, '4_tod': 100, '5_run': 10, '6_top': 1000000
    }

    // Calculate expected payout for a winning submission
    const getExpectedPayout = (sub) => {
        if (!sub.is_winner) return 0

        const lotteryKey = getLotteryTypeKey()
        const settings = userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]

        if (settings && settings.payout !== undefined) {
            return sub.amount * settings.payout
        }

        // Use default payout rate for this bet type
        const defaultRate = DEFAULT_PAYOUTS[sub.bet_type] || 1
        return sub.amount * defaultRate
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
                totalCommission: 0,
                winCount: 0,
                ticketCount: 0
            }
        }
        acc[userId].totalBet += sub.amount || 0
        // Calculate win amount from user settings (more accurate than database value)
        acc[userId].totalWin += getExpectedPayout(sub)
        acc[userId].totalCommission += getCommission(sub)
        acc[userId].ticketCount++
        if (sub.is_winner) acc[userId].winCount++
        return acc
    }, {})

    const userList = Object.values(userSummaries).sort((a, b) => {
        // Sort by net profit (descending - winners first)
        // Net = Win + Commission - Bet (from user perspective, positive means dealer pays them)
        const aNet = a.totalWin + a.totalCommission - a.totalBet
        const bNet = b.totalWin + b.totalCommission - b.totalBet
        return bNet - aNet
    })

    // Calculate totals
    const grandTotalBet = userList.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userList.reduce((sum, u) => sum + u.totalWin, 0)
    const grandTotalCommission = userList.reduce((sum, u) => sum + u.totalCommission, 0)
    // Dealer profit = Bets received - Prizes paid - Commission paid
    const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission

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
                    {/* Grand Summary Card - Moved from bottom */}
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
                                // Net = Prize + Commission - Bet (what dealer owes user)
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
                    <button className="btn btn-secondary" onClick={onClose}>
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    )
}
