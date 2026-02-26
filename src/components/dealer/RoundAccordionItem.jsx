import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { updatePendingDeduction } from '../../utils/creditCheck'
import {
    FiCalendar,
    FiClock,
    FiEdit2,
    FiTrash2,
    FiCheck,
    FiCheckCircle,
    FiX,
    FiAlertTriangle,
    FiAlertCircle,
    FiEye,
    FiLock,
    FiSend,
    FiRotateCcw,
    FiSearch,
    FiCopy,
    FiFileText,
    FiRefreshCw,
    FiChevronRight
} from 'react-icons/fi'
import {
    LOTTERY_TYPES,
    BET_TYPES,
    BET_TYPES_BY_LOTTERY,
    DEFAULT_COMMISSIONS,
    DEFAULT_PAYOUTS,
    normalizeNumber,
    generateBatchId,
    getDefaultLimitsForType,
    getLotteryTypeKey
} from '../../constants/lotteryTypes'
import DealerWriteSubmissionWrapper from './DealerWriteSubmissionWrapper'

export default function RoundAccordionItem({ 
    round, 
    isSelected, 
    onSelect, 
    onShowSubmissions, 
    onCloseRound, 
    onEditRound, 
    onShowNumberLimits, 
    onDeleteRound, 
    onShowResults, 
    getStatusBadge, 
    formatDate, 
    formatTime, 
    user,
    allMembers = [], // All members of the dealer
    onCreditUpdate, // Callback to refresh dealer credit after bet submission
    isExpanded: isExpandedProp, // Controlled expanded state from parent
    onToggle // Callback to toggle expanded state
}) {
    const { toast } = useToast()
    // Use controlled state if provided, otherwise use internal state
    const [internalExpanded, setInternalExpanded] = useState(false)
    const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded
    const setIsExpanded = onToggle || setInternalExpanded
    const [summaryData, setSummaryData] = useState({ loading: false, submissions: [], userSettings: {} })

    // Inline submissions view states
    const [viewMode, setViewMode] = useState('summary')
    const [inlineTab, setInlineTab] = useState('total')
    // Tab for closed rounds: 'submissions' or 'results'
    const [closedRoundTab, setClosedRoundTab] = useState('submissions')
    const [inlineSubmissions, setInlineSubmissions] = useState([])
    const [inlineTypeLimits, setInlineTypeLimits] = useState({})
    const [inlineNumberLimits, setInlineNumberLimits] = useState([])
    const [inlineTransfers, setInlineTransfers] = useState([])
    const [inlineTransferCommissions, setInlineTransferCommissions] = useState({}) // { dealerId: { totalCommission, ... } }
    const [inlineIncomingCommissions, setInlineIncomingCommissions] = useState({}) // { dealerEmail: { totalCommission, ... } }
    const [inlineLoading, setInlineLoading] = useState(false)
    const [inlineUserFilter, setInlineUserFilter] = useState('all')
    const [inlineBetTypeFilter, setInlineBetTypeFilter] = useState('all')
    const [inlineSearch, setInlineSearch] = useState('')
    // Member filter: 'all' = all members, 'submitted' = only members who submitted
    const [memberFilterMode, setMemberFilterMode] = useState('all')
    // Total tab view mode: 'all' = ทั้งหมด (รวมเลข), 'bills' = แยกใบโพย
    const [totalViewMode, setTotalViewMode] = useState('bills')
    // Display mode for submissions: 'summary' = ย่อ, 'detailed' = เต็มไม่รวม, 'grouped' = เต็มรวมเลข
    const [displayMode, setDisplayMode] = useState('grouped')
    // Display mode for bills tab: 'summary' = ย่อ (group by entry_id), 'detailed' = เต็ม (show all items)
    const [billDisplayMode, setBillDisplayMode] = useState('summary')
    // Sort order for bills by time: 'asc' or 'desc'
    const [billSortOrder, setBillSortOrder] = useState('desc')
    // Sort mode for items inside bills: 'asc', 'desc', 'original'
    const [itemSortMode, setItemSortMode] = useState('original')
    // Sort for "รวม" view: 'time' or 'number'
    const [allViewSortBy, setAllViewSortBy] = useState('time')
    const [allViewSortOrder, setAllViewSortOrder] = useState('desc')
    // Selected items for bulk delete
    const [selectedItems, setSelectedItems] = useState({})
    const [deletingItems, setDeletingItems] = useState(false)
    // Expanded bills for collapsible view
    const [expandedBills, setExpandedBills] = useState([])
    // Expanded user groups for collapsible view
    const [expandedUserGroups, setExpandedUserGroups] = useState([])

    // Write bet on behalf of user states
    const [showWriteBetModal, setShowWriteBetModal] = useState(false)
    const [selectedMemberForBet, setSelectedMemberForBet] = useState(null)
    const [editingBillData, setEditingBillData] = useState(null)

    // Inline excess transfer states
    const [selectedExcessItems, setSelectedExcessItems] = useState({})
    const [showTransferModal, setShowTransferModal] = useState(false)
    const [transferForm, setTransferForm] = useState({ target_dealer_name: '', target_dealer_contact: '', notes: '' })
    const [savingTransfer, setSavingTransfer] = useState(false)
    
    // Upstream dealers for transfer selection
    const [upstreamDealers, setUpstreamDealers] = useState([])
    const [selectedUpstreamDealer, setSelectedUpstreamDealer] = useState(null) // null = manual, object = linked
    const [upstreamRoundStatus, setUpstreamRoundStatus] = useState(null) // null = not checked, 'checking', 'available', 'unavailable'

    // Inline revert transfer states
    const [selectedTransferBatches, setSelectedTransferBatches] = useState({})
    const [revertingTransfer, setRevertingTransfer] = useState(false)
    
    // Incoming transfer return states (for receiving dealer)
    const [selectedIncomingItems, setSelectedIncomingItems] = useState({})
    const [returningIncoming, setReturningIncoming] = useState(false)

    // Summary tab for results: 'incoming' = รับเข้า, 'outgoing' = ตีออก
    const [summaryTab, setSummaryTab] = useState('incoming')
    // Upstream summaries data (for outgoing tab)
    const [upstreamSummaries, setUpstreamSummaries] = useState({ loading: false, dealers: [] })

    const isAnnounced = round.status === 'announced' && round.is_result_announced
    const isClosed = round.status === 'closed' || (round.status !== 'announced' && new Date() > new Date(round.close_time))

    const isOpen = (() => {
        if (round.status === 'announced' || round.status === 'closed') return false
        const now = new Date()
        const closeTime = new Date(round.close_time)
        return now <= closeTime
    })()

    // Fetch summary data on mount for all rounds (announced, open, or closed)
    useEffect(() => {
        console.log('Mount useEffect:', { isAnnounced, isOpen, isClosed, roundId: round.id, status: round.status, is_result_announced: round.is_result_announced })
        // Always fetch summary data to show stats in header
        fetchSummaryData()
    }, [round.id])

    // Fetch upstream dealers on mount
    useEffect(() => {
        if (user?.id) {
            fetchUpstreamDealers()
        }
    }, [user?.id])

    // Fetch upstream summaries for closed/announced rounds (needed for header stats and outgoing tab)
    useEffect(() => {
        if ((isClosed || isAnnounced) && upstreamSummaries.dealers.length === 0 && !upstreamSummaries.loading) {
            fetchUpstreamSummaries()
        }
    }, [isClosed, isAnnounced])

    async function fetchUpstreamDealers() {
        try {
            // Fetch from dealer_upstream_connections (เจ้ามือตีออก tab)
            const { data: manualData, error: manualError } = await supabase
                .from('dealer_upstream_connections')
                .select(`
                    *,
                    upstream_profile:upstream_dealer_id (id, full_name, email, phone)
                `)
                .eq('dealer_id', user.id)
                .eq('is_blocked', false)
                .order('is_linked', { ascending: false })
                .order('upstream_name', { ascending: true })

            // Also fetch dealers that user was a member of (for users who became dealers before the fix)
            // Only include dealers with role='dealer' (not superadmin)
            const { data: membershipData, error: membershipError } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    dealer_id,
                    status,
                    profiles:dealer_id (id, full_name, email, phone, role)
                `)
                .eq('user_id', user.id)
                .eq('status', 'active')
                .neq('dealer_id', user.id)

            let allDealers = []
            
            if (!manualError && manualData) {
                allDealers = [...manualData]
            }
            
            // Add dealers from memberships (only role='dealer')
            if (!membershipError && membershipData) {
                const membershipDealers = membershipData
                    .filter(m => m.profiles?.id && m.profiles?.role === 'dealer')
                    .map(m => ({
                        id: `membership-${m.dealer_id}`,
                        dealer_id: user.id,
                        upstream_dealer_id: m.dealer_id,
                        upstream_name: m.profiles?.full_name || m.profiles?.email || 'ไม่ระบุชื่อ',
                        upstream_contact: m.profiles?.phone || m.profiles?.email || '',
                        upstream_profile: m.profiles,
                        is_linked: true,
                        is_from_membership: true
                    }))
                
                // Merge, avoiding duplicates
                const existingIds = allDealers.map(d => d.upstream_dealer_id).filter(Boolean)
                const newDealers = membershipDealers.filter(d => !existingIds.includes(d.upstream_dealer_id))
                allDealers = [...allDealers, ...newDealers]
            }
            
            setUpstreamDealers(allDealers)
        } catch (error) {
            console.error('Error fetching upstream dealers:', error)
        }
    }

    // Handle selecting upstream dealer
    async function handleSelectUpstreamDealer(dealer) {
        setSelectedUpstreamDealer(dealer)
        setUpstreamRoundStatus(null)
        
        if (dealer) {
            setTransferForm(prev => ({
                ...prev,
                target_dealer_name: dealer.upstream_name,
                target_dealer_contact: dealer.upstream_contact || ''
            }))
            
            // Check if linked dealer has an active round for same lottery type
            if (dealer.is_linked && dealer.upstream_dealer_id) {
                setUpstreamRoundStatus('checking')
                try {
                    const { data: upstreamRounds, error } = await supabase
                        .from('lottery_rounds')
                        .select('id, round_date, close_time, status, lottery_type')
                        .eq('dealer_id', dealer.upstream_dealer_id)
                        .eq('lottery_type', round.lottery_type)
                        .in('status', ['open', 'active'])
                    
                    // Filter for rounds that haven't closed yet
                    const openRounds = upstreamRounds?.filter(r => 
                        new Date(r.close_time) >= new Date()
                    )
                    
                    if (!error && openRounds && openRounds.length > 0) {
                        setUpstreamRoundStatus('available')
                    } else {
                        setUpstreamRoundStatus('unavailable')
                    }
                } catch (err) {
                    console.error('Error checking upstream round:', err)
                    setUpstreamRoundStatus('unavailable')
                }
            }
        } else {
            setTransferForm(prev => ({
                ...prev,
                target_dealer_name: '',
                target_dealer_contact: ''
            }))
        }
    }

    async function fetchSummaryData() {
        console.log('fetchSummaryData called for round:', round.id, 'isAnnounced:', isAnnounced)
        setSummaryData(prev => ({ ...prev, loading: true }))
        try {
            const { data: submissionsData, error: submissionsError } = await supabase
                .from('submissions')
                .select('*, profiles:user_id(id, full_name, email)')
                .eq('round_id', round.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
            
            console.log('fetchSummaryData submissions:', submissionsData?.length, 'error:', submissionsError)

            const userIds = [...new Set((submissionsData || []).map(s => s.user_id))]
            const settingsMap = {}

            if (userIds.length > 0 && user?.id) {
                // Fetch settings for regular members (where we are the dealer)
                const { data: settingsData } = await supabase
                    .from('user_settings')
                    .select('*')
                    .in('user_id', userIds)
                    .eq('dealer_id', user.id)

                if (settingsData) {
                    settingsData.forEach(s => { settingsMap[s.user_id] = s })
                }

                // For transfer submissions, the user_id is the downstream dealer who sent bets to us
                // We need to fetch settings where they are the member and we are the dealer
                // This gets the commission rates that WE set for THEM
                const transferUserIds = [...new Set(
                    (submissionsData || [])
                        .filter(s => s.source === 'transfer')
                        .map(s => s.user_id)
                )]

                if (transferUserIds.length > 0) {
                    // Fetch settings where transfer user is member and we are dealer
                    const { data: transferSettingsData } = await supabase
                        .from('user_settings')
                        .select('*')
                        .in('user_id', transferUserIds)
                        .eq('dealer_id', user.id)

                    if (transferSettingsData) {
                        // Map by user_id (the downstream dealer who sent us bets)
                        transferSettingsData.forEach(s => {
                            if (!settingsMap[s.user_id]) {
                                settingsMap[s.user_id] = s
                            }
                        })
                    }
                }
            }

            setSummaryData({ submissions: submissionsData || [], userSettings: settingsMap, loading: false })
        } catch (error) {
            console.error('Error fetching summary:', error)
            setSummaryData(prev => ({ ...prev, loading: false }))
        }
    }

    // Fetch summaries from upstream dealers we transferred bets to
    async function fetchUpstreamSummaries() {
        setUpstreamSummaries(prev => ({ ...prev, loading: true }))
        try {
            // Get all transfers from this round that were sent to linked upstream dealers
            const { data: transfers, error: transferError } = await supabase
                .from('bet_transfers')
                .select('*')
                .eq('round_id', round.id)
                .not('upstream_dealer_id', 'is', null)
                .eq('is_linked', true)
            
            if (transferError) throw transferError
            if (!transfers || transfers.length === 0) {
                setUpstreamSummaries({ loading: false, dealers: [] })
                return
            }

            // Group transfers by upstream dealer
            const dealerTransfers = {}
            transfers.forEach(t => {
                if (!dealerTransfers[t.upstream_dealer_id]) {
                    dealerTransfers[t.upstream_dealer_id] = {
                        dealerId: t.upstream_dealer_id,
                        dealerName: t.target_dealer_name || 'ไม่ระบุชื่อ',
                        dealerContact: t.target_dealer_contact || '',
                        targetRoundId: t.target_round_id,
                        transfers: [],
                        totalBet: 0,
                        totalWin: 0,
                        totalCommission: 0,
                        winCount: 0,
                        ticketCount: 0
                    }
                }
                dealerTransfers[t.upstream_dealer_id].transfers.push(t)
                dealerTransfers[t.upstream_dealer_id].totalBet += t.amount || 0
                dealerTransfers[t.upstream_dealer_id].ticketCount++
            })

            // For each upstream dealer, fetch their round's submissions that match our transfers
            const dealerIds = Object.keys(dealerTransfers)
            for (const dealerId of dealerIds) {
                const dealer = dealerTransfers[dealerId]
                if (!dealer.targetRoundId) continue

                // Fetch the upstream round to check if announced
                const { data: upstreamRound } = await supabase
                    .from('lottery_rounds')
                    .select('id, status, is_result_announced, winning_numbers, currency_symbol')
                    .eq('id', dealer.targetRoundId)
                    .single()

                dealer.upstreamRound = upstreamRound
                dealer.isAnnounced = upstreamRound?.status === 'announced' && upstreamRound?.is_result_announced
                dealer.currencySymbol = upstreamRound?.currency_symbol || round.currency_symbol

                // Always calculate commission for transfers (not just when announced)
                // Fetch user_settings for commission calculation
                // Commission we receive = settings that upstream dealer set for us
                // This is stored as: user_id = our profile id, dealer_id = upstream dealer's profile id
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('dealer_id', dealerId)
                    .maybeSingle()

                const lotteryKey = getLotteryTypeKey(round.lottery_type)
                
                // Helper to get settings key for bet type
                const getBetSettingsKey = (betType, lKey) => {
                    if (lKey === 'lao' || lKey === 'hanoi') {
                        const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                        return LAO_MAP[betType] || betType
                    }
                    return betType
                }

                // Calculate commission for each transfer
                dealer.transfers.forEach(t => {
                    const settingsKey = getBetSettingsKey(t.bet_type, lotteryKey)
                    const betSettings = settings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                    const commissionRate = betSettings?.commission !== undefined 
                        ? betSettings.commission 
                        : (DEFAULT_COMMISSIONS[t.bet_type] || 15)
                    const commissionAmount = (t.amount || 0) * (commissionRate / 100)
                    dealer.totalCommission += commissionAmount
                })

                // Only fetch win data if announced
                if (dealer.isAnnounced) {
                    // Fetch submissions from the upstream round that match our target_submission_ids
                    const targetSubmissionIds = dealer.transfers
                        .map(t => t.target_submission_id)
                        .filter(Boolean)

                    if (targetSubmissionIds.length > 0) {
                        const { data: upstreamSubs } = await supabase
                            .from('submissions')
                            .select('*')
                            .in('id', targetSubmissionIds)
                            .eq('is_deleted', false)

                        if (upstreamSubs) {
                            upstreamSubs.forEach(sub => {
                                if (sub.is_winner) {
                                    dealer.winCount++
                                    dealer.totalWin += sub.prize_amount || 0
                                }
                            })
                        }
                    }
                }
            }

            setUpstreamSummaries({ loading: false, dealers: Object.values(dealerTransfers) })
        } catch (error) {
            console.error('Error fetching upstream summaries:', error)
            setUpstreamSummaries({ loading: false, dealers: [] })
        }
    }

    async function fetchInlineSubmissions(forceRefresh = false) {
        // Skip if already have data and not forcing refresh
        if (!forceRefresh && inlineSubmissions.length > 0 && !inlineLoading) return
        setInlineLoading(true)
        
        // Timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            console.warn('fetchInlineSubmissions timeout')
            setInlineLoading(false)
        }, 10000)
        
        try {
            const [subsResult, typeLimitsResult, numLimitsResult, transfersResult] = await Promise.all([
                supabase
                    .from('submissions')
                    .select(`*, profiles:user_id (full_name, email)`)
                    .eq('round_id', round.id)
                    .eq('is_deleted', false)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('type_limits')
                    .select('*')
                    .eq('round_id', round.id),
                supabase
                    .from('number_limits')
                    .select('*')
                    .eq('round_id', round.id),
                supabase
                    .from('bet_transfers')
                    .select('*')
                    .eq('round_id', round.id)
                    .order('created_at', { ascending: false })
            ])
            
            clearTimeout(timeoutId)
            
            console.log('Fetched submissions:', subsResult.data, 'Error:', subsResult.error)
            setInlineSubmissions(subsResult.data || [])

            const defaultLimits = getDefaultLimitsForType(round.lottery_type)
            const limitsObj = { ...defaultLimits }
            typeLimitsResult.data?.forEach(l => { limitsObj[l.bet_type] = l.max_per_number })
            setInlineTypeLimits(limitsObj)

            setInlineNumberLimits(numLimitsResult.data || [])
            setInlineTransfers(transfersResult.data || [])
            
            // Calculate commissions for transfers
            if (transfersResult.data && transfersResult.data.length > 0) {
                calculateInlineTransferCommissions(transfersResult.data)
            }
            
            // Calculate commissions for incoming transfers (submissions with source='transfer')
            const incomingTransfers = subsResult.data?.filter(s => s.source === 'transfer') || []
            if (incomingTransfers.length > 0) {
                calculateInlineIncomingCommissions(incomingTransfers)
            }
        } catch (error) {
            clearTimeout(timeoutId)
            console.error('Error fetching inline submissions:', error)
        } finally {
            setInlineLoading(false)
        }
    }

    // Calculate commissions for inline transfers
    async function calculateInlineTransferCommissions(transfersData) {
        if (!user?.id || !transfersData || transfersData.length === 0) return

        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        
        // Helper to get settings key for bet type
        const getBetSettingsKey = (betType, lKey) => {
            if (lKey === 'lao' || lKey === 'hanoi') {
                const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                return LAO_MAP[betType] || betType
            }
            return betType
        }

        // Group transfers by upstream_dealer_id
        const dealerTransfers = {}
        transfersData.forEach(t => {
            const dealerId = t.upstream_dealer_id
            if (!dealerId) return
            if (!dealerTransfers[dealerId]) {
                dealerTransfers[dealerId] = []
            }
            dealerTransfers[dealerId].push(t)
        })

        const commissions = {}

        // For each upstream dealer, fetch their settings and calculate commission
        for (const dealerId of Object.keys(dealerTransfers)) {
            // Fetch user_settings: settings that upstream dealer set for us
            const { data: settings } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .eq('dealer_id', dealerId)
                .maybeSingle()

            let totalCommission = 0
            const transfersList = dealerTransfers[dealerId]

            transfersList.forEach(t => {
                const settingsKey = getBetSettingsKey(t.bet_type, lotteryKey)
                const betSettings = settings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                const commissionRate = betSettings?.commission !== undefined 
                    ? betSettings.commission 
                    : (DEFAULT_COMMISSIONS[t.bet_type] || 15)
                const commissionAmount = (t.amount || 0) * (commissionRate / 100)
                totalCommission += commissionAmount
            })

            commissions[dealerId] = {
                totalCommission,
                transferCount: transfersList.length,
                totalAmount: transfersList.reduce((sum, t) => sum + (t.amount || 0), 0)
            }
        }

        setInlineTransferCommissions(commissions)
    }

    // Calculate commissions for incoming transfers (what we pay to downstream dealers)
    async function calculateInlineIncomingCommissions(incomingData) {
        if (!user?.id || !incomingData || incomingData.length === 0) return

        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        
        // Helper to get settings key for bet type
        const getBetSettingsKey = (betType, lKey) => {
            if (lKey === 'lao' || lKey === 'hanoi') {
                const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                return LAO_MAP[betType] || betType
            }
            return betType
        }

        // Extract email from bill_note (format: "ตีออกจาก email")
        const extractEmail = (billNote) => {
            if (!billNote) return null
            return billNote.replace(/^ตีออกจาก\s*/, '')
        }

        // Group by bill_note (which contains dealer email)
        const dealerGroups = {}
        incomingData.forEach(sub => {
            const dealerKey = sub.bill_note || 'ไม่ระบุ'
            if (!dealerGroups[dealerKey]) {
                dealerGroups[dealerKey] = []
            }
            dealerGroups[dealerKey].push(sub)
        })

        const commissions = {}

        // For each downstream dealer, fetch their settings and calculate commission we pay them
        for (const billNote of Object.keys(dealerGroups)) {
            const dealerEmail = extractEmail(billNote)
            
            // Find the downstream dealer's user_id and full_name from their email
            const { data: dealerProfile } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('email', dealerEmail)
                .maybeSingle()

            if (!dealerProfile?.id) {
                // If we can't find the dealer, use default commission
                let totalCommission = 0
                dealerGroups[billNote].forEach(sub => {
                    const commissionRate = DEFAULT_COMMISSIONS[sub.bet_type] || 15
                    totalCommission += (sub.amount || 0) * (commissionRate / 100)
                })
                commissions[billNote] = {
                    totalCommission,
                    itemCount: dealerGroups[billNote].length,
                    totalAmount: dealerGroups[billNote].reduce((sum, s) => sum + (s.amount || 0), 0),
                    dealerName: dealerEmail || 'ไม่ระบุ'
                }
                continue
            }

            // Fetch user_settings: settings that we (as dealer) set for the downstream dealer
            const { data: settings } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', dealerProfile.id)
                .eq('dealer_id', user.id)
                .maybeSingle()

            let totalCommission = 0
            const itemsList = dealerGroups[billNote]

            itemsList.forEach(sub => {
                const settingsKey = getBetSettingsKey(sub.bet_type, lotteryKey)
                const betSettings = settings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                const commissionRate = betSettings?.commission !== undefined 
                    ? betSettings.commission 
                    : (DEFAULT_COMMISSIONS[sub.bet_type] || 15)
                const commissionAmount = (sub.amount || 0) * (commissionRate / 100)
                totalCommission += commissionAmount
            })

            commissions[billNote] = {
                totalCommission,
                itemCount: itemsList.length,
                totalAmount: itemsList.reduce((sum, s) => sum + (s.amount || 0), 0),
                dealerName: dealerProfile.full_name || dealerEmail || 'ไม่ระบุ'
            }
            console.log('Incoming commission for', billNote, ':', { dealerEmail, fullName: dealerProfile.full_name, dealerName: commissions[billNote].dealerName })
        }

        console.log('Final inlineIncomingCommissions:', commissions)
        setInlineIncomingCommissions(commissions)
    }

    const handleHeaderClick = () => {
        if (!isExpanded) {
            // If using controlled state (onToggle), just call it
            // If using internal state, set to true
            if (onToggle) {
                onToggle()
            } else {
                setInternalExpanded(true)
            }
            // Auto-load submissions when expanding
            fetchInlineSubmissions()
        } else {
            if (onToggle) {
                onToggle()
            } else {
                setInternalExpanded(false)
            }
        }
    }

    // Open write bet modal for selected member
    const handleOpenWriteBet = () => {
        // Find the member object from allMembers based on selected name
        const memberName = inlineUserFilter
        const member = allMembers.find(m => 
            (m.full_name || m.email || 'ไม่ระบุ') === memberName
        )
        if (member) {
            // Check if member has changed password - if so, dealer cannot write on their behalf
            if (member.password_changed) {
                toast.error('ไม่สามารถเขียนโพยแทนสมาชิกที่เปลี่ยนรหัสผ่านแล้วได้')
                return
            }
            setSelectedMemberForBet(member)
            setEditingBillData(null) // Clear editing data for new submission
            setShowWriteBetModal(true)
        }
    }

    // Check if selected member can have bets written on their behalf
    const canWriteBetForSelectedMember = () => {
        if (inlineUserFilter === 'all') return false
        const memberName = inlineUserFilter
        const member = allMembers.find(m => 
            (m.full_name || m.email || 'ไม่ระบุ') === memberName
        )
        // Can write bet only if member exists and hasn't changed password
        return member && !member.password_changed
    }

    // Check if dealer can edit a specific user's bill (user hasn't changed password)
    const canEditBillForUser = (userId) => {
        const member = allMembers.find(m => m.id === userId)
        return member && !member.password_changed
    }

    // Edit bill - open WriteSubmissionModal with existing data
    const handleEditBill = (billId, billItems, userId) => {
        // Find the member object
        const member = allMembers.find(m => m.id === userId)
        if (!member) {
            toast.error('ไม่พบข้อมูลสมาชิก')
            return
        }

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
            
            // Fallback: reconstruct from individual fields
            const numbers = firstItem.numbers
            const amount = firstItem.amount
            return `${numbers}=${amount}`
        })

        // Set editing data and open WriteSubmissionModal
        setSelectedMemberForBet(member)
        setEditingBillData({
            billId,
            billNote: sortedItems[0]?.bill_note || '',
            originalLines,
            originalItems: sortedItems
        })
        setShowWriteBetModal(true)
    }

    const calculateExcessItems = () => {
        const grouped = {}
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        const setPrice = round?.set_prices?.['4_top'] || 120

        inlineSubmissions.forEach(sub => {
            const normalizedNumbers = normalizeNumber(sub.numbers, sub.bet_type)
            const key = `${sub.bet_type}|${normalizedNumbers}`
            if (!grouped[key]) {
                grouped[key] = {
                    bet_type: sub.bet_type,
                    numbers: normalizedNumbers,
                    originalNumbers: [sub.numbers],
                    total: 0,
                    setCount: 0,
                    submissions: []
                }
            } else {
                if (!grouped[key].originalNumbers.includes(sub.numbers)) {
                    grouped[key].originalNumbers.push(sub.numbers)
                }
            }
            grouped[key].total += sub.amount
            grouped[key].submissions.push(sub)

            if (isSetBasedLottery && (sub.bet_type === '4_set' || sub.bet_type === '4_top')) {
                grouped[key].setCount += Math.ceil(sub.amount / setPrice)
            }
        })

        const excessItems = []
        
        // For Lao/Hanoi: Calculate 3_set excess (3 ตัวตรงชุด - last 3 digits match)
        if (isSetBasedLottery) {
            const limit3Set = inlineTypeLimits['3_set'] ?? 999999999
            const limit4Set = inlineTypeLimits['4_set'] ?? inlineTypeLimits['4_top'] ?? 999999999
            
            // Group 4-digit submissions by their last 3 digits
            const groupedByLast3 = {}
            Object.values(grouped).forEach(group => {
                if ((group.bet_type === '4_set' || group.bet_type === '4_top') && group.numbers?.length === 4) {
                    const last3 = group.numbers.slice(-3)
                    if (!groupedByLast3[last3]) {
                        groupedByLast3[last3] = {
                            last3Digits: last3,
                            exactMatches: {},
                            totalSets: 0,
                            submissions: []
                        }
                    }
                    
                    if (!groupedByLast3[last3].exactMatches[group.numbers]) {
                        groupedByLast3[last3].exactMatches[group.numbers] = {
                            numbers: group.numbers,
                            setCount: 0,
                            submissions: []
                        }
                    }
                    groupedByLast3[last3].exactMatches[group.numbers].setCount += group.setCount
                    groupedByLast3[last3].exactMatches[group.numbers].submissions.push(...group.submissions)
                    groupedByLast3[last3].totalSets += group.setCount
                    groupedByLast3[last3].submissions.push(...group.submissions)
                }
            })
            
            // Process each last-3-digit group
            Object.values(groupedByLast3).forEach(group3 => {
                const exactMatchGroups = Object.values(group3.exactMatches)
                
                // Sort by earliest submission (FIFO)
                exactMatchGroups.sort((a, b) => {
                    const aTime = Math.min(...a.submissions.map(s => new Date(s.created_at).getTime()))
                    const bTime = Math.min(...b.submissions.map(s => new Date(s.created_at).getTime()))
                    return aTime - bTime
                })
                
                // Calculate transferred sets
                const transferred4Set = inlineTransfers
                    .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top'))
                    .reduce((sum, t) => {
                        if (t.numbers?.slice(-3) === group3.last3Digits) {
                            return sum + Math.floor((t.amount || 0) / setPrice)
                        }
                        return sum
                    }, 0)
                
                // Note: transferred3Set is calculated per-number below, not used here anymore
                const transferred3Set = 0 // Kept for reference, actual calculation is per-number
                
                // Process 4_set excess first
                exactMatchGroups.forEach(exactGroup => {
                    exactGroup.submissions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                    
                    const exactTransferred = inlineTransfers
                        .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top') && t.numbers === exactGroup.numbers)
                        .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)
                    
                    const effectiveLimit = limit4Set + exactTransferred
                    
                    if (exactGroup.setCount > effectiveLimit) {
                        const excess4 = exactGroup.setCount - effectiveLimit
                        excessItems.push({
                            bet_type: '4_set',
                            numbers: exactGroup.numbers,
                            total: exactGroup.setCount * setPrice,
                            setCount: exactGroup.setCount,
                            submissions: exactGroup.submissions,
                            limit: limit4Set,
                            excess: excess4,
                            transferredSets: exactTransferred,
                            isSetBased: true,
                            excessType: '4_set'
                        })
                    }
                })
                
                // Calculate excess for numbers with same last 3 digits
                // Rule: Total sets across ALL numbers with same last 3 digits must not exceed limit3Set
                // If total exceeds limit3Set, the excess comes from later numbers (FIFO)
                const uniqueNumbers = Object.keys(group3.exactMatches)
                
                if (uniqueNumbers.length > 1) {
                    const sortedNumbers = uniqueNumbers.sort((a, b) => {
                        const aTime = Math.min(...group3.exactMatches[a].submissions.map(s => new Date(s.created_at).getTime()))
                        const bTime = Math.min(...group3.exactMatches[b].submissions.map(s => new Date(s.created_at).getTime()))
                        return aTime - bTime
                    })
                    
                    // Calculate total transferred for all numbers with same last 3 digits
                    const totalTransferred3Set = inlineTransfers
                        .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers?.slice(-3) === group3.last3Digits)
                        .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)
                    
                    // Remaining limit for 3-digit match = limit3Set + transferred
                    let remaining3SetLimit = limit3Set + totalTransferred3Set
                    
                    sortedNumbers.forEach((num, idx) => {
                        const exactGroup = group3.exactMatches[num]
                        
                        // Calculate transferred sets for this specific 4-digit number
                        const transferredForThisNum = inlineTransfers
                            .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers === num)
                            .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)
                        
                        // How many sets can we keep from this number?
                        const setsToKeep = Math.min(exactGroup.setCount, remaining3SetLimit)
                        remaining3SetLimit -= setsToKeep
                        
                        // Excess = total sets - sets we can keep
                        const excessSets = exactGroup.setCount - setsToKeep
                        
                        if (excessSets > 0) {
                            excessItems.push({
                                bet_type: '4_set', // Display as 4_set since it's still a 4-digit number
                                numbers: num,
                                displayNumbers: `${num} (3ตัวหลัง: ${group3.last3Digits})`,
                                total: excessSets * setPrice,
                                setCount: exactGroup.setCount,
                                submissions: exactGroup.submissions.slice(-excessSets),
                                limit: limit3Set,
                                excess: excessSets,
                                transferredSets: transferredForThisNum,
                                isSetBased: true,
                                excessType: '3_digit_match', // Mark as 3-digit match excess
                                last3Digits: group3.last3Digits
                            })
                        }
                    })
                }
            })
        }
        
        // Process non-4_set bets normally
        Object.values(grouped).forEach(item => {
            // Skip 4_set for Lao/Hanoi - already handled above
            if (isSetBasedLottery && (item.bet_type === '4_set' || item.bet_type === '4_top')) {
                return
            }
            
            // For 4-digit sets, check both 4_set and 4_top for limit lookup
            const isSet4Digit = item.bet_type === '4_set' || item.bet_type === '4_top'
            let typeLimit = inlineTypeLimits[item.bet_type]
            // Fallback: if 4_set not found, try 4_top and vice versa
            if (typeLimit === undefined && isSet4Digit) {
                typeLimit = inlineTypeLimits['4_set'] ?? inlineTypeLimits['4_top']
            }

            const numberLimit = inlineNumberLimits.find(nl => {
                const nlNormalized = normalizeNumber(nl.numbers, nl.bet_type)
                const nlIsSet4 = nl.bet_type === '4_set' || nl.bet_type === '4_top'
                // Match if same bet type, or both are 4-digit sets
                return (nl.bet_type === item.bet_type || (isSet4Digit && nlIsSet4)) && nlNormalized === item.numbers
            })
            const effectiveLimit = numberLimit?.max_amount ?? typeLimit
            const isSetBased = isSetBasedLottery && isSet4Digit

            const transferredForThis = inlineTransfers.filter(t => {
                const tIsSet4 = t.bet_type === '4_set' || t.bet_type === '4_top'
                const tNormalized = normalizeNumber(t.numbers, t.bet_type)
                // Match if same bet type, or both are 4-digit sets
                return (t.bet_type === item.bet_type || (isSet4Digit && tIsSet4)) && tNormalized === item.numbers
            }).reduce((sum, t) => sum + (t.amount || 0), 0)

            const transferredSets = isSetBased ? Math.floor(transferredForThis / setPrice) : 0

            // Check if limit exists (including 0)
            if (effectiveLimit !== undefined && effectiveLimit !== null) {
                if (isSetBased) {
                    const effectiveExcess = item.setCount - effectiveLimit - transferredSets
                    if (effectiveExcess > 0) {
                        excessItems.push({ ...item, limit: effectiveLimit, excess: effectiveExcess, transferredSets, isSetBased: true })
                    }
                } else {
                    const effectiveExcess = item.total - effectiveLimit - transferredForThis
                    if (effectiveExcess > 0) {
                        excessItems.push({ ...item, limit: effectiveLimit, excess: effectiveExcess, transferredAmount: transferredForThis })
                    }
                }
            }
        })
        return excessItems.sort((a, b) => b.excess - a.excess)
    }

    const excessItems = calculateExcessItems()

    const toggleExcessItem = (item) => {
        const key = `${item.bet_type}|${item.numbers}`
        setSelectedExcessItems(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const selectedCount = excessItems.filter(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`]).length

    const handleSaveTransfer = async () => {
        if (!transferForm.target_dealer_name) {
            toast.warning('กรุณากรอกชื่อเจ้ามือที่ต้องการตีออก')
            return
        }
        
        // Check if still checking upstream round status
        if (upstreamRoundStatus === 'checking') {
            toast.warning('กรุณารอการตรวจสอบงวดหวยของเจ้ามือปลายทาง')
            return
        }
        
        setSavingTransfer(true)
        try {
            const selectedItems = excessItems.filter(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])
            const batchId = generateBatchId()
            const isLinked = !!(selectedUpstreamDealer?.is_linked && selectedUpstreamDealer?.upstream_dealer_id)
            const canSendToUpstream = isLinked && upstreamRoundStatus === 'available'

            // If linked dealer with available round, find their active round and create submission
            let targetRoundId = null
            let targetSubmissionIds = []

            if (canSendToUpstream) {
                // Find upstream dealer's active round for same lottery type
                const { data: upstreamRounds } = await supabase
                    .from('lottery_rounds')
                    .select('id')
                    .eq('dealer_id', selectedUpstreamDealer.upstream_dealer_id)
                    .eq('lottery_type', round.lottery_type)
                    .in('status', ['open', 'active'])
                    .gte('close_time', new Date().toISOString())
                    .order('round_date', { ascending: false })
                    .limit(1)

                if (upstreamRounds && upstreamRounds.length > 0) {
                    targetRoundId = upstreamRounds[0].id

                    // Fetch our settings with the upstream dealer to get commission rates
                    let ourSettings = null
                    const { data: settingsData } = await supabase
                        .from('user_settings')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('dealer_id', selectedUpstreamDealer.upstream_dealer_id)
                        .maybeSingle()
                    ourSettings = settingsData

                    // Create submissions in upstream dealer's round
                    const lotteryKey = getLotteryTypeKey(round.lottery_type)
                    // Helper to get settings key for bet type
                    const getBetSettingsKey = (betType, lKey) => {
                        if (lKey === 'lao' || lKey === 'hanoi') {
                            const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                            return LAO_MAP[betType] || betType
                        }
                        return betType
                    }
                    const submissionInserts = selectedItems.map(item => {
                        const amount = item.isSetBased ? item.excess * (round?.set_prices?.['4_top'] || 120) : item.excess
                        // Calculate commission based on our settings with upstream dealer
                        let commissionAmount = 0
                        const settingsKey = getBetSettingsKey(item.bet_type, lotteryKey)
                        const betSettings = ourSettings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                        if (betSettings?.commission !== undefined) {
                            commissionAmount = betSettings.isFixed ? betSettings.commission : amount * (betSettings.commission / 100)
                        } else {
                            // Use default commission rate (15% if not specified)
                            commissionAmount = amount * ((DEFAULT_COMMISSIONS[item.bet_type] || 15) / 100)
                        }
                        return {
                            round_id: targetRoundId,
                            user_id: user.id,
                            bet_type: item.bet_type,
                            numbers: item.numbers,
                            amount: amount,
                            source: 'transfer',
                            bill_note: `ตีออกจาก ${user.email || 'dealer'}`,
                            commission_amount: commissionAmount
                        }
                    })

                    const { data: newSubmissions, error: subError } = await supabase
                        .from('submissions')
                        .insert(submissionInserts)
                        .select('id')

                    if (subError) {
                        console.error('Error creating submissions in upstream round:', subError)
                        // Continue anyway - just record the transfer
                    } else {
                        targetSubmissionIds = newSubmissions?.map(s => s.id) || []
                    }
                }
            }

            // Record the transfers
            const inserts = selectedItems.map((item, index) => ({
                round_id: round.id,
                bet_type: item.bet_type,
                numbers: item.numbers,
                amount: item.isSetBased ? item.excess * (round?.set_prices?.['4_top'] || 120) : item.excess,
                target_dealer_name: transferForm.target_dealer_name,
                target_dealer_contact: transferForm.target_dealer_contact || null,
                notes: transferForm.notes || null,
                transfer_batch_id: batchId,
                upstream_dealer_id: selectedUpstreamDealer?.upstream_dealer_id || null,
                is_linked: isLinked || false,
                target_round_id: targetRoundId,
                target_submission_id: targetSubmissionIds[index] || null
            }))

            const { error } = await supabase.from('bet_transfers').insert(inserts)
            if (error) throw error

            // Update pending deduction for upstream dealer's credit (if linked)
            // Only the RECEIVING dealer (upstream) should have their credit affected
            if (canSendToUpstream && selectedUpstreamDealer?.upstream_dealer_id) {
                try {
                    await updatePendingDeduction(selectedUpstreamDealer.upstream_dealer_id)
                    console.log('Upstream dealer pending deduction updated')
                } catch (err) {
                    console.log('Error updating upstream pending deduction:', err)
                }
            }
            
            // NOTE: Do NOT update current dealer's pending deduction when transferring OUT
            // The dealer who transfers OUT does not get charged - only the RECEIVING dealer does
            // Just refresh the credit display to show updated values
            if (onCreditUpdate) onCreditUpdate()

            await fetchInlineSubmissions(true)
            setShowTransferModal(false)
            setSelectedExcessItems({})
            setSelectedUpstreamDealer(null)
            setTransferForm({ target_dealer_name: '', target_dealer_contact: '', notes: '' })
            
            setUpstreamRoundStatus(null)
            
            if (canSendToUpstream && targetRoundId) {
                toast.success(`ตีออกสำเร็จ ${selectedItems.length} รายการ! เลขถูกส่งไปยังงวดของ ${selectedUpstreamDealer.upstream_name} แล้ว`)
            } else if (isLinked && !canSendToUpstream) {
                toast.success(`บันทึกยอดตีออก ${selectedItems.length} รายการสำเร็จ! (เจ้ามือไม่มีงวดเปิดรับ)`)
            } else {
                toast.success(`ตีออกสำเร็จ ${selectedItems.length} รายการ!`)
            }
        } catch (error) {
            console.error('Error saving transfer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSavingTransfer(false)
        }
    }

    const toggleTransferBatch = (batchId) => {
        setSelectedTransferBatches(prev => ({ ...prev, [batchId]: !prev[batchId] }))
    }

    const toggleSelectAllBatches = (batchIds) => {
        const allSelected = batchIds.every(id => selectedTransferBatches[id])
        if (allSelected) {
            setSelectedTransferBatches({})
        } else {
            const newSelected = {}
            batchIds.forEach(id => { newSelected[id] = true })
            setSelectedTransferBatches(newSelected)
        }
    }

    const getSelectedBatchCount = (batchIds) => batchIds.filter(id => selectedTransferBatches[id]).length

    const handleRevertTransfers = async (batchIds) => {
        const selectedBatchIds = batchIds.filter(id => selectedTransferBatches[id])
        if (selectedBatchIds.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการเอาคืน')
            return
        }
        if (!confirm(`ต้องการเอาคืน ${selectedBatchIds.length} รายการหรือไม่?`)) return

        setRevertingTransfer(true)
        try {
            const transferIdsToDelete = inlineTransfers
                .filter(t => selectedBatchIds.includes(t.transfer_batch_id || t.id))
                .map(t => t.id)

            const { error } = await supabase.from('bet_transfers').delete().in('id', transferIdsToDelete)
            if (error) throw error

            await fetchInlineSubmissions(true)
            setSelectedTransferBatches({})
            toast.success(`เอาคืนสำเร็จ ${selectedBatchIds.length} รายการ!`)
        } catch (error) {
            console.error('Error reverting transfers:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setRevertingTransfer(false)
        }
    }

    // Return incoming transfers back to sender (for receiving dealer)
    const handleReturnIncomingTransfers = async (submissionIds) => {
        const selectedIds = submissionIds.filter(id => selectedIncomingItems[id])
        if (selectedIds.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการคืน')
            return
        }
        if (!confirm(`ต้องการคืนเลข ${selectedIds.length} รายการกลับไปยังเจ้ามือต้นทางหรือไม่?`)) return

        setReturningIncoming(true)
        try {
            // Get the submissions to be returned (to match with bet_transfers)
            const submissionsToReturn = inlineSubmissions.filter(s => selectedIds.includes(s.id))
            
            // Soft delete the submissions (mark as deleted)
            const { error: subError } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .in('id', selectedIds)

            if (subError) throw subError

            // Update bet_transfers to mark them as returned
            // Try multiple methods to find matching transfers
            for (const sub of submissionsToReturn) {
                // Method 1: Try by target_submission_id
                let { data: updated, error } = await supabase
                    .from('bet_transfers')
                    .update({ status: 'returned' })
                    .eq('target_submission_id', sub.id)
                    .select()

                // Method 2: If no match, try by target_round_id + numbers + bet_type
                if (!updated || updated.length === 0) {
                    const { data: updated2, error: err2 } = await supabase
                        .from('bet_transfers')
                        .update({ status: 'returned' })
                        .eq('target_round_id', round.id)
                        .eq('numbers', sub.numbers)
                        .eq('bet_type', sub.bet_type)
                        .eq('status', 'active')
                        .select()
                    
                    console.log(`Updated bet_transfer for ${sub.numbers} via target_round_id:`, updated2, err2)
                } else {
                    console.log(`Updated bet_transfer for ${sub.numbers} via target_submission_id:`, updated)
                }
            }

            await fetchInlineSubmissions(true)
            setSelectedIncomingItems({})
            toast.success(`คืนเลขสำเร็จ ${selectedIds.length} รายการ!`)
        } catch (error) {
            console.error('Error returning incoming transfers:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setReturningIncoming(false)
        }
    }

    const toggleIncomingItem = (id) => {
        setSelectedIncomingItems(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const toggleSelectAllIncoming = (ids) => {
        const allSelected = ids.every(id => selectedIncomingItems[id])
        if (allSelected) {
            setSelectedIncomingItems({})
        } else {
            const newSelected = {}
            ids.forEach(id => { newSelected[id] = true })
            setSelectedIncomingItems(newSelected)
        }
    }

    const getSelectedIncomingCount = (ids) => ids.filter(id => selectedIncomingItems[id]).length

    // Toggle select submission item
    const toggleSelectItem = (id) => {
        setSelectedItems(prev => ({ ...prev, [id]: !prev[id] }))
    }

    // Toggle select all submissions
    const toggleSelectAllItems = (ids) => {
        const allSelected = ids.every(id => selectedItems[id])
        if (allSelected) {
            setSelectedItems({})
        } else {
            const newSelected = {}
            ids.forEach(id => { newSelected[id] = true })
            setSelectedItems(newSelected)
        }
    }

    const getSelectedItemsCount = (ids) => ids.filter(id => selectedItems[id]).length

    // Copy selected submissions to clipboard
    const handleCopySelectedItems = async (filteredData, selectedIds) => {
        const itemsToCopy = filteredData.filter(sub => {
            const itemIds = sub.ids || [sub.id]
            return itemIds.some(id => selectedIds.includes(id))
        })
        
        if (itemsToCopy.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการคัดลอก')
            return
        }

        const lotteryName = round.lottery_name || LOTTERY_TYPES[round.lottery_type] || 'หวย'
        const closeTime = new Date(round.close_time)
        const formattedCloseTime = closeTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + closeTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        
        // Determine sender name
        let senderName = 'ทั้งหมด'
        if (inlineUserFilter !== 'all') {
            senderName = inlineUserFilter
        }
        
        const grandTotal = itemsToCopy.reduce((sum, s) => sum + s.amount, 0)
        
        let text = `📋 ${lotteryName}\n`
        text += `📅 งวดวันที่: ${formattedCloseTime}\n`
        text += `👤 ผู้ส่ง: ${senderName}\n`
        text += `📊 ทั้งหมด (${itemsToCopy.length} รายการ)\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${grandTotal.toLocaleString()}\n`
        text += `━━━━━━━━━━━━━━━━\n`
        
        // Group by bet type with specific order
        const betTypeOrder = ['2_bottom', '2_top', '3_tod', '3_top', '3_front', '3_bottom', '4_set', '4_top', '5_top', '6_top']
        const byType = {}
        itemsToCopy.forEach(sub => {
            const betType = sub.bet_type
            if (!byType[betType]) byType[betType] = []
            byType[betType].push(sub)
        })
        
        // Sort bet types by order
        const sortedBetTypes = Object.keys(byType).sort((a, b) => {
            const indexA = betTypeOrder.indexOf(a)
            const indexB = betTypeOrder.indexOf(b)
            if (indexA === -1 && indexB === -1) return a.localeCompare(b)
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
        })
        
        sortedBetTypes.forEach((betType, idx) => {
            const items = byType[betType]
            const label = BET_TYPES_BY_LOTTERY[round.lottery_type]?.[betType]?.label || BET_TYPES[betType] || betType
            text += `${label}\n`
            
            items.forEach(sub => {
                // Format: number=amount (NO bet type label or total)
                // numbers field may contain display_numbers like "374=10*6 คูณชุด" or just "374"
                // display_amount may contain "100*100 เต็งโต๊ด=200"
                // We need to extract: just the number (e.g., "374") and just the amount (e.g., "10*6")
                
                let numberOnly = sub.numbers
                let amountOnly = sub.amount
                
                // Extract number from numbers field (may be "374=10*6 คูณชุด" or "374")
                if (sub.numbers && sub.numbers.includes('=')) {
                    // Format: "374=10*6 คูณชุด" -> extract "374" and "10*6"
                    const parts = sub.numbers.split('=')
                    numberOnly = parts[0].trim()
                    // Extract amount part (before any Thai text)
                    if (parts[1]) {
                        const amountMatch = parts[1].match(/^[\d*]+/)
                        if (amountMatch) {
                            amountOnly = amountMatch[0]
                        }
                    }
                } else if (sub.display_amount) {
                    // Use display_amount but extract only numeric part
                    const match = sub.display_amount.toString().match(/^[\d*]+/)
                    if (match) {
                        amountOnly = match[0]
                    }
                }
                
                text += `${numberOnly}=${amountOnly}\n`
            })
            
            // Add separator between bet types
            if (idx < sortedBetTypes.length - 1) {
                text += `------------------\n`
            }
        })
        
        text += `━━━━━━━━━━━━━━━━\n`

        try {
            await navigator.clipboard.writeText(text)
            toast.success(`คัดลอก ${itemsToCopy.length} รายการแล้ว!`)
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea')
            textArea.value = text
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            toast.success(`คัดลอก ${itemsToCopy.length} รายการแล้ว!`)
        }
    }

    // Delete selected submissions
    const handleDeleteSelectedItems = async (ids) => {
        const selectedIds = ids.filter(id => selectedItems[id])
        if (selectedIds.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการลบ')
            return
        }

        if (!confirm(`ต้องการลบ ${selectedIds.length} รายการ?`)) return

        setDeletingItems(true)
        try {
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .in('id', selectedIds)

            if (error) throw error

            toast.success(`ลบ ${selectedIds.length} รายการสำเร็จ`)
            setSelectedItems({})
            await fetchInlineSubmissions(true)
            if (onCreditUpdate) onCreditUpdate()
        } catch (error) {
            console.error('Error deleting submissions:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setDeletingItems(false)
        }
    }

    // Delete single submission or group of submissions
    const handleDeleteSingleItem = async (idOrIds) => {
        if (!confirm('ต้องการลบรายการนี้?')) return

        try {
            // Support both single id and array of ids (for summary mode groups)
            const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds]
            
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .in('id', ids)

            if (error) throw error

            toast.success('ลบรายการสำเร็จ')
            await fetchInlineSubmissions(true)
            if (onCreditUpdate) onCreditUpdate()
        } catch (error) {
            console.error('Error deleting submission:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Group submissions by bill_id and user
    const getSubmissionsByBills = () => {
        const bills = {}
        inlineSubmissions.forEach(sub => {
            const billId = sub.bill_id || sub.id
            const userName = sub.profiles?.full_name || sub.profiles?.email || 'ไม่ระบุ'
            const key = `${billId}|${userName}`
            if (!bills[key]) {
                bills[key] = {
                    bill_id: billId,
                    user_name: userName,
                    user_id: sub.user_id,
                    items: [],
                    total: 0,
                    created_at: sub.created_at,
                    bill_note: sub.bill_note
                }
            }
            bills[key].items.push(sub)
            bills[key].total += sub.amount
        })
        return Object.values(bills).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    // Toggle bill expansion
    const toggleBillExpand = (billKey) => {
        setExpandedBills(prev => 
            prev.includes(billKey) 
                ? prev.filter(k => k !== billKey)
                : [...prev, billKey]
        )
    }

    // Toggle user group expansion
    const toggleUserGroupExpand = (userKey) => {
        setExpandedUserGroups(prev => 
            prev.includes(userKey) 
                ? prev.filter(k => k !== userKey)
                : [...prev, userKey]
        )
    }

    // Delete entire bill
    const handleDeleteBill = async (billItems) => {
        if (!confirm(`ต้องการลบใบโพยนี้ (${billItems.length} รายการ)?`)) return

        setDeletingItems(true)
        try {
            const ids = billItems.map(i => i.id)
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .in('id', ids)

            if (error) throw error

            toast.success(`ลบใบโพย ${billItems.length} รายการสำเร็จ`)
            await fetchInlineSubmissions(true)
            if (onCreditUpdate) onCreditUpdate()
        } catch (error) {
            console.error('Error deleting bill:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setDeletingItems(false)
        }
    }

    // Delete multiple items by IDs (for deleting all user submissions)
    const handleDeleteMultipleItems = async (ids) => {
        setDeletingItems(true)
        try {
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .in('id', ids)

            if (error) throw error

            toast.success(`ลบ ${ids.length} รายการสำเร็จ`)
            await fetchInlineSubmissions(true)
            if (onCreditUpdate) onCreditUpdate()
        } catch (error) {
            console.error('Error deleting items:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setDeletingItems(false)
        }
    }

    // Reclaim returned transfers back into the system (for sending dealer)
    const handleReclaimReturnedTransfers = async (transferItems) => {
        if (transferItems.length === 0) {
            toast.warning('ไม่มีรายการที่ต้องการเอาคืน')
            return
        }
        if (!confirm(`ต้องการเอาคืน ${transferItems.length} รายการที่ถูกคืนกลับเข้าระบบหรือไม่?`)) return

        setRevertingTransfer(true)
        try {
            // Delete the bet_transfers records (this effectively "reclaims" them)
            const transferIds = transferItems.map(t => t.id)
            const { error } = await supabase
                .from('bet_transfers')
                .delete()
                .in('id', transferIds)

            if (error) throw error

            await fetchInlineSubmissions(true)
            toast.success(`เอาคืนสำเร็จ ${transferItems.length} รายการ!`)
        } catch (error) {
            console.error('Error reclaiming returned transfers:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setRevertingTransfer(false)
        }
    }

    const generateTransferCopyText = async (batchesToCopy) => {
        const lotteryName = round.lottery_name || LOTTERY_TYPES[round.lottery_type] || 'หวย'
        const totalItems = batchesToCopy.reduce((sum, b) => sum + b.items.length, 0)
        const grandTotal = batchesToCopy.reduce((sum, b) => sum + b.totalAmount, 0)
        const targetDealer = batchesToCopy[0]?.target_dealer_name || ''
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        
        // Get set price from target dealer's settings if available
        let setPrice = round?.set_prices?.['4_top'] || 120
        const targetDealerId = batchesToCopy[0]?.items?.[0]?.upstream_dealer_id
        if (targetDealerId) {
            try {
                const { data: targetSettings } = await supabase
                    .from('user_settings')
                    .select('lottery_settings')
                    .eq('user_id', targetDealerId)
                    .single()
                
                if (targetSettings?.lottery_settings) {
                    const lotteryKey = round.lottery_type
                    const targetSetPrice = targetSettings.lottery_settings[lotteryKey]?.['4_set']?.setPrice
                    if (targetSetPrice) {
                        setPrice = targetSetPrice
                    }
                }
            } catch (err) {
                console.log('Could not fetch target dealer settings, using default')
            }
        }

        // Format date in Thai
        const roundDate = new Date(round.round_date)
        const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
        const thaiYear = roundDate.getFullYear() + 543
        const formattedDate = `${roundDate.getDate()} ${thaiMonths[roundDate.getMonth()]} ${thaiYear}`

        // Group items by bet type
        const byType = {}
        let totalSetCount = 0
        batchesToCopy.forEach(batch => {
            batch.items.forEach(item => {
                const betType = item.bet_type
                const typeName = BET_TYPES_BY_LOTTERY[round.lottery_type]?.[betType]?.label || BET_TYPES[betType] || betType
                const isSetType = betType === '4_set' || betType === '4_top' || betType === '3_set' || betType === '3_straight_set'
                if (!byType[typeName]) byType[typeName] = { items: [], betType, isSetType }
                byType[typeName].items.push(item)
                
                // Count sets for set-based types
                if (isSetBasedLottery && isSetType) {
                    totalSetCount += Math.ceil((item.amount || 0) / setPrice)
                }
            })
        })

        let text = `📤 ยอดตีออก - ${lotteryName}\n`
        text += `📅 วันที่ ${formattedDate}\n`
        text += `📅 ทั้งหมด (${totalItems} รายการ)\n`
        text += `👤 ตีออกให้: ${targetDealer}\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${grandTotal.toLocaleString()}\n`
        if (isSetBasedLottery && totalSetCount > 0) {
            text += `💰 รวมเลขชุด: ${totalSetCount} ชุด\n`
        }
        text += `━━━━━━━━━━━━━━━━\n`

        // Separate set types and regular types
        const regularTypes = {}
        const setTypes = {}
        Object.entries(byType).forEach(([typeName, typeData]) => {
            if (isSetBasedLottery && typeData.isSetType) {
                setTypes[typeName] = typeData
            } else {
                regularTypes[typeName] = typeData
            }
        })

        // Output regular types first
        Object.entries(regularTypes).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            typeData.items.forEach(item => { text += `${item.numbers}=${item.amount?.toLocaleString()}\n` })
            text += `-----------------\n`
        })

        // Output set types with special format (only set count, no amount)
        Object.entries(setTypes).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            const grouped = {}
            typeData.items.forEach(item => {
                if (!grouped[item.numbers]) {
                    grouped[item.numbers] = { amount: 0, count: 0 }
                }
                grouped[item.numbers].amount += item.amount || 0
                grouped[item.numbers].count += 1
            })
            Object.entries(grouped).forEach(([numbers, data]) => {
                const setCount = Math.ceil(data.amount / setPrice)
                text += `${numbers}= (${setCount} ชุด)\n`
            })
            text += `-----------------\n`
        })

        text += `━━━━━━━━━━━━━━━━\n`
        return text
    }

    const handleCopySelectedBatches = async (allBatches) => {
        const selectedBatchIds = Object.keys(selectedTransferBatches).filter(id => selectedTransferBatches[id])
        const batchesToCopy = allBatches.filter(b => selectedBatchIds.includes(b.id))
        if (batchesToCopy.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการคัดลอก')
            return
        }

        const text = await generateTransferCopyText(batchesToCopy)
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`คัดลอก ${batchesToCopy.length} รายการแล้ว!`)
        } catch (err) {
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            toast.success(`คัดลอก ${batchesToCopy.length} รายการแล้ว!`)
        }
    }

    const handleCopySingleBatch = async (batch) => {
        const text = await generateTransferCopyText([batch])
        try {
            await navigator.clipboard.writeText(text)
            toast.success('คัดลอกแล้ว!')
        } catch (err) {
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            toast.success('คัดลอกแล้ว!')
        }
    }

    // Generate copy text for total submissions (ยอดรับรวม)
    const generateTotalCopyText = (submissions) => {
        const lotteryName = round.lottery_name || LOTTERY_TYPES[round.lottery_type] || 'หวย'
        const totalItems = submissions.length
        const grandTotal = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        const setPrice = round?.set_prices?.['4_top'] || 120

        // Format date in Thai
        const roundDate = new Date(round.round_date)
        const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
        const thaiYear = roundDate.getFullYear() + 543
        const formattedDate = `${roundDate.getDate()} ${thaiMonths[roundDate.getMonth()]} ${thaiYear}`

        // Group items by bet type
        const byType = {}
        let totalSetCount = 0
        submissions.forEach(item => {
            const betType = item.bet_type
            const typeName = BET_TYPES_BY_LOTTERY[round.lottery_type]?.[betType]?.label || BET_TYPES[betType] || betType
            const isSetType = betType === '4_set' || betType === '4_top' || betType === '3_set' || betType === '3_straight_set'
            if (!byType[typeName]) byType[typeName] = { items: [], betType, isSetType }
            byType[typeName].items.push(item)
            
            // Count sets for set-based types
            if (isSetBasedLottery && isSetType) {
                totalSetCount += Math.ceil((item.amount || 0) / setPrice)
            }
        })

        let text = `📤 ยอดรับรวม - ${lotteryName}\n`
        text += `📅 วันที่ ${formattedDate}\n`
        text += `📅 ทั้งหมด (${totalItems} รายการ)\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${grandTotal.toLocaleString()}\n`
        if (isSetBasedLottery && totalSetCount > 0) {
            text += `💰 รวมเลขชุด: ${totalSetCount} ชุด\n`
        }
        text += `━━━━━━━━━━━━━━━━\n`

        // Separate set types and regular types
        const regularTypes = {}
        const setTypes = {}
        Object.entries(byType).forEach(([typeName, typeData]) => {
            if (isSetBasedLottery && typeData.isSetType) {
                setTypes[typeName] = typeData
            } else {
                regularTypes[typeName] = typeData
            }
        })

        // Output set types first (for Lao/Hanoi)
        Object.entries(setTypes).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            // Group by numbers and sum amounts
            const grouped = {}
            typeData.items.forEach(item => {
                if (!grouped[item.numbers]) {
                    grouped[item.numbers] = { amount: 0, count: 0 }
                }
                grouped[item.numbers].amount += item.amount || 0
                grouped[item.numbers].count += 1
            })
            Object.entries(grouped).forEach(([numbers, data]) => {
                const setCount = Math.ceil(data.amount / setPrice)
                text += `${numbers}= (${setCount} ชุด)\n`
            })
            text += `-----------------\n`
        })

        // Output regular types
        Object.entries(regularTypes).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            // Group by numbers - use display_amount but extract only numeric part
            const grouped = {}
            typeData.items.forEach(item => {
                const key = item.numbers
                if (!grouped[key]) {
                    grouped[key] = { amount: 0, display_amount: null }
                }
                grouped[key].amount += item.amount || 0
                // Keep first display_amount for this number
                if (!grouped[key].display_amount && item.display_amount) {
                    // Extract only numeric part (e.g., "20*20" from "20*20 เต็งโต๊ด=40")
                    const match = item.display_amount.toString().match(/^[\d*]+/)
                    grouped[key].display_amount = match ? match[0] : null
                }
            })
            Object.entries(grouped).forEach(([numbers, data]) => {
                // Use extracted display_amount if available, otherwise use amount
                if (data.display_amount) {
                    text += `${numbers}=${data.display_amount}\n`
                } else {
                    text += `${numbers}=${data.amount}\n`
                }
            })
            text += `-----------------\n`
        })

        text += `━━━━━━━━━━━━━━━━\n`
        return text
    }

    // Handle copy total submissions
    const handleCopyTotal = async () => {
        // Use filtered submissions based on current filter
        const submissionsToCopy = inlineUserFilter === 'all' 
            ? inlineSubmissions 
            : inlineSubmissions.filter(s => (s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ') === inlineUserFilter)
        
        if (submissionsToCopy.length === 0) {
            toast.warning('ไม่มีรายการที่จะคัดลอก')
            return
        }

        const text = generateTotalCopyText(submissionsToCopy)
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`คัดลอก ${submissionsToCopy.length} รายการแล้ว!`)
        } catch (err) {
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            toast.success(`คัดลอก ${submissionsToCopy.length} รายการแล้ว!`)
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
        // Always calculate commission from settings to ensure consistency with user dashboard
        // This fixes the issue where stored commission_amount may have been calculated with wrong rates
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]
        
        // Special handling for 4_set - commission is fixed amount per set
        if (sub.bet_type === '4_set' || sub.bet_type === '4_top') {
            if (settings?.isSet && settings?.commission !== undefined) {
                // Calculate number of sets: amount / setPrice
                const setPrice = settings.setPrice || round?.set_prices?.['4_top'] || 120
                const numSets = Math.floor((sub.amount || 0) / setPrice)
                // Commission = numSets * commission per set
                return numSets * settings.commission
            }
            // Default: 25 baht per set
            const defaultSetPrice = round?.set_prices?.['4_top'] || 120
            const numSets = Math.floor((sub.amount || 0) / defaultSetPrice)
            return numSets * 25 // Default 25 baht per set
        }
        
        if (settings?.commission !== undefined) {
            return settings.isFixed ? settings.commission : sub.amount * (settings.commission / 100)
        }
        // Use default rates if no settings found
        const defaultRate = DEFAULT_COMMISSIONS[sub.bet_type] || 15
        return sub.amount * (defaultRate / 100)
    }

    const getExpectedPayout = (sub) => {
        if (!sub.is_winner) return 0
        
        // For 4_set, use prize_amount from database (FIXED amount, not multiplied)
        if (sub.bet_type === '4_set') {
            return sub.prize_amount || 0
        }
        
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]
        if (settings?.payout !== undefined) return sub.amount * settings.payout
        return sub.amount * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
    }

    const userSummaries = !summaryData.loading && summaryData.submissions.length > 0 ? Object.values(
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

    // Incoming (รับเข้า) totals
    const grandTotalBet = userSummaries.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userSummaries.reduce((sum, u) => sum + u.totalWin, 0)
    const grandTotalCommission = userSummaries.reduce((sum, u) => sum + u.totalCommission, 0)
    const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission

    // Outgoing (ตีออก) totals - calculate from upstreamSummaries
    const outgoingTotalBet = upstreamSummaries.dealers.reduce((sum, d) => sum + d.totalBet, 0)
    const outgoingTotalWin = upstreamSummaries.dealers.reduce((sum, d) => sum + d.totalWin, 0)
    const outgoingTotalCommission = upstreamSummaries.dealers.reduce((sum, d) => sum + d.totalCommission, 0)
    const outgoingTicketCount = upstreamSummaries.dealers.reduce((sum, d) => sum + d.ticketCount, 0)
    // For outgoing: we sent bets, if they win we get paid, plus commission
    const outgoingProfit = outgoingTotalWin + outgoingTotalCommission - outgoingTotalBet

    // Combined total profit
    const totalCombinedProfit = dealerProfit + outgoingProfit

    return (
        <div className={`round-accordion-item ${round.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
            <div className="round-accordion-header card" onClick={handleHeaderClick} style={{ cursor: 'pointer' }}>
                {/* New Layout for Closed/Announced Rounds */}
                {(isClosed || isAnnounced) && !isOpen ? (
                    <div className="closed-round-layout">
                        {/* Top Row: Logo, Name, Status, Actions, Chevron */}
                        <div className="closed-round-top">
                            <div className="closed-round-header-row">
                                <span className={`lottery-badge ${round.lottery_type}`}>{LOTTERY_TYPES[round.lottery_type]}</span>
                                <h3 className="lottery-title">{round.lottery_name || LOTTERY_TYPES[round.lottery_type]}</h3>
                                {getStatusBadge(round)}
                            </div>
                            <div className="closed-round-meta">
                                <FiCalendar /> {formatDate(round.open_time)} {formatTime(round.open_time)} - {formatDate(round.close_time)} {formatTime(round.close_time)}
                            </div>
                            <div className="closed-round-actions-row">
                                <div className="action-buttons-left">
                                    <button className="icon-btn-sm" onClick={(e) => { e.stopPropagation(); onEditRound(); }} title="แก้ไข"><FiEdit2 /></button>
                                    <button className="icon-btn-sm warning" onClick={(e) => { e.stopPropagation(); onShowNumberLimits(); }} title="เลขอั้น"><FiAlertTriangle /></button>
                                    <button className="icon-btn-sm danger" onClick={(e) => { e.stopPropagation(); onDeleteRound(); }} title="ลบ"><FiTrash2 /></button>
                                    <button className="icon-btn-sm" onClick={(e) => { e.stopPropagation(); fetchSummaryData(); }} title="รีเฟรช"><FiRefreshCw /></button>
                                </div>
                                <svg className={`chevron ${isExpanded ? 'rotated' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </div>
                        
                        {/* Stats Section */}
                        {!summaryData.loading && (
                            <div className="closed-round-stats">
                                {/* ยอดรับ Row */}
                                <div className="stats-row incoming-stats">
                                    <div className="stats-section">
                                        <span className="section-label">ยอดรับ  {summaryData.submissions?.length || 0} รายการ</span>
                                        <div className="stats-items">
                                            <span className="stat-box">
                                                <span className="stat-label">ยอดรวม</span>
                                                <span className="stat-value success">+{round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                                            </span>
                                            <span className="stat-box">
                                                <span className="stat-label">ค่าคอม</span>
                                                <span className="stat-value danger">-{round.currency_symbol}{Math.round(grandTotalCommission).toLocaleString()}</span>
                                            </span>
                                            {isAnnounced && (
                                                <>
                                                    <span className="stat-box">
                                                        <span className="stat-label">จ่าย</span>
                                                        <span className={`stat-value ${grandTotalWin > 0 ? 'danger' : ''}`}>{grandTotalWin > 0 ? '-' : ''}{round.currency_symbol}{grandTotalWin.toLocaleString()}</span>
                                                    </span>
                                                    <span className="stat-box">
                                                        <span className="stat-label">กำไร</span>
                                                        <span className={`stat-value ${dealerProfit >= 0 ? 'success' : 'danger'}`}>
                                                            {dealerProfit >= 0 ? '+' : '-'}{round.currency_symbol}{Math.abs(Math.round(dealerProfit)).toLocaleString()}
                                                        </span>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* ยอดส่ง Row - only show if there are outgoing transfers */}
                                {isAnnounced && outgoingTicketCount > 0 && (
                                    <div className="stats-row outgoing-stats">
                                        <div className="stats-section">
                                            <span className="section-label">ยอดส่ง  {outgoingTicketCount} รายการ</span>
                                            <div className="stats-items">
                                                <span className="stat-box">
                                                    <span className="stat-label">ยอดรวม</span>
                                                    <span className="stat-value danger">-{round.currency_symbol}{outgoingTotalBet.toLocaleString()}</span>
                                                </span>
                                                <span className="stat-box">
                                                    <span className="stat-label">ค่าคอม</span>
                                                    <span className="stat-value success">+{round.currency_symbol}{Math.round(outgoingTotalCommission).toLocaleString()}</span>
                                                </span>
                                                <span className="stat-box">
                                                    <span className="stat-label">รับ</span>
                                                    <span className={`stat-value ${outgoingTotalWin > 0 ? 'success' : ''}`}>{outgoingTotalWin > 0 ? '+' : ''}{round.currency_symbol}{outgoingTotalWin.toLocaleString()}</span>
                                                </span>
                                                <span className="stat-box">
                                                    <span className="stat-label">กำไร</span>
                                                    <span className={`stat-value ${outgoingProfit >= 0 ? 'success' : 'danger'}`}>
                                                        {outgoingProfit >= 0 ? '+' : '-'}{round.currency_symbol}{Math.abs(Math.round(outgoingProfit)).toLocaleString()}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* กำไรรวม Row */}
                                {isAnnounced && (
                                    <div className="stats-row total-stats">
                                        <div className="total-profit-display">
                                            <span className="total-label">กำไรรวม</span>
                                            <span className={`total-value ${totalCombinedProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                                                {totalCombinedProfit >= 0 ? '+' : '-'}{round.currency_symbol}{Math.abs(Math.round(totalCombinedProfit)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {summaryData.loading && (
                            <div className="stats-loading">
                                <div className="spinner-sm"></div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Original Layout for Open Rounds */
                    <>
                        <div className="open-round-layout">
                            {/* Row 1: Logo, Name, Status */}
                            <div className="open-round-header-row">
                                <span className={`lottery-badge ${round.lottery_type}`}>{LOTTERY_TYPES[round.lottery_type]}</span>
                                <span className="round-name">{round.lottery_name || LOTTERY_TYPES[round.lottery_type]}</span>
                                {getStatusBadge(round)}
                            </div>
                            
                            {/* Row 2: Date/Time */}
                            <div className="open-round-datetime">
                                <FiCalendar /> {formatDate(round.open_time)} {formatTime(round.open_time)} - {formatDate(round.close_time)} {formatTime(round.close_time)}
                            </div>
                            
                            {/* Row 3: Actions (left) + Chevron (right) */}
                            <div className="open-round-actions-row">
                                <div className="round-actions">
                                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onEditRound(); }} title="แก้ไขงวด"><FiEdit2 /></button>
                                    {round.status === 'open' && <button className="icon-btn warning" onClick={(e) => { e.stopPropagation(); onCloseRound(); }} title="ปิดงวด"><FiLock /></button>}
                                    <button className="icon-btn warning" onClick={(e) => { e.stopPropagation(); onShowNumberLimits(); }} title="ตั้งค่าเลขอั้น"><FiAlertTriangle /></button>
                                    <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); onDeleteRound(); }} title="ลบ"><FiTrash2 /></button>
                                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); fetchSummaryData(); }} title="รีเฟรช"><FiRefreshCw /></button>
                                </div>
                                <svg className={`chevron ${isExpanded ? 'rotated' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                            
                            {/* Row 3: Stats - ยอดรับ/ยอดส่ง (แสดงเฉพาะเมื่อมีรายการ) */}
                            {!summaryData.loading && ((summaryData.submissions?.length || 0) > 0 || outgoingTicketCount > 0) && (
                                <div className="open-round-stats">
                                    {/* ยอดรับ - only show if there are submissions */}
                                    {(summaryData.submissions?.length || 0) > 0 && (
                                        <div className="stats-block incoming">
                                            <div className="stats-block-header">ยอดรับ  {summaryData.submissions?.length || 0} รายการ</div>
                                            <div className="stats-block-items">
                                                <span className="stat-item">
                                                    <span className="stat-label">ยอดรวม</span>
                                                    <span className="stat-value success">+{round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">ค่าคอม</span>
                                                    <span className="stat-value danger">-{round.currency_symbol}{Math.round(grandTotalCommission).toLocaleString()}</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">จ่าย</span>
                                                    <span className="stat-value">{round.currency_symbol}0</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">กำไร</span>
                                                    <span className={`stat-value ${(grandTotalBet - grandTotalCommission) >= 0 ? 'success' : 'danger'}`}>
                                                        {(grandTotalBet - grandTotalCommission) >= 0 ? '+' : '-'}{round.currency_symbol}{Math.abs(Math.round(grandTotalBet - grandTotalCommission)).toLocaleString()}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* ยอดส่ง - only show if there are outgoing transfers */}
                                    {outgoingTicketCount > 0 && (
                                        <div className="stats-block outgoing">
                                            <div className="stats-block-header">ยอดส่ง  {outgoingTicketCount} รายการ</div>
                                            <div className="stats-block-items">
                                                <span className="stat-item">
                                                    <span className="stat-label">ยอดรวม</span>
                                                    <span className="stat-value danger">-{round.currency_symbol}{outgoingTotalBet.toLocaleString()}</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">ค่าคอม</span>
                                                    <span className="stat-value success">+{round.currency_symbol}{Math.round(outgoingTotalCommission).toLocaleString()}</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">รับ</span>
                                                    <span className="stat-value">{round.currency_symbol}0</span>
                                                </span>
                                                <span className="stat-item">
                                                    <span className="stat-label">กำไร</span>
                                                    <span className={`stat-value ${outgoingProfit >= 0 ? 'success' : 'danger'}`}>
                                                        {outgoingProfit >= 0 ? '+' : '-'}{round.currency_symbol}{Math.abs(Math.round(outgoingProfit)).toLocaleString()}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {isExpanded && (
                <div className="round-accordion-content">
                    {/* For CLOSED rounds (not open): Show tabs for submissions and results */}
                    {!isOpen && (
                        <div className="closed-round-tabs">
                            <button
                                className={`btn btn-sm ${closedRoundTab === 'submissions' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setClosedRoundTab('submissions')}
                            >
                                <FiEye /> เลขรับ/เลขตีออก
                            </button>
                            <button
                                className={`btn btn-sm ${closedRoundTab === 'results' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => {
                                    setClosedRoundTab('results')
                                    // Fetch summary data when switching to results tab
                                    if (isAnnounced && summaryData.submissions.length === 0 && !summaryData.loading) {
                                        fetchSummaryData()
                                    }
                                }}
                            >
                                <FiCheck /> ผลรางวัล
                            </button>
                        </div>
                    )}

                    {/* Results Tab Content for closed rounds */}
                    {!isOpen && closedRoundTab === 'results' && (
                        <div className="results-tab-content">
                            {/* Winning Numbers Display - แสดงเสมอถ้ามี winning_numbers */}
                            {round.winning_numbers && (
                                <div className="winning-numbers-display" style={{
                                    background: 'var(--color-surface)',
                                    border: '2px solid var(--color-primary)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '1rem',
                                    marginBottom: '1rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <h4 style={{ margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🏆 ผลรางวัล
                                        </h4>
                                        <button className="btn btn-sm btn-outline" onClick={onShowResults}>
                                            <FiEdit2 /> แก้ไข
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                        {round.lottery_type === 'thai' && (
                                            <>
                                                {round.winning_numbers.first_prize && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>รางวัลที่ 1</div>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{round.winning_numbers.first_prize}</div>
                                                    </div>
                                                )}
                                                {round.winning_numbers.last_3_digits && round.winning_numbers.last_3_digits.length > 0 && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>3 ตัวล่าง</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>{round.winning_numbers.last_3_digits.join(', ')}</div>
                                                    </div>
                                                )}
                                                {round.winning_numbers.last_2_digits && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>2 ตัวล่าง</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>{round.winning_numbers.last_2_digits}</div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {(round.lottery_type === 'lao' || round.lottery_type === 'hanoi') && (
                                            <>
                                                {round.winning_numbers['4_set'] && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>เลขชุด 4 ตัว</div>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{round.winning_numbers['4_set']}</div>
                                                    </div>
                                                )}
                                                {round.winning_numbers['3_top'] && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>3 ตัวบน</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>{round.winning_numbers['3_top']}</div>
                                                    </div>
                                                )}
                                                {round.winning_numbers['2_top'] && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>2 ตัวบน</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>{round.winning_numbers['2_top']}</div>
                                                    </div>
                                                )}
                                                {round.winning_numbers['2_bottom'] && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>2 ตัวล่าง</div>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>{round.winning_numbers['2_bottom']}</div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {round.lottery_type === 'yeekee' && round.winning_numbers.result && (
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>ผลยี่กี</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{round.winning_numbers.result}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ถ้ายังไม่มีผลรางวัล แสดงข้อความและปุ่มใส่ผลรางวัล */}
                            {!round.winning_numbers && (
                                <div style={{
                                    background: 'var(--color-surface)',
                                    border: '2px dashed var(--color-border)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '2rem',
                                    marginBottom: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>ยังไม่ได้ใส่ผลรางวัล</p>
                                    <button className="btn btn-accent" onClick={onShowResults}>
                                        <FiCheck /> ใส่ผลรางวัล
                                    </button>
                                </div>
                            )}

                            {/* User summaries for announced rounds */}
                            {isAnnounced && (
                                summaryData.loading ? (
                                    <div className="loading-state"><div className="spinner"></div></div>
                                ) : (
                                    <>
                                        <div className="user-summary-list">
                                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>รายละเอียดแต่ละคน</h4>
                                            
                                            {/* Tabs for incoming/outgoing */}
                                            <div className="inline-tabs" style={{ marginBottom: '1rem' }}>
                                                <button 
                                                    className={`inline-tab ${summaryTab === 'incoming' ? 'active' : ''}`} 
                                                    onClick={() => setSummaryTab('incoming')}
                                                >
                                                    รับเข้า <span className="tab-count">{userSummaries.length}</span>
                                                </button>
                                                <button 
                                                    className={`inline-tab ${summaryTab === 'outgoing' ? 'active' : ''}`} 
                                                    onClick={() => setSummaryTab('outgoing')}
                                                >
                                                    ตีออก <span className="tab-count">{upstreamSummaries.dealers.length}</span>
                                                </button>
                                            </div>

                                            {/* Incoming Tab Content */}
                                            {summaryTab === 'incoming' && (
                                                <>
                                                    {userSummaries.length > 0 ? (
                                                        userSummaries.map(usr => {
                                                            const userNet = usr.totalWin + usr.totalCommission - usr.totalBet
                                                            const dealerNet = -userNet
                                                            return (
                                                                <div key={usr.userId} className={`user-summary-card ${dealerNet < 0 ? 'loser' : dealerNet > 0 ? 'winner' : ''}`}>
                                                                    <div className="user-summary-header">
                                                                        <div className="user-info">
                                                                            <span className="user-name">{usr.userName}</span>
                                                                            <span className="user-email">{usr.email}</span>
                                                                        </div>
                                                                        <div className={`net-amount ${dealerNet < 0 ? 'negative' : dealerNet > 0 ? 'positive' : ''}`}>
                                                                            {dealerNet > 0 ? '+' : dealerNet < 0 ? '-' : ''}{round.currency_symbol}{Math.abs(dealerNet).toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                    <div className="user-summary-details">
                                                                        <div className="detail-item"><span className="detail-label">แทง</span><span className="detail-value">{usr.ticketCount} รายการ</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ยอดแทง</span><span className="detail-value">{round.currency_symbol}{usr.totalBet.toLocaleString()}</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ค่าคอม</span><span className="detail-value" style={{ color: 'var(--color-warning)' }}>{round.currency_symbol}{usr.totalCommission.toLocaleString()}</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ถูก/ยอดได้</span><span className={`detail-value ${usr.totalWin > 0 ? 'text-success' : ''}`}>{usr.winCount > 0 ? `${usr.winCount}/${round.currency_symbol}${usr.totalWin.toLocaleString()}` : '-'}</span></div>
                                                                    </div>
                                                                    <div className="user-summary-footer">
                                                                        {dealerNet < 0 ? <span className="status-badge lost">ต้องจ่าย {round.currency_symbol}{Math.abs(dealerNet).toLocaleString()}</span>
                                                                            : dealerNet > 0 ? <span className="status-badge won">ต้องเก็บ {round.currency_symbol}{dealerNet.toLocaleString()}</span>
                                                                                : <span className="status-badge pending">เสมอ</span>}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })
                                                    ) : (
                                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                            <p>ไม่มียอดรับเข้าในงวดนี้</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Outgoing Tab Content */}
                                            {summaryTab === 'outgoing' && (
                                                <>
                                                    {upstreamSummaries.loading ? (
                                                        <div className="loading-state"><div className="spinner"></div></div>
                                                    ) : upstreamSummaries.dealers.length > 0 ? (
                                                        upstreamSummaries.dealers.map(dealer => {
                                                            // Calculate net: we sent bets to upstream, if they win we get paid, minus commission
                                                            const ourNet = dealer.totalWin + dealer.totalCommission - dealer.totalBet
                                                            return (
                                                                <div key={dealer.dealerId} className={`user-summary-card ${ourNet > 0 ? 'winner' : ourNet < 0 ? 'loser' : ''}`}>
                                                                    <div className="user-summary-header">
                                                                        <div className="user-info">
                                                                            <span className="user-name">{dealer.dealerName}</span>
                                                                            <span className="user-email">{dealer.dealerContact}</span>
                                                                        </div>
                                                                        <div className={`net-amount ${ourNet > 0 ? 'positive' : ourNet < 0 ? 'negative' : ''}`}>
                                                                            {ourNet > 0 ? '+' : ourNet < 0 ? '-' : ''}{dealer.currencySymbol}{Math.abs(ourNet).toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                    <div className="user-summary-details">
                                                                        <div className="detail-item"><span className="detail-label">แทง</span><span className="detail-value">{dealer.ticketCount} รายการ</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ยอดแทง</span><span className="detail-value">{dealer.currencySymbol}{dealer.totalBet.toLocaleString()}</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ค่าคอม</span><span className="detail-value" style={{ color: 'var(--color-warning)' }}>{dealer.currencySymbol}{Math.round(dealer.totalCommission).toLocaleString()}</span></div>
                                                                        <div className="detail-item"><span className="detail-label">ถูก/ยอดได้</span><span className={`detail-value ${dealer.totalWin > 0 ? 'text-success' : ''}`}>{dealer.winCount > 0 ? `${dealer.winCount}/${dealer.currencySymbol}${dealer.totalWin.toLocaleString()}` : '-'}</span></div>
                                                                    </div>
                                                                    <div className="user-summary-footer">
                                                                        {!dealer.isAnnounced ? (
                                                                            <span className="status-badge pending">รอประกาศผล</span>
                                                                        ) : ourNet > 0 ? (
                                                                            <span className="status-badge won">ต้องเก็บ {dealer.currencySymbol}{ourNet.toLocaleString()}</span>
                                                                        ) : ourNet < 0 ? (
                                                                            <span className="status-badge lost">ต้องจ่าย {dealer.currencySymbol}{Math.abs(ourNet).toLocaleString()}</span>
                                                                        ) : (
                                                                            <span className="status-badge pending">เสมอ</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })
                                                    ) : (
                                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                            <p>ไม่มียอดตีออกในงวดนี้</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </>
                                )
                            )}

                            {/* Message for non-announced closed rounds */}
                            {!isAnnounced && (
                                <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    <p>กรุณาใส่ผลรางวัลเพื่อดูสรุปผล</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Submissions Tab Content - for both open rounds and closed rounds with submissions tab */}
                    {(isOpen || (!isOpen && closedRoundTab === 'submissions')) && (
                        <div className="inline-submissions-view">
                            <div className="inline-global-filters">
                                <div className="search-input-wrapper">
                                    <FiSearch className="search-icon" />
                                    <input
                                        type="text"
                                        value={inlineSearch}
                                        onChange={(e) => setInlineSearch(e.target.value)}
                                        placeholder="ค้นหาเลขหรือบันทึกช่วยจำ..."
                                        className="form-input search-input"
                                        style={{ fontSize: '0.85rem', height: '32px' }}
                                    />
                                    {inlineSearch && (
                                        <button className="search-clear-btn" onClick={() => setInlineSearch('')}><FiX /></button>
                                    )}
                                </div>
                                <div className="filter-select-wrapper">
                                    <select
                                        value={inlineBetTypeFilter}
                                        onChange={(e) => setInlineBetTypeFilter(e.target.value)}
                                        className="form-input filter-select"
                                    >
                                        <option value="all">ทุกประเภท</option>
                                        {Object.entries(BET_TYPES_BY_LOTTERY[round.lottery_type] || {}).map(([type, config]) => (
                                            <option key={type} value={type}>{config.label || BET_TYPES[type] || type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="inline-tabs">
                                <button className={`inline-tab ${inlineTab === 'total' ? 'active' : ''}`} onClick={() => setInlineTab('total')}>
                                    ยอดรวม <span className="tab-count">{inlineSubmissions.length}</span>
                                </button>
                                <button className={`inline-tab ${inlineTab === 'remaining' ? 'active' : ''}`} onClick={() => setInlineTab('remaining')}>
                                    ยอดที่เหลือ <span className="tab-count">{(() => {
                                        // Calculate remaining items (submissions - transfers) grouped by numbers+bet_type
                                        const submissionsByKey = {}
                                        inlineSubmissions.forEach(s => {
                                            const key = `${s.numbers}|${s.bet_type}`
                                            if (!submissionsByKey[key]) submissionsByKey[key] = 0
                                            submissionsByKey[key] += s.amount || 0
                                        })
                                        inlineTransfers.forEach(t => {
                                            const key = `${t.numbers}|${t.bet_type}`
                                            if (submissionsByKey[key]) submissionsByKey[key] -= t.amount || 0
                                        })
                                        // Count items with remaining amount > 0
                                        return Object.values(submissionsByKey).filter(amt => amt > 0).length
                                    })()}</span>
                                </button>
                                <button className={`inline-tab ${inlineTab === 'excess' ? 'active' : ''}`} onClick={() => setInlineTab('excess')}>
                                    ยอดเกิน <span className="tab-count">{excessItems.length}</span>
                                </button>
                                <button className={`inline-tab ${inlineTab === 'transferred' ? 'active' : ''}`} onClick={() => setInlineTab('transferred')}>
                                    ยอดตีออก <span className="tab-count">{inlineTransfers.length}</span>
                                </button>
                                <button 
                                    className="inline-tab refresh-btn" 
                                    onClick={() => fetchInlineSubmissions(true)}
                                    disabled={inlineLoading}
                                    title="รีเฟรชข้อมูล"
                                >
                                    <FiRotateCcw className={inlineLoading ? 'spinning' : ''} />
                                </button>
                            </div>

                            {inlineLoading ? (
                                <div className="loading-state"><div className="spinner"></div></div>
                            ) : (
                                <>
                                    {inlineTab === 'total' && (
                                        <div className="inline-tab-content">
                                            {/* Member filter and view mode - responsive layout */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                {/* Row 0: Member filter buttons */}
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <button
                                                        className={`filter-btn ${memberFilterMode === 'all' ? 'active' : ''}`}
                                                        onClick={() => { setMemberFilterMode('all'); setInlineUserFilter('all'); }}
                                                        style={{
                                                            padding: '0.35rem 0.65rem',
                                                            borderRadius: '20px',
                                                            border: memberFilterMode === 'all' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                            background: memberFilterMode === 'all' ? 'var(--color-primary)' : 'transparent',
                                                            color: memberFilterMode === 'all' ? '#000' : 'var(--color-text)',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        สมาชิกทั้งหมด ({allMembers.length})
                                                    </button>
                                                    <button
                                                        className={`filter-btn ${memberFilterMode === 'submitted' ? 'active' : ''}`}
                                                        onClick={() => { setMemberFilterMode('submitted'); setInlineUserFilter('all'); }}
                                                        style={{
                                                            padding: '0.35rem 0.65rem',
                                                            borderRadius: '20px',
                                                            border: memberFilterMode === 'submitted' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                            background: memberFilterMode === 'submitted' ? 'var(--color-primary)' : 'transparent',
                                                            color: memberFilterMode === 'submitted' ? '#000' : 'var(--color-text)',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        สมาชิกส่งเลข ({[...new Set(inlineSubmissions.map(s => s.user_id))].length})
                                                    </button>
                                                </div>
                                                
                                                {/* Row 0.5: Dropdown + Write bet button */}
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                                                    <select value={inlineUserFilter} onChange={(e) => setInlineUserFilter(e.target.value)} className="form-input" style={{ flex: 1, minHeight: '40px', fontSize: '0.85rem' }}>
                                                        <option value="all">ทุกคน</option>
                                                        {memberFilterMode === 'all' ? (
                                                            allMembers.map(member => (
                                                                <option key={member.id} value={member.full_name || member.email || 'ไม่ระบุ'}>
                                                                    {member.full_name || member.email || 'ไม่ระบุ'}
                                                                </option>
                                                            ))
                                                        ) : (
                                                            [...new Set(inlineSubmissions.map(s => s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'))].map(name => (
                                                                <option key={name} value={name}>{name}</option>
                                                            ))
                                                        )}
                                                    </select>
                                                    {canWriteBetForSelectedMember() && (
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={handleOpenWriteBet}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                whiteSpace: 'nowrap',
                                                                padding: '0 0.75rem',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            <FiFileText /> เขียนโพย
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        onClick={handleCopyTotal}
                                                        disabled={inlineSubmissions.length === 0}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.35rem',
                                                            whiteSpace: 'nowrap',
                                                            padding: '0 0.75rem',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        title="คัดลอกยอดรับรวม"
                                                    >
                                                        <FiCopy /> คัดลอก
                                                    </button>
                                                </div>
                                                
                                                {/* Row 1: View mode toggle (รวม/ใบโพย) + Display mode toggle */}
                                                <div style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    {/* View mode toggle: รวม / ใบโพย */}
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        gap: '2px', 
                                                        background: 'var(--color-surface)', 
                                                        borderRadius: '8px', 
                                                        padding: '3px'
                                                    }}>
                                                        <button
                                                            onClick={() => setTotalViewMode('all')}
                                                            style={{
                                                                padding: '0.4rem 0.75rem',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                background: totalViewMode === 'all' ? 'var(--color-primary)' : 'transparent',
                                                                color: totalViewMode === 'all' ? '#000' : 'var(--color-text-muted)',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '500',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease',
                                                                minWidth: '50px'
                                                            }}
                                                        >
                                                            รวม
                                                        </button>
                                                        <button
                                                            onClick={() => setTotalViewMode('bills')}
                                                            style={{
                                                                padding: '0.4rem 0.75rem',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                background: totalViewMode === 'bills' ? 'var(--color-primary)' : 'transparent',
                                                                color: totalViewMode === 'bills' ? '#000' : 'var(--color-text-muted)',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '500',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease',
                                                                minWidth: '50px'
                                                            }}
                                                        >
                                                            ใบโพย
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Display mode toggle - changes based on view mode */}
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        gap: '2px', 
                                                        background: 'var(--color-surface)', 
                                                        borderRadius: '8px', 
                                                        padding: '3px'
                                                    }}>
                                                        {totalViewMode === 'all' ? (
                                                            <>
                                                                <button
                                                                    onClick={() => setDisplayMode('summary')}
                                                                    style={{
                                                                        padding: '0.4rem 0.6rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: displayMode === 'summary' ? 'var(--color-primary)' : 'transparent',
                                                                        color: displayMode === 'summary' ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: '500',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                    title="แสดงแบบย่อตามที่ป้อน"
                                                                >
                                                                    ย่อ
                                                                </button>
                                                                <button
                                                                    onClick={() => setDisplayMode('detailed')}
                                                                    style={{
                                                                        padding: '0.4rem 0.6rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: displayMode === 'detailed' ? 'var(--color-primary)' : 'transparent',
                                                                        color: displayMode === 'detailed' ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: '500',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                    title="แสดงเต็มทุกรายการ"
                                                                >
                                                                    เต็ม
                                                                </button>
                                                                <button
                                                                    onClick={() => setDisplayMode('grouped')}
                                                                    style={{
                                                                        padding: '0.4rem 0.6rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: displayMode === 'grouped' ? 'var(--color-primary)' : 'transparent',
                                                                        color: displayMode === 'grouped' ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: '500',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                    title="รวมเลขที่เหมือนกัน"
                                                                >
                                                                    รวมเลข
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => setBillDisplayMode('summary')}
                                                                    style={{
                                                                        padding: '0.4rem 0.75rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: billDisplayMode === 'summary' ? 'var(--color-primary)' : 'transparent',
                                                                        color: billDisplayMode === 'summary' ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: '500',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease',
                                                                        minWidth: '50px'
                                                                    }}
                                                                    title="แสดงแบบย่อตามที่ป้อน"
                                                                >
                                                                    ย่อ
                                                                </button>
                                                                <button
                                                                    onClick={() => setBillDisplayMode('detailed')}
                                                                    style={{
                                                                        padding: '0.4rem 0.75rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: billDisplayMode === 'detailed' ? 'var(--color-primary)' : 'transparent',
                                                                        color: billDisplayMode === 'detailed' ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.8rem',
                                                                        fontWeight: '500',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease',
                                                                        minWidth: '50px'
                                                                    }}
                                                                    title="แสดงเต็มทุกรายการ"
                                                                >
                                                                    เต็ม
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Sort toggle - different for bills vs all view */}
                                                    {totalViewMode === 'bills' ? (
                                                        <>
                                                            {/* Bill sort by time */}
                                                            <div style={{ 
                                                                display: 'flex', 
                                                                gap: '2px', 
                                                                background: 'var(--color-surface)', 
                                                                borderRadius: '8px', 
                                                                padding: '3px'
                                                            }}>
                                                                <button
                                                                    onClick={() => setBillSortOrder(billSortOrder === 'desc' ? 'asc' : 'desc')}
                                                                    style={{
                                                                        padding: '0.4rem 0.6rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: 'var(--color-primary)',
                                                                        color: '#000',
                                                                        fontSize: '0.8rem',
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
                                                                padding: '3px'
                                                            }}>
                                                                <button
                                                                    onClick={() => setItemSortMode(itemSortMode === 'asc' ? 'desc' : 'asc')}
                                                                    style={{
                                                                        padding: '0.4rem 0.5rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: (itemSortMode === 'asc' || itemSortMode === 'desc') ? 'var(--color-primary)' : 'transparent',
                                                                        color: (itemSortMode === 'asc' || itemSortMode === 'desc') ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.75rem',
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
                                                                        padding: '0.4rem 0.5rem',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        background: (itemSortMode === 'original' || itemSortMode === 'original_rev') ? 'var(--color-primary)' : 'transparent',
                                                                        color: (itemSortMode === 'original' || itemSortMode === 'original_rev') ? '#000' : 'var(--color-text-muted)',
                                                                        fontSize: '0.75rem',
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
                                                            padding: '3px'
                                                        }}>
                                                            <button
                                                                onClick={() => {
                                                                    if (allViewSortBy === 'time') {
                                                                        setAllViewSortOrder(allViewSortOrder === 'desc' ? 'asc' : 'desc')
                                                                    } else {
                                                                        setAllViewSortBy('time')
                                                                        setAllViewSortOrder('desc')
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '0.4rem 0.6rem',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    background: allViewSortBy === 'time' ? 'var(--color-primary)' : 'transparent',
                                                                    color: allViewSortBy === 'time' ? '#000' : 'var(--color-text-muted)',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '500',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                                title="เรียงตามเวลา"
                                                            >
                                                                เวลา {allViewSortBy === 'time' && (allViewSortOrder === 'desc' ? '↓' : '↑')}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (allViewSortBy === 'number') {
                                                                        setAllViewSortOrder(allViewSortOrder === 'asc' ? 'desc' : 'asc')
                                                                    } else {
                                                                        setAllViewSortBy('number')
                                                                        setAllViewSortOrder('asc')
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '0.4rem 0.6rem',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    background: allViewSortBy === 'number' ? 'var(--color-primary)' : 'transparent',
                                                                    color: allViewSortBy === 'number' ? '#000' : 'var(--color-text-muted)',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '500',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                                title="เรียงตามเลข"
                                                            >
                                                                เลข {allViewSortBy === 'number' && (allViewSortOrder === 'asc' ? '↑' : '↓')}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (allViewSortBy === 'amount') {
                                                                        setAllViewSortOrder(allViewSortOrder === 'desc' ? 'asc' : 'desc')
                                                                    } else {
                                                                        setAllViewSortBy('amount')
                                                                        setAllViewSortOrder('desc')
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '0.4rem 0.6rem',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    background: allViewSortBy === 'amount' ? 'var(--color-primary)' : 'transparent',
                                                                    color: allViewSortBy === 'amount' ? '#000' : 'var(--color-text-muted)',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: '500',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                                title="เรียงตามจำนวนเงิน"
                                                            >
                                                                เงิน {allViewSortBy === 'amount' && (allViewSortOrder === 'desc' ? '↓' : '↑')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* แสดงผลแบบตาราง 2 แถว: หัวข้อ + ค่า */}
                                            <div className="inline-summary-table" style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(3, 1fr)', 
                                                gap: '0.25rem 0.5rem',
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: '0.5rem 0.75rem',
                                                marginBottom: '0.5rem'
                                            }}>
                                                {/* แถวหัวข้อ */}
                                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>จำนวน</span>
                                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ยอดรวม</span>
                                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ค่าคอม</span>
                                                {/* แถวค่า */}
                                                <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{(() => {
                                                    let filtered = inlineSubmissions.filter(s => {
                                                        const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                        if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                        if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                        if (inlineSearch && !s.numbers.includes(inlineSearch) && !(s.bill_note && s.bill_note.toLowerCase().includes(inlineSearch.toLowerCase()))) return false
                                                        return true
                                                    })
                                                    // Use billDisplayMode when in bills view, otherwise use displayMode
                                                    const currentMode = totalViewMode === 'bills' ? billDisplayMode : displayMode
                                                    if (currentMode === 'summary') {
                                                        // Count unique entry_ids
                                                        const entries = new Set()
                                                        filtered.forEach(s => entries.add(s.entry_id || s.id))
                                                        return entries.size
                                                    } else if (currentMode === 'grouped') {
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
                                                <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                    if (inlineSearch && !s.numbers.includes(inlineSearch) && !(s.bill_note && s.bill_note.toLowerCase().includes(inlineSearch.toLowerCase()))) return false
                                                    return true
                                                }).reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</span>
                                                <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--color-warning)' }}>{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                    if (inlineSearch && !s.numbers.includes(inlineSearch) && !(s.bill_note && s.bill_note.toLowerCase().includes(inlineSearch.toLowerCase()))) return false
                                                    return true
                                                }).reduce((sum, s) => sum + getCommission(s), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                            </div>

                                            {/* View Mode: ทั้งหมด (รวมเลข) */}
                                            {totalViewMode === 'all' && (
                                                <div className="inline-table-wrap">
                                                    {(() => {
                                                        // Pre-calculate filteredData for action row - must match table display logic
                                                        let preFilteredData = inlineSubmissions.filter(s => {
                                                            const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                            if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                            if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                            if (inlineSearch && !s.numbers.includes(inlineSearch) && !(s.bill_note && s.bill_note.toLowerCase().includes(inlineSearch.toLowerCase()))) return false
                                                            return true
                                                        })
                                                        
                                                        // Apply same grouping logic as table display
                                                        let processedData = preFilteredData
                                                        if (displayMode === 'summary') {
                                                            const byEntry = {}
                                                            preFilteredData.forEach(s => {
                                                                const entryId = s.entry_id || s.id
                                                                if (!byEntry[entryId]) {
                                                                    byEntry[entryId] = {
                                                                        id: entryId,
                                                                        numbers: s.display_numbers || s.numbers,
                                                                        bet_type: s.bet_type,
                                                                        display_bet_type: s.display_bet_type || BET_TYPES_BY_LOTTERY[round.lottery_type]?.[s.bet_type]?.label || BET_TYPES[s.bet_type] || s.bet_type,
                                                                        amount: 0,
                                                                        display_amount: s.display_amount,
                                                                        count: 0,
                                                                        ids: [],
                                                                        created_at: s.created_at
                                                                    }
                                                                }
                                                                byEntry[entryId].amount += s.amount
                                                                byEntry[entryId].count += 1
                                                                byEntry[entryId].ids.push(s.id)
                                                            })
                                                            processedData = Object.values(byEntry)
                                                        } else if (displayMode === 'grouped') {
                                                            const grouped = {}
                                                            preFilteredData.forEach(s => {
                                                                const normalizedNumbers = normalizeNumber(s.numbers, s.bet_type)
                                                                const key = `${normalizedNumbers}|${s.bet_type}`
                                                                if (!grouped[key]) {
                                                                    grouped[key] = { numbers: normalizedNumbers, originalNumbers: [s.numbers], bet_type: s.bet_type, amount: 0, count: 0, id: key, ids: [], created_at: s.created_at }
                                                                } else {
                                                                    if (!grouped[key].originalNumbers.includes(s.numbers)) grouped[key].originalNumbers.push(s.numbers)
                                                                }
                                                                grouped[key].amount += s.amount
                                                                grouped[key].count += 1
                                                                grouped[key].ids.push(s.id)
                                                            })
                                                            processedData = Object.values(grouped)
                                                        }
                                                        
                                                        const preUseGroupedIds = displayMode === 'summary' || displayMode === 'grouped'
                                                        const preAllIds = preUseGroupedIds ? processedData.flatMap(g => g.ids) : processedData.map(s => s.id)
                                                        const hasEditableMemberPre = !isOpen && preFilteredData.some(sub => canEditBillForUser(sub.user_id))
                                                        const canBulkEditPre = isOpen || hasEditableMemberPre
                                                        const displayCount = processedData.length

                                                        return (
                                                            <>
                                                                {/* Action Row - เลือกทั้งหมด/ลบ/คัดลอก (moved above table) */}
                                                                {processedData.length > 0 && (
                                                                    <div style={{ 
                                                                        display: 'flex', 
                                                                        alignItems: 'center', 
                                                                        gap: '0.75rem', 
                                                                        padding: '0.5rem 0.75rem',
                                                                        background: 'var(--color-surface)',
                                                                        borderRadius: '0.5rem 0.5rem 0 0',
                                                                        borderBottom: '1px solid var(--color-border)',
                                                                        flexWrap: 'wrap'
                                                                    }}>
                                                                        {canBulkEditPre && (
                                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                                <input 
                                                                                    type="checkbox" 
                                                                                    checked={preAllIds.length > 0 && preAllIds.every(id => selectedItems[id])}
                                                                                    onChange={() => toggleSelectAllItems(preAllIds)}
                                                                                    style={{ width: '16px', height: '16px' }}
                                                                                />
                                                                                <span style={{ fontSize: '0.85rem' }}>เลือกทั้งหมด</span>
                                                                            </label>
                                                                        )}
                                                                        {canBulkEditPre && getSelectedItemsCount(preAllIds) > 0 && (
                                                                            <button 
                                                                                className="btn btn-danger btn-sm"
                                                                                onClick={() => handleDeleteSelectedItems(preAllIds)}
                                                                                disabled={deletingItems}
                                                                                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                                                            >
                                                                                <FiTrash2 /> ลบ ({getSelectedItemsCount(preAllIds)})
                                                                            </button>
                                                                        )}
                                                                        {/* Copy button - always visible */}
                                                                        <button 
                                                                            className="btn btn-sm"
                                                                            onClick={() => handleCopySelectedItems(processedData, getSelectedItemsCount(preAllIds) > 0 ? preAllIds.filter(id => selectedItems[id]) : preAllIds)}
                                                                            style={{ 
                                                                                fontSize: '0.8rem', 
                                                                                padding: '0.25rem 0.5rem',
                                                                                background: 'var(--color-primary)',
                                                                                color: 'white'
                                                                            }}
                                                                        >
                                                                            <FiCopy /> คัดลอก ({getSelectedItemsCount(preAllIds) > 0 ? getSelectedItemsCount(preAllIds) : displayCount})
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )
                                                    })()}
                                                    <table className="inline-table">
                                                        <thead>
                                                            <tr>
                                                                {isOpen && <th style={{ width: '30px' }}></th>}
                                                                <th>เลข</th>
                                                                <th>ประเภท</th>
                                                                <th>จำนวน</th>
                                                                {displayMode === 'detailed' && <th style={{ textAlign: 'right' }}>เวลา</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(() => {
                                                                let filteredData = inlineSubmissions.filter(s => {
                                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                                    if (inlineSearch && !s.numbers.includes(inlineSearch) && !(s.bill_note && s.bill_note.toLowerCase().includes(inlineSearch.toLowerCase()))) return false
                                                                    return true
                                                                })

                                                                // Display mode logic:
                                                                // 'summary' = แสดงแบบย่อตาม entry_id (ตามที่ป้อน)
                                                                // 'detailed' = แสดงเต็มทุกรายการไม่รวม
                                                                // 'grouped' = แสดงเต็มรวมเลขที่เหมือนกัน
                                                                
                                                                if (displayMode === 'summary') {
                                                                    // Group by entry_id to show as entered
                                                                    const byEntry = {}
                                                                    filteredData.forEach(s => {
                                                                        const entryId = s.entry_id || s.id
                                                                        if (!byEntry[entryId]) {
                                                                            byEntry[entryId] = {
                                                                                id: entryId,
                                                                                numbers: s.display_numbers || s.numbers,
                                                                                bet_type: s.bet_type,
                                                                                display_bet_type: s.display_bet_type || BET_TYPES_BY_LOTTERY[round.lottery_type]?.[s.bet_type]?.label || BET_TYPES[s.bet_type] || s.bet_type,
                                                                                amount: 0,
                                                                                display_amount: s.display_amount,
                                                                                count: 0,
                                                                                ids: [],
                                                                                created_at: s.created_at
                                                                            }
                                                                        }
                                                                        byEntry[entryId].amount += s.amount
                                                                        byEntry[entryId].count += 1
                                                                        byEntry[entryId].ids.push(s.id)
                                                                    })
                                                                    // Sort by created_at to maintain original order
                                                                    filteredData = Object.values(byEntry).sort((a, b) => 
                                                                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                    )
                                                                } else if (displayMode === 'grouped') {
                                                                    // Group by normalized numbers + bet_type
                                                                    const grouped = {}
                                                                    filteredData.forEach(s => {
                                                                        const normalizedNumbers = normalizeNumber(s.numbers, s.bet_type)
                                                                        const key = `${normalizedNumbers}|${s.bet_type}`
                                                                        if (!grouped[key]) {
                                                                            grouped[key] = { numbers: normalizedNumbers, originalNumbers: [s.numbers], bet_type: s.bet_type, amount: 0, count: 0, id: key, ids: [], created_at: s.created_at }
                                                                        } else {
                                                                            if (!grouped[key].originalNumbers.includes(s.numbers)) grouped[key].originalNumbers.push(s.numbers)
                                                                        }
                                                                        grouped[key].amount += s.amount
                                                                        grouped[key].count += 1
                                                                        grouped[key].ids.push(s.id)
                                                                    })
                                                                    filteredData = Object.values(grouped)
                                                                }
                                                                // 'detailed' mode: keep filteredData as-is (individual submissions)
                                                                
                                                                // Sort based on allViewSortBy and allViewSortOrder
                                                                filteredData = [...filteredData].sort((a, b) => {
                                                                    if (allViewSortBy === 'time') {
                                                                        const timeA = new Date(a.created_at).getTime()
                                                                        const timeB = new Date(b.created_at).getTime()
                                                                        return allViewSortOrder === 'desc' ? timeB - timeA : timeA - timeB
                                                                    } else if (allViewSortBy === 'number') {
                                                                        const numA = a.numbers || ''
                                                                        const numB = b.numbers || ''
                                                                        // Group by digit count first, then sort within groups
                                                                        const digitDiff = numA.length - numB.length
                                                                        if (digitDiff !== 0) {
                                                                            return allViewSortOrder === 'asc' ? digitDiff : -digitDiff
                                                                        }
                                                                        // Same digit count, sort by number value
                                                                        const comparison = numA.localeCompare(numB, undefined, { numeric: true })
                                                                        return allViewSortOrder === 'asc' ? comparison : -comparison
                                                                    } else if (allViewSortBy === 'amount') {
                                                                        const amtA = a.amount || 0
                                                                        const amtB = b.amount || 0
                                                                        return allViewSortOrder === 'desc' ? amtB - amtA : amtA - amtB
                                                                    }
                                                                    return 0
                                                                })

                                                                const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                const setPrice = round?.set_prices?.['4_top'] || 120
                                                                const useGroupedIds = displayMode === 'summary' || displayMode === 'grouped'
                                                                const allIds = useGroupedIds ? filteredData.flatMap(g => g.ids) : filteredData.map(s => s.id)

                                                                // Check if any member in the filtered data hasn't changed password (for closed/announced rounds)
                                                                const hasEditableMember = !isOpen && filteredData.some(sub => canEditBillForUser(sub.user_id))
                                                                const canBulkEdit = isOpen || hasEditableMember

                                                                return (
                                                                    <>
                                                                        {filteredData.map(sub => {
                                                                            const isSet4Digit = sub.bet_type === '4_set' || sub.bet_type === '4_top'
                                                                            const setCount = isSetBasedLottery && isSet4Digit ? Math.ceil(sub.amount / setPrice) : 0
                                                                            const itemIds = useGroupedIds ? sub.ids : [sub.id]
                                                                            const isSelected = itemIds.some(id => selectedItems[id])

                                                                            // Display label based on mode
                                                                            let displayLabel = BET_TYPES_BY_LOTTERY[round.lottery_type]?.[sub.bet_type]?.label || BET_TYPES[sub.bet_type] || sub.bet_type
                                                                            if (displayMode === 'summary' && sub.display_bet_type) {
                                                                                displayLabel = sub.display_bet_type
                                                                            }

                                                                            return (
                                                                                <tr key={sub.id} style={{ background: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                                                                                    {isOpen && (
                                                                                        <td>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={itemIds.every(id => selectedItems[id])}
                                                                                                onChange={() => itemIds.forEach(id => toggleSelectItem(id))}
                                                                                                style={{ width: '16px', height: '16px' }}
                                                                                            />
                                                                                        </td>
                                                                                    )}
                                                                                    <td className="number-cell">
                                                                                        <div className="number-value">{sub.numbers}</div>
                                                                                        {(displayMode === 'summary' || displayMode === 'grouped') && sub.count > 1 && (
                                                                                            <div className="count-sub-label">({sub.count} รายการ)</div>
                                                                                        )}
                                                                                    </td>
                                                                                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                                        {displayLabel}
                                                                                    </td>
                                                                                    <td>
                                                                                        {displayMode === 'summary' && sub.display_amount ? (
                                                                                            <>{round.currency_symbol}{sub.display_amount}</>
                                                                                        ) : (
                                                                                            <>{round.currency_symbol}{sub.amount.toLocaleString()}</>
                                                                                        )}
                                                                                        {isSetBasedLottery && isSet4Digit && setCount > 0 && displayMode !== 'summary' && (
                                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({setCount} ชุด)</div>
                                                                                        )}
                                                                                    </td>
                                                                                    {displayMode === 'detailed' && <td className="time-cell" style={{ textAlign: 'right' }}>{new Date(sub.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>}
                                                                                </tr>
                                                                            )
                                                                        })}
                                                                    </>
                                                                )
                                                            })()}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* View Mode: แยกใบโพย */}
                                            {totalViewMode === 'bills' && (
                                                <div className="bills-view" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {(() => {
                                                        const bills = getSubmissionsByBills()
                                                        // Filter by user if selected
                                                        const filteredBills = bills.filter(b => {
                                                            if (inlineUserFilter !== 'all' && b.user_name !== inlineUserFilter) return false
                                                            if (inlineBetTypeFilter !== 'all' && !b.items.some(item => item.bet_type === inlineBetTypeFilter)) return false
                                                            if (inlineSearch && !(b.bill_note && b.bill_note.toLowerCase().includes(inlineSearch.toLowerCase())) && !b.items.some(item => item.numbers.includes(inlineSearch))) return false
                                                            return true
                                                        })
                                                        
                                                        // Sort bills by time only
                                                        const sortedBills = [...filteredBills].sort((a, b) => {
                                                            const timeA = new Date(a.created_at).getTime()
                                                            const timeB = new Date(b.created_at).getTime()
                                                            return billSortOrder === 'desc' ? timeB - timeA : timeA - timeB
                                                        })
                                                        
                                                        // Group bills by user
                                                        const billsByUser = {}
                                                        sortedBills.forEach(bill => {
                                                            if (!billsByUser[bill.user_name]) {
                                                                billsByUser[bill.user_name] = { user_name: bill.user_name, user_id: bill.user_id, bills: [], total: 0, totalCommission: 0 }
                                                            }
                                                            billsByUser[bill.user_name].bills.push(bill)
                                                            billsByUser[bill.user_name].total += bill.total
                                                            billsByUser[bill.user_name].totalCommission += bill.items.reduce((sum, item) => sum + getCommission(item), 0)
                                                        })

                                                        if (Object.keys(billsByUser).length === 0) {
                                                            return <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>ไม่มีข้อมูล</div>
                                                        }

                                                        return Object.values(billsByUser).map(userGroup => {
                                                            const userKey = userGroup.user_id || userGroup.user_name
                                                            const isUserExpanded = expandedUserGroups.includes(userKey)
                                                            // Calculate total items, bills count, total amount and commission based on billDisplayMode and filter
                                                            let filteredBillsCount = 0
                                                            let filteredTotal = 0
                                                            let filteredCommission = 0
                                                            const totalItems = userGroup.bills.reduce((sum, bill) => {
                                                                // Filter items by bet type if selected
                                                                let filteredItems = bill.items
                                                                if (inlineBetTypeFilter !== 'all') {
                                                                    filteredItems = filteredItems.filter(item => item.bet_type === inlineBetTypeFilter)
                                                                }
                                                                // Only count bill if it has filtered items
                                                                if (filteredItems.length > 0) {
                                                                    filteredBillsCount++
                                                                    filteredTotal += filteredItems.reduce((s, item) => s + item.amount, 0)
                                                                    filteredCommission += filteredItems.reduce((s, item) => s + getCommission(item), 0)
                                                                }
                                                                if (billDisplayMode === 'summary') {
                                                                    const byEntry = {}
                                                                    filteredItems.forEach(item => {
                                                                        const entryId = item.entry_id || item.id
                                                                        if (!byEntry[entryId]) byEntry[entryId] = true
                                                                    })
                                                                    return sum + Object.keys(byEntry).length
                                                                }
                                                                return sum + filteredItems.length
                                                            }, 0)
                                                            
                                                            return (
                                                            <div key={userKey} style={{ marginBottom: '0.5rem' }}>
                                                                {/* User header - clickable to expand/collapse */}
                                                                <div 
                                                                    onClick={() => toggleUserGroupExpand(userKey)}
                                                                    style={{ 
                                                                        display: 'flex', 
                                                                        justifyContent: 'space-between', 
                                                                        alignItems: 'center',
                                                                        padding: '0.5rem 0.75rem',
                                                                        background: 'var(--color-primary)',
                                                                        color: '#000',
                                                                        borderRadius: isUserExpanded ? '8px 8px 0 0' : '8px',
                                                                        fontWeight: '600',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <span style={{ transition: 'transform 0.2s', transform: isUserExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                                            <FiChevronRight size={16} />
                                                                        </span>
                                                                        <div>
                                                                            <span>👤 {userGroup.user_name}</span>
                                                                            <div style={{ fontSize: '0.7rem', fontWeight: '400', opacity: 0.8 }}>
                                                                                {filteredBillsCount} ใบโพย • {totalItems} รายการ
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                        <span style={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.7)' }}>
                                                                            คอม {round.currency_symbol}{(inlineBetTypeFilter === 'all' ? userGroup.totalCommission : filteredCommission).toLocaleString()}
                                                                        </span>
                                                                        <span>{round.currency_symbol}{(inlineBetTypeFilter === 'all' ? userGroup.total : filteredTotal).toLocaleString()}</span>
                                                                        {/* Allow delete for: 1) open rounds, or 2) closed/announced rounds if user hasn't changed password */}
                                                                        {(isOpen || canEditBillForUser(userGroup.user_id)) && (
                                                                            <button 
                                                                                className="btn btn-icon btn-sm"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    const allItemIds = userGroup.bills.flatMap(bill => bill.items.map(item => item.id))
                                                                                    if (window.confirm(`ต้องการลบข้อมูลทั้งหมดของ ${userGroup.user_name} (${allItemIds.length} รายการ) หรือไม่?`)) {
                                                                                        handleDeleteMultipleItems(allItemIds)
                                                                                    }
                                                                                }}
                                                                                title={`ลบข้อมูลทั้งหมดของ ${userGroup.user_name}`}
                                                                                style={{ padding: '0.2rem 0.35rem', background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '4px' }}
                                                                            >
                                                                                <FiTrash2 size={14} style={{ color: '#000' }} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Bills for this user - Collapsible cards */}
                                                                {isUserExpanded && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 8px 8px', border: '1px solid var(--color-border)', borderTop: 'none' }}>
                                                                    {userGroup.bills.map((bill, billIdx) => {
                                                                        const billKey = `${bill.user_id}|${bill.bill_id}`
                                                                        const isExpanded = expandedBills.includes(billKey)
                                                                        const billTime = new Date(bill.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                                                                        
                                                                        return (
                                                                            <div key={bill.bill_id} className={`bill-card-new ${isExpanded ? 'expanded' : ''}`} style={{ 
                                                                                border: '1px solid var(--color-border)',
                                                                                borderRadius: '8px',
                                                                                background: 'var(--color-surface)',
                                                                                overflow: 'hidden'
                                                                            }}>
                                                                                {/* Bill header - clickable to expand/collapse */}
                                                                                <div 
                                                                                    onClick={() => toggleBillExpand(billKey)}
                                                                                    style={{ 
                                                                                        display: 'flex', 
                                                                                        justifyContent: 'space-between', 
                                                                                        alignItems: 'center',
                                                                                        padding: '0.6rem 0.75rem',
                                                                                        background: isExpanded ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.08)',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'background 0.2s ease'
                                                                                    }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                        <span style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                                                            <FiChevronRight size={16} />
                                                                                        </span>
                                                                                        <div>
                                                                                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                                                                                                {bill.bill_note || `ใบโพย ${billIdx + 1}`}
                                                                                            </div>
                                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                                {billTime} • {(() => {
                                                                                                    // Filter items by bet type if selected
                                                                                                    let filteredItems = bill.items
                                                                                                    if (inlineBetTypeFilter !== 'all') {
                                                                                                        filteredItems = filteredItems.filter(item => item.bet_type === inlineBetTypeFilter)
                                                                                                    }
                                                                                                    if (billDisplayMode === 'summary') {
                                                                                                        const byEntry = {}
                                                                                                        filteredItems.forEach(item => {
                                                                                                            const entryId = item.entry_id || item.id
                                                                                                            if (!byEntry[entryId]) byEntry[entryId] = true
                                                                                                        })
                                                                                                        return Object.keys(byEntry).length
                                                                                                    }
                                                                                                    return filteredItems.length
                                                                                                })()} รายการ
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                                            คอม {round.currency_symbol}{(() => {
                                                                                                if (inlineBetTypeFilter === 'all') return bill.items.reduce((sum, item) => sum + getCommission(item), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
                                                                                                return bill.items.filter(item => item.bet_type === inlineBetTypeFilter).reduce((sum, item) => sum + getCommission(item), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
                                                                                            })()}
                                                                                        </span>
                                                                                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                                                                                            {round.currency_symbol}{(() => {
                                                                                                if (inlineBetTypeFilter === 'all') return bill.total.toLocaleString()
                                                                                                return bill.items.filter(item => item.bet_type === inlineBetTypeFilter).reduce((sum, item) => sum + item.amount, 0).toLocaleString()
                                                                                            })()}
                                                                                        </span>
                                                                                        {/* Allow edit/delete for: 1) open rounds, or 2) closed/announced rounds if user hasn't changed password */}
                                                                                        {(isOpen || canEditBillForUser(bill.user_id)) && (
                                                                                            <>
                                                                                                <button 
                                                                                                    className="btn btn-icon btn-sm"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation()
                                                                                                        handleEditBill(bill.bill_id, bill.items, bill.user_id)
                                                                                                    }}
                                                                                                    title="แก้ไขใบโพย"
                                                                                                    style={{ padding: '0.25rem 0.4rem', color: 'var(--color-primary)' }}
                                                                                                >
                                                                                                    <FiEdit2 size={14} />
                                                                                                </button>
                                                                                                <button 
                                                                                                    className="btn btn-icon btn-sm btn-danger"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation()
                                                                                                        handleDeleteBill(bill.items)
                                                                                                    }}
                                                                                                    title="ลบใบโพย"
                                                                                                    style={{ padding: '0.25rem 0.4rem' }}
                                                                                                >
                                                                                                    <FiTrash2 size={14} />
                                                                                                </button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                
                                                                                {/* Bill items - Collapsible */}
                                                                                {isExpanded && (
                                                                                    <div style={{ borderTop: '1px solid var(--color-border)' }}>
                                                                                        {/* Table Header */}
                                                                                        <div style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            padding: '0.4rem 0.75rem',
                                                                                            background: 'var(--color-surface-light)',
                                                                                            borderBottom: '1px solid var(--color-border)',
                                                                                            fontSize: '0.75rem',
                                                                                            color: 'var(--color-text-muted)',
                                                                                            fontWeight: '600'
                                                                                        }}>
                                                                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                                                                <span style={{ minWidth: '60px' }}>เลข</span>
                                                                                                <span>ประเภท</span>
                                                                                            </div>
                                                                                            <span>จำนวน</span>
                                                                                        </div>
                                                                                        {(() => {
                                                                                            // Sort items by created_at first to ensure correct order
                                                                                            let displayItems = [...bill.items].sort((a, b) => 
                                                                                                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                                            )
                                                                                            // Filter items by bet type if selected
                                                                                            if (inlineBetTypeFilter !== 'all') {
                                                                                                displayItems = displayItems.filter(item => item.bet_type === inlineBetTypeFilter)
                                                                                            }
                                                                                            // Group items by entry_id for summary mode
                                                                                            if (billDisplayMode === 'summary') {
                                                                                                const byEntry = {}
                                                                                                displayItems.forEach(item => {
                                                                                                    const entryId = item.entry_id || item.id
                                                                                                    if (!byEntry[entryId]) {
                                                                                                        byEntry[entryId] = {
                                                                                                            id: entryId,
                                                                                                            numbers: item.display_numbers || item.numbers,
                                                                                                            bet_type: item.bet_type,
                                                                                                            display_bet_type: item.display_bet_type || BET_TYPES_BY_LOTTERY[round.lottery_type]?.[item.bet_type]?.label || BET_TYPES[item.bet_type] || item.bet_type,
                                                                                                            amount: 0,
                                                                                                            display_amount: item.display_amount,
                                                                                                            count: 0,
                                                                                                            ids: [],
                                                                                                            created_at: item.created_at
                                                                                                        }
                                                                                                    }
                                                                                                    byEntry[entryId].amount += item.amount
                                                                                                    byEntry[entryId].count += 1
                                                                                                    byEntry[entryId].ids.push(item.id)
                                                                                                })
                                                                                                // Sort by created_at to maintain original order
                                                                                                displayItems = Object.values(byEntry).sort((a, b) => 
                                                                                                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                                                )
                                                                                            }
                                                                                            
                                                                                            // Sort items based on itemSortMode
                                                                                            const sortedItems = (() => {
                                                                                                if (itemSortMode === 'original') {
                                                                                                    // Sort by created_at ascending (oldest first)
                                                                                                    return [...displayItems].sort((a, b) => 
                                                                                                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                                                                    )
                                                                                                } else if (itemSortMode === 'original_rev') {
                                                                                                    // Sort by created_at descending (newest first)
                                                                                                    return [...displayItems].sort((a, b) => 
                                                                                                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                                                                                    )
                                                                                                } else {
                                                                                                    // asc or desc - sort by number
                                                                                                    return [...displayItems].sort((a, b) => {
                                                                                                        const numA = a.numbers || ''
                                                                                                        const numB = b.numbers || ''
                                                                                                        const comparison = numA.localeCompare(numB, undefined, { numeric: true })
                                                                                                        return itemSortMode === 'asc' ? comparison : -comparison
                                                                                                    })
                                                                                                }
                                                                                            })()
                                                                                            
                                                                                            return sortedItems.map((item, itemIdx) => (
                                                                                                <div key={item.id} style={{ 
                                                                                                    display: 'flex', 
                                                                                                    justifyContent: 'space-between', 
                                                                                                    alignItems: 'center',
                                                                                                    padding: '0.5rem 0.75rem',
                                                                                                    borderBottom: itemIdx < displayItems.length - 1 ? '1px dashed var(--color-border)' : 'none',
                                                                                                    background: 'var(--color-surface)'
                                                                                                }}>
                                                                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                                                                        <span style={{ fontWeight: '600', fontSize: '0.95rem', minWidth: '60px', fontFamily: "'Monaco', 'Menlo', monospace", color: 'var(--color-primary)', letterSpacing: '0.1em' }}>
                                                                                                            {item.numbers}
                                                                                                        </span>
                                                                                                        <div>
                                                                                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                                                                {BET_TYPES_BY_LOTTERY[round.lottery_type]?.[item.bet_type]?.label || BET_TYPES[item.bet_type] || item.bet_type}
                                                                                                            </span>
                                                                                                            {billDisplayMode === 'summary' && item.count > 1 && (
                                                                                                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
                                                                                                                    ({item.count} รายการ)
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                        <span style={{ fontWeight: '500' }}>
                                                                                                            {round.currency_symbol}{item.amount.toLocaleString()}
                                                                                                        </span>
                                                                                                        {/* Allow delete for: 1) open rounds, or 2) closed/announced rounds if user hasn't changed password */}
                                                                                                        {(isOpen || canEditBillForUser(bill.user_id)) && billDisplayMode === 'summary' && (
                                                                                                            <button 
                                                                                                                className="btn btn-icon btn-sm"
                                                                                                                onClick={(e) => {
                                                                                                                    e.stopPropagation()
                                                                                                                    handleDeleteSingleItem(item.ids || [item.id])
                                                                                                                }}
                                                                                                                title="ลบ"
                                                                                                                style={{ padding: '0.15rem', color: 'var(--color-danger)' }}
                                                                                                            >
                                                                                                                <FiTrash2 size={12} />
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))
                                                                                        })()}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                                )}
                                                            </div>
                                                        )
                                                        })
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {inlineTab === 'remaining' && (
                                        <div className="inline-tab-content">
                                            {(() => {
                                                // Calculate remaining amounts (submissions - transfers) grouped by numbers+bet_type
                                                const remainingByKey = {}
                                                inlineSubmissions.forEach(s => {
                                                    const key = `${s.numbers}|${s.bet_type}`
                                                    if (!remainingByKey[key]) {
                                                        remainingByKey[key] = {
                                                            numbers: s.numbers,
                                                            bet_type: s.bet_type,
                                                            display_bet_type: s.display_bet_type || BET_TYPES_BY_LOTTERY[round.lottery_type]?.[s.bet_type]?.label || BET_TYPES[s.bet_type] || s.bet_type,
                                                            totalAmount: 0,
                                                            transferredAmount: 0
                                                        }
                                                    }
                                                    remainingByKey[key].totalAmount += s.amount || 0
                                                })
                                                inlineTransfers.forEach(t => {
                                                    const key = `${t.numbers}|${t.bet_type}`
                                                    if (remainingByKey[key]) {
                                                        remainingByKey[key].transferredAmount += t.amount || 0
                                                    }
                                                })
                                                
                                                // Filter to only items with remaining amount > 0
                                                let remainingItems = Object.values(remainingByKey)
                                                    .map(item => ({
                                                        ...item,
                                                        remainingAmount: item.totalAmount - item.transferredAmount
                                                    }))
                                                    .filter(item => item.remainingAmount > 0)
                                                
                                                // Apply filters
                                                if (inlineBetTypeFilter !== 'all') {
                                                    remainingItems = remainingItems.filter(item => item.bet_type === inlineBetTypeFilter)
                                                }
                                                if (inlineSearch) {
                                                    remainingItems = remainingItems.filter(item => item.numbers.includes(inlineSearch))
                                                }
                                                
                                                // Sort by numbers
                                                remainingItems.sort((a, b) => {
                                                    const digitDiff = a.numbers.length - b.numbers.length
                                                    if (digitDiff !== 0) return digitDiff
                                                    return a.numbers.localeCompare(b.numbers)
                                                })

                                                if (remainingItems.length === 0) {
                                                    return (
                                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                            <FiCheckCircle style={{ fontSize: '2rem', color: 'var(--color-success)', marginBottom: '0.5rem' }} />
                                                            <p style={{ color: 'var(--color-text-muted)' }}>ตีออกหมดแล้ว ไม่มียอดที่เหลือ</p>
                                                        </div>
                                                    )
                                                }

                                                const totalRemaining = remainingItems.reduce((sum, item) => sum + item.remainingAmount, 0)

                                                return (
                                                    <>
                                                        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--color-surface)', borderRadius: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                                <span style={{ color: 'var(--color-text-muted)', flex: 1 }}>จำนวน</span>
                                                                <span style={{ color: 'var(--color-text-muted)', flex: 1, textAlign: 'right' }}>ยอดที่เหลือ</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ fontWeight: 600, flex: 1 }}>{remainingItems.length} รายการ</span>
                                                                <span style={{ fontWeight: 600, color: 'var(--color-warning)', flex: 1, textAlign: 'right' }}>
                                                                    {round.currency_symbol}{totalRemaining.toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Remaining items table */}
                                                        <div className="inline-table-wrap">
                                                            <table className="inline-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th>เลข</th>
                                                                        <th>ประเภท</th>
                                                                        <th>ยอดรวม</th>
                                                                        <th style={{ textAlign: 'right' }}>เหลือ</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {remainingItems.map((item, idx) => (
                                                                        <tr key={`${item.numbers}-${item.bet_type}-${idx}`}>
                                                                            <td className="number-cell">
                                                                                <div className="number-value">{item.numbers}</div>
                                                                            </td>
                                                                            <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                                {item.display_bet_type}
                                                                            </td>
                                                                            <td style={{ color: 'var(--color-text-muted)' }}>
                                                                                {round.currency_symbol}{item.totalAmount.toLocaleString()}
                                                                            </td>
                                                                            <td style={{ fontWeight: 600, color: 'var(--color-warning)', textAlign: 'right' }}>
                                                                                {round.currency_symbol}{item.remainingAmount.toLocaleString()}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    )}

                                    {inlineTab === 'excess' && (() => {
                                        const filteredExcessItems = excessItems.filter(item => {
                                            if (inlineBetTypeFilter !== 'all' && item.bet_type !== inlineBetTypeFilter) return false
                                            if (inlineSearch && !item.numbers.includes(inlineSearch)) return false
                                            return true
                                        })
                                        const filteredSelectedCount = filteredExcessItems.filter(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`]).length

                                        return (
                                            <div className="inline-tab-content">
                                                {filteredExcessItems.length === 0 ? (
                                                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                        <FiCheck style={{ fontSize: '2rem', color: 'var(--color-success)', marginBottom: '0.5rem' }} />
                                                        <p style={{ color: 'var(--color-text-muted)' }}>{excessItems.length === 0 ? 'ไม่มียอดเกิน' : 'ไม่พบรายการที่ค้นหา'}</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="inline-summary" style={{ marginBottom: '1rem' }}>
                                                            <div className="summary-item">
                                                                <span className="label">ยอดเกินรวม</span>
                                                                <span className="value text-warning">
                                                                    {filteredExcessItems.some(i => i.isSetBased)
                                                                        ? `${filteredExcessItems.reduce((sum, i) => sum + (i.isSetBased ? i.excess : 0), 0)} ชุด`
                                                                        : `${round.currency_symbol}${filteredExcessItems.reduce((sum, i) => sum + i.excess, 0).toLocaleString()}`}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: '8px' }}>
                                                            <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filteredExcessItems.length > 0 && filteredExcessItems.every(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])}
                                                                    onChange={() => {
                                                                        const allSelected = filteredExcessItems.every(item => selectedExcessItems[`${item.bet_type}|${item.numbers}`])
                                                                        if (allSelected) {
                                                                            const newSelected = { ...selectedExcessItems }
                                                                            filteredExcessItems.forEach(item => { delete newSelected[`${item.bet_type}|${item.numbers}`] })
                                                                            setSelectedExcessItems(newSelected)
                                                                        } else {
                                                                            const newSelected = { ...selectedExcessItems }
                                                                            filteredExcessItems.forEach(item => { newSelected[`${item.bet_type}|${item.numbers}`] = true })
                                                                            setSelectedExcessItems(newSelected)
                                                                        }
                                                                    }}
                                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                                                                />
                                                                <span>เลือกทั้งหมด ({filteredExcessItems.length})</span>
                                                            </label>
                                                            <button
                                                                className="btn btn-warning"
                                                                onClick={(e) => { e.stopPropagation(); if (filteredSelectedCount === 0) { toast.warning('กรุณาเลือกรายการที่ต้องการตีออก'); return; } setShowTransferModal(true); }}
                                                                disabled={filteredSelectedCount === 0}
                                                            >
                                                                <FiSend /> ตีออก ({filteredSelectedCount})
                                                            </button>
                                                        </div>

                                                        {/* Table Header */}
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center',
                                                            padding: '0.5rem 1rem',
                                                            background: 'var(--color-surface-light)',
                                                            borderBottom: '1px solid var(--color-border)',
                                                            fontSize: '0.75rem',
                                                            color: 'var(--color-text-muted)',
                                                            fontWeight: '600',
                                                            borderRadius: '8px 8px 0 0'
                                                        }}>
                                                            <div style={{ width: '30px' }}></div>
                                                            <div style={{ flex: 1, display: 'flex', gap: '1rem' }}>
                                                                <span style={{ minWidth: '60px' }}>เลข</span>
                                                                <span>ประเภท</span>
                                                            </div>
                                                            <span style={{ textAlign: 'right' }}>จำนวน</span>
                                                        </div>
                                                        <div className="excess-list" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                                            {filteredExcessItems.map((item, idx) => {
                                                                const isSelected = selectedExcessItems[`${item.bet_type}|${item.numbers}`]
                                                                const setPrice = round?.set_prices?.['4_top'] || 120
                                                                const excessAmount = item.isSetBased ? item.excess * setPrice : item.excess
                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        className={`excess-card ${isSelected ? 'selected' : ''}`}
                                                                        onClick={() => toggleExcessItem(item)}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', padding: '0.75rem 1rem',
                                                                            background: isSelected ? 'rgba(255, 193, 7, 0.15)' : 'var(--color-surface)',
                                                                            borderBottom: '1px solid var(--color-border)',
                                                                            cursor: 'pointer', transition: 'all 0.2s ease'
                                                                        }}
                                                                    >
                                                                        <input type="checkbox" checked={isSelected || false} onChange={() => { }} style={{ width: '18px', height: '18px', accentColor: 'var(--color-warning)', marginRight: '0.75rem' }} />
                                                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                            <span style={{ fontWeight: 600, minWidth: '60px', fontFamily: "'Monaco', 'Menlo', monospace", color: 'var(--color-primary)', letterSpacing: '0.05em' }}>{item.displayNumbers || item.numbers}</span>
                                                                            <div>
                                                                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{BET_TYPES_BY_LOTTERY[round.lottery_type]?.[item.bet_type]?.label || BET_TYPES[item.bet_type] || item.bet_type}</span>
                                                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                    ยอด: {round.currency_symbol}{item.total.toLocaleString()}{item.isSetBased && ` (${item.setCount} ชุด)`} • อั้น: {item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ textAlign: 'right', color: 'var(--color-warning)', fontWeight: 600 }}>
                                                                            {round.currency_symbol}{excessAmount.toLocaleString()}
                                                                            {item.isSetBased && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>({item.excess} ชุด)</div>}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {showTransferModal && (
                                        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setShowTransferModal(false) }}>
                                            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                                                <div className="modal-header">
                                                    <h3><FiSend /> ตีออกยอดเกิน</h3>
                                                    <button className="modal-close" onClick={() => setShowTransferModal(false)}><FiX /></button>
                                                </div>
                                                <div className="modal-body">
                                                    <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>กำลังตีออก {selectedCount} รายการ</p>
                                                    
                                                    {/* Upstream Dealer Selection */}
                                                    {upstreamDealers.length > 0 && (
                                                        <div className="form-group">
                                                            <label className="form-label">เลือกเจ้ามือตีออก</label>
                                                            <div className="upstream-dealer-select">
                                                                <button
                                                                    type="button"
                                                                    className={`dealer-select-btn ${!selectedUpstreamDealer ? 'active' : ''}`}
                                                                    onClick={() => handleSelectUpstreamDealer(null)}
                                                                >
                                                                    <FiEdit2 /> กรอกเอง
                                                                </button>
                                                                {upstreamDealers.map(dealer => (
                                                                    <button
                                                                        key={dealer.id}
                                                                        type="button"
                                                                        className={`dealer-select-btn ${selectedUpstreamDealer?.id === dealer.id ? 'active' : ''} ${dealer.is_linked ? 'linked' : ''}`}
                                                                        onClick={() => handleSelectUpstreamDealer(dealer)}
                                                                    >
                                                                        {dealer.is_linked && <FiCheck style={{ color: 'var(--color-success)' }} />}
                                                                        {dealer.upstream_name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            {selectedUpstreamDealer?.is_linked && (
                                                                <>
                                                                    {upstreamRoundStatus === 'checking' && (
                                                                        <p className="form-hint" style={{ color: 'var(--color-text-muted)' }}>
                                                                            <span className="spinner-small"></span> กำลังตรวจสอบงวดหวย...
                                                                        </p>
                                                                    )}
                                                                    {upstreamRoundStatus === 'available' && (
                                                                        <p className="form-hint success">
                                                                            <FiCheck /> เจ้ามือมีงวดหวยเปิดรับอยู่ - เลขจะถูกส่งไปโดยอัตโนมัติ
                                                                        </p>
                                                                    )}
                                                                    {upstreamRoundStatus === 'unavailable' && (
                                                                        <p className="form-hint" style={{ color: 'var(--color-danger)' }}>
                                                                            <FiAlertCircle /> เจ้ามือไม่มีงวดหวยประเภทนี้เปิดรับอยู่ - จะบันทึกเป็นยอดตีออกเท่านั้น
                                                                        </p>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    
                                                    <div className="form-group">
                                                        <label className="form-label">ชื่อเจ้ามือ *</label>
                                                        <input 
                                                            type="text" 
                                                            className="form-input" 
                                                            value={transferForm.target_dealer_name} 
                                                            onChange={e => setTransferForm({ ...transferForm, target_dealer_name: e.target.value })} 
                                                            placeholder="ชื่อเจ้ามือที่ต้องการตีออก"
                                                            disabled={selectedUpstreamDealer !== null}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">เบอร์ติดต่อ</label>
                                                        <input 
                                                            type="text" 
                                                            className="form-input" 
                                                            value={transferForm.target_dealer_contact} 
                                                            onChange={e => setTransferForm({ ...transferForm, target_dealer_contact: e.target.value })} 
                                                            placeholder="เบอร์โทรหรือ Line ID"
                                                            disabled={selectedUpstreamDealer !== null}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">หมายเหตุ</label>
                                                        <textarea className="form-input" rows="2" value={transferForm.notes} onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"></textarea>
                                                    </div>
                                                </div>
                                                <div className="modal-footer">
                                                    <button className="btn btn-outline" onClick={() => setShowTransferModal(false)}>ยกเลิก</button>
                                                    <button 
                                                        className="btn btn-warning" 
                                                        onClick={handleSaveTransfer} 
                                                        disabled={savingTransfer || (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') || upstreamRoundStatus === 'checking'}
                                                    >
                                                        {savingTransfer ? 'กำลังบันทึก...' : (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') ? 'ไม่มีงวดหวยตรงกัน' : 'ยืนยันตีออก'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {inlineTab === 'transferred' && (() => {
                                        const filteredTransfers = inlineTransfers.filter(t => {
                                            if (inlineBetTypeFilter !== 'all' && t.bet_type !== inlineBetTypeFilter) return false
                                            if (inlineSearch && !t.numbers.includes(inlineSearch)) return false
                                            return true
                                        })

                                        return (
                                            <div className="inline-tab-content">
                                                {filteredTransfers.length === 0 ? (
                                                    <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                        <p style={{ color: 'var(--color-text-muted)' }}>{inlineTransfers.length === 0 ? 'ยังไม่มียอดตีออก' : 'ไม่พบรายการที่ค้นหา'}</p>
                                                    </div>
                                                ) : (() => {
                                                    const batches = {}
                                                    filteredTransfers.forEach(t => {
                                                        const batchId = t.transfer_batch_id || t.id
                                                        const itemStatus = t.status || 'active'
                                                        if (!batches[batchId]) batches[batchId] = { id: batchId, target_dealer_name: t.target_dealer_name, created_at: t.created_at, items: [], totalAmount: 0, is_linked: t.is_linked, status: itemStatus, returnedItems: [], activeItems: [] }
                                                        batches[batchId].items.push(t)
                                                        batches[batchId].totalAmount += t.amount || 0
                                                        // Track returned vs active items separately
                                                        if (itemStatus === 'returned') {
                                                            batches[batchId].returnedItems.push(t)
                                                            batches[batchId].status = 'returned' // Mark batch as having returned items
                                                        } else {
                                                            batches[batchId].activeItems.push(t)
                                                        }
                                                    })
                                                    const batchList = Object.values(batches).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                                    const grandTotal = filteredTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)
                                                    
                                                    // Only non-linked batches can be reverted by sender
                                                    const revertableBatches = batchList.filter(b => !b.is_linked && b.status !== 'returned')
                                                    const revertableBatchIds = revertableBatches.map(b => b.id)
                                                    
                                                    // Batches with returned items (use returnedItems array, not all items)
                                                    const batchesWithReturns = batchList.filter(b => (b.returnedItems?.length || 0) > 0)
                                                    const returnedItems = batchesWithReturns.flatMap(b => b.returnedItems || [])

                                                    // Calculate total commission
                                                    const totalCommission = Object.values(inlineTransferCommissions).reduce((sum, c) => sum + (c.totalCommission || 0), 0)

                                                    return (
                                                        <>
                                                            <div className="inline-summary" style={{ marginBottom: '1rem' }}>
                                                                <div className="summary-item"><span className="label">จำนวนครั้ง</span><span className="value">{batchList.length} ครั้ง</span></div>
                                                                <div className="summary-item"><span className="label">รวมทั้งหมด</span><span className="value">{round.currency_symbol}{grandTotal.toLocaleString()}</span></div>
                                                                <div className="summary-item"><span className="label">ค่าคอมรวม</span><span className="value" style={{ color: 'var(--color-success)' }}>+{round.currency_symbol}{totalCommission.toLocaleString()}</span></div>
                                                            </div>

                                                            {revertableBatches.length > 0 && (
                                                                <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                    <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                        <input type="checkbox" checked={revertableBatches.length > 0 && revertableBatches.every(b => selectedTransferBatches[b.id])} onChange={() => toggleSelectAllBatches(revertableBatchIds)} style={{ width: '18px', height: '18px', accentColor: 'var(--color-danger)' }} />
                                                                        <span>เลือกทั้งหมด (นอกระบบ: {revertableBatches.length})</span>
                                                                    </label>
                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                        <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); handleCopySelectedBatches(batchList); }} disabled={getSelectedBatchCount(batchList.map(b => b.id)) === 0} title="คัดลอกรายการที่เลือก">
                                                                            <FiCopy /> คัดลอก ({getSelectedBatchCount(batchList.map(b => b.id))})
                                                                        </button>
                                                                        <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); handleRevertTransfers(revertableBatchIds); }} disabled={getSelectedBatchCount(revertableBatchIds) === 0 || revertingTransfer}>
                                                                            <FiRotateCcw /> {revertingTransfer ? 'กำลังเอาคืน...' : `เอาคืน (${getSelectedBatchCount(revertableBatchIds)})`}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Returned transfers notification */}
                                                            {batchesWithReturns.length > 0 && (
                                                                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: '8px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                                                                            <FiAlertCircle /> มีเลขถูกคืนจากเจ้ามือปลายทาง ({returnedItems.length} รายการ)
                                                                        </div>
                                                                        <button 
                                                                            className="btn btn-success" 
                                                                            onClick={(e) => { e.stopPropagation(); handleReclaimReturnedTransfers(returnedItems); }}
                                                                            disabled={revertingTransfer}
                                                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                                                        >
                                                                            <FiRotateCcw /> {revertingTransfer ? 'กำลังเอาคืน...' : 'เอาคืนทั้งหมด'}
                                                                        </button>
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                        {returnedItems.map(item => (
                                                                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', background: 'var(--color-surface)', borderRadius: '4px', fontSize: '0.85rem' }}>
                                                                                <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>{item.numbers}</span>
                                                                                <span style={{ color: 'var(--color-text-muted)' }}>={round.currency_symbol}{item.amount?.toLocaleString()}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                {batchList.map(batch => {
                                                                    const isSelected = selectedTransferBatches[batch.id]
                                                                    const returnedCount = batch.returnedItems?.length || 0
                                                                    const activeCount = batch.activeItems?.length || 0
                                                                    const hasReturned = returnedCount > 0
                                                                    const allReturned = activeCount === 0 && hasReturned
                                                                    const partialReturned = hasReturned && activeCount > 0
                                                                    const canRevert = !batch.is_linked && !allReturned
                                                                    // Get commission for this batch's dealer
                                                                    const batchDealerId = batch.items[0]?.upstream_dealer_id
                                                                    const batchCommission = batchDealerId ? inlineTransferCommissions[batchDealerId]?.totalCommission || 0 : 0
                                                                    return (
                                                                        <div key={batch.id} onClick={() => canRevert && toggleTransferBatch(batch.id)} style={{ background: allReturned ? 'rgba(239, 68, 68, 0.05)' : isSelected ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface)', border: allReturned ? '2px dashed var(--color-danger)' : partialReturned ? '2px solid var(--color-warning)' : isSelected ? '2px solid var(--color-danger)' : '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', cursor: canRevert ? 'pointer' : 'default', transition: 'all 0.2s ease', opacity: allReturned ? 0.7 : batch.is_linked ? 0.85 : 1 }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: allReturned ? 'rgba(239, 68, 68, 0.15)' : partialReturned ? 'rgba(255, 193, 7, 0.15)' : isSelected ? 'rgba(239, 68, 68, 0.15)' : batch.is_linked ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 193, 7, 0.1)', borderBottom: '1px solid var(--color-border)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                    {allReturned ? (
                                                                                        <FiRotateCcw style={{ color: 'var(--color-danger)', fontSize: '1.25rem' }} />
                                                                                    ) : canRevert ? (
                                                                                        <input type="checkbox" checked={isSelected || false} onChange={() => { }} style={{ width: '18px', height: '18px', accentColor: 'var(--color-danger)' }} />
                                                                                    ) : (
                                                                                        <FiCheck style={{ color: 'var(--color-success)', fontSize: '1.25rem' }} />
                                                                                    )}
                                                                                    <div>
                                                                                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                            {batch.target_dealer_name}
                                                                                            {allReturned && <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--color-danger)', color: 'white', borderRadius: '4px' }}>ถูกคืนทั้งหมด</span>}
                                                                                            {partialReturned && <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--color-warning)', color: 'black', borderRadius: '4px' }}>ถูกคืนบางส่วน ({batch.returnedItems.length}/{batch.items.length})</span>}
                                                                                            {batch.is_linked && !hasReturned && <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--color-success)', color: 'white', borderRadius: '4px' }}>ในระบบ</span>}
                                                                                        </div>
                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                            {new Date(batch.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                                            {allReturned && <span style={{ marginLeft: '0.5rem', color: 'var(--color-danger)' }}>• เจ้ามือปลายทางคืนมาทั้งหมด</span>}
                                                                                            {partialReturned && <span style={{ marginLeft: '0.5rem', color: 'var(--color-warning)' }}>• มีบางรายการถูกคืน</span>}
                                                                                            {batch.is_linked && !hasReturned && <span style={{ marginLeft: '0.5rem', color: 'var(--color-success)' }}>• รอเจ้ามือปลายทางคืน</span>}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                    {batchCommission > 0 && (
                                                                                        <div style={{ textAlign: 'right', padding: '0.25rem 0.5rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
                                                                                            <div style={{ fontWeight: 600, color: 'var(--color-success)', fontSize: '0.85rem' }}>+{round.currency_symbol}{batchCommission.toLocaleString()}</div>
                                                                                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>ค่าคอม</div>
                                                                                        </div>
                                                                                    )}
                                                                                    <div style={{ textAlign: 'right' }}>
                                                                                        <div style={{ fontWeight: 600, color: allReturned ? 'var(--color-danger)' : 'var(--color-warning)' }}>{round.currency_symbol}{batch.totalAmount.toLocaleString()}</div>
                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{batch.items.length} รายการ</div>
                                                                                    </div>
                                                                                    {hasReturned ? (
                                                                                        <button 
                                                                                            className="btn btn-sm btn-success" 
                                                                                            onClick={(e) => { e.stopPropagation(); handleReclaimReturnedTransfers(batch.returnedItems || []); }} 
                                                                                            title="เอาคืนรายการที่ถูกคืน" 
                                                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                                                            disabled={revertingTransfer}
                                                                                        >
                                                                                            <FiRotateCcw /> เอาคืน ({returnedCount})
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleCopySingleBatch(batch); }} title="คัดลอกรายการนี้" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}><FiCopy /></button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ padding: '0.5rem' }}>
                                                                                {/* Table Header */}
                                                                                <div style={{ 
                                                                                    display: 'flex', 
                                                                                    justifyContent: 'space-between', 
                                                                                    alignItems: 'center',
                                                                                    padding: '0.4rem 0.5rem',
                                                                                    background: 'var(--color-surface-light)',
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    fontSize: '0.7rem',
                                                                                    color: 'var(--color-text-muted)',
                                                                                    fontWeight: '600'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                                                        <span style={{ minWidth: '50px' }}>เลข</span>
                                                                                        <span>ประเภท</span>
                                                                                    </div>
                                                                                    <span>จำนวน</span>
                                                                                </div>
                                                                                {(() => {
                                                                                    const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                                    const setPrice = round?.set_prices?.['4_top'] || 120

                                                                                    return batch.items.map(item => {
                                                                                        const itemReturned = (item.status || 'active') === 'returned'
                                                                                        const isSet4Digit = item.bet_type === '4_set' || item.bet_type === '4_top'
                                                                                        const setCount = isSetBasedLottery && isSet4Digit ? Math.ceil(item.amount / setPrice) : 0

                                                                                        return (
                                                                                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid var(--color-border)', textDecoration: itemReturned ? 'line-through' : 'none', opacity: itemReturned ? 0.6 : 1, background: itemReturned ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                                    <span style={{ fontWeight: 600, minWidth: '50px', fontFamily: "'Monaco', 'Menlo', monospace", color: itemReturned ? 'var(--color-danger)' : 'var(--color-primary)', letterSpacing: '0.05em' }}>{item.numbers}</span>
                                                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{BET_TYPES_BY_LOTTERY[round.lottery_type]?.[item.bet_type]?.label || BET_TYPES[item.bet_type] || item.bet_type}</span>
                                                                                                    {itemReturned && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: 'var(--color-danger)', color: 'white', borderRadius: '3px' }}>คืน</span>}
                                                                                                </div>
                                                                                                <div style={{ textAlign: 'right' }}>
                                                                                                    <span style={{ color: itemReturned ? 'var(--color-danger)' : 'inherit' }}>{round.currency_symbol}{item.amount?.toLocaleString()}</span>
                                                                                                    {isSetBasedLottery && isSet4Digit && setCount > 0 && (
                                                                                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>({setCount} ชุด)</div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                    })
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </>
                                                    )
                                                })()}
                                            </div>
                                        )
                                    })()}
                                </>
                            )}
                        </div>
                    )}

                    {/* ลบแบนเนอร์ "ยังไม่ได้ประกาศผลรางวัล" ตามที่ผู้ใช้ต้องการ */}
                </div>
            )}

            {/* Write Bet Modal - Uses DealerWriteSubmissionWrapper with numpad UI */}
            {showWriteBetModal && selectedMemberForBet && (
                <DealerWriteSubmissionWrapper
                    round={round}
                    targetUser={selectedMemberForBet}
                    dealerId={user.id}
                    allMembers={allMembers}
                    onMemberChange={(member) => setSelectedMemberForBet(member)}
                    onClose={() => {
                        setShowWriteBetModal(false)
                        setSelectedMemberForBet(null)
                        setEditingBillData(null)
                    }}
                    onSuccess={() => {
                        fetchInlineSubmissions(true)
                        if (onCreditUpdate) onCreditUpdate()
                    }}
                    editingData={editingBillData}
                />
            )}
        </div>
    )
}
