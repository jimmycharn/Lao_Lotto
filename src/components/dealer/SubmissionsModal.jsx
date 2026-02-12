import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { checkUpstreamDealerCredit, updatePendingDeduction } from '../../utils/creditCheck'
import { jsPDF } from 'jspdf'
import { addThaiFont } from '../../utils/thaiFontLoader'
import {
    FiEye,
    FiUser,
    FiGrid,
    FiCheck,
    FiSend,
    FiClock,
    FiCopy,
    FiShare2,
    FiRotateCcw,
    FiEdit2,
    FiX
} from 'react-icons/fi'
import {
    BET_TYPES,
    generateBatchId
} from '../../constants/lotteryTypes'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

// Submissions Modal Component - With 3 Tabs
export default function SubmissionsModal({ round, onClose, fetchDealerCredit }) {
    const { user } = useAuth()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState('total') // 'total' | 'excess' | 'transferred'
    const [submissions, setSubmissions] = useState([])
    const [typeLimits, setTypeLimits] = useState({})
    const [numberLimits, setNumberLimits] = useState([])
    const [transfers, setTransfers] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedUser, setSelectedUser] = useState('all')
    const [betTypeFilter, setBetTypeFilter] = useState('all')
    const [selectedBatch, setSelectedBatch] = useState('all')

    // Upstream dealers for transfer selection
    const [upstreamDealers, setUpstreamDealers] = useState([])
    const [selectedUpstreamDealer, setSelectedUpstreamDealer] = useState(null) // null = manual, object = linked
    const [upstreamRoundStatus, setUpstreamRoundStatus] = useState(null) // null = not checked, 'checking', 'available', 'unavailable'

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
        fetchUpstreamDealers()
    }, [])

    // Fetch upstream dealers for transfer selection
    async function fetchUpstreamDealers() {
        if (!user?.id) return
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

        // For Lao/Hanoi: Calculate 3_set excess (3 ตัวตรงชุด - last 3 digits match)
        if (isSetBasedLottery) {
            // Get 3_set limit
            const limit3Set = typeLimits['3_set'] || 999999999
            const limit4Set = typeLimits['4_set'] || typeLimits['4_top'] || 999999999

            // Group 4-digit submissions by their last 3 digits
            const groupedByLast3 = {}
            Object.values(grouped).forEach(group => {
                if ((group.bet_type === '4_set' || group.bet_type === '4_top') && group.numbers?.length === 4) {
                    const last3 = group.numbers.slice(-3) // Get last 3 digits
                    if (!groupedByLast3[last3]) {
                        groupedByLast3[last3] = {
                            last3Digits: last3,
                            exactMatches: {}, // Groups with exact 4-digit match
                            totalSets: 0,
                            submissions: []
                        }
                    }

                    // Add to exact matches by full 4-digit number
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

                // Sort by earliest submission (FIFO - first in, first out)
                exactMatchGroups.sort((a, b) => {
                    const aTime = Math.min(...a.submissions.map(s => new Date(s.created_at).getTime()))
                    const bTime = Math.min(...b.submissions.map(s => new Date(s.created_at).getTime()))
                    return aTime - bTime
                })

                // Calculate transferred sets for 4_set
                const transferred4Set = transfers
                    .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top'))
                    .reduce((sum, t) => {
                        // Count transfers for any 4-digit number with matching last 3 digits
                        if (t.numbers?.slice(-3) === group3.last3Digits) {
                            return sum + Math.floor((t.amount || 0) / setPrice)
                        }
                        return sum
                    }, 0)

                // Calculate transferred sets for 3_set (3_set transfers have 4-digit numbers, match by last 3 digits)
                const transferred3Set = transfers
                    .filter(t => t.bet_type === '3_set' && t.numbers?.slice(-3) === group3.last3Digits)
                    .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)

                // Process 4_set excess first (exact 4-digit match)
                let remaining4SetLimit = limit4Set + transferred4Set
                let setsUsedFor4Set = 0

                exactMatchGroups.forEach(exactGroup => {
                    // Sort submissions within group by created_at (FIFO)
                    exactGroup.submissions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

                    // Check if this exact 4-digit number exceeds 4_set limit
                    const exactTransferred = transfers
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
                            transferredAmount: exactTransferred,
                            isSetBased: true,
                            excessType: '4_set'
                        })
                        setsUsedFor4Set += effectiveLimit // Only count sets within limit
                    } else {
                        setsUsedFor4Set += exactGroup.setCount
                    }
                })

                // Now calculate excess for numbers with same last 3 digits
                // Rule: Total sets across ALL numbers with same last 3 digits must not exceed limit3Set
                // If total exceeds limit3Set, the excess comes from later numbers (FIFO)
                const uniqueNumbers = Object.keys(group3.exactMatches)

                if (uniqueNumbers.length > 1) {
                    // There are multiple different 4-digit numbers with same last 3 digits
                    // Total sets across all these numbers must not exceed limit3Set

                    // Sort unique numbers by their earliest submission time
                    const sortedNumbers = uniqueNumbers.sort((a, b) => {
                        const aTime = Math.min(...group3.exactMatches[a].submissions.map(s => new Date(s.created_at).getTime()))
                        const bTime = Math.min(...group3.exactMatches[b].submissions.map(s => new Date(s.created_at).getTime()))
                        return aTime - bTime
                    })

                    // Calculate total transferred for all numbers with same last 3 digits (as 3_digit_match type)
                    const totalTransferred3Set = transfers
                        .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers?.slice(-3) === group3.last3Digits)
                        .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)

                    // Remaining limit for 3-digit match = limit3Set + transferred
                    let remaining3SetLimit = limit3Set + totalTransferred3Set

                    sortedNumbers.forEach((num, idx) => {
                        const exactGroup = group3.exactMatches[num]

                        // Calculate transferred sets for this specific 4-digit number
                        const transferredForThisNum = transfers
                            .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers === num)
                            .reduce((sum, t) => sum + Math.floor((t.amount || 0) / setPrice), 0)

                        // How many sets can we keep from this number?
                        const setsToKeep = Math.min(exactGroup.setCount, remaining3SetLimit)
                        remaining3SetLimit -= setsToKeep

                        // Excess = total sets - sets we can keep - already transferred
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
                                transferredAmount: transferredForThisNum,
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
        Object.values(grouped).forEach(group => {
            // Skip 4_set for Lao/Hanoi - already handled above
            if (isSetBasedLottery && (group.bet_type === '4_set' || group.bet_type === '4_top')) {
                return
            }

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
        setSelectedUpstreamDealer(null)
        setTransferForm({
            amount: item.excess,
            target_dealer_name: '',
            target_dealer_contact: '',
            notes: ''
        })
        setShowTransferModal(true)
    }

    // Handle upstream dealer selection
    const handleSelectUpstreamDealer = async (dealer) => {
        setSelectedUpstreamDealer(dealer)
        setUpstreamRoundStatus(null)

        if (dealer) {
            setTransferForm({
                ...transferForm,
                target_dealer_name: dealer.upstream_name,
                target_dealer_contact: dealer.upstream_contact || ''
            })

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
            setTransferForm({
                ...transferForm,
                target_dealer_name: '',
                target_dealer_contact: ''
            })
        }
    }

    // Find matching round from upstream dealer for linked transfers
    const findUpstreamRound = async (upstreamDealerId) => {
        if (!upstreamDealerId) return null

        try {
            // Find an open round from the upstream dealer with matching lottery_type and date
            const { data: rounds, error } = await supabase
                .from('lottery_rounds')
                .select('id, lottery_name, lottery_type, round_date, status, close_time')
                .eq('dealer_id', upstreamDealerId)
                .eq('lottery_type', round.lottery_type)
                .eq('round_date', round.round_date)
                .in('status', ['open'])
                .gte('close_time', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)

            if (error || !rounds || rounds.length === 0) {
                return null
            }

            return rounds[0]
        } catch (error) {
            console.error('Error finding upstream round:', error)
            return null
        }
    }

    const handleSaveTransfer = async () => {
        if (!transferTarget || !transferForm.amount || !transferForm.target_dealer_name) {
            toast.warning('กรุณากรอกข้อมูลให้ครบถ้วน')
            return
        }

        setSavingTransfer(true)
        try {
            // Check upstream dealer's credit if linked
            if (selectedUpstreamDealer?.is_linked && selectedUpstreamDealer?.upstream_dealer_id) {
                const upstreamRound = await findUpstreamRound(selectedUpstreamDealer.upstream_dealer_id)
                if (upstreamRound) {
                    const creditCheck = await checkUpstreamDealerCredit(
                        selectedUpstreamDealer.upstream_dealer_id,
                        upstreamRound.id,
                        transferForm.amount
                    )
                    if (!creditCheck.allowed) {
                        toast.error(`ไม่สามารถตีออกได้: ${creditCheck.message}`)
                        setSavingTransfer(false)
                        return
                    }
                }
            }

            const batchId = generateBatchId()
            let targetRoundId = null
            let targetSubmissionId = null

            // If linked dealer, try to create submission in their round
            if (selectedUpstreamDealer?.is_linked && selectedUpstreamDealer?.upstream_dealer_id) {
                const upstreamRound = await findUpstreamRound(selectedUpstreamDealer.upstream_dealer_id)

                if (upstreamRound) {
                    // Create submission in upstream dealer's round
                    const { data: newSubmission, error: subError } = await supabase
                        .from('submissions')
                        .insert({
                            round_id: upstreamRound.id,
                            user_id: user.id, // The transferring dealer becomes the "user" in upstream round
                            bet_type: transferTarget.bet_type,
                            numbers: transferTarget.numbers,
                            amount: transferForm.amount,
                            commission_rate: 0,
                            commission_amount: 0
                        })
                        .select('id')
                        .single()

                    if (!subError && newSubmission) {
                        targetRoundId = upstreamRound.id
                        targetSubmissionId = newSubmission.id
                    } else {
                        console.warn('Could not create submission in upstream round:', subError)
                    }
                }
            }

            // Create transfer record
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
                    transfer_batch_id: batchId,
                    upstream_dealer_id: selectedUpstreamDealer?.upstream_dealer_id || null,
                    is_linked: selectedUpstreamDealer?.is_linked || false,
                    target_round_id: targetRoundId,
                    target_submission_id: targetSubmissionId
                })

            if (error) throw error

            // Update pending deduction for upstream dealer's credit (if linked)
            if (targetSubmissionId && selectedUpstreamDealer?.upstream_dealer_id) {
                try {
                    await updatePendingDeduction(selectedUpstreamDealer.upstream_dealer_id)
                    console.log('Upstream dealer pending deduction updated')
                } catch (err) {
                    console.log('Error updating upstream pending deduction:', err)
                }
            }

            // NOTE: Do NOT update current dealer's pending deduction when transferring OUT
            // The dealer who transfers OUT does not get charged - only the RECEIVING dealer does
            // Just refresh the credit display
            await fetchDealerCredit()

            // Show success message
            if (targetSubmissionId) {
                toast.success(`ตีออกสำเร็จ! เลขถูกส่งไปยังงวดของ ${transferForm.target_dealer_name} แล้ว`)
            }

            // Refresh data
            await fetchAllData()
            setShowTransferModal(false)
            setTransferTarget(null)
            setSelectedUpstreamDealer(null)
        } catch (error) {
            console.error('Error saving transfer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
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
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Generate transfer text for copy/share
    const generateTransferText = async () => {
        const items = filteredTransfers
        if (items.length === 0) return ''

        const batchLabel = selectedBatch === 'all'
            ? 'ทั้งหมด'
            : `ครั้งที่ ${uniqueBatches.indexOf(selectedBatch) + 1}`
        const totalAmount = items.reduce((sum, t) => sum + (t.amount || 0), 0)
        const targetDealer = items[0]?.target_dealer_name || '-'
        const isSetBasedLottery = ['lao', 'hanoi'].includes(round.lottery_type)

        // Get set price from target dealer's settings if available
        let setPrice = round?.set_prices?.['4_top'] || 120
        const targetDealerId = items[0]?.upstream_dealer_id
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

        // Group by bet type and count sets
        const byType = {}
        let totalSetCount = 0
        items.forEach(t => {
            const betType = t.bet_type
            const typeName = BET_TYPES[betType] || betType
            const isSetType = betType === '4_set' || betType === '4_top' || betType === '3_set' || betType === '3_straight_set'
            if (!byType[typeName]) byType[typeName] = { items: [], betType, isSetType }
            byType[typeName].items.push(t)

            // Count sets for set-based types
            if (isSetBasedLottery && isSetType) {
                totalSetCount += Math.ceil((t.amount || 0) / setPrice)
            }
        })

        let text = `📤 ยอดตีออก - ${round.lottery_name}\n`
        text += `📅 วันที่ ${formattedDate}\n`
        text += `📅 ${batchLabel} (${items.length} รายการ)\n`
        text += `👤 ตีออกให้: ${targetDealer}\n`
        text += `💰 ยอดรวม: ${round.currency_symbol}${totalAmount.toLocaleString()}\n`
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
            typeData.items.forEach(t => { text += `${t.numbers}=${t.amount?.toLocaleString()}\n` })
            text += `-----------------\n`
        })

        // Output set types with special format (only set count, no amount)
        Object.entries(setTypes).forEach(([typeName, typeData]) => {
            text += `${typeName}\n`
            const grouped = {}
            typeData.items.forEach(t => {
                if (!grouped[t.numbers]) {
                    grouped[t.numbers] = { amount: 0, count: 0 }
                }
                grouped[t.numbers].amount += t.amount || 0
                grouped[t.numbers].count += 1
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

    // Copy transfers to clipboard
    const handleCopyTransfers = async () => {
        const text = await generateTransferText()
        if (!text) return

        try {
            await navigator.clipboard.writeText(text)
            toast.success('คัดลอกสำเร็จ!')
        } catch (error) {
            console.error('Error copying:', error)
            // Fallback for older browsers
            const textArea = document.createElement('textarea')
            textArea.value = text
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            toast.success('คัดลอกสำเร็จ!')
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
            toast.warning('กรุณาเลือกรายการที่ต้องการตีออก')
            return
        }
        setSelectedUpstreamDealer(null)
        setBulkTransferForm({
            target_dealer_name: '',
            target_dealer_contact: '',
            notes: ''
        })
        setShowBulkTransferModal(true)
    }

    const handleSaveBulkTransfer = async () => {
        if (!bulkTransferForm.target_dealer_name) {
            toast.warning('กรุณากรอกชื่อเจ้ามือที่ต้องการตีออก')
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

            let targetRoundId = null
            let createdSubmissionIds = []

            // If linked dealer, try to create submissions in their round
            if (selectedUpstreamDealer?.is_linked && selectedUpstreamDealer?.upstream_dealer_id) {
                const upstreamRound = await findUpstreamRound(selectedUpstreamDealer.upstream_dealer_id)

                if (upstreamRound) {
                    targetRoundId = upstreamRound.id

                    // Create submissions in upstream dealer's round
                    const submissionRecords = selectedItems.map(item => ({
                        round_id: upstreamRound.id,
                        user_id: user.id,
                        bet_type: item.bet_type,
                        numbers: item.numbers,
                        amount: item.excess,
                        commission_rate: 0,
                        commission_amount: 0
                    }))

                    const { data: newSubmissions, error: subError } = await supabase
                        .from('submissions')
                        .insert(submissionRecords)
                        .select('id')

                    if (!subError && newSubmissions) {
                        createdSubmissionIds = newSubmissions.map(s => s.id)
                    } else {
                        console.warn('Could not create submissions in upstream round:', subError)
                    }
                }
            }

            // Create batch transfer records with same batch ID
            const transferRecords = selectedItems.map((item, index) => ({
                round_id: round.id,
                bet_type: item.bet_type,
                numbers: item.numbers,
                amount: item.excess,
                target_dealer_name: bulkTransferForm.target_dealer_name,
                target_dealer_contact: bulkTransferForm.target_dealer_contact,
                notes: bulkTransferForm.notes,
                transfer_batch_id: batchId,
                upstream_dealer_id: selectedUpstreamDealer?.upstream_dealer_id || null,
                is_linked: selectedUpstreamDealer?.is_linked || false,
                target_round_id: targetRoundId,
                target_submission_id: createdSubmissionIds[index] || null
            }))

            const { error } = await supabase
                .from('bet_transfers')
                .insert(transferRecords)

            if (error) throw error

            // Update pending deduction for upstream dealer's credit (if linked)
            // Only the RECEIVING dealer (upstream) should have their credit affected
            if (createdSubmissionIds.length > 0 && selectedUpstreamDealer?.upstream_dealer_id) {
                try {
                    await updatePendingDeduction(selectedUpstreamDealer.upstream_dealer_id)
                    console.log('Upstream dealer pending deduction updated')
                } catch (err) {
                    console.log('Error updating upstream pending deduction:', err)
                }
            }

            // NOTE: Do NOT update current dealer's pending deduction when transferring OUT
            // The dealer who transfers OUT does not get charged - only the RECEIVING dealer does
            // Just refresh the credit display
            await fetchDealerCredit()

            // Refresh data and reset selection
            await fetchAllData()
            setSelectedExcessItems({})
            setShowBulkTransferModal(false)
            setSelectedUpstreamDealer(null)

            // Show success message
            if (createdSubmissionIds.length > 0) {
                toast.success(`ตีออกสำเร็จ ${selectedItems.length} รายการ! เลขถูกส่งไปยังงวดของ ${bulkTransferForm.target_dealer_name} แล้ว`)
            } else {
                toast.success(`ตีออกสำเร็จ ${selectedItems.length} รายการ!`)
            }
        } catch (error) {
            console.error('Error saving bulk transfer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
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

                                            <div className="excess-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {excessItems.map((item, idx) => {
                                                    const isSelected = selectedExcessItems[`${item.bet_type}|${item.numbers}`]
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`excess-card ${isSelected ? 'selected' : ''}`}
                                                            onClick={() => toggleExcessItem(item)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.75rem',
                                                                padding: '0.75rem 1rem',
                                                                background: isSelected ? 'rgba(255, 193, 7, 0.15)' : 'var(--color-surface)',
                                                                border: isSelected ? '2px solid var(--color-warning)' : '1px solid var(--color-border)',
                                                                borderRadius: '8px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected || false}
                                                                onChange={() => { }}
                                                                style={{ width: '18px', height: '18px', accentColor: 'var(--color-warning)', flexShrink: 0 }}
                                                            />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                                    <span className="type-badge">{BET_TYPES[item.bet_type]}</span>
                                                                    <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '1.1rem' }}>{item.numbers}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                                                                    <span>ยอด: {item.isSetBased ? `${item.setCount} ชุด` : `${round.currency_symbol}${item.total.toLocaleString()}`}</span>
                                                                    <span>อั้น: {item.isSetBased ? `${item.limit} ชุด` : `${round.currency_symbol}${item.limit.toLocaleString()}`}</span>
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                <div style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '1rem' }}>
                                                                    {item.isSetBased ? `${item.excess} ชุด` : `${round.currency_symbol}${item.excess.toLocaleString()}`}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>เกิน</div>
                                                            </div>
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
                                                    กำลังตรวจสอบงวดหวย...
                                                </p>
                                            )}
                                            {upstreamRoundStatus === 'available' && (
                                                <p className="form-hint success">
                                                    <FiCheck /> เจ้ามือมีงวดหวยเปิดรับอยู่ - เลขจะถูกส่งไปโดยอัตโนมัติ
                                                </p>
                                            )}
                                            {upstreamRoundStatus === 'unavailable' && (
                                                <p className="form-hint" style={{ color: 'var(--color-danger)' }}>
                                                    <FiX /> เจ้ามือไม่มีงวดหวยประเภทนี้เปิดรับอยู่
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">ตีออกไปให้ (ชื่อเจ้ามือ/ร้าน) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น ร้านโชคดี"
                                    value={transferForm.target_dealer_name}
                                    onChange={e => setTransferForm({ ...transferForm, target_dealer_name: e.target.value })}
                                    disabled={selectedUpstreamDealer !== null}
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
                                    disabled={selectedUpstreamDealer !== null}
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
                                disabled={savingTransfer || !transferForm.amount || !transferForm.target_dealer_name || (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') || upstreamRoundStatus === 'checking'}
                            >
                                {savingTransfer ? 'กำลังบันทึก...' : (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') ? 'ไม่มีงวดหวยตรงกัน' : '✓ บันทึก'}
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

                            {/* Upstream Dealer Selection */}
                            {upstreamDealers.length > 0 && (
                                <div className="form-group">
                                    <label className="form-label">เลือกเจ้ามือตีออก</label>
                                    <div className="upstream-dealer-select">
                                        <button
                                            type="button"
                                            className={`dealer-select-btn ${!selectedUpstreamDealer ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedUpstreamDealer(null)
                                                setBulkTransferForm({ ...bulkTransferForm, target_dealer_name: '', target_dealer_contact: '' })
                                            }}
                                        >
                                            <FiEdit2 /> กรอกเอง
                                        </button>
                                        {upstreamDealers.map(dealer => (
                                            <button
                                                key={dealer.id}
                                                type="button"
                                                className={`dealer-select-btn ${selectedUpstreamDealer?.id === dealer.id ? 'active' : ''} ${dealer.is_linked ? 'linked' : ''}`}
                                                onClick={() => {
                                                    handleSelectUpstreamDealer(dealer)
                                                    setBulkTransferForm({
                                                        ...bulkTransferForm,
                                                        target_dealer_name: dealer.upstream_name,
                                                        target_dealer_contact: dealer.upstream_contact || ''
                                                    })
                                                }}
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
                                                    กำลังตรวจสอบงวดหวย...
                                                </p>
                                            )}
                                            {upstreamRoundStatus === 'available' && (
                                                <p className="form-hint success">
                                                    <FiCheck /> เจ้ามือมีงวดหวยเปิดรับอยู่ - เลขจะถูกส่งไปโดยอัตโนมัติ
                                                </p>
                                            )}
                                            {upstreamRoundStatus === 'unavailable' && (
                                                <p className="form-hint" style={{ color: 'var(--color-danger)' }}>
                                                    <FiX /> เจ้ามือไม่มีงวดหวยประเภทนี้เปิดรับอยู่
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">ชื่อเจ้ามือที่ตีออก *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ชื่อเจ้ามือรับ"
                                    value={bulkTransferForm.target_dealer_name}
                                    onChange={e => setBulkTransferForm({ ...bulkTransferForm, target_dealer_name: e.target.value })}
                                    disabled={selectedUpstreamDealer !== null}
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
                                    disabled={selectedUpstreamDealer !== null}
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
                                disabled={savingTransfer || !bulkTransferForm.target_dealer_name || (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') || upstreamRoundStatus === 'checking'}
                            >
                                {savingTransfer ? 'กำลังบันทึก...' : (selectedUpstreamDealer?.is_linked && upstreamRoundStatus === 'unavailable') ? 'ไม่มีงวดหวยตรงกัน' : `✓ ตีออก ${selectedCount} รายการ`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
