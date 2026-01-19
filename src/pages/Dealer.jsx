import { useState, useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
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
    FiSearch,
    FiSlash,
    FiInfo
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

// RoundAccordionItem is now imported from separate file

export default function Dealer() {
    const { user, profile, isDealer, isSuperAdmin } = useAuth()
    const { toast } = useToast()
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
    const [upstreamDealers, setUpstreamDealers] = useState([])
    const [loadingUpstream, setLoadingUpstream] = useState(false)
    const [downstreamDealers, setDownstreamDealers] = useState([]) // Dealers who send bets TO us
    const [memberTypeFilter, setMemberTypeFilter] = useState('all') // 'all' | 'member' | 'dealer'

    // Read tab from URL params
    useEffect(() => {
        const tabParam = searchParams.get('tab')
        if (tabParam === 'profile') {
            setActiveTab('profile')
        } else if (tabParam === 'upstreamDealers') {
            setActiveTab('upstreamDealers')
        }
    }, [searchParams])

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

    // Fetch data on mount only (not on every profile change)
    useEffect(() => {
        // Wait for profile to be loaded before deciding
        if (!profile?.id) return
        
        if (user?.id && (isDealer || isSuperAdmin)) {
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

            // Fetch downstream dealers (dealers who send bets TO us)
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

                if (!downstreamError && downstreamData) {
                    // Transform to match member structure
                    const transformedDownstream = downstreamData.map(d => ({
                        id: d.dealer_profile?.id,
                        email: d.dealer_profile?.email,
                        full_name: d.dealer_profile?.full_name || d.upstream_name,
                        phone: d.dealer_profile?.phone,
                        created_at: d.dealer_profile?.created_at,
                        membership_id: d.id,
                        membership_status: d.is_blocked ? 'blocked' : 'active',
                        membership_created_at: d.created_at,
                        is_dealer: true,
                        is_linked: d.is_linked,
                        lottery_settings: d.lottery_settings,
                        connection_id: d.id
                    }))
                    setDownstreamDealers(transformedDownstream)
                }
            } catch (downstreamErr) {
                console.log('Downstream dealers fetch error:', downstreamErr)
                setDownstreamDealers([])
            }

        } catch (error) {
            console.error('Error:', error)
        } finally {
            clearTimeout(timeoutId)
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

    // Block/Unblock downstream dealer (dealer who sends bets to us)
    async function handleBlockDownstreamDealer(dealer) {
        const newBlockedState = dealer.membership_status !== 'blocked'
        if (newBlockedState && !confirm(`ต้องการบล็อค "${dealer.full_name || dealer.email}" หรือไม่?\nเจ้ามือนี้จะไม่สามารถตีเลขมาให้คุณได้`)) return

        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({ 
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
            toast.error('เกิดข้อผิดพลาดในการอัปเดตบัญชีธนาคาร')
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
            toast.success('แก้ไขงวดสำเร็จ!')

        } catch (error) {
            console.error('Error updating round:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
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
                                                allMembers={members}
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
                                                toast.success('คัดลอกลิงก์แล้ว!')
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

                            {/* Member Type Filter */}
                            <div className="member-type-filter" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    className={`btn btn-sm ${memberTypeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMemberTypeFilter('all')}
                                >
                                    ทั้งหมด ({members.length + downstreamDealers.filter(d => d.membership_status === 'active').length})
                                </button>
                                <button
                                    className={`btn btn-sm ${memberTypeFilter === 'member' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMemberTypeFilter('member')}
                                >
                                    <FiUser /> สมาชิกทั่วไป ({members.length})
                                </button>
                                <button
                                    className={`btn btn-sm ${memberTypeFilter === 'dealer' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setMemberTypeFilter('dealer')}
                                >
                                    <FiSend /> เจ้ามือตีเข้า ({downstreamDealers.filter(d => d.membership_status === 'active').length})
                                </button>
                            </div>

                            {/* Members List - Accordion Style */}
                            <div className="section-header">
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

                            {(() => {
                                const activeDownstreamDealers = downstreamDealers.filter(d => d.membership_status === 'active')
                                const filteredMembers = memberTypeFilter === 'all' 
                                    ? [...members.map(m => ({ ...m, is_dealer: false })), ...activeDownstreamDealers]
                                    : memberTypeFilter === 'member' 
                                        ? members.map(m => ({ ...m, is_dealer: false }))
                                        : activeDownstreamDealers
                                
                                if (filteredMembers.length === 0 && pendingMembers.length === 0) {
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
                                                dealerBankAccounts={dealerBankAccounts}
                                                onUpdateBank={(bankAccountId) => handleUpdateMemberBank(member, bankAccountId)}
                                                isDealer={member.is_dealer}
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

                            {/* Limits by Bet Type - Compact Style */}
                            <div className="form-section">
                                <h4>ค่าอั้นตามประเภทเลข ({LOTTERY_TYPES[roundForm.lottery_type]})</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '0.85rem' }}>
                                    อัตราจ่ายจะใช้ตามที่ตั้งค่าให้แต่ละลูกค้า
                                </p>

                                {/* Compact limits display */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {Object.entries(BET_TYPES_BY_LOTTERY[roundForm.lottery_type] || {}).map(([key, config]) => (
                                        <div key={key} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.5rem 0.75rem',
                                            background: 'rgba(212, 175, 55, 0.05)',
                                            borderRadius: 'var(--radius-sm)',
                                            borderBottom: '1px solid var(--color-border)'
                                        }}>
                                            <span style={{ 
                                                minWidth: '70px', 
                                                fontWeight: 500,
                                                fontSize: '0.9rem',
                                                color: 'var(--color-primary)'
                                            }}>
                                                {config.label}
                                                {config.isSet && <span style={{
                                                    background: 'var(--color-primary)',
                                                    color: '#000',
                                                    padding: '0.1rem 0.3rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.65rem',
                                                    marginLeft: '0.25rem'
                                                }}>ชุด</span>}
                                            </span>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>อั้น</span>
                                            <input
                                                type="number"
                                                className="form-input"
                                                style={{ 
                                                    width: '80px', 
                                                    padding: '0.4rem 0.5rem',
                                                    textAlign: 'center',
                                                    fontSize: '0.95rem'
                                                }}
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
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                                {config.isSet ? 'ชุด' : roundForm.currency_name}
                                            </span>
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
    const { user } = useAuth()
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
    const handleSelectUpstreamDealer = (dealer) => {
        setSelectedUpstreamDealer(dealer)
        if (dealer) {
            setTransferForm({
                ...transferForm,
                target_dealer_name: dealer.upstream_name,
                target_dealer_contact: dealer.upstream_contact || ''
            })
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
                                        <p className="form-hint success">
                                            <FiCheck /> เจ้ามือในระบบ - เลขจะถูกส่งไปยังงวดของเจ้ามือนี้โดยอัตโนมัติ
                                        </p>
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
                                                    setSelectedUpstreamDealer(dealer)
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
                                        <p className="form-hint success">
                                            <FiCheck /> เจ้ามือในระบบ - เลขจะถูกส่งไปยังงวดของเจ้ามือนี้โดยอัตโนมัติ
                                        </p>
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
function MemberAccordionItem({ member, formatDate, isExpanded, onToggle, onBlock, dealerBankAccounts = [], onUpdateBank, isDealer = false }) {
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'settings'

    return (
        <div className={`member-accordion-item ${isExpanded ? 'expanded' : ''}`} style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            border: isDealer ? '2px solid var(--color-info)' : '1px solid var(--color-border)',
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
                        background: isDealer ? 'var(--color-info)' : 'var(--color-primary)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold'
                    }}>
                        {isDealer ? <FiSend /> : (member.full_name ? member.full_name.charAt(0).toUpperCase() : <FiUsers />)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="member-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
                                {member.full_name || 'ไม่ระบุชื่อ'}
                            </span>
                            {isDealer && (
                                <span style={{
                                    background: 'var(--color-info)',
                                    color: '#fff',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    เจ้ามือ
                                </span>
                            )}
                        </div>
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

// Upstream Dealer Settings Inline Component - For displaying commission and payout rates inline
function UpstreamDealerSettingsInline({ dealer, isLinked, onSaved }) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('lao')

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
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_run': { commission: 15, payout: 20 },
            '5_run': { commission: 15, payout: 10 }
        },
        hanoi: {
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
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

    const BET_LABELS = {
        thai: {
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวตรง', '3_tod': '3 ตัวโต๊ด', '3_bottom': '3 ตัวล่าง',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        lao: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        stock: { '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง' }
    }

    const SET_PRIZE_LABELS = {
        '4_straight_set': '4 ตัวตรงชุด',
        '4_tod_set': '4 ตัวโต๊ดชุด',
        '3_straight_set': '3 ตัวตรงชุด',
        '3_tod_set': '3 ตัวโต๊ดชุด',
        '2_front_set': '2 ตัวหน้าชุด',
        '2_back_set': '2 ตัวหลังชุด'
    }

    const LOTTERY_TABS = [
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'thai', label: 'หวยไทย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    useEffect(() => {
        fetchSettings()
    }, [dealer.id])

    async function fetchSettings() {
        setLoading(true)
        try {
            if (dealer.lottery_settings) {
                const merged = { ...getDefaultSettings() }
                Object.keys(dealer.lottery_settings).forEach(tab => {
                    if (merged[tab]) {
                        Object.keys(dealer.lottery_settings[tab]).forEach(key => {
                            if (merged[tab][key]) {
                                merged[tab][key] = { ...merged[tab][key], ...dealer.lottery_settings[tab][key] }
                            }
                        })
                    }
                })
                setSettings(merged)
            }
        } catch (error) {
            console.error('Error loading settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({
                    lottery_settings: settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.id)

            if (error) throw error
            toast.success('บันทึกการตั้งค่าสำเร็จ')
            onSaved?.()
        } catch (error) {
            console.error('Error saving settings:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const updateSetting = (tab, key, field, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                [key]: { ...prev[tab][key], [field]: parseFloat(value) || 0 }
            }
        }))
    }

    const updateSetPrize = (tab, prizeKey, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                '4_set': {
                    ...prev[tab]['4_set'],
                    prizes: {
                        ...prev[tab]['4_set'].prizes,
                        [prizeKey]: parseFloat(value) || 0
                    }
                }
            }
        }))
    }

    if (loading) {
        return <div className="loading-state"><div className="spinner"></div></div>
    }

    // For linked dealers, show read-only view
    const readOnly = isLinked

    return (
        <div className="upstream-dealer-settings-inline">
            {readOnly && (
                <div style={{ 
                    background: 'rgba(212, 175, 55, 0.1)', 
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--color-warning)'
                }}>
                    <FiInfo style={{ marginRight: '0.5rem' }} />
                    ค่าคอมและอัตราจ่ายถูกกำหนดโดยเจ้ามือที่รับเลขจากคุณ (แก้ไขไม่ได้)
                </div>
            )}
            {!readOnly && (
                <div style={{ 
                    background: 'rgba(76, 175, 80, 0.1)', 
                    border: '1px solid rgba(76, 175, 80, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--color-success)'
                }}>
                    <FiEdit2 style={{ marginRight: '0.5rem' }} />
                    กรอกค่าคอมและอัตราจ่ายที่เจ้ามือนอกระบบให้คุณ เพื่อใช้คำนวณรายได้
                </div>
            )}

            {/* Lottery Type Tabs */}
            <div className="settings-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {LOTTERY_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 4 ตัวชุด Section for Lao or Hanoi */}
            {(activeTab === 'lao' || activeTab === 'hanoi') && settings[activeTab]?.['4_set'] && (
                <div className="set-settings-section" style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1rem',
                    background: 'rgba(212, 175, 55, 0.05)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(212, 175, 55, 0.2)'
                }}>
                    <h4 style={{ marginBottom: '1rem', color: 'var(--color-primary)', fontSize: '1rem' }}>
                        <FiPackage style={{ marginRight: '0.5rem' }} />
                        4 ตัวชุด
                    </h4>
                    
                    {/* Set Price and Commission */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ราคาชุดละ</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings[activeTab]['4_set'].setPrice || 0}
                                onChange={e => updateSetting(activeTab, '4_set', 'setPrice', e.target.value)}
                                disabled={readOnly}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ค่าคอม (%)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings[activeTab]['4_set'].commission || 0}
                                onChange={e => updateSetting(activeTab, '4_set', 'commission', e.target.value)}
                                disabled={readOnly}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Prize Settings */}
                    <div style={{ fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--color-text)' }}>อัตราจ่ายรางวัล</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        {Object.entries(settings[activeTab]['4_set'].prizes || {}).map(([prizeKey, prizeValue]) => (
                            <div key={prizeKey}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                                    {SET_PRIZE_LABELS[prizeKey] || prizeKey}
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={prizeValue}
                                    onChange={e => updateSetPrize(activeTab, prizeKey, e.target.value)}
                                    disabled={readOnly}
                                    style={{ width: '100%', fontSize: '0.9rem' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Regular Bet Types */}
            <div className="bet-settings-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                gap: '0.75rem' 
            }}>
                {Object.entries(BET_LABELS[activeTab] || {}).filter(([key]) => key !== '4_set').map(([key, label]) => (
                    <div key={key} className="bet-setting-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--color-surface-light)',
                        borderRadius: 'var(--radius-sm)'
                    }}>
                        <span style={{ flex: '1', fontSize: '0.9rem', color: 'var(--color-text)' }}>{label}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>คอม%</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={settings[activeTab]?.[key]?.commission || 0}
                                    onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                    disabled={readOnly}
                                    style={{ width: '60px', textAlign: 'center', fontSize: '0.85rem', padding: '0.3rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>จ่าย</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={settings[activeTab]?.[key]?.payout || 0}
                                    onChange={e => updateSetting(activeTab, key, 'payout', e.target.value)}
                                    disabled={readOnly}
                                    style={{ width: '70px', textAlign: 'center', fontSize: '0.85rem', padding: '0.3rem' }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Save Button - Only for non-linked dealers */}
            {!readOnly && (
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        className="btn btn-primary" 
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึกการตั้งค่า</>}
                    </button>
                </div>
            )}
        </div>
    )
}

// Upstream Dealer Accordion Item Component
function UpstreamDealerAccordionItem({ dealer, isExpanded, onToggle, onEdit, onDelete, onToggleBlock, onSaveSettings }) {
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'settings'
    const isLinked = dealer.is_linked
    const isBlocked = dealer.is_blocked

    return (
        <div className={`upstream-dealer-accordion-item ${isExpanded ? 'expanded' : ''}`} style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            border: isLinked ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            opacity: isBlocked ? 0.7 : 1
        }}>
            {/* Header - Click to toggle */}
            <div
                className="upstream-dealer-accordion-header"
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
                <div className="dealer-info-summary" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="dealer-avatar" style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: isLinked ? 'var(--color-success)' : 'var(--color-warning)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold'
                    }}>
                        {isLinked ? <FiCheck /> : <FiUser />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="dealer-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
                                {dealer.upstream_name || 'ไม่ระบุชื่อ'}
                            </span>
                            {isLinked && (
                                <span style={{
                                    background: 'var(--color-success)',
                                    color: '#fff',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    ในระบบ
                                </span>
                            )}
                            {isBlocked && (
                                <span style={{
                                    background: 'var(--color-danger)',
                                    color: '#fff',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    <FiSlash size={10} /> บล็อก
                                </span>
                            )}
                        </div>
                        <span className="dealer-contact" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            {isLinked && dealer.upstream_profile ? dealer.upstream_profile.email : (dealer.upstream_contact || 'ไม่มีข้อมูลติดต่อ')}
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
                <div className="upstream-dealer-accordion-body" style={{ padding: '1.5rem' }}>
                    {/* Internal Tabs */}
                    <div className="dealer-internal-tabs" style={{
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
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <FiUser /> โปรไฟล์
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
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <FiSettings /> ค่าคอม/อัตราจ่าย
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'info' && (
                        <div className="dealer-info-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div className="info-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '1.5rem'
                            }}>
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ชื่อเจ้ามือ</label>
                                    <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_name || '-'}</div>
                                </div>
                                {isLinked && dealer.upstream_profile && (
                                    <>
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>อีเมล</label>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_profile.email || '-'}</div>
                                        </div>
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>เบอร์โทร</label>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_profile.phone || '-'}</div>
                                        </div>
                                    </>
                                )}
                                {!isLinked && (
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ข้อมูลติดต่อ</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_contact || '-'}</div>
                                    </div>
                                )}
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ประเภท</label>
                                    <div style={{ fontSize: '1.1rem', color: isLinked ? 'var(--color-success)' : 'var(--color-warning)' }}>
                                        {isLinked ? 'เจ้ามือในระบบ' : 'เจ้ามือนอกระบบ'}
                                    </div>
                                </div>
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>สถานะ</label>
                                    <div style={{ fontSize: '1.1rem', color: isBlocked ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                        {isBlocked ? 'ถูกบล็อก' : 'ปกติ'}
                                    </div>
                                </div>
                                {dealer.notes && (
                                    <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>หมายเหตุ</label>
                                        <div style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{dealer.notes}</div>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={(e) => { e.stopPropagation(); onToggleBlock(); }}
                                    style={{ color: isBlocked ? 'var(--color-success)' : 'var(--color-warning)', borderColor: isBlocked ? 'var(--color-success)' : 'var(--color-warning)' }}
                                >
                                    {isBlocked ? <><FiCheck /> ปลดบล็อก</> : <><FiSlash /> บล็อก</>}
                                </button>
                                {!isLinked && (
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    >
                                        <FiEdit2 /> แก้ไข
                                    </button>
                                )}
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                >
                                    <FiTrash2 /> {isLinked ? 'ยกเลิกการเชื่อมต่อ' : 'ลบ'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="dealer-settings-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <UpstreamDealerSettingsInline
                                dealer={dealer}
                                isLinked={isLinked}
                                onSaved={onSaveSettings}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// Upstream Dealers Tab - For managing dealers to transfer bets to
function UpstreamDealersTab({ user, upstreamDealers, setUpstreamDealers, loadingUpstream, setLoadingUpstream }) {
    const [showAddModal, setShowAddModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingDealer, setEditingDealer] = useState(null)
    const [formData, setFormData] = useState({
        upstream_name: '',
        upstream_contact: '',
        notes: ''
    })
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [settingsDealer, setSettingsDealer] = useState(null)
    const [expandedDealerId, setExpandedDealerId] = useState(null)

    // Fetch upstream dealers on mount - only if not already loaded
    useEffect(() => {
        if (upstreamDealers.length === 0 && !loadingUpstream) {
            fetchUpstreamDealers()
        }
    }, [user?.id])

    async function fetchUpstreamDealers() {
        if (!user?.id) {
            setLoadingUpstream(false)
            return
        }
        setLoadingUpstream(true)
        
        // Set a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            console.warn('Fetch upstream dealers timeout')
            setLoadingUpstream(false)
        }, 10000)
        
        try {
            const { data, error } = await supabase
                .from('dealer_upstream_connections')
                .select(`
                    *,
                    upstream_profile:upstream_dealer_id (
                        id, full_name, email, phone
                    )
                `)
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            clearTimeout(timeoutId)
            
            if (!error) {
                setUpstreamDealers(data || [])
            } else {
                // Table might not exist yet
                console.warn('Upstream dealers table may not exist:', error.message)
                setUpstreamDealers([])
            }
        } catch (error) {
            clearTimeout(timeoutId)
            console.error('Error fetching upstream dealers:', error)
            setUpstreamDealers([])
        } finally {
            setLoadingUpstream(false)
        }
    }

    // Open modal for adding new manual dealer
    function handleOpenAddModal() {
        setEditingDealer(null)
        setFormData({ upstream_name: '', upstream_contact: '', notes: '' })
        setShowAddModal(true)
    }

    // Open modal for editing
    function handleEditDealer(dealer) {
        setEditingDealer(dealer)
        setFormData({
            upstream_name: dealer.upstream_name || '',
            upstream_contact: dealer.upstream_contact || '',
            notes: dealer.notes || ''
        })
        setShowAddModal(true)
    }

    // Save (add or update)
    async function handleSave() {
        if (!formData.upstream_name.trim()) {
            toast.warning('กรุณากรอกชื่อเจ้ามือ')
            return
        }

        setSaving(true)
        try {
            if (editingDealer) {
                // Update
                const { error } = await supabase
                    .from('dealer_upstream_connections')
                    .update({
                        upstream_name: formData.upstream_name,
                        upstream_contact: formData.upstream_contact,
                        notes: formData.notes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingDealer.id)

                if (error) throw error
                toast.success('แก้ไขข้อมูลสำเร็จ!')
            } else {
                // Insert new manual dealer
                const { error } = await supabase
                    .from('dealer_upstream_connections')
                    .insert({
                        dealer_id: user.id,
                        upstream_name: formData.upstream_name,
                        upstream_contact: formData.upstream_contact,
                        notes: formData.notes,
                        is_linked: false
                    })

                if (error) throw error
                toast.success('เพิ่มเจ้ามือสำเร็จ!')
            }

            setShowAddModal(false)
            fetchUpstreamDealers()
        } catch (error) {
            console.error('Error saving upstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    // Delete
    async function handleDelete(dealer) {
        if (!confirm(`ต้องการลบ "${dealer.upstream_name}" หรือไม่?`)) return

        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .delete()
                .eq('id', dealer.id)

            if (error) throw error
            toast.success('ลบสำเร็จ!')
            fetchUpstreamDealers()
        } catch (error) {
            console.error('Error deleting upstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Toggle block/unblock
    async function handleToggleBlock(dealer) {
        const newBlockedState = !dealer.is_blocked
        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({ 
                    is_blocked: newBlockedState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.id)

            if (error) throw error
            
            // Update state immediately for instant UI feedback
            setUpstreamDealers(prev => prev.map(d => 
                d.id === dealer.id ? { ...d, is_blocked: newBlockedState } : d
            ))
            
            toast.success(newBlockedState ? 'บล็อกเจ้ามือแล้ว' : 'ยกเลิกการบล็อกแล้ว')
        } catch (error) {
            console.error('Error toggling block:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Open settings modal
    function handleOpenSettings(dealer) {
        setSettingsDealer(dealer)
        setShowSettingsModal(true)
    }

    return (
        <div className="upstream-dealers-section">
            {/* Header */}
            <div className="section-header">
                <h2><FiSend /> เจ้ามือตีออก</h2>
                <button className="btn btn-primary" onClick={handleOpenAddModal}>
                    <FiPlus /> เพิ่มเจ้ามือ
                </button>
            </div>

            <p className="section-description" style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
                จัดการรายชื่อเจ้ามือที่คุณสามารถตีเลขออกไปได้ สามารถเพิ่มเจ้ามือด้วยตนเอง หรือเชื่อมต่อกับเจ้ามือในระบบ
            </p>

            {loadingUpstream ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>กำลังโหลด...</p>
                </div>
            ) : upstreamDealers.length === 0 ? (
                <div className="empty-state card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <FiSend style={{ fontSize: '3rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }} />
                    <h3>ยังไม่มีเจ้ามือตีออก</h3>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
                        เพิ่มเจ้ามือที่คุณต้องการตีเลขออกไป
                    </p>
                    <button className="btn btn-primary" onClick={handleOpenAddModal}>
                        <FiPlus /> เพิ่มเจ้ามือคนแรก
                    </button>
                </div>
            ) : (
                <>
                    {/* Linked Dealers Section */}
                    {upstreamDealers.filter(d => d.is_linked).length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FiCheck style={{ color: 'var(--color-success)' }} /> เจ้ามือในระบบ ({upstreamDealers.filter(d => d.is_linked).length})
                            </h4>
                            <div className="upstream-dealers-accordion-list">
                                {upstreamDealers.filter(d => d.is_linked).map(dealer => (
                                    <UpstreamDealerAccordionItem
                                        key={dealer.id}
                                        dealer={dealer}
                                        isExpanded={expandedDealerId === dealer.id}
                                        onToggle={() => setExpandedDealerId(expandedDealerId === dealer.id ? null : dealer.id)}
                                        onEdit={() => handleEditDealer(dealer)}
                                        onDelete={() => handleDelete(dealer)}
                                        onToggleBlock={() => handleToggleBlock(dealer)}
                                        onSaveSettings={fetchUpstreamDealers}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Manual Dealers Section */}
                    {upstreamDealers.filter(d => !d.is_linked).length > 0 && (
                        <div>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FiUser style={{ color: 'var(--color-text-muted)' }} /> เจ้ามือนอกระบบ ({upstreamDealers.filter(d => !d.is_linked).length})
                            </h4>
                            <div className="upstream-dealers-accordion-list">
                                {upstreamDealers.filter(d => !d.is_linked).map(dealer => (
                                    <UpstreamDealerAccordionItem
                                        key={dealer.id}
                                        dealer={dealer}
                                        isExpanded={expandedDealerId === dealer.id}
                                        onToggle={() => setExpandedDealerId(expandedDealerId === dealer.id ? null : dealer.id)}
                                        onEdit={() => handleEditDealer(dealer)}
                                        onDelete={() => handleDelete(dealer)}
                                        onToggleBlock={() => handleToggleBlock(dealer)}
                                        onSaveSettings={fetchUpstreamDealers}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingDealer ? <><FiEdit2 /> แก้ไขเจ้ามือ</> : <><FiPlus /> เพิ่มเจ้ามือใหม่</>}</h3>
                            <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">ชื่อเจ้ามือ *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น พี่หนึ่ง, เจ้ใหญ่"
                                    value={formData.upstream_name}
                                    onChange={e => setFormData({ ...formData, upstream_name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เบอร์ติดต่อ / Line ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 08x-xxx-xxxx หรือ line_id"
                                    value={formData.upstream_contact}
                                    onChange={e => setFormData({ ...formData, upstream_contact: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">หมายเหตุ</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    placeholder="เช่น รับได้แค่ 2 ตัว, หลัง 5 โมง"
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                ></textarea>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upstream Dealer Settings Modal */}
            {showSettingsModal && settingsDealer && (
                <UpstreamDealerSettings 
                    dealer={settingsDealer} 
                    onClose={() => { setShowSettingsModal(false); setSettingsDealer(null); }}
                    onSaved={fetchUpstreamDealers}
                />
            )}
        </div>
    )
}

// Upstream Dealer Settings Component - For setting commission and payout rates
function UpstreamDealerSettings({ dealer, onClose, onSaved }) {
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('thai')

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
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_run': { commission: 15, payout: 20 },
            '5_run': { commission: 15, payout: 10 }
        },
        hanoi: {
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
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

    const BET_LABELS = {
        thai: {
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_top': '3 ตัวตรง', '3_tod': '3 ตัวโต๊ด', '3_bottom': '3 ตัวล่าง',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        lao: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง', '2_run': '2 ตัวลอย', '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง', '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย', '5_run': '5 ตัวลอย'
        },
        stock: { '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง' }
    }

    const SET_PRIZE_LABELS = {
        '4_straight_set': '4 ตัวตรงชุด',
        '4_tod_set': '4 ตัวโต๊ดชุด',
        '3_straight_set': '3 ตัวตรงชุด',
        '3_tod_set': '3 ตัวโต๊ดชุด',
        '2_front_set': '2 ตัวหน้าชุด',
        '2_back_set': '2 ตัวหลังชุด'
    }

    useEffect(() => {
        fetchSettings()
    }, [dealer.id])

    async function fetchSettings() {
        setLoading(true)
        try {
            if (dealer.lottery_settings) {
                const merged = { ...getDefaultSettings() }
                Object.keys(dealer.lottery_settings).forEach(tab => {
                    if (merged[tab]) {
                        Object.keys(dealer.lottery_settings[tab]).forEach(key => {
                            if (merged[tab][key]) {
                                merged[tab][key] = { ...merged[tab][key], ...dealer.lottery_settings[tab][key] }
                            }
                        })
                    }
                })
                setSettings(merged)
            }
        } catch (error) {
            console.error('Error loading settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({
                    lottery_settings: settings,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.id)

            if (error) throw error
            toast.success('บันทึกการตั้งค่าสำเร็จ')
            onSaved?.()
            onClose()
        } catch (error) {
            console.error('Error saving settings:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const updateSetting = (tab, key, field, value) => {
        setSettings(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                [key]: { ...prev[tab][key], [field]: parseFloat(value) || 0 }
            }
        }))
    }

    const LOTTERY_TABS = [
        { key: 'thai', label: 'หวยไทย' },
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
        { key: 'stock', label: 'หวยหุ้น' }
    ]

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><FiSettings /> ตั้งค่าเจ้ามือ: {dealer.upstream_name}</h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state"><div className="spinner"></div></div>
                    ) : (
                        <div className="settings-form">
                            <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                ตั้งค่าคอมมิชชั่นและอัตราจ่ายสำหรับเลขที่รับจากเจ้ามือนี้
                            </p>
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

                            {/* 4 ตัวชุด Section for Lao or Hanoi */}
                            {(activeTab === 'lao' || activeTab === 'hanoi') && settings[activeTab]?.['4_set'] && (
                                <div className="set-settings-section" style={{ marginBottom: '1.5rem' }}>
                                    <h4 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>
                                        <FiPackage style={{ marginRight: '0.5rem' }} />
                                        4 ตัวชุด
                                    </h4>
                                    
                                    {/* Set Price and Commission Row */}
                                    <div className="set-config-row">
                                        <div className="set-config-item">
                                            <span className="info-label">ราคาชุดละ:</span>
                                            <div className="input-group input-group-wide">
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={settings[activeTab]['4_set'].setPrice || 120}
                                                    onChange={e => {
                                                        const newSettings = { ...settings }
                                                        newSettings[activeTab]['4_set'].setPrice = Number(e.target.value)
                                                        setSettings(newSettings)
                                                    }}
                                                />
                                                <span className="input-suffix">บาท</span>
                                            </div>
                                        </div>
                                        <div className="set-config-item">
                                            <span className="info-label">ค่าคอม:</span>
                                            <div className="input-group input-group-wide">
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={settings[activeTab]['4_set'].commission}
                                                    onChange={e => {
                                                        const newSettings = { ...settings }
                                                        newSettings[activeTab]['4_set'].commission = Number(e.target.value)
                                                        setSettings(newSettings)
                                                    }}
                                                />
                                                <span className="input-suffix">฿/ชุด</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Prize Table */}
                                    <table className="settings-table settings-table-wide">
                                        <thead>
                                            <tr>
                                                <th>ประเภทรางวัล</th>
                                                <th>เงินรางวัล (บาท/ชุด)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(settings[activeTab]['4_set'].prizes || {}).map(([prizeKey, prizeAmount]) => (
                                                <tr key={prizeKey}>
                                                    <td className="type-cell">{SET_PRIZE_LABELS[prizeKey] || prizeKey}</td>
                                                    <td>
                                                        <div className="input-group input-group-wide">
                                                            <input
                                                                type="number"
                                                                className="form-input"
                                                                value={prizeAmount}
                                                                onChange={e => {
                                                                    const newSettings = { ...settings }
                                                                    newSettings[activeTab]['4_set'].prizes[prizeKey] = Number(e.target.value)
                                                                    setSettings(newSettings)
                                                                }}
                                                            />
                                                            <span className="input-suffix">บาท</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Regular Bet Types Table */}
                            <div className="settings-table-wrap">
                                <table className="settings-table settings-table-wide">
                                    <thead>
                                        <tr>
                                            <th>ประเภท</th>
                                            <th>ค่าคอม</th>
                                            <th>อัตราจ่าย</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(settings[activeTab] || {})
                                            .filter(([key]) => key !== '4_set')
                                            .map(([key, value]) => (
                                            <tr key={key}>
                                                <td className="type-cell">{BET_LABELS[activeTab]?.[key] || key}</td>
                                                <td>
                                                    <div className="input-group input-group-wide">
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={value.commission}
                                                            onChange={e => updateSetting(activeTab, key, 'commission', e.target.value)}
                                                        />
                                                        <span className="input-suffix">%</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="input-group input-group-wide">
                                                        <input
                                                            type="number"
                                                            className="form-input"
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
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                        {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                    </button>
                </div>
            </div>
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
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
            '2_center': { commission: 15, payout: 65 },
            '2_run': { commission: 15, payout: 10 },
            '2_bottom': { commission: 15, payout: 65 },
            '3_straight': { commission: 30, payout: 550 },
            '3_tod_single': { commission: 15, payout: 100 },
            '4_run': { commission: 15, payout: 20 },
            '5_run': { commission: 15, payout: 10 }
        },
        hanoi: {
            '4_set': { 
                commission: 25, 
                setPrice: 120,
                isSet: true,
                prizes: {
                    '4_straight_set': 100000,
                    '4_tod_set': 4000,
                    '3_straight_set': 30000,
                    '3_tod_set': 3000,
                    '2_front_set': 1000,
                    '2_back_set': 1000
                }
            },
            'run_top': { commission: 15, payout: 3 },
            'run_bottom': { commission: 15, payout: 4 },
            'pak_top': { commission: 15, payout: 8 },
            'pak_bottom': { commission: 15, payout: 6 },
            '2_top': { commission: 15, payout: 65 },
            '2_front': { commission: 15, payout: 65 },
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
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
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
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
            '2_center': '2 ตัวถ่าง',
            '2_run': '2 ตัวลอย',
            '2_bottom': '2 ตัวล่าง',
            '3_straight': '3 ตัวตรง',
            '3_tod_single': '3 ตัวโต๊ด',
            '4_run': '4 ตัวลอย',
            '5_run': '5 ตัวลอย'
        },
        hanoi: {
            '4_set': '4 ตัวชุด',
            'run_top': 'ลอยบน',
            'run_bottom': 'ลอยล่าง',
            'pak_top': 'ปักบน',
            'pak_bottom': 'ปักล่าง',
            '2_top': '2 ตัวบน',
            '2_front': '2 ตัวหน้า',
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

    const SET_PRIZE_LABELS = {
        '4_straight_set': '4 ตัวตรงชุด',
        '4_tod_set': '4 ตัวโต๊ดชุด',
        '3_straight_set': '3 ตัวตรงชุด',
        '3_tod_set': '3 ตัวโต๊ดชุด',
        '2_front_set': '2 ตัวหน้าชุด',
        '2_back_set': '2 ตัวหลังชุด'
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
                                // Handle 4_set with nested prizes structure
                                if (key === '4_set' && data.lottery_settings[tab][key].prizes) {
                                    merged[tab][key] = {
                                        ...merged[tab][key],
                                        ...data.lottery_settings[tab][key],
                                        prizes: {
                                            ...merged[tab][key].prizes,
                                            ...data.lottery_settings[tab][key].prizes
                                        }
                                    }
                                } else {
                                    merged[tab][key] = { ...merged[tab][key], ...data.lottery_settings[tab][key] }
                                }
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
            toast.success('บันทึกการตั้งค่าสำเร็จ')
            if (!isInline) onClose()
        } catch (error) {
            console.error('Error saving user settings:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
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
        { key: 'lao', label: 'หวยลาว' },
        { key: 'hanoi', label: 'หวยฮานอย' },
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

                        {/* 4 ตัวชุด Section for Lao or Hanoi */}
                        {(activeTab === 'lao' || activeTab === 'hanoi') && settings[activeTab]?.['4_set'] && (
                            <div className="set-settings-section" style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>
                                    <FiPackage style={{ marginRight: '0.5rem' }} />
                                    4 ตัวชุด
                                </h4>
                                
                                {/* Set Price and Commission Row */}
                                <div className="set-config-row">
                                    <div className="set-config-item">
                                        <span className="info-label">ราคาชุดละ:</span>
                                        <div className="input-group input-group-wide">
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={settings[activeTab]['4_set'].setPrice || 120}
                                                onChange={e => {
                                                    const newSettings = { ...settings }
                                                    newSettings[activeTab]['4_set'].setPrice = Number(e.target.value)
                                                    setSettings(newSettings)
                                                }}
                                            />
                                            <span className="input-suffix">บาท</span>
                                        </div>
                                    </div>
                                    <div className="set-config-item">
                                        <span className="info-label">ค่าคอม:</span>
                                        <div className="input-group input-group-wide">
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={settings[activeTab]['4_set'].commission}
                                                onChange={e => {
                                                    const newSettings = { ...settings }
                                                    newSettings[activeTab]['4_set'].commission = Number(e.target.value)
                                                    setSettings(newSettings)
                                                }}
                                            />
                                            <span className="input-suffix">฿/ชุด</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Prize Table */}
                                <table className="settings-table settings-table-wide">
                                    <thead>
                                        <tr>
                                            <th>ประเภทรางวัล</th>
                                            <th>เงินรางวัล (บาท/ชุด)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(settings[activeTab]['4_set'].prizes || {}).map(([prizeKey, prizeAmount]) => (
                                            <tr key={prizeKey}>
                                                <td className="type-cell">{SET_PRIZE_LABELS[prizeKey] || prizeKey}</td>
                                                <td>
                                                    <div className="input-group input-group-wide">
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={prizeAmount}
                                                            onChange={e => {
                                                                const newSettings = { ...settings }
                                                                newSettings[activeTab]['4_set'].prizes[prizeKey] = Number(e.target.value)
                                                                setSettings(newSettings)
                                                            }}
                                                        />
                                                        <span className="input-suffix">บาท</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Regular Bet Types Table */}
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
                                    {Object.entries(settings[activeTab] || {})
                                        .filter(([key]) => key !== '4_set')
                                        .map(([key, value]) => (
                                        <tr key={key}>
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
                                                    <span className="input-suffix">%</span>
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
