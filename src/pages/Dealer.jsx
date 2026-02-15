import { useState, useEffect, useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme, DASHBOARDS } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { processTopup } from '../services/creditService'
import { checkDealerCreditForBet, checkUpstreamDealerCredit, getDealerCreditSummary, updatePendingDeduction } from '../utils/creditCheck'
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
    FiImage
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
    normalizeNumber,
    generateBatchId,
    getDefaultLimitsForType,
    getDefaultSetPricesForType,
    getLotteryTypeKey
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
    const { user, profile, loading: authLoading, isDealer, isSuperAdmin, isAccountSuspended } = useAuth()
    const { toast } = useToast()
    const { setActiveDashboard, getTheme } = useTheme()
    const [searchParams] = useSearchParams()

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
    const [upstreamDealers, setUpstreamDealers] = useState([])
    const [loadingUpstream, setLoadingUpstream] = useState(false)
    const [downstreamDealers, setDownstreamDealers] = useState([]) // Dealers who send bets TO us
    const [memberTypeFilter, setMemberTypeFilter] = useState('all') // 'all' | 'member' | 'dealer'

    // Add member modal states
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)
    const [addMemberForm, setAddMemberForm] = useState({ email: '', full_name: '', phone: '' })
    const [addingMember, setAddingMember] = useState(false)
    const [newMemberCredentials, setNewMemberCredentials] = useState(null) // { email, password, url }

    // QR Code modal state
    const [showQRModal, setShowQRModal] = useState(false)
    const [showScannerModal, setShowScannerModal] = useState(false)
    const [memberSearchQuery, setMemberSearchQuery] = useState('')

    // Credit system states
    const [dealerCredit, setDealerCredit] = useState(null)
    const [creditLoading, setCreditLoading] = useState(false)
    const [creditSummary, setCreditSummary] = useState(null)

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

    // Helper to check if a round is still open (between open_time and close_time)
    const isRoundOpen = (round) => {
        // If status is announced, it's definitely closed
        if (round.status === 'announced') return false
        // Check time-based open status (ignore 'closed' status, use time instead)
        const now = new Date()
        const openTime = new Date(round.open_time)
        const closeTime = new Date(round.close_time)
        return now >= openTime && now <= closeTime
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

            // Fetch subscription (if table exists)
            try {
                const { data: subData, error: subError } = await supabase
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
                    .maybeSingle()

                if (!subError) {
                    setSubscription(subData)
                }
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

            // Fetch downstream dealers (dealers who send bets TO us via dealer_upstream_connections)
            try {
                const { data: downstreamData, error: downstreamError } = await supabase
                    .from('dealer_upstream_connections')
                    .select(`
                        *,
                        dealer_profile:dealer_id (
                            id, full_name, email, phone, created_at
                        )
                    `)
                    .eq('upstream_dealer_id', user.id)
                    .order('created_at', { ascending: false })

                let allDownstreamDealers = []

                if (!downstreamError && downstreamData) {
                    console.log('Raw downstream data:', downstreamData)

                    // Fetch dealer bank accounts for downstream dealers
                    const downstreamDealerIds = downstreamData.map(d => d.dealer_id).filter(Boolean)
                    let downstreamBankMap = {}
                    if (downstreamDealerIds.length > 0) {
                        const { data: downstreamBanks } = await supabase
                            .from('dealer_bank_accounts')
                            .select('*')
                            .in('dealer_id', downstreamDealerIds)
                            .order('is_default', { ascending: false })

                        if (downstreamBanks) {
                            downstreamBanks.forEach(bank => {
                                if (!downstreamBankMap[bank.dealer_id]) {
                                    downstreamBankMap[bank.dealer_id] = []
                                }
                                downstreamBankMap[bank.dealer_id].push(bank)
                            })
                        }
                    }

                    // Also check memberships for assigned_bank_account_id, member_bank_account_id, and real membership id
                    let downstreamMembershipMap = {}
                    if (downstreamDealerIds.length > 0) {
                        const { data: downstreamMemberships } = await supabase
                            .from('user_dealer_memberships')
                            .select('id, user_id, member_bank_account_id, assigned_bank_account_id')
                            .in('user_id', downstreamDealerIds)
                            .eq('dealer_id', user.id)
                            .eq('status', 'active')

                        if (downstreamMemberships) {
                            downstreamMemberships.forEach(m => {
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
                        // Get membership data for this downstream dealer (may not exist for QR-connected dealers)
                        const membershipData = downstreamMembershipMap[d.dealer_id] || {}

                        // Resolve the downstream dealer's bank account that WE see (member_bank)
                        // Priority: my_bank_account_id on connection > member_bank_account_id on membership > default
                        const dealerBanks = downstreamBankMap[d.dealer_id] || []
                        const userBanks = memberBankAccountsMap[d.dealer_id] || []
                        const allBanks = [...dealerBanks, ...userBanks]
                        const memberBankAccountId = d.my_bank_account_id || membershipData.member_bank_account_id
                        const memberBank = memberBankAccountId
                            ? allBanks.find(b => b.id === memberBankAccountId)
                            : (allBanks.find(b => b.is_default) || allBanks[0])

                        // assigned_bank_account_id: OUR bank that the downstream dealer sees
                        // Priority: connection.assigned_bank_account_id > membership.assigned_bank_account_id
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

                // Merge with dealer members from memberships (users who became dealers)
                // Avoid duplicates by checking if already exists in connections
                const existingIds = allDownstreamDealers.map(d => d.id).filter(Boolean)
                const newDealerMembers = dealerMembersTransformed.filter(d => !existingIds.includes(d.id))
                allDownstreamDealers = [...allDownstreamDealers, ...newDealerMembers]

                setDownstreamDealers(allDownstreamDealers)
            } catch (downstreamErr) {
                console.log('Downstream dealers fetch error:', downstreamErr)
                // Still set dealer members even if connections fetch fails
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
                .limit(50)

            if (!error && data) {
                setRoundHistory(data)
            }
        } catch (error) {
            console.error('Error fetching round history:', error)
        } finally {
            setHistoryLoading(false)
        }
    }

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
                const pendingDeduction = creditData.pending_deduction || 0
                const availableCredit = creditData.balance - pendingDeduction
                setDealerCredit({
                    balance: creditData.balance,
                    pendingDeduction: pendingDeduction,
                    availableCredit: availableCredit,
                    is_blocked: creditData.is_blocked,
                    blocked_reason: creditData.blocked_reason,
                    warning_threshold: creditData.warning_threshold,
                    has_sufficient_credit: availableCredit > 0 && !creditData.is_blocked,
                    is_low_credit: availableCredit <= creditData.warning_threshold
                })
            }
            setCreditLoading(false)

            // Step 2: Recalculate pending_deduction in background (slow)
            await updatePendingDeduction(user.id)

            // Step 3: Re-fetch with updated pending_deduction
            const { data: updatedData } = await supabase
                .from('dealer_credits')
                .select('*')
                .eq('dealer_id', user.id)
                .maybeSingle()

            if (updatedData) {
                const pendingDeduction = updatedData.pending_deduction || 0
                const availableCredit = updatedData.balance - pendingDeduction
                setDealerCredit({
                    balance: updatedData.balance,
                    pendingDeduction: pendingDeduction,
                    availableCredit: availableCredit,
                    is_blocked: updatedData.is_blocked,
                    blocked_reason: updatedData.blocked_reason,
                    warning_threshold: updatedData.warning_threshold,
                    has_sufficient_credit: availableCredit > 0 && !updatedData.is_blocked,
                    is_low_credit: availableCredit <= updatedData.warning_threshold
                })
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
                    const { success, error, newBalance } = await processTopup({
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

                    toast.success(`เติมเครดิต ฿${verifiedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} สำเร็จ!`)
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
            toast.error('เกิดข้อผิดพลาดในการอนุมัติสมาชิก')
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

        setAddingMember(true)
        try {
            const defaultPassword = '123456'
            const loginUrl = window.location.origin + '/login'

            // Store current dealer session before creating new user
            const { data: currentSession } = await supabase.auth.getSession()
            const dealerSession = currentSession?.session

            // Create new user with signUp
            const { data: authData, error: authError } = await supabase.auth.signUp({
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

            if (authError) throw authError

            const newUserId = authData.user?.id

            // Immediately restore dealer session FIRST
            // signUp auto-logs in as new user, we need to switch back to dealer
            if (dealerSession) {
                await supabase.auth.setSession({
                    access_token: dealerSession.access_token,
                    refresh_token: dealerSession.refresh_token
                })
            }

            if (newUserId) {
                // Now create membership as dealer (RLS policy: dealer_id = auth.uid())
                const { error: membershipError } = await supabase
                    .from('user_dealer_memberships')
                    .insert({
                        user_id: newUserId,
                        dealer_id: user.id,
                        status: 'active' // Auto-approve since dealer created them
                    })

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

                toast.success('สร้างสมาชิกใหม่สำเร็จ!')
                setAddMemberForm({ email: '', full_name: '', phone: '' })
                fetchData()
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
            toast.success('สร้างงวดสำเร็จ!')

        } catch (error) {
            console.error('Error creating round:', error)
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
                // Finalize credit deduction - try immediate first, then regular
                // Only ONE of these will actually deduct (based on billing_cycle)
                try {
                    // Try immediate billing first (for immediate billing cycle)
                    const { data: immediateBillingResult, error: immediateBillingError } = await supabase
                        .rpc('create_immediate_billing_record', {
                            p_round_id: roundId,
                            p_dealer_id: user.id
                        })

                    if (!immediateBillingError && immediateBillingResult?.success && immediateBillingResult?.amount_deducted > 0) {
                        // Immediate billing succeeded - don't call finalize_round_credit
                        console.log('Immediate billing success:', immediateBillingResult)
                        toast.info(`ตัดเครดิต ฿${immediateBillingResult.amount_deducted.toLocaleString()} สำเร็จ`)
                    } else {
                        // Immediate billing not applicable - try regular finalization
                        const { data: result, error: creditError } = await supabase
                            .rpc('finalize_round_credit', { p_round_id: roundId })

                        if (!creditError && result?.total_deducted > 0) {
                            console.log('Regular finalization success:', result)
                            toast.info(`ตัดเครดิต ฿${result.total_deducted.toLocaleString()} สำเร็จ`)
                        }
                    }
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
            const { data: submissions } = await supabase
                .from('submissions')
                .select('*')
                .eq('round_id', roundId)
                .eq('is_deleted', false)

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
                // Get transfers for this round
                const { data: transfers } = await supabase
                    .from('bet_transfers')
                    .select('*')
                    .eq('round_id', roundId)

                // Calculate dealer summary
                // Note: submissions table uses commission_amount and prize_amount fields
                const totalEntries = submissions?.length || 0
                const totalCommission = submissions?.reduce((sum, s) => sum + (s.commission_amount || 0), 0) || 0
                const totalPayout = submissions?.reduce((sum, s) => sum + (s.prize_amount || 0), 0) || 0

                console.log('History save debug:', {
                    totalEntries,
                    totalAmount,
                    totalCommission,
                    totalPayout,
                    sampleSubmission: submissions?.[0]
                })

                // Calculate upstream transfers
                const transferredAmount = transfers?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0
                const upstreamCommission = transfers?.reduce((sum, t) => sum + (t.commission_earned || 0), 0) || 0
                const upstreamWinnings = transfers?.reduce((sum, t) => sum + (t.winnings || 0), 0) || 0

                // Calculate profit
                // กำไร = (ยอดรับ - ค่าคอม - จ่ายถูก) + (ยอดส่ง - (ค่าคอมที่ได้ + รับถูก))
                const memberProfit = totalAmount - totalCommission - totalPayout
                const upstreamProfit = transferredAmount - upstreamCommission - upstreamWinnings
                const profit = memberProfit + upstreamProfit

                // Save dealer round history
                const { error: historyError } = await supabase
                    .from('round_history')
                    .insert({
                        dealer_id: user.id,
                        round_id: roundId,
                        lottery_type: roundData.lottery_type,
                        round_date: roundData.draw_date || roundData.open_time?.split('T')[0],
                        open_time: roundData.open_time,
                        close_time: roundData.close_time,
                        total_entries: totalEntries,
                        total_amount: totalAmount,
                        total_commission: totalCommission,
                        total_payout: totalPayout,
                        transferred_amount: transferredAmount,
                        upstream_commission: upstreamCommission,
                        upstream_winnings: upstreamWinnings,
                        profit: profit
                    })

                if (historyError) {
                    console.error('Error saving dealer history:', historyError)
                }

                // Save user round history for each user
                const userSubmissions = {}
                submissions?.forEach(s => {
                    if (!userSubmissions[s.user_id]) {
                        userSubmissions[s.user_id] = {
                            entries: 0,
                            amount: 0,
                            commission: 0,
                            winnings: 0
                        }
                    }
                    userSubmissions[s.user_id].entries += 1
                    userSubmissions[s.user_id].amount += s.amount || 0
                    userSubmissions[s.user_id].commission += s.commission_amount || 0
                    userSubmissions[s.user_id].winnings += s.prize_amount || 0
                })

                // Insert user histories
                const userHistories = Object.entries(userSubmissions).map(([userId, data]) => ({
                    user_id: userId,
                    dealer_id: user.id,
                    round_id: roundId,
                    lottery_type: roundData.lottery_type,
                    round_date: roundData.draw_date || roundData.open_time?.split('T')[0],
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

            // Only deduct credit if round is still OPEN (not closed or announced)
            // If round is closed/announced, credit was already deducted when closing
            if (roundStatus === 'open') {
                try {
                    // Try immediate billing first
                    const { data: immediateBillingResult, error: immediateBillingError } = await supabase
                        .rpc('create_immediate_billing_record', {
                            p_round_id: roundId,
                            p_dealer_id: user.id
                        })

                    if (!immediateBillingError && immediateBillingResult?.success && immediateBillingResult?.amount_deducted > 0) {
                        console.log('Immediate billing before delete:', immediateBillingResult)
                        toast.info(`หักค่าธรรมเนียม ฿${immediateBillingResult.amount_deducted.toLocaleString()} ก่อนลบงวด`)
                    } else {
                        // Immediate billing not applicable - try regular finalization
                        const { data: creditResult, error: creditError } = await supabase
                            .rpc('finalize_round_credit', { p_round_id: roundId })

                        if (!creditError && creditResult?.total_deducted > 0) {
                            console.log('Credit finalized before delete:', creditResult)
                            toast.info(`หักค่าธรรมเนียม ฿${creditResult.total_deducted.toLocaleString()} ก่อนลบงวด`)
                        }
                    }
                } catch (billingErr) {
                    console.log('Billing before delete not configured:', billingErr)
                }
            } else {
                console.log('Round already closed/announced, credit already deducted - skipping billing')
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
                                        <div className="history-list">
                                            {roundHistory.map(history => (
                                                <div key={history.id} className={`round-accordion-item ${history.lottery_type}`}>
                                                    <div className="round-accordion-header card" style={{ cursor: 'default' }}>
                                                        <div className="open-round-layout">
                                                            {/* Row 1: Logo, Name */}
                                                            <div className="open-round-header-row">
                                                                <span className={`lottery-badge ${history.lottery_type}`}>
                                                                    {LOTTERY_TYPES[history.lottery_type] || history.lottery_type}
                                                                </span>
                                                                <span className="round-name">{history.lottery_name || LOTTERY_TYPES[history.lottery_type]}</span>
                                                            </div>
                                                            
                                                            {/* Row 2: Date/Time */}
                                                            <div className="open-round-datetime">
                                                                <FiCalendar /> {formatDate(history.open_time || history.round_date)} {formatTime(history.open_time || history.round_date)} - {formatDate(history.close_time || history.round_date)} {formatTime(history.close_time || history.round_date)}
                                                            </div>
                                                            
                                                            {/* Row 3: Summary Stats */}
                                                            <div className="open-round-stats">
                                                                <div className="stats-block incoming">
                                                                    <div className="stats-block-items">
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ยอดรวม</span>
                                                                            <span className="stat-value">฿{history.total_amount?.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">ค่าคอม</span>
                                                                            <span className="stat-value success">-฿{history.total_commission?.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">จ่าย</span>
                                                                            <span className="stat-value danger">-฿{history.total_payout?.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="stat-item">
                                                                            <span className="stat-label">กำไร</span>
                                                                            <span className={`stat-value ${history.profit >= 0 ? 'success' : 'danger'}`}>
                                                                                {history.profit >= 0 ? '+' : ''}฿{history.profit?.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
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
                            const wasOpen = selectedRound.status === 'open' || 
                                (!selectedRound.status && new Date() <= new Date(selectedRound.close_time))
                            if (wasOpen) {
                                try {
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
        </div>
    )
}
