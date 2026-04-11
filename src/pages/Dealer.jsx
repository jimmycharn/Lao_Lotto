import { useState, useEffect, useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme, DASHBOARDS } from '../contexts/ThemeContext'
import { supabase, fetchAllRows } from '../lib/supabase'
import { processTopup } from '../services/creditService'
import { checkDealerCreditForBet, checkUpstreamDealerCredit, getDealerCreditSummary, updatePendingDeduction, deductAdditionalCreditForRound } from '../utils/creditCheck'
import QRCode from 'react-qr-code'
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode'
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
    FiSearch,
    FiSlash,
    FiInfo,
    FiLink,
    FiCreditCard,
    FiImage,
    FiRefreshCw
} from 'react-icons/fi'
import './Dealer.css'
import './SettingsTabs.css'

// Import constants from centralized file
import {
    LOTTERY_TYPES,
    BET_TYPES,
    BET_TYPES_BY_LOTTERY,
    DEFAULT_COMMISSIONS,
    DEFAULT_PAYOUTS,
    DEFAULT_4_SET_SETTINGS,
    normalizeNumber,
    generateBatchId,
    getDefaultLimitsForType,
    getDefaultSetPricesForType,
    getLotteryTypeKey,
    calculate4SetPrizes
} from '../constants/lotteryTypes'

// Import separated modal components
import ResultsModal from '../components/dealer/ResultsModal'
import NumberLimitsModal from '../components/dealer/NumberLimitsModal'
import SummaryModal from '../components/dealer/SummaryModal'
import RoundAccordionItem from '../components/dealer/RoundAccordionItem'
import ChangePasswordModal from '../components/ChangePasswordModal'
import SubmissionsModal from '../components/dealer/SubmissionsModal'
import DealerProfileTab from '../components/dealer/DealerProfileTab'
import QRScannerModal from '../components/dealer/QRScannerModal'
import MemberAccordionItem from '../components/dealer/MemberAccordionItem'
import UpstreamDealerSettingsInline from '../components/dealer/UpstreamDealerSettingsInline'
import UpstreamDealerAccordionItem from '../components/dealer/UpstreamDealerAccordionItem'
import UpstreamDealersTab from '../components/dealer/UpstreamDealersTab'
import UpstreamDealerSettings from '../components/dealer/UpstreamDealerSettings'
import MemberSettings from '../components/dealer/MemberSettings'
import BankAccountCard from '../components/BankAccountCard'
import CopyButton from '../components/CopyButton'

