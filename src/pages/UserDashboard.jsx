import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme, DASHBOARDS } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { checkDealerCreditForBet, updatePendingDeduction } from '../utils/creditCheck'
import { Html5Qrcode } from 'html5-qrcode'
import {
    FiClock,
    FiCalendar,
    FiPlus,
    FiTrash2,
    FiCheck,
    FiX,
    FiDollarSign,
    FiGift,
    FiSend,
    FiList,
    FiUser,
    FiChevronDown,
    FiChevronUp,
    FiGrid,
    FiLayers,
    FiAward,
    FiEdit2,
    FiSave,
    FiSearch,
    FiCopy,
    FiClipboard,
    FiRefreshCw,
    FiFileText,
    FiEdit,
    FiTrendingUp,
    FiTrendingDown,
    FiRotateCcw,
    FiImage
} from 'react-icons/fi'
import './UserDashboard.css'
import './ViewToggle.css'
import WriteSubmissionModal from '../components/WriteSubmissionModal'
import DealerInfoTab from '../components/user/DealerInfoTab'
import UserQRScannerModal from '../components/user/UserQRScannerModal'
import { createBill } from '../services/submissionService'
import { formatCopyText, copyToClipboard } from '../utils/copyFormat'

// Import constants from centralized file
import {
    LOTTERY_TYPES,
    BET_TYPES_WITH_DIGITS as BET_TYPES,
    DEFAULT_COMMISSIONS,
    getPermutations,
    getUnique3DigitPermsFrom4,
    getUnique3DigitPermsFrom5,
    generateUUID
} from '../constants/lotteryTypes'

