import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import {
    FiShare2,
    FiUsers,
    FiDollarSign,
    FiCheckCircle,
    FiXCircle,
    FiClock,
    FiEdit2,
    FiSettings,
    FiRefreshCw,
    FiSearch,
    FiUpload,
    FiImage,
    FiTrendingUp,
    FiArrowDownRight,
    FiPlus,
    FiAlertCircle,
    FiEye,
    FiCheck,
    FiX
} from 'react-icons/fi'
import './SuperAdminReferralsTab.css'

export default function SuperAdminReferralsTab() {
    const { toast } = useToast()
    const [subTab, setSubTab] = useState('withdrawals') // withdrawals, network, commissions, settings
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Data states
    const [referrals, setReferrals] = useState([])
    const [commissions, setCommissions] = useState([])
    const [withdrawals, setWithdrawals] = useState([])
    const [withdrawalFilter, setWithdrawalFilter] = useState('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Settings states
    const [defaultRate, setDefaultRate] = useState(10)
    const [referralEnabled, setReferralEnabled] = useState(true)
    const [savingSettings, setSavingSettings] = useState(false)

    // Modals
    const [approveModalData, setApproveModalData] = useState(null)
    const [approving, setApproving] = useState(false)
    const [slipFile, setSlipFile] = useState(null)
    const [slipPreview, setSlipPreview] = useState(null)

    const [rejectModalData, setRejectModalData] = useState(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting] = useState(false)

    const [editRateModalData, setEditRateModalData] = useState(null)
    const [customRateInput, setCustomRateInput] = useState('')
    const [savingRate, setSavingRate] = useState(false)

    const [showAddReferralModal, setShowAddReferralModal] = useState(false)
    const [addForm, setAddForm] = useState({
        referrer_ref: '',
        dealer_id: '',
        commission_rate: ''
    })
    const [allDealers, setAllDealers] = useState([])
    const [addingReferral, setAddingReferral] = useState(false)

    const [viewSlipUrl, setViewSlipUrl] = useState(null)

    const fetchAllData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        try {
            // 1. Fetch system settings
            const { data: settingsData } = await supabase
                .from('system_settings')
                .select('key, value')
                .in('key', ['default_dealer_referral_rate', 'dealer_referral_enabled'])

            if (settingsData) {
                const rateItem = settingsData.find(s => s.key === 'default_dealer_referral_rate')
                const enabledItem = settingsData.find(s => s.key === 'dealer_referral_enabled')
                if (rateItem?.value) setDefaultRate(parseFloat(rateItem.value))
                if (enabledItem?.value) setReferralEnabled(enabledItem.value === 'true')
            }

            // 2. Fetch referrals network
            const { data: refData, error: refErr } = await supabase
                .from('dealer_referrals')
                .select(`
                    id,
                    referrer_id,
                    referred_dealer_id,
                    commission_rate,
                    status,
                    notes,
                    created_at,
                    referrer:referrer_id (
                        id,
                        full_name,
                        member_code,
                        role,
                        email,
                        phone
                    ),
                    referred_dealer:referred_dealer_id (
                        id,
                        full_name,
                        member_code,
                        email,
                        phone
                    )
                `)
                .order('created_at', { ascending: false })

            if (refErr) console.error('Error fetching referrals:', refErr)

            // 3. Fetch commissions history
            const { data: commData, error: commErr } = await supabase
                .from('dealer_referral_commissions')
                .select(`
                    id,
                    round_id,
                    lottery_type,
                    system_revenue,
                    commission_rate,
                    commission_amount,
                    status,
                    created_at,
                    referrer:referrer_id (
                        full_name,
                        member_code
                    ),
                    referred_dealer:referred_dealer_id (
                        full_name,
                        member_code
                    ),
                    round:round_id (
                        round_date
                    )
                `)
                .order('created_at', { ascending: false })

            if (commErr) console.error('Error fetching commissions:', commErr)

            // 4. Fetch withdrawals
            const { data: withData, error: withErr } = await supabase
                .from('referral_withdrawals')
                .select(`
                    *,
                    user:user_id (
                        full_name,
                        member_code,
                        role,
                        phone
                    )
                `)
                .order('created_at', { ascending: false })

            if (withErr) console.error('Error fetching withdrawals:', withErr)

            // 5. Fetch all dealers for manual binding
            const { data: dealersData } = await supabase
                .from('profiles')
                .select('id, full_name, member_code, email')
                .eq('role', 'dealer')
                .order('full_name', { ascending: true })

            setAllDealers(dealersData || [])

            // Map total earnings to referrals
            const commByRef = {}
            ;(commData || []).forEach(c => {
                const key = `${c.referrer?.member_code}_${c.referred_dealer?.member_code}`
                commByRef[key] = (commByRef[key] || 0) + parseFloat(c.commission_amount || 0)
            })

            const mappedRefs = (refData || []).map(r => {
                const key = `${r.referrer?.member_code}_${r.referred_dealer?.member_code}`
                return {
                    ...r,
                    totalCommission: commByRef[key] || 0
                }
            })

            setReferrals(mappedRefs)
            setCommissions(commData || [])
            setWithdrawals(withData || [])
        } catch (err) {
            console.error('Error fetching admin referral data:', err)
            toast?.error?.('เกิดข้อผิดพลาดในการโหลดข้อมูลระบบแนะนำ')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [toast])

    useEffect(() => {
        fetchAllData()
    }, [fetchAllData])

    // KPI Calculations
    const totalCommissionDistributed = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0)
    const totalSystemRevenueFromReferred = commissions.reduce((sum, c) => sum + parseFloat(c.system_revenue || 0), 0)
    const totalWithdrawn = withdrawals
        .filter(w => w.status === 'approved' && w.withdrawal_type === 'cash')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
    const pendingWithdrawalsCount = withdrawals.filter(w => w.status === 'pending').length
    const pendingWithdrawalsAmount = withdrawals
        .filter(w => w.status === 'pending')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)

    // Save System Settings
    const handleSaveSettings = async (e) => {
        e.preventDefault()
        setSavingSettings(true)
        try {
            await supabase
                .from('system_settings')
                .upsert([
                    {
                        key: 'default_dealer_referral_rate',
                        value: defaultRate.toString(),
                        description: 'อัตราค่าคอมมิชชั่นแนะนำเจ้ามือเริ่มต้น (%)'
                    },
                    {
                        key: 'dealer_referral_enabled',
                        value: referralEnabled ? 'true' : 'false',
                        description: 'เปิดใช้งานระบบแนะนำเจ้ามือ (true/false)'
                    }
                ], { onConflict: 'key' })

            toast?.success?.('บันทึกการตั้งค่าระบบแนะนำเรียบร้อยแล้ว')
        } catch (err) {
            console.error('Error saving settings:', err)
            toast?.error?.('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า')
        } finally {
            setSavingSettings(false)
        }
    }

    // Approve withdrawal
    const handleApproveWithdrawal = async () => {
        if (!approveModalData) return
        setApproving(true)
        try {
            let uploadedSlipUrl = null
            if (slipFile) {
                const fileExt = slipFile.name.split('.').pop()
                const fileName = `withdrawals/${approveModalData.id}_${Date.now()}.${fileExt}`
                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('slips')
                    .upload(fileName, slipFile)

                if (!uploadErr && uploadData) {
                    const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName)
                    uploadedSlipUrl = urlData?.publicUrl
                }
            }

            const { data, error } = await supabase.rpc('approve_referral_withdrawal', {
                p_withdrawal_id: approveModalData.id,
                p_slip_url: uploadedSlipUrl
            })

            if (error || (data && !data.success)) {
                throw new Error(error?.message || data?.message || 'เกิดข้อผิดพลาดในการอนุมัติ')
            }

            toast?.success?.('อนุมัติการถอนเงินเรียบร้อยแล้ว')
            setApproveModalData(null)
            setSlipFile(null)
            setSlipPreview(null)
            fetchAllData(true)
        } catch (err) {
            console.error('Approve error:', err)
            toast?.error?.(err.message || 'เกิดข้อผิดพลาดในการอนุมัติ')
        } finally {
            setApproving(false)
        }
    }

    // Reject withdrawal
    const handleRejectWithdrawal = async () => {
        if (!rejectModalData) return
        if (!rejectReason.trim()) {
            toast?.error?.('กรุณาระบุเหตุผลในการปฏิเสธคำขอ')
            return
        }

        setRejecting(true)
        try {
            const { data, error } = await supabase.rpc('reject_referral_withdrawal', {
                p_withdrawal_id: rejectModalData.id,
                p_reason: rejectReason.trim()
            })

            if (error || (data && !data.success)) {
                throw new Error(error?.message || data?.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ')
            }

            toast?.success?.('ปฏิเสธคำขอและคืนเงินเข้ากระเป๋าผู้ใช้เรียบร้อยแล้ว')
            setRejectModalData(null)
            setRejectReason('')
            fetchAllData(true)
        } catch (err) {
            console.error('Reject error:', err)
            toast?.error?.(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ')
        } finally {
            setRejecting(false)
        }
    }

    // Update Custom Rate for a specific referral
    const handleSaveCustomRate = async () => {
        if (!editRateModalData) return
        const rateVal = customRateInput === '' ? null : parseFloat(customRateInput)
        if (customRateInput !== '' && (isNaN(rateVal) || rateVal < 0 || rateVal > 100)) {
            toast?.error?.('กรุณาระบุอัตราเปอร์เซ็นต์ระหว่าง 0 - 100% หรือเว้นว่างเพื่อใช้ค่ากลาง')
            return
        }

        setSavingRate(true)
        try {
            const { error } = await supabase
                .from('dealer_referrals')
                .update({ commission_rate: rateVal, updated_at: new Date().toISOString() })
                .eq('id', editRateModalData.id)

            if (error) throw error

            toast?.success?.('อัปเดตอัตราค่าคอมมิชชั่นเรียบร้อยแล้ว')
            setEditRateModalData(null)
            fetchAllData(true)
        } catch (err) {
            console.error('Error updating rate:', err)
            toast?.error?.('เกิดข้อผิดพลาดในการอัปเดต')
        } finally {
            setSavingRate(false)
        }
    }

    // Toggle referral status
    const handleToggleReferralStatus = async (ref) => {
        const newStatus = ref.status === 'active' ? 'suspended' : 'active'
        try {
            const { error } = await supabase
                .from('dealer_referrals')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', ref.id)

            if (error) throw error
            toast?.success?.(`เปลี่ยนสถานะเป็น ${newStatus === 'active' ? 'กำลังใช้งาน' : 'ระงับชั่วคราว'} แล้ว`)
            fetchAllData(true)
        } catch (err) {
            console.error('Error toggling status:', err)
            toast?.error?.('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ')
        }
    }

    // Add new manual referral
    const handleAddReferralSubmit = async (e) => {
        e.preventDefault()
        if (!addForm.referrer_ref.trim() || !addForm.dealer_id) {
            toast?.error?.('กรุณาระบุรหัสผู้แนะนำและเลือกเจ้ามือ')
            return
        }

        setAddingReferral(true)
        try {
            const { data, error } = await supabase.rpc('bind_dealer_referral', {
                p_referred_dealer_id: addForm.dealer_id,
                p_referrer_ref: addForm.referrer_ref.trim()
            })

            if (error || (data && !data.success)) {
                throw new Error(error?.message || data?.message || 'ไม่สามารถผูกคู่สายได้')
            }

            // If custom rate was provided, update it
            if (addForm.commission_rate !== '') {
                const rateNum = parseFloat(addForm.commission_rate)
                if (!isNaN(rateNum) && data.referral_id) {
                    await supabase
                        .from('dealer_referrals')
                        .update({ commission_rate: rateNum })
                        .eq('id', data.referral_id)
                }
            }

            toast?.success?.('ผูกคู่สายการแนะนำสำเร็จเรียบร้อยแล้ว')
            setShowAddReferralModal(false)
            setAddForm({ referrer_ref: '', dealer_id: '', commission_rate: '' })
            fetchAllData(true)
        } catch (err) {
            console.error('Error adding referral:', err)
            toast?.error?.(err.message || 'เกิดข้อผิดพลาดในการผูกคู่สาย')
        } finally {
            setAddingReferral(false)
        }
    }

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    // Filter withdrawals
    const filteredWithdrawals = withdrawals.filter(w => {
        if (withdrawalFilter === 'all') return true
        return w.status === withdrawalFilter
    })

    // Filter referrals
    const filteredReferrals = referrals.filter(r => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        const rName = r.referrer?.full_name?.toLowerCase() || ''
        const rCode = r.referrer?.member_code?.toLowerCase() || ''
        const dName = r.referred_dealer?.full_name?.toLowerCase() || ''
        const dCode = r.referred_dealer?.member_code?.toLowerCase() || ''
        return rName.includes(q) || rCode.includes(q) || dName.includes(q) || dCode.includes(q)
    })

    if (loading) {
        return (
            <div className="admin-referral-loading">
                <div className="spinner"></div>
                <p>กำลังโหลดข้อมูลระบบแนะนำเจ้ามือ...</p>
            </div>
        )
    }

    return (
        <div className="admin-referral-container">
            {/* Top Bar with Refresh */}
            <div className="admin-referral-topbar">
                <div>
                    <h2 className="admin-section-heading">
                        <FiShare2 className="text-primary" /> ระบบแนะนำเจ้ามือ (Dealer Referral / Affiliate)
                    </h2>
                    <p className="admin-section-subheading">
                        จัดการเครือข่ายแนะนำเจ้ามือ อนุมัติคำขอถอนเงิน และตรวจสอบค่าคอมมิชชั่น
                    </p>
                </div>
                <div className="admin-topbar-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => fetchAllData(true)}
                        disabled={refreshing}
                    >
                        <FiRefreshCw className={refreshing ? 'spinning' : ''} /> {refreshing ? 'กำลังโหลด...' : 'รีเฟรช'}
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowAddReferralModal(true)}
                    >
                        <FiPlus /> ผูกคู่สายใหม่
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="admin-referral-kpi-grid">
                <div className="admin-kpi-card highlight-card">
                    <div className="kpi-icon warning">
                        <FiClock />
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">คำขอถอนเงินรอดำเนินการ</span>
                        <h3 className="kpi-value text-warning">
                            {pendingWithdrawalsCount} <span className="unit">รายการ</span>
                        </h3>
                        <span className="kpi-subtext">รวม ฿{pendingWithdrawalsAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="kpi-icon success">
                        <FiTrendingUp />
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">ค่าคอมมิชชั่นที่จ่ายไปแล้วทั้งหมด</span>
                        <h3 className="kpi-value text-success">
                            ฿{totalCommissionDistributed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </h3>
                        <span className="kpi-subtext">จาก {commissions.length} งวดที่ตัดแบ่ง</span>
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="kpi-icon primary">
                        <FiDollarSign />
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">รายได้ระบบจากเจ้ามือที่มีผู้แนะนำ</span>
                        <h3 className="kpi-value">
                            ฿{totalSystemRevenueFromReferred.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </h3>
                        <span className="kpi-subtext">โอนเงินสดแล้ว ฿{totalWithdrawn.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="kpi-icon info">
                        <FiUsers />
                    </div>
                    <div className="kpi-info">
                        <span className="kpi-label">เจ้ามือในระบบแนะนำ</span>
                        <h3 className="kpi-value">{referrals.length} <span className="unit">ราย</span></h3>
                        <span className="kpi-subtext">กำลังใช้งาน {referrals.filter(r => r.status === 'active').length} ราย</span>
                    </div>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="admin-referral-nav">
                <button
                    className={`nav-tab-btn ${subTab === 'withdrawals' ? 'active' : ''}`}
                    onClick={() => setSubTab('withdrawals')}
                >
                    <FiArrowDownRight /> คำขอถอนเงิน
                    {pendingWithdrawalsCount > 0 && (
                        <span className="nav-tab-badge">{pendingWithdrawalsCount}</span>
                    )}
                </button>
                <button
                    className={`nav-tab-btn ${subTab === 'network' ? 'active' : ''}`}
                    onClick={() => setSubTab('network')}
                >
                    <FiUsers /> จัดการคู่สายแนะนำ ({referrals.length})
                </button>
                <button
                    className={`nav-tab-btn ${subTab === 'commissions' ? 'active' : ''}`}
                    onClick={() => setSubTab('commissions')}
                >
                    <FiDollarSign /> ประวัติการตัดแบ่งค่าคอม ({commissions.length})
                </button>
                <button
                    className={`nav-tab-btn ${subTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setSubTab('settings')}
                >
                    <FiSettings /> ตั้งค่าระบบแนะนำ
                </button>
            </div>

            {/* Tab 1: Withdrawals */}
            {subTab === 'withdrawals' && (
                <div className="admin-card-section">
                    <div className="section-toolbar">
                        <div className="filter-pill-group">
                            <button
                                className={`pill-btn ${withdrawalFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setWithdrawalFilter('all')}
                            >
                                ทั้งหมด ({withdrawals.length})
                            </button>
                            <button
                                className={`pill-btn ${withdrawalFilter === 'pending' ? 'active' : ''}`}
                                onClick={() => setWithdrawalFilter('pending')}
                            >
                                รอดำเนินการ ({withdrawals.filter(w => w.status === 'pending').length})
                            </button>
                            <button
                                className={`pill-btn ${withdrawalFilter === 'approved' ? 'active' : ''}`}
                                onClick={() => setWithdrawalFilter('approved')}
                            >
                                อนุมัติแล้ว ({withdrawals.filter(w => w.status === 'approved').length})
                            </button>
                            <button
                                className={`pill-btn ${withdrawalFilter === 'rejected' ? 'active' : ''}`}
                                onClick={() => setWithdrawalFilter('rejected')}
                            >
                                ปฏิเสธ ({withdrawals.filter(w => w.status === 'rejected').length})
                            </button>
                        </div>
                    </div>

                    {filteredWithdrawals.length === 0 ? (
                        <div className="admin-empty-box">
                            <FiClock className="empty-icon" />
                            <p>ไม่มีรายการคำขอถอนเงินในหมวดนี้</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="admin-ref-table">
                                <thead>
                                    <tr>
                                        <th>วันที่ยื่นคำขอ</th>
                                        <th>ผู้ขอถอน</th>
                                        <th>ประเภท</th>
                                        <th>บัญชีธนาคารปลายทาง</th>
                                        <th className="text-right">จำนวนเงิน</th>
                                        <th className="text-center">สถานะ</th>
                                        <th className="text-center">การจัดการ / สลิป</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredWithdrawals.map(w => {
                                        const u = w.user || {}
                                        return (
                                            <tr key={w.id}>
                                                <td className="time-cell">{formatDateTime(w.created_at)}</td>
                                                <td>
                                                    <div className="user-info-col">
                                                        <strong>{u.full_name || 'ผู้ใช้'}</strong>
                                                        <span className="user-sub">
                                                            {u.role === 'dealer' ? '👑 เจ้ามือ' : '👤 สมาชิก'} (รหัส: {u.member_code || '-'})
                                                        </span>
                                                        {u.phone && <span className="user-sub">📞 {u.phone}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    {w.withdrawal_type === 'convert_dealer_credit' ? (
                                                        <span className="badge badge-convert">แปลงเป็นเครดิต</span>
                                                    ) : (
                                                        <span className="badge badge-cash">ถอนเงินสด</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {w.withdrawal_type === 'convert_dealer_credit' ? (
                                                        <span>เข้าเครดิตร้านตัวเอง</span>
                                                    ) : (
                                                        <div className="bank-info-col">
                                                            <strong>{w.bank_name}</strong>
                                                            <span className="bank-acc">{w.account_number}</span>
                                                            <span className="bank-name-sub">ชื่อ: {w.account_name}</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    <strong className="amount-text">
                                                        ฿{parseFloat(w.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                    </strong>
                                                </td>
                                                <td className="text-center">
                                                    <span className={`status-pill ${w.status}`}>
                                                        {w.status === 'pending' && 'รอดำเนินการ'}
                                                        {w.status === 'approved' && 'อนุมัติแล้ว'}
                                                        {w.status === 'rejected' && 'ปฏิเสธ (คืนเงิน)'}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    {w.status === 'pending' ? (
                                                        <div className="action-button-group">
                                                            <button
                                                                className="btn btn-success btn-xs"
                                                                onClick={() => {
                                                                    setApproveModalData(w)
                                                                    setSlipFile(null)
                                                                    setSlipPreview(null)
                                                                }}
                                                            >
                                                                <FiCheck /> อนุมัติ & แนบสลิป
                                                            </button>
                                                            <button
                                                                className="btn btn-danger btn-xs"
                                                                onClick={() => {
                                                                    setRejectModalData(w)
                                                                    setRejectReason('')
                                                                }}
                                                            >
                                                                <FiX /> ปฏิเสธ
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="view-details-col">
                                                            {w.slip_url && (
                                                                <button
                                                                    className="btn btn-outline-primary btn-xs"
                                                                    onClick={() => setViewSlipUrl(w.slip_url)}
                                                                >
                                                                    <FiImage /> ดูสลิป
                                                                </button>
                                                            )}
                                                            {w.rejected_reason && (
                                                                <span className="reject-note" title={w.rejected_reason}>
                                                                    เหตุผล: {w.rejected_reason}
                                                                </span>
                                                            )}
                                                            {!w.slip_url && !w.rejected_reason && '-'}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Referral Network */}
            {subTab === 'network' && (
                <div className="admin-card-section">
                    <div className="section-toolbar">
                        <div className="search-box-wrapper">
                            <FiSearch className="search-icon" />
                            <input
                                type="text"
                                className="form-input search-input"
                                placeholder="ค้นหาชื่อผู้แนะนำ, รหัสสมาชิก, หรือชื่อเจ้ามือ..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {filteredReferrals.length === 0 ? (
                        <div className="admin-empty-box">
                            <FiUsers className="empty-icon" />
                            <p>ไม่พบรายการคู่สายการแนะนำ</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="admin-ref-table">
                                <thead>
                                    <tr>
                                        <th>ผู้แนะนำ (Referrer)</th>
                                        <th>เจ้ามือที่ถูกแนะนำ (Referred Dealer)</th>
                                        <th>วันที่ผูกสาย</th>
                                        <th className="text-center">% คอมมิชชั่น</th>
                                        <th className="text-right">รายได้สะสมที่สร้างได้</th>
                                        <th className="text-center">สถานะ</th>
                                        <th className="text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredReferrals.map(ref => {
                                        const r = ref.referrer || {}
                                        const d = ref.referred_dealer || {}
                                        const isCustomRate = ref.commission_rate !== null
                                        const currentRate = isCustomRate ? ref.commission_rate : defaultRate
                                        return (
                                            <tr key={ref.id}>
                                                <td>
                                                    <div className="user-info-col">
                                                        <strong>{r.full_name || 'ผู้แนะนำ'}</strong>
                                                        <span className="user-sub">
                                                            {r.role === 'dealer' ? '👑 เจ้ามือ' : '👤 สมาชิก'} (รหัส: {r.member_code || '-'})
                                                        </span>
                                                        {r.email && <span className="user-sub">{r.email}</span>}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="user-info-col">
                                                        <strong>{d.full_name || 'เจ้ามือ'}</strong>
                                                        <span className="user-sub">รหัสร้าน: {d.member_code || '-'}</span>
                                                        {d.email && <span className="user-sub">{d.email}</span>}
                                                    </div>
                                                </td>
                                                <td className="time-cell">{formatDate(ref.created_at)}</td>
                                                <td className="text-center">
                                                    <div className="rate-display-cell">
                                                        <span className={`rate-badge ${isCustomRate ? 'custom' : ''}`}>
                                                            {currentRate}%
                                                        </span>
                                                        {isCustomRate ? (
                                                            <span className="rate-hint">(เฉพาะราย)</span>
                                                        ) : (
                                                            <span className="rate-hint">(ค่ากลาง)</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="text-right">
                                                    <strong className="earned-text">
                                                        ฿{ref.totalCommission.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                    </strong>
                                                </td>
                                                <td className="text-center">
                                                    <span className={`status-pill ${ref.status}`}>
                                                        {ref.status === 'active' ? 'กำลังใช้งาน' : 'ระงับชั่วคราว'}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    <div className="action-button-group">
                                                        <button
                                                            className="btn btn-outline-primary btn-xs"
                                                            title="แก้ไข % ค่าคอมมิชชั่น"
                                                            onClick={() => {
                                                                setEditRateModalData(ref)
                                                                setCustomRateInput(ref.commission_rate !== null ? ref.commission_rate.toString() : '')
                                                            }}
                                                        >
                                                            <FiEdit2 /> แก้ไข %
                                                        </button>
                                                        <button
                                                            className={`btn ${ref.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'} btn-xs`}
                                                            onClick={() => handleToggleReferralStatus(ref)}
                                                        >
                                                            {ref.status === 'active' ? 'ระงับ' : 'เปิดใช้งาน'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 3: Commissions Audit Log */}
            {subTab === 'commissions' && (
                <div className="admin-card-section">
                    <div className="section-toolbar">
                        <p className="toolbar-desc">บันทึกประวัติการตัดจ่ายค่าคอมมิชชั่นทุกงวดที่ระบบตัดจากเครดิตเจ้ามือ</p>
                    </div>

                    {commissions.length === 0 ? (
                        <div className="admin-empty-box">
                            <FiDollarSign className="empty-icon" />
                            <p>ยังไม่มีประวัติการตัดจ่ายค่าคอมมิชชั่นในระบบ</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="admin-ref-table">
                                <thead>
                                    <tr>
                                        <th>วันที่/เวลา</th>
                                        <th>ผู้ได้รับค่าคอม (Referrer)</th>
                                        <th>เจ้ามือต้นทาง (Referred Dealer)</th>
                                        <th>งวดหวย / ประเภท</th>
                                        <th className="text-right">ค่าบริการระบบ</th>
                                        <th className="text-center">% คอม</th>
                                        <th className="text-right">ยอดเงินค่าคอมที่จ่าย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commissions.map(c => {
                                        const r = c.referrer || {}
                                        const d = c.referred_dealer || {}
                                        const typeNameMap = {
                                            thai: 'หวยไทย', lao: 'หวยลาว', hanoi: 'หวยฮานอย',
                                            stock: 'หวยหุ้น', yeekee: 'หวยยี่กี'
                                        }
                                        const ltype = typeNameMap[c.lottery_type] || c.lottery_type?.toUpperCase() || '-'
                                        const roundDateStr = c.round?.round_date ? formatDate(c.round.round_date) : '-'
                                        return (
                                            <tr key={c.id}>
                                                <td className="time-cell">{formatDateTime(c.created_at)}</td>
                                                <td>
                                                    <strong>{r.full_name || 'ผู้แนะนำ'}</strong>
                                                    <span className="user-sub">รหัส: {r.member_code || '-'}</span>
                                                </td>
                                                <td>
                                                    <strong>{d.full_name || 'เจ้ามือ'}</strong>
                                                    <span className="user-sub">รหัส: {d.member_code || '-'}</span>
                                                </td>
                                                <td>
                                                    <span className="badge badge-cash">{ltype}</span>
                                                    <span className="user-sub">งวด {roundDateStr}</span>
                                                </td>
                                                <td className="text-right fee-cell">
                                                    ฿{parseFloat(c.system_revenue || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="text-center">
                                                    <span className="rate-badge">{c.commission_rate}%</span>
                                                </td>
                                                <td className="text-right">
                                                    <strong className="profit-plus">
                                                        +฿{parseFloat(c.commission_amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                    </strong>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 4: System Settings */}
            {subTab === 'settings' && (
                <div className="admin-card-section">
                    <form onSubmit={handleSaveSettings} className="admin-settings-form">
                        <div className="form-row-card">
                            <div className="form-row-info">
                                <h4>เปิดใช้งานระบบแนะนำเจ้ามือ</h4>
                                <p>หากปิด ระบบจะไม่แบ่งค่าคอมมิชชั่นเมื่อมีการตัดเครดิตในแต่ละงวดหวย</p>
                            </div>
                            <div className="form-row-control">
                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        checked={referralEnabled}
                                        onChange={(e) => setReferralEnabled(e.target.checked)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>

                        <div className="form-row-card">
                            <div className="form-row-info">
                                <h4>อัตราค่าคอมมิชชั่นเริ่มต้น (Global Default Rate %)</h4>
                                <p>เปอร์เซ็นต์ค่าคอมมิชชั่นที่ผู้แนะนำจะได้รับจากค่าบริการของระบบ (สามารถปรับแยกรายบุคคลได้ในแท็บคู่สาย)</p>
                            </div>
                            <div className="form-row-control rate-control">
                                <div className="input-group">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        className="form-input text-right"
                                        style={{ width: '120px' }}
                                        value={defaultRate}
                                        onChange={(e) => setDefaultRate(parseFloat(e.target.value) || 0)}
                                        required
                                    />
                                    <span className="input-addon">%</span>
                                </div>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={savingSettings}
                            >
                                {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal: Approve Withdrawal & Upload Slip */}
            {approveModalData && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog admin-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3><FiCheckCircle className="text-success" /> อนุมัติการถอนเงิน</h3>
                            <button className="modal-close-btn" onClick={() => setApproveModalData(null)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="withdrawal-detail-box">
                                <div className="detail-row">
                                    <span>ผู้ขอถอน:</span>
                                    <strong>{approveModalData.user?.full_name} (รหัส {approveModalData.user?.member_code})</strong>
                                </div>
                                <div className="detail-row">
                                    <span>จำนวนเงินที่ต้องโอน:</span>
                                    <strong className="amount-highlight">
                                        ฿{parseFloat(approveModalData.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                    </strong>
                                </div>
                                <div className="detail-row">
                                    <span>ธนาคารปลายทาง:</span>
                                    <strong>{approveModalData.bank_name}</strong>
                                </div>
                                <div className="detail-row">
                                    <span>เลขที่บัญชี:</span>
                                    <strong>{approveModalData.account_number}</strong>
                                </div>
                                <div className="detail-row">
                                    <span>ชื่อบัญชี:</span>
                                    <strong>{approveModalData.account_name}</strong>
                                </div>
                            </div>

                            <div className="form-group mt-3">
                                <label className="form-label">แนบสลิปการโอนเงิน (ไม่บังคับ):</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="form-input"
                                    onChange={(e) => {
                                        const file = e.target.files[0]
                                        if (file) {
                                            setSlipFile(file)
                                            const reader = new FileReader()
                                            reader.onloadend = () => setSlipPreview(reader.result)
                                            reader.readAsDataURL(file)
                                        }
                                    }}
                                />
                                {slipPreview && (
                                    <div className="slip-preview-container">
                                        <img src={slipPreview} alt="Slip Preview" className="slip-img-thumb" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setApproveModalData(null)}
                                disabled={approving}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={handleApproveWithdrawal}
                                disabled={approving}
                            >
                                {approving ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติและโอนเงินแล้ว'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Reject Withdrawal */}
            {rejectModalData && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog admin-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3><FiXCircle className="text-danger" /> ปฏิเสธคำขอถอนเงิน</h3>
                            <button className="modal-close-btn" onClick={() => setRejectModalData(null)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="alert-warning-box">
                                <FiAlertCircle />
                                <span>เมื่อปฏิเสธคำขอ ยอดเงิน <strong>฿{parseFloat(rejectModalData.amount || 0).toLocaleString()}</strong> จะถูกโอนคืนกลับเข้า Referral Wallet ของผู้ใช้ทันที</span>
                            </div>

                            <div className="form-group mt-3">
                                <label className="form-label">ระบุเหตุผลในการปฏิเสธ *</label>
                                <textarea
                                    className="form-input"
                                    rows="3"
                                    placeholder="เช่น เลขที่บัญชีไม่ถูกต้อง หรือชื่อบัญชีไม่ตรงกับชื่อผู้สมัคร..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setRejectModalData(null)}
                                disabled={rejecting}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleRejectWithdrawal}
                                disabled={rejecting || !rejectReason.trim()}
                            >
                                {rejecting ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธและคืนเงิน'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Edit Custom Rate */}
            {editRateModalData && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog admin-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3><FiEdit2 /> แก้ไข % ค่าคอมมิชชั่นเฉพาะราย</h3>
                            <button className="modal-close-btn" onClick={() => setEditRateModalData(null)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="relationship-summary-box">
                                <div>ผู้แนะนำ: <strong>{editRateModalData.referrer?.full_name} ({editRateModalData.referrer?.member_code})</strong></div>
                                <div>เจ้ามือ: <strong>{editRateModalData.referred_dealer?.full_name} ({editRateModalData.referred_dealer?.member_code})</strong></div>
                            </div>

                            <div className="form-group mt-3">
                                <label className="form-label">อัตราคอมมิชชั่น (%) สำหรับคู่สายนี้:</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    className="form-input"
                                    placeholder={`เว้นว่างไว้เพื่อใช้อัตราค่ากลาง (${defaultRate}%)`}
                                    value={customRateInput}
                                    onChange={(e) => setCustomRateInput(e.target.value)}
                                />
                                <small className="form-text-muted">
                                    ใส่ตัวเลขเฉพาะราย (เช่น 15) หรือปล่อยว่างเพื่อใช้อัตรากลางของระบบ ({defaultRate}%)
                                </small>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setEditRateModalData(null)}
                                disabled={savingRate}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSaveCustomRate}
                                disabled={savingRate}
                            >
                                {savingRate ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Manual Add Referral Binding */}
            {showAddReferralModal && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog admin-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3><FiPlus /> ผูกคู่สายการแนะนำเจ้ามือใหม่</h3>
                            <button className="modal-close-btn" onClick={() => setShowAddReferralModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleAddReferralSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">รหัสผู้แนะนำ (Member Code หรือ UUID) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 10048 (รหัสสมาชิก 5 หลัก)"
                                    value={addForm.referrer_ref}
                                    onChange={(e) => setAddForm({ ...addForm, referrer_ref: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เลือกเจ้ามือที่ถูกแนะนำ *</label>
                                <select
                                    className="form-input"
                                    value={addForm.dealer_id}
                                    onChange={(e) => setAddForm({ ...addForm, dealer_id: e.target.value })}
                                    required
                                >
                                    <option value="">-- เลือกเจ้ามือ --</option>
                                    {allDealers.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.full_name} ({d.member_code || d.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">อัตราคอมมิชชั่น (%) (ไม่บังคับ):</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    className="form-input"
                                    placeholder={`ค่าว่าง = ใช้อัตรากลาง (${defaultRate}%)`}
                                    value={addForm.commission_rate}
                                    onChange={(e) => setAddForm({ ...addForm, commission_rate: e.target.value })}
                                />
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowAddReferralModal(false)}
                                    disabled={addingReferral}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={addingReferral || !addForm.referrer_ref || !addForm.dealer_id}
                                >
                                    {addingReferral ? 'กำลังบันทึก...' : 'ผูกคู่สาย'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: View Slip */}
            {viewSlipUrl && (
                <div className="modal-overlay animate-fadeIn" onClick={() => setViewSlipUrl(null)}>
                    <div className="modal-dialog slip-view-modal animate-scaleUp" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>สลิปการโอนเงิน</h3>
                            <button className="modal-close-btn" onClick={() => setViewSlipUrl(null)}>×</button>
                        </div>
                        <div className="modal-body text-center">
                            <img src={viewSlipUrl} alt="Transfer Slip" className="slip-img-full" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
