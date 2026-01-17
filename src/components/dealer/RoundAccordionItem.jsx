import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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
    FiCopy
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
    user 
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [summaryData, setSummaryData] = useState({ loading: false, submissions: [], userSettings: {} })

    // Inline submissions view states
    const [viewMode, setViewMode] = useState('summary')
    const [inlineTab, setInlineTab] = useState('total')
    const [inlineSubmissions, setInlineSubmissions] = useState([])
    const [inlineTypeLimits, setInlineTypeLimits] = useState({})
    const [inlineNumberLimits, setInlineNumberLimits] = useState([])
    const [inlineTransfers, setInlineTransfers] = useState([])
    const [inlineLoading, setInlineLoading] = useState(false)
    const [inlineUserFilter, setInlineUserFilter] = useState('all')
    const [inlineBetTypeFilter, setInlineBetTypeFilter] = useState('all')
    const [isGrouped, setIsGrouped] = useState(true)
    const [inlineSearch, setInlineSearch] = useState('')

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

    const isAnnounced = round.status === 'announced' && round.is_result_announced

    const isOpen = (() => {
        if (round.status === 'announced' || round.status === 'closed') return false
        const now = new Date()
        const closeTime = new Date(round.close_time)
        return now <= closeTime
    })()

    useEffect(() => {
        if ((isAnnounced || isOpen) && summaryData.submissions.length === 0 && !summaryData.loading) {
            fetchSummaryData()
        }
    }, [isAnnounced, isOpen])

    // Fetch upstream dealers on mount
    useEffect(() => {
        if (user?.id) {
            fetchUpstreamDealers()
        }
    }, [user?.id])

    async function fetchUpstreamDealers() {
        try {
            const { data, error } = await supabase
                .from('dealer_upstream_connections')
                .select(`
                    *,
                    upstream_profile:upstream_dealer_id (id, full_name, email, phone)
                `)
                .eq('dealer_id', user.id)
                .order('is_linked', { ascending: false })
                .order('upstream_name', { ascending: true })

            if (!error) {
                setUpstreamDealers(data || [])
            }
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
                    .select(`*, profiles (full_name, email)`)
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
            
            setInlineSubmissions(subsResult.data || [])

            const defaultLimits = getDefaultLimitsForType(round.lottery_type)
            const limitsObj = { ...defaultLimits }
            typeLimitsResult.data?.forEach(l => { limitsObj[l.bet_type] = l.max_per_number })
            setInlineTypeLimits(limitsObj)

            setInlineNumberLimits(numLimitsResult.data || [])
            setInlineTransfers(transfersResult.data || [])
        } catch (error) {
            clearTimeout(timeoutId)
            console.error('Error fetching inline submissions:', error)
        } finally {
            setInlineLoading(false)
        }
    }

    const handleEyeClick = (e) => {
        e.stopPropagation()
        if (!isExpanded) setIsExpanded(true)
        if (viewMode === 'submissions') {
            setViewMode('summary')
        } else {
            setViewMode('submissions')
            fetchInlineSubmissions()
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
        Object.values(grouped).forEach(item => {
            const limitLookupBetType = item.bet_type === '4_set' ? '4_top' : item.bet_type
            const typeLimit = inlineTypeLimits[limitLookupBetType]

            const numberLimit = inlineNumberLimits.find(nl => {
                const nlNormalized = normalizeNumber(nl.numbers, nl.bet_type)
                const nlBetType = nl.bet_type === '4_set' ? '4_top' : nl.bet_type
                return nlBetType === limitLookupBetType && nlNormalized === item.numbers
            })
            const effectiveLimit = numberLimit?.max_amount ?? typeLimit
            const isSetBased = isSetBasedLottery && (item.bet_type === '4_set' || item.bet_type === '4_top')

            const transferredForThis = inlineTransfers.filter(t => {
                const tBetType = t.bet_type === '4_set' ? '4_top' : t.bet_type
                const tNormalized = normalizeNumber(t.numbers, t.bet_type)
                return tBetType === limitLookupBetType && tNormalized === item.numbers
            }).reduce((sum, t) => sum + (t.amount || 0), 0)

            const transferredSets = isSetBased ? Math.floor(transferredForThis / setPrice) : 0

            if (effectiveLimit) {
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
            alert('กรุณากรอกชื่อเจ้ามือที่ต้องการตีออก')
            return
        }
        
        // Check if still checking upstream round status
        if (upstreamRoundStatus === 'checking') {
            alert('กรุณารอการตรวจสอบงวดหวยของเจ้ามือปลายทาง')
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
                        notes: `ตีออกจาก ${user.email || 'dealer'}`
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

            await fetchInlineSubmissions(true)
            setShowTransferModal(false)
            setSelectedExcessItems({})
            setSelectedUpstreamDealer(null)
            setTransferForm({ target_dealer_name: '', target_dealer_contact: '', notes: '' })
            
            setUpstreamRoundStatus(null)
            
            if (canSendToUpstream && targetRoundId) {
                alert(`ตีออกสำเร็จ ${selectedItems.length} รายการ!\nเลขถูกส่งไปยังงวดของ ${selectedUpstreamDealer.upstream_name} แล้ว`)
            } else if (isLinked && !canSendToUpstream) {
                alert(`บันทึกยอดตีออก ${selectedItems.length} รายการสำเร็จ!\n(เจ้ามือไม่มีงวดเปิดรับ - ไม่ได้ส่งเลขไป)`)
            } else {
                alert(`ตีออกสำเร็จ ${selectedItems.length} รายการ!`)
            }
        } catch (error) {
            console.error('Error saving transfer:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
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
            alert('กรุณาเลือกรายการที่ต้องการเอาคืน')
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
            alert(`เอาคืนสำเร็จ ${selectedBatchIds.length} รายการ!`)
        } catch (error) {
            console.error('Error reverting transfers:', error)
            alert('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setRevertingTransfer(false)
        }
    }

    const generateTransferCopyText = (batchesToCopy) => {
        const lotteryName = round.lottery_name || LOTTERY_TYPES[round.lottery_type] || 'หวย'
        const totalItems = batchesToCopy.reduce((sum, b) => sum + b.items.length, 0)
        const grandTotal = batchesToCopy.reduce((sum, b) => sum + b.totalAmount, 0)
        const targetDealer = batchesToCopy[0]?.target_dealer_name || ''

        let text = `📤 ยอดตีออก - ${lotteryName}\n`
        text += `📅 ทั้งหมด (${totalItems} รายการ)\n`
        text += `👤 ตีออกให้: ${targetDealer}\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${grandTotal.toLocaleString()}\n`
        text += `━━━━━━━━━━━━━━━━\n`

        const byType = {}
        batchesToCopy.forEach(batch => {
            batch.items.forEach(item => {
                const typeName = BET_TYPES[item.bet_type] || item.bet_type
                if (!byType[typeName]) byType[typeName] = []
                byType[typeName].push(item)
            })
        })

        Object.entries(byType).forEach(([typeName, items]) => {
            text += `${typeName}\n`
            items.forEach(item => { text += `${item.numbers}=${item.amount?.toLocaleString()}\n` })
        })

        text += `━━━━━━━━━━━━━━━━\n`
        text += `รวม: ${round.currency_symbol}${grandTotal.toLocaleString()}`
        return text
    }

    const handleCopySelectedBatches = async (allBatches) => {
        const selectedBatchIds = Object.keys(selectedTransferBatches).filter(id => selectedTransferBatches[id])
        const batchesToCopy = allBatches.filter(b => selectedBatchIds.includes(b.id))
        if (batchesToCopy.length === 0) {
            alert('กรุณาเลือกรายการที่ต้องการคัดลอก')
            return
        }

        const text = generateTransferCopyText(batchesToCopy)
        try {
            await navigator.clipboard.writeText(text)
            alert(`คัดลอก ${batchesToCopy.length} รายการแล้ว!`)
        } catch (err) {
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            alert(`คัดลอก ${batchesToCopy.length} รายการแล้ว!`)
        }
    }

    const handleCopySingleBatch = async (batch) => {
        const text = generateTransferCopyText([batch])
        try {
            await navigator.clipboard.writeText(text)
            alert('คัดลอกแล้ว!')
        } catch (err) {
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            alert('คัดลอกแล้ว!')
        }
    }

    const getCommission = (sub) => {
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]
        if (settings?.commission !== undefined) {
            return settings.isFixed ? settings.commission : sub.amount * (settings.commission / 100)
        }
        if (sub.commission_amount !== undefined && sub.commission_amount !== null) {
            return sub.commission_amount
        }
        return sub.amount * ((DEFAULT_COMMISSIONS[sub.bet_type] || 15) / 100)
    }

    const getExpectedPayout = (sub) => {
        if (!sub.is_winner) return 0
        const lotteryKey = getLotteryTypeKey(round.lottery_type)
        const settings = summaryData.userSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[sub.bet_type]
        if (settings?.payout !== undefined) return sub.amount * settings.payout
        return sub.amount * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
    }

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
                    {((round.status === 'closed' || new Date() > new Date(round.close_time)) && !isAnnounced) || isAnnounced ? (
                        <div className="accordion-actions">
                            {(round.status === 'closed' || new Date() > new Date(round.close_time)) && !isAnnounced && (
                                <button className="btn btn-accent" onClick={onShowResults}><FiCheck /> ใส่ผลรางวัล</button>
                            )}
                            {isAnnounced && (
                                <button className="btn btn-outline" onClick={onShowResults}><FiEdit2 /> แก้ไขผลรางวัล</button>
                            )}
                        </div>
                    ) : null}

                    {isAnnounced && viewMode === 'summary' && (
                        summaryData.loading ? (
                            <div className="loading-state"><div className="spinner"></div></div>
                        ) : (
                            <>
                                {userSummaries.length > 0 && (
                                    <div className="user-summary-list" style={{ marginTop: '1rem' }}>
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
                            </>
                        )
                    )}

                    {viewMode === 'submissions' && (
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
                                            <div className="inline-filters">
                                                <select value={inlineUserFilter} onChange={(e) => setInlineUserFilter(e.target.value)} className="form-input">
                                                    <option value="all">ทุกคน</option>
                                                    {[...new Set(inlineSubmissions.map(s => s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'))].map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="inline-summary">
                                                <div className="summary-item">
                                                    <span className="label">จำนวน</span>
                                                    <span className="value">{(() => {
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
                                                </div>
                                                <div className="summary-item">
                                                    <span className="label">ยอดรวม</span>
                                                    <span className="value">{round.currency_symbol}{inlineSubmissions.filter(s => {
                                                        const userName = s.profiles?.full_name || s.profiles?.email || 'ไม่ระบุ'
                                                        if (inlineUserFilter !== 'all' && userName !== inlineUserFilter) return false
                                                        if (inlineBetTypeFilter !== 'all' && s.bet_type !== inlineBetTypeFilter) return false
                                                        if (inlineSearch && !s.numbers.includes(inlineSearch)) return false
                                                        return true
                                                    }).reduce((sum, s) => sum + s.amount, 0).toLocaleString()}</span>
                                                </div>
                                            </div>

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
                                                                        grouped[key] = { numbers: normalizedNumbers, originalNumbers: [s.numbers], bet_type: s.bet_type, amount: 0, count: 0, id: key }
                                                                    } else {
                                                                        if (!grouped[key].originalNumbers.includes(s.numbers)) grouped[key].originalNumbers.push(s.numbers)
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
                                                                        {isGrouped && sub.count > 1 && <div className="count-sub-label">({sub.count} รายการ)</div>}
                                                                    </td>
                                                                    <td>{round.currency_symbol}{sub.amount.toLocaleString()}</td>
                                                                    {!isGrouped && <td className="time-cell">{new Date(sub.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>}
                                                                </tr>
                                                            ))
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
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
                                                                onClick={(e) => { e.stopPropagation(); if (filteredSelectedCount === 0) { alert('กรุณาเลือกรายการที่ต้องการตีออก'); return; } setShowTransferModal(true); }}
                                                                disabled={filteredSelectedCount === 0}
                                                            >
                                                                <FiSend /> ตีออก ({filteredSelectedCount})
                                                            </button>
                                                        </div>

                                                        <div className="excess-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                            {filteredExcessItems.map((item, idx) => {
                                                                const isSelected = selectedExcessItems[`${item.bet_type}|${item.numbers}`]
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
                                                                                <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '1.1rem' }}>{item.numbers}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                                                <span>ยอด: {item.isSetBased ? `${item.setCount} ชุด` : `${round.currency_symbol}${item.total.toLocaleString()}`}</span>
                                                                                <span>อั้น: {item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ textAlign: 'right' }}>
                                                                            <div style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '1.1rem' }}>
                                                                                {item.isSetBased ? `${item.excess} ชุด` : `${round.currency_symbol}${item.excess.toLocaleString()}`}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>เกิน</div>
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
                                                    <button className="btn btn-warning" onClick={handleSaveTransfer} disabled={savingTransfer}>{savingTransfer ? 'กำลังบันทึก...' : 'ยืนยันตีออก'}</button>
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
                                                        if (!batches[batchId]) batches[batchId] = { id: batchId, target_dealer_name: t.target_dealer_name, created_at: t.created_at, items: [], totalAmount: 0 }
                                                        batches[batchId].items.push(t)
                                                        batches[batchId].totalAmount += t.amount || 0
                                                    })
                                                    const batchList = Object.values(batches).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                                    const grandTotal = filteredTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)

                                                    return (
                                                        <>
                                                            <div className="inline-summary" style={{ marginBottom: '1rem' }}>
                                                                <div className="summary-item"><span className="label">จำนวนครั้ง</span><span className="value">{batchList.length} ครั้ง</span></div>
                                                                <div className="summary-item"><span className="label">รวมทั้งหมด</span><span className="value">{round.currency_symbol}{grandTotal.toLocaleString()}</span></div>
                                                            </div>

                                                            <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={batchList.length > 0 && batchList.every(b => selectedTransferBatches[b.id])} onChange={() => toggleSelectAllBatches(batchList.map(b => b.id))} style={{ width: '18px', height: '18px', accentColor: 'var(--color-danger)' }} />
                                                                    <span>เลือกทั้งหมด ({batchList.length})</span>
                                                                </label>
                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); handleCopySelectedBatches(batchList); }} disabled={getSelectedBatchCount(batchList.map(b => b.id)) === 0} title="คัดลอกรายการที่เลือก">
                                                                        <FiCopy /> คัดลอก ({getSelectedBatchCount(batchList.map(b => b.id))})
                                                                    </button>
                                                                    <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); handleRevertTransfers(batchList.map(b => b.id)); }} disabled={getSelectedBatchCount(batchList.map(b => b.id)) === 0 || revertingTransfer}>
                                                                        <FiRotateCcw /> {revertingTransfer ? 'กำลังเอาคืน...' : `เอาคืน (${getSelectedBatchCount(batchList.map(b => b.id))})`}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                {batchList.map(batch => {
                                                                    const isSelected = selectedTransferBatches[batch.id]
                                                                    return (
                                                                        <div key={batch.id} onClick={() => toggleTransferBatch(batch.id)} style={{ background: isSelected ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface)', border: isSelected ? '2px solid var(--color-danger)' : '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: isSelected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 193, 7, 0.1)', borderBottom: '1px solid var(--color-border)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                    <input type="checkbox" checked={isSelected || false} onChange={() => { }} style={{ width: '18px', height: '18px', accentColor: 'var(--color-danger)' }} />
                                                                                    <div>
                                                                                        <div style={{ fontWeight: 600 }}>{batch.target_dealer_name}</div>
                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{new Date(batch.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                    <div style={{ textAlign: 'right' }}>
                                                                                        <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{round.currency_symbol}{batch.totalAmount.toLocaleString()}</div>
                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{batch.items.length} รายการ</div>
                                                                                    </div>
                                                                                    <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handleCopySingleBatch(batch); }} title="คัดลอกรายการนี้" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}><FiCopy /></button>
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ padding: '0.5rem' }}>
                                                                                {batch.items.map(item => (
                                                                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                            <span className="type-badge" style={{ fontSize: '0.7rem' }}>{BET_TYPES[item.bet_type] || item.bet_type}</span>
                                                                                            <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>{item.numbers}</span>
                                                                                        </div>
                                                                                        <span>{round.currency_symbol}{item.amount?.toLocaleString()}</span>
                                                                                    </div>
                                                                                ))}
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