export default function UserDashboard() {

    const { user, profile, loading: authLoading } = useAuth()
    const { toast } = useToast()
    const { setActiveDashboard } = useTheme()

    // Set active dashboard for theme on mount
    useEffect(() => {
        setActiveDashboard(DASHBOARDS.USER)
    }, [setActiveDashboard])
    const [rounds, setRounds] = useState([])
    const [selectedRound, setSelectedRound] = useState(null)
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('rounds') // rounds, results, commission
    const [userSettings, setUserSettings] = useState(null)

    // Multi-dealer support
    const [dealers, setDealers] = useState([])
    const [selectedDealer, setSelectedDealer] = useState(null)
    const [dealersLoading, setDealersLoading] = useState(true)
    const [isOwnDealer, setIsOwnDealer] = useState(false) // Track if selected dealer is the user themselves
    const [showDealerConfirmModal, setShowDealerConfirmModal] = useState(false) // Confirm dialog for becoming dealer

    // Results tab state
    const [resultsRounds, setResultsRounds] = useState([])
    const [resultsSummaries, setResultsSummaries] = useState({}) // { roundId: { totalAmount, totalCommission, totalPrize, netResult, winCount } }
    const [selectedResultRound, setSelectedResultRound] = useState(null)
    const [resultSubmissions, setResultSubmissions] = useState([])
    const [allResultSubmissions, setAllResultSubmissions] = useState([]) // All submissions for summary calculations
    const [resultsLoading, setResultsLoading] = useState(false)
    const [resultViewMode, setResultViewMode] = useState('winners') // 'all' or 'winners'

    // History tab state
    const [userHistory, setUserHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)

    // Submit form state
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [submitForm, setSubmitForm] = useState({
        bet_type: '2_top',
        numbers: '',
        amount: ''
    })
    const [submitting, setSubmitting] = useState(false)
    const [drafts, setDrafts] = useState([])
    const [displayMode, setDisplayMode] = useState('summary') // summary, detailed
    const [isGroupByBill, setIsGroupByBill] = useState(true)
    const [expandedBills, setExpandedBills] = useState([])
    const [billSortBy, setBillSortBy] = useState('time') // 'time' for bill sorting
    const [billSortOrder, setBillSortOrder] = useState('desc') // 'asc' or 'desc'
    const [itemSortMode, setItemSortMode] = useState('original') // 'asc', 'desc', 'original' - for items inside bills
    const [listSortBy, setListSortBy] = useState('time') // 'time' or 'number' - for non-grouped view
    const [listSortOrder, setListSortOrder] = useState('desc') // 'asc' or 'desc'
    const [currentBillId, setCurrentBillId] = useState(null)
    const [billNote, setBillNote] = useState('')
    const [isEditingBill, setIsEditingBill] = useState(false) // Track if editing existing bill
    const [isDraftsExpanded, setIsDraftsExpanded] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterBetType, setFilterBetType] = useState('') // Filter by bet type
    const [showPasteModal, setShowPasteModal] = useState(false)
    const [pasteText, setPasteText] = useState('')
    const [betTypeOrder, setBetTypeOrder] = useState(() => {
        const saved = localStorage.getItem('betTypeOrder')
        return saved ? JSON.parse(saved) : {}
    })
    const [draggedBetType, setDraggedBetType] = useState(null)
    const [isReversed, setIsReversed] = useState(false) // Toggle for 2-digit reversed bets
    const [lastClickedBetType, setLastClickedBetType] = useState(null) // Track last clicked bet type button
    const [showCloseConfirm, setShowCloseConfirm] = useState(false) // Confirm before closing modal
    const [showWriteModal, setShowWriteModal] = useState(false) // Write submission modal
    const [editingBillData, setEditingBillData] = useState(null) // Data for editing bill with WriteSubmissionModal
    const [showScannerModal, setShowScannerModal] = useState(false) // QR Scanner modal
    const numberInputRef = useRef(null)
    const amountInputRef = useRef(null)
    const billNoteInputRef = useRef(null)
    const audioContextRef = useRef(null)

    // Sort bet types by saved order
    const sortBetTypes = (items, digitCount) => {
        const orderKey = `digit_${digitCount}`
        const savedOrder = betTypeOrder[orderKey] || []
        if (savedOrder.length === 0) return items

        return [...items].sort((a, b) => {
            const keyA = typeof a === 'string' ? a : a.id
            const keyB = typeof b === 'string' ? b : b.id
            const indexA = savedOrder.indexOf(keyA)
            const indexB = savedOrder.indexOf(keyB)
            if (indexA === -1 && indexB === -1) return 0
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
        })
    }

    // Handle drag start
    const handleBetTypeDragStart = (e, item, digitCount) => {
        const key = typeof item === 'string' ? item : item.id
        setDraggedBetType({ key, digitCount })
        e.dataTransfer.effectAllowed = 'move'
        e.target.style.opacity = '0.5'
    }

    // Handle drag end
    const handleBetTypeDragEnd = (e) => {
        e.target.style.opacity = '1'
        setDraggedBetType(null)
    }

    // Handle drag over
    const handleBetTypeDragOver = (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    // Handle drop
    const handleBetTypeDrop = (e, targetItem, items, digitCount) => {
        e.preventDefault()
        if (!draggedBetType || draggedBetType.digitCount !== digitCount) return

        const targetKey = typeof targetItem === 'string' ? targetItem : targetItem.id
        if (draggedBetType.key === targetKey) return

        // Build order from current items
        const currentOrder = items.map(i => typeof i === 'string' ? i : i.id)
        const dragIndex = currentOrder.indexOf(draggedBetType.key)
        const targetIndex = currentOrder.indexOf(targetKey)

        if (dragIndex !== -1 && targetIndex !== -1) {
            currentOrder.splice(dragIndex, 1)
            currentOrder.splice(targetIndex, 0, draggedBetType.key)

            const orderKey = `digit_${digitCount}`
            const updated = { ...betTypeOrder, [orderKey]: currentOrder }
            setBetTypeOrder(updated)
            localStorage.setItem('betTypeOrder', JSON.stringify(updated))
        }

        setDraggedBetType(null)
    }

    // Play a short beep sound when adding draft
    const playAddSound = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
            }
            const ctx = audioContextRef.current
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)

            oscillator.frequency.value = 800 // Hz
            oscillator.type = 'sine'
            gainNode.gain.value = 0.1 // Volume

            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + 0.08) // 80ms beep
        } catch (e) {
            console.log('Audio not supported')
        }
    }

    // Edit submission state
    const [editingSubmission, setEditingSubmission] = useState(null)
    const [editForm, setEditForm] = useState({ numbers: '', amount: '', bet_type: '' })
    const [editSaving, setEditSaving] = useState(false)

    // Focus on bill note input when modal opens
    useEffect(() => {
        if (showSubmitModal && billNoteInputRef.current) {
            setTimeout(() => {
                billNoteInputRef.current.focus()
            }, 100)
        }
    }, [showSubmitModal])

    // Fetch active dealer memberships
    useEffect(() => {
        if (user) {
            fetchDealerMemberships()
        } else if (!authLoading) {
            // Auth finished but no user - stop loading
            setDealersLoading(false)
        }
    }, [user, authLoading])

    async function fetchDealerMemberships() {
        setDealersLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    dealer_id,
                    status,
                    profiles:dealer_id (
                        id,
                        full_name,
                        email,
                        role
                    )
                `)
                .eq('user_id', user.id)
                .eq('status', 'active')

            if (!error && data) {
                const dealerList = data.map(m => ({
                    id: m.profiles?.id,
                    full_name: m.profiles?.full_name,
                    email: m.profiles?.email,
                    role: m.profiles?.role
                }))
                    .filter(d => d.id && d.role === 'dealer')

                setDealers(dealerList)

                // Auto-select first dealer if none selected
                if (dealerList.length > 0 && !selectedDealer) {
                    setSelectedDealer(dealerList[0])
                }
            }
        } catch (error) {
            console.error('Error fetching dealer memberships:', error)
        } finally {
            setDealersLoading(false)
        }
    }

    // Handle switching to dealer dashboard - show confirmation modal first
    const handleSwitchToDealerDashboard = () => {
        setShowDealerConfirmModal(true)
    }

    // Confirm and create dealer account
    const confirmBecomeDealear = async () => {
        try {
            // Update user role to dealer
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ role: 'dealer' })
                .eq('id', user.id)

            if (updateError) {
                console.error('Error updating role:', updateError)
                toast.error('ไม่สามารถสร้างบัญชีเจ้ามือได้')
                return
            }

            // Create membership record for self
            await supabase
                .from('user_dealer_memberships')
                .upsert({
                    user_id: user.id,
                    dealer_id: user.id,
                    status: 'active'
                })

            // Create upstream connections from existing memberships (dealers user was a member of)
            // This allows the new dealer to transfer bets to their previous dealers
            if (dealers && dealers.length > 0) {
                const upstreamConnections = dealers
                    .filter(d => d.id !== user.id) // Exclude self
                    .map(dealer => ({
                        dealer_id: user.id,
                        upstream_dealer_id: dealer.id,
                        upstream_name: dealer.full_name || dealer.email || 'ไม่ระบุชื่อ',
                        upstream_contact: dealer.phone || dealer.email || '',
                        is_linked: true,
                        is_blocked: false
                    }))

                if (upstreamConnections.length > 0) {
                    await supabase
                        .from('dealer_upstream_connections')
                        .upsert(upstreamConnections, {
                            onConflict: 'dealer_id,upstream_dealer_id',
                            ignoreDuplicates: true
                        })
                }
            }

            setShowDealerConfirmModal(false)
            toast.success('สร้างบัญชีเจ้ามือสำเร็จ!')

            // Redirect to dealer dashboard
            window.location.href = '/dealer'
        } catch (error) {
            console.error('Error creating dealer:', error)
            toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        }
    }

    // Fetch data when selectedDealer changes
    useEffect(() => {
        if (selectedDealer) {
            fetchRounds()
            fetchUserSettings()
        }
    }, [selectedDealer])

    async function fetchUserSettings() {
        if (!selectedDealer) return
        console.log('fetchUserSettings: fetching for user_id:', user.id, 'dealer_id:', selectedDealer.id)
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .eq('dealer_id', selectedDealer.id)
                .maybeSingle()

            console.log('fetchUserSettings result:', { data, error })
            if (error) {
                console.error('Error fetching user settings:', error)
                return
            }
            // Even if data is null, we'll use defaults in the commission calculation
            setUserSettings(data)
        } catch (error) {
            console.error('Error fetching user settings:', error)
        }
    }

    useEffect(() => {
        if (selectedRound) {
            fetchSubmissions()
        }
    }, [selectedRound])

    // Fetch results when switching to results tab
    useEffect(() => {
        if (activeTab === 'results' && selectedDealer) {
            fetchResultsRounds()
        }
    }, [activeTab, selectedDealer])

    // Fetch submissions when selecting a result round or changing view mode
    useEffect(() => {
        if (selectedResultRound) {
            fetchResultSubmissions(selectedResultRound.id)
        }
    }, [selectedResultRound, resultViewMode])

    // Fetch history when switching to history tab
    useEffect(() => {
        if (activeTab === 'history') {
            fetchUserHistory()
        }
    }, [activeTab])

    async function fetchRounds() {
        if (!selectedDealer) return
        setLoading(true)
        try {
            // Get open rounds from my dealer
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select(`
                    *,
                    type_limits (*)
                `)
                .eq('dealer_id', selectedDealer.id)
                .in('status', ['open', 'closed'])
                .order('round_date', { ascending: false })
                .limit(50)

            if (!error) {
                setRounds(data || [])
                // Don't auto-select round - let user click to expand
                // Reset selectedRound when switching tabs or dealers
                setSelectedRound(null)
            }
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchSubmissions() {
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select('*')
                .eq('round_id', selectedRound.id)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!error) {
                setSubmissions(data || [])
            }
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Fetch rounds with announced results for Results tab
    async function fetchResultsRounds() {
        if (!selectedDealer) return
        setResultsLoading(true)
        try {
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', selectedDealer.id)
                .eq('is_result_announced', true)
                .order('close_time', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(20)

            if (!error && data) {
                setResultsRounds(data)

                // Fetch submissions for each round to calculate summaries
                const summaries = {}
                for (const round of data) {
                    const { data: subs } = await supabase
                        .from('submissions')
                        .select('*')
                        .eq('round_id', round.id)
                        .eq('user_id', user.id)
                        .eq('is_deleted', false)

                    if (subs && subs.length > 0) {
                        const totalAmount = subs.reduce((sum, s) => sum + (s.amount || 0), 0)
                        const winCount = subs.filter(s => s.is_winner).length

                        // Calculate total prize and commission using same logic as getCalculatedPrize/getCalculatedCommission
                        const lotteryKey = (() => {
                            if (round.lottery_type === 'thai') return 'thai'
                            if (round.lottery_type === 'lao' || round.lottery_type === 'hanoi') return 'lao'
                            if (round.lottery_type === 'stock') return 'stock'
                            return 'thai'
                        })()

                        // Use commission_amount that was recorded when submission was made
                        // This ensures consistency between submission time and results display
                        const totalCommission = subs.reduce((sum, s) => sum + (s.commission_amount || 0), 0)

                        const totalPrize = subs.reduce((sum, s) => {
                            if (!s.is_winner) return sum
                            // For 4_set, use prize_amount from database (FIXED amount)
                            if (s.bet_type === '4_set') {
                                return sum + (s.prize_amount || 0)
                            }
                            // Map bet_type to settings key (Lao/Hanoi use different keys)
                            let settingsKey = s.bet_type
                            if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
                                const LAO_BET_TYPE_MAP = {
                                    '3_top': '3_straight',
                                    '3_tod': '3_tod_single'
                                }
                                settingsKey = LAO_BET_TYPE_MAP[s.bet_type] || s.bet_type
                            }
                            const settings = userSettings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                            if (settings?.payout !== undefined) {
                                return sum + (s.amount * settings.payout)
                            }
                            const defaultPayouts = {
                                'run_top': 3, 'run_bottom': 4, 'pak_top': 8, 'pak_bottom': 6,
                                '2_top': 65, '2_front': 65, '2_center': 65, '2_spread': 65, '2_run': 10, '2_bottom': 65,
                                '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
                                '4_float': 20, '4_tod': 100, '5_float': 10, '6_top': 1000000
                            }
                            return sum + (s.amount * (defaultPayouts[s.bet_type] || 1))
                        }, 0)

                        const netResult = totalCommission + totalPrize - totalAmount

                        summaries[round.id] = {
                            totalAmount,
                            totalCommission,
                            totalPrize,
                            netResult,
                            winCount,
                            ticketCount: subs.length
                        }
                    }
                }
                setResultsSummaries(summaries)
            }
        } catch (error) {
            console.error('Error fetching results rounds:', error)
        } finally {
            setResultsLoading(false)
        }
    }

    // Fetch submissions for a specific round (all or winners only)
    async function fetchResultSubmissions(roundId) {
        try {
            // Always fetch all submissions first for summary calculations
            const { data: allData, error: allError } = await supabase
                .from('submissions')
                .select('*')
                .eq('round_id', roundId)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })

            if (!allError) {
                setAllResultSubmissions(allData || [])

                // Filter for display based on view mode
                if (resultViewMode === 'winners') {
                    setResultSubmissions((allData || []).filter(s => s.is_winner))
                } else {
                    setResultSubmissions(allData || [])
                }
            }
        } catch (error) {
            console.error('Error fetching result submissions:', error)
        }
    }

    // Fetch user history (archived rounds)
    async function fetchUserHistory() {
        if (!user?.id) return
        setHistoryLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_round_history')
                .select('*')
                .eq('user_id', user.id)
                .order('deleted_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                setUserHistory(data)
            }
        } catch (error) {
            console.error('Error fetching user history:', error)
        } finally {
            setHistoryLoading(false)
        }
    }

    // Check if can still submit (before close time)
    function canSubmit() {
        if (!selectedRound) return false
        if (selectedRound.status !== 'open') return false
        return new Date() < new Date(selectedRound.close_time)
    }

    // Check if can delete (before delete deadline)
    function canDelete(submission) {
        if (!selectedRound) return false
        if (selectedRound.status !== 'open') return false

        const closeTime = new Date(selectedRound.close_time)
        const deleteDeadline = new Date(closeTime.getTime() - (selectedRound.delete_before_minutes * 60 * 1000))
        return new Date() < deleteDeadline
    }

    // Use centralized DEFAULT_COMMISSIONS from lotteryTypes.js
    // (Previously had a local copy with incorrect '3_top': 30 instead of 15)

    // Get lottery type key for settings lookup
    const getLotteryKeyForDraft = (lotteryType) => {
        if (lotteryType === 'thai') return 'thai'
        if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao'
        if (lotteryType === 'stock') return 'stock'
        return 'thai'
    }

    // Helper function to get commission rate for a bet type from lottery_settings
    // settingsOverride can be passed with fresh settings from database
    // roundOverride can be passed to use a specific round instead of selectedRound
    const getCommissionForBetType = (betType, settingsOverride = null, roundOverride = null) => {
        const currentRound = roundOverride || selectedRound
        if (!currentRound) return { rate: DEFAULT_COMMISSIONS[betType] || 15, isFixed: false }

        const currentSettings = settingsOverride || userSettings
        const lotteryKey = getLotteryKeyForDraft(currentRound.lottery_type)

        // Map bet_type to settings key for Lao/Hanoi lottery
        // In settings, Lao uses different keys than the actual bet_type used in submissions
        let settingsKey = betType
        if (lotteryKey === 'lao') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',      // 3 ตัวตรง
                '3_tod': '3_tod_single',    // 3 ตัวโต๊ด
                '4_top': '4_set'            // 4 ตัวตรง (ชุด) - stored as 4_set in settings
            }
            settingsKey = LAO_BET_TYPE_MAP[betType] || betType
        }

        const settings = currentSettings?.lottery_settings?.[lotteryKey]?.[settingsKey]

        console.log('getCommissionForBetType:', {
            betType,
            settingsKey,
            lotteryKey,
            settings,
            currentSettings: currentSettings?.lottery_settings?.[lotteryKey]
        })

        if (settings && settings.commission !== undefined) {
            return { rate: settings.commission, isFixed: settings.isFixed || false }
        }

        // Default rates for Lao/Hanoi set-based bets (fixed amount per set)
        // These match the defaults in Dealer.jsx MemberSettings
        if (lotteryKey === 'lao') {
            const LAO_SET_DEFAULTS = {
                '4_top': { commission: 25, isFixed: true },
                '4_set': { commission: 25, isFixed: true }
            }
            if (LAO_SET_DEFAULTS[betType]) {
                console.log('Using Lao default for', betType, LAO_SET_DEFAULTS[betType])
                return { rate: LAO_SET_DEFAULTS[betType].commission, isFixed: true }
            }
        }

        return { rate: DEFAULT_COMMISSIONS[betType] || 15, isFixed: false }
    }

    // Calculate commission amount based on rate and amount
    // roundOverride can be passed to use a specific round instead of selectedRound
    const calculateCommissionAmount = (amount, betType, roundOverride = null) => {
        const commissionInfo = getCommissionForBetType(betType, null, roundOverride)
        if (commissionInfo.isFixed) {
            return commissionInfo.rate
        }
        return (amount * commissionInfo.rate) / 100
    }

    // Add to draft list
    async function addToDraft(betTypeOverride = null) {
        console.log('addToDraft called with:', betTypeOverride)
        console.log('submitForm:', submitForm)

        // Fetch fresh userSettings before processing to ensure latest commission rates
        let freshUserSettings = userSettings
        if (selectedDealer) {
            try {
                const { data } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('dealer_id', selectedDealer.id)
                    .maybeSingle()

                if (data) {
                    freshUserSettings = data
                    setUserSettings(data) // Update state for future use
                }
                console.log('Fresh userSettings fetched:', data)
            } catch (error) {
                console.error('Error fetching fresh userSettings:', error)
            }
        }

        // Fetch fresh lottery round data to get latest set_prices
        let freshRound = selectedRound
        if (selectedRound) {
            try {
                const { data } = await supabase
                    .from('lottery_rounds')
                    .select('*')
                    .eq('id', selectedRound.id)
                    .single()

                if (data) {
                    freshRound = data
                    setSelectedRound(data) // Update state for future use
                }
                console.log('Fresh round fetched:', data?.set_prices)
            } catch (error) {
                console.error('Error fetching fresh round:', error)
            }
        }

        console.log('Using userSettings:', freshUserSettings)
        console.log('lottery_settings:', freshUserSettings?.lottery_settings)
        const betType = betTypeOverride || submitForm.bet_type

        // Track last clicked bet type for highlighting
        if (betTypeOverride) {
            setLastClickedBetType(betTypeOverride)
        }

        // Clean numbers by removing spaces
        const cleanNumbers = (submitForm.numbers || '').replace(/\s/g, '')
        console.log('cleanNumbers:', cleanNumbers, 'betType:', betType)

        // Check if this is a set-based bet type for Lao/Hanoi lottery
        const isLaoOrHanoi = freshRound && ['lao', 'hanoi'].includes(freshRound.lottery_type)
        const isSetBetType = betType === '4_set'
        const isSetBasedBet = isLaoOrHanoi && isSetBetType

        // For set-based bets, amount field represents number of sets (default: 1 set if empty)
        if (!cleanNumbers || (!submitForm.amount && !isSetBasedBet) || !betType) {
            console.log('Validation failed:', { cleanNumbers, amount: submitForm.amount, betType })
            toast.warning('กรุณากรอกเลขและจำนวนเงิน')
            return
        }

        let totalAmount
        let setCount = 1
        let displayAmount = submitForm.amount

        let amountParts = []
        if (isSetBasedBet) {
            // For 4 ตัวชุด on Lao/Hanoi: amount field = number of sets (default: 1)
            setCount = parseInt(submitForm.amount) || 1
            // Get set price from fresh round settings or use default (120 baht)
            const setPrice = freshRound?.set_prices?.['4_top'] || 120
            totalAmount = setCount * setPrice
            displayAmount = `${totalAmount} บาท (${setCount} ชุด)`
            console.log('Set-based bet:', { setCount, setPrice, totalAmount })
        } else {
            // Normal amount handling
            amountParts = submitForm.amount.toString().split('*').map(p => parseFloat(p) || 0)
            totalAmount = amountParts.reduce((sum, p) => sum + p, 0)
        }

        if (totalAmount <= 0) {
            toast.warning('จำนวนเงินต้องมากกว่า 0')
            return
        }

        const betTypeInfo = BET_TYPES[betType] || { label: betType, digits: 0 }
        const digitsOnly = cleanNumbers.replace(/\*/g, '')

        // Strict digit check
        const isSpecial3Digit = ['3_perm_from_4', '3_perm_from_5', '3_perm_from_3', '3_straight_tod', '3_straight_perm'].includes(betType)
        if (!isSpecial3Digit && digitsOnly.length !== betTypeInfo.digits) {
            if (!(betType === '3_top' && cleanNumbers.includes('*'))) {
                toast.warning(`${betTypeInfo.label} ต้องมี ${betTypeInfo.digits} หลัก`)
                return
            }
        }


        const entryId = generateUUID()

        const newDrafts = []
        const timestamp = new Date().toISOString()

        // Get label for display
        let displayLabel = betTypeInfo.label
        if (betType === '3_perm_from_3') {
            const permCount = getPermutations(cleanNumbers).length
            displayLabel = `คูณชุด ${permCount}`
        } else if (betType === '3_perm_from_4') {
            const permCount = getUnique3DigitPermsFrom4(cleanNumbers).length
            displayLabel = `3 X ${permCount}`
        } else if (betType === '3_perm_from_5') {
            const permCount = getUnique3DigitPermsFrom5(cleanNumbers).length
            displayLabel = `3 X ${permCount}`
        } else if (betType === '3_straight_tod') {
            displayLabel = 'เต็ง-โต๊ด'
        } else if (betType === '3_straight_perm') {
            const permCount = getPermutations(cleanNumbers).length
            displayLabel = `1+กลับ (${permCount - 1})`
        }

        if (betType === '3_perm_from_4' || betType === '3_perm_from_5' || betType === '3_perm_from_3') {
            let perms = []
            if (betType === '3_perm_from_4') perms = getUnique3DigitPermsFrom4(cleanNumbers)
            else if (betType === '3_perm_from_5') perms = getUnique3DigitPermsFrom5(cleanNumbers)
            else if (betType === '3_perm_from_3') perms = getPermutations(cleanNumbers)

            const commInfo = getCommissionForBetType('3_top', freshUserSettings)
            perms.forEach(p => {
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: p,
                    amount: totalAmount,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (totalAmount * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            })
        } else if (betType === '3_straight_tod') {
            // เต็ง-โต๊ด: ถ้าไม่มี * ใช้จำนวนเงินเดียวกันสำหรับทั้ง 3 ตัวบนและ 3 ตัวโต๊ด
            // ถ้ามี * ใช้จำนวนเงินแรกสำหรับ 3 ตัวบน และจำนวนเงินที่สองสำหรับ 3 ตัวโต๊ด
            const hasStarInAmount = submitForm.amount.toString().includes('*')
            let straightAmt, todAmt
            if (hasStarInAmount && amountParts.length === 2) {
                straightAmt = amountParts[0]
                todAmt = amountParts[1]
            } else {
                // ไม่มี * - ใช้จำนวนเงินเดียวกันทั้ง 2 ประเภท
                straightAmt = totalAmount
                todAmt = totalAmount
            }

            if (straightAmt > 0) {
                const commInfo = getCommissionForBetType('3_top', freshUserSettings)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (todAmt > 0) {
                const commInfo = getCommissionForBetType('3_tod', freshUserSettings)
                // Sort digits from low to high for tod bets (e.g., 934 → 349)
                const sortedNumbers = cleanNumbers.split('').sort().join('')
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_tod',
                    numbers: sortedNumbers,
                    amount: todAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (todAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
        } else if (betType === '3_straight_perm') {
            const [straightAmt, permAmt] = amountParts
            const perms = getPermutations(cleanNumbers).filter(p => p !== cleanNumbers)

            if (straightAmt > 0) {
                const commInfo = getCommissionForBetType('3_top', freshUserSettings)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: '3_top',
                    numbers: cleanNumbers,
                    amount: straightAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
            if (permAmt > 0 && perms.length > 0) {
                const commInfo = getCommissionForBetType('3_top', freshUserSettings)
                perms.forEach(p => {
                    newDrafts.push({
                        entry_id: entryId,
                        bet_type: '3_top',
                        numbers: p,
                        amount: permAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (permAmt * commInfo.rate) / 100,
                        display_numbers: cleanNumbers,
                        display_amount: submitForm.amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                })
            }
        } else if (betType.endsWith('_rev') && cleanNumbers.length === 2) {
            // กลับ (2 หลัก): สร้างทั้งเลขต้นฉบับและเลขกลับ
            // ถ้าไม่มี * ใช้จำนวนเงินเดียวกันสำหรับทั้ง 2 รายการ
            // ถ้ามี * ใช้จำนวนเงินแรกสำหรับเลขต้นฉบับ และจำนวนเงินที่สองสำหรับเลขกลับ
            const baseBetType = betType.replace('_rev', '')
            const reversedNumbers = cleanNumbers.split('').reverse().join('')
            const hasStarInAmount = submitForm.amount.toString().includes('*')

            let amt1, amt2
            if (hasStarInAmount && amountParts.length === 2) {
                amt1 = amountParts[0]
                amt2 = amountParts[1]
            } else {
                // ไม่มี * - ใช้จำนวนเงินเดียวกันทั้ง 2 เลข
                amt1 = totalAmount
                amt2 = totalAmount
            }

            // เลขต้นฉบับกับจำนวนเงินแรก
            if (amt1 > 0) {
                const commInfo = getCommissionForBetType(baseBetType, freshUserSettings)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt1,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt1 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }

            // เลขกลับกับจำนวนเงินที่สอง (ถ้าเลขไม่เหมือนกัน เช่น 12 → 21)
            if (amt2 > 0 && reversedNumbers !== cleanNumbers) {
                const commInfo = getCommissionForBetType(baseBetType, freshUserSettings)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: reversedNumbers,
                    amount: amt2,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt2 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            } else if (amt2 > 0 && reversedNumbers === cleanNumbers) {
                // เลขเหมือนกัน (เช่น 11, 22) - เพิ่มจำนวนเงินที่สองให้เลขเดิม
                const commInfo = getCommissionForBetType(baseBetType, freshUserSettings)
                newDrafts.push({
                    entry_id: entryId,
                    bet_type: baseBetType,
                    numbers: cleanNumbers,
                    amount: amt2,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (amt2 * commInfo.rate) / 100,
                    display_numbers: cleanNumbers,
                    display_amount: submitForm.amount,
                    display_bet_type: displayLabel,
                    created_at: timestamp
                })
            }
        } else {
            // For 4_set bet type, get commission from '4_top' settings (4 ตัวตรง ชุด)
            const commLookupBetType = isSetBasedBet ? '4_top' : betType
            const commInfo = getCommissionForBetType(commLookupBetType, freshUserSettings)
            let commissionAmount

            if (isSetBasedBet) {
                // For set-based bets: commission = setCount × commission_rate_per_set (fixed amount)
                // Commission rate for 4_set is stored under '4_top' as fixed amount per set in user_settings
                commissionAmount = setCount * commInfo.rate
                console.log('Set-based commission:', { setCount, rate: commInfo.rate, commissionAmount })
            } else if (commInfo.isFixed) {
                commissionAmount = commInfo.rate
            } else {
                commissionAmount = (totalAmount * commInfo.rate) / 100
            }

            newDrafts.push({
                entry_id: entryId,
                bet_type: betType,
                numbers: cleanNumbers,
                amount: totalAmount,
                commission_rate: commInfo.rate,
                commission_amount: commissionAmount,
                display_numbers: cleanNumbers,
                display_amount: displayAmount,
                display_bet_type: displayLabel,
                created_at: timestamp
            })
        }

        // Add original_count to each draft for group tracking
        const draftsWithCount = newDrafts.map(d => ({
            ...d,
            original_count: newDrafts.length
        }))

        setDrafts(prev => [...prev, ...draftsWithCount])
        playAddSound() // Play sound feedback

        // Focus back to number input (minimal delay since we prevent blur)
        if (numberInputRef.current) {
            setTimeout(() => {
                numberInputRef.current.focus()
                numberInputRef.current.select()
                numberInputRef.current.setSelectionRange(0, 9999)
            }, 10)
        }
    }

    // Parse pasted text and add 4-digit numbers as 4_set drafts (for Lao/Hanoi)
    function handlePasteNumbers() {
        if (!pasteText.trim()) {
            toast.warning('กรุณาวางข้อมูลก่อน')
            return
        }

        const isLaoOrHanoi = ['lao', 'hanoi'].includes(selectedRound?.lottery_type)
        if (!isLaoOrHanoi) {
            toast.warning('ฟีเจอร์นี้ใช้ได้เฉพาะหวยลาว และ หวยฮานอย')
            return
        }

        // Get set price from user_settings or round settings
        const lotteryKey = selectedRound.lottery_type
        const setSettings = userSettings?.lottery_settings?.[lotteryKey]?.['4_set']
        const setPrice = setSettings?.setPrice || selectedRound?.set_prices?.['4_top'] || 120

        // Use same logic as normal 4_set input - getCommissionForBetType('4_set')
        const commInfo = getCommissionForBetType('4_set', userSettings)
        const commissionPerSet = commInfo.rate

        console.log('Paste numbers - commInfo:', commInfo, 'commissionPerSet:', commissionPerSet)

        const lines = pasteText.split('\n')
        const newDrafts = []
        const timestamp = new Date().toISOString()
        let addedCount = 0

        lines.forEach(line => {
            // Find all 4-digit sequences in the line
            const matches = line.match(/\d{4}/g)
            if (matches) {
                matches.forEach(numbers => {
                    const entryId = generateUUID()

                    newDrafts.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: profile.id,
                        bill_id: currentBillId || generateUUID(),
                        bet_type: '4_set',
                        numbers: numbers,
                        amount: setPrice, // 1 set = setPrice
                        commission_rate: commissionPerSet,
                        commission_amount: commissionPerSet, // Fixed amount per set
                        display_numbers: numbers,
                        display_amount: `${setPrice} บาท (1 ชุด)`,
                        display_bet_type: '4 ตัวชุด',
                        created_at: timestamp,
                        original_count: 1
                    })
                    addedCount++
                })
            }
        })

        if (newDrafts.length > 0) {
            // Generate bill ID if not exists
            if (!currentBillId) {
                const shortId = 'B-' + Math.random().toString(36).substring(2, 8).toUpperCase()
                setCurrentBillId(shortId)
            }

            setDrafts(prev => [...prev, ...newDrafts])
            playAddSound() // Play sound feedback
            setShowPasteModal(false)
            setPasteText('')
            toast.success(`เพิ่ม ${addedCount} รายการสำเร็จ`)
        } else {
            toast.warning('ไม่พบเลข 4 ตัวในข้อความ')
        }
    }

    // Save all drafts to database
    async function handleSaveBill() {
        if (drafts.length === 0) return

        // Check if dealer is active before submitting
        if (selectedDealer) {
            const { data: dealerProfile } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', selectedDealer.id)
                .single()

            if (dealerProfile?.is_active === false) {
                toast.error('เจ้ามือถูกระงับการใช้งาน ไม่สามารถส่งเลขได้')
                return
            }

            // Check dealer's credit for percentage billing
            const totalBetAmount = drafts.reduce((sum, d) => sum + (d.amount || 0), 0)
            const creditCheck = await checkDealerCreditForBet(selectedDealer.id, selectedRound.id, totalBetAmount)

            if (!creditCheck.allowed) {
                toast.error(`ไม่สามารถบันทึกได้: ${creditCheck.message}`)
                return
            }
        }

        setSubmitting(true)
        try {
            const billId = currentBillId || generateUUID()

            // If editing an existing bill, delete old submissions first
            if (isEditingBill && currentBillId) {
                const { error: deleteError } = await supabase
                    .from('submissions')
                    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                    .eq('bill_id', currentBillId)
                    .eq('round_id', selectedRound.id)

                if (deleteError) throw deleteError
            }

            const inserts = drafts.map(d => {
                // Remove fields that are only for UI tracking, not in DB schema
                // Keep entry_id for grouping! Only remove id so DB generates new UUID
                const {
                    id,           // Remove so DB generates new UUID
                    original_count,
                    commission,   // UI field, DB uses commission_amount
                    originalId,   // UI tracking
                    displayBetType,  // UI display
                    displayAmount,   // UI display
                    ...rest
                } = d
                return {
                    ...rest,
                    round_id: selectedRound.id,
                    user_id: user.id,
                    bill_id: billId,
                    bill_note: billNote || null
                }
            })

            // Use submissionService to create bill
            const { error } = await createBill(inserts)
            if (error) throw error

            // Update pending deduction for dealer's credit
            // Always use selectedDealer.id - this is the dealer whose credit should be updated
            // Whether user is entering their own bets or dealer is entering for themselves
            const dealerIdForCredit = selectedDealer?.id
            console.log('=== Credit Update Debug ===')
            console.log('isOwnDealer:', isOwnDealer)
            console.log('user.id:', user.id)
            console.log('selectedDealer?.id:', selectedDealer?.id)
            console.log('dealerIdForCredit:', dealerIdForCredit)

            if (dealerIdForCredit) {
                console.log('Calling updatePendingDeduction for dealer:', dealerIdForCredit)
                try {
                    await updatePendingDeduction(dealerIdForCredit)
                    console.log('updatePendingDeduction completed')
                } catch (err) {
                    console.log('Error updating pending deduction:', err)
                }
            }

            setDrafts([])
            setCurrentBillId(null)
            setBillNote('')
            setIsEditingBill(false) // Reset edit mode
            setShowSubmitModal(false)
            fetchSubmissions()
            toast.success(isEditingBill ? 'แก้ไขโพยสำเร็จ!' : 'บันทึกโพยสำเร็จ!')

        } catch (error) {
            console.error('Error saving bill:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    // Handle write submission from WriteSubmissionModal
    async function handleWriteSubmit({ entries, billNote: note, rawLines }) {
        if (!selectedRound || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Check if dealer is active before submitting
        if (selectedDealer) {
            const { data: dealerProfile } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', selectedDealer.id)
                .single()

            if (dealerProfile?.is_active === false) {
                throw new Error('เจ้ามือถูกระงับการใช้งาน ไม่สามารถส่งเลขได้')
            }
        }

        const billId = 'B-' + Math.random().toString(36).substring(2, 8).toUpperCase()
        const baseTimestamp = new Date()
        const lotteryKey = selectedRound.lottery_type === 'lao' || selectedRound.lottery_type === 'hanoi' ? 'lao' : selectedRound.lottery_type

        // Prepare submissions - all entries share the same bill_id and bill_note
        // Group entries by lineIndex to share entry_id and display_text
        const submissionsToInsert = entries.map((entry, index) => {
            const commInfo = getCommissionForBetType(entry.betType, userSettings)
            const commissionAmount = Math.round(entry.amount * commInfo.rate / 100)

            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            return {
                round_id: selectedRound.id,
                user_id: profile.id,
                bill_id: billId,
                bill_note: note || null,
                entry_id: entry.entryId,
                bet_type: entry.betType,
                numbers: entry.numbers,
                amount: entry.amount,
                display_numbers: entry.displayText || entry.numbers,
                display_amount: entry.displayAmount?.toString() || entry.amount.toString(),
                display_bet_type: null, // ไม่ใช้ display_bet_type แยก เพราะ display_numbers มีข้อมูลครบแล้ว
                commission_rate: commInfo.rate,
                commission_amount: commissionAmount,
                created_at: entryTimestamp
            }
        })

        // Insert to database
        const { error } = await supabase
            .from('submissions')
            .insert(submissionsToInsert)

        if (error) throw error

        // Update pending deduction for dealer credit
        const dealerIdForCredit = isOwnDealer ? user.id : selectedDealer?.id
        if (dealerIdForCredit) {
            try {
                await updatePendingDeduction(dealerIdForCredit)
            } catch (err) {
                console.log('Error updating pending deduction:', err)
            }
        }

        fetchSubmissions()
        toast.success(`บันทึกโพยสำเร็จ! (${entries.length} รายการ)`)
    }

    // Handle edit bill submission from WriteSubmissionModal
    async function handleEditBillSubmit({ entries, billNote: note, rawLines, originalBillId, originalItems }) {
        if (!selectedRound || entries.length === 0) {
            throw new Error('ไม่มีข้อมูลที่จะบันทึก')
        }

        // Delete original submissions first
        const originalIds = originalItems.map(item => item.id).filter(Boolean)
        if (originalIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .in('id', originalIds)

            if (deleteError) throw deleteError
        }

        // Insert new submissions with same bill_id
        const baseTimestamp = new Date()
        const submissionsToInsert = entries.map((entry, index) => {
            const commInfo = getCommissionForBetType(entry.betType, userSettings)
            const commissionAmount = Math.round(entry.amount * commInfo.rate / 100)

            // Add milliseconds offset to preserve order (each entry gets +1ms)
            const entryTimestamp = new Date(baseTimestamp.getTime() + index).toISOString()

            return {
                round_id: selectedRound.id,
                user_id: profile.id,
                bill_id: originalBillId,
                bill_note: note || null,
                entry_id: entry.entryId,
                bet_type: entry.betType,
                numbers: entry.numbers,
                amount: entry.amount,
                display_numbers: entry.displayText || entry.numbers,
                display_amount: entry.displayAmount?.toString() || entry.amount.toString(),
                display_bet_type: null, // ไม่ใช้ display_bet_type แยก เพราะ display_numbers มีข้อมูลครบแล้ว
                commission_rate: commInfo.rate,
                commission_amount: commissionAmount,
                created_at: entryTimestamp
            }
        })

        const { error } = await supabase
            .from('submissions')
            .insert(submissionsToInsert)

        if (error) throw error

        // Update pending deduction
        const dealerIdForCredit = isOwnDealer ? user.id : selectedDealer?.id
        if (dealerIdForCredit) {
            try {
                await updatePendingDeduction(dealerIdForCredit)
            } catch (err) {
                console.log('Error updating pending deduction:', err)
            }
        }

        // Clear editing data
        setEditingBillData(null)
        fetchSubmissions()
        toast.success(`แก้ไขโพยสำเร็จ! (${entries.length} รายการ)`)
    }

    // Toggle bill expansion
    function toggleBill(billId) {
        setExpandedBills(prev =>
            prev.includes(billId)
                ? prev.filter(id => id !== billId)
                : [...prev, billId]
        )
    }

    // Delete submission
    async function handleDelete(submission) {
        if (!confirm('ต้องการลบรายการนี้?')) return

        try {
            let query = supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })

            if (isGroupByBill && submission.entry_id) {
                query = query.eq('entry_id', submission.entry_id)
            } else if (displayMode === 'summary' && submission.entry_id) {
                query = query.eq('entry_id', submission.entry_id)
            } else {
                query = query.eq('id', submission.id)
            }

            const { error } = await query
            if (error) throw error

            // Update pending deduction for dealer's credit
            if (selectedDealer?.id) {
                updatePendingDeduction(selectedDealer.id).catch(err =>
                    console.log('Error updating pending deduction:', err)
                )
            }

            fetchSubmissions()
            toast.success('ลบรายการสำเร็จ')
        } catch (error) {
            console.error('Error deleting:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Delete entire bill (all submissions with the same bill_id)
    async function handleDeleteBill(billId) {
        if (!confirm(`ต้องการลบโพยใบที่ ${billId} ทั้งหมด?`)) return

        try {
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .eq('bill_id', billId)
                .eq('round_id', selectedRound.id)

            if (error) throw error

            // Update pending deduction for dealer's credit
            if (selectedDealer?.id) {
                updatePendingDeduction(selectedDealer.id).catch(err =>
                    console.log('Error updating pending deduction:', err)
                )
            }

            fetchSubmissions()
            toast.success(`ลบโพยใบ ${billId} สำเร็จ`)
        } catch (error) {
            console.error('Error deleting bill:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Edit bill - open WriteSubmissionModal with existing data
    function handleEditBill(billId, billItems) {
        // Sort items by created_at to maintain original order
        const sortedItems = [...billItems].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )

        // Group items by entry_id to reconstruct original lines, preserving order
        const entryGroups = new Map()
        sortedItems.forEach(item => {
            const key = item.entry_id || item.id
            if (!entryGroups.has(key)) {
                entryGroups.set(key, {
                    items: [],
                    // display_numbers stores the full original line (e.g., "584=100*6 คูณชุด")
                    originalLine: item.display_numbers || null,
                    created_at: item.created_at
                })
            }
            entryGroups.get(key).items.push(item)
        })

        // Reconstruct original lines from grouped entries (Map preserves insertion order)
        const originalLines = Array.from(entryGroups.values()).map(group => {
            const firstItem = group.items[0]

            // If we have the original line stored, use it directly
            if (group.originalLine) {
                return group.originalLine
            }

            // Fallback: reconstruct from individual fields (for old data)
            const numbers = firstItem.numbers
            const amount = firstItem.amount

            // Simple format for fallback
            return `${numbers}=${amount}`
        })

        // Set editing data and open WriteSubmissionModal
        setEditingBillData({
            billId,
            billNote: sortedItems[0]?.bill_note || '',
            originalLines,
            originalItems: sortedItems
        })
        setShowWriteModal(true)
    }

    // Open edit modal for a submission
    function handleEditSubmission(submission) {
        // Only allow editing if within delete deadline
        if (!canDelete(submission)) {
            toast.warning('ไม่สามารถแก้ไขได้ เนื่องจากเลยเวลาที่กำหนด')
            return
        }

        // Check if this is a set-based bet (4_set on Lao/Hanoi)
        const isLaoOrHanoi = selectedRound && ['lao', 'hanoi'].includes(selectedRound.lottery_type)
        const isSetBasedBet = isLaoOrHanoi && submission.bet_type === '4_set'

        // Detect special bet types by checking display_bet_type or display_amount format
        const displayBetType = submission.display_bet_type || ''
        const displayAmount = submission.display_amount || ''
        const isSpecialBetType = displayBetType.includes('เต็ง-โต๊ด') ||
            displayBetType.includes('1+กลับ') ||
            (displayAmount.includes('*') && !isSetBasedBet)

        // Check if this is a grouped entry (has entry_id and display values)
        const isGroupedEntry = submission.entry_id && submission.display_amount

        // Determine the edit bet_type based on display_bet_type
        let editBetType = submission.bet_type
        if (displayBetType.includes('เต็ง-โต๊ด')) {
            editBetType = '3_straight_tod'
        } else if (displayBetType.includes('1+กลับ')) {
            editBetType = '3_straight_perm'
        }

        // For set-based bets, convert amount back to set count for editing
        let editAmount = submission.amount?.toString() || ''
        let editNumbers = submission.numbers || ''

        if (isSetBasedBet && submission.amount) {
            const setPrice = selectedRound?.set_prices?.['4_top'] || 120
            const setCount = Math.round(submission.amount / setPrice)
            editAmount = setCount.toString()
        } else if (isGroupedEntry) {
            // For grouped entries, use display values (per-item amount, not total)
            editNumbers = submission.display_numbers || submission.numbers || ''
            editAmount = displayAmount || submission.amount?.toString() || ''
        } else if (isSpecialBetType) {
            // For special bet types, use display values
            editNumbers = submission.display_numbers || submission.numbers || ''
            editAmount = displayAmount || submission.amount?.toString() || ''
        }

        setEditingSubmission(submission)
        setEditForm({
            numbers: editNumbers,
            amount: editAmount,
            bet_type: editBetType
        })
    }

    // Save edited submission
    async function handleSaveEdit() {
        if (!editingSubmission) return

        const newNumbers = editForm.numbers.replace(/\s/g, '')
        const currentBetType = editForm.bet_type || editingSubmission.bet_type

        // Check if this is a set-based bet (4_set on Lao/Hanoi)
        const isLaoOrHanoi = selectedRound && ['lao', 'hanoi'].includes(selectedRound.lottery_type)
        const isSetBasedBet = isLaoOrHanoi && editingSubmission.bet_type === '4_set'

        // Check if this is a special bet type (เต็ง-โต๊ด, 1+กลับ)
        const isSpecialBetType = currentBetType === '3_straight_tod' || currentBetType === '3_straight_perm'

        // Check if amount contains * (split amount format)
        const hasSplitAmount = editForm.amount.includes('*')

        let newAmount
        let setCount = 1
        let displayAmount = editForm.amount

        if (isSetBasedBet) {
            // For 4 ตัวชุด on Lao/Hanoi: editForm.amount = number of sets
            setCount = parseInt(editForm.amount) || 1
            const setPrice = selectedRound?.set_prices?.['4_top'] || 120
            newAmount = setCount * setPrice
            displayAmount = `${newAmount} บาท (${setCount} ชุด)`
        } else if (hasSplitAmount) {
            // For split amount format like "100*20"
            const amountParts = editForm.amount.split('*').map(p => parseFloat(p) || 0)
            newAmount = amountParts.reduce((sum, p) => sum + p, 0)
        } else {
            newAmount = parseFloat(editForm.amount)
            displayAmount = newAmount.toString()
        }

        if (!newNumbers) {
            toast.warning('กรุณากรอกเลข')
            return
        }
        if (!newAmount || newAmount <= 0) {
            toast.warning(isSetBasedBet ? 'กรุณากรอกจำนวนชุดที่ถูกต้อง' : 'กรุณากรอกจำนวนเงินที่ถูกต้อง')
            return
        }

        setEditSaving(true)
        try {
            // If this is a special bet type with entry_id, we need to delete old entries and create new ones
            if (isSpecialBetType && editingSubmission.entry_id && hasSplitAmount) {
                // Delete all submissions with this entry_id (soft delete)
                const { error: deleteError } = await supabase
                    .from('submissions')
                    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                    .eq('entry_id', editingSubmission.entry_id)

                if (deleteError) throw deleteError

                // Create new submissions based on the updated values
                const entryId = editingSubmission.entry_id
                const billId = editingSubmission.bill_id
                const timestamp = new Date().toISOString()
                const amountParts = editForm.amount.split('*').map(p => parseFloat(p) || 0)
                const newSubmissions = []

                // Get label for display
                let displayLabel = currentBetType === '3_straight_tod' ? 'เต็ง-โต๊ด' :
                    currentBetType === '3_straight_perm' ? `1+กลับ (${getPermutations(newNumbers).length - 1})` :
                        BET_TYPES[currentBetType]?.label || currentBetType

                if (currentBetType === '3_straight_tod') {
                    // เต็ง-โต๊ด: first amount for 3_top, second for 3_tod
                    const [straightAmt, todAmt] = amountParts
                    if (straightAmt > 0) {
                        const commInfo = getCommissionForBetType('3_top', userSettings)
                        newSubmissions.push({
                            entry_id: entryId,
                            round_id: selectedRound.id,
                            user_id: editingSubmission.user_id,
                            bill_id: billId,
                            bet_type: '3_top',
                            numbers: newNumbers,
                            amount: straightAmt,
                            commission_rate: commInfo.rate,
                            commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                            display_numbers: newNumbers,
                            display_amount: editForm.amount,
                            display_bet_type: displayLabel,
                            created_at: timestamp
                        })
                    }
                    if (todAmt > 0) {
                        const commInfo = getCommissionForBetType('3_tod', userSettings)
                        const sortedNumbers = newNumbers.split('').sort().join('')
                        newSubmissions.push({
                            entry_id: entryId,
                            round_id: selectedRound.id,
                            user_id: editingSubmission.user_id,
                            bill_id: billId,
                            bet_type: '3_tod',
                            numbers: sortedNumbers,
                            amount: todAmt,
                            commission_rate: commInfo.rate,
                            commission_amount: commInfo.isFixed ? commInfo.rate : (todAmt * commInfo.rate) / 100,
                            display_numbers: newNumbers,
                            display_amount: editForm.amount,
                            display_bet_type: displayLabel,
                            created_at: timestamp
                        })
                    }
                } else if (currentBetType === '3_straight_perm') {
                    // 1+กลับ: first amount for straight 3_top, second amount for permutation 3_tops
                    const [straightAmt, permAmt] = amountParts
                    const perms = getPermutations(newNumbers).filter(p => p !== newNumbers)

                    displayLabel = `1+กลับ (${perms.length})`

                    if (straightAmt > 0) {
                        const commInfo = getCommissionForBetType('3_top', userSettings)
                        newSubmissions.push({
                            entry_id: entryId,
                            round_id: selectedRound.id,
                            user_id: editingSubmission.user_id,
                            bill_id: billId,
                            bet_type: '3_top',
                            numbers: newNumbers,
                            amount: straightAmt,
                            commission_rate: commInfo.rate,
                            commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                            display_numbers: newNumbers,
                            display_amount: editForm.amount,
                            display_bet_type: displayLabel,
                            created_at: timestamp
                        })
                    }
                    if (permAmt > 0 && perms.length > 0) {
                        const commInfo = getCommissionForBetType('3_top', userSettings)
                        perms.forEach(p => {
                            newSubmissions.push({
                                entry_id: entryId,
                                round_id: selectedRound.id,
                                user_id: editingSubmission.user_id,
                                bill_id: billId,
                                bet_type: '3_top',
                                numbers: p,
                                amount: permAmt,
                                commission_rate: commInfo.rate,
                                commission_amount: commInfo.isFixed ? commInfo.rate : (permAmt * commInfo.rate) / 100,
                                display_numbers: newNumbers,
                                display_amount: editForm.amount,
                                display_bet_type: displayLabel,
                                created_at: timestamp
                            })
                        })
                    }
                }

                // Insert new submissions
                if (newSubmissions.length > 0) {
                    const { error: insertError } = await supabase
                        .from('submissions')
                        .insert(newSubmissions)

                    if (insertError) throw insertError
                }
            } else {
                // Normal update for single submission
                const commLookupBetType = isSetBasedBet ? '4_top' : editingSubmission.bet_type
                const commInfo = getCommissionForBetType(commLookupBetType, userSettings)

                let newCommission = 0
                if (isSetBasedBet) {
                    newCommission = setCount * commInfo.rate
                } else if (commInfo.isFixed) {
                    newCommission = commInfo.rate
                } else {
                    newCommission = (newAmount * commInfo.rate) / 100
                }

                const { error } = await supabase
                    .from('submissions')
                    .update({
                        numbers: newNumbers,
                        amount: newAmount,
                        display_numbers: newNumbers,
                        display_amount: displayAmount,
                        commission_rate: commInfo.rate,
                        commission_amount: newCommission,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingSubmission.id)

                if (error) throw error
            }

            // Update pending deduction for dealer's credit
            if (selectedDealer?.id) {
                updatePendingDeduction(selectedDealer.id).catch(err =>
                    console.log('Error updating pending deduction:', err)
                )
            }

            setEditingSubmission(null)
            setEditForm({ numbers: '', amount: '', bet_type: '' })
            fetchSubmissions()
            toast.success('แก้ไขรายการสำเร็จ')
        } catch (error) {
            console.error('Error updating submission:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setEditSaving(false)
        }
    }

    // Save edited submission with new bet type (full form edit)
    async function handleSaveEditWithBetType(betType) {
        if (!editingSubmission) return

        const newNumbers = editForm.numbers.replace(/\s/g, '')
        const amount = editForm.amount.toString()

        if (!newNumbers) {
            toast.warning('กรุณากรอกเลข')
            return
        }

        // Check if amount is valid
        const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
        if (amtParts.length === 0) {
            // Allow empty amount only for 4_set
            if (betType !== '4_set') {
                toast.warning('กรุณากรอกจำนวนเงิน')
                return
            }
        }

        setEditSaving(true)
        try {
            const timestamp = new Date().toISOString()
            // Generate UUID with fallback for non-secure contexts (HTTP)
            const entryId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                    const r = Math.random() * 16 | 0
                    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
                })
            const billId = editingSubmission.bill_id
            const isLaoOrHanoi = selectedRound && ['lao', 'hanoi'].includes(selectedRound.lottery_type)

            // Delete the original submission(s) by entry_id if exists
            if (editingSubmission.entry_id) {
                await supabase
                    .from('submissions')
                    .update({ is_deleted: true, deleted_at: timestamp })
                    .eq('entry_id', editingSubmission.entry_id)
            } else {
                // Just delete the single submission
                await supabase
                    .from('submissions')
                    .update({ is_deleted: true, deleted_at: timestamp })
                    .eq('id', editingSubmission.id)
            }

            // Create new submission(s) based on bet type
            const newSubmissions = []

            // Handle special compound bet types
            if (betType === '3_straight_tod') {
                // เต็ง-โต๊ด: 100*20 format
                const [straightAmt, todAmt] = amtParts.map(p => parseFloat(p) || 0)

                if (straightAmt > 0) {
                    const commInfo = getCommissionForBetType('3_top', userSettings)
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: '3_top',
                        numbers: newNumbers,
                        amount: straightAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: 'เต็ง-โต๊ด',
                        created_at: timestamp
                    })
                }
                if (todAmt > 0) {
                    const commInfo = getCommissionForBetType('3_tod', userSettings)
                    const sortedNumbers = newNumbers.split('').sort().join('')
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: '3_tod',
                        numbers: sortedNumbers,
                        amount: todAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (todAmt * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: 'เต็ง-โต๊ด',
                        created_at: timestamp
                    })
                }
            } else if (betType === '3_straight_perm') {
                // 1+กลับ: 100*20 format
                const [straightAmt, permAmt] = amtParts.map(p => parseFloat(p) || 0)
                const perms = getPermutations(newNumbers).filter(p => p !== newNumbers)
                const displayLabel = `1+กลับ (${perms.length})`

                if (straightAmt > 0) {
                    const commInfo = getCommissionForBetType('3_top', userSettings)
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: '3_top',
                        numbers: newNumbers,
                        amount: straightAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (straightAmt * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                }
                if (permAmt > 0 && perms.length > 0) {
                    const commInfo = getCommissionForBetType('3_top', userSettings)
                    perms.forEach(p => {
                        newSubmissions.push({
                            entry_id: entryId,
                            round_id: selectedRound.id,
                            user_id: editingSubmission.user_id,
                            bill_id: billId,
                            bet_type: '3_top',
                            numbers: p,
                            amount: permAmt,
                            commission_rate: commInfo.rate,
                            commission_amount: commInfo.isFixed ? commInfo.rate : (permAmt * commInfo.rate) / 100,
                            display_numbers: newNumbers,
                            display_amount: amount,
                            display_bet_type: displayLabel,
                            created_at: timestamp
                        })
                    })
                }
            } else if (betType.includes('_rev')) {
                // Reversed 2-digit bets: 12 with 100*50 = 12 @100, 21 @50
                const [amt1, amt2] = amtParts.map(p => parseFloat(p) || 0)
                const reversed = newNumbers.split('').reverse().join('')
                const baseBetType = betType.replace('_rev', '')
                const commInfo = getCommissionForBetType(baseBetType, userSettings)
                const displayLabel = BET_TYPES[betType]?.label || `${BET_TYPES[baseBetType]?.label || baseBetType}กลับ`

                if (amt1 > 0) {
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: baseBetType,
                        numbers: newNumbers,
                        amount: amt1,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (amt1 * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                }
                if (amt2 > 0 && reversed !== newNumbers) {
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: baseBetType,
                        numbers: reversed,
                        amount: amt2,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (amt2 * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: displayLabel,
                        created_at: timestamp
                    })
                }
            } else if (betType === '4_set' && isLaoOrHanoi) {
                // 4 ตัวชุด for Lao/Hanoi
                const setCount = parseInt(amount) || 1
                const setPrice = selectedRound?.set_prices?.['4_top'] || 120
                const totalAmount = setCount * setPrice
                const commInfo = getCommissionForBetType('4_top', userSettings)

                newSubmissions.push({
                    entry_id: entryId,
                    round_id: selectedRound.id,
                    user_id: editingSubmission.user_id,
                    bill_id: billId,
                    bet_type: '4_set',
                    numbers: newNumbers,
                    amount: totalAmount,
                    commission_rate: commInfo.rate,
                    commission_amount: setCount * commInfo.rate,
                    display_numbers: newNumbers,
                    display_amount: `${totalAmount} บาท (${setCount} ชุด)`,
                    display_bet_type: BET_TYPES['4_set']?.label || '4 ตัวชุด',
                    created_at: timestamp
                })
            } else if (betType === '3_perm_from_3') {
                // คูณชุด: all permutations of 3-digit number
                const perms = [...new Set(getPermutations(newNumbers))]
                const singleAmt = parseFloat(amtParts[0]) || 0
                const commInfo = getCommissionForBetType('3_top', userSettings)

                perms.forEach(p => {
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: '3_top',
                        numbers: p,
                        amount: singleAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (singleAmt * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: `คูณชุด ${perms.length}`,
                        created_at: timestamp
                    })
                })
            } else if (betType === '3_perm_from_4' || betType === '3_perm_from_5') {
                // 3-digit permutations from 4 or 5 digit numbers
                const perms = betType === '3_perm_from_4'
                    ? getUnique3DigitPermsFrom4(newNumbers)
                    : getUnique3DigitPermsFrom5(newNumbers)
                const singleAmt = parseFloat(amtParts[0]) || 0
                const commInfo = getCommissionForBetType('3_top', userSettings)

                perms.forEach(p => {
                    newSubmissions.push({
                        entry_id: entryId,
                        round_id: selectedRound.id,
                        user_id: editingSubmission.user_id,
                        bill_id: billId,
                        bet_type: '3_top',
                        numbers: p,
                        amount: singleAmt,
                        commission_rate: commInfo.rate,
                        commission_amount: commInfo.isFixed ? commInfo.rate : (singleAmt * commInfo.rate) / 100,
                        display_numbers: newNumbers,
                        display_amount: amount,
                        display_bet_type: `3 X ${perms.length}`,
                        created_at: timestamp
                    })
                })
            } else if (betType === '4_float' || betType === '5_float') {
                // Float bets - เรียงเลขจากน้อยไปมากสำหรับ storage แต่แสดงผลตามที่ซื้อ
                const singleAmt = parseFloat(amtParts[0]) || 0
                const commInfo = getCommissionForBetType(betType, userSettings)
                const sortedNumbers = newNumbers.split('').sort().join('')

                newSubmissions.push({
                    entry_id: entryId,
                    round_id: selectedRound.id,
                    user_id: editingSubmission.user_id,
                    bill_id: billId,
                    bet_type: betType,
                    numbers: sortedNumbers,  // เก็บเลขเรียงลำดับ
                    amount: singleAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (singleAmt * commInfo.rate) / 100,
                    display_numbers: newNumbers,  // แสดงผลตามที่ซื้อ
                    display_amount: singleAmt.toString(),
                    display_bet_type: BET_TYPES[betType]?.label || betType,
                    created_at: timestamp
                })
            } else {
                // Simple single submission (2_top, 3_top, run_top, etc.)
                const singleAmt = parseFloat(amtParts[0]) || 0
                const commInfo = getCommissionForBetType(betType, userSettings)

                newSubmissions.push({
                    entry_id: entryId,
                    round_id: selectedRound.id,
                    user_id: editingSubmission.user_id,
                    bill_id: billId,
                    bet_type: betType,
                    numbers: betType === '3_tod' ? newNumbers.split('').sort().join('') : newNumbers,
                    amount: singleAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (singleAmt * commInfo.rate) / 100,
                    display_numbers: newNumbers,
                    display_amount: singleAmt.toString(),
                    display_bet_type: BET_TYPES[betType]?.label || betType,
                    created_at: timestamp
                })
            }

            // Insert all new submissions
            if (newSubmissions.length > 0) {
                const { error: insertError } = await supabase
                    .from('submissions')
                    .insert(newSubmissions)

                if (insertError) throw insertError
            }

            // Update pending deduction for dealer's credit
            if (selectedDealer?.id) {
                updatePendingDeduction(selectedDealer.id).catch(err =>
                    console.log('Error updating pending deduction:', err)
                )
            }

            setEditingSubmission(null)
            setEditForm({ numbers: '', amount: '', bet_type: '' })
            fetchSubmissions()
            toast.success('แก้ไขรายการสำเร็จ')
        } catch (error) {
            console.error('Error updating submission:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setEditSaving(false)
        }
    }

    // Format time remaining
    function formatTimeRemaining(closeTime) {
        const now = new Date()
        const close = new Date(closeTime)
        const diff = close - now

        if (diff <= 0) return 'ปิดรับแล้ว'

        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

        if (hours > 0) {
            return `เหลือ ${hours} ชม. ${minutes} นาที`
        }
        return `เหลือ ${minutes} นาที`
    }

    // Calculate totals
    const totalAmount = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)
    const totalCommission = selectedRound 
        ? submissions.reduce((sum, s) => sum + calculateCommissionAmount(s.amount || 0, s.bet_type, selectedRound), 0)
        : 0

    // Default payout rates per bet type
    const DEFAULT_PAYOUTS = {
        'run_top': 3, 'run_bottom': 4,
        'pak_top': 8, 'pak_bottom': 6,
        '2_top': 65, '2_front': 65, '2_center': 65, '2_spread': 65, '2_run': 10, '2_bottom': 65,
        '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
        '4_float': 20, '4_tod': 100, '4_set': 100, '5_float': 10, '6_top': 1000000
    }

    // Get lottery type category for settings lookup
    const getLotteryTypeKey = (lotteryType) => {
        if (lotteryType === 'thai') return 'thai'
        if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao'
        if (lotteryType === 'stock') return 'stock'
        return 'thai'
    }

    // Calculate expected payout for a submission based on user settings
    const getCalculatedPrize = (sub, round) => {
        if (!sub.is_winner) return 0

        // For 4_set (4 ตัวชุด), use prize_amount from database (FIXED amount, not multiplied)
        if (sub.bet_type === '4_set') {
            return sub.prize_amount || 0
        }

        const lotteryKey = getLotteryTypeKey(round?.lottery_type)

        // Map bet_type to settings key (Lao/Hanoi use different keys in settings)
        let settingsKey = sub.bet_type
        if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',
                '3_tod': '3_tod_single'
            }
            settingsKey = LAO_BET_TYPE_MAP[sub.bet_type] || sub.bet_type
        }

        const settings = userSettings?.lottery_settings?.[lotteryKey]?.[settingsKey]

        if (settings && settings.payout !== undefined) {
            return sub.amount * settings.payout
        }

        // Use default payout rate for this bet type
        const defaultRate = DEFAULT_PAYOUTS[sub.bet_type] || 1
        return sub.amount * defaultRate
    }

    // Default commission rates per bet type (percentage)
    const DEFAULT_COMMISSIONS = {
        'run_top': 15, 'run_bottom': 15,
        'pak_top': 15, 'pak_bottom': 15,
        '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
        '3_top': 15, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
        '4_tod': 15, '4_set': 15, '4_float': 15, '5_float': 15, '6_top': 15
    }

    // Calculate commission for a submission - use recorded commission_amount for consistency
    const getCalculatedCommission = (sub, round) => {
        // Always use commission_amount that was recorded when submission was made
        // This ensures consistency between submission time and results display
        return sub.commission_amount || 0
    }

    // Loading dealers
    if (dealersLoading) {
        return (
            <div className="user-dashboard">
                <div className="container">
                    <div className="loading-state" style={{ padding: '3rem' }}>
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                </div>
            </div>
        )
    }

    // No active dealer membership
    if (dealers.length === 0) {
        return (
            <div className="user-dashboard">
                <div className="container">
                    <div className="no-dealer-card card">
                        <FiGift className="big-icon" />
                        <h2>ยังไม่มีเจ้ามือ</h2>
                        <p>กรุณาสมัครผ่านลิงก์ของเจ้ามือเพื่อเข้าร่วมกลุ่ม หรือรอเจ้ามืออนุมัติคำขอของคุณ</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="user-dashboard">
            <div className="container">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h1><FiUser /> แดชบอร์ดสมาชิก</h1>
                        <p>ส่งเลขหวยให้เจ้ามือของคุณ</p>
                    </div>
                </div>

                {/* Scan QR Button - Full width on mobile */}
                <button
                    className="scan-qr-btn"
                    onClick={() => setShowScannerModal(true)}
                >
                    <FiGrid size={20} /> สแกน QR
                </button>

                {/* Create own dealer button - above dealer selector */}
                {profile?.role !== 'dealer' && (
                    <div className="create-dealer-section">
                        <button
                            className="create-dealer-btn-standalone"
                            onClick={handleSwitchToDealerDashboard}
                        >
                            <FiPlus />
                            <span>เป็นเจ้ามือเอง</span>
                        </button>
                    </div>
                )}

                {/* Dealer Selector Pills */}
                <div className="dealer-selector-bar">
                    {/* Existing dealers */}
                    {dealers.map(dealer => (
                        <button
                            key={dealer.id}
                            className={`dealer-pill ${selectedDealer?.id === dealer.id ? 'active' : ''}`}
                            onClick={() => {
                                // Only reset if switching to a different dealer
                                if (selectedDealer?.id !== dealer.id) {
                                    setSelectedDealer(dealer)
                                    setSelectedRound(null) // Reset round selection
                                    setRounds([])
                                    setIsOwnDealer(dealer.id === user.id)
                                }
                                // Always switch to rounds tab when clicking dealer pill
                                setActiveTab('rounds')
                            }}
                        >
                            <div className="dealer-info-row">
                                <span className="dealer-label">เจ้ามือ</span>
                                <span className="dealer-name">{dealer.full_name || dealer.email}</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Tabs */}
                <div className="user-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'rounds' ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab('rounds')
                            // Always fetch rounds to get latest data when clicking this tab
                            if (selectedDealer) {
                                fetchRounds()
                            }
                        }}
                    >
                        <FiCalendar /> งวดที่เปิด
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`}
                        onClick={() => setActiveTab('results')}
                    >
                        <FiAward /> ผลรางวัล
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('history'); fetchUserHistory(); }}
                    >
                        <FiClock /> ประวัติ
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'dealer' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dealer')}
                    >
                        <FiUser /> เจ้ามือ
                    </button>
                </div>

                <div className="dashboard-content">
                    {activeTab === 'rounds' && (
                        <div className="rounds-accordion">
                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : rounds.length === 0 ? (
                                <div className="empty-state card">
                                    <FiCalendar className="empty-icon" />
                                    <p>ไม่มีงวดที่เปิดรับ</p>
                                </div>
                            ) : (
                                rounds.map(round => {
                                    const isExpanded = selectedRound?.id === round.id;
                                    return (
                                        <div key={round.id} className={`round-accordion-item ${round.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
                                            <div
                                                className={`round-accordion-header card clickable ${isExpanded ? 'expanded-header' : ''}`}
                                                onClick={() => setSelectedRound(isExpanded ? null : round)}
                                            >
                                                <div className="user-round-layout">
                                                    {/* Row 1: Logo, Name, Status */}
                                                    <div className="user-round-header-row">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {LOTTERY_TYPES[round.lottery_type]}
                                                        </span>
                                                        <span className="round-name">{round.lottery_name}</span>
                                                        {round.status === 'open' ? (
                                                            <div className="time-remaining">
                                                                {formatTimeRemaining(round.close_time)}
                                                            </div>
                                                        ) : (
                                                            <span className="round-status closed">ปิดรับแล้ว</span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Row 2: Date/Time */}
                                                    <div className="user-round-datetime">
                                                        <FiCalendar /> {new Date(round.open_time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(round.open_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - {new Date(round.close_time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(round.close_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    
                                                    {/* Row 3: Write button (left) + Chevron (right) */}
                                                    <div className="user-round-actions-row">
                                                        <div className="round-actions">
                                                            {canSubmit() && (
                                                                <button
                                                                    className="btn btn-write-poy btn-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowWriteModal(true)
                                                                    }}
                                                                >
                                                                    <FiEdit /> เขียนโพย
                                                                </button>
                                                            )}
                                                        </div>
                                                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                    </div>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="round-accordion-content">
                                                    {/* Submissions Summary */}
                                                    <div className="submissions-summary">
                                                        <div className="summary-card">
                                                            <span className="summary-value">{submissions.length}</span>
                                                            <span className="summary-label">รายการ</span>
                                                        </div>
                                                        <div className="summary-card">
                                                            <span className="summary-value">
                                                                {round.currency_symbol}{totalAmount.toLocaleString()}
                                                            </span>
                                                            <span className="summary-label">ยอดรวม</span>
                                                        </div>
                                                        <div className="summary-card highlight">
                                                            <span className="summary-value">
                                                                {round.currency_symbol}{totalCommission.toLocaleString()}
                                                            </span>
                                                            <span className="summary-label">ค่าคอม</span>
                                                        </div>
                                                    </div>
                                                    {/* Search Bar and Filter */}
                                                    <div className="search-bar-container">
                                                        <div className="search-input-wrapper">
                                                            <FiSearch className="search-icon" />
                                                            <input
                                                                type="text"
                                                                className="search-input"
                                                                placeholder="ค้นหาเลข, ใบโพย..."
                                                                value={searchQuery}
                                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                            />
                                                            {searchQuery && (
                                                                <button
                                                                    className="search-clear-btn"
                                                                    onClick={() => setSearchQuery('')}
                                                                >
                                                                    <FiX />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <select
                                                            className="filter-select"
                                                            value={filterBetType}
                                                            onChange={(e) => setFilterBetType(e.target.value)}
                                                        >
                                                            <option value="">ทุกประเภท</option>
                                                            {Object.entries(BET_TYPES).map(([key, { label }]) => (
                                                                <option key={key} value={key}>{label}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            className="icon-btn"
                                                            onClick={() => fetchSubmissions(selectedRound.id)}
                                                            title="รีเฟรชรายการ"
                                                        >
                                                            <FiRefreshCw />
                                                        </button>
                                                    </div>

                                                    <div className="submissions-list card">
                                                        <div className="list-header">
                                                            <h3>รายการที่ส่ง</h3>
                                                        </div>
                                                        <div className="list-header-actions">
                                                            <span className="toggle-label">จัดกลุ่ม</span>
                                                            <button
                                                                className={`toggle-btn group-toggle ${isGroupByBill ? 'active' : ''}`}
                                                                onClick={() => setIsGroupByBill(!isGroupByBill)}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                                                            >
                                                                <FiLayers /> <span>แยกใบโพย</span>
                                                            </button>

                                                            {/* Sort toggle buttons - different for grouped vs non-grouped */}
                                                            {isGroupByBill ? (
                                                                <>
                                                                    {/* Bill sort by time */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        gap: '2px',
                                                                        background: 'var(--color-surface)',
                                                                        borderRadius: '8px',
                                                                        padding: '3px',
                                                                        marginLeft: '0.5rem'
                                                                    }}>
                                                                        <button
                                                                            onClick={() => setBillSortOrder(billSortOrder === 'desc' ? 'asc' : 'desc')}
                                                                            style={{
                                                                                padding: '0.35rem 0.5rem',
                                                                                borderRadius: '6px',
                                                                                border: 'none',
                                                                                background: 'var(--color-primary)',
                                                                                color: '#000',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: '500',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s ease'
                                                                            }}
                                                                            title="เรียงใบโพยตามเวลา"
                                                                        >
                                                                            เวลา {billSortOrder === 'desc' ? '↓' : '↑'}
                                                                        </button>
                                                                    </div>
                                                                    {/* Item sort inside bills - 2 toggle buttons */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        gap: '2px',
                                                                        background: 'var(--color-surface)',
                                                                        borderRadius: '8px',
                                                                        padding: '3px',
                                                                        marginLeft: '0.25rem'
                                                                    }}>
                                                                        <button
                                                                            onClick={() => setItemSortMode(itemSortMode === 'asc' ? 'desc' : 'asc')}
                                                                            style={{
                                                                                padding: '0.35rem 0.4rem',
                                                                                borderRadius: '6px',
                                                                                border: 'none',
                                                                                background: (itemSortMode === 'asc' || itemSortMode === 'desc') ? 'var(--color-primary)' : 'transparent',
                                                                                color: (itemSortMode === 'asc' || itemSortMode === 'desc') ? '#000' : 'var(--color-text-muted)',
                                                                                fontSize: '0.7rem',
                                                                                fontWeight: '500',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s ease'
                                                                            }}
                                                                            title={itemSortMode === 'asc' ? 'เรียงเลขน้อยไปมาก' : 'เรียงเลขมากไปน้อย'}
                                                                        >
                                                                            เลข {(itemSortMode === 'asc' || itemSortMode === 'desc') ? (itemSortMode === 'asc' ? '↑' : '↓') : ''}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setItemSortMode(itemSortMode === 'original' ? 'original_rev' : 'original')}
                                                                            style={{
                                                                                padding: '0.35rem 0.4rem',
                                                                                borderRadius: '6px',
                                                                                border: 'none',
                                                                                background: (itemSortMode === 'original' || itemSortMode === 'original_rev') ? 'var(--color-primary)' : 'transparent',
                                                                                color: (itemSortMode === 'original' || itemSortMode === 'original_rev') ? '#000' : 'var(--color-text-muted)',
                                                                                fontSize: '0.7rem',
                                                                                fontWeight: '500',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s ease'
                                                                            }}
                                                                            title={itemSortMode === 'original' ? 'เรียงตามที่ป้อน (บนลงล่าง)' : 'เรียงตามที่ป้อน (ล่างขึ้นบน)'}
                                                                        >
                                                                            ป้อน {(itemSortMode === 'original' || itemSortMode === 'original_rev') ? (itemSortMode === 'original' ? '↓' : '↑') : ''}
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    gap: '2px',
                                                                    background: 'var(--color-surface)',
                                                                    borderRadius: '8px',
                                                                    padding: '3px',
                                                                    marginLeft: '0.5rem'
                                                                }}>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (listSortBy === 'time') {
                                                                                setListSortOrder(listSortOrder === 'desc' ? 'asc' : 'desc')
                                                                            } else {
                                                                                setListSortBy('time')
                                                                                setListSortOrder('desc')
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            padding: '0.35rem 0.5rem',
                                                                            borderRadius: '6px',
                                                                            border: 'none',
                                                                            background: listSortBy === 'time' ? 'var(--color-primary)' : 'transparent',
                                                                            color: listSortBy === 'time' ? '#000' : 'var(--color-text-muted)',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '500',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s ease'
                                                                        }}
                                                                        title="เรียงตามเวลา"
                                                                    >
                                                                        เวลา {listSortBy === 'time' && (listSortOrder === 'desc' ? '↓' : '↑')}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (listSortBy === 'number') {
                                                                                setListSortOrder(listSortOrder === 'asc' ? 'desc' : 'asc')
                                                                            } else {
                                                                                setListSortBy('number')
                                                                                setListSortOrder('asc')
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            padding: '0.35rem 0.5rem',
                                                                            borderRadius: '6px',
                                                                            border: 'none',
                                                                            background: listSortBy === 'number' ? 'var(--color-primary)' : 'transparent',
                                                                            color: listSortBy === 'number' ? '#000' : 'var(--color-text-muted)',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '500',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s ease'
                                                                        }}
                                                                        title="เรียงตามเลข"
                                                                    >
                                                                        เลข {listSortBy === 'number' && (listSortOrder === 'asc' ? '↑' : '↓')}
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {submissions.length > 0 && (
                                                                <button
                                                                    className="bill-copy-btn"
                                                                    onClick={async () => {
                                                                        const text = formatCopyText({
                                                                            submissions,
                                                                            round,
                                                                            userName: profile?.full_name || profile?.email || '-'
                                                                        })
                                                                        await copyToClipboard(text)
                                                                        toast.success('คัดลอกแล้ว!')
                                                                    }}
                                                                    title="คัดลอกทั้งหมด"
                                                                >
                                                                    <FiCopy />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {submissions.length === 0 ? (
                                                            <div className="empty-state">
                                                                <FiList className="empty-icon" />
                                                                <p>ยังไม่มีรายการ</p>
                                                            </div>
                                                        ) : (
                                                            <div className="submissions-table-wrap">
                                                                {(() => {
                                                                    // Filter submissions based on search query and bet type
                                                                    const filterSubmissions = (items) => {
                                                                        let filtered = items

                                                                        // Filter by bet type
                                                                        if (filterBetType) {
                                                                            filtered = filtered.filter(sub => sub.bet_type === filterBetType)
                                                                        }

                                                                        // Filter by search query
                                                                        if (searchQuery.trim()) {
                                                                            const query = searchQuery.toLowerCase().trim()
                                                                            filtered = filtered.filter(sub => {
                                                                                if (sub.numbers?.toLowerCase().includes(query)) return true
                                                                                if (sub.display_numbers?.toLowerCase().includes(query)) return true
                                                                                if (sub.bill_id?.toLowerCase().includes(query)) return true
                                                                                if (sub.bill_note?.toLowerCase().includes(query)) return true
                                                                                return false
                                                                            })
                                                                        }

                                                                        return filtered
                                                                    }
                                                                    const filteredSubs = filterSubmissions(submissions)

                                                                    // Helper to process items based on displayMode
                                                                    const processItems = (items) => {
                                                                        if (displayMode === 'detailed') return items
                                                                        // Sort by created_at first to ensure correct grouping order
                                                                        const sortedItems = [...items].sort((a, b) =>
                                                                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                        )
                                                                        return sortedItems.reduce((acc, sub) => {
                                                                            const subCommission = calculateCommissionAmount(sub.amount || 0, sub.bet_type, round)
                                                                            if (sub.entry_id) {
                                                                                const existing = acc.find(a => a.entry_id === sub.entry_id)
                                                                                if (existing) {
                                                                                    existing.amount += sub.amount
                                                                                    existing._calc_commission = (existing._calc_commission || 0) + subCommission
                                                                                    return acc
                                                                                }
                                                                                const clone = { ...sub }
                                                                                clone._calc_commission = subCommission
                                                                                acc.push(clone)
                                                                            } else {
                                                                                const clone = { ...sub }
                                                                                clone._calc_commission = subCommission
                                                                                acc.push(clone)
                                                                            }
                                                                            return acc
                                                                        }, [])
                                                                    }

                                                                    if (isGroupByBill) {
                                                                        const bills = filteredSubs.reduce((acc, sub) => {
                                                                            const billId = sub.bill_id || 'no-bill'
                                                                            if (!acc[billId]) acc[billId] = []
                                                                            acc[billId].push(sub)
                                                                            return acc
                                                                        }, {})

                                                                        // Sort bills by time only
                                                                        const sortedBillEntries = Object.entries(bills).sort((a, b) => {
                                                                            const timeA = new Date(a[1][0].created_at).getTime()
                                                                            const timeB = new Date(b[1][0].created_at).getTime()
                                                                            return billSortOrder === 'desc' ? timeB - timeA : timeA - timeB
                                                                        })

                                                                        return (
                                                                            <div className="bill-view-container">
                                                                                {sortedBillEntries.map(([billId, billItems]) => {
                                                                                    const billTotal = billItems.reduce((sum, item) => sum + item.amount, 0)
                                                                                    const billCommission = billItems.reduce((sum, item) => sum + calculateCommissionAmount(item.amount || 0, item.bet_type, round), 0)
                                                                                    const billTime = new Date(billItems[0].created_at).toLocaleTimeString('th-TH', {
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit'
                                                                                    })
                                                                                    const billDate = new Date(billItems[0].created_at).toLocaleDateString('th-TH', {
                                                                                        day: 'numeric',
                                                                                        month: 'short'
                                                                                    })
                                                                                    const isExpandedBill = expandedBills.includes(billId)
                                                                                    const processedBillItems = processItems(billItems)

                                                                                    // Count unique entry_ids for actual line count (not expanded count)
                                                                                    const uniqueEntryIds = new Set(billItems.map(item => item.entry_id).filter(Boolean))
                                                                                    const actualLineCount = uniqueEntryIds.size > 0 ? uniqueEntryIds.size : processedBillItems.length

                                                                                    // Sort items inside bill based on itemSortMode
                                                                                    const sortedBillItems = (() => {
                                                                                        if (itemSortMode === 'original') {
                                                                                            // Sort by created_at ascending (oldest first)
                                                                                            return [...processedBillItems].sort((a, b) =>
                                                                                                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                                            )
                                                                                        } else if (itemSortMode === 'original_rev') {
                                                                                            // Sort by created_at descending (newest first)
                                                                                            return [...processedBillItems].sort((a, b) =>
                                                                                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                                                                            )
                                                                                        } else {
                                                                                            // asc or desc - sort by number
                                                                                            return [...processedBillItems].sort((a, b) => {
                                                                                                const numA = (displayMode === 'summary' ? (a.display_numbers || a.numbers) : a.numbers) || ''
                                                                                                const numB = (displayMode === 'summary' ? (b.display_numbers || b.numbers) : b.numbers) || ''
                                                                                                const comparison = numA.localeCompare(numB, undefined, { numeric: true })
                                                                                                return itemSortMode === 'asc' ? comparison : -comparison
                                                                                            })
                                                                                        }
                                                                                    })()
                                                                                    const isDealerSubmitted = billItems[0]?.submitted_by_type === 'dealer'

                                                                                    // Copy bill function
                                                                                    const handleCopyBill = async (e) => {
                                                                                        e.stopPropagation()
                                                                                        const text = formatCopyText({
                                                                                            submissions: processedBillItems,
                                                                                            round,
                                                                                            userName: profile?.full_name || profile?.email || '-',
                                                                                            billName: billItems[0]?.bill_note || billId
                                                                                        })
                                                                                        await copyToClipboard(text)
                                                                                        toast.success('คัดลอกแล้ว!')
                                                                                    }

                                                                                    return (
                                                                                        <div key={billId} className={`bill-card-new ${isExpandedBill ? 'expanded' : ''} ${isDealerSubmitted ? 'dealer-submitted' : ''}`}>
                                                                                            {/* Bill Header */}
                                                                                            <div
                                                                                                className="bill-card-header"
                                                                                                onClick={() => toggleBill(billId)}
                                                                                            >
                                                                                                <div className="bill-header-left">
                                                                                                    <div className="bill-header-info">
                                                                                                        <span className="bill-name">
                                                                                                            {billItems[0]?.bill_note || (billId === 'no-bill' ? '-' : billId)}
                                                                                                        </span>
                                                                                                        <span className="bill-meta">
                                                                                                            {billDate} {billTime}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="bill-header-right">
                                                                                                    <div className="bill-header-commission" style={{ textAlign: 'right', marginRight: '1rem' }}>
                                                                                                        <span style={{ color: 'var(--color-warning)', fontWeight: '600' }}>
                                                                                                            {round.currency_symbol}{billCommission.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                                                        </span>
                                                                                                        <span className="bill-count" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                                            ค่าคอม
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <div className="bill-header-total">
                                                                                                        <span className="bill-total-amount">
                                                                                                            {round.currency_symbol}{billTotal.toLocaleString()}
                                                                                                        </span>
                                                                                                        <span className="bill-count">
                                                                                                            {actualLineCount} รายการ
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <button
                                                                                                        className="bill-copy-btn"
                                                                                                        onClick={handleCopyBill}
                                                                                                        title="คัดลอก"
                                                                                                    >
                                                                                                        <FiCopy />
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* Bill Items - Collapsible */}
                                                                                            {isExpandedBill && (
                                                                                                <div className="bill-items-list" style={{ borderTop: '1.5px solid rgba(128, 128, 128, 0.35)' }}>
                                                                                                    {sortedBillItems.map(sub => (
                                                                                                        <div
                                                                                                            key={sub.id || sub.entry_id}
                                                                                                            className={`bill-item-row ${canDelete(sub) ? 'editable' : ''}`}
                                                                                                            onClick={() => handleEditSubmission(sub)}
                                                                                                        >
                                                                                                            {displayMode === 'summary' && sub.display_numbers ? (
                                                                                                                <>
                                                                                                                    <span className="bill-display-text">
                                                                                                                        {sub.display_numbers}
                                                                                                                    </span>
                                                                                                                    <span className="bill-item-commission" style={{ color: 'var(--color-warning)', fontSize: '0.8rem', minWidth: '55px', textAlign: 'right', marginRight: '0.75rem' }}>
                                                                                                                        {round.currency_symbol}{(sub._calc_commission ?? calculateCommissionAmount(sub.amount || 0, sub.bet_type, round)).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                                                                    </span>
                                                                                                                    <span className="bill-item-amount" style={{ minWidth: '55px', textAlign: 'right' }}>
                                                                                                                        {round.currency_symbol}{sub.display_amount || sub.amount?.toLocaleString()}
                                                                                                                    </span>
                                                                                                                </>
                                                                                                            ) : (
                                                                                                                <>
                                                                                                                    <div className="bill-item-left">
                                                                                                                        <span className="bill-bet-type">
                                                                                                                            {BET_TYPES[sub.bet_type]?.label}
                                                                                                                        </span>
                                                                                                                        <span className="bill-number">
                                                                                                                            {sub.numbers}
                                                                                                                        </span>
                                                                                                                    </div>
                                                                                                                    <span className="bill-item-commission" style={{ color: 'var(--color-warning)', fontSize: '0.8rem', minWidth: '55px', textAlign: 'right', marginRight: '0.75rem' }}>
                                                                                                                        {round.currency_symbol}{calculateCommissionAmount(sub.amount || 0, sub.bet_type, round).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                                                                    </span>
                                                                                                                    <span className="bill-item-amount" style={{ minWidth: '55px', textAlign: 'right' }}>
                                                                                                                        {round.currency_symbol}{sub.amount?.toLocaleString()}
                                                                                                                    </span>
                                                                                                                </>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}

                                                                                            {/* Bill Actions - For editing/deleting */}
                                                                                            {isExpandedBill && canSubmit() && billId !== 'no-bill' && (
                                                                                                <div className="bill-card-actions">
                                                                                                    <button
                                                                                                        className="bill-action-btn edit"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation()
                                                                                                            handleEditBill(billId, billItems)
                                                                                                        }}
                                                                                                        title="แก้ไขโพย"
                                                                                                    >
                                                                                                        <FiEdit2 /> แก้ไข
                                                                                                    </button>
                                                                                                    <button
                                                                                                        className="bill-action-btn delete"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation()
                                                                                                            handleDeleteBill(billId)
                                                                                                        }}
                                                                                                        title="ลบโพยทั้งหมด"
                                                                                                    >
                                                                                                        <FiTrash2 /> ลบ
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )
                                                                                })}
                                                                            </div>
                                                                        )
                                                                    } else {
                                                                        // Single table view - sort based on listSortBy and listSortOrder
                                                                        const processedItems = processItems(filteredSubs)
                                                                        const displayItems = [...processedItems].sort((a, b) => {
                                                                            if (listSortBy === 'time') {
                                                                                const timeA = new Date(a.created_at).getTime()
                                                                                const timeB = new Date(b.created_at).getTime()
                                                                                return listSortOrder === 'desc' ? timeB - timeA : timeA - timeB
                                                                            } else if (listSortBy === 'number') {
                                                                                const numA = (displayMode === 'summary' ? (a.display_numbers || a.numbers) : a.numbers) || ''
                                                                                const numB = (displayMode === 'summary' ? (b.display_numbers || b.numbers) : b.numbers) || ''
                                                                                const comparison = numA.localeCompare(numB, undefined, { numeric: true })
                                                                                return listSortOrder === 'asc' ? comparison : -comparison
                                                                            }
                                                                            return 0
                                                                        })
                                                                        return (
                                                                            <table className="submissions-table">
                                                                                <thead>
                                                                                    <tr>
                                                                                        <th>เลข</th>
                                                                                        <th>จำนวน</th>
                                                                                        <th>ค่าคอม</th>
                                                                                        <th>เวลา</th>
                                                                                        <th></th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {displayItems.map(sub => (
                                                                                        <tr
                                                                                            key={sub.id || sub.entry_id}
                                                                                            className={`${sub.is_winner ? 'winner' : ''} clickable-row ${canDelete(sub) ? 'editable' : ''}`}
                                                                                            onClick={() => handleEditSubmission(sub)}
                                                                                        >
                                                                                            <td className="number-cell">
                                                                                                <div className="number-display">
                                                                                                    <span className="main-number">
                                                                                                        {displayMode === 'summary' ? (sub.display_numbers || sub.numbers) : sub.numbers}
                                                                                                    </span>
                                                                                                    <span className="sub-type">
                                                                                                        {displayMode === 'summary'
                                                                                                            ? (sub.display_bet_type && sub.display_bet_type !== sub.display_numbers
                                                                                                                ? sub.display_bet_type
                                                                                                                : BET_TYPES[sub.bet_type]?.label)
                                                                                                            : BET_TYPES[sub.bet_type]?.label}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td>{round.currency_symbol}{displayMode === 'summary'
                                                                                                ? (typeof sub.display_amount === 'string' ? sub.display_amount : sub.amount?.toLocaleString())
                                                                                                : sub.amount?.toLocaleString()}</td>
                                                                                            <td className="commission-cell" style={{ color: 'var(--color-warning)' }}>
                                                                                                {round.currency_symbol}{(sub._calc_commission ?? calculateCommissionAmount(sub.amount || 0, sub.bet_type, round)).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                                            </td>
                                                                                            <td className="time-cell">
                                                                                                {new Date(sub.created_at).toLocaleTimeString('th-TH', {
                                                                                                    hour: '2-digit',
                                                                                                    minute: '2-digit'
                                                                                                })}
                                                                                            </td>
                                                                                            <td>
                                                                                                {canDelete(sub) && (
                                                                                                    <button
                                                                                                        className="icon-btn danger"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation()
                                                                                                            handleDelete(sub)
                                                                                                        }}
                                                                                                        title="ลบ"
                                                                                                    >
                                                                                                        <FiTrash2 />
                                                                                                    </button>
                                                                                                )}
                                                                                                {sub.is_winner && (
                                                                                                    <span className="winner-badge">
                                                                                                        <FiCheck /> ถูก!
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        )
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'results' && (
                        <div className="rounds-accordion">
                            {resultsLoading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : resultsRounds.length === 0 ? (
                                <div className="empty-state card">
                                    <FiAward className="empty-icon" />
                                    <p>ยังไม่มีผลรางวัล</p>
                                </div>
                            ) : (
                                resultsRounds.map(round => {
                                    const isExpanded = selectedResultRound?.id === round.id

                                    // Get pre-fetched summary from resultsSummaries
                                    const summary = resultsSummaries[round.id] || {}
                                    const hasSummary = Object.keys(summary).length > 0

                                    // Calculate summary for expanded round using ALL submissions (not filtered)
                                    const totalPrize = allResultSubmissions.reduce((sum, s) => {
                                        if (s.is_winner) return sum + getCalculatedPrize(s, round)
                                        return sum
                                    }, 0)
                                    const winningCount = allResultSubmissions.filter(s => s.is_winner).length

                                    // Calculate total amount and commission from ALL submissions
                                    const resultTotalAmount = allResultSubmissions.reduce((sum, s) => sum + (s.amount || 0), 0)
                                    // Calculate commission using user settings per bet_type and lottery_type
                                    const resultTotalCommission = allResultSubmissions.reduce((sum, s) => sum + getCalculatedCommission(s, round), 0)
                                    // Net result = Commission + Prize - Total Amount (positive = profit, negative = loss)
                                    const netResult = resultTotalCommission + totalPrize - resultTotalAmount

                                    // Group by bill for display
                                    const billGroups = resultSubmissions.reduce((acc, sub) => {
                                        const billId = sub.bill_id || 'no-bill'
                                        if (!acc[billId]) acc[billId] = []
                                        acc[billId].push(sub)
                                        return acc
                                    }, {})

                                    // Parse winning numbers for display
                                    const winningNumbers = round.winning_numbers || {}

                                    return (
                                        <div key={round.id} className={`round-accordion-item ${round.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
                                            <div
                                                className={`round-accordion-header card clickable ${isExpanded ? 'expanded-header' : ''}`}
                                                onClick={() => setSelectedResultRound(isExpanded ? null : round)}
                                            >
                                                <div className="user-round-layout">
                                                    {/* Row 1: Logo, Name, Status */}
                                                    <div className="user-round-header-row">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {LOTTERY_TYPES[round.lottery_type]}
                                                        </span>
                                                        <span className="round-name">{round.lottery_name || getLotteryTypeName(round.lottery_type)}</span>
                                                        <span className="status-badge announced">
                                                            <FiCheck /> ประกาศผลแล้ว
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Row 2: Date/Time */}
                                                    <div className="user-round-datetime">
                                                        <FiCalendar /> {new Date(round.open_time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(round.open_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - {new Date(round.close_time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(round.close_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    
                                                    {/* Row 3: Refresh button (left) + Chevron (right) */}
                                                    <div className="user-round-actions-row">
                                                        <div className="round-actions">
                                                            <button
                                                                className="btn btn-icon btn-sm"
                                                                onClick={async (e) => {
                                                                    e.stopPropagation()
                                                                    await fetchResultsRounds()
                                                                    if (isExpanded) {
                                                                        const { data } = await supabase
                                                                            .from('submissions')
                                                                            .select('*')
                                                                            .eq('round_id', round.id)
                                                                            .eq('is_deleted', false)
                                                                            .order('created_at', { ascending: false })
                                                                        if (data) {
                                                                            setAllResultSubmissions(data)
                                                                            if (resultViewMode === 'winners') {
                                                                                setResultSubmissions(data.filter(s => s.is_winner))
                                                                            } else {
                                                                                setResultSubmissions(data)
                                                                            }
                                                                        }
                                                                    }
                                                                }}
                                                                title="รีเฟรช"
                                                            >
                                                                <FiRefreshCw size={14} />
                                                            </button>
                                                        </div>
                                                        <FiChevronDown className={isExpanded ? 'rotated' : ''} />
                                                    </div>
                                                    {/* Summary in Header */}
                                                    {hasSummary && (
                                                        <div className="header-summary results-header-summary">
                                                            <span className="summary-item">
                                                                <span className="label">ยอดส่งรวม</span>
                                                                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                                                    -{round.currency_symbol || '฿'}{Math.abs(summary.totalAmount || 0).toLocaleString()}
                                                                </span>
                                                            </span>
                                                            <span className="summary-item">
                                                                <span className="label">ค่าคอม</span>
                                                                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                                    +{round.currency_symbol || '฿'}{Math.abs(summary.totalCommission || 0).toLocaleString()}
                                                                </span>
                                                            </span>
                                                            <span className="summary-item">
                                                                <span className="label">รางวัลที่ได้</span>
                                                                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                                    +{round.currency_symbol || '฿'}{Math.abs(summary.totalPrize || 0).toLocaleString()}
                                                                </span>
                                                            </span>
                                                            <span className={`summary-item profit ${(summary.netResult || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                                <span className="label">ผลกำไร/ขาดทุน</span>
                                                                <span style={{ fontWeight: 700 }}>
                                                                    {(summary.netResult || 0) >= 0 ? '+' : '-'}{round.currency_symbol || '฿'}{Math.abs(summary.netResult || 0).toLocaleString()}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="round-accordion-content">
                                                    {/* Winning Numbers Display - same style as Dealer Dashboard */}
                                                    {Object.keys(winningNumbers).length > 0 && (
                                                        <div style={{
                                                            background: 'var(--color-surface)',
                                                            border: '2px solid var(--color-primary)',
                                                            borderRadius: 'var(--radius-lg)',
                                                            padding: '1rem 1.25rem',
                                                            marginBottom: '1rem'
                                                        }}>
                                                            <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                                                                🏆 ผลรางวัล
                                                            </h4>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                                                {(() => {
                                                                    const isLaoHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                    const isThai = round.lottery_type === 'thai'
                                                                    const displayOrder = isLaoHanoi
                                                                        ? ['4_set', '3_top', '2_top', '2_bottom']
                                                                        : isThai
                                                                            ? ['6_top', '3_bottom', '2_bottom']
                                                                            : ['6_top', '3_top', '2_bottom', '3_bottom']

                                                                    const betTypeLabels = {
                                                                        '6_top': 'รางวัลที่ 1',
                                                                        '4_set': 'เลขชุด 4 ตัว',
                                                                        '3_top': '3 ตัวบน',
                                                                        '3_bottom': '3 ตัวล่าง',
                                                                        '2_top': '2 ตัวบน',
                                                                        '2_bottom': '2 ตัวล่าง',
                                                                        'run_top': 'วิ่งบน',
                                                                        'run_bottom': 'วิ่งล่าง'
                                                                    }

                                                                    return displayOrder.map(betType => {
                                                                        const number = winningNumbers[betType]
                                                                        if (!number) return null
                                                                        const label = betTypeLabels[betType] || betType
                                                                        const displayNumber = Array.isArray(number) ? number.join(', ') : number
                                                                        const isMain = ['6_top', '4_set', 'first_prize'].includes(betType)

                                                                        return (
                                                                            <div key={betType} style={{ textAlign: 'center' }}>
                                                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
                                                                                <div style={{
                                                                                    fontSize: isMain ? '1.5rem' : '1.25rem',
                                                                                    fontWeight: isMain ? 700 : 600,
                                                                                    color: isMain ? 'var(--color-primary)' : 'var(--color-text)',
                                                                                    fontFamily: 'monospace',
                                                                                    letterSpacing: '0.1em'
                                                                                }}>{displayNumber}</div>
                                                                            </div>
                                                                        )
                                                                    })
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Summary Cards - use same data as header for consistency */}
                                                    {hasSummary && (
                                                        <div className="submissions-summary results-summary">
                                                            <div className="summary-card">
                                                                <span className="summary-value" style={{ color: 'var(--color-danger)' }}>
                                                                    -{round.currency_symbol || '฿'}{Math.abs(summary.totalAmount || 0).toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">ยอดส่งรวม</span>
                                                            </div>
                                                            <div className="summary-card">
                                                                <span className="summary-value" style={{ color: 'var(--color-success)' }}>
                                                                    +{round.currency_symbol || '฿'}{Math.abs(summary.totalCommission || 0).toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">ค่าคอม</span>
                                                            </div>
                                                            <div className="summary-card">
                                                                <span className="summary-value" style={{ color: 'var(--color-success)' }}>
                                                                    +{round.currency_symbol || '฿'}{Math.abs(summary.totalPrize || 0).toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">รางวัลที่ได้</span>
                                                            </div>
                                                            <div className={`summary-card ${(summary.netResult || 0) >= 0 ? 'profit' : 'loss'}`}>
                                                                <span className="summary-value" style={{ color: (summary.netResult || 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                                                    {(summary.netResult || 0) >= 0 ? '+' : '-'}{round.currency_symbol || '฿'}{Math.abs(summary.netResult || 0).toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">ผลกำไร/ขาดทุน</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* View Mode Toggle */}
                                                    <div className="view-toggle-container">
                                                        <div className="view-toggle">
                                                            <button
                                                                className={`toggle-btn ${resultViewMode === 'all' ? 'active' : ''}`}
                                                                onClick={() => setResultViewMode('all')}
                                                            >
                                                                ทั้งหมด
                                                            </button>
                                                            <button
                                                                className={`toggle-btn ${resultViewMode === 'winners' ? 'active' : ''}`}
                                                                onClick={() => setResultViewMode('winners')}
                                                            >
                                                                ถูกรางวัล
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Item Count */}
                                                    <div className="result-item-count">
                                                        {resultSubmissions.length} รายการ
                                                    </div>

                                                    {/* Items List */}
                                                    {resultSubmissions.length === 0 ? (
                                                        <div className="empty-state card" style={{ padding: '2rem' }}>
                                                            <p>{resultViewMode === 'all' ? 'ไม่มีรายการที่ส่งในงวดนี้' : 'ไม่มีรายการที่ถูกรางวัลในงวดนี้'}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="result-winners-list">
                                                            {Object.entries(billGroups).map(([billId, items]) => {
                                                                const billTotal = items.reduce((sum, s) => sum + (s.is_winner ? getCalculatedPrize(s, round) : 0), 0)
                                                                const billAmount = items.reduce((sum, s) => sum + (s.amount || 0), 0)
                                                                const billNote = items[0]?.bill_note
                                                                const billCreatedAt = items[0]?.created_at
                                                                const isResultBillExpanded = expandedBills.includes(`result-${billId}`)

                                                                // For 'all' mode: collapsible bills, default collapsed
                                                                // For 'winners' mode: always show items with note and time
                                                                if (resultViewMode === 'all') {
                                                                    return (
                                                                        <div key={billId} className={`result-bill-group card ${isResultBillExpanded ? 'expanded' : ''}`}>
                                                                            <div
                                                                                className="result-bill-header clickable"
                                                                                onClick={() => toggleBill(`result-${billId}`)}
                                                                                style={{ cursor: 'pointer' }}
                                                                            >
                                                                                <div className="bill-header-left">
                                                                                    <span className="bill-label">
                                                                                        <FiGift /> โพย {billId === 'no-bill' ? '-' : billId.slice(-6).toUpperCase()}
                                                                                    </span>
                                                                                    <span className="bill-item-count" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                                                                        ({items.length} รายการ)
                                                                                    </span>
                                                                                </div>
                                                                                <div className="bill-header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                    <span className="bill-amount" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                                                        {round.currency_symbol || '฿'}{billAmount.toLocaleString()}
                                                                                    </span>
                                                                                    <span style={{ marginLeft: '0.5rem' }}>
                                                                                        {isResultBillExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            {/* Note, Prize, and Time on same line */}
                                                                            <div className="bill-info-row" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', borderTop: '1.5px solid rgba(128, 128, 128, 0.3)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                                {billNote && (
                                                                                    <span style={{ display: 'flex', alignItems: 'center' }}>
                                                                                        <FiFileText style={{ marginRight: '0.25rem' }} />
                                                                                        {billNote}
                                                                                    </span>
                                                                                )}
                                                                                {billTotal > 0 && (
                                                                                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                                                                                        +{round.currency_symbol || '฿'}{billTotal.toLocaleString()}
                                                                                    </span>
                                                                                )}
                                                                                {billCreatedAt && (
                                                                                    <span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                                                                                        <FiClock style={{ marginRight: '0.25rem' }} />
                                                                                        {new Date(billCreatedAt).toLocaleString('th-TH', {
                                                                                            day: 'numeric',
                                                                                            month: 'short',
                                                                                            hour: '2-digit',
                                                                                            minute: '2-digit'
                                                                                        })}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {isResultBillExpanded && (
                                                                                <div className="result-bill-items">
                                                                                    {items.map(sub => (
                                                                                        <div key={sub.id} className={`result-item ${sub.is_winner ? 'winner' : ''}`}>
                                                                                            <div className="result-number">
                                                                                                <span className="number-value">{sub.numbers}</span>
                                                                                                <span className="bet-type">{BET_TYPES[sub.bet_type]?.label || sub.bet_type}</span>
                                                                                            </div>
                                                                                            <div className="result-amounts">
                                                                                                <span className="bet-amount">{round.currency_symbol || '฿'}{sub.amount}</span>
                                                                                                <span className="arrow">→</span>
                                                                                                <span className={`prize-amount ${sub.is_winner ? 'winner' : ''}`}>
                                                                                                    {round.currency_symbol || '฿'}{(sub.is_winner ? getCalculatedPrize(sub, round) : 0).toLocaleString()}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                } else {
                                                                    // Winners mode: show items with note and time
                                                                    return (
                                                                        <div key={billId} className="result-bill-group card">
                                                                            <div className="result-bill-header">
                                                                                <div className="bill-header-left">
                                                                                    <span className="bill-label">
                                                                                        <FiGift /> โพย {billId === 'no-bill' ? '-' : billId.slice(-6).toUpperCase()}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="bill-prize" style={{ color: 'var(--success)', fontWeight: 600 }}>
                                                                                    +{round.currency_symbol || '฿'}{billTotal.toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                            {billNote && (
                                                                                <div className="bill-note-display" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', borderTop: '1.5px solid rgba(128, 128, 128, 0.3)' }}>
                                                                                    <FiFileText style={{ marginRight: '0.5rem' }} />
                                                                                    {billNote}
                                                                                </div>
                                                                            )}
                                                                            {billCreatedAt && (
                                                                                <div className="bill-time-display" style={{ padding: '0.25rem 1rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                                    <FiClock style={{ marginRight: '0.5rem' }} />
                                                                                    {new Date(billCreatedAt).toLocaleString('th-TH', {
                                                                                        day: 'numeric',
                                                                                        month: 'short',
                                                                                        year: 'numeric',
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit'
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                            <div className="result-bill-items">
                                                                                {items.map(sub => (
                                                                                    <div key={sub.id} className="result-item winner">
                                                                                        <div className="result-number">
                                                                                            <span className="number-value">{sub.numbers}</span>
                                                                                            <span className="bet-type">{BET_TYPES[sub.bet_type]?.label || sub.bet_type}</span>
                                                                                        </div>
                                                                                        <div className="result-amounts">
                                                                                            <span className="bet-amount">{round.currency_symbol || '฿'}{sub.amount}</span>
                                                                                            <span className="arrow">→</span>
                                                                                            <span className="prize-amount winner">{round.currency_symbol || '฿'}{getCalculatedPrize(sub, round).toLocaleString()}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                }
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="history-tab-content">
                            {historyLoading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : userHistory.length === 0 ? (
                                <div className="empty-state card">
                                    <FiClock className="empty-icon" />
                                    <h3>ไม่มีประวัติ</h3>
                                    <p>ประวัติจะแสดงเมื่อเจ้ามือลบงวดหวยที่คุณส่งเลข</p>
                                </div>
                            ) : (
                                <div className="history-list">
                                    {userHistory.map(item => (
                                        <div key={item.id} className="card" style={{ marginBottom: '0.75rem', padding: '1rem' }}>
                                            <div className="user-round-layout">
                                                {/* Row 1: Logo, Name */}
                                                <div className="user-round-header-row">
                                                    <span className={`lottery-badge ${item.lottery_type}`}>
                                                        {LOTTERY_TYPES[item.lottery_type] || item.lottery_type}
                                                    </span>
                                                    <span className="round-name">{item.lottery_name || LOTTERY_TYPES[item.lottery_type]}</span>
                                                </div>
                                                
                                                {/* Row 2: Date/Time */}
                                                <div className="user-round-datetime">
                                                    <FiCalendar /> {new Date(item.open_time || item.round_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(item.open_time || item.round_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - {new Date(item.close_time || item.round_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(item.close_time || item.round_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                
                                                {/* Summary Stats */}
                                                <div className="header-summary results-header-summary" style={{ marginTop: '0.5rem' }}>
                                                    <span className="summary-item">
                                                        <span className="label">ยอดส่ง</span>
                                                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                                            -฿{Math.abs(item.total_amount || 0).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <span className="summary-item">
                                                        <span className="label">ค่าคอม</span>
                                                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                            +฿{Math.abs(item.total_commission || 0).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <span className="summary-item">
                                                        <span className="label">รางวัล</span>
                                                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                            +฿{Math.abs(item.total_winnings || 0).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <span className={`summary-item profit ${(item.profit_loss || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                        <span className="label">กำไร/ขาดทุน</span>
                                                        <span style={{ fontWeight: 700 }}>
                                                            {(item.profit_loss || 0) >= 0 ? '+' : '-'}฿{Math.abs(item.profit_loss || 0).toLocaleString()}
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'dealer' && selectedDealer && (
                        <DealerInfoTab dealer={selectedDealer} userSettings={userSettings} isOwnDealer={isOwnDealer} />
                    )}
                </div>
            </div>

            {/* Confirm Become Dealer Modal */}
            {showDealerConfirmModal && (
                <div className="modal-overlay" onClick={() => setShowDealerConfirmModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3><FiUser /> ยืนยันการเป็นเจ้ามือ</h3>
                            <button className="modal-close" onClick={() => setShowDealerConfirmModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
                            <h4 style={{ marginBottom: '1rem', color: 'var(--color-text)' }}>คุณต้องการเป็นเจ้ามือเองหรือไม่?</h4>
                            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                เมื่อยืนยันแล้ว คุณจะสามารถรับเลขจากสมาชิกได้<br />
                                และสามารถส่งต่อเลขให้เจ้ามือส่งออกได้
                            </p>
                            <div style={{
                                background: 'rgba(212, 175, 55, 0.1)',
                                border: '1px solid rgba(212, 175, 55, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem',
                                marginTop: '1rem'
                            }}>
                                <strong style={{ color: 'var(--color-primary)' }}>หมายเหตุ:</strong>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0' }}>
                                    เจ้ามือที่คุณเป็นสมาชิกอยู่จะถูกย้ายไปแสดงใน "เจ้ามือส่งออก"
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={() => setShowDealerConfirmModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={confirmBecomeDealear}>
                                <FiCheck /> ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Submission Modal - Full Form like Add */}
            {editingSubmission && (
                <div className="modal-overlay" onClick={() => setEditingSubmission(null)}>
                    <div className="modal edit-modal edit-modal-full" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><FiEdit2 /> แก้ไขรายการ</h3>
                            <button className="modal-close" onClick={() => setEditingSubmission(null)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Number and Amount Inputs - Same Row */}
                            <div className="edit-form-row">
                                <div className="form-group edit-number-group">
                                    <label className="form-label">ตัวเลข</label>
                                    <input
                                        type="text"
                                        className="form-input number-input"
                                        inputMode="numeric"
                                        value={editForm.numbers}
                                        onChange={e => setEditForm({
                                            ...editForm,
                                            numbers: e.target.value.replace(/[^0-9]/g, '')
                                        })}
                                        autoFocus
                                        placeholder="เลข"
                                    />
                                </div>

                                <div className="form-group edit-amount-group">
                                    <label className="form-label">
                                        จำนวนเงิน
                                        <span className="amount-hint"> (*แยก)</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        inputMode="text"
                                        value={editForm.amount}
                                        onChange={e => setEditForm({
                                            ...editForm,
                                            amount: e.target.value.replace(/[^0-9*]/g, '')
                                        })}
                                        placeholder="100*20"
                                    />
                                </div>
                            </div>

                            {/* Bet Type Buttons - Dynamic based on digit count */}
                            <div className="form-group">
                                <label className="form-label">เลือกประเภทเพื่อบันทึก</label>
                                <div className="bet-type-grid">
                                    {(() => {
                                        const digits = editForm.numbers.replace(/\*/g, '').length
                                        const amount = editForm.amount.toString()
                                        const hasStarInAmount = amount.includes('*')
                                        const lotteryType = selectedRound?.lottery_type
                                        const isAmountEmpty = !amount || amount === '0' || amount === ''

                                        // Check if amount is incomplete (ends with * but no second number)
                                        const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
                                        const isIncompleteAmount = amount.includes('*') && amtParts.length < 2

                                        let available = []

                                        // For Lao/Hanoi 4-digit, allow 4_set even without amount
                                        const isLaoOrHanoi4Digit = digits === 4 && ['lao', 'hanoi'].includes(lotteryType)

                                        if ((isAmountEmpty || isIncompleteAmount) && !isLaoOrHanoi4Digit) {
                                            available = []
                                        } else if (digits === 1) {
                                            available = ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1']
                                        } else if (digits === 2) {
                                            const hasTwoAmounts = amtParts.length === 2
                                            if (hasTwoAmounts) {
                                                available = ['2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev']
                                            } else if (amtParts.length === 1 && !amount.includes('*')) {
                                                available = ['2_top', '2_front', '2_spread', '2_have', '2_bottom']
                                            }
                                        } else if (digits === 3) {
                                            if (hasStarInAmount && amtParts.length === 2) {
                                                const permCount = getPermutations(editForm.numbers).length
                                                available = [
                                                    { id: '3_straight_tod', label: 'เต็ง-โต๊ด' },
                                                    { id: '3_straight_perm', label: `1+กลับ (${permCount - 1})` }
                                                ]
                                            } else if (!hasStarInAmount) {
                                                const permCount = getPermutations(editForm.numbers).length
                                                available = [
                                                    '3_top',
                                                    '3_tod',
                                                    { id: '3_perm_from_3', label: `คูณชุด ${permCount}` }
                                                ]
                                                if (lotteryType === 'thai') available.push('3_bottom')
                                            }
                                        } else if (digits === 4) {
                                            const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
                                            if (isLaoOrHanoi) {
                                                if (isAmountEmpty) {
                                                    available = ['4_set']
                                                } else {
                                                    const permCount = getUnique3DigitPermsFrom4(editForm.numbers).length
                                                    available = [
                                                        '4_set',
                                                        '4_float',
                                                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            } else {
                                                if (!isAmountEmpty) {
                                                    const permCount = getUnique3DigitPermsFrom4(editForm.numbers).length
                                                    available = [
                                                        '4_float',
                                                        { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            }
                                        } else if (digits === 5) {
                                            if (!isAmountEmpty) {
                                                const permCount = getUnique3DigitPermsFrom5(editForm.numbers).length
                                                available = [
                                                    '5_float',
                                                    { id: '3_perm_from_5', label: `3 X ${permCount}` }
                                                ]
                                            }
                                        }

                                        if (available.length === 0) {
                                            return (
                                                <div className="empty-bet-types">
                                                    {digits === 0 ? 'กรุณากรอกเลข' :
                                                        isAmountEmpty ? 'กรุณากรอกจำนวนเงิน' :
                                                            isIncompleteAmount ? 'กรุณากรอกจำนวนเงินให้ครบ (เช่น 100*20)' :
                                                                'ไม่มีประเภทเลขสำหรับจำนวนหลักนี้'}
                                                </div>
                                            )
                                        }

                                        return available.map(item => {
                                            const key = typeof item === 'string' ? item : item.id
                                            const label = typeof item === 'string' ? (BET_TYPES[key]?.label || key) : item.label
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    className="bet-type-btn"
                                                    disabled={editSaving}
                                                    onClick={() => handleSaveEditWithBetType(key)}
                                                >
                                                    {label}
                                                </button>
                                            )
                                        })
                                    })()}
                                </div>
                            </div>

                            {/* Cancel Button */}
                            <div className="form-actions">
                                <button
                                    className="btn btn-secondary btn-block"
                                    onClick={() => setEditingSubmission(null)}
                                >
                                    ยกเลิก
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Write Submission Modal */}
            <WriteSubmissionModal
                isOpen={showWriteModal}
                onClose={() => {
                    setShowWriteModal(false)
                    setEditingBillData(null)
                }}
                onSubmit={handleWriteSubmit}
                roundInfo={selectedRound ? { name: selectedRound.name } : null}
                currencySymbol={selectedRound?.currency_symbol || '฿'}
                editingData={editingBillData}
                onEditSubmit={handleEditBillSubmit}
                lotteryType={selectedRound?.lottery_type}
                setPrice={userSettings?.lottery_settings?.[selectedRound?.lottery_type]?.['4_set']?.setPrice || selectedRound?.set_prices?.['4_top'] || 120}
            />

            {/* QR Scanner Modal */}
            {showScannerModal && (
                <UserQRScannerModal
                    onClose={() => setShowScannerModal(false)}
                    onScanSuccess={(result) => {
                        setShowScannerModal(false)
                        // Handle QR code result - redirect to dealer connect or register page
                        if (result.includes('/register?ref=') || result.includes('/dealer-connect?ref=')) {
                            window.location.href = result
                        } else if (result.includes('dealer_id=')) {
                            // Extract dealer_id and redirect to dealer connect
                            const url = new URL(result, window.location.origin)
                            const dealerId = url.searchParams.get('dealer_id')
                            if (dealerId) {
                                window.location.href = `/dealer-connect?ref=${dealerId}`
                            } else {
                                toast.error('QR Code ไม่ถูกต้อง')
                            }
                        } else {
                            // Try to use the result as dealer ID directly
                            window.location.href = `/dealer-connect?ref=${result}`
                        }
                    }}
                    toast={toast}
                />
            )}
        </div>
    )
}