export default function Dealer() {
    const { user, profile, loading: authLoading, isDealer, isSuperAdmin, isAccountSuspended, skipAuthEventRef } = useAuth()
    const { toast } = useToast()
    const { setActiveDashboard, getTheme } = useTheme()
    const [searchParams] = useSearchParams()
    const hasFetchedRef = useRef(false)

    // Set active dashboard for theme on mount
    useEffect(() => {
        setActiveDashboard(DASHBOARDS.DEALER)
    }, [setActiveDashboard])
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
    const [expandedRoundId, setExpandedRoundId] = useState(null) // Only one round can be expanded at a time
    const [subscription, setSubscription] = useState(null)
    const [dealerBankAccounts, setDealerBankAccounts] = useState([])
    const [roundsTab, setRoundsTab] = useState('open') // 'open' | 'closed' | 'history'
    const [roundHistory, setRoundHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [expandedHistoryId, setExpandedHistoryId] = useState(null)
    const [historyUserDetails, setHistoryUserDetails] = useState({})
    const [upstreamDealers, setUpstreamDealers] = useState([])
    const [loadingUpstream, setLoadingUpstream] = useState(false)
    const [downstreamDealers, setDownstreamDealers] = useState([]) // Dealers who send bets TO us
    const [memberTypeFilter, setMemberTypeFilter] = useState('all') // 'all' | 'member' | 'dealer'
    const [allowedLotteryTypes, setAllowedLotteryTypes] = useState(null) // Lottery types allowed for this dealer
    const [historyMonthFilter, setHistoryMonthFilter] = useState('all') // 'all' | 'YYYY-MM' format
    const [historyLotteryFilter, setHistoryLotteryFilter] = useState('all') // 'all' | lottery type key

    // Add member modal states
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)
    const [addMemberForm, setAddMemberForm] = useState({ email: '', full_name: '', phone: '', membership_years: 1 })
    const [addingMember, setAddingMember] = useState(false)
    const [newMemberCredentials, setNewMemberCredentials] = useState(null) // { email, password, url }

    // Renew membership modal states
    const [showRenewModal, setShowRenewModal] = useState(false)
    const [renewMember, setRenewMember] = useState(null)
    const [renewYears, setRenewYears] = useState(1)
    const [renewing, setRenewing] = useState(false)

    // Approve member with years (for per_user_yearly)
    const [showApproveYearsModal, setShowApproveYearsModal] = useState(false)
    const [approveMemberTarget, setApproveMemberTarget] = useState(null)
    const [approveYears, setApproveYears] = useState(1)
    const [approving, setApproving] = useState(false)

    // QR Code modal state
    const [showQRModal, setShowQRModal] = useState(false)
    const [showScannerModal, setShowScannerModal] = useState(false)
    const [memberSearchQuery, setMemberSearchQuery] = useState('')

    // Credit system states
    const [dealerCredit, setDealerCredit] = useState(null)
    const [creditLoading, setCreditLoading] = useState(false)
    const [creditSummary, setCreditSummary] = useState(null)
    const [pendingCreditRefresh, setPendingCreditRefresh] = useState(0)
    const [roundPendingMap, setRoundPendingMap] = useState({}) // { roundId: { pending_fee, ... } }

    // Topup Modal states
    const [showTopupModal, setShowTopupModal] = useState(false)
    const [assignedBankAccount, setAssignedBankAccount] = useState(null)
    const [topupForm, setTopupForm] = useState({ amount: '', slip_file: null })
    const [topupLoading, setTopupLoading] = useState(false)
    const [slipPreview, setSlipPreview] = useState(null)
    const [topupHistory, setTopupHistory] = useState([])

    // Read tab from URL params
    useEffect(() => {
        const tabParam = searchParams.get('tab')
        if (tabParam === 'profile') {
            setActiveTab('profile')
        } else if (tabParam === 'upstreamDealers') {
            setActiveTab('upstreamDealers')
        }
    }, [searchParams])

    // Helper to check if a round is still open (not yet past close_time)
    const isRoundOpen = (round) => {
        // If status is announced, it's definitely closed
        if (round.status === 'announced') return false
        // A round is "open" if close_time hasn't passed yet (including rounds waiting to open)
        const now = new Date()
        const closeTime = new Date(round.close_time)
        return now <= closeTime
    }

    // Form state for creating round
    const [roundForm, setRoundForm] = useState({
        lottery_type: 'lao',
        lottery_name: '',
        open_date: new Date().toISOString().split('T')[0],
        open_time: '08:00',
        close_date: new Date().toISOString().split('T')[0],
        close_time: '20:00',
        delete_before_minutes: 1,
        delete_after_submit_minutes: 0, // 0 = ไม่จำกัดเวลาหลังป้อน (ใช้แค่ delete_before_minutes)
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

    // Fetch data on mount only (not on every profile change)
    useEffect(() => {
        // Wait for profile to be loaded before deciding
        if (!profile?.id) return

        if (user?.id && (isDealer || isSuperAdmin)) {
            // Prevent duplicate fetches on token refresh / app switch
            if (hasFetchedRef.current) return
            hasFetchedRef.current = true
            fetchDealerCredit() // Load credit first (parallel with fetchData)
            fetchData()
        } else {
            // User is logged in but not a dealer - stop loading
            setLoading(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, profile?.id, isDealer, isSuperAdmin])

    async function fetchData() {
        setLoading(true)

        // Set a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            console.warn('Fetch data timeout - forcing loading to false')
            setLoading(false)
        }, 15000)

        try {
            // Fetch ALL rounds with type_limits in a single query (no inner join)
            // Then count submissions separately to know which rounds have active submissions
            const { data: allRoundsData, error: roundsError } = await supabase
                .from('lottery_rounds')
                .select(`
                    *,
                    type_limits (*),
                    submissions (id)
                `)
                .eq('dealer_id', user.id)
                .eq('submissions.is_deleted', false)
                .order('round_date', { ascending: false })
                .limit(20)

            // Filter out deleted submissions from the result (LEFT JOIN returns nulls)
            const mergedRounds = (allRoundsData || []).map(round => ({
                ...round,
                submissions: (round.submissions || []).filter(s => s && s.id)
            }))

            if (!roundsError) {
                setRounds(mergedRounds)
                if (!selectedRound && mergedRounds.length > 0) {
                    setSelectedRound(mergedRounds[0])
                }
            }

            // Fetch members from memberships table
            const { data: membershipsData, error: membershipsError } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    *,
                    profiles:user_id (
                        id,
                        email,
                        full_name,
                        phone,
                        created_at,
                        role,
                        password_changed
                    )
                `)
                .eq('dealer_id', user.id)
                .neq('user_id', user.id) // Exclude self-membership
                .order('created_at', { ascending: false })

            if (membershipsError) {
                console.error('Error fetching memberships:', membershipsError)
            }

            // Fetch user bank accounts for all members
            const memberIds = (membershipsData || []).map(m => m.user_id).filter(Boolean)
            let memberBankAccountsMap = {}
            if (memberIds.length > 0) {
                const { data: memberBanks } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .in('user_id', memberIds)
                    .order('is_default', { ascending: false })

                if (memberBanks) {
                    memberBanks.forEach(bank => {
                        if (!memberBankAccountsMap[bank.user_id]) {
                            memberBankAccountsMap[bank.user_id] = []
                        }
                        memberBankAccountsMap[bank.user_id].push(bank)
                    })
                }
            }

            // Transform and categorize memberships
            const allMemberships = (membershipsData || []).map(m => {
                const userBanks = memberBankAccountsMap[m.user_id] || []
                // Determine which bank account the member assigned for this dealer
                const memberBank = m.member_bank_account_id
                    ? userBanks.find(b => b.id === m.member_bank_account_id)
                    : (userBanks.find(b => b.is_default) || userBanks[0])

                return {
                    ...m.profiles,
                    membership_id: m.id,
                    membership_status: m.status,
                    membership_created_at: m.created_at,
                    approved_at: m.approved_at,
                    blocked_at: m.blocked_at,
                    membership_expires_at: m.membership_expires_at || null,
                    membership_years: m.membership_years || null,
                    assigned_bank_account_id: m.assigned_bank_account_id,
                    member_bank_account_id: m.member_bank_account_id,
                    member_bank: memberBank || null,
                    is_dealer: m.profiles?.role === 'dealer', // Mark if member is also a dealer
                    password_changed: m.profiles?.password_changed || false // Track if user has changed password
                }
            })

            // Separate regular members from dealer members (เจ้ามือตีเข้า)
            const regularMembers = allMemberships.filter(m => !m.is_dealer)
            const dealerMembers = allMemberships.filter(m => m.is_dealer)

            setMembers(regularMembers.filter(m => m.membership_status === 'active'))
            setPendingMembers(regularMembers.filter(m => m.membership_status === 'pending'))
            setBlockedMembers(regularMembers.filter(m => m.membership_status === 'blocked'))

            // Add dealer members to downstreamDealers (will be merged with connections later)
            const dealerMembersTransformed = dealerMembers.map(m => ({
                id: m.id,
                email: m.email,
                full_name: m.full_name,
                phone: m.phone,
                created_at: m.created_at,
                membership_id: m.membership_id,
                membership_status: m.membership_status,
                membership_created_at: m.membership_created_at,
                assigned_bank_account_id: m.assigned_bank_account_id,
                member_bank_account_id: m.member_bank_account_id,
                member_bank: m.member_bank,
                is_dealer: true,
                is_from_membership: true, // Mark as from membership table
                connection_id: m.membership_id
            }))

            // Parallelize independent queries with Promise.all()
            const [subscriptionResult, bankAccountsResult, dealerSettingsResult, downstreamResult] = await Promise.allSettled([
                // 1. Fetch subscription
                supabase
                    .from('dealer_subscriptions')
                    .select(`
                        *,
                        subscription_packages (
                            id,
                            name,
                            description,
                            billing_model,
                            percentage_rate,
                            profit_percentage_rate,
                            price_per_user_per_year,
                            monthly_price,
                            yearly_price,
                            max_users,
                            features
                        )
                    `)
                    .eq('dealer_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),

                // 2. Fetch dealer bank accounts
                supabase
                    .from('dealer_bank_accounts')
                    .select('*')
                    .eq('dealer_id', user.id)
                    .order('is_default', { ascending: false }),

                // 3. Fetch dealer settings
                supabase
                    .from('profiles')
                    .select('allowed_lottery_types')
                    .eq('id', user.id)
                    .maybeSingle(),

                // 4. Fetch downstream dealers
                supabase
                    .from('dealer_upstream_connections')
                    .select(`
                        *,
                        dealer_profile:dealer_id (
                            id, full_name, email, phone, created_at
                        )
                    `)
                    .eq('upstream_dealer_id', user.id)
                    .order('created_at', { ascending: false })
            ])

            // Process subscription result
            if (subscriptionResult.status === 'fulfilled' && !subscriptionResult.value.error) {
                setSubscription(subscriptionResult.value.data)
            } else {
                setSubscription(null)
            }

            // Process bank accounts result
            if (bankAccountsResult.status === 'fulfilled') {
                setDealerBankAccounts(bankAccountsResult.value.data || [])
            }

            // Process dealer settings result
            if (dealerSettingsResult.status === 'fulfilled' && !dealerSettingsResult.value.error && dealerSettingsResult.value.data) {
                setAllowedLotteryTypes(dealerSettingsResult.value.data.allowed_lottery_types)
            }

            // Process downstream dealers
            let allDownstreamDealers = []
            try {
                const downstreamData = downstreamResult.status === 'fulfilled' && !downstreamResult.value.error
                    ? downstreamResult.value.data
                    : null

                if (downstreamData && downstreamData.length > 0) {
                    // Fetch downstream dealer bank accounts & memberships in parallel
                    const downstreamDealerIds = downstreamData.map(d => d.dealer_id).filter(Boolean)
                    let downstreamBankMap = {}
                    let downstreamMembershipMap = {}

                    if (downstreamDealerIds.length > 0) {
                        const [banksRes, membershipsRes] = await Promise.all([
                            supabase
                                .from('dealer_bank_accounts')
                                .select('*')
                                .in('dealer_id', downstreamDealerIds)
                                .order('is_default', { ascending: false }),
                            supabase
                                .from('user_dealer_memberships')
                                .select('id, user_id, member_bank_account_id, assigned_bank_account_id')
                                .in('user_id', downstreamDealerIds)
                                .eq('dealer_id', user.id)
                                .eq('status', 'active')
                        ])

                        if (banksRes.data) {
                            banksRes.data.forEach(bank => {
                                if (!downstreamBankMap[bank.dealer_id]) {
                                    downstreamBankMap[bank.dealer_id] = []
                                }
                                downstreamBankMap[bank.dealer_id].push(bank)
                            })
                        }

                        if (membershipsRes.data) {
                            membershipsRes.data.forEach(m => {
                                downstreamMembershipMap[m.user_id] = {
                                    real_membership_id: m.id,
                                    member_bank_account_id: m.member_bank_account_id,
                                    assigned_bank_account_id: m.assigned_bank_account_id
                                }
                            })
                        }
                    }

                    // Transform to match member structure
                    const transformedDownstream = downstreamData.map(d => {
                        const membershipData = downstreamMembershipMap[d.dealer_id] || {}
                        const dealerBanks = downstreamBankMap[d.dealer_id] || []
                        const userBanks = memberBankAccountsMap[d.dealer_id] || []
                        const allBanks = [...dealerBanks, ...userBanks]
                        const memberBankAccountId = d.my_bank_account_id || membershipData.member_bank_account_id
                        const memberBank = memberBankAccountId
                            ? allBanks.find(b => b.id === memberBankAccountId)
                            : (allBanks.find(b => b.is_default) || allBanks[0])
                        const assignedBankId = d.assigned_bank_account_id || membershipData.assigned_bank_account_id || null

                        return {
                            id: d.dealer_profile?.id,
                            email: d.dealer_profile?.email,
                            full_name: d.dealer_profile?.full_name || d.upstream_name,
                            phone: d.dealer_profile?.phone,
                            created_at: d.dealer_profile?.created_at,
                            membership_id: membershipData.real_membership_id || d.id,
                            membership_status: d.status || (d.is_blocked ? 'blocked' : 'active'),
                            membership_created_at: d.created_at,
                            assigned_bank_account_id: assignedBankId,
                            member_bank: memberBank || null,
                            is_dealer: true,
                            is_linked: d.is_linked,
                            lottery_settings: d.lottery_settings,
                            connection_id: d.id
                        }
                    })
                    allDownstreamDealers = [...transformedDownstream]
                }

                // Merge with dealer members from memberships
                const existingIds = allDownstreamDealers.map(d => d.id).filter(Boolean)
                const newDealerMembers = dealerMembersTransformed.filter(d => !existingIds.includes(d.id))
                allDownstreamDealers = [...allDownstreamDealers, ...newDealerMembers]

                setDownstreamDealers(allDownstreamDealers)
            } catch (downstreamErr) {
                console.log('Downstream dealers processing error:', downstreamErr)
                setDownstreamDealers(dealerMembersTransformed)
            }

        } catch (error) {
            console.error('Error:', error)
        } finally {
            clearTimeout(timeoutId)
            setLoading(false)
        }

        // Fetch bank account and topup history (credit already loaded in parallel)
        fetchAssignedBankAccount()
        fetchTopupHistory()
    }

    // Fetch round history for dealer
    async function fetchRoundHistory() {
        if (!user?.id) return
        setHistoryLoading(true)
        try {
            const { data, error } = await supabase
                .from('round_history')
                .select('*')
                .eq('dealer_id', user.id)
                .order('deleted_at', { ascending: false })

            if (!error && data) {
                setRoundHistory(data)
            }
        } catch (error) {
            console.error('Error fetching round history:', error)
        } finally {
            setHistoryLoading(false)
        }
    }

    // Fetch user details for a history round (accordion expand)
    async function fetchHistoryUserDetails(historyItem) {
        const roundId = historyItem.round_id
        if (!roundId || historyUserDetails[roundId]) return // Already loaded
        
        try {
            const { data: userHistories, error } = await supabase
                .from('user_round_history')
                .select('*')
                .eq('round_id', roundId)
                .eq('dealer_id', user.id)

            if (error) {
                console.error('Error fetching user history details:', error)
                return
            }

            // Fetch user profiles for display names
            const userIds = userHistories?.map(uh => uh.user_id) || []
            let profilesMap = {}
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', userIds)

                profiles?.forEach(p => {
                    profilesMap[p.id] = p
                })
            }

            // Merge user names into history data
            const enriched = (userHistories || []).map(uh => ({
                ...uh,
                full_name: profilesMap[uh.user_id]?.full_name || profilesMap[uh.user_id]?.email || 'ไม่ทราบชื่อ'
            }))

            setHistoryUserDetails(prev => ({ ...prev, [roundId]: enriched }))
        } catch (err) {
            console.error('Error:', err)
        }
    }

    // Toggle history accordion
    function toggleHistoryAccordion(historyItem) {
        const id = historyItem.id
        if (expandedHistoryId === id) {
            setExpandedHistoryId(null)
        } else {
            setExpandedHistoryId(id)
            fetchHistoryUserDetails(historyItem)
        }
    }

    // Delete a history record
    async function handleDeleteHistory(historyId, e) {
        e.stopPropagation()
        if (!window.confirm('ต้องการลบประวัติงวดหวยนี้หรือไม่?')) return
        try {
            const { error } = await supabase
                .from('round_history')
                .delete()
                .eq('id', historyId)
                .eq('dealer_id', user.id)
            if (error) throw error
            setRoundHistory(prev => prev.filter(h => h.id !== historyId))
            if (expandedHistoryId === historyId) setExpandedHistoryId(null)
            toast('ลบประวัติงวดหวยสำเร็จ', 'success')
        } catch (err) {
            console.error('Error deleting history:', err)
            toast('ลบประวัติไม่สำเร็จ: ' + (err.message || 'Unknown error'), 'error')
        }
    }

    // Generate month options for history filter
    const historyMonthOptions = (() => {
        if (roundHistory.length === 0) return []
        const now = new Date()
        // Find the earliest date in history
        let earliest = now
        roundHistory.forEach(h => {
            const d = new Date(h.close_time || h.open_time || h.round_date)
            if (d < earliest) earliest = d
        })
        const options = []
        const current = new Date(now.getFullYear(), now.getMonth(), 1)
        const start = new Date(earliest.getFullYear(), earliest.getMonth(), 1)
        while (current >= start) {
            const yyyy = current.getFullYear()
            const mm = current.getMonth()
            const thaiYear = yyyy + 543
            const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
            const key = `${yyyy}-${String(mm + 1).padStart(2, '0')}`
            // Date range: 1st of month to last day of month (or today if current month)
            const firstDay = new Date(yyyy, mm, 1)
            const isCurrentMonth = yyyy === now.getFullYear() && mm === now.getMonth()
            const lastDay = isCurrentMonth ? now : new Date(yyyy, mm + 1, 0)
            const label = `${firstDay.getDate()} ${thaiMonths[mm]} ${thaiYear} - ${lastDay.getDate()} ${thaiMonths[lastDay.getMonth()]} ${lastDay.getFullYear() + 543}`
            options.push({ key, label })
            current.setMonth(current.getMonth() - 1)
        }
        return options
    })()

    // Filter history by month and lottery type
    const filteredHistory = roundHistory.filter(h => {
        // Month filter
        if (historyMonthFilter !== 'all') {
            const [filterYear, filterMonth] = historyMonthFilter.split('-').map(Number)
            const hDate = new Date(h.close_time || h.open_time || h.round_date)
            if (hDate.getFullYear() !== filterYear || (hDate.getMonth() + 1) !== filterMonth) return false
        }
        // Lottery type filter
        if (historyLotteryFilter !== 'all') {
            if (h.lottery_type !== historyLotteryFilter) return false
        }
        return true
    })

    // Aggregate summary for filtered history
    const historySummary = (() => {
        let totalAmount = 0, totalCommission = 0, totalPayout = 0
        let totalTransferred = 0, totalUpstreamComm = 0, totalUpstreamWin = 0
        let totalEntries = 0, totalTransferredEntries = 0
        filteredHistory.forEach(h => {
            totalEntries += (h.total_entries || 0)
            totalAmount += (h.total_amount || 0)
            totalCommission += (h.total_commission || 0)
            totalPayout += (h.total_payout || 0)
            totalTransferred += (h.transferred_amount || 0)
            totalTransferredEntries += (h.transferred_entries || 0)
            totalUpstreamComm += (h.upstream_commission || 0)
            totalUpstreamWin += (h.upstream_winnings || 0)
        })
        const incomingProfit = totalAmount - totalCommission - totalPayout
        const outgoingProfit = totalUpstreamWin + totalUpstreamComm - totalTransferred
        const totalProfit = incomingProfit + outgoingProfit
        return {
            totalEntries, totalAmount, totalCommission, totalPayout,
            totalTransferred, totalTransferredEntries, totalUpstreamComm, totalUpstreamWin,
            incomingProfit, outgoingProfit, totalProfit,
            hasOutgoing: totalTransferred > 0
        }
    })()

    // Get unique lottery types present in history for the filter dropdown
    const historyLotteryOptions = (() => {
        const types = new Set()
        roundHistory.forEach(h => { if (h.lottery_type) types.add(h.lottery_type) })
        // Filter to only allowed lottery types
        const allowed = allowedLotteryTypes
            ? [...types].filter(t => allowedLotteryTypes.includes(t))
            : [...types]
        return allowed.map(t => ({ key: t, label: LOTTERY_TYPES[t] || t }))
    })()

    // Fetch dealer credit balance
    async function fetchDealerCredit() {
        if (!user?.id) return
        setCreditLoading(true)
        try {
            // Step 1: Fetch credit data immediately (fast - show to user ASAP)
            const { data: creditData, error: creditError } = await supabase
                .from('dealer_credits')
                .select('*')
                .eq('dealer_id', user.id)
                .maybeSingle()

            if (creditData) {
                // Show balance immediately but don't show stale pending_deduction
                // It will be updated accurately after Step 2 recalculates
                setDealerCredit({
                    balance: creditData.balance,
                    pendingDeduction: 0,
                    availableCredit: creditData.balance,
                    outstanding_debt: creditData.outstanding_debt || 0,
                    is_blocked: creditData.is_blocked,
                    blocked_reason: creditData.blocked_reason,
                    warning_threshold: creditData.warning_threshold,
                    has_sufficient_credit: creditData.balance > 0 && !creditData.is_blocked,
                    is_low_credit: creditData.balance <= creditData.warning_threshold
                })
            }
            setCreditLoading(false)

            // Step 2: Recalculate pending_deduction (returns accurate totalPending + per-round breakdown)
            const { totalPending, roundBreakdown } = await updatePendingDeduction(user.id)
            
            // Build round pending map from breakdown (keyed by round_id)
            const newMap = {}
            if (roundBreakdown) {
                roundBreakdown.forEach(rb => {
                    newMap[rb.round_id] = { pending_fee: rb.pending_fee, percentage_rate: rb.percentage_rate }
                })
            }
            setRoundPendingMap(newMap)
            
            // Signal RoundAccordionItems to re-fetch their pending credits
            setPendingCreditRefresh(prev => prev + 1)

            // Step 3: Use the returned totalPending directly (no race condition)
            if (creditData) {
                const balance = creditData.balance
                const availableCredit = balance - totalPending
                setDealerCredit(prev => ({
                    ...prev,
                    pendingDeduction: totalPending,
                    availableCredit: availableCredit,
                    has_sufficient_credit: availableCredit > 0 && !prev?.is_blocked,
                    is_low_credit: availableCredit <= (prev?.warning_threshold || 1000)
                }))
            }

            // Also fetch credit summary with subscription info
            const summary = await getDealerCreditSummary(user.id)
            setCreditSummary(summary)
        } catch (err) {
            console.log('Credit system not available yet:', err)
        } finally {
            setCreditLoading(false)
        }
    }

    // Fetch assigned bank account for topup
    async function fetchAssignedBankAccount() {
        if (!user?.id) return
        try {
            const { data, error } = await supabase
                .from('dealer_bank_assignments')
                .select(`
                    *,
                    bank_account:bank_account_id (
                        id, bank_code, bank_name, account_number, account_name, is_active
                    )
                `)
                .eq('dealer_id', user.id)
                .eq('is_active', true)
                .maybeSingle()

            if (!error && data?.bank_account) {
                setAssignedBankAccount(data.bank_account)
            }
        } catch (err) {
            console.log('Bank assignment not available yet:', err)
        }
    }

    // Fetch topup history
    async function fetchTopupHistory() {
        if (!user?.id) return
        try {
            const { data, error } = await supabase
                .from('credit_topup_requests')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10)

            if (!error && data) {
                setTopupHistory(data)
            }
        } catch (err) {
            console.log('Topup history not available yet:', err)
        }
    }

    // Handle slip file selection
    const handleSlipFileChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            // Validate file type
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            if (!validTypes.includes(file.type)) {
                toast.error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP เท่านั้น')
                return
            }
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
                return
            }
            setTopupForm({ ...topupForm, slip_file: file })
            // Create preview
            const reader = new FileReader()
            reader.onloadend = () => {
                setSlipPreview(reader.result)
            }
            reader.readAsDataURL(file)
        }
    }

    // Handle topup submission - Check approval mode and process accordingly
    const handleTopupSubmit = async () => {
        if (!topupForm.amount || !topupForm.slip_file || !assignedBankAccount) {
            toast.error('กรุณากรอกจำนวนเงินและแนบสลิป')
            return
        }

        setTopupLoading(true)
        try {
            const amount = parseFloat(topupForm.amount)

            // Step 1: Check approval mode from system settings
            const { data: settingsData } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'slip_approval_mode')
                .single()

            const approvalMode = settingsData?.value ? JSON.parse(settingsData.value) : 'manual'

            // Step 2: Upload slip image to Supabase Storage
            const fileExt = topupForm.slip_file.name.split('.').pop()
            const fileName = `${user.id}/${Date.now()}.${fileExt}`

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('slips')
                .upload(fileName, topupForm.slip_file)

            let slipImageUrl = null
            if (!uploadError && uploadData) {
                const { data: urlData } = supabase.storage
                    .from('slips')
                    .getPublicUrl(fileName)
                slipImageUrl = urlData?.publicUrl
            }

            // Step 3: If auto mode, verify slip with SlipOK via Edge Function
            if (approvalMode === 'auto') {
                console.log('Auto mode enabled, calling Edge Function...')
                const formData = new FormData()
                formData.append('files', topupForm.slip_file)

                const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-slip`
                console.log('Edge Function URL:', edgeFunctionUrl)

                // Get current session for authorization
                const { data: { session } } = await supabase.auth.getSession()

                const response = await fetch(edgeFunctionUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: formData,
                })

                console.log('Edge Function response status:', response.status)
                const slipData = await response.json()
                console.log('SlipOK response:', slipData)

                if (slipData.success && slipData.data) {
                    const verifiedAmount = parseFloat(slipData.data.amount) || amount
                    const transRef = slipData.data.transRef

                    // Check if slip already used
                    const { data: existingSlip } = await supabase
                        .from('used_slips')
                        .select('id')
                        .eq('trans_ref', transRef)
                        .single()

                    if (existingSlip) {
                        toast.error('สลิปนี้ถูกใช้งานแล้ว')
                        setTopupLoading(false)
                        return
                    }

                    // Use creditService to process topup
                    const { success, error, newBalance, debtRecovered } = await processTopup({
                        dealerId: user.id,
                        bankAccountId: assignedBankAccount.id,
                        amount: verifiedAmount,
                        slipUrl: slipImageUrl,
                        slipData: slipData.data,
                        transRef: transRef
                    })

                    if (!success) {
                        console.error('Error processing topup:', error)
                        throw error
                    }

                    console.log('Credit updated successfully to:', newBalance)

                    const debtMsg = debtRecovered > 0 ? ` (หักยอดค้าง ฿${debtRecovered.toLocaleString('th-TH', { minimumFractionDigits: 2 })})` : ''
                    toast.success(`เติมเครดิต ฿${verifiedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} สำเร็จ!${debtMsg}`)
                    fetchDealerCredit()
                } else {
                    // SlipOK verification failed - create pending request
                    await supabase
                        .from('credit_topup_requests')
                        .insert({
                            dealer_id: user.id,
                            bank_account_id: assignedBankAccount.id,
                            amount: amount,
                            slip_image_url: slipImageUrl,
                            status: 'pending'
                        })

                    toast.warning('ไม่สามารถตรวจสอบสลิปอัตโนมัติได้ รอ Admin ตรวจสอบ')
                }
            } else {
                // Manual mode - Create pending request
                const { error: topupError } = await supabase
                    .from('credit_topup_requests')
                    .insert({
                        dealer_id: user.id,
                        bank_account_id: assignedBankAccount.id,
                        amount: amount,
                        slip_image_url: slipImageUrl,
                        status: 'pending'
                    })

                if (topupError) throw topupError

                toast.success('ส่งคำขอเติมเครดิตสำเร็จ รอ Admin อนุมัติ')
            }

            setShowTopupModal(false)
            setTopupForm({ amount: '', slip_file: null })
            setSlipPreview(null)
            fetchTopupHistory()

        } catch (error) {
            console.error('Topup error:', error)
            toast.error(error.message || 'เกิดข้อผิดพลาดในการส่งคำขอเติมเครดิต')
        } finally {
            setTopupLoading(false)
        }
    }

    // Helper: check if current dealer uses per_user_yearly billing
    function isPerUserYearly() {
        return subscription?.subscription_packages?.billing_model === 'per_user_yearly'
    }

    // Helper: get price per user per year from subscription
    function getPricePerUserPerYear() {
        return parseFloat(subscription?.subscription_packages?.price_per_user_per_year || 0)
    }

    // Helper: deduct credit for per_user_yearly membership
    async function deductMembershipCredit(years, memberName) {
        const pricePerYear = getPricePerUserPerYear()
        const totalCost = pricePerYear * years
        if (totalCost <= 0) return { success: true }

        // Check dealer credit
        const { data: creditData } = await supabase
            .from('dealer_credits')
            .select('balance, pending_deduction, is_blocked')
            .eq('dealer_id', user.id)
            .maybeSingle()

        if (creditData?.is_blocked) {
            return { success: false, error: 'เครดิตถูกระงับ ไม่สามารถดำเนินการได้' }
        }

        const currentBalance = creditData?.balance || 0
        const pendingDeduction = creditData?.pending_deduction || 0
        const availableCredit = currentBalance - pendingDeduction

        if (availableCredit < totalCost) {
            return { success: false, error: `เครดิตไม่เพียงพอ! ต้องการ ฿${totalCost.toLocaleString()} แต่เครดิตคงเหลือ ฿${availableCredit.toLocaleString()}` }
        }

        // Deduct credit
        const newBalance = currentBalance - totalCost
        const { error: updateError } = await supabase
            .from('dealer_credits')
            .update({ balance: newBalance })
            .eq('dealer_id', user.id)

        if (updateError) {
            return { success: false, error: 'ไม่สามารถตัดเครดิตได้: ' + updateError.message }
        }

        // Record transaction
        await supabase.from('credit_transactions').insert({
            dealer_id: user.id,
            amount: -totalCost,
            balance_after: newBalance,
            reference_type: 'membership_fee',
            description: `ค่าสมาชิกรายปี "${memberName}" (${years} ปี x ฿${pricePerYear.toLocaleString()})`,
            metadata: {
                member_name: memberName,
                years: years,
                price_per_year: pricePerYear,
                total_cost: totalCost
            }
        })

        return { success: true, totalCost, newBalance }
    }

    // Membership Management Functions
    async function handleApproveMember(member) {
        // If per_user_yearly, show years selection modal first
        if (isPerUserYearly() && !member.is_dealer) {
            setApproveMemberTarget(member)
            setApproveYears(1)
            setShowApproveYearsModal(true)
            return
        }

        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'active' })
                .eq('id', member.membership_id)

            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('Error approving member:', error)
            toast.error('เกิดข้อผิดพลาดในการอนุมัติสมาชิก')
        }
    }

    // Approve member with years (per_user_yearly)
    async function handleApproveWithYears() {
        if (!approveMemberTarget) return
        setApproving(true)
        try {
            const memberName = approveMemberTarget.full_name || approveMemberTarget.email
            const result = await deductMembershipCredit(approveYears, memberName)
            if (!result.success) {
                toast.error(result.error)
                return
            }

            const expiresAt = new Date()
            expiresAt.setFullYear(expiresAt.getFullYear() + approveYears)

            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({
                    status: 'active',
                    membership_expires_at: expiresAt.toISOString(),
                    membership_years: approveYears
                })
                .eq('id', approveMemberTarget.membership_id)

            if (error) throw error

            toast.success(`อนุมัติ "${memberName}" สำเร็จ (${approveYears} ปี) ตัดเครดิต ฿${result.totalCost.toLocaleString()}`)
            setShowApproveYearsModal(false)
            setApproveMemberTarget(null)
            fetchData()
            fetchDealerCredit()
        } catch (error) {
            console.error('Error approving member with years:', error)
            toast.error('เกิดข้อผิดพลาดในการอนุมัติสมาชิก')
        } finally {
            setApproving(false)
        }
    }

    // Renew membership (per_user_yearly)
    async function handleRenewMembership() {
        if (!renewMember) return
        setRenewing(true)
        try {
            const memberName = renewMember.full_name || renewMember.email
            const result = await deductMembershipCredit(renewYears, memberName)
            if (!result.success) {
                toast.error(result.error)
                return
            }

            // Calculate new expiry: if not yet expired, extend from current expiry; otherwise from now
            const currentExpiry = renewMember.membership_expires_at ? new Date(renewMember.membership_expires_at) : null
            const baseDate = (currentExpiry && currentExpiry > new Date()) ? currentExpiry : new Date()
            const newExpiry = new Date(baseDate)
            newExpiry.setFullYear(newExpiry.getFullYear() + renewYears)

            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({
                    membership_expires_at: newExpiry.toISOString(),
                    membership_years: renewYears
                })
                .eq('id', renewMember.membership_id)

            if (error) throw error

            toast.success(`ต่ออายุ "${memberName}" สำเร็จ (${renewYears} ปี) ตัดเครดิต ฿${result.totalCost.toLocaleString()}`)
            setShowRenewModal(false)
            setRenewMember(null)
            fetchData()
            fetchDealerCredit()
        } catch (error) {
            console.error('Error renewing membership:', error)
            toast.error('เกิดข้อผิดพลาดในการต่ออายุสมาชิก')
        } finally {
            setRenewing(false)
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
            toast.error('เกิดข้อผิดพลาดในการปฏิเสธสมาชิก')
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
            toast.error('เกิดข้อผิดพลาดในการบล็อคสมาชิก')
        }
    }

    // Add new member function - creates user with default password
    async function handleAddMember() {
        if (!addMemberForm.email) {
            toast.error('กรุณากรอกอีเมล')
            return
        }

        // For per_user_yearly: check credit before creating user
        const perUserYearly = isPerUserYearly()
        const years = parseInt(addMemberForm.membership_years) || 1
        if (perUserYearly) {
            const pricePerYear = getPricePerUserPerYear()
            const totalCost = pricePerYear * years
            if (totalCost > 0) {
                const { data: creditData } = await supabase
                    .from('dealer_credits')
                    .select('balance, pending_deduction, is_blocked')
                    .eq('dealer_id', user.id)
                    .maybeSingle()

                if (creditData?.is_blocked) {
                    toast.error('เครดิตถูกระงับ ไม่สามารถสร้างสมาชิกได้')
                    return
                }
                const availableCredit = (creditData?.balance || 0) - (creditData?.pending_deduction || 0)
                if (availableCredit < totalCost) {
                    toast.error(`เครดิตไม่เพียงพอ! ต้องการ ฿${totalCost.toLocaleString()} แต่เครดิตคงเหลือ ฿${availableCredit.toLocaleString()}`)
                    return
                }
            }
        }

        setAddingMember(true)
        try {
            const defaultPassword = '123456'
            const loginUrl = window.location.origin + '/login'

            // Store current dealer session before creating new user
            const { data: currentSession } = await supabase.auth.getSession()
            const dealerSession = currentSession?.session

            // Suppress onAuthStateChange during signUp + session restore
            // signUp auto-logs in as new user, triggering SIGNED_IN for the new user
            // which would switch the dealer's UI to the new member's dashboard
            skipAuthEventRef.current = true

            let authData, authError
            try {
                const result = await supabase.auth.signUp({
                    email: addMemberForm.email,
                    password: defaultPassword,
                    options: {
                        data: {
                            full_name: addMemberForm.full_name || '',
                            phone: addMemberForm.phone || '',
                            role: 'user'
                        }
                    }
                })
                authData = result.data
                authError = result.error

                if (authError) throw authError

                // Immediately restore dealer session
                if (dealerSession) {
                    await supabase.auth.setSession({
                        access_token: dealerSession.access_token,
                        refresh_token: dealerSession.refresh_token
                    })
                }
            } finally {
                skipAuthEventRef.current = false
            }

            const newUserId = authData.user?.id

            if (newUserId) {
                // For per_user_yearly: deduct credit
                let creditDeducted = false
                if (perUserYearly) {
                    const memberName = addMemberForm.full_name || addMemberForm.email
                    const result = await deductMembershipCredit(years, memberName)
                    if (!result.success) {
                        toast.error(result.error)
                        setAddingMember(false)
                        return
                    }
                    creditDeducted = true
                }

                // Build membership data
                const membershipData = {
                    user_id: newUserId,
                    dealer_id: user.id,
                    status: 'active' // Auto-approve since dealer created them
                }

                // Add expiry for per_user_yearly
                if (perUserYearly) {
                    const expiresAt = new Date()
                    expiresAt.setFullYear(expiresAt.getFullYear() + years)
                    membershipData.membership_expires_at = expiresAt.toISOString()
                    membershipData.membership_years = years
                }

                // Now create membership as dealer (RLS policy: dealer_id = auth.uid())
                const { error: membershipError } = await supabase
                    .from('user_dealer_memberships')
                    .insert(membershipData)

                if (membershipError) {
                    console.error('Membership error:', membershipError)
                    toast.error('สร้าง user สำเร็จ แต่ไม่สามารถเพิ่มเป็นสมาชิกได้: ' + membershipError.message)
                }

                // Store credentials to show to dealer
                setNewMemberCredentials({
                    email: addMemberForm.email,
                    password: defaultPassword,
                    url: loginUrl,
                    full_name: addMemberForm.full_name
                })

                const successMsg = perUserYearly && creditDeducted
                    ? `สร้างสมาชิกใหม่สำเร็จ! (${years} ปี)`
                    : 'สร้างสมาชิกใหม่สำเร็จ!'
                toast.success(successMsg)
                setAddMemberForm({ email: '', full_name: '', phone: '', membership_years: 1 })
                fetchData()
                if (creditDeducted) fetchDealerCredit()
            }
        } catch (error) {
            console.error('Error adding member:', error)
            if (error.message?.includes('already registered')) {
                toast.error('อีเมลนี้ถูกใช้งานแล้ว')
            } else {
                toast.error('เกิดข้อผิดพลาด: ' + error.message)
            }
        } finally {
            setAddingMember(false)
        }
    }

    // Copy member credentials to clipboard
    function copyMemberCredentials(member) {
        const loginUrl = window.location.origin + '/login'
        const text = `🎰 ข้อมูลเข้าสู่ระบบ\n\n📧 อีเมล: ${member.email}\n🔑 รหัสผ่าน: 123456\n🔗 ลิงก์: ${loginUrl}\n\n⚠️ กรุณาเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ`

        // Try modern clipboard API first, fallback to execCommand
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                toast.success('คัดลอกข้อมูลแล้ว!')
            }).catch(() => {
                fallbackCopyToClipboard(text)
            })
        } else {
            fallbackCopyToClipboard(text)
        }
    }

    // Fallback copy function for older browsers or non-HTTPS
    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
            document.execCommand('copy')
            toast.success('คัดลอกข้อมูลแล้ว!')
        } catch (err) {
            toast.error('ไม่สามารถคัดลอกได้')
        }
        document.body.removeChild(textArea)
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
            toast.error('เกิดข้อผิดพลาดในการปลดบล็อคสมาชิก')
        }
    }

    async function handleDeleteMember(member) {
        console.log('handleDeleteMember called:', member)
        console.log('membership_id:', member.membership_id)

        if (!member.membership_id) {
            toast.error('ไม่พบ membership_id')
            return
        }

        if (!confirm(`ต้องการลบ "${member.full_name || member.email}" ออกจากรายชื่อสมาชิกหรือไม่?\n\nการลบจะยกเลิกการเป็นสมาชิกของเจ้ามือนี้`)) return

        try {
            const { data, error, count } = await supabase
                .from('user_dealer_memberships')
                .delete()
                .eq('id', member.membership_id)
                .select()

            console.log('Delete response:', { data, error, count })

            if (error) throw error

            if (!data || data.length === 0) {
                toast.error('ไม่สามารถลบได้ - อาจไม่มีสิทธิ์หรือไม่พบข้อมูล')
                return
            }

            toast.success('ลบสมาชิกสำเร็จ')
            fetchData()
        } catch (error) {
            console.error('Error deleting member:', error)
            toast.error('เกิดข้อผิดพลาดในการลบสมาชิก')
        }
    }

    // Approve downstream dealer connection request
    async function handleApproveDownstreamDealer(dealer) {
        try {
            console.log('Approving dealer:', dealer)
            console.log('Connection ID:', dealer.connection_id)
            console.log('Is from membership:', dealer.is_from_membership)

            let data, error

            if (dealer.is_from_membership) {
                // Update in user_dealer_memberships table
                const result = await supabase
                    .from('user_dealer_memberships')
                    .update({
                        status: 'active',
                        approved_at: new Date().toISOString()
                    })
                    .eq('id', dealer.connection_id)
                    .select()

                data = result.data
                error = result.error
                console.log('Membership update result:', { data, error })
            } else {
                // Update in dealer_upstream_connections table
                const result = await supabase
                    .from('dealer_upstream_connections')
                    .update({
                        status: 'active',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', dealer.connection_id)
                    .select()

                data = result.data
                error = result.error
                console.log('Connection update result:', { data, error })
            }

            if (error) throw error

            if (!data || data.length === 0) {
                console.error('No rows updated - RLS policy may be blocking update')
                toast.error('ไม่สามารถอัพเดทได้ - อาจมีปัญหา RLS policy')
                return
            }

            // Update local state
            setDownstreamDealers(prev => prev.map(d =>
                d.connection_id === dealer.connection_id
                    ? { ...d, membership_status: 'active' }
                    : d
            ))

            toast.success(`ยืนยัน "${dealer.full_name || dealer.email}" เป็นเจ้ามือตีเข้าสำเร็จ`)
        } catch (error) {
            console.error('Error approving downstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Reject downstream dealer connection request
    async function handleRejectDownstreamDealer(dealer) {
        if (!confirm(`ต้องการปฏิเสธคำขอจาก "${dealer.full_name || dealer.email}" หรือไม่?`)) return

        try {
            console.log('Rejecting dealer:', dealer)
            console.log('Connection ID:', dealer.connection_id)
            console.log('Is from membership:', dealer.is_from_membership)

            let data, error

            if (dealer.is_from_membership) {
                // Update in user_dealer_memberships table
                const result = await supabase
                    .from('user_dealer_memberships')
                    .update({
                        status: 'rejected'
                    })
                    .eq('id', dealer.connection_id)
                    .select()

                data = result.data
                error = result.error
                console.log('Membership reject result:', { data, error })
            } else {
                // Update in dealer_upstream_connections table
                const result = await supabase
                    .from('dealer_upstream_connections')
                    .update({
                        status: 'rejected',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', dealer.connection_id)
                    .select()

                data = result.data
                error = result.error
                console.log('Connection reject result:', { data, error })
            }

            if (error) throw error

            if (!data || data.length === 0) {
                console.error('No rows updated - RLS policy may be blocking update')
                toast.error('ไม่สามารถอัพเดทได้ - อาจมีปัญหา RLS policy')
                return
            }

            // Update local state
            setDownstreamDealers(prev => prev.map(d =>
                d.connection_id === dealer.connection_id
                    ? { ...d, membership_status: 'rejected' }
                    : d
            ))

            toast.success('ปฏิเสธคำขอสำเร็จ')
        } catch (error) {
            console.error('Error rejecting downstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Block/Unblock downstream dealer (dealer who sends bets to us)
    async function handleBlockDownstreamDealer(dealer) {
        const newBlockedState = dealer.membership_status !== 'blocked'
        if (newBlockedState && !confirm(`ต้องการบล็อค "${dealer.full_name || dealer.email}" หรือไม่?\nเจ้ามือนี้จะไม่สามารถตีเลขมาให้คุณได้`)) return

        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({
                    status: newBlockedState ? 'blocked' : 'active',
                    is_blocked: newBlockedState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.connection_id)

            if (error) throw error

            // Update local state
            setDownstreamDealers(prev => prev.map(d =>
                d.connection_id === dealer.connection_id
                    ? { ...d, membership_status: newBlockedState ? 'blocked' : 'active' }
                    : d
            ))

            toast.success(newBlockedState ? 'บล็อคเจ้ามือสำเร็จ' : 'ปลดบล็อคเจ้ามือสำเร็จ')
        } catch (error) {
            console.error('Error blocking downstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด')
        }
    }

    // Disconnect dealer connection
    async function handleDisconnectDealer(dealer) {
        if (!confirm(`ยกเลิกการเชื่อมต่อกับ "${dealer.full_name || dealer.email}"?\n\nรายชื่อจะหายไปทั้ง 2 ฝ่าย`)) return

        try {
            console.log('Disconnecting dealer:', dealer)
            console.log('Connection ID:', dealer.connection_id)
            console.log('Is from membership:', dealer.is_from_membership)
            console.log('User ID:', user?.id)

            let error

            if (dealer.is_from_membership) {
                // Delete from user_dealer_memberships table
                console.log('Deleting from user_dealer_memberships table')
                const result = await supabase
                    .from('user_dealer_memberships')
                    .delete()
                    .eq('id', dealer.connection_id)

                error = result.error
            } else {
                // Delete from dealer_upstream_connections table
                console.log('Deleting from dealer_upstream_connections table')

                // Check connection details first
                const { data: connectionData, error: checkError } = await supabase
                    .from('dealer_upstream_connections')
                    .select('*')
                    .eq('id', dealer.connection_id)
                    .single()

                if (checkError) {
                    console.error('Error checking connection:', checkError)
                    toast.error('ไม่พบข้อมูลการเชื่อมต่อ')
                    return
                }

                console.log('Connection data:', connectionData)

                // Try to delete
                const result = await supabase
                    .from('dealer_upstream_connections')
                    .delete()
                    .eq('id', dealer.connection_id)

                error = result.error
            }

            if (error) {
                console.error('Delete error:', error)
                toast.error('เกิดข้อผิดพลาดในการยกเลิกการเชื่อมต่อ')
                return
            }

            console.log('Delete successful')
            setDownstreamDealers(prev => prev.filter(d => d.connection_id !== dealer.connection_id))
            toast.success('ยกเลิกการเชื่อมต่อสำเร็จ')
        } catch (error) {
            console.error('Error disconnecting dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Update assigned bank account for member
    // For regular members: update user_dealer_memberships.assigned_bank_account_id
    // For dealer members (เจ้ามือตีเข้า): update dealer_upstream_connections.assigned_bank_account_id
    //   because dealer-to-dealer QR connections do NOT create user_dealer_memberships records
    async function handleUpdateMemberBank(member, bankAccountId) {
        try {
            let success = false

            if (member.is_dealer && member.connection_id) {
                // Dealer member (เจ้ามือตีเข้า) - update on dealer_upstream_connections
                // The connection_id is the dealer_upstream_connections.id
                const { data, error } = await supabase
                    .from('dealer_upstream_connections')
                    .update({ assigned_bank_account_id: bankAccountId || null })
                    .eq('id', member.connection_id)
                    .select()

                if (error) throw error
                success = data && data.length > 0

                // If connection update failed and we have a real membership_id, try membership table
                if (!success && member.membership_id && member.membership_id !== member.connection_id) {
                    const { data: mData, error: mError } = await supabase
                        .from('user_dealer_memberships')
                        .update({ assigned_bank_account_id: bankAccountId || null })
                        .eq('id', member.membership_id)
                        .select()
                    if (mError) throw mError
                    success = mData && mData.length > 0
                }
            } else {
                // Regular member - update on user_dealer_memberships
                const { data, error } = await supabase
                    .from('user_dealer_memberships')
                    .update({ assigned_bank_account_id: bankAccountId || null })
                    .eq('id', member.membership_id)
                    .select()

                if (error) throw error
                success = data && data.length > 0
            }

            if (!success) {
                toast.error('ไม่พบข้อมูลสมาชิกในระบบ')
                return
            }

            // Update local state
            const matchMember = (m) =>
                m.id === member.id ||
                m.membership_id === member.membership_id ||
                m.connection_id === member.connection_id

            setMembers(prev => prev.map(m =>
                matchMember(m) ? { ...m, assigned_bank_account_id: bankAccountId || null } : m
            ))
            setDownstreamDealers(prev => prev.map(m =>
                matchMember(m) ? { ...m, assigned_bank_account_id: bankAccountId || null } : m
            ))

            toast.success('อัปเดตบัญชีธนาคารสำเร็จ')
        } catch (error) {
            console.error('Error updating member bank:', error)
            toast.error('เกิดข้อผิดพลาดในการอัปเดตบัญชีธนาคาร')
        }
    }

    // Redirect if not dealer or admin (after hooks)
    if (!profile) {
        // Still loading auth - show spinner briefly
        if (authLoading) {
            return (
                <div className="loading-screen">
                    <div className="spinner"></div>
                    <p>กำลังโหลด...</p>
                </div>
            )
        }
        // Auth finished but no profile = not logged in, redirect to login
        return <Navigate to="/login" replace />
    }

    if (!isDealer && !isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    // Show suspended account message for dealers
    if (isDealer && isAccountSuspended) {
        return (
            <div className="suspended-account-page">
                <div className="suspended-content">
                    <div className="suspended-icon">
                        <FiAlertCircle size={64} />
                    </div>
                    <h1>บัญชีถูกระงับการใช้งาน</h1>
                    <p>บัญชีเจ้ามือของคุณถูกระงับการใช้งานชั่วคราว</p>
                    <p>กรุณาติดต่อผู้ดูแลระบบเพื่อขอข้อมูลเพิ่มเติม</p>
                    <div className="suspended-info">
                        <p><strong>อีเมล:</strong> {profile?.email}</p>
                        <p><strong>ชื่อ:</strong> {profile?.full_name}</p>
                    </div>
                </div>
            </div>
        )
    }

    // Create new round
    async function handleCreateRound() {
        try {
            // Combine date and time - store as ISO string with timezone
            const openDateTime = new Date(`${roundForm.open_date}T${roundForm.open_time}:00`)
            const closeDateTime = new Date(`${roundForm.close_date}T${roundForm.close_time}:00`)

            // Format as ISO string preserving local time intent
            const formatLocalDateTime = (date) => {
                const year = date.getFullYear()
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                const hours = String(date.getHours()).padStart(2, '0')
                const minutes = String(date.getMinutes()).padStart(2, '0')
                const seconds = String(date.getSeconds()).padStart(2, '0')
                // Get timezone offset in hours and minutes
                const tzOffset = -date.getTimezoneOffset()
                const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0')
                const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0')
                const tzSign = tzOffset >= 0 ? '+' : '-'
                return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMinutes}`
            }

            // Create round
            const { data: round, error: roundError } = await supabase
                .from('lottery_rounds')
                .insert({
                    dealer_id: user.id,
                    lottery_type: roundForm.lottery_type,
                    lottery_name: roundForm.lottery_name || LOTTERY_TYPES[roundForm.lottery_type],
                    round_date: roundForm.open_date,
                    open_time: formatLocalDateTime(openDateTime),
                    close_time: formatLocalDateTime(closeDateTime),
                    delete_before_minutes: roundForm.delete_before_minutes,
                    delete_after_submit_minutes: roundForm.delete_after_submit_minutes,
                    currency_symbol: roundForm.currency_symbol,
                    currency_name: roundForm.currency_name,
                    set_prices: roundForm.set_prices,
                    is_active: false
                })
                .select()
                .single()

            if (roundError) throw roundError

            // Create type limits (no payout_rate - comes from user_settings)
            // Allow 0 value for dealers who want to transfer all numbers (0 = no limit acceptance)
            const typeLimitsData = Object.entries(roundForm.type_limits)
                .filter(([, maxAmount]) => maxAmount !== undefined && maxAmount !== null && maxAmount !== '')
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
            toast.success('สร้างงวดสำเร็จ!')

        } catch (error) {
            console.error('Error creating round:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Toggle round active/inactive
    async function handleToggleActive(roundId, currentIsActive) {
        try {
            const newActive = !currentIsActive
            const { error } = await supabase
                .from('lottery_rounds')
                .update({ is_active: newActive })
                .eq('id', roundId)

            if (error) throw error
            toast.success(newActive ? 'เปิดใช้งานงวดหวยแล้ว' : 'ปิดใช้งานงวดหวยแล้ว')
            fetchData()
        } catch (error) {
            console.error('Error toggling active:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
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

            if (!error) {
                // Finalize credit deduction - but SKIP for profit_percentage billing
                // For profit_percentage: 1% pending is just a guarantee, real deduction happens at announce (5% of profit)
                // The 1% is only finalized if dealer deletes round without announcing
                try {
                    const { data: dealerSubs } = await supabase
                        .from('dealer_subscriptions')
                        .select('billing_model, subscription_packages(billing_model)')
                        .eq('dealer_id', user.id)
                        .in('status', ['active', 'trial'])
                        .order('created_at', { ascending: false })
                        .limit(1)
                    
                    const billingModel = dealerSubs?.[0]?.subscription_packages?.billing_model || dealerSubs?.[0]?.billing_model

                    if (billingModel !== 'profit_percentage') {
                        // Regular percentage: deduct immediately on close
                        const { data: immediateBillingResult, error: immediateBillingError } = await supabase
                            .rpc('create_immediate_billing_record', {
                                p_round_id: roundId,
                                p_dealer_id: user.id
                            })

                        if (!immediateBillingError && immediateBillingResult?.success && immediateBillingResult?.amount_deducted > 0) {
                            console.log('Immediate billing success:', immediateBillingResult)
                            toast.info(`ตัดเครดิต ฿${immediateBillingResult.amount_deducted.toLocaleString()} สำเร็จ`)
                        } else {
                            const { data: result, error: creditError } = await supabase
                                .rpc('finalize_round_credit', { p_round_id: roundId })

                            if (!creditError && result?.total_deducted > 0) {
                                console.log('Regular finalization success:', result)
                                toast.info(`ตัดเครดิต ฿${result.total_deducted.toLocaleString()} สำเร็จ`)
                            }
                        }
                    }
                    // profit_percentage: keep pending deduction as guarantee only, don't deduct from balance yet
                } catch (billingErr) {
                    console.log('Credit system not configured:', billingErr)
                }

                fetchData()
                fetchDealerCredit() // Refresh credit balance
            }
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Delete round - with history preservation (only for closed + announced + has submissions)
    async function handleDeleteRound(roundId, roundStatus) {
        if (!confirm('ต้องการลบงวดนี้?')) return

        try {
            // Get round details first
            const { data: roundData } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('id', roundId)
                .single()

            if (!roundData) {
                toast.error('ไม่พบข้อมูลงวด')
                return
            }

            // Get all submissions for this round
            const { data: submissions } = await fetchAllRows(
                (from, to) => supabase
                    .from('submissions')
                    .select('*')
                    .eq('round_id', roundId)
                    .eq('is_deleted', false)
                    .range(from, to)
            )

            // Calculate total amount
            const totalAmount = submissions?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0

            // Only save history if: round is closed/announced + result announced + has submissions (totalAmount > 0)
            const shouldSaveHistory = (roundData.status === 'closed' || roundData.status === 'announced') &&
                roundData.is_result_announced === true &&
                totalAmount > 0

            console.log('Delete round debug:', {
                roundId,
                status: roundData.status,
                is_result_announced: roundData.is_result_announced,
                totalAmount,
                shouldSaveHistory
            })

            if (shouldSaveHistory) {
                const lotteryKey = getLotteryTypeKey(roundData.lottery_type)
                const getSettingsKey = (betType, lKey) => {
                    const POSITION_MAP = {
                        'front_top_1': 'pak_top', 'middle_top_1': 'pak_top', 'back_top_1': 'pak_top',
                        'front_bottom_1': 'pak_bottom', 'back_bottom_1': 'pak_bottom'
                    }
                    const mapped = POSITION_MAP[betType] || betType
                    if (lKey === 'lao' || lKey === 'hanoi') {
                        const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
                        return LAO_MAP[mapped] || mapped
                    }
                    return mapped
                }

                // Fetch user_settings for all users in this round (for accurate commission/payout)
                const uniqueUserIds = [...new Set((submissions || []).map(s => s.user_id))]
                let allUserSettings = {}
                if (uniqueUserIds.length > 0) {
                    const { data: settingsData } = await supabase
                        .from('user_settings')
                        .select('*')
                        .in('user_id', uniqueUserIds)
                        .eq('dealer_id', user.id)
                    ;(settingsData || []).forEach(s => { allUserSettings[s.user_id] = s })
                }

                // Helper: calculate commission for a submission
                // Always recalculate from current user_settings so that updated rates
                // apply to all entries (old and new) — matching user dashboard behaviour.
                const calcCommission = (sub) => {
                    const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
                    const settings = allUserSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]
                    if (sub.bet_type === '4_set' || sub.bet_type === '4_top') {
                        if (settings?.isSet && settings?.commission !== undefined) {
                            const setPrice = settings.setPrice || roundData?.set_prices?.['4_top'] || 120
                            return Math.floor((sub.amount || 0) / setPrice) * settings.commission
                        }
                        const defaultSetPrice = roundData?.set_prices?.['4_top'] || 120
                        return Math.floor((sub.amount || 0) / defaultSetPrice) * 25
                    }
                    if (settings?.commission !== undefined) {
                        return settings.isFixed ? settings.commission : (sub.amount || 0) * (settings.commission / 100)
                    }
                    return (sub.amount || 0) * ((DEFAULT_COMMISSIONS[sub.bet_type] || 15) / 100)
                }

                // Helper: calculate payout for a submission (matches dealer dashboard getExpectedPayout)
                const calcPayout = (sub) => {
                    if (!sub.is_winner) return 0
                    if (sub.bet_type === '4_set') return sub.prize_amount || 0
                    const settingsKey = getSettingsKey(sub.bet_type, lotteryKey)
                    const settings = allUserSettings[sub.user_id]?.lottery_settings?.[lotteryKey]?.[settingsKey]
                    if (settings?.payout !== undefined) return (sub.amount || 0) * settings.payout
                    return (sub.amount || 0) * (DEFAULT_PAYOUTS[sub.bet_type] || 1)
                }

                // Calculate incoming totals
                const totalEntries = submissions?.length || 0
                let totalCommission = 0
                let totalPayout = 0
                const userSubmissions = {}

                for (const s of (submissions || [])) {
                    const comm = calcCommission(s)
                    const payout = calcPayout(s)
                    totalCommission += comm
                    totalPayout += payout

                    if (!userSubmissions[s.user_id]) {
                        userSubmissions[s.user_id] = { entries: 0, amount: 0, commission: 0, winnings: 0 }
                    }
                    userSubmissions[s.user_id].entries += 1
                    userSubmissions[s.user_id].amount += s.amount || 0
                    userSubmissions[s.user_id].commission += comm
                    userSubmissions[s.user_id].winnings += payout
                }

                // === Calculate outgoing (ตีออก) from bet_transfers ===
                const { data: transfers } = await supabase
                    .from('bet_transfers')
                    .select('*')
                    .eq('round_id', roundId)

                const transferredAmount = (transfers || []).reduce((sum, t) => sum + (t.amount || 0), 0)
                let upstreamCommission = 0
                let upstreamWinnings = 0

                if (transfers && transfers.length > 0) {
                    // Group transfers by upstream dealer
                    const dealerGroups = {}
                    for (const t of transfers) {
                        const key = t.upstream_dealer_id || `ext_${t.target_dealer_name || 'unknown'}`
                        if (!dealerGroups[key]) {
                            dealerGroups[key] = {
                                dealerId: t.upstream_dealer_id,
                                isLinked: t.is_linked || false,
                                targetRoundId: t.target_round_id,
                                transfers: []
                            }
                        }
                        dealerGroups[key].transfers.push(t)
                    }

                    for (const group of Object.values(dealerGroups)) {
                        if (group.isLinked && group.dealerId) {
                            // Linked: fetch user_settings for commission with upstream dealer
                            const { data: upSettings } = await supabase
                                .from('user_settings')
                                .select('*')
                                .eq('user_id', user.id)
                                .eq('dealer_id', group.dealerId)
                                .maybeSingle()

                            for (const t of group.transfers) {
                                const settingsKey = getSettingsKey(t.bet_type, lotteryKey)
                                const betSettings = upSettings?.lottery_settings?.[lotteryKey]?.[settingsKey]
                                // 4_set: commission is fixed amount per set (บาท/ชุด), not percentage
                                if (t.bet_type === '4_set') {
                                    const setPrice = betSettings?.setPrice || roundData?.set_prices?.['4_top'] || 120
                                    const numSets = Math.floor((t.amount || 0) / setPrice)
                                    const commRate = betSettings?.commission !== undefined ? betSettings.commission : (DEFAULT_4_SET_SETTINGS.commission || 25)
                                    upstreamCommission += numSets * commRate
                                } else {
                                    const commRate = betSettings?.commission !== undefined
                                        ? betSettings.commission
                                        : (DEFAULT_COMMISSIONS[t.bet_type] || 15)
                                    upstreamCommission += (t.amount || 0) * (commRate / 100)
                                }
                            }

                            // Linked: fetch upstream submissions for winnings
                            const targetSubIds = group.transfers.map(t => t.target_submission_id).filter(Boolean)
                            if (targetSubIds.length > 0) {
                                const { data: upSubs } = await supabase
                                    .from('submissions')
                                    .select('id, is_winner, prize_amount')
                                    .in('id', targetSubIds)
                                    .eq('is_deleted', false)
                                for (const sub of (upSubs || [])) {
                                    if (sub.is_winner) upstreamWinnings += sub.prize_amount || 0
                                }
                            }
                        } else {
                            // External: fetch lottery_settings from dealer_upstream_connections
                            let extSettings = null
                            const extDealerName = group.transfers[0]?.target_dealer_name
                            if (extDealerName) {
                                const { data: connData } = await supabase
                                    .from('dealer_upstream_connections')
                                    .select('lottery_settings')
                                    .eq('dealer_id', user.id)
                                    .eq('upstream_name', extDealerName)
                                    .maybeSingle()
                                extSettings = connData?.lottery_settings
                            }
                            
                            for (const t of group.transfers) {
                                const settingsKey = getSettingsKey(t.bet_type, lotteryKey)
                                const betSettings = extSettings?.[lotteryKey]?.[settingsKey]
                                // 4_set: commission is fixed amount per set (บาท/ชุด), not percentage
                                if (t.bet_type === '4_set') {
                                    const setPrice = betSettings?.setPrice || roundData?.set_prices?.['4_top'] || 120
                                    const numSets = Math.floor((t.amount || 0) / setPrice)
                                    const commRate = betSettings?.commission !== undefined ? betSettings.commission : (DEFAULT_4_SET_SETTINGS.commission || 25)
                                    upstreamCommission += numSets * commRate
                                } else {
                                    const commRate = betSettings?.commission !== undefined
                                        ? betSettings.commission
                                        : (DEFAULT_COMMISSIONS[t.bet_type] || 15)
                                    upstreamCommission += (t.amount || 0) * (commRate / 100)
                                }
                            }

                            // External: check winners against our own winning_numbers
                            const wn = roundData.winning_numbers
                            if (wn && roundData.is_result_announced) {
                                const lt = roundData.lottery_type
                                const w4set = wn['4_set'] || ''
                                const w3top = wn['3_top'] || (lt !== 'thai' && w4set.length >= 3 ? w4set.slice(1) : '') || ''
                                const w2top = wn['2_top'] || (lt !== 'thai' && w4set.length >= 2 ? w4set.slice(2) : '') || ''
                                const w2bottom = wn['2_bottom'] || (lt === 'lao' && w4set.length >= 2 ? w4set.slice(0, 2) : '') || ''
                                const w3topSorted = w3top.split('').sort().join('')
                                const floatCheck = (src, target) => {
                                    let temp = target
                                    for (const ch of src) { const idx = temp.indexOf(ch); if (idx === -1) return false; temp = temp.slice(0, idx) + temp.slice(idx + 1) }
                                    return true
                                }

                                for (const t of group.transfers) {
                                    const num = t.numbers || '', bt = t.bet_type
                                    let isWinner = false, prize = 0
                                    const payoutRate = DEFAULT_PAYOUTS[bt] || 1
                                    if (bt === 'run_top' && w3top && num.length === 1) isWinner = w3top.includes(num)
                                    else if (bt === 'run_bottom' && w2bottom && num.length === 1) isWinner = w2bottom.includes(num)
                                    else if (bt === 'front_top_1' && w3top && w3top.length === 3 && num.length === 1) isWinner = num === w3top[0]
                                    else if (bt === 'middle_top_1' && w3top && w3top.length === 3 && num.length === 1) isWinner = num === w3top[1]
                                    else if (bt === 'back_top_1' && w3top && w3top.length === 3 && num.length === 1) isWinner = num === w3top[2]
                                    else if (bt === 'front_bottom_1' && w2bottom && w2bottom.length === 2 && num.length === 1) isWinner = num === w2bottom[0]
                                    else if (bt === 'back_bottom_1' && w2bottom && w2bottom.length === 2 && num.length === 1) isWinner = num === w2bottom[1]
                                    else if (bt === 'pak_top' && w3top && w3top.length === 3 && num.length === 1) isWinner = w3top.includes(num)
                                    else if (bt === 'pak_bottom' && w2bottom && w2bottom.length === 2 && num.length === 1) isWinner = w2bottom.includes(num)
                                    else if (bt === '2_bottom' && w2bottom && num.length === 2) isWinner = num === w2bottom
                                    else if (bt === '2_top' && w2top && num.length === 2) isWinner = num === w2top
                                    else if ((bt === '3_top' || bt === '3_straight') && w3top && num.length === 3) isWinner = num === w3top
                                    else if ((bt === '3_tod' || bt === '3_tod_single') && w3top && num.length === 3) isWinner = num.split('').sort().join('') === w3topSorted && num !== w3top
                                    else if (bt === '4_set' && w4set && num.length === 4) {
                                        const r = calculate4SetPrizes(num, w4set)
                                        if (r.totalPrize > 0) { isWinner = true; prize = r.totalPrize }
                                    }
                                    if (isWinner) upstreamWinnings += bt === '4_set' ? prize : (t.amount || 0) * payoutRate
                                }
                            }
                        }
                    }
                }

                // Calculate profit: dealer perspective
                // กำไรฝั่งรับ = ยอดรับ - ค่าคอม - จ่ายถูก
                // กำไรฝั่งส่ง = ค่าคอมที่ได้ + รับถูก - ยอดส่ง
                const incomingProfit = totalAmount - totalCommission - totalPayout
                const outgoingProfit = upstreamCommission + upstreamWinnings - transferredAmount
                const profit = incomingProfit + outgoingProfit

                console.log('History save debug:', {
                    totalEntries, totalAmount, totalCommission, totalPayout, incomingProfit,
                    transferredAmount, upstreamCommission, upstreamWinnings, outgoingProfit,
                    profit
                })

                // Save dealer round history
                const { error: historyError } = await supabase
                    .from('round_history')
                    .insert({
                        dealer_id: user.id,
                        round_id: roundId,
                        lottery_type: roundData.lottery_type,
                        lottery_name: roundData.lottery_name || LOTTERY_TYPES[roundData.lottery_type],
                        round_date: roundData.draw_date || roundData.open_time?.split('T')[0],
                        open_time: roundData.open_time,
                        close_time: roundData.close_time,
                        total_entries: totalEntries,
                        total_amount: totalAmount,
                        total_commission: totalCommission,
                        total_payout: totalPayout,
                        transferred_amount: transferredAmount,
                        transferred_entries: (transfers || []).length,
                        upstream_commission: upstreamCommission,
                        upstream_winnings: upstreamWinnings,
                        profit: profit
                    })

                if (historyError) {
                    console.error('Error saving dealer history:', historyError)
                }

                // Insert user histories (using calculated commission/payout, not raw DB values)
                const userHistories = Object.entries(userSubmissions).map(([userId, data]) => ({
                    user_id: userId,
                    dealer_id: user.id,
                    round_id: roundId,
                    lottery_type: roundData.lottery_type,
                    lottery_name: roundData.lottery_name || LOTTERY_TYPES[roundData.lottery_type],
                    round_date: roundData.draw_date || roundData.open_time?.split('T')[0],
                    open_time: roundData.open_time,
                    close_time: roundData.close_time,
                    total_entries: data.entries,
                    total_amount: data.amount,
                    total_commission: data.commission,
                    total_winnings: data.winnings,
                    profit_loss: data.winnings + data.commission - data.amount
                }))

                if (userHistories.length > 0) {
                    const { error: userHistoryError } = await supabase
                        .from('user_round_history')
                        .insert(userHistories)

                    if (userHistoryError) {
                        console.error('Error saving user histories:', userHistoryError)
                    }
                }
            }

            // Credit deduction before delete depends on billing model and round state
            try {
                const { data: dealerSubs } = await supabase
                    .from('dealer_subscriptions')
                    .select('billing_model, subscription_packages(billing_model)')
                    .eq('dealer_id', user.id)
                    .in('status', ['active', 'trial'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                
                const billingModel = dealerSubs?.[0]?.subscription_packages?.billing_model || dealerSubs?.[0]?.billing_model
                const isAnnounced = roundData.is_result_announced === true

                if (billingModel === 'profit_percentage') {
                    // profit_percentage:
                    // - If NOT announced: finalize 1% pending as real charge (penalty for deleting without announcing)
                    // - If announced: profit-based 5% was already deducted by ResultsModal, no action needed
                    if (!isAnnounced) {
                        const previouslyCharged = roundData.charged_credit_amount || 0
                        const creditResult = await deductAdditionalCreditForRound(user.id, roundId, previouslyCharged)
                        if (creditResult.amountDeducted > 0) {
                            console.log('Pending 1% finalized before delete (profit_percentage):', creditResult)
                            toast.info(`หักค่าธรรมเนียม ฿${creditResult.amountDeducted.toLocaleString()} ก่อนลบงวด`)
                        }
                    }
                } else if (roundStatus === 'open') {
                    // Regular percentage + open round: deduct immediately
                    const { data: immediateBillingResult, error: immediateBillingError } = await supabase
                        .rpc('create_immediate_billing_record', {
                            p_round_id: roundId,
                            p_dealer_id: user.id
                        })

                    if (!immediateBillingError && immediateBillingResult?.success && immediateBillingResult?.amount_deducted > 0) {
                        console.log('Immediate billing before delete:', immediateBillingResult)
                        toast.info(`หักค่าธรรมเนียม ฿${immediateBillingResult.amount_deducted.toLocaleString()} ก่อนลบงวด`)
                    } else {
                        const { data: creditResult, error: creditError } = await supabase
                            .rpc('finalize_round_credit', { p_round_id: roundId })

                        if (!creditError && creditResult?.total_deducted > 0) {
                            console.log('Credit finalized before delete:', creditResult)
                            toast.info(`หักค่าธรรมเนียม ฿${creditResult.total_deducted.toLocaleString()} ก่อนลบงวด`)
                        }
                    }
                } else {
                    // Regular percentage + closed/announced: deduct additional if submissions were modified
                    const previouslyCharged = roundData.charged_credit_amount || 0
                    const creditResult = await deductAdditionalCreditForRound(user.id, roundId, previouslyCharged)
                    if (creditResult.amountDeducted > 0) {
                        console.log('Additional credit deducted before delete:', creditResult)
                        toast.info(`หักค่าธรรมเนียมเพิ่มเติม ฿${creditResult.amountDeducted.toLocaleString()} ก่อนลบงวด`)
                    }
                }
            } catch (billingErr) {
                console.log('Billing before delete not configured:', billingErr)
            }

            // Now delete the round
            const { error } = await supabase
                .from('lottery_rounds')
                .delete()
                .eq('id', roundId)

            if (!error) {
                setSelectedRound(null)
                setExpandedRoundId(null)
                fetchData()
                fetchDealerCredit() // Refresh credit balance after deletion
                toast.success('ลบงวดสำเร็จ - บันทึกประวัติแล้ว')
            }
        } catch (error) {
            console.error('Error:', error)
            toast.error('เกิดข้อผิดพลาดในการลบงวด')
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

        // Extract date and time from ISO string (use local time, not UTC)
        const openTime = new Date(round.open_time)
        const closeTime = new Date(round.close_time)
        const formatTimeForInput = (date) => {
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        }
        const formatDateForInput = (date) => {
            // Use local date instead of UTC to avoid timezone issues
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
        }

        // Set form with round data
        setRoundForm({
            lottery_type: round.lottery_type,
            lottery_name: round.lottery_name || '',
            open_date: formatDateForInput(openTime),
            open_time: formatTimeForInput(openTime),
            close_date: formatDateForInput(closeTime),
            close_time: formatTimeForInput(closeTime),
            delete_before_minutes: round.delete_before_minutes || 1,
            delete_after_submit_minutes: round.delete_after_submit_minutes || 0,
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
            const openDateTime = new Date(`${roundForm.open_date}T${roundForm.open_time}:00`)
            const closeDateTime = new Date(`${roundForm.close_date}T${roundForm.close_time}:00`)

            // Format as ISO string preserving local time intent
            const formatLocalDateTime = (date) => {
                const year = date.getFullYear()
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                const hours = String(date.getHours()).padStart(2, '0')
                const minutes = String(date.getMinutes()).padStart(2, '0')
                const seconds = String(date.getSeconds()).padStart(2, '0')
                // Get timezone offset in hours and minutes
                const tzOffset = -date.getTimezoneOffset()
                const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0')
                const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0')
                const tzSign = tzOffset >= 0 ? '+' : '-'
                return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMinutes}`
            }

            // Update round
            const { error: roundError } = await supabase
                .from('lottery_rounds')
                .update({
                    lottery_type: roundForm.lottery_type,
                    lottery_name: roundForm.lottery_name || LOTTERY_TYPES[roundForm.lottery_type],
                    round_date: roundForm.open_date,
                    open_time: formatLocalDateTime(openDateTime),
                    close_time: formatLocalDateTime(closeDateTime),
                    delete_before_minutes: roundForm.delete_before_minutes,
                    delete_after_submit_minutes: roundForm.delete_after_submit_minutes,
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
            // Allow 0 value for dealers who want to transfer all numbers (0 = no limit acceptance)
            const validBetTypes = Object.keys(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {})
            const typeLimitsData = Object.entries(roundForm.type_limits)
                .filter(([betType, maxAmount]) => maxAmount !== undefined && maxAmount !== null && maxAmount !== '' && validBetTypes.includes(betType))
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
            toast.success('แก้ไขงวดสำเร็จ!')

        } catch (error) {
            console.error('Error updating round:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    // Reopen a closed round by extending close_time
    const handleReopenRound = async (round, e) => {
        e.stopPropagation()
        try {
            // Extend close_time to end of today (23:59)
            const now = new Date()
            const newCloseTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

            // Format as ISO string with timezone
            const formatLocalDateTime = (date) => {
                const year = date.getFullYear()
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                const hours = String(date.getHours()).padStart(2, '0')
                const minutes = String(date.getMinutes()).padStart(2, '0')
                const seconds = String(date.getSeconds()).padStart(2, '0')
                const tzOffset = -date.getTimezoneOffset()
                const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0')
                const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0')
                const tzSign = tzOffset >= 0 ? '+' : '-'
                return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMinutes}`
            }

            const { error } = await supabase
                .from('lottery_rounds')
                .update({
                    close_time: formatLocalDateTime(newCloseTime),
                    status: 'open'
                })
                .eq('id', round.id)

            if (error) throw error

            toast.success('เปิดรับงวดหวยใหม่แล้ว (ถึง 23:59 วันนี้)')
            fetchRounds()
        } catch (error) {
            console.error('Error reopening round:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Get status badge (based on time AND status field)
    const getStatusBadge = (round, showReopenButton = false) => {
        const now = new Date()
        const openTime = new Date(round.open_time)
        const closeTime = new Date(round.close_time)

        if (round.status === 'announced') {
            return <span className="status-badge announced"><FiCheck /> ประกาศผลแล้ว</span>
        }
        // Check if round is closed by dealer (status = 'closed') OR by time
        if (round.status === 'closed' || now > closeTime) {
            return (
                <span className="status-badge closed" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FiLock /> ปิดรับแล้ว
                    {showReopenButton && (
                        <button
                            className="btn-reopen"
                            onClick={(e) => handleReopenRound(round, e)}
                            title="เปิดรับใหม่"
                            style={{
                                background: 'rgba(0, 210, 106, 0.2)',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                color: 'var(--color-success)',
                                marginLeft: '4px'
                            }}
                        >
                            เปิดใหม่
                        </button>
                    )}
                </span>
            )
        }
        if (now < openTime) {
            return <span className="status-badge pending"><FiClock /> รอเปิดรับ</span>
        }
        if (!round.is_active) {
            return <span className="status-badge pending" style={{ opacity: 0.7 }}><FiClock /> รอเปิดใช้งาน</span>
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

                {/* Quick Action Buttons - Split half on mobile */}
                <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    width: '100%',
                    marginBottom: '1rem'
                }}>
                    <button
                        type="button"
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1rem',
                            border: '2px solid var(--color-primary)',
                            borderRadius: '8px',
                            background: 'transparent',
                            color: 'var(--color-primary)',
                            fontWeight: 600,
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                        onClick={() => setShowScannerModal(true)}
                    >
                        <FiGrid size={18} /> สแกน
                    </button>
                    <button
                        type="button"
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1rem',
                            border: '2px solid var(--color-primary)',
                            borderRadius: '8px',
                            background: 'transparent',
                            color: 'var(--color-primary)',
                            fontWeight: 600,
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                        onClick={() => setShowQRModal(true)}
                    >
                        <FiShare2 size={18} /> QR ของฉัน
                    </button>
                </div>

                {/* Credit Display - Full width, clickable to open topup modal */}
                {(() => {
                    // Calculate credit level for color coding
                    const availableCredit = dealerCredit?.availableCredit || dealerCredit?.balance || 0
                    const warningThreshold = dealerCredit?.warning_threshold || 1000
                    const isBlocked = dealerCredit?.is_blocked
                    const isCritical = availableCredit <= 0 || isBlocked
                    const isLow = availableCredit > 0 && availableCredit <= warningThreshold
                    const isMedium = availableCredit > warningThreshold && availableCredit <= warningThreshold * 3

                    const bgColor = isCritical ? 'rgba(239, 68, 68, 0.15)' :
                        isLow ? 'rgba(245, 158, 11, 0.15)' :
                            isMedium ? 'rgba(251, 191, 36, 0.1)' :
                                'rgba(16, 185, 129, 0.15)'
                    const borderColor = isCritical ? 'var(--color-danger)' :
                        isLow ? 'var(--color-warning)' :
                            isMedium ? '#f59e0b' :
                                'var(--color-success)'
                    const textColor = isCritical ? 'var(--color-danger)' :
                        isLow ? 'var(--color-warning)' :
                            isMedium ? '#f59e0b' :
                                'var(--color-success)'

                    return (
                        <div
                            className="credit-display card"
                            onClick={() => setShowTopupModal(true)}
                            style={{
                                padding: '0.75rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                width: '100%',
                                background: bgColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                marginBottom: '1rem'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.01)'
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)'
                                e.currentTarget.style.boxShadow = 'none'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem' }}>
                                    เครดิตคงเหลือ
                                </div>
                                <div style={{
                                    fontSize: '1.35rem',
                                    fontWeight: 'bold',
                                    color: creditLoading ? 'var(--color-text-muted)' : textColor
                                }}>
                                    {creditLoading ? '...' : `฿${availableCredit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                                </div>
                                {dealerCredit?.pendingDeduction > 0 && (
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                                        รอตัด: ฿{dealerCredit.pendingDeduction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                                {dealerCredit?.outstanding_debt > 0 && (
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-danger)', marginTop: '0.1rem' }}>
                                        ยอดค้าง: ฿{dealerCredit.outstanding_debt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                            </div>
                            {isBlocked && (
                                <div style={{
                                    background: 'var(--color-danger)',
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold'
                                }}>
                                    <FiAlertTriangle style={{ marginRight: '0.25rem' }} />
                                    บล็อค
                                </div>
                            )}
                            <div style={{
                                background: 'var(--color-primary)',
                                color: 'black',
                                padding: '0.4rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                whiteSpace: 'nowrap'
                            }}>
                                <FiDollarSign /> เติมเครดิต
                            </div>
                        </div>
                    )
                })()}

                {/* Credit Blocked Warning */}
                {dealerCredit?.is_blocked && (
                    <div className="alert alert-danger" style={{
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid var(--color-danger)',
                        borderRadius: '8px'
                    }}>
                        <FiAlertTriangle style={{ fontSize: '1.5rem', color: 'var(--color-danger)' }} />
                        <div>
                            <strong style={{ color: 'var(--color-danger)' }}>เครดิตไม่เพียงพอ!</strong>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                ระบบถูกบล็อคเนื่องจากเครดิตหมด กรุณาเติมเครดิตเพื่อใช้งานต่อ
                            </p>
                        </div>
                    </div>
                )}

                {/* Subscription Expiry Warning */}
                {subscription?.expires_at && (() => {
                    const now = new Date()
                    const expiry = new Date(subscription.expires_at)
                    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
                    const isExpired = daysLeft <= 0
                    const isExpiringSoon = daysLeft > 0 && daysLeft <= 7
                    const bm = subscription.subscription_packages?.billing_model || subscription.billing_model
                    const isFixedPrice = bm !== 'percentage' && bm !== 'profit_percentage' && bm !== 'per_user_yearly'

                    if (!isExpired && !isExpiringSoon) return null
                    if (!isFixedPrice) return null

                    // Check if dealer has enough credit for renewal
                    const renewalPrice = subscription.billing_cycle === 'yearly'
                        ? parseFloat(subscription.subscription_packages?.yearly_price || 0)
                        : parseFloat(subscription.subscription_packages?.monthly_price || 0)
                    const availableCredit = (dealerCredit?.availableCredit || 0)
                    const canRenew = availableCredit >= renewalPrice && renewalPrice > 0

                    return (
                        <div style={{
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '1rem',
                            background: isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            border: `1px solid ${isExpired ? 'var(--color-danger)' : '#f59e0b'}`,
                            borderRadius: '8px'
                        }}>
                            <FiAlertTriangle style={{ fontSize: '1.5rem', color: isExpired ? 'var(--color-danger)' : '#f59e0b', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <strong style={{ color: isExpired ? 'var(--color-danger)' : '#f59e0b' }}>
                                    {isExpired ? 'แพ็คเกจหมดอายุแล้ว!' : `แพ็คเกจจะหมดอายุใน ${daysLeft} วัน`}
                                </strong>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                    {renewalPrice > 0 ? (
                                        canRenew
                                            ? `ระบบจะต่ออายุอัตโนมัติ (฿${renewalPrice.toLocaleString()}/${subscription.billing_cycle === 'yearly' ? 'ปี' : 'เดือน'})`
                                            : `เครดิตไม่เพียงพอสำหรับต่ออายุ (ต้องการ ฿${renewalPrice.toLocaleString()} คงเหลือ ฿${availableCredit.toLocaleString()}) กรุณาเติมเครดิต`
                                    ) : 'กรุณาติดต่อผู้ดูแลระบบ'}
                                </p>
                            </div>
                        </div>
                    )
                })()}

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
                        <FiUsers /> สมาชิก ({members.length + downstreamDealers.filter(d => d.membership_status === 'active').length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'upstreamDealers' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upstreamDealers')}
                    >
                        <FiSend /> เจ้ามือตีออก ({upstreamDealers.length})
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
                        const closedRounds = rounds.filter(r => !isRoundOpen(r)).sort((a, b) => {
                            const closeA = new Date(a.close_time).getTime()
                            const closeB = new Date(b.close_time).getTime()
                            if (closeB !== closeA) return closeB - closeA
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        })
                        const displayedRounds = roundsTab === 'open' ? openRounds : closedRounds

                        return (
                            <div className="rounds-section">
                                {/* Create Button */}
                                <div className="section-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
                                    <h2>งวดหวยทั้งหมด</h2>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowCreateModal(true)}
                                        style={{ width: '100%', justifyContent: 'center' }}
                                    >
                                        <FiPlus /> สร้างงวดใหม่
                                    </button>
                                </div>

                                {/* Sub-tabs for Open/Closed/History Rounds */}
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
                                    <button
                                        className={`sub-tab-btn ${roundsTab === 'history' ? 'active' : ''}`}
                                        onClick={() => { setRoundsTab('history'); fetchRoundHistory(); }}
                                    >
                                        ประวัติ
                                    </button>
                                </div>

                                {/* Rounds List or History */}
                                {roundsTab === 'history' ? (
                                    // History Tab Content
                                    historyLoading ? (
                                        <div className="loading-state">
                                            <div className="spinner"></div>
                                        </div>
                                    ) : roundHistory.length === 0 ? (
                                        <div className="empty-state card">
                                            <FiCalendar className="empty-icon" />
                                            <h3>ไม่มีประวัติงวดหวย</h3>
                                            <p>ประวัติจะแสดงเมื่อคุณลบงวดหวยที่ปิดแล้ว</p>
                                        </div>
                                    ) : (
                                        <>
                                        {/* History Filters */}
                                        <div className="history-filter-bar">
                                            <div className="history-filter-item">
                                                <label className="history-filter-label"><FiCalendar /> ช่วงเวลา</label>
                                                <select
                                                    className="history-filter-select"
                                                    value={historyMonthFilter}
                                                    onChange={e => setHistoryMonthFilter(e.target.value)}
                                                >
                                                    <option value="all">ทั้งหมด</option>
                                                    {historyMonthOptions.map(opt => (
                                                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="history-filter-item">
                                                <label className="history-filter-label"><FiGrid /> ประเภทหวย</label>
                                                <select
                                                    className="history-filter-select"
                                                    value={historyLotteryFilter}
                                                    onChange={e => setHistoryLotteryFilter(e.target.value)}
                                                >
                                                    <option value="all">ทั้งหมด</option>
                                                    {historyLotteryOptions.map(opt => (
                                                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* History Aggregate Summary */}
                                        {filteredHistory.length > 0 && (
                                            <div className="history-summary-card">
                                                <h4 className="history-summary-title">
                                                    <FiFileText /> สรุปรวม ({filteredHistory.length} งวด)
                                                </h4>
                                                <div className="history-summary-body">
                                                    <div className="history-summary-section">
                                                        <div className="history-summary-section-title">ยอดรับ ({historySummary.totalEntries.toLocaleString()})</div>
                                                        <div className="history-summary-stats">
                                                            <div className="history-summary-stat">
                                                                <span className="stat-label">ยอดรวม</span>
                                                                <span className="stat-value success">+฿{historySummary.totalAmount.toLocaleString()}</span>
                                                            </div>
                                                            <div className="history-summary-stat">
                                                                <span className="stat-label">ค่าคอม</span>
                                                                <span className="stat-value danger">-฿{Math.round(historySummary.totalCommission).toLocaleString()}</span>
                                                            </div>
                                                            <div className="history-summary-stat">
                                                                <span className="stat-label">จ่าย</span>
                                                                <span className={`stat-value ${historySummary.totalPayout > 0 ? 'danger' : ''}`}>
                                                                    {historySummary.totalPayout > 0 ? '-' : ''}฿{historySummary.totalPayout.toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="history-summary-stat">
                                                                <span className="stat-label">กำไร</span>
                                                                <span className={`stat-value ${historySummary.incomingProfit >= 0 ? 'success' : 'danger'}`}>
                                                                    {historySummary.incomingProfit >= 0 ? '+' : ''}฿{Math.round(historySummary.incomingProfit).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {historySummary.hasOutgoing && (
                                                        <div className="history-summary-section">
                                                            <div className="history-summary-section-title">ยอดส่ง ({historySummary.totalTransferredEntries.toLocaleString()})</div>
                                                            <div className="history-summary-stats">
                                                                <div className="history-summary-stat">
                                                                    <span className="stat-label">ยอดรวม</span>
                                                                    <span className="stat-value danger">-฿{historySummary.totalTransferred.toLocaleString()}</span>
                                                                </div>
                                                                <div className="history-summary-stat">
                                                                    <span className="stat-label">ค่าคอม</span>
                                                                    <span className="stat-value success">+฿{Math.round(historySummary.totalUpstreamComm).toLocaleString()}</span>
                                                                </div>
                                                                <div className="history-summary-stat">
                                                                    <span className="stat-label">รับ</span>
                                                                    <span className={`stat-value ${historySummary.totalUpstreamWin > 0 ? 'success' : ''}`}>
                                                                        ฿{historySummary.totalUpstreamWin.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                                <div className="history-summary-stat">
                                                                    <span className="stat-label">กำไร</span>
                                                                    <span className={`stat-value ${historySummary.outgoingProfit >= 0 ? 'success' : 'danger'}`}>
                                                                        {historySummary.outgoingProfit >= 0 ? '+' : ''}฿{Math.round(historySummary.outgoingProfit).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="history-summary-total">
                                                        <span>กำไรรวม</span>
                                                        <span className={`stat-value ${historySummary.totalProfit >= 0 ? 'success' : 'danger'}`}>
                                                            {historySummary.totalProfit >= 0 ? '+' : ''}฿{Math.round(historySummary.totalProfit).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* History List */}
                                        {filteredHistory.length === 0 ? (
                                            <div className="empty-state card">
                                                <FiCalendar className="empty-icon" />
                                                <h3>ไม่พบประวัติที่ตรงกับตัวกรอง</h3>
                                                <p>ลองเปลี่ยนช่วงเวลาหรือประเภทหวย</p>
                                            </div>
                                        ) : (
                                        <div className="history-list">
                                            {filteredHistory.map(history => {
                                                const isExpanded = expandedHistoryId === history.id
                                                const userDetails = historyUserDetails[history.round_id] || []
                                                return (
                                                <div key={history.id} className={`round-accordion-item ${history.lottery_type} ${isExpanded ? 'expanded' : ''}`}>
                                                    <div 
                                                        className="round-accordion-header card" 
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => toggleHistoryAccordion(history)}
                                                    >
                                                        <div className="open-round-layout">
                                                            {/* Row 1: Logo, Name, Chevron */}
                                                            <div className="open-round-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <span className={`lottery-badge ${history.lottery_type}`}>
                                                                        {LOTTERY_TYPES[history.lottery_type] || history.lottery_type}
                                                                    </span>
                                                                    <span className="round-name">{history.lottery_name || LOTTERY_TYPES[history.lottery_type]}</span>
                                                                    <button
                                                                        className="history-delete-btn"
                                                                        title="ลบประวัติงวดนี้"
                                                                        onClick={(e) => handleDeleteHistory(history.id, e)}
                                                                    >
                                                                        <FiTrash2 />
                                                                    </button>
                                                                </div>
                                                                <FiChevronDown style={{ 
                                                                    transition: 'transform 0.2s', 
                                                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                                    fontSize: '1.2rem',
                                                                    color: 'var(--color-text-muted)'
                                                                }} />
                                                            </div>
                                                            
                                                            {/* Row 2: Date/Time */}
                                                            <div className="open-round-datetime">
                                                                <FiCalendar /> {formatDate(history.open_time || history.round_date)} {formatTime(history.open_time || history.round_date)} - {formatDate(history.close_time || history.round_date)} {formatTime(history.close_time || history.round_date)}
                                                            </div>
                                                            
                                                            {/* Row 3: Summary Stats — matching dealer dashboard layout */}
                                                            {(() => {
                                                                const incomingProfit = (history.total_amount || 0) - (history.total_commission || 0) - (history.total_payout || 0)
                                                                const outgoingBet = history.transferred_amount || 0
                                                                const outgoingComm = history.upstream_commission || 0
                                                                const outgoingWin = history.upstream_winnings || 0
                                                                const outgoingProfit = outgoingWin + outgoingComm - outgoingBet
                                                                const hasOutgoing = outgoingBet > 0
                                                                return (
                                                            <div className="open-round-stats">
                                                                {/* ยอดรับ */}
                                                                <div className="stats-block incoming">
                                                                    <div className="stats-block-header">ยอดรับ ({history.total_entries || 0})</div>
                                                                    <div className="stats-block-items">
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ยอดรวม</span>
                                                                            <span className="stat-value success">+฿{(history.total_amount || 0).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ค่าคอม</span>
                                                                            <span className="stat-value danger">-฿{(history.total_commission || 0).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">จ่าย</span>
                                                                            <span className="stat-value danger">-฿{(history.total_payout || 0).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">กำไร</span>
                                                                            <span className={`stat-value ${incomingProfit >= 0 ? 'success' : 'danger'}`}>
                                                                                {incomingProfit >= 0 ? '+' : ''}฿{Math.round(incomingProfit).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* ยอดส่ง (ตีออก) — only show if there are outgoing transfers */}
                                                                {hasOutgoing && (
                                                                <div className="stats-block outgoing">
                                                                    <div className="stats-block-header">ยอดส่ง ({history.transferred_entries || 0})</div>
                                                                    <div className="stats-block-items">
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ยอดรวม</span>
                                                                            <span className="stat-value danger">-฿{outgoingBet.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ค่าคอม</span>
                                                                            <span className="stat-value success">+฿{Math.round(outgoingComm).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">รับ</span>
                                                                            <span className={`stat-value ${outgoingWin > 0 ? 'success' : ''}`}>
                                                                                {outgoingWin > 0 ? '+' : ''}฿{outgoingWin.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">กำไร</span>
                                                                            <span className={`stat-value ${outgoingProfit >= 0 ? 'success' : 'danger'}`}>
                                                                                {outgoingProfit >= 0 ? '+' : ''}฿{Math.round(outgoingProfit).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                )}

                                                                {/* กำไรรวม */}
                                                                {(() => {
                                                                    const totalProfit = incomingProfit + outgoingProfit
                                                                    return (
                                                                <div className="stats-block" style={{ background: 'transparent', padding: '0.25rem 0.5rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>กำไรรวม</span>
                                                                        <span className={`stat-value ${totalProfit >= 0 ? 'success' : 'danger'}`} style={{ fontWeight: 700, fontSize: '1rem' }}>
                                                                            {totalProfit >= 0 ? '+' : ''}฿{Math.round(totalProfit).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                    )
                                                                })()}
                                                            </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Accordion Body - User Details */}
                                                    {isExpanded && (
                                                        <div className="history-accordion-body">
                                                            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                                                                <FiUsers style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                                                                สรุปยอดสมาชิก ({userDetails.length} คน)
                                                            </h4>
                                                            {userDetails.length === 0 ? (
                                                                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                    <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto 0.5rem' }}></div>
                                                                    กำลังโหลด...
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                    {userDetails.map((ud, idx) => {
                                                                        const dealerProfit = (ud.total_amount || 0) - (ud.total_commission || 0) - (ud.total_winnings || 0)
                                                                        return (
                                                                        <div key={ud.id || idx} className="history-user-card">
                                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                                                                                <FiUser style={{ color: 'var(--color-primary)' }} />
                                                                                {ud.full_name}
                                                                            </div>
                                                                            <div className="open-round-stats">
                                                                                <div className="stats-block incoming">
                                                                                    <div className="stats-block-items">
                                                                                        <div className="stat-item">
                                                                                            <span className="stat-label">ยอดรับ</span>
                                                                                            <span className="stat-value success">+฿{(ud.total_amount || 0).toLocaleString()}</span>
                                                                                        </div>
                                                                                        <div className="stat-item">
                                                                                            <span className="stat-label">ค่าคอม</span>
                                                                                            <span className="stat-value danger">-฿{(ud.total_commission || 0).toLocaleString()}</span>
                                                                                        </div>
                                                                                        <div className="stat-item">
                                                                                            <span className="stat-label">จ่าย</span>
                                                                                            <span className={`stat-value ${(ud.total_winnings || 0) > 0 ? 'danger' : ''}`}>
                                                                                                {(ud.total_winnings || 0) > 0 ? '-' : ''}฿{(ud.total_winnings || 0).toLocaleString()}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="stat-item">
                                                                                            <span className="stat-label">กำไร/ขาดทุน</span>
                                                                                            <span className={`stat-value ${dealerProfit >= 0 ? 'success' : 'danger'}`}>
                                                                                                {dealerProfit >= 0 ? '+' : ''}฿{dealerProfit.toLocaleString()}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
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
                                            })}
                                        </div>
                                        )}
                                        </>
                                    )
                                ) : (
                                    // Open/Closed Rounds Content
                                    loading ? (
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
                                                    onToggleActive={() => handleToggleActive(round.id, round.is_active)}
                                                    onEditRound={() => handleOpenEditModal(round)}
                                                    onShowNumberLimits={() => { setSelectedRound(round); setShowNumberLimitsModal(true); }}
                                                    onDeleteRound={() => handleDeleteRound(round.id, round.status)}
                                                    onShowResults={() => { setSelectedRound(round); setShowResultsModal(true); }}
                                                    getStatusBadge={(r) => getStatusBadge(r, true)}
                                                    formatDate={formatDate}
                                                    formatTime={formatTime}
                                                    user={user}
                                                    allMembers={members}
                                                    onCreditUpdate={fetchDealerCredit}
                                                    pendingCreditRefresh={pendingCreditRefresh}
                                                    roundPendingData={roundPendingMap[round.id]}
                                                    isExpanded={expandedRoundId === round.id}
                                                    onToggle={() => setExpandedRoundId(expandedRoundId === round.id ? null : round.id)}
                                                />
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>
                        )
                    })()}

                    {activeTab === 'members' && (
                        <div className="members-section">
                            {/* Section Title */}
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: '600',
                                marginBottom: '1rem',
                                color: 'var(--color-text)'
                            }}>
                                <FiUsers style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                                สมาชิก
                            </h2>

                            {/* Add Member Button - Full width on mobile */}
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowAddMemberModal(true)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    marginBottom: '1rem',
                                    padding: '0.75rem 1rem'
                                }}
                            >
                                <FiPlus /> เพิ่มสมาชิก
                            </button>

                            {/* Search Member Input */}
                            <div style={{
                                position: 'relative',
                                marginBottom: '1.5rem'
                            }}>
                                <FiSearch style={{
                                    position: 'absolute',
                                    left: '1rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    type="text"
                                    placeholder="ค้นหาสมาชิก..."
                                    value={memberSearchQuery}
                                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface)',
                                        color: 'var(--color-text)',
                                        fontSize: '0.95rem'
                                    }}
                                />
                                {memberSearchQuery && (
                                    <button
                                        onClick={() => setMemberSearchQuery('')}
                                        style={{
                                            position: 'absolute',
                                            right: '0.75rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--color-text-muted)',
                                            cursor: 'pointer',
                                            padding: '0.25rem'
                                        }}
                                    >
                                        <FiX size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Member Type Filter */}
                            <div className="member-type-filter" style={{
                                marginBottom: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                {/* First row: ทั้งหมด - full width */}
                                <button
                                    className={`btn btn-sm ${memberTypeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMemberTypeFilter('all')}
                                    style={{ width: '100%' }}
                                >
                                    ทั้งหมด ({members.length + downstreamDealers.filter(d => d.membership_status === 'active').length})
                                </button>
                                {/* Second row: สมาชิก + เจ้ามือ - 50% each */}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className={`btn btn-sm ${memberTypeFilter === 'member' ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => setMemberTypeFilter('member')}
                                        style={{ flex: 1 }}
                                    >
                                        <FiUser /> สมาชิกทั่วไป ({members.length})
                                    </button>
                                    <button
                                        className={`btn btn-sm ${memberTypeFilter === 'dealer' ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => setMemberTypeFilter('dealer')}
                                        style={{ flex: 1 }}
                                    >
                                        <FiSend /> เจ้ามือตีเข้า ({downstreamDealers.filter(d => d.membership_status === 'active').length})
                                    </button>
                                </div>
                            </div>

                            {/* Pending Members Section - Always visible at top */}
                            {(() => {
                                const pendingDownstreamDealers = downstreamDealers.filter(d => d.membership_status === 'pending')
                                const allPending = [
                                    ...pendingMembers.map(m => ({ ...m, is_dealer: false })),
                                    ...pendingDownstreamDealers.map(d => ({ ...d, is_dealer: true }))
                                ]

                                if (allPending.length === 0) return null

                                return (
                                    <div className="pending-members-section" style={{
                                        marginBottom: '1.5rem',
                                        padding: '1rem',
                                        background: 'var(--color-surface)',
                                        borderRadius: '12px',
                                        border: '2px solid var(--color-warning)'
                                    }}>
                                        <div className="section-header" style={{ marginBottom: '1rem' }}>
                                            <h3 style={{ fontSize: '1.1rem', color: 'var(--color-warning)', fontWeight: '600' }}>
                                                <FiClock /> สมาชิกที่รอการอนุมัติ
                                            </h3>
                                            <span className="badge" style={{
                                                background: 'var(--color-warning)',
                                                color: '#000',
                                                fontWeight: '600'
                                            }}>
                                                {allPending.length} คน
                                            </span>
                                        </div>
                                        <div className="pending-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {allPending.map(member => (
                                                <div key={member.is_dealer ? `dealer-${member.id}` : member.id} className="pending-member-item card" style={{
                                                    padding: '1rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                    gap: '0.75rem',
                                                    background: 'var(--color-surface-alt)',
                                                    border: member.is_dealer ? '1px solid var(--color-info)' : '1px solid var(--color-border)',
                                                    borderRadius: '8px'
                                                }}>
                                                    <div className="member-info">
                                                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            {member.full_name || 'ไม่มีชื่อ'}
                                                            {member.is_dealer && (
                                                                <span style={{
                                                                    background: 'var(--color-info)',
                                                                    color: '#fff',
                                                                    padding: '0.1rem 0.4rem',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: '600'
                                                                }}>
                                                                    เจ้ามือ
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{member.email}</div>
                                                    </div>
                                                    <div className="member-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            className="btn btn-success btn-sm"
                                                            onClick={() => member.is_dealer ? handleApproveDownstreamDealer(member) : handleApproveMember(member)}
                                                            style={{
                                                                padding: '0.5rem 1rem',
                                                                fontWeight: '500'
                                                            }}
                                                        >
                                                            <FiCheck /> อนุมัติ
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => member.is_dealer ? handleRejectDownstreamDealer(member) : handleRejectMember(member)}
                                                            style={{
                                                                padding: '0.5rem 1rem',
                                                                fontWeight: '500'
                                                            }}
                                                        >
                                                            <FiX /> ปฏิเสธ
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Members List - Accordion Style */}
                            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <h2>
                                        {memberTypeFilter === 'all' ? 'สมาชิกทั้งหมด' :
                                            memberTypeFilter === 'member' ? 'สมาชิกทั่วไป' : 'เจ้ามือที่ตีเลขเข้ามา'}
                                    </h2>
                                    <span className="badge">
                                        {memberTypeFilter === 'all'
                                            ? members.length + downstreamDealers.filter(d => d.membership_status === 'active').length
                                            : memberTypeFilter === 'member'
                                                ? members.length
                                                : downstreamDealers.filter(d => d.membership_status === 'active').length} คน
                                    </span>
                                </div>
                            </div>

                            {(() => {
                                const activeDownstreamDealers = downstreamDealers.filter(d => d.membership_status === 'active')
                                let filteredMembers = memberTypeFilter === 'all'
                                    ? [...members.map(m => ({ ...m, is_dealer: false })), ...activeDownstreamDealers]
                                    : memberTypeFilter === 'member'
                                        ? members.map(m => ({ ...m, is_dealer: false }))
                                        : activeDownstreamDealers

                                // Apply search filter
                                if (memberSearchQuery.trim()) {
                                    const query = memberSearchQuery.toLowerCase().trim()
                                    filteredMembers = filteredMembers.filter(m =>
                                        (m.full_name && m.full_name.toLowerCase().includes(query)) ||
                                        (m.email && m.email.toLowerCase().includes(query)) ||
                                        (m.phone && m.phone.includes(query))
                                    )
                                }

                                const pendingDownstreamDealers = downstreamDealers.filter(d => d.membership_status === 'pending')

                                if (filteredMembers.length === 0 && pendingMembers.length === 0 && pendingDownstreamDealers.length === 0) {
                                    return (
                                        <div className="empty-state card">
                                            <FiUsers className="empty-icon" />
                                            <h3>ยังไม่มีสมาชิก</h3>
                                            <p>ส่งลิงก์ด้านบนให้คนที่ต้องการเข้าร่วม</p>
                                        </div>
                                    )
                                }

                                if (filteredMembers.length === 0) {
                                    return (
                                        <div className="empty-state card" style={{ padding: '1.5rem' }}>
                                            <p style={{ opacity: 0.7 }}>
                                                {memberTypeFilter === 'dealer'
                                                    ? 'ยังไม่มีเจ้ามือที่ตีเลขเข้ามา'
                                                    : 'ยังไม่มีสมาชิกที่อนุมัติแล้ว'}
                                            </p>
                                        </div>
                                    )
                                }

                                return (
                                    <div className="members-accordion-list">
                                        {filteredMembers.map(member => (
                                            <MemberAccordionItem
                                                key={member.is_dealer ? `dealer-${member.id}` : member.id}
                                                member={member}
                                                formatDate={formatDate}
                                                isExpanded={expandedMemberId === (member.is_dealer ? `dealer-${member.id}` : member.id)}
                                                onToggle={() => setExpandedMemberId(
                                                    expandedMemberId === (member.is_dealer ? `dealer-${member.id}` : member.id)
                                                        ? null
                                                        : (member.is_dealer ? `dealer-${member.id}` : member.id)
                                                )}
                                                onBlock={() => member.is_dealer ? handleBlockDownstreamDealer(member) : handleBlockMember(member)}
                                                onDelete={() => member.is_dealer ? null : handleDeleteMember(member)}
                                                onDisconnect={member.is_dealer ? () => handleDisconnectDealer(member) : null}
                                                dealerBankAccounts={dealerBankAccounts}
                                                onUpdateBank={(bankAccountId) => handleUpdateMemberBank(member, bankAccountId)}
                                                isDealer={member.is_dealer}
                                                onCopyCredentials={copyMemberCredentials}
                                                isPerUserYearly={isPerUserYearly()}
                                                onRenew={(m) => {
                                                    setRenewMember(m)
                                                    setRenewYears(1)
                                                    setShowRenewModal(true)
                                                }}
                                            />
                                        ))}
                                    </div>
                                )
                            })()}

                            {/* Blocked Members Section */}
                            {(() => {
                                const blockedDownstreamDealers = downstreamDealers.filter(d => d.membership_status === 'blocked')
                                const allBlocked = [
                                    ...blockedMembers.map(m => ({ ...m, is_dealer: false })),
                                    ...blockedDownstreamDealers
                                ]

                                if (allBlocked.length === 0) return null

                                return (
                                    <div className="blocked-members-section" style={{ marginTop: '1.5rem' }}>
                                        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
                                            <h3 style={{ fontSize: '1rem', color: 'var(--color-error)' }}>
                                                <FiLock /> บล็อคแล้ว
                                            </h3>
                                            <span className="badge" style={{ background: 'var(--color-error)' }}>
                                                {allBlocked.length} คน
                                            </span>
                                        </div>
                                        <div className="blocked-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {allBlocked.map(member => (
                                                <div key={member.is_dealer ? `dealer-${member.id}` : member.id} className="blocked-member-item card" style={{
                                                    padding: '0.75rem 1rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    opacity: 0.7,
                                                    border: member.is_dealer ? '1px solid var(--color-info)' : undefined
                                                }}>
                                                    <div className="member-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                {member.full_name || 'ไม่มีชื่อ'}
                                                                {member.is_dealer && (
                                                                    <span style={{
                                                                        background: 'var(--color-info)',
                                                                        color: '#fff',
                                                                        padding: '0.1rem 0.4rem',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: '600'
                                                                    }}>
                                                                        เจ้ามือ
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{member.email}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => member.is_dealer ? handleBlockDownstreamDealer(member) : handleUnblockMember(member)}
                                                        style={{ padding: '0.35rem 0.75rem' }}
                                                    >
                                                        ปลดบล็อค
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    )}

                    {activeTab === 'upstreamDealers' && (
                        <UpstreamDealersTab
                            user={user}
                            upstreamDealers={upstreamDealers}
                            setUpstreamDealers={setUpstreamDealers}
                            loadingUpstream={loadingUpstream}
                            setLoadingUpstream={setLoadingUpstream}
                        />
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
                                    {Object.entries(LOTTERY_TYPES)
                                        .filter(([key]) => !allowedLotteryTypes || allowedLotteryTypes.includes(key))
                                        .map(([key, label]) => (
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

                            {/* Open Date & Time */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">วันที่เปิด</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={roundForm.open_date}
                                        onChange={e => setRoundForm({ ...roundForm, open_date: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาเปิด</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.open_time}
                                        onChange={e => setRoundForm({ ...roundForm, open_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                            </div>

                            {/* Close Date & Time */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">วันที่ปิด</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={roundForm.close_date}
                                        onChange={e => setRoundForm({ ...roundForm, close_date: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาปิด</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.close_time}
                                        onChange={e => setRoundForm({ ...roundForm, close_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                            </div>

                            {/* Delete After Submit */}
                            <div className="form-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">ลบเลขหลังป้อน (นาที)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={roundForm.delete_after_submit_minutes}
                                        onChange={e => setRoundForm({ ...roundForm, delete_after_submit_minutes: parseInt(e.target.value) || 0 })}
                                        onFocus={handleInputFocus}
                                        onKeyDown={handleInputKeyDown}
                                        min="0"
                                        placeholder="0 = ไม่จำกัด"
                                    />
                                    <p className="form-hint" style={{ marginTop: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                                        0 = ลบได้จนกว่าจะถึงเวลาก่อนปิดรับ
                                    </p>
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

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                    gap: '0.5rem'
                                }}>
                                    {Object.entries(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {}).map(([key, config]) => (
                                        <div key={key} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.6rem 0.8rem',
                                            background: 'rgba(212, 175, 55, 0.08)',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid rgba(212, 175, 55, 0.2)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontWeight: 500, color: 'var(--color-primary)', fontSize: '0.9rem', minWidth: '65px' }}>
                                                    {config.label}
                                                </span>
                                                {config.isSet && <span className="set-badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.25rem' }}>ชุด</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>อั้น</span>
                                                <input
                                                    type="number"
                                                    className="form-input small"
                                                    style={{ width: '90px', textAlign: 'center', padding: '0.35rem 0.5rem', fontSize: '0.95rem' }}
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
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', minWidth: '25px' }}>{config.isSet ? 'ชุด' : roundForm.currency_name}</span>
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
                                    {Object.entries(LOTTERY_TYPES)
                                        .filter(([key]) => !allowedLotteryTypes || allowedLotteryTypes.includes(key))
                                        .map(([key, label]) => (
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

                            {/* Open Date & Time */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">วันที่เปิด</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={roundForm.open_date}
                                        onChange={e => setRoundForm({ ...roundForm, open_date: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาเปิด</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.open_time}
                                        onChange={e => setRoundForm({ ...roundForm, open_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                            </div>

                            {/* Close Date & Time */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">วันที่ปิด</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={roundForm.close_date}
                                        onChange={e => setRoundForm({ ...roundForm, close_date: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เวลาปิด</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={roundForm.close_time}
                                        onChange={e => setRoundForm({ ...roundForm, close_time: e.target.value })}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                </div>
                            </div>

                            {/* Delete After Submit */}
                            <div className="form-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">ลบเลขหลังป้อน (นาที)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={roundForm.delete_after_submit_minutes}
                                        onChange={e => setRoundForm({ ...roundForm, delete_after_submit_minutes: parseInt(e.target.value) || 0 })}
                                        onFocus={handleInputFocus}
                                        onKeyDown={handleInputKeyDown}
                                        min="0"
                                        placeholder="0 = ไม่จำกัด"
                                    />
                                    <p className="form-hint" style={{ marginTop: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                                        0 = ลบได้จนกว่าจะถึงเวลาก่อนปิดรับ
                                    </p>
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

                            {/* Limits by Bet Type - Compact Style */}
                            <div className="form-section">
                                <h4>ค่าอั้นตามประเภทเลข ({LOTTERY_TYPES[roundForm.lottery_type]})</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '0.85rem' }}>
                                    อัตราจ่ายจะใช้ตามที่ตั้งค่าให้แต่ละลูกค้า
                                </p>

                                {/* Compact limits display */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                    gap: '0.5rem'
                                }}>
                                    {Object.entries(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {}).map(([key, config]) => (
                                        <div key={key} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.6rem 0.8rem',
                                            background: 'rgba(212, 175, 55, 0.08)',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid rgba(212, 175, 55, 0.2)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontWeight: 500, color: 'var(--color-primary)', fontSize: '0.9rem', minWidth: '65px' }}>
                                                    {config.label}
                                                </span>
                                                {config.isSet && <span className="set-badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.25rem' }}>ชุด</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>อั้น</span>
                                                <input
                                                    type="number"
                                                    className="form-input small"
                                                    style={{ width: '90px', textAlign: 'center', padding: '0.35rem 0.5rem', fontSize: '0.95rem' }}
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
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', minWidth: '25px' }}>{config.isSet ? 'ชุด' : roundForm.currency_name}</span>
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
                    fetchDealerCredit={fetchDealerCredit}
                />
            )}

            {/* Results Modal */}
            {showResultsModal && selectedRound && (
                <ResultsModal
                    round={selectedRound}
                    onClose={async (updatedRound) => {
                        setShowResultsModal(false)
                        if (updatedRound) {
                            setRounds(prev => prev.map(r => r.id === updatedRound.id ? { ...r, ...updatedRound } : r))

                            // If the round was still 'open' before announcing, deduct credit now
                            // (closed rounds already had credit deducted in handleCloseRound)
                            // For profit_percentage: ResultsModal.handleAnnounce already handles everything
                            const wasOpen = selectedRound.status === 'open' || 
                                (!selectedRound.status && new Date() <= new Date(selectedRound.close_time))
                            if (wasOpen) {
                                try {
                                    // Check billing model - skip RPC deduction for profit_percentage
                                    // (profit-based deduction is already done in ResultsModal)
                                    const { data: dealerSubs } = await supabase
                                        .from('dealer_subscriptions')
                                        .select('billing_model, subscription_packages(billing_model)')
                                        .eq('dealer_id', user.id)
                                        .in('status', ['active', 'trial'])
                                        .order('created_at', { ascending: false })
                                        .limit(1)
                                    
                                    const billingModel = dealerSubs?.[0]?.subscription_packages?.billing_model || dealerSubs?.[0]?.billing_model

                                    if (billingModel !== 'profit_percentage') {
                                        const { data: immediateBillingResult, error: immediateBillingError } = await supabase
                                            .rpc('create_immediate_billing_record', {
                                                p_round_id: updatedRound.id,
                                                p_dealer_id: user.id
                                            })

                                        if (!immediateBillingError && immediateBillingResult?.success && immediateBillingResult?.amount_deducted > 0) {
                                            console.log('Immediate billing on announce:', immediateBillingResult)
                                            toast.info(`ตัดเครดิต ฿${immediateBillingResult.amount_deducted.toLocaleString()} สำเร็จ`)
                                        } else {
                                            const { data: result, error: creditError } = await supabase
                                                .rpc('finalize_round_credit', { p_round_id: updatedRound.id })

                                            if (!creditError && result?.total_deducted > 0) {
                                                console.log('Regular finalization on announce:', result)
                                                toast.info(`ตัดเครดิต ฿${result.total_deducted.toLocaleString()} สำเร็จ`)
                                            }
                                        }
                                    }
                                } catch (billingErr) {
                                    console.log('Credit system not configured:', billingErr)
                                }
                                fetchDealerCredit()
                            }
                        }
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

            {/* Topup Credit Modal */}
            {showTopupModal && (
                <div className="modal-overlay" onClick={() => { setShowTopupModal(false); setSlipPreview(null); setTopupForm({ amount: '', slip_file: null }); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3><FiDollarSign /> เติมเครดิต</h3>
                            <button className="modal-close" onClick={() => { setShowTopupModal(false); setSlipPreview(null); setTopupForm({ amount: '', slip_file: null }); }}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Current Balance */}
                            <div style={{
                                background: 'var(--color-bg-secondary)',
                                padding: '1rem',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>เครดิตคงเหลือ</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-success)' }}>
                                    {(dealerCredit?.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </div>
                            </div>

                            {/* Bank Account Info */}
                            {assignedBankAccount ? (
                                <div style={{
                                    background: 'var(--color-surface)',
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    marginBottom: '1.5rem',
                                    border: '2px solid var(--color-primary)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                                }}>
                                    <BankAccountCard
                                        bank={assignedBankAccount}
                                        title="โอนเงินเข้าบัญชีนี้"
                                    />
                                </div>
                            ) : (
                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    border: '1px solid var(--color-danger)',
                                    textAlign: 'center'
                                }}>
                                    <FiAlertTriangle style={{ fontSize: '1.5rem', color: 'var(--color-danger)', marginBottom: '0.5rem' }} />
                                    <div style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>
                                        ยังไม่มีบัญชีธนาคารที่ผูกไว้
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                        กรุณาติดต่อ Admin เพื่อผูกบัญชีธนาคาร
                                    </div>
                                </div>
                            )}

                            {assignedBankAccount && (
                                <>
                                    {/* Amount Input */}
                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '0.5rem',
                                            fontWeight: '600',
                                            color: 'var(--color-text)'
                                        }}>
                                            จำนวนเงินที่โอน (บาท)
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{
                                                position: 'absolute',
                                                left: '1rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                fontSize: '1.25rem',
                                                fontWeight: 'bold',
                                                color: 'var(--color-primary)'
                                            }}>
                                                ฿
                                            </span>
                                            <input
                                                type="number"
                                                value={topupForm.amount}
                                                onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })}
                                                placeholder="0.00"
                                                min="1"
                                                step="0.01"
                                                style={{
                                                    fontSize: '1.5rem',
                                                    textAlign: 'center',
                                                    padding: '1rem 2.5rem',
                                                    borderRadius: '12px',
                                                    border: '2px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    fontWeight: 'bold',
                                                    width: '100%',
                                                    transition: 'border-color 0.2s, box-shadow 0.2s'
                                                }}
                                                onFocus={(e) => {
                                                    e.target.style.borderColor = 'var(--color-primary)'
                                                    e.target.style.boxShadow = '0 0 0 3px rgba(234, 179, 8, 0.2)'
                                                }}
                                                onBlur={(e) => {
                                                    e.target.style.borderColor = 'var(--color-border)'
                                                    e.target.style.boxShadow = 'none'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Slip Upload */}
                                    <div className="form-group">
                                        <label>แนบสลิปการโอนเงิน</label>
                                        <div style={{
                                            border: '2px dashed var(--color-border)',
                                            borderRadius: '8px',
                                            padding: '1rem',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            background: slipPreview ? 'transparent' : 'var(--color-bg-secondary)'
                                        }}
                                            onClick={() => document.getElementById('slip-file-input').click()}
                                        >
                                            {slipPreview ? (
                                                <div>
                                                    <img
                                                        src={slipPreview}
                                                        alt="Slip Preview"
                                                        style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }}
                                                    />
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                                                        คลิกเพื่อเปลี่ยนรูป
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{
                                                        width: '48px',
                                                        height: '64px',
                                                        margin: '0 auto 0.75rem',
                                                        background: 'linear-gradient(180deg, var(--color-primary) 0%, #d4a106 100%)',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        boxShadow: '0 2px 8px rgba(234, 179, 8, 0.3)'
                                                    }}>
                                                        <FiFileText style={{ fontSize: '1.5rem', color: 'white' }} />
                                                    </div>
                                                    <div style={{ color: 'var(--color-text)', fontWeight: '500', marginBottom: '0.25rem' }}>คลิกเพื่อเลือกไฟล์สลิป</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                        รองรับ JPG, PNG, WEBP (ไม่เกิน 5MB)
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            id="slip-file-input"
                                            type="file"
                                            accept="image/jpeg,image/jpg,image/png,image/webp"
                                            onChange={handleSlipFileChange}
                                            style={{ display: 'none' }}
                                        />
                                    </div>

                                    {/* Info */}
                                    <div style={{
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        color: 'var(--color-text-muted)'
                                    }}>
                                        <FiInfo style={{ marginRight: '0.5rem' }} />
                                        หลังจากส่งคำขอ Admin จะตรวจสอบและอนุมัติเครดิตให้ภายใน 5-10 นาที
                                    </div>
                                </>
                            )}

                            {/* Topup History */}
                            {topupHistory.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                                        ประวัติการเติมเครดิตล่าสุด
                                    </div>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                        {topupHistory.slice(0, 5).map(item => (
                                            <div key={item.id} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                padding: '0.5rem',
                                                borderBottom: '1px solid var(--color-border)',
                                                fontSize: '0.85rem'
                                            }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>
                                                    {new Date(item.created_at).toLocaleDateString('th-TH')}
                                                </span>
                                                <span style={{
                                                    color: item.status === 'approved' ? 'var(--color-success)' :
                                                        item.status === 'rejected' ? 'var(--color-danger)' :
                                                            'var(--color-warning)',
                                                    fontWeight: 'bold'
                                                }}>
                                                    +{item.amount?.toLocaleString()} ฿
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => { setShowTopupModal(false); setSlipPreview(null); setTopupForm({ amount: '', slip_file: null }); }}
                            >
                                ยกเลิก
                            </button>
                            {assignedBankAccount && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleTopupSubmit}
                                    disabled={topupLoading || !topupForm.amount || !topupForm.slip_file}
                                >
                                    {topupLoading ? 'กำลังตรวจสอบ...' : <><FiCheck /> ยืนยันเติมเครดิต</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Member Modal */}
            {showAddMemberModal && (
                <div className="modal-overlay" onClick={() => { setShowAddMemberModal(false); setNewMemberCredentials(null); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3><FiPlus /> เพิ่มสมาชิกใหม่</h3>
                            <button className="modal-close" onClick={() => { setShowAddMemberModal(false); setNewMemberCredentials(null); }}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            {newMemberCredentials ? (
                                <div className="credentials-result">
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '1rem',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: '1rem'
                                    }}>
                                        <FiCheck style={{ fontSize: '2rem', color: 'var(--color-success)' }} />
                                        <h4 style={{ margin: '0.5rem 0', color: 'var(--color-success)' }}>สร้างสมาชิกสำเร็จ!</h4>
                                    </div>

                                    <div style={{
                                        background: 'var(--color-surface-light)',
                                        padding: '1rem',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: '1rem'
                                    }}>
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <label style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>ชื่อ</label>
                                            <div style={{ fontWeight: 600 }}>{newMemberCredentials.full_name || '-'}</div>
                                        </div>
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <label style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>อีเมล</label>
                                            <div style={{ fontWeight: 600 }}>{newMemberCredentials.email}</div>
                                        </div>
                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <label style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>รหัสผ่าน</label>
                                            <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{newMemberCredentials.password}</div>
                                        </div>
                                        <div>
                                            <label style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>ลิงก์เข้าสู่ระบบ</label>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{newMemberCredentials.url}</div>
                                        </div>
                                    </div>

                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%' }}
                                        onClick={() => {
                                            const text = `🎰 ข้อมูลเข้าสู่ระบบ\n\n👤 ชื่อ: ${newMemberCredentials.full_name || '-'}\n📧 อีเมล: ${newMemberCredentials.email}\n🔑 รหัสผ่าน: ${newMemberCredentials.password}\n🔗 ลิงก์: ${newMemberCredentials.url}\n\n⚠️ กรุณาเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ`
                                            navigator.clipboard.writeText(text).then(() => {
                                                toast.success('คัดลอกข้อมูลแล้ว!')
                                            })
                                        }}
                                    >
                                        <FiCopy /> คัดลอกข้อมูลทั้งหมด
                                    </button>

                                    <p style={{
                                        marginTop: '1rem',
                                        fontSize: '0.85rem',
                                        color: 'var(--color-warning)',
                                        textAlign: 'center'
                                    }}>
                                        ⚠️ แนะนำให้สมาชิกเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ
                                    </p>
                                </div>
                            ) : (
                                <div className="add-member-form">
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">อีเมล *</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="example@email.com"
                                            value={addMemberForm.email}
                                            onChange={e => setAddMemberForm({ ...addMemberForm, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">ชื่อ-นามสกุล</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="ชื่อ นามสกุล"
                                            value={addMemberForm.full_name}
                                            onChange={e => setAddMemberForm({ ...addMemberForm, full_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">เบอร์โทรศัพท์</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="0812345678"
                                            value={addMemberForm.phone}
                                            onChange={e => setAddMemberForm({ ...addMemberForm, phone: e.target.value })}
                                        />
                                    </div>

                                    {isPerUserYearly() && (
                                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                                            <label className="form-label">จำนวนปีที่ใช้งาน</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                min="1"
                                                max="10"
                                                value={addMemberForm.membership_years}
                                                onChange={e => setAddMemberForm({ ...addMemberForm, membership_years: parseInt(e.target.value) || 1 })}
                                            />
                                            <small style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                                ค่าใช้จ่าย: ฿{((getPricePerUserPerYear() * (parseInt(addMemberForm.membership_years) || 1))).toLocaleString()} ({parseInt(addMemberForm.membership_years) || 1} ปี x ฿{getPricePerUserPerYear().toLocaleString()}/ปี)
                                            </small>
                                        </div>
                                    )}

                                    <div style={{
                                        padding: '0.75rem',
                                        background: 'rgba(212, 175, 55, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)',
                                        fontSize: '0.85rem'
                                    }}>
                                        <strong>หมายเหตุ:</strong> สมาชิกใหม่จะได้รับรหัสผ่านเริ่มต้น <strong>123456</strong> และสามารถเปลี่ยนได้ภายหลัง
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            {newMemberCredentials ? (
                                <button className="btn btn-secondary" onClick={() => { setShowAddMemberModal(false); setNewMemberCredentials(null); }}>
                                    ปิด
                                </button>
                            ) : (
                                <>
                                    <button className="btn btn-secondary" onClick={() => setShowAddMemberModal(false)}>
                                        ยกเลิก
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleAddMember}
                                        disabled={addingMember}
                                    >
                                        {addingMember ? 'กำลังสร้าง...' : <><FiPlus /> สร้างสมาชิก</>}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Modal */}
            {showSummaryModal && selectedRound && (
                <SummaryModal
                    round={selectedRound}
                    onClose={() => setShowSummaryModal(false)}
                />
            )}

            {/* QR Code Modal */}
            {showQRModal && (
                <div className="modal-overlay" onClick={() => setShowQRModal(false)} style={{ zIndex: 9999 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3><FiShare2 /> QR Code ของฉัน</h3>
                            <button className="modal-close" onClick={() => setShowQRModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                            <div style={{
                                background: '#fff',
                                padding: '1.5rem',
                                borderRadius: '12px',
                                display: 'inline-block',
                                marginBottom: '1.5rem'
                            }}>
                                <QRCode
                                    value={`${window.location.origin}/register?ref=${user?.id}`}
                                    size={200}
                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                />
                            </div>
                            <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                ส่ง QR Code หรือลิงก์นี้ให้สมาชิกเพื่อเข้ากลุ่มของคุณ
                            </p>
                            <div style={{
                                background: 'var(--color-surface-alt)',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                wordBreak: 'break-all',
                                marginBottom: '1rem',
                                border: '1px solid var(--color-border)'
                            }}>
                                {`${window.location.origin}/register?ref=${user?.id}`}
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user?.id}`)
                                    toast.success('คัดลอกลิงก์แล้ว!')
                                }}
                                style={{ width: '100%' }}
                            >
                                <FiCopy /> คัดลอกลิงก์
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Scanner Modal */}
            {showScannerModal && (
                <QRScannerModal
                    onClose={() => setShowScannerModal(false)}
                    onScanSuccess={(result) => {
                        setShowScannerModal(false)
                        if (result.includes('/register?ref=') || result.includes('/dealer-connect?ref=')) {
                            window.location.href = result
                        } else {
                            toast.error('QR Code ไม่ถูกต้อง')
                        }
                    }}
                />
            )}

            {/* Renew Membership Modal */}
            {showRenewModal && renewMember && (
                <div className="modal-overlay" onClick={() => setShowRenewModal(false)} style={{ zIndex: 9999 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3><FiRefreshCw /> ต่ออายุสมาชิก</h3>
                            <button className="modal-close" onClick={() => setShowRenewModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{
                                padding: '1rem',
                                background: 'var(--color-surface-light)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1rem'
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                                    {renewMember.full_name || renewMember.email}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                    {renewMember.email}
                                </div>
                                {renewMember.membership_expires_at && (
                                    <div style={{
                                        marginTop: '0.5rem',
                                        fontSize: '0.85rem',
                                        color: new Date(renewMember.membership_expires_at) < new Date() ? 'var(--color-error)' : 'var(--color-text-muted)'
                                    }}>
                                        {new Date(renewMember.membership_expires_at) < new Date()
                                            ? `หมดอายุแล้ว: ${new Date(renewMember.membership_expires_at).toLocaleDateString('th-TH')}`
                                            : `หมดอายุ: ${new Date(renewMember.membership_expires_at).toLocaleDateString('th-TH')}`
                                        }
                                    </div>
                                )}
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label">จำนวนปีที่ต่ออายุ</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max="10"
                                    value={renewYears}
                                    onChange={e => setRenewYears(parseInt(e.target.value) || 1)}
                                />
                            </div>

                            <div style={{
                                padding: '0.75rem',
                                background: 'rgba(212, 175, 55, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(212, 175, 55, 0.3)',
                                fontSize: '0.9rem',
                                textAlign: 'center'
                            }}>
                                ค่าใช้จ่าย: <strong style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>
                                    ฿{(getPricePerUserPerYear() * renewYears).toLocaleString()}
                                </strong>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                    ({renewYears} ปี x ฿{getPricePerUserPerYear().toLocaleString()}/ปี)
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowRenewModal(false)}>
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleRenewMembership}
                                disabled={renewing}
                            >
                                {renewing ? 'กำลังดำเนินการ...' : <><FiRefreshCw /> ต่ออายุ</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Approve Member with Years Modal (per_user_yearly) */}
            {showApproveYearsModal && approveMemberTarget && (
                <div className="modal-overlay" onClick={() => setShowApproveYearsModal(false)} style={{ zIndex: 9999 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3><FiCheck /> อนุมัติสมาชิก</h3>
                            <button className="modal-close" onClick={() => setShowApproveYearsModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{
                                padding: '1rem',
                                background: 'var(--color-surface-light)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '1rem'
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                                    {approveMemberTarget.full_name || approveMemberTarget.email}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                    {approveMemberTarget.email}
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label">จำนวนปีที่ใช้งาน</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max="10"
                                    value={approveYears}
                                    onChange={e => setApproveYears(parseInt(e.target.value) || 1)}
                                />
                            </div>

                            <div style={{
                                padding: '0.75rem',
                                background: 'rgba(212, 175, 55, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(212, 175, 55, 0.3)',
                                fontSize: '0.9rem',
                                textAlign: 'center'
                            }}>
                                ค่าใช้จ่าย: <strong style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>
                                    ฿{(getPricePerUserPerYear() * approveYears).toLocaleString()}
                                </strong>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                    ({approveYears} ปี x ฿{getPricePerUserPerYear().toLocaleString()}/ปี)
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowApproveYearsModal(false)}>
                                ยกเลิก
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleApproveWithYears}
                                disabled={approving}
                            >
                                {approving ? 'กำลังดำเนินการ...' : <><FiCheck /> อนุมัติ</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
