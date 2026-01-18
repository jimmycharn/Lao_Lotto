import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
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
    FiCopy
} from 'react-icons/fi'
import './UserDashboard.css'
import './ViewToggle.css'

// Import constants from centralized file
import {
    LOTTERY_TYPES,
    BET_TYPES_WITH_DIGITS as BET_TYPES,
    getPermutations,
    getUnique3DigitPermsFrom4,
    getUnique3DigitPermsFrom5,
    generateUUID
} from '../constants/lotteryTypes'

export default function UserDashboard() {

    const { user, profile } = useAuth()
    const { toast } = useToast()
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

    // Results tab state
    const [resultsRounds, setResultsRounds] = useState([])
    const [resultsSummaries, setResultsSummaries] = useState({}) // { roundId: { totalAmount, totalCommission, totalPrize, netResult, winCount } }
    const [selectedResultRound, setSelectedResultRound] = useState(null)
    const [resultSubmissions, setResultSubmissions] = useState([])
    const [allResultSubmissions, setAllResultSubmissions] = useState([]) // All submissions for summary calculations
    const [resultsLoading, setResultsLoading] = useState(false)
    const [resultViewMode, setResultViewMode] = useState('winners') // 'all' or 'winners'

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
    const [currentBillId, setCurrentBillId] = useState(null)
    const [billNote, setBillNote] = useState('')
    const [isEditingBill, setIsEditingBill] = useState(false) // Track if editing existing bill
    const [isDraftsExpanded, setIsDraftsExpanded] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterBetType, setFilterBetType] = useState('') // Filter by bet type
    const numberInputRef = useRef(null)
    const amountInputRef = useRef(null)

    // Edit submission state
    const [editingSubmission, setEditingSubmission] = useState(null)
    const [editForm, setEditForm] = useState({ numbers: '', amount: '', bet_type: '' })
    const [editSaving, setEditSaving] = useState(false)

    // Fetch active dealer memberships
    useEffect(() => {
        if (user) {
            fetchDealerMemberships()
        }
    }, [user])

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
                .limit(10)

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
                .order('round_date', { ascending: false })
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

                        // Commission from user_settings (priority) or commission_amount from submission (fallback)
                        const totalCommission = subs.reduce((sum, s) => {
                            const settings = userSettings?.lottery_settings?.[lotteryKey]?.[s.bet_type]
                            if (settings?.commission !== undefined) {
                                return sum + (settings.isFixed ? settings.commission : s.amount * (settings.commission / 100))
                            }
                            // Fallback: use commission_amount that was recorded when submission was made
                            return sum + (s.commission_amount || 0)
                        }, 0)

                        const totalPrize = subs.reduce((sum, s) => {
                            if (!s.is_winner) return sum
                            const settings = userSettings?.lottery_settings?.[lotteryKey]?.[s.bet_type]
                            if (settings?.payout !== undefined) {
                                return sum + (s.amount * settings.payout)
                            }
                            const defaultPayouts = {
                                'run_top': 3, 'run_bottom': 4, 'pak_top': 8, 'pak_bottom': 6,
                                '2_top': 65, '2_front': 65, '2_center': 65, '2_spread': 65, '2_run': 10, '2_bottom': 65,
                                '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
                                '4_run': 20, '4_tod': 100, '4_set': 100, '4_float': 20, '5_float': 10, '6_top': 1000000
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

    // Default commission rates per bet type (percentage) - moved up for use in addToDraft
    const DEFAULT_COMMISSIONS_DRAFT = {
        'run_top': 15, 'run_bottom': 15,
        'pak_top': 15, 'pak_bottom': 15,
        '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
        '3_top': 30, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
        '4_run': 15, '4_tod': 15, '4_set': 15, '4_float': 15, '5_run': 15, '5_float': 15, '6_top': 15
    }

    // Get lottery type key for settings lookup
    const getLotteryKeyForDraft = (lotteryType) => {
        if (lotteryType === 'thai') return 'thai'
        if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao'
        if (lotteryType === 'stock') return 'stock'
        return 'thai'
    }

    // Helper function to get commission rate for a bet type from lottery_settings
    // settingsOverride can be passed with fresh settings from database
    const getCommissionForBetType = (betType, settingsOverride = null) => {
        if (!selectedRound) return { rate: DEFAULT_COMMISSIONS_DRAFT[betType] || 15, isFixed: false }

        const currentSettings = settingsOverride || userSettings
        const lotteryKey = getLotteryKeyForDraft(selectedRound.lottery_type)
        
        // Map bet_type to settings key for Lao/Hanoi lottery
        // In settings, Lao uses different keys than the actual bet_type used in submissions
        let settingsKey = betType
        if (lotteryKey === 'lao') {
            const LAO_BET_TYPE_MAP = {
                '3_top': '3_straight',      // 3 ตัวตรง
                '3_tod': '3_tod_single',    // 3 ตัวโต๊ด
                '4_set': '4_top'            // 4 ตัวตรง (ชุด)
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

        return { rate: DEFAULT_COMMISSIONS_DRAFT[betType] || 15, isFixed: false }
    }

    // Calculate commission amount based on rate and amount
    const calculateCommissionAmount = (amount, betType) => {
        const commissionInfo = getCommissionForBetType(betType)
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
            const [straightAmt, todAmt] = amountParts
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
            // 2-digit reversed bet types - create both normal and reversed entries
            const baseBetType = betType.replace('_rev', '')
            const reversedNumbers = cleanNumbers.split('').reverse().join('')
            const [amt1, amt2] = amountParts

            // First number with first amount
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

            // Reversed number with second amount (if different from original)
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
                // Same number (e.g., 11, 22) - just add the second amount to same number
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

        // Focus back to number input (minimal delay since we prevent blur)
        if (numberInputRef.current) {
            setTimeout(() => {
                numberInputRef.current.focus()
                numberInputRef.current.select()
                numberInputRef.current.setSelectionRange(0, 9999)
            }, 10)
        }
    }

    // Save all drafts to database
    async function handleSaveBill() {
        if (drafts.length === 0) return

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

            const { error } = await supabase.from('submissions').insert(inserts)
            if (error) throw error

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

            fetchSubmissions()
            toast.success(`ลบโพยใบ ${billId} สำเร็จ`)
        } catch (error) {
            console.error('Error deleting bill:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Edit bill - load all submissions as drafts and allow adding/removing
    function handleEditBill(billId, billItems) {
        // Group items by entry_id to calculate original_count
        const entryGroups = billItems.reduce((acc, item) => {
            const key = item.entry_id || item.id
            if (!acc[key]) {
                acc[key] = []
            }
            acc[key].push(item)
            return acc
        }, {})

        // Convert bill items to draft format matching the drafts state structure
        const newDrafts = billItems.map((item, index) => {
            const entryId = item.entry_id || item.id
            const groupSize = entryGroups[entryId]?.length || 1

            return {
                id: `edit-${billId}-${index}`,
                originalId: item.id,
                entry_id: item.entry_id,
                numbers: item.numbers, // Keep actual numbers for DB
                bet_type: item.bet_type,
                amount: item.amount,
                commission_rate: item.commission_rate,
                commission_amount: item.commission_amount,
                display_numbers: item.display_numbers || item.numbers, // For display
                display_bet_type: item.display_bet_type || BET_TYPES[item.bet_type]?.label || item.bet_type,
                display_amount: item.display_amount || item.amount?.toString(),
                original_count: groupSize // Track original group size for collapsed view
            }
        })

        // Set drafts and bill info for editing
        setDrafts(newDrafts)
        setCurrentBillId(billId)
        setBillNote(billItems[0]?.bill_note || '')
        setIsEditingBill(true) // Mark as editing existing bill
        setIsDraftsExpanded(true)

        // Reset submit form
        setSubmitForm({
            bet_type: '2_top',
            numbers: '',
            amount: ''
        })

        // Open the submit modal to show the form with drafts
        setShowSubmitModal(true)

        toast.info(`กำลังแก้ไขโพยใบ ${billId} - เพิ่ม/ลบเลขได้เลย`)
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
                // Float bets
                const singleAmt = parseFloat(amtParts[0]) || 0
                const commInfo = getCommissionForBetType(betType, userSettings)

                newSubmissions.push({
                    entry_id: entryId,
                    round_id: selectedRound.id,
                    user_id: editingSubmission.user_id,
                    bill_id: billId,
                    bet_type: betType,
                    numbers: newNumbers,
                    amount: singleAmt,
                    commission_rate: commInfo.rate,
                    commission_amount: commInfo.isFixed ? commInfo.rate : (singleAmt * commInfo.rate) / 100,
                    display_numbers: newNumbers,
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
    const totalCommission = submissions.reduce((sum, s) => sum + (s.commission_amount || 0), 0)

    // Default payout rates per bet type
    const DEFAULT_PAYOUTS = {
        'run_top': 3, 'run_bottom': 4,
        'pak_top': 8, 'pak_bottom': 6,
        '2_top': 65, '2_front': 65, '2_center': 65, '2_spread': 65, '2_run': 10, '2_bottom': 65,
        '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
        '4_run': 20, '4_tod': 100, '4_set': 100, '4_float': 20, '5_float': 10, '6_top': 1000000
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

        const lotteryKey = getLotteryTypeKey(round?.lottery_type)
        const settings = userSettings?.lottery_settings?.[lotteryKey]?.[sub.bet_type]

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
        '4_run': 15, '4_tod': 15, '4_set': 15, '4_float': 15, '5_run': 15, '5_float': 15, '6_top': 15
    }

    // Calculate commission for a submission based on user settings
    const getCalculatedCommission = (sub, round) => {
        const lotteryKey = getLotteryTypeKey(round?.lottery_type)
        const settings = userSettings?.lottery_settings?.[lotteryKey]?.[sub.bet_type]

        if (settings && settings.commission !== undefined) {
            if (settings.isFixed) {
                return settings.commission // Fixed amount per bet
            }
            return sub.amount * (settings.commission / 100) // Percentage
        }

        // Fallback: use commission_amount that was recorded when submission was made
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
                    <h1><FiSend /> ส่งเลข</h1>
                    <p>ส่งเลขหวยให้เจ้ามือของคุณ</p>
                </div>

                {/* Dealer Selector Pills */}
                {dealers.length > 0 && (
                    <div className="dealer-selector-bar">
                        {dealers.map(dealer => (
                            <button
                                key={dealer.id}
                                className={`dealer-pill ${selectedDealer?.id === dealer.id ? 'active' : ''}`}
                                onClick={() => {
                                    setSelectedDealer(dealer)
                                    setSelectedRound(null) // Reset round selection
                                    setRounds([])
                                }}
                            >
                                <div className="dealer-info-row">
                                    <span className="dealer-label">เจ้ามือ</span>
                                    <span className="dealer-name">{dealer.full_name || dealer.email}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

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
                                                <div className="round-header-main">
                                                    <div className="round-header-info">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {LOTTERY_TYPES[round.lottery_type]}
                                                        </span>
                                                        <div className="round-title-group">
                                                            <h3>{round.lottery_name}</h3>
                                                            <span className="round-date">
                                                                {new Date(round.round_date).toLocaleDateString('th-TH', {
                                                                    weekday: 'long',
                                                                    day: 'numeric',
                                                                    month: 'long',
                                                                    year: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="round-header-status">
                                                        {round.status === 'open' ? (
                                                            <div className="time-remaining">
                                                                {formatTimeRemaining(round.close_time)}
                                                            </div>
                                                        ) : (
                                                            <span className="round-status closed">ปิดรับแล้ว</span>
                                                        )}
                                                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                    </div>
                                                </div>
                                                {isExpanded && (
                                                    <div className="round-header-detail">
                                                        <div className="time-grid">
                                                            <div className="time-item">
                                                                <FiClock />
                                                                <span>เปิดรับ: {new Date(round.open_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                            <div className="time-item">
                                                                <FiClock />
                                                                <span>ปิดรับ: {new Date(round.close_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </div>
                                                        {canSubmit() && (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSubmitForm({
                                                                        bet_type: '2_top',
                                                                        numbers: '',
                                                                        amount: ''
                                                                    })
                                                                    if (drafts.length === 0) {
                                                                        const shortId = 'B-' + Math.random().toString(36).substring(2, 8).toUpperCase()
                                                                        setCurrentBillId(shortId)
                                                                    }
                                                                    setShowSubmitModal(true)
                                                                }}
                                                            >
                                                                <FiPlus /> ส่งเลข
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
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
                                                    </div>

                                                    <div className="submissions-list card">
                                                        <div className="list-header">
                                                            <h3>รายการที่ส่ง</h3>
                                                            <div className="view-toggle-group">
                                                                <div className="view-toggle-container">
                                                                    <span className="toggle-label">จัดกลุ่ม</span>
                                                                    <button
                                                                        className={`toggle-btn group-toggle ${isGroupByBill ? 'active' : ''}`}
                                                                        onClick={() => setIsGroupByBill(!isGroupByBill)}
                                                                    >
                                                                        <FiLayers /> <span>แยกใบโพย</span>
                                                                    </button>
                                                                </div>
                                                            </div>
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
                                                                        return items.reduce((acc, sub) => {
                                                                            if (sub.entry_id) {
                                                                                const existing = acc.find(a => a.entry_id === sub.entry_id)
                                                                                if (existing) {
                                                                                    existing.amount += sub.amount
                                                                                    existing.commission_amount += sub.commission_amount
                                                                                    return acc
                                                                                }
                                                                                acc.push({ ...sub })
                                                                            } else {
                                                                                acc.push({ ...sub })
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

                                                                        return (
                                                                            <div className="bill-view-container">
                                                                                {Object.entries(bills).sort((a, b) => {
                                                                                    const latestA = new Date(a[1][0].created_at)
                                                                                    const latestB = new Date(b[1][0].created_at)
                                                                                    return latestB - latestA
                                                                                }).map(([billId, billItems]) => {
                                                                                    const billTotal = billItems.reduce((sum, item) => sum + item.amount, 0)
                                                                                    const billCommission = billItems.reduce((sum, item) => sum + item.commission_amount, 0)
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

                                                                                    // Copy bill function
                                                                                    const handleCopyBill = async (e) => {
                                                                                        e.stopPropagation()
                                                                                        const billName = billItems[0]?.bill_note || billId
                                                                                        let text = `📋 ${billName}\n`
                                                                                        text += `📅 ${billDate} ${billTime}\n`
                                                                                        text += `━━━━━━━━━━━━━━━━\n`
                                                                                        processedBillItems.forEach(sub => {
                                                                                            const betType = displayMode === 'summary' ? (sub.display_bet_type || BET_TYPES[sub.bet_type]?.label) : BET_TYPES[sub.bet_type]?.label
                                                                                            const nums = displayMode === 'summary' ? (sub.display_numbers || sub.numbers) : sub.numbers
                                                                                            const amt = displayMode === 'summary' ? (sub.display_amount || sub.amount) : sub.amount
                                                                                            text += `${betType}  ${nums}  ${round.currency_symbol}${amt?.toLocaleString()}\n`
                                                                                        })
                                                                                        text += `━━━━━━━━━━━━━━━━\n`
                                                                                        text += `รวม: ${round.currency_symbol}${billTotal.toLocaleString()}`
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

                                                                                    return (
                                                                                        <div key={billId} className={`bill-card-new ${isExpandedBill ? 'expanded' : ''}`}>
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
                                                                                                    <div className="bill-header-total">
                                                                                                        <span className="bill-total-amount">
                                                                                                            {round.currency_symbol}{billTotal.toLocaleString()}
                                                                                                        </span>
                                                                                                        <span className="bill-count">
                                                                                                            {processedBillItems.length} รายการ
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

                                                                                            {/* Bill Items - Always visible */}
                                                                                            <div className="bill-items-list">
                                                                                                {processedBillItems.map(sub => (
                                                                                                    <div
                                                                                                        key={sub.id || sub.entry_id}
                                                                                                        className={`bill-item-row ${canDelete(sub) ? 'editable' : ''}`}
                                                                                                        onClick={() => handleEditSubmission(sub)}
                                                                                                    >
                                                                                                        <div className="bill-item-left">
                                                                                                            <span className="bill-bet-type">
                                                                                                                {displayMode === 'summary' ? (sub.display_bet_type || BET_TYPES[sub.bet_type]?.label) : BET_TYPES[sub.bet_type]?.label}
                                                                                                            </span>
                                                                                                            <span className="bill-number">
                                                                                                                {displayMode === 'summary' ? (sub.display_numbers || sub.numbers) : sub.numbers}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                        <span className="bill-item-amount">
                                                                                                            {round.currency_symbol}{(displayMode === 'summary' ? sub.display_amount : sub.amount)?.toLocaleString()}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>

                                                                                            {/* Bill Actions - For editing/deleting */}
                                                                                            {canSubmit() && billId !== 'no-bill' && (
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
                                                                        // Single table view
                                                                        const displayItems = processItems(filteredSubs)
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
                                                                                                        {displayMode === 'summary' ? (sub.display_bet_type || BET_TYPES[sub.bet_type]?.label) : BET_TYPES[sub.bet_type]?.label}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td>{round.currency_symbol}{(displayMode === 'summary' ? sub.display_amount : sub.amount)?.toLocaleString()}</td>
                                                                                            <td className="commission-cell">
                                                                                                {round.currency_symbol}{sub.commission_amount?.toLocaleString()}
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
                                                <div className="round-header-main">
                                                    <div className="round-header-info">
                                                        <span className={`lottery-badge ${round.lottery_type}`}>
                                                            {round.lottery_name || round.lottery_type}
                                                        </span>
                                                        <div className="round-title-group">
                                                            <h3>{round.lottery_name || getLotteryTypeName(round.lottery_type)}</h3>
                                                            <span className="round-date">
                                                                {new Date(round.round_date).toLocaleDateString('th-TH', {
                                                                    weekday: 'short',
                                                                    day: 'numeric',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="round-header-status">
                                                        <span className="status-badge announced">
                                                            <FiCheck /> ประกาศผลแล้ว
                                                        </span>
                                                        <FiChevronDown className={isExpanded ? 'rotated' : ''} />
                                                    </div>
                                                </div>
                                                {/* Summary in Header */}
                                                {hasSummary && (
                                                    <div className="header-summary results-header-summary">
                                                        <span className="summary-item">
                                                            <span className="label">ยอดส่งรวม</span>
                                                            {round.currency_symbol || '฿'}{summary.totalAmount?.toLocaleString()}
                                                        </span>
                                                        <span className="summary-item">
                                                            <span className="label">ค่าคอม</span>
                                                            {round.currency_symbol || '฿'}{summary.totalCommission?.toLocaleString()}
                                                        </span>
                                                        <span className="summary-item highlight">
                                                            <span className="label">รางวัลที่ได้</span>
                                                            <span style={{ color: 'var(--color-success)' }}>{round.currency_symbol || '฿'}{summary.totalPrize?.toLocaleString()}</span>
                                                        </span>
                                                        <span className={`summary-item profit ${summary.netResult >= 0 ? 'positive' : 'negative'}`}>
                                                            <span className="label">ผลกำไร/ขาดทุน</span>
                                                            {summary.netResult >= 0 ? '+' : ''}{round.currency_symbol || '฿'}{summary.netResult?.toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {isExpanded && (
                                                <div className="round-accordion-content">
                                                    {/* Winning Numbers Display */}
                                                    {Object.keys(winningNumbers).length > 0 && (
                                                        <div className="winning-numbers-section">
                                                            <h4><FiAward /> ผลรางวัลที่ออก</h4>
                                                            <div className="winning-numbers-grid">
                                                                {/* Different display order based on lottery type */}
                                                                {(() => {
                                                                    // Lao/Hanoi: 4 ตัว, 3 ตัวบน, 2 ตัวบน, 2 ตัวล่าง
                                                                    const isLaoHanoi = ['lao', 'hanoi'].includes(round.lottery_type)
                                                                    const displayOrder = isLaoHanoi
                                                                        ? ['4_set', '3_top', '2_top', '2_bottom']
                                                                        : ['6_top', '3_top', '2_bottom', '3_bottom']

                                                                    const betTypeLabels = {
                                                                        '6_top': 'รางวัลที่ 1',
                                                                        '4_set': 'เลขชุด 4 ตัว',
                                                                        '4_top': 'เลขชุด 4 ตัว',
                                                                        '3_top': '3 ตัวบน',
                                                                        '3_bottom': '3 ตัวล่าง',
                                                                        '3_tod': '3 ตัวโต๊ด',
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

                                                                        return (
                                                                            <div key={betType} className="winning-number-item">
                                                                                <span className="winning-label">{label}</span>
                                                                                <span className="winning-value">{displayNumber}</span>
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
                                                                <span className="summary-value">
                                                                    {round.currency_symbol || '฿'}{summary.totalAmount?.toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">ยอดส่งรวม</span>
                                                            </div>
                                                            <div className="summary-card">
                                                                <span className="summary-value">
                                                                    {round.currency_symbol || '฿'}{summary.totalCommission?.toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">ค่าคอม</span>
                                                            </div>
                                                            <div className="summary-card highlight">
                                                                <span className="summary-value">
                                                                    {round.currency_symbol || '฿'}{summary.totalPrize?.toLocaleString()}
                                                                </span>
                                                                <span className="summary-label">รางวัลที่ได้</span>
                                                            </div>
                                                            <div className={`summary-card ${summary.netResult >= 0 ? 'profit' : 'loss'}`}>
                                                                <span className="summary-value">
                                                                    {summary.netResult >= 0 ? '+' : ''}{round.currency_symbol || '฿'}{summary.netResult?.toLocaleString()}
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
                                                                return (
                                                                    <div key={billId} className="result-bill-group card">
                                                                        <div className="result-bill-header">
                                                                            <span className="bill-label">
                                                                                <FiGift /> โพย {billId === 'no-bill' ? '-' : billId.slice(-6).toUpperCase()}
                                                                            </span>
                                                                            <span className="bill-prize">
                                                                                +{round.currency_symbol || '฿'}{billTotal.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        <div className="result-bill-items">
                                                                            {items.map(sub => (
                                                                                <div key={sub.id} className="result-item">
                                                                                    <div className="result-number">
                                                                                        <span className="number-value">{sub.display_numbers || sub.numbers}</span>
                                                                                        <span className="bet-type">{BET_TYPES[sub.bet_type]?.label || sub.bet_type}</span>
                                                                                    </div>
                                                                                    <div className="result-amounts">
                                                                                        <span className="bet-amount">{round.currency_symbol || '฿'}{sub.amount}</span>
                                                                                        <span className="arrow">→</span>
                                                                                        <span className="prize-amount">{round.currency_symbol || '฿'}{(sub.is_winner ? getCalculatedPrize(sub, round) : 0).toLocaleString()}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )
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

                    {activeTab === 'dealer' && selectedDealer && (
                        <DealerInfoTab dealer={selectedDealer} userSettings={userSettings} />
                    )}
                </div>
            </div>

            {/* Submit Modal */}
            {showSubmitModal && selectedRound && (
                <div className="modal-overlay" onClick={() => {
                    setDrafts([])
                    setCurrentBillId(null)
                    setIsEditingBill(false)
                    setBillNote('')
                    setShowSubmitModal(false)
                }}>
                    <div className="modal submission-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="header-title">
                                <h3><FiPlus /> ส่งเลข</h3>
                                <span className="bill-id-badge">{currentBillId}</span>
                            </div>
                            <button className="modal-close" onClick={(e) => {
                                e.stopPropagation()
                                setDrafts([])
                                setCurrentBillId(null)
                                setIsEditingBill(false)
                                setBillNote('')
                                setShowSubmitModal(false)
                            }}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Bill Note Input */}
                            <div className="bill-note-section">
                                <input
                                    type="text"
                                    className="form-input bill-note-input"
                                    placeholder="ชื่อผู้ซื้อ / บันทึกช่วยจำ (ไม่บังคับ)"
                                    value={billNote}
                                    onChange={e => setBillNote(e.target.value)}
                                />
                            </div>

                            <div className="input-section card">

                                <div className="form-row form-row-inline">
                                    <div className="form-group">
                                        <label className="form-label">ตัวเลข</label>
                                        <input
                                            ref={numberInputRef}
                                            type="text"
                                            className="form-input number-input"
                                            inputMode="decimal"
                                            placeholder="ป้อนตัวเลข"
                                            value={submitForm.numbers}
                                            onChange={e => setSubmitForm({
                                                ...submitForm,
                                                numbers: e.target.value.replace(/[ \-.,]/g, '*').replace(/[^\d*]/g, '')
                                            })}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    if (amountInputRef.current) {
                                                        amountInputRef.current.focus()
                                                        amountInputRef.current.select()
                                                    }
                                                }
                                            }}
                                        />
                                    </div>

                                    <div className="form-group amount-group">
                                        <label className="form-label">จำนวนเงิน ({selectedRound.currency_name})</label>
                                        <div className="input-with-clear">
                                            <input
                                                ref={amountInputRef}
                                                type="text"
                                                className="form-input amount-input"
                                                inputMode="decimal"
                                                placeholder="0"
                                                value={submitForm.amount}
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                    let value = e.target.value
                                                    // Convert separators to *
                                                    value = value.replace(/[ \-.,]/g, '*')
                                                    // Remove non-digit and non-* characters
                                                    value = value.replace(/[^\d*]/g, '')
                                                    // Rule 1: Cannot start with *
                                                    value = value.replace(/^\*+/, '')

                                                    // Special rule for 4-digit inputs on Lao/Hanoi: No "*" allowed
                                                    const digits = submitForm.numbers.replace(/\*/g, '').length
                                                    const isLaoOrHanoi = ['lao', 'hanoi'].includes(selectedRound?.lottery_type)
                                                    if (digits === 4 && isLaoOrHanoi) {
                                                        value = value.replace(/\*/g, '')
                                                    } else {
                                                        // Rule 2: Only allow one *
                                                        const starCount = (value.match(/\*/g) || []).length
                                                        if (starCount > 1) {
                                                            // Keep only the first *
                                                            const firstStarIndex = value.indexOf('*')
                                                            value = value.substring(0, firstStarIndex + 1) + value.substring(firstStarIndex + 1).replace(/\*/g, '')
                                                        }
                                                    }
                                                    setSubmitForm({ ...submitForm, amount: value })
                                                }}

                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        // Auto-add default bet type if possible
                                                        const digits = submitForm.numbers.replace(/\*/g, '').length
                                                        if (digits === 2) addToDraft('2_top')
                                                        else if (digits === 3) addToDraft('3_top')
                                                    }
                                                }}
                                            />
                                            {submitForm.amount && (
                                                <button
                                                    type="button"
                                                    className="clear-btn"
                                                    onClick={() => {
                                                        setSubmitForm({ ...submitForm, amount: '' })
                                                        amountInputRef.current?.focus()
                                                    }}
                                                >
                                                    <FiX />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                <div className="bet-type-selection">
                                    <label className="form-label">เลือกประเภท</label>
                                    <div className="bet-type-grid">
                                        {(() => {
                                            const digits = submitForm.numbers.replace(/\*/g, '').length
                                            const hasStarInAmount = submitForm.amount.toString().includes('*')
                                            const lotteryType = selectedRound.lottery_type
                                            const amount = submitForm.amount.toString()
                                            const isAmountEmpty = !amount || amount === '0' || amount === ''

                                            let available = []

                                            // Check if amount is incomplete (ends with * but no second number)
                                            const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
                                            const isIncompleteAmount = amount.includes('*') && amtParts.length < 2

                                            // Only show bet type buttons if amount is also entered and complete
                                            // Exception: For 4-digit on Lao/Hanoi, show "4 ตัวชุด" even when amount is empty
                                            const isLaoOrHanoi4Digit = digits === 4 && ['lao', 'hanoi'].includes(lotteryType)
                                            if ((isAmountEmpty || isIncompleteAmount) && !isLaoOrHanoi4Digit) {
                                                // Don't show any buttons if amount is empty or incomplete
                                                available = []
                                            } else if (digits === 1) {
                                                available = ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1']
                                            } else if (digits === 2) {

                                                // Check if we have 2 complete amount parts (e.g., "100*50")
                                                const amtParts = amount.split('*').filter(p => p && !isNaN(parseFloat(p)))
                                                const hasTwoAmounts = amtParts.length === 2

                                                if (hasTwoAmounts) {
                                                    // With 2 amounts - show reversed types (กลับ)
                                                    available = ['2_top_rev', '2_front_rev', '2_spread_rev', '2_bottom_rev']
                                                } else if (amtParts.length === 1 && !amount.includes('*')) {
                                                    // Single amount without "*" - show normal types
                                                    available = ['2_top', '2_front', '2_spread', '2_have', '2_bottom']
                                                }
                                                // If amount ends with "*" but doesn't have 2nd number, show nothing


                                            } else if (digits === 3) {
                                                if (hasStarInAmount) {
                                                    const permCount = getPermutations(submitForm.numbers).length
                                                    available = [
                                                        { id: '3_straight_tod', label: 'เต็ง-โต๊ด' },
                                                        { id: '3_straight_perm', label: `1+กลับ (${permCount - 1})` }
                                                    ]
                                                } else {
                                                    const permCount = getPermutations(submitForm.numbers).length
                                                    available = [
                                                        '3_top',
                                                        '3_tod',
                                                        { id: '3_perm_from_3', label: `คูณชุด ${permCount}` }
                                                    ]
                                                    if (lotteryType === 'thai') available.push('3_bottom')
                                                }
                                            }
                                            else if (digits === 4) {
                                                const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
                                                if (isLaoOrHanoi) {
                                                    // For Lao and Hanoi: special logic for 4-digit
                                                    if (isAmountEmpty) {
                                                        // When amount is empty, only show "4 ตัวชุด"
                                                        available = ['4_set']
                                                    } else {
                                                        // When amount has value, show all options
                                                        const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                        available = [
                                                            '4_set',
                                                            '4_float',
                                                            { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                        ]
                                                    }
                                                } else {
                                                    // For other lottery types (Thai, etc.)
                                                    if (!isAmountEmpty) {
                                                        const permCount = getUnique3DigitPermsFrom4(submitForm.numbers).length
                                                        available = [
                                                            '4_float',
                                                            { id: '3_perm_from_4', label: `3 X ${permCount}` }
                                                        ]
                                                    }
                                                }
                                            }
                                            else if (digits === 5) {
                                                if (!isAmountEmpty) {
                                                    const permCount = getUnique3DigitPermsFrom5(submitForm.numbers).length
                                                    available = [
                                                        '5_float',
                                                        { id: '3_perm_from_5', label: `3 X ${permCount}` }
                                                    ]
                                                }
                                            }

                                            return available.map(item => {
                                                const key = typeof item === 'string' ? item : item.id
                                                const label = typeof item === 'string' ? (BET_TYPES[key]?.label || key) : item.label
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        className="bet-type-btn"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onTouchStart={(e) => e.preventDefault()}
                                                        onClick={() => addToDraft(key)}
                                                    >
                                                        {label}
                                                    </button>
                                                )
                                            })
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Drafts List */}
                            <div className="drafts-section card">
                                <div className="section-header">
                                    <h4>รายการที่เลือก ({drafts.length})</h4>
                                    <div className="section-header-actions">
                                        {drafts.length > 0 && (
                                            <button className="text-btn danger" onClick={() => setDrafts([])}>
                                                ล้างทั้งหมด
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="drafts-list">
                                    {drafts.length === 0 ? (
                                        <div className="empty-draft">ยังไม่มีรายการ</div>
                                    ) : (
                                        <table className="drafts-table">
                                            <thead>
                                                <tr>
                                                    <th>เลข</th>
                                                    <th>ประเภท</th>
                                                    <th>จำนวน</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Summary mode: group by entry_id and show display values */}
                                                {Object.values(
                                                    drafts.reduce((acc, d) => {
                                                        const key = d.entry_id || d.id || Math.random()
                                                        if (!acc[key]) {
                                                            acc[key] = {
                                                                key: key,
                                                                entry_id: d.entry_id,
                                                                display_numbers: d.display_numbers || d.numbers,
                                                                display_bet_type: d.display_bet_type || BET_TYPES[d.bet_type]?.label,
                                                                display_amount: d.display_amount || d.amount.toString(),
                                                                totalAmount: d.amount,
                                                                items: [d]
                                                            }
                                                        } else {
                                                            acc[key].totalAmount += d.amount
                                                            acc[key].items.push(d)
                                                        }
                                                        return acc
                                                    }, {})
                                                ).map((group, idx) => (
                                                    <tr key={idx}>
                                                        <td>{group.display_numbers}</td>
                                                        <td>{group.display_bet_type}</td>
                                                        <td>{group.items.length > 1 ? group.display_amount : group.totalAmount.toLocaleString()}</td>
                                                        <td>
                                                            <button
                                                                className="icon-btn danger mini"
                                                                onClick={() => {
                                                                    if (group.entry_id) {
                                                                        // Delete entire group by entry_id
                                                                        setDrafts(prev => prev.filter(d => d.entry_id !== group.entry_id))
                                                                    } else {
                                                                        // Single item, delete by key
                                                                        setDrafts(prev => prev.filter(d => (d.entry_id || d.id) !== group.key))
                                                                    }
                                                                }}
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                <div className="drafts-footer">
                                    <div className="total-row">
                                        <span>ยอดรวม:</span>
                                        <span className="total-value">
                                            {selectedRound.currency_symbol}
                                            {drafts.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <button
                                        className="btn btn-primary btn-block"
                                        disabled={drafts.length === 0 || submitting}
                                        onClick={handleSaveBill}
                                    >
                                        {submitting ? 'กำลังบันทึก...' : 'บันทึกโพย'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Toast Notification */}
                        {toast && (
                            <div className={`toast-notification ${toast.type}`}>
                                <FiCheck /> {toast.message}
                            </div>
                        )}
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
        </div>
    )
}

// Dealer Info Tab Component - Shows selected dealer's information
function DealerInfoTab({ dealer, userSettings }) {
    const { user } = useAuth()
    const [dealerProfile, setDealerProfile] = useState(null)
    const [dealerBankAccounts, setDealerBankAccounts] = useState([])
    const [assignedBankAccountId, setAssignedBankAccountId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [subTab, setSubTab] = useState('profile') // 'profile' or 'rates'
    const [ratesTab, setRatesTab] = useState('thai') // lottery type tab for rates

    useEffect(() => {
        if (dealer?.id) {
            fetchDealerInfo()
        }
    }, [dealer?.id])

    async function fetchDealerInfo() {
        setLoading(true)
        try {
            // Fetch dealer profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', dealer.id)
                .single()

            if (profileData) {
                setDealerProfile(profileData)
            }

            // Fetch dealer bank accounts
            const { data: bankData } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', dealer.id)
                .order('is_default', { ascending: false })

            if (bankData) {
                setDealerBankAccounts(bankData)
            }

            // Fetch membership to get assigned_bank_account_id
            if (user?.id) {
                const { data: membershipData } = await supabase
                    .from('user_dealer_memberships')
                    .select('assigned_bank_account_id')
                    .eq('user_id', user.id)
                    .eq('dealer_id', dealer.id)
                    .eq('status', 'active')
                    .single()

                if (membershipData) {
                    setAssignedBankAccountId(membershipData.assigned_bank_account_id)
                }
            }
        } catch (error) {
            console.error('Error fetching dealer info:', error)
        } finally {
            setLoading(false)
        }
    }

    // Get assigned bank account or default/first bank account
    const primaryBank = assignedBankAccountId
        ? dealerBankAccounts.find(b => b.id === assignedBankAccountId)
        : (dealerBankAccounts.find(b => b.is_default) || dealerBankAccounts[0])

    // Commission and payout rates from user settings
    const commissionRates = userSettings?.commission_rates || {}
    const payoutRates = userSettings?.payout_rates || {}

    if (loading) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
            </div>
        )
    }

    // Default settings and labels for rates display
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
            '4_top': '4 ตัวตรง (ชุด)',
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

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว/ฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    // Merge user settings with defaults
    const getMergedSettings = () => {
        const defaults = getDefaultSettings()
        if (!userSettings?.lottery_settings) return defaults
        
        const merged = { ...defaults }
        Object.keys(userSettings.lottery_settings).forEach(tab => {
            if (merged[tab]) {
                Object.keys(userSettings.lottery_settings[tab]).forEach(key => {
                    if (merged[tab][key]) {
                        merged[tab][key] = { ...merged[tab][key], ...userSettings.lottery_settings[tab][key] }
                    }
                })
            }
        })
        return merged
    }

    const settings = getMergedSettings()

    return (
        <div className="dealer-info-section">
            {/* Sub-tabs */}
            <div className="sub-tabs">
                <button
                    className={`sub-tab-btn ${subTab === 'profile' ? 'active' : ''}`}
                    onClick={() => setSubTab('profile')}
                >
                    <FiUser /> โปรไฟล์เจ้ามือ
                </button>
                <button
                    className={`sub-tab-btn ${subTab === 'rates' ? 'active' : ''}`}
                    onClick={() => setSubTab('rates')}
                >
                    <FiDollarSign /> ค่าคอม/อัตราจ่าย
                </button>
            </div>

            {subTab === 'profile' ? (
                <>
                    {/* Dealer Info Card */}
                    <div className="profile-card card">
                        <div className="profile-header">
                            <div className="profile-avatar dealer-avatar">
                                <FiUser />
                            </div>
                            <div className="profile-info">
                                <h2>{dealerProfile?.full_name || dealer.full_name || 'ไม่ระบุชื่อ'}</h2>
                                <p className="email">{dealerProfile?.email || dealer.email}</p>
                                <span className="role-badge role-dealer">เจ้ามือ</span>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="profile-details card">
                        <h3>ข้อมูลติดต่อ</h3>
                        <div className="profile-info-list">
                            <div className="info-row">
                                <span className="info-label">ชื่อ</span>
                                <span className="info-value">{dealerProfile?.full_name || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">อีเมล</span>
                                <span className="info-value">{dealerProfile?.email || '-'}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">เบอร์โทร</span>
                                <span className="info-value">{dealerProfile?.phone || '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Bank Account for Transfer */}
                    <div className="profile-details card">
                        <h3>บัญชีธนาคาร (สำหรับโอนเงิน)</h3>
                        {primaryBank ? (
                            <div className="profile-info-list">
                                <div className="info-row">
                                    <span className="info-label">ธนาคาร</span>
                                    <span className="info-value">{primaryBank.bank_name}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">ชื่อบัญชี</span>
                                    <span className="info-value">{primaryBank.account_name || '-'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">เลขบัญชี</span>
                                    <span className="info-value bank-account-number">{primaryBank.bank_account}</span>
                                </div>
                                {primaryBank.is_default && (
                                    <div className="default-badge">
                                        <FiCheck /> บัญชีหลัก
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="empty-state small">
                                <p>ยังไม่มีข้อมูลบัญชีธนาคาร</p>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Commission and Payout Rates */}
                    <div className="rates-section card">
                        <h3><FiDollarSign /> ค่าคอมมิชชั่นและอัตราจ่าย</h3>
                        <p className="rates-description">อัตราที่เจ้ามือกำหนดให้กับคุณ</p>
                        
                        {/* Lottery Type Tabs */}
                        <div className="rates-tabs">
                            {LOTTERY_TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`rates-tab ${ratesTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setRatesTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Rates Table */}
                        <div className="rates-table-container">
                            <table className="rates-table">
                                <thead>
                                    <tr>
                                        <th>ประเภทเลข</th>
                                        <th>ค่าคอม</th>
                                        <th>อัตราจ่าย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(settings[ratesTab] || {}).map(([key, value]) => (
                                        <tr key={key} className={value.isFixed ? 'fixed-row' : ''}>
                                            <td className="type-cell">{BET_LABELS[ratesTab]?.[key] || key}</td>
                                            <td className="rate-cell">
                                                <span className="rate-value">{value.commission}</span>
                                                <span className="rate-unit">{value.isFixed ? '฿/ชุด' : '%'}</span>
                                            </td>
                                            <td className="rate-cell">
                                                <span className="rate-value">{value.payout?.toLocaleString()}</span>
                                                <span className="rate-unit">เท่า</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

// History Tab Component
function HistoryTab({ user, profile }) {
    const [submissions, setSubmissions] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistory()
    }, [])

    async function fetchHistory() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('submissions')
                .select(`
                    *,
                    lottery_rounds (
                        lottery_name,
                        lottery_type,
                        round_date,
                        is_result_announced,
                        currency_symbol
                    )
                `)
                .eq('user_id', user.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error) setSubmissions(data || [])
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    const totalWon = submissions.filter(s => s.is_winner).reduce((sum, s) => sum + (s.prize_amount || 0), 0)
    const totalSpent = submissions.reduce((sum, s) => sum + (s.amount || 0), 0)

    return (
        <div className="history-section">
            <div className="stats-row">
                <div className="stat-card">
                    <span className="stat-value">{submissions.length}</span>
                    <span className="stat-label">รายการทั้งหมด</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">฿{totalSpent.toLocaleString()}</span>
                    <span className="stat-label">ยอดรวม</span>
                </div>
                <div className="stat-card highlight">
                    <span className="stat-value">฿{totalWon.toLocaleString()}</span>
                    <span className="stat-label">รางวัลที่ได้</span>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                </div>
            ) : (
                <div className="history-list">
                    {submissions.map(sub => (
                        <div key={sub.id} className={`history-card card ${sub.is_winner ? 'winner' : ''}`}>
                            <div className="history-header">
                                <span className={`lottery-badge ${sub.lottery_rounds?.lottery_type}`}>
                                    {sub.lottery_rounds?.lottery_name}
                                </span>
                                <span className="history-date">
                                    {new Date(sub.lottery_rounds?.round_date).toLocaleDateString('th-TH')}
                                </span>
                            </div>
                            <div className="history-content">
                                <span className="type-badge">{BET_TYPES[sub.bet_type]?.label}</span>
                                <span className="number-cell">{sub.numbers}</span>
                                <span className="amount">
                                    {sub.lottery_rounds?.currency_symbol}{sub.amount?.toLocaleString()}
                                </span>
                            </div>
                            <div className="history-status">
                                {sub.lottery_rounds?.is_result_announced ? (
                                    sub.is_winner ? (
                                        <span className="status-badge won">
                                            <FiCheck /> ถูกรางวัล +{sub.lottery_rounds?.currency_symbol}{sub.prize_amount?.toLocaleString()}
                                        </span>
                                    ) : (
                                        <span className="status-badge lost">ไม่ถูกรางวัล</span>
                                    )
                                ) : (
                                    <span className="status-badge pending"><FiClock /> รอผล</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// Profile Tab Component
function ProfileTab({ user, profile }) {
    const { toast } = useToast()
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    // Use local state for profile data that can be updated without page reload
    const [profileData, setProfileData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        bank_name: profile?.bank_name || '',
        bank_account: profile?.bank_account || '',
        role: profile?.role || 'user'
    })
    const [formData, setFormData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        bank_name: profile?.bank_name || '',
        bank_account: profile?.bank_account || ''
    })

    // Update local state when profile prop changes (initial load)
    useEffect(() => {
        if (profile) {
            setProfileData({
                full_name: profile.full_name || '',
                phone: profile.phone || '',
                bank_name: profile.bank_name || '',
                bank_account: profile.bank_account || '',
                role: profile.role || 'user'
            })
            setFormData({
                full_name: profile.full_name || '',
                phone: profile.phone || '',
                bank_name: profile.bank_name || '',
                bank_account: profile.bank_account || ''
            })
        }
    }, [profile])

    const handleSave = async () => {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name,
                    phone: formData.phone,
                    bank_name: formData.bank_name,
                    bank_account: formData.bank_account
                })
                .eq('id', user.id)

            if (error) throw error

            // Update local profile data to reflect saved changes
            setProfileData({
                ...profileData,
                full_name: formData.full_name,
                phone: formData.phone,
                bank_name: formData.bank_name,
                bank_account: formData.bank_account
            })

            setIsEditing(false)
            toast.success('บันทึกข้อมูลสำเร็จ!')
        } catch (error) {
            console.error('Error saving profile:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

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

    return (
        <div className="profile-section">
            {/* User Info Card */}
            <div className="profile-card card">
                <div className="profile-header">
                    <div className="profile-avatar">
                        <FiUser />
                    </div>
                    <div className="profile-info">
                        <h2>{profileData.full_name || 'ไม่ระบุชื่อ'}</h2>
                        <p className="email">{user?.email}</p>
                        <span className={`role-badge role-${profileData.role}`}>
                            {profileData.role === 'dealer' ? 'เจ้ามือ' :
                                profileData.role === 'superadmin' ? 'Admin' : 'สมาชิก'}
                        </span>
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
            </div>

            {/* Profile Details */}
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

            {/* Bank Info */}
            <div className="profile-details card">
                <h3>ข้อมูลธนาคาร</h3>

                {isEditing ? (
                    <div className="profile-form">
                        <div className="form-group">
                            <label className="form-label">ธนาคาร</label>
                            <select
                                className="form-input"
                                value={formData.bank_name}
                                onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
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
                                value={formData.bank_account}
                                onChange={e => setFormData({ ...formData, bank_account: e.target.value })}
                                placeholder="xxx-x-xxxxx-x"
                            />
                        </div>

                        <div className="form-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setIsEditing(false)
                                    setFormData({
                                        full_name: profileData.full_name || '',
                                        phone: profileData.phone || '',
                                        bank_name: profileData.bank_name || '',
                                        bank_account: profileData.bank_account || ''
                                    })
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'กำลังบันทึก...' : <><FiSave /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="profile-info-list">
                        <div className="info-row">
                            <span className="info-label">ธนาคาร</span>
                            <span className="info-value">{profileData.bank_name || '-'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">เลขบัญชี</span>
                            <span className="info-value">{profileData.bank_account || '-'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className={`toast-notification ${toast.type}`}>
                    <FiCheck /> {toast.message}
                </div>
            )}
        </div>
    )
}
