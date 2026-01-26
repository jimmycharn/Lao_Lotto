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
import WriteSubmissionModal from './WriteSubmissionModal'

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
    onCreditUpdate // Callback to refresh dealer credit after bet submission
}) {
    const { toast } = useToast()
    const [isExpanded, setIsExpanded] = useState(false)
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
    const [inlineLoading, setInlineLoading] = useState(false)
    const [inlineUserFilter, setInlineUserFilter] = useState('all')
    const [inlineBetTypeFilter, setInlineBetTypeFilter] = useState('all')
    const [isGrouped, setIsGrouped] = useState(true)
    const [inlineSearch, setInlineSearch] = useState('')
    // Member filter: 'all' = all members, 'submitted' = only members who submitted
    const [memberFilterMode, setMemberFilterMode] = useState('submitted')
    // Total tab view mode: 'all' = ทั้งหมด (รวมเลข), 'bills' = แยกใบโพย
    const [totalViewMode, setTotalViewMode] = useState('all')
    // Selected items for bulk delete
    const [selectedItems, setSelectedItems] = useState({})
    const [deletingItems, setDeletingItems] = useState(false)
    // Expanded bills for collapsible view
    const [expandedBills, setExpandedBills] = useState([])

    // Write bet on behalf of user states
    const [showWriteBetModal, setShowWriteBetModal] = useState(false)
    const [selectedMemberForBet, setSelectedMemberForBet] = useState(null)

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
                const { data: settingsData } = await supabase
                    .from('user_settings')
                    .select('*')
                    .in('user_id', userIds)
                    .eq('dealer_id', user.id)

                if (settingsData) {
                    settingsData.forEach(s => { settingsMap[s.user_id] = s })
                }
            }

            setSummaryData({ submissions: submissionsData || [], userSettings: settingsMap, loading: false })
        } catch (error) {
            console.error('Error fetching summary:', error)
            setSummaryData(prev => ({ ...prev, loading: false }))
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
            console.log('Fetched bet_transfers:', transfersResult.data)
            setInlineTransfers(transfersResult.data || [])
        } catch (error) {
            clearTimeout(timeoutId)
            console.error('Error fetching inline submissions:', error)
        } finally {
            setInlineLoading(false)
        }
    }

    const handleHeaderClick = () => {
        if (!isExpanded) {
            setIsExpanded(true)
            // Auto-load submissions when expanding
            fetchInlineSubmissions()
        } else {
            setIsExpanded(false)
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
            setSelectedMemberForBet(member)
            setShowWriteBetModal(true)
        }
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
                
                const transferred3Set = inlineTransfers
                    .filter(t => t.bet_type === '3_set' && t.numbers === group3.last3Digits)
                    .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)
                
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
                
                // Calculate 3_set excess
                const uniqueNumbers = Object.keys(group3.exactMatches)
                
                if (uniqueNumbers.length > 1) {
                    const sortedNumbers = uniqueNumbers.sort((a, b) => {
                        const aTime = Math.min(...group3.exactMatches[a].submissions.map(s => new Date(s.created_at).getTime()))
                        const bTime = Math.min(...group3.exactMatches[b].submissions.map(s => new Date(s.created_at).getTime()))
                        return aTime - bTime
                    })
                    
                    let remaining3SetLimit = limit3Set + transferred3Set
                    
                    sortedNumbers.forEach((num, idx) => {
                        const exactGroup = group3.exactMatches[num]
                        
                        if (idx === 0) return // First number handled by 4_set
                        
                        if (remaining3SetLimit > 0) {
                            const setsToKeep = Math.min(exactGroup.setCount, remaining3SetLimit)
                            remaining3SetLimit -= setsToKeep
                            
                            const excess3 = exactGroup.setCount - setsToKeep
                            if (excess3 > 0) {
                                excessItems.push({
                                    bet_type: '3_set',
                                    numbers: num,
                                    displayNumbers: `${num} (3ตัวหลัง: ${group3.last3Digits})`,
                                    total: excess3 * setPrice,
                                    setCount: exactGroup.setCount,
                                    submissions: exactGroup.submissions.slice(-excess3),
                                    limit: limit3Set,
                                    excess: excess3,
                                    transferredSets: transferred3Set,
                                    isSetBased: true,
                                    excessType: '3_set',
                                    last3Digits: group3.last3Digits
                                })
                            }
                        } else {
                            excessItems.push({
                                bet_type: '3_set',
                                numbers: num,
                                displayNumbers: `${num} (3ตัวหลัง: ${group3.last3Digits})`,
                                total: exactGroup.setCount * setPrice,
                                setCount: exactGroup.setCount,
                                submissions: exactGroup.submissions,
                                limit: limit3Set,
                                excess: exactGroup.setCount,
                                transferredSets: transferred3Set,
                                isSetBased: true,
                                excessType: '3_set',
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

                    // Create submissions in upstream dealer's round
                    const submissionInserts = selectedItems.map(item => ({
                        round_id: targetRoundId,
                        user_id: user.id,
                        bet_type: item.bet_type,
                        numbers: item.numbers,
                        amount: item.isSetBased ? item.excess * (round?.set_prices?.['4_top'] || 120) : item.excess,
                        source: 'transfer',
                        bill_note: `ตีออกจาก ${user.email || 'dealer'}`
                    }))

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

    // Delete single submission
    const handleDeleteSingleItem = async (id) => {
        if (!confirm('ต้องการลบรายการนี้?')) return

        try {
            const { error } = await supabase
                .from('submissions')
                .update({ is_deleted: true })
                .eq('id', id)

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

    const generateTransferCopyText = (batchesToCopy) => {
        const lotteryName = round.lottery_name || LOTTERY_TYPES[round.lottery_type] || 'หวย'
        const totalItems = batchesToCopy.reduce((sum, b) => sum + b.items.length, 0)
        const grandTotal = batchesToCopy.reduce((sum, b) => sum + b.totalAmount, 0)
        const targetDealer = batchesToCopy[0]?.target_dealer_name || ''
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
        const setPrice = round?.set_prices?.['4_top'] || 120

        let text = `📤 ยอดตีออก - ${lotteryName}\n`
        text += `📅 ทั้งหมด (${totalItems} รายการ)\n`
        text += `👤 ตีออกให้: ${targetDealer}\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${grandTotal.toLocaleString()}\n`
        text += `━━━━━━━━━━━━━━━━\n`

        const byType = {}
        batchesToCopy.forEach(batch => {
            batch.items.forEach(item => {
                const typeName = BET_TYPES[item.bet_type] || item.bet_type
                if (!byType[typeName]) byType[typeName] = { items: [], isSet4Digit: item.bet_type === '4_set' || item.bet_type === '4_top' }
                byType[typeName].items.push(item)
            })
        })

        Object.entries(byType).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            
            // For 4-digit sets, group by numbers and show set count
            if (isSetBasedLottery && typeData.isSet4Digit) {
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
                    text += `${numbers}=${data.amount.toLocaleString()} (${setCount} ชุด)\n`
                })
            } else {
                typeData.items.forEach(item => { text += `${item.numbers}=${item.amount?.toLocaleString()}\n` })
            }
        })

        text += `━━━━━━━━━━━━━━━━\n`
        text += `รวม: ${round.currency_symbol}${grandTotal.toLocaleString()}`
        return text
    }

    const handleCopySelectedBatches = async (allBatches) => {
        const selectedBatchIds = Object.keys(selectedTransferBatches).filter(id => selectedTransferBatches[id])
        const batchesToCopy = allBatches.filter(b => selectedBatchIds.includes(b.id))
        if (batchesToCopy.length === 0) {
            toast.warning('กรุณาเลือกรายการที่ต้องการคัดลอก')
            return
        }

        const text = generateTransferCopyText(batchesToCopy)
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
        const text = generateTransferCopyText([batch])
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
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]
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

    const grandTotalBet = userSummaries.reduce((sum, u) => sum + u.totalBet, 0)
    const grandTotalWin = userSummaries.reduce((sum, u) => sum + u.totalWin, 0)
    const grandTotalCommission = userSummaries.reduce((sum, u) => sum + u.totalCommission, 0)
    const dealerProfit = grandTotalBet - grandTotalWin - grandTotalCommission

    return (
        <div className={`round-accordion-item ${round.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
            <div className="round-accordion-header card" onClick={handleHeaderClick} style={{ cursor: 'pointer' }}>
                <div className="round-header-left">
                    <span className={`lottery-badge ${round.lottery_type}`}>{LOTTERY_TYPES[round.lottery_type]}</span>
                    {getStatusBadge(round)}
                </div>
                <div className="round-header-center">
                    <h3>{round.lottery_name || LOTTERY_TYPES[round.lottery_type]}</h3>
                    <div className="round-meta">
                        <span><FiCalendar /> {formatDate(round.open_time)} {formatTime(round.open_time)} - {formatDate(round.close_time)} {formatTime(round.close_time)}</span>
                    </div>
                    {/* Summary stats - responsive layout */}
                    {!summaryData.loading && (
                        <div className="round-summary-stats">
                            {/* Row 1: รายการ, ยอดรวม, ค่าคอม */}
                            <div className="summary-row">
                                <span className="stat-item">
                                    <span className="stat-label">รายการ</span>
                                    <span className="stat-value">{summaryData.submissions?.length || 0}</span>
                                </span>
                                <span className="stat-item">
                                    <span className="stat-label">ยอดรวม</span>
                                    <span className="stat-value">{round.currency_symbol}{grandTotalBet.toLocaleString()}</span>
                                </span>
                                <span className="stat-item">
                                    <span className="stat-label">ค่าคอม</span>
                                    <span className="stat-value warning">{round.currency_symbol}{grandTotalCommission.toLocaleString()}</span>
                                </span>
                            </div>
                            {/* Row 2: จ่าย, กำไร (only for announced rounds) */}
                            {isAnnounced && (
                                <div className="summary-row">
                                    <span className="stat-item">
                                        <span className="stat-label">จ่าย</span>
                                        <span className="stat-value danger">{round.currency_symbol}{grandTotalWin.toLocaleString()}</span>
                                    </span>
                                    <span className={`stat-item ${dealerProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                                        <span className="stat-label">กำไร</span>
                                        <span className="stat-value">{dealerProfit >= 0 ? '+' : ''}{round.currency_symbol}{dealerProfit.toLocaleString()}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="round-header-right">
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
            </div>

            {isExpanded && (
                <div className="round-accordion-content">
                    {/* For CLOSED rounds (not open): Show tabs for submissions and results */}
                    {!isOpen && (
                        <div className="closed-round-tabs" style={{ 
                            display: 'flex', 
                            gap: '0.5rem', 
                            marginBottom: '1rem',
                            borderBottom: '1px solid var(--color-border)',
                            paddingBottom: '0.5rem'
                        }}>
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
                            {/* Action buttons for results */}
                            <div className="accordion-actions" style={{ marginBottom: '1rem' }}>
                                {!isAnnounced && (
                                    <button className="btn btn-accent" onClick={onShowResults}><FiCheck /> ใส่ผลรางวัล</button>
                                )}
                                {isAnnounced && (
                                    <button className="btn btn-outline" onClick={onShowResults}><FiEdit2 /> แก้ไขผลรางวัล</button>
                                )}
                            </div>

                            {/* User summaries for announced rounds */}
                            {isAnnounced && (
                                summaryData.loading ? (
                                    <div className="loading-state"><div className="spinner"></div></div>
                                ) : (
                                    <>
                                        {userSummaries.length > 0 && (
                                            <div className="user-summary-list">
                                                <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>รายละเอียดแต่ละคน</h4>
                                                {userSummaries.map(usr => {
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
                                                                {dealerNet < 0 ? <span className="status-badge lost">ต้องจ่าย {round.currency_symbol}{Math.abs(dealerNet).toLocaleString()}</span>
                                                                    : dealerNet > 0 ? <span className="status-badge won">ต้องเก็บ {round.currency_symbol}{dealerNet.toLocaleString()}</span>
                                                                        : <span className="status-badge pending">เสมอ</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                        {userSummaries.length === 0 && (
                                            <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                <p>ยังไม่มีข้อมูลผลรางวัล</p>
                                            </div>
                                        )}
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
                                        placeholder="ค้นหาเลข..."
                                        className="form-input search-input"
                                    />
                                    {inlineSearch && (
                                        <button className="search-clear-btn" onClick={() => setInlineSearch('')}><FiX /></button>
                                    )}
                                </div>
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

                            <div className="inline-tabs">
                                <button className={`inline-tab ${inlineTab === 'total' ? 'active' : ''}`} onClick={() => setInlineTab('total')}>
                                    ยอดรวม <span className="tab-count">{inlineSubmissions.length}</span>
                                </button>
                                <button className={`inline-tab ${inlineTab === 'incoming' ? 'active' : ''}`} onClick={() => setInlineTab('incoming')}>
                                    ยอดรับเข้า <span className="tab-count">{inlineSubmissions.filter(s => s.source === 'transfer').length}</span>
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
                                                {/* Row 1: Member filter buttons */}
                                                <div className="member-filter-buttons" style={{
                                                    display: 'flex',
                                                    gap: '0.5rem',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <button
                                                        className={`filter-btn ${memberFilterMode === 'all' ? 'active' : ''}`}
                                                        onClick={() => { setMemberFilterMode('all'); setInlineUserFilter('all'); }}
                                                        style={{
                                                            padding: '0.35rem 0.6rem',
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
                                                        ทั้งหมด ({allMembers.length})
                                                    </button>
                                                    <button
                                                        className={`filter-btn ${memberFilterMode === 'submitted' ? 'active' : ''}`}
                                                        onClick={() => { setMemberFilterMode('submitted'); setInlineUserFilter('all'); }}
                                                        style={{
                                                            padding: '0.35rem 0.6rem',
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
                                                        ส่งเลข ({[...new Set(inlineSubmissions.map(s => s.user_id))].length})
                                                    </button>
                                                    {/* View mode toggle - same row but will wrap on mobile */}
                                                    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-surface)', borderRadius: '20px', padding: '2px', marginLeft: 'auto' }}>
                                                        <button
                                                            onClick={() => setTotalViewMode('all')}
                                                            style={{
                                                                padding: '0.3rem 0.5rem',
                                                                borderRadius: '18px',
                                                                border: 'none',
                                                                background: totalViewMode === 'all' ? 'var(--color-primary)' : 'transparent',
                                                                color: totalViewMode === 'all' ? '#000' : 'var(--color-text-muted)',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            รวม
                                                        </button>
                                                        <button
                                                            onClick={() => setTotalViewMode('bills')}
                                                            style={{
                                                                padding: '0.3rem 0.5rem',
                                                                borderRadius: '18px',
                                                                border: 'none',
                                                                background: totalViewMode === 'bills' ? 'var(--color-primary)' : 'transparent',
                                                                color: totalViewMode === 'bills' ? '#000' : 'var(--color-text-muted)',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            ใบโพย
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="inline-filters" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <select value={inlineUserFilter} onChange={(e) => setInlineUserFilter(e.target.value)} className="form-input" style={{ flex: 1 }}>
                                                    <option value="all">ทุกคน</option>
                                                    {memberFilterMode === 'all' ? (
                                                        // Show all members
                                                        allMembers.map(member => (
                                                            <option key={member.id} value={member.full_name || member.email || 'ไม่ระบุ'}>
                                                                {member.full_name || member.email || 'ไม่ระบุ'}
                                                            </option>
                                                        ))
                                                    ) : (
                                                        // Show only members who submitted
                                                        [...new Set(inlineSubmissions.map(s => s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'))].map(name => (
                                                            <option key={name} value={name}>{name}</option>
                                                        ))
                                                    )}
                                                </select>
                                                {/* Write bet button - only show when a specific member is selected and round is open */}
                                                {inlineUserFilter !== 'all' && isOpen && (
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={handleOpenWriteBet}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.35rem',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <FiFileText /> เขียนโพย
                                                    </button>
                                                )}
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
                                                        if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
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
                                                <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                    if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                    return true
                                                }).reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</span>
                                                <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--color-warning)' }}>{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                    if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                    return true
                                                }).reduce((sum, s) => sum + (s.commission_amount || 0), 0).toLocaleString()}</span>
                                            </div>

                                            {/* View Mode: ทั้งหมด (รวมเลข) */}
                                            {totalViewMode === 'all' && (
                                                <div className="inline-table-wrap">
                                                    <table className="inline-table">
                                                        <thead>
                                                            <tr>
                                                                {isOpen && <th style={{ width: '30px' }}></th>}
                                                                <th>เลข</th>
                                                                <th>จำนวน</th>
                                                                {!isGrouped && <th>เวลา</th>}
                                                                {isOpen && <th style={{ width: '40px' }}></th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(() => {
                                                                let filteredData = inlineSubmissions.filter(s => {
                                                                    const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                                    if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                                    if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                                    return true
                                                                })

                                                                if (isGrouped) {
                                                                    const grouped = {}
                                                                    filteredData.forEach(s => {
                                                                        const normalizedNumbers = normalizeNumber(s.numbers, s.bet_type)
                                                                        const key = `${normalizedNumbers}|${s.bet_type}`
                                                                        if (!grouped[key]) {
                                                                            grouped[key] = { numbers: normalizedNumbers, originalNumbers: [s.numbers], bet_type: s.bet_type, amount: 0, count: 0, id: key, ids: [] }
                                                                        } else {
                                                                            if (!grouped[key].originalNumbers.includes(s.numbers)) grouped[key].originalNumbers.push(s.numbers)
                                                                        }
                                                                        grouped[key].amount += s.amount
                                                                        grouped[key].count += 1
                                                                        grouped[key].ids.push(s.id)
                                                                    })
                                                                    filteredData = Object.values(grouped).sort((a, b) => b.amount - a.amount)
                                                                }

                                                                const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                const setPrice = round?.set_prices?.['4_top'] || 120
                                                                const allIds = isGrouped ? filteredData.flatMap(g => g.ids) : filteredData.map(s => s.id)

                                                                return (
                                                                    <>
                                                                        {isOpen && filteredData.length > 0 && (
                                                                            <tr style={{ background: 'var(--color-surface)' }}>
                                                                                <td colSpan={isGrouped ? 4 : 5} style={{ padding: '0.5rem' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={allIds.length > 0 && allIds.every(id => selectedItems[id])}
                                                                                                onChange={() => toggleSelectAllItems(allIds)}
                                                                                                style={{ width: '16px', height: '16px' }}
                                                                                            />
                                                                                            <span style={{ fontSize: '0.85rem' }}>เลือกทั้งหมด</span>
                                                                                        </label>
                                                                                        {getSelectedItemsCount(allIds) > 0 && (
                                                                                            <button 
                                                                                                className="btn btn-danger btn-sm"
                                                                                                onClick={() => handleDeleteSelectedItems(allIds)}
                                                                                                disabled={deletingItems}
                                                                                                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                                                                            >
                                                                                                <FiTrash2 /> ลบ ({getSelectedItemsCount(allIds)})
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                        {filteredData.map(sub => {
                                                                            const isSet4Digit = sub.bet_type === '4_set' || sub.bet_type === '4_top'
                                                                            const setCount = isSetBasedLottery && isSet4Digit ? Math.ceil(sub.amount / setPrice) : 0
                                                                            const itemIds = isGrouped ? sub.ids : [sub.id]
                                                                            const isSelected = itemIds.some(id => selectedItems[id])

                                                                            return (
                                                                                <tr key={isGrouped ? sub.id : sub.id} style={{ background: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
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
                                                                                        <div className="type-sub-label">{BET_TYPES[sub.bet_type] || sub.bet_type}</div>
                                                                                        {isGrouped && sub.count > 1 && <div className="count-sub-label">({sub.count} รายการ)</div>}
                                                                                    </td>
                                                                                    <td>
                                                                                        {round.currency_symbol}{sub.amount.toLocaleString()}
                                                                                        {isSetBasedLottery && isSet4Digit && setCount > 0 && (
                                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({setCount} ชุด)</div>
                                                                                        )}
                                                                                    </td>
                                                                                    {!isGrouped && <td className="time-cell">{new Date(sub.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>}
                                                                                    {isOpen && !isGrouped && (
                                                                                        <td>
                                                                                            <button 
                                                                                                className="btn btn-icon btn-sm btn-danger"
                                                                                                onClick={() => handleDeleteSingleItem(sub.id)}
                                                                                                title="ลบ"
                                                                                                style={{ padding: '0.2rem' }}
                                                                                            >
                                                                                                <FiTrash2 size={14} />
                                                                                            </button>
                                                                                        </td>
                                                                                    )}
                                                                                    {isOpen && isGrouped && <td></td>}
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
                                                <div className="bills-view" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {(() => {
                                                        const bills = getSubmissionsByBills()
                                                        // Filter by user if selected
                                                        const filteredBills = inlineUserFilter === 'all' 
                                                            ? bills 
                                                            : bills.filter(b => b.user_name === inlineUserFilter)
                                                        
                                                        // Group bills by user
                                                        const billsByUser = {}
                                                        filteredBills.forEach(bill => {
                                                            if (!billsByUser[bill.user_name]) {
                                                                billsByUser[bill.user_name] = { user_name: bill.user_name, user_id: bill.user_id, bills: [], total: 0 }
                                                            }
                                                            billsByUser[bill.user_name].bills.push(bill)
                                                            billsByUser[bill.user_name].total += bill.total
                                                        })

                                                        if (Object.keys(billsByUser).length === 0) {
                                                            return <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>ไม่มีข้อมูล</div>
                                                        }

                                                        return Object.values(billsByUser).map(userGroup => (
                                                            <div key={userGroup.user_id || userGroup.user_name} style={{ marginBottom: '0.5rem' }}>
                                                                {/* User header */}
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    justifyContent: 'space-between', 
                                                                    alignItems: 'center',
                                                                    padding: '0.5rem 0.75rem',
                                                                    background: 'var(--color-primary)',
                                                                    color: '#000',
                                                                    borderRadius: '8px 8px 0 0',
                                                                    fontWeight: '600'
                                                                }}>
                                                                    <span>👤 {userGroup.user_name}</span>
                                                                    <span>{round.currency_symbol}{userGroup.total.toLocaleString()}</span>
                                                                </div>
                                                                
                                                                {/* Bills for this user - Collapsible cards */}
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
                                                                                        background: isExpanded ? 'rgba(255,193,7,0.1)' : 'rgba(255,255,255,0.03)',
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
                                                                                                {billTime} • {bill.items.length} รายการ
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                                                                                            {round.currency_symbol}{bill.total.toLocaleString()}
                                                                                        </span>
                                                                                        {isOpen && (
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
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                
                                                                                {/* Bill items - Collapsible */}
                                                                                {isExpanded && (
                                                                                    <div style={{ borderTop: '1px solid var(--color-border)' }}>
                                                                                        {bill.items.map((item, itemIdx) => (
                                                                                            <div key={item.id} style={{ 
                                                                                                display: 'flex', 
                                                                                                justifyContent: 'space-between', 
                                                                                                alignItems: 'center',
                                                                                                padding: '0.5rem 0.75rem',
                                                                                                borderBottom: itemIdx < bill.items.length - 1 ? '1px dashed var(--color-border)' : 'none',
                                                                                                background: 'rgba(255,255,255,0.02)'
                                                                                            }}>
                                                                                                <div>
                                                                                                    <span style={{ fontWeight: '600', marginRight: '0.5rem', fontSize: '0.95rem' }}>{item.numbers}</span>
                                                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                                        {BET_TYPES[item.bet_type] || item.bet_type}
                                                                                                    </span>
                                                                                                </div>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                    <span style={{ fontWeight: '500' }}>{round.currency_symbol}{item.amount.toLocaleString()}</span>
                                                                                                    {isOpen && (
                                                                                                        <button 
                                                                                                            className="btn btn-icon btn-sm"
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation()
                                                                                                                handleDeleteSingleItem(item.id)
                                                                                                            }}
                                                                                                            title="ลบ"
                                                                                                            style={{ padding: '0.15rem', color: 'var(--color-danger)' }}
                                                                                                        >
                                                                                                            <FiTrash2 size={12} />
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {inlineTab === 'incoming' && (
                                        <div className="inline-tab-content">
                                            {(() => {
                                                const incomingTransfers = inlineSubmissions.filter(s => s.source === 'transfer')
                                                if (incomingTransfers.length === 0) {
                                                    return (
                                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                                            <FiSend style={{ fontSize: '2rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', transform: 'rotate(180deg)' }} />
                                                            <p style={{ color: 'var(--color-text-muted)' }}>ยังไม่มียอดรับเข้าจากเจ้ามืออื่น</p>
                                                        </div>
                                                    )
                                                }

                                                const filteredIncoming = incomingTransfers.filter(s => {
                                                    if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                    if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                    return true
                                                })
                                                
                                                const incomingIds = filteredIncoming.map(s => s.id)

                                                return (
                                                    <>
                                                        <div className="inline-summary" style={{ marginBottom: '1rem' }}>
                                                            <div className="summary-item">
                                                                <span className="label">จำนวน</span>
                                                                <span className="value">{filteredIncoming.length} รายการ</span>
                                                            </div>
                                                            <div className="summary-item">
                                                                <span className="label">ยอดรวม</span>
                                                                <span className="value" style={{ color: 'var(--color-success)' }}>
                                                                    {round.currency_symbol}{filteredIncoming.reduce((sum, s) => sum + s.amount, 0).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Bulk actions for returning transfers */}
                                                        <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                            <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={incomingIds.length > 0 && incomingIds.every(id => selectedIncomingItems[id])} 
                                                                    onChange={() => toggleSelectAllIncoming(incomingIds)} 
                                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-danger)' }} 
                                                                />
                                                                <span>เลือกทั้งหมด ({filteredIncoming.length})</span>
                                                            </label>
                                                            <button 
                                                                className="btn btn-danger" 
                                                                onClick={(e) => { e.stopPropagation(); handleReturnIncomingTransfers(incomingIds); }} 
                                                                disabled={getSelectedIncomingCount(incomingIds) === 0 || returningIncoming}
                                                            >
                                                                <FiRotateCcw /> {returningIncoming ? 'กำลังคืน...' : `คืนเลข (${getSelectedIncomingCount(incomingIds)})`}
                                                            </button>
                                                        </div>

                                                        <div className="inline-table-wrap">
                                                            <table className="inline-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ width: '40px' }}></th>
                                                                        <th>เลข</th>
                                                                        <th>จำนวน</th>
                                                                        <th>จาก</th>
                                                                        <th>เวลา</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                        const setPrice = round?.set_prices?.['4_top'] || 120

                                                                        return filteredIncoming.map(sub => {
                                                                            const isSelected = selectedIncomingItems[sub.id]
                                                                            const isSet4Digit = sub.bet_type === '4_set' || sub.bet_type === '4_top'
                                                                            const setCount = isSetBasedLottery && isSet4Digit ? Math.ceil(sub.amount / setPrice) : 0

                                                                            return (
                                                                                <tr 
                                                                                    key={sub.id} 
                                                                                    onClick={() => toggleIncomingItem(sub.id)}
                                                                                    style={{ 
                                                                                        cursor: 'pointer', 
                                                                                        background: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                                                                        transition: 'background 0.2s ease'
                                                                                    }}
                                                                                >
                                                                                    <td style={{ textAlign: 'center' }}>
                                                                                        <input 
                                                                                            type="checkbox" 
                                                                                            checked={isSelected || false} 
                                                                                            onChange={() => {}} 
                                                                                            style={{ width: '16px', height: '16px', accentColor: 'var(--color-danger)' }} 
                                                                                        />
                                                                                    </td>
                                                                                    <td className="number-cell">
                                                                                        <div className="number-value">{sub.numbers}</div>
                                                                                        <div className="type-sub-label">{BET_TYPES[sub.bet_type] || sub.bet_type}</div>
                                                                                    </td>
                                                                                    <td>
                                                                                        {round.currency_symbol}{sub.amount.toLocaleString()}
                                                                                        {isSetBasedLottery && isSet4Digit && setCount > 0 && (
                                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({setCount} ชุด)</div>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="source-cell" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                                        {sub.bill_note || 'ไม่ระบุ'}
                                                                                    </td>
                                                                                    <td className="time-cell">{new Date(sub.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                                </tr>
                                                                            )
                                                                        })
                                                                    })()}
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

                                                        <div className="excess-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                                                                            display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem',
                                                                            background: isSelected ? 'rgba(255, 193, 7, 0.15)' : 'var(--color-surface)',
                                                                            border: isSelected ? '2px solid var(--color-warning)' : '1px solid var(--color-border)',
                                                                            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease'
                                                                        }}
                                                                    >
                                                                        <input type="checkbox" checked={isSelected || false} onChange={() => { }} style={{ width: '18px', height: '18px', accentColor: 'var(--color-warning)' }} />
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                                                <span className="type-badge">{BET_TYPES[item.bet_type] || item.bet_type}</span>
                                                                                <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '1.1rem' }}>{item.displayNumbers || item.numbers}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                                                <span>ยอด: {round.currency_symbol}{item.total.toLocaleString()}{item.isSetBased && ` (${item.setCount} ชุด)`}</span>
                                                                                <span>อั้น: {item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ textAlign: 'right' }}>
                                                                            <div style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '1.1rem' }}>
                                                                                {round.currency_symbol}{excessAmount.toLocaleString()}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                                {item.isSetBased ? `เกิน ${item.excess} ชุด` : 'เกิน'}
                                                                            </div>
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

                                                    return (
                                                        <>
                                                            <div className="inline-summary" style={{ marginBottom: '1rem' }}>
                                                                <div className="summary-item"><span className="label">จำนวนครั้ง</span><span className="value">{batchList.length} ครั้ง</span></div>
                                                                <div className="summary-item"><span className="label">รวมทั้งหมด</span><span className="value">{round.currency_symbol}{grandTotal.toLocaleString()}</span></div>
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
                                                                                {(() => {
                                                                                    const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                                    const setPrice = round?.set_prices?.['4_top'] || 120

                                                                                    return batch.items.map(item => {
                                                                                        const itemReturned = (item.status || 'active') === 'returned'
                                                                                        const isSet4Digit = item.bet_type === '4_set' || item.bet_type === '4_top'
                                                                                        const setCount = isSetBasedLottery && isSet4Digit ? Math.ceil(item.amount / setPrice) : 0

                                                                                        return (
                                                                                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid var(--color-border)', textDecoration: itemReturned ? 'line-through' : 'none', opacity: itemReturned ? 0.6 : 1, background: itemReturned ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                    <span className="type-badge" style={{ fontSize: '0.7rem' }}>{BET_TYPES[item.bet_type] || item.bet_type}</span>
                                                                                                    <span style={{ fontWeight: 500, color: itemReturned ? 'var(--color-danger)' : 'var(--color-primary)' }}>{item.numbers}</span>
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

            {/* Write Bet Modal - Uses WriteSubmissionModal component */}
            {showWriteBetModal && selectedMemberForBet && (
                <WriteSubmissionModal
                    round={round}
                    targetUser={selectedMemberForBet}
                    dealerId={user.id}
                    onClose={() => {
                        setShowWriteBetModal(false)
                        setSelectedMemberForBet(null)
                    }}
                    onSuccess={() => {
                        fetchInlineSubmissions(true)
                        if (onCreditUpdate) onCreditUpdate()
                    }}
                />
            )}
        </div>
    )
}
