import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import {
    FiHome,
    FiUsers,
    FiPackage,
    FiFileText,
    FiDollarSign,
    FiSettings,
    FiPlus,
    FiEdit2,
    FiTrash2,
    FiCheck,
    FiX,
    FiAlertCircle,
    FiTrendingUp,
    FiTrendingDown,
    FiClock,
    FiRefreshCw,
    FiSearch,
    FiFilter,
    FiEye,
    FiPower,
    FiCalendar,
    FiPercent,
    FiCreditCard,
    FiImage,
    FiSave,
    FiShare2,
    FiCopy
} from 'react-icons/fi'
import QRCode from 'react-qr-code'
import './SuperAdmin.css'

export default function SuperAdmin() {
    const { user, profile, isSuperAdmin, loading } = useAuth()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState('dashboard')

    // Dashboard Stats
    const [stats, setStats] = useState({
        totalDealers: 0,
        activeDealers: 0,
        totalUsers: 0,
        activeSubscriptions: 0,
        pendingPayments: 0,
        thisMonthRevenue: 0,
        lastMonthRevenue: 0,
        expiringSubscriptions: 0
    })

    // Data States
    const [dealers, setDealers] = useState([])
    const [packages, setPackages] = useState([])
    const [invoices, setInvoices] = useState([])
    const [payments, setPayments] = useState([])
    const [settings, setSettings] = useState({})
    const [dealerCredits, setDealerCredits] = useState([])
    const [creditTransactions, setCreditTransactions] = useState([])

    // UI States
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('all')

    // Modal States
    const [showPackageModal, setShowPackageModal] = useState(false)
    const [editingPackage, setEditingPackage] = useState(null)
    const [showDealerModal, setShowDealerModal] = useState(false)
    const [selectedDealer, setSelectedDealer] = useState(null)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedPayment, setSelectedPayment] = useState(null)
    const [showAssignPackageModal, setShowAssignPackageModal] = useState(false)
    const [assignPackageForm, setAssignPackageForm] = useState({
        package_id: '',
        billing_cycle: 'monthly',
        is_trial: false,
        trial_days: 30
    })
    
    // Credit Modal States
    const [showTopupModal, setShowTopupModal] = useState(false)
    const [topupForm, setTopupForm] = useState({ dealer_id: '', amount: '', description: '' })
    const [topupLoading, setTopupLoading] = useState(false)

    // Form States
    const [packageForm, setPackageForm] = useState({
        name: '',
        description: '',
        billing_model: 'package',
        monthly_price: '',
        yearly_price: '',
        percentage_rate: '',
        max_users: '',
        extra_user_price: '',
        features: [],
        is_featured: false,
        is_active: true
    })

    useEffect(() => {
        if (user && isSuperAdmin) {
            fetchAllData()
        }
    }, [user, isSuperAdmin])

    const fetchAllData = async () => {
        setIsLoading(true)
        try {
            await Promise.all([
                fetchStats(),
                fetchDealers(),
                fetchPackages(),
                fetchInvoices(),
                fetchPayments(),
                fetchSettings(),
                fetchDealerCredits()
            ])
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setIsLoading(false)
        }
    }
    
    const fetchDealerCredits = async () => {
        try {
            // Fetch dealer credits with dealer info
            const { data: creditsData, error: creditsError } = await supabase
                .from('dealer_credits')
                .select(`
                    *,
                    dealer:dealer_id (
                        id, full_name, email, phone
                    ),
                    package:package_id (
                        id, name, fee_percentage
                    )
                `)
                .order('updated_at', { ascending: false })
            
            if (!creditsError && creditsData) {
                setDealerCredits(creditsData)
            }
            
            // Fetch recent credit transactions
            const { data: transData, error: transError } = await supabase
                .from('credit_transactions')
                .select(`
                    *,
                    dealer:dealer_id (
                        id, full_name, email
                    ),
                    performer:performed_by (
                        id, full_name, email
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(100)
            
            if (!transError && transData) {
                setCreditTransactions(transData)
            }
        } catch (error) {
            console.log('Credit tables not available yet:', error)
        }
    }
    
    const handleTopupCredit = async () => {
        if (!topupForm.dealer_id || !topupForm.amount) {
            toast.error('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        
        setTopupLoading(true)
        try {
            const amount = parseFloat(topupForm.amount)
            
            // Try RPC first, fallback to direct insert
            let success = false
            try {
                const { data, error } = await supabase.rpc('add_dealer_credit', {
                    p_dealer_id: topupForm.dealer_id,
                    p_amount: amount,
                    p_transaction_type: 'topup',
                    p_reference_type: 'admin_topup',
                    p_performed_by: user.id,
                    p_description: topupForm.description || 'เติมเครดิตโดย Admin'
                })
                if (!error) success = true
            } catch (rpcError) {
                console.log('RPC not available, using direct insert')
            }
            
            // Fallback: Direct database operations
            if (!success) {
                // Get or create dealer credit record
                let { data: creditData } = await supabase
                    .from('dealer_credits')
                    .select('*')
                    .eq('dealer_id', topupForm.dealer_id)
                    .maybeSingle()
                
                let newBalance = amount
                
                if (creditData) {
                    // Update existing record
                    newBalance = (creditData.balance || 0) + amount
                    const { error: updateError } = await supabase
                        .from('dealer_credits')
                        .update({ 
                            balance: newBalance,
                            is_blocked: false,
                            blocked_reason: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('dealer_id', topupForm.dealer_id)
                    
                    if (updateError) throw updateError
                } else {
                    // Insert new record
                    const { error: insertError } = await supabase
                        .from('dealer_credits')
                        .insert({
                            dealer_id: topupForm.dealer_id,
                            balance: amount,
                            warning_threshold: 1000
                        })
                    
                    if (insertError) throw insertError
                }
                
                // Record transaction
                await supabase
                    .from('credit_transactions')
                    .insert({
                        dealer_id: topupForm.dealer_id,
                        transaction_type: 'topup',
                        amount: amount,
                        balance_after: newBalance,
                        reference_type: 'admin_topup',
                        performed_by: user.id,
                        description: topupForm.description || 'เติมเครดิตโดย Admin'
                    })
            }
            
            toast.success(`เติมเครดิต ฿${amount.toLocaleString()} สำเร็จ`)
            setShowTopupModal(false)
            setTopupForm({ dealer_id: '', amount: '', description: '' })
            fetchDealerCredits()
        } catch (error) {
            console.error('Error topping up credit:', error)
            toast.error('เกิดข้อผิดพลาดในการเติมเครดิต: ' + (error.message || 'Unknown error'))
        } finally {
            setTopupLoading(false)
        }
    }

    const fetchStats = async () => {
        try {
            // Total dealers
            const { count: totalDealers } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'dealer')

            // Active dealers
            const { count: activeDealers } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'dealer')
                .eq('is_active', true)

            // Total users
            const { count: totalUsers } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user')

            // Active subscriptions
            const { count: activeSubscriptions } = await supabase
                .from('dealer_subscriptions')
                .select('*', { count: 'exact', head: true })
                .in('status', ['active', 'trial'])

            // Pending payments
            const { count: pendingPayments } = await supabase
                .from('payments')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')

            // This month revenue
            const startOfMonth = new Date()
            startOfMonth.setDate(1)
            startOfMonth.setHours(0, 0, 0, 0)

            const { data: thisMonthPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('status', 'confirmed')
                .gte('created_at', startOfMonth.toISOString())

            const thisMonthRevenue = thisMonthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

            // Last month revenue
            const startOfLastMonth = new Date(startOfMonth)
            startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1)
            const endOfLastMonth = new Date(startOfMonth)
            endOfLastMonth.setMilliseconds(-1)

            const { data: lastMonthPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('status', 'confirmed')
                .gte('created_at', startOfLastMonth.toISOString())
                .lt('created_at', startOfMonth.toISOString())

            const lastMonthRevenue = lastMonthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

            // Expiring subscriptions (within 7 days)
            const sevenDaysLater = new Date()
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)

            const { count: expiringSubscriptions } = await supabase
                .from('dealer_subscriptions')
                .select('*', { count: 'exact', head: true })
                .in('status', ['active', 'trial'])
                .lte('end_date', sevenDaysLater.toISOString().split('T')[0])

            setStats({
                totalDealers: totalDealers || 0,
                activeDealers: activeDealers || 0,
                totalUsers: totalUsers || 0,
                activeSubscriptions: activeSubscriptions || 0,
                pendingPayments: pendingPayments || 0,
                thisMonthRevenue,
                lastMonthRevenue,
                expiringSubscriptions: expiringSubscriptions || 0
            })
        } catch (error) {
            console.error('Error fetching stats:', error)
        }
    }

    const fetchDealers = async () => {
        try {
            // Fetch dealers
            const { data: dealersData, error: dealersError } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'dealer')
                .order('created_at', { ascending: false })

            if (dealersError) throw dealersError

            // Fetch subscriptions separately
            let subscriptionsData = []
            try {
                const { data: subData, error: subError } = await supabase
                    .from('dealer_subscriptions')
                    .select(`
                        *,
                        subscription_packages (
                            id,
                            name,
                            billing_model
                        )
                    `)
                    .order('created_at', { ascending: false })

                if (!subError) {
                    subscriptionsData = subData || []
                }
            } catch (e) {
                console.log('Could not fetch subscriptions:', e)
            }

            // Map subscriptions to dealers
            const dealersWithSubs = (dealersData || []).map(dealer => {
                const dealerSubs = subscriptionsData.filter(sub => sub.dealer_id === dealer.id)
                return {
                    ...dealer,
                    dealer_subscriptions: dealerSubs
                }
            })

            setDealers(dealersWithSubs)
        } catch (error) {
            console.error('Error fetching dealers:', error)
            setDealers([])
        }
    }

    const fetchPackages = async () => {
        try {
            const { data, error } = await supabase
                .from('subscription_packages')
                .select('*')
                .order('sort_order', { ascending: true })

            if (error) throw error
            setPackages(data || [])
        } catch (error) {
            console.error('Error fetching packages:', error)
        }
    }

    const fetchInvoices = async () => {
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select(`
                    *,
                    profiles:dealer_id (
                        full_name,
                        email
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (error) throw error
            setInvoices(data || [])
        } catch (error) {
            console.error('Error fetching invoices:', error)
        }
    }

    const fetchPayments = async () => {
        try {
            const { data, error } = await supabase
                .from('payments')
                .select(`
                    *,
                    profiles:dealer_id (
                        full_name,
                        email
                    ),
                    invoices (
                        invoice_number
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (error) throw error
            setPayments(data || [])
        } catch (error) {
            console.error('Error fetching payments:', error)
        }
    }

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')

            if (error) throw error

            const settingsObj = {}
            data?.forEach(s => {
                settingsObj[s.key] = typeof s.value === 'string' ? JSON.parse(s.value) : s.value
            })
            setSettings(settingsObj)
        } catch (error) {
            console.error('Error fetching settings:', error)
        }
    }

    // === DEALER MANAGEMENT ===
    const toggleDealerStatus = async (dealer, activate) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    is_active: activate,
                    deactivated_at: activate ? null : new Date().toISOString(),
                    deactivated_by: activate ? null : user.id,
                    deactivation_reason: activate ? null : 'Manual deactivation by Super Admin'
                })
                .eq('id', dealer.id)

            if (error) throw error

            // Log activity
            await supabase
                .from('dealer_activity_log')
                .insert({
                    dealer_id: dealer.id,
                    action: activate ? 'manual_activation' : 'manual_deactivation',
                    description: activate ? 'เปิดใช้งานโดย Super Admin' : 'ปิดใช้งานโดย Super Admin',
                    performed_by: user.id
                })

            fetchDealers()
            fetchStats()
        } catch (error) {
            console.error('Error toggling dealer status:', error)
            toast.error('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ')
        }
    }

    // === PACKAGE MANAGEMENT ===
    const openPackageModal = (pkg = null) => {
        if (pkg) {
            setEditingPackage(pkg)
            setPackageForm({
                name: pkg.name || '',
                description: pkg.description || '',
                billing_model: pkg.billing_model || 'package',
                monthly_price: pkg.monthly_price || '',
                yearly_price: pkg.yearly_price || '',
                percentage_rate: pkg.percentage_rate || '',
                max_users: pkg.max_users || '',
                extra_user_price: pkg.extra_user_price || '',
                features: pkg.features || [],
                is_featured: pkg.is_featured || false,
                is_active: pkg.is_active ?? true
            })
        } else {
            setEditingPackage(null)
            setPackageForm({
                name: '',
                description: '',
                billing_model: 'package',
                monthly_price: '',
                yearly_price: '',
                percentage_rate: '',
                max_users: '',
                extra_user_price: '',
                features: [],
                is_featured: false,
                is_active: true
            })
        }
        setShowPackageModal(true)
    }

    const handleSavePackage = async () => {
        try {
            const packageData = {
                name: packageForm.name,
                description: packageForm.description,
                billing_model: packageForm.billing_model,
                monthly_price: parseFloat(packageForm.monthly_price) || 0,
                yearly_price: parseFloat(packageForm.yearly_price) || 0,
                percentage_rate: parseFloat(packageForm.percentage_rate) || 0,
                max_users: parseInt(packageForm.max_users) || 0,
                extra_user_price: parseFloat(packageForm.extra_user_price) || 0,
                features: packageForm.features,
                is_featured: packageForm.is_featured,
                is_active: packageForm.is_active
            }

            if (editingPackage) {
                const { error } = await supabase
                    .from('subscription_packages')
                    .update(packageData)
                    .eq('id', editingPackage.id)

                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('subscription_packages')
                    .insert(packageData)

                if (error) throw error
            }

            setShowPackageModal(false)
            fetchPackages()
        } catch (error) {
            console.error('Error saving package:', error)
            toast.error('เกิดข้อผิดพลาดในการบันทึกแพ็คเกจ')
        }
    }

    const deletePackage = async (pkg) => {
        if (!confirm(`ต้องการลบแพ็คเกจ "${pkg.name}" หรือไม่?`)) return

        try {
            const { error } = await supabase
                .from('subscription_packages')
                .delete()
                .eq('id', pkg.id)

            if (error) throw error
            fetchPackages()
        } catch (error) {
            console.error('Error deleting package:', error)
            toast.error('เกิดข้อผิดพลาดในการลบแพ็คเกจ')
        }
    }

    // === PAYMENT MANAGEMENT ===
    const handlePaymentAction = async (payment, action, reason = '') => {
        try {
            const updateData = {
                status: action,
                confirmed_by: user.id,
                confirmed_at: new Date().toISOString()
            }

            if (action === 'rejected') {
                updateData.rejection_reason = reason
            }

            const { error: paymentError } = await supabase
                .from('payments')
                .update(updateData)
                .eq('id', payment.id)

            if (paymentError) throw paymentError

            // Update invoice status if confirmed
            if (action === 'confirmed') {
                const { error: invoiceError } = await supabase
                    .from('invoices')
                    .update({
                        status: 'paid',
                        paid_date: new Date().toISOString().split('T')[0]
                    })
                    .eq('id', payment.invoice_id)

                if (invoiceError) throw invoiceError

                // Activate subscription
                const { data: invoice } = await supabase
                    .from('invoices')
                    .select('subscription_id')
                    .eq('id', payment.invoice_id)
                    .single()

                if (invoice?.subscription_id) {
                    await supabase
                        .from('dealer_subscriptions')
                        .update({ status: 'active' })
                        .eq('id', invoice.subscription_id)
                }

                // Update dealer profile
                await supabase
                    .from('profiles')
                    .update({
                        subscription_status: 'active',
                        is_active: true
                    })
                    .eq('id', payment.dealer_id)
            }

            // Log activity
            await supabase
                .from('dealer_activity_log')
                .insert({
                    dealer_id: payment.dealer_id,
                    action: action === 'confirmed' ? 'payment_confirmed' : 'payment_rejected',
                    description: action === 'confirmed' ?
                        `ยืนยันการชำระเงิน ฿${payment.amount}` :
                        `ปฏิเสธการชำระเงิน: ${reason}`,
                    performed_by: user.id,
                    metadata: { payment_id: payment.id, amount: payment.amount }
                })

            setShowPaymentModal(false)
            fetchPayments()
            fetchStats()
        } catch (error) {
            console.error('Error handling payment:', error)
            toast.error('เกิดข้อผิดพลาดในการดำเนินการ')
        }
    }

    // === ASSIGN PACKAGE TO DEALER ===
    const handleAssignPackage = async () => {
        if (!selectedDealer || !assignPackageForm.package_id) {
            toast.warning('กรุณาเลือกแพ็คเกจ')
            return
        }

        try {
            const selectedPackage = packages.find(p => p.id === assignPackageForm.package_id)
            if (!selectedPackage) throw new Error('Package not found')

            // Calculate dates
            const startDate = new Date()
            let endDate = new Date()

            if (assignPackageForm.is_trial) {
                endDate.setDate(endDate.getDate() + (assignPackageForm.trial_days || 30))
            } else if (assignPackageForm.billing_cycle === 'yearly') {
                endDate.setFullYear(endDate.getFullYear() + 1)
            } else {
                endDate.setMonth(endDate.getMonth() + 1)
            }

            // Create subscription
            const { error: subError } = await supabase
                .from('dealer_subscriptions')
                .insert({
                    dealer_id: selectedDealer.id,
                    package_id: assignPackageForm.package_id,
                    billing_model: selectedPackage.billing_model,
                    billing_cycle: assignPackageForm.billing_cycle,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                    status: assignPackageForm.is_trial ? 'trial' : 'active',
                    is_trial: assignPackageForm.is_trial,
                    trial_days: assignPackageForm.is_trial ? assignPackageForm.trial_days : null,
                    package_snapshot: selectedPackage // Store package info at time of assignment
                })

            if (subError) throw subError

            // Update dealer profile
            await supabase
                .from('profiles')
                .update({
                    subscription_status: assignPackageForm.is_trial ? 'trial' : 'active',
                    is_active: true
                })
                .eq('id', selectedDealer.id)

            // Log activity
            await supabase
                .from('dealer_activity_log')
                .insert({
                    dealer_id: selectedDealer.id,
                    action: 'package_assigned',
                    description: `กำหนดแพ็คเกจ "${selectedPackage.name}" ${assignPackageForm.is_trial ? '(ทดลองใช้)' : ''}`,
                    performed_by: user.id,
                    metadata: { package_id: selectedPackage.id, package_name: selectedPackage.name }
                })

            setShowAssignPackageModal(false)
            setAssignPackageForm({ package_id: '', billing_cycle: 'monthly', is_trial: false, trial_days: 30 })
            fetchDealers()
            fetchStats()
            toast.success('กำหนดแพ็คเกจสำเร็จ!')
        } catch (error) {
            console.error('Error assigning package:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // === SETTINGS MANAGEMENT ===
    const handleUpdateSetting = async (key, value) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .update({
                    value: JSON.stringify(value),
                    updated_by: user.id
                })
                .eq('key', key)

            if (error) throw error
            fetchSettings()
        } catch (error) {
            console.error('Error updating setting:', error)
            toast.error('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า')
        }
    }

    // === RENDER HELPERS ===
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 0
        }).format(amount)
    }

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    const getStatusBadge = (status) => {
        const badges = {
            active: { label: 'ใช้งาน', class: 'badge-success' },
            trial: { label: 'ทดลอง', class: 'badge-info' },
            pending: { label: 'รอดำเนินการ', class: 'badge-warning' },
            expired: { label: 'หมดอายุ', class: 'badge-danger' },
            suspended: { label: 'ระงับ', class: 'badge-danger' },
            cancelled: { label: 'ยกเลิก', class: 'badge-secondary' },
            inactive: { label: 'ไม่เปิดใช้', class: 'badge-secondary' },
            confirmed: { label: 'ยืนยันแล้ว', class: 'badge-success' },
            rejected: { label: 'ปฏิเสธ', class: 'badge-danger' },
            paid: { label: 'ชำระแล้ว', class: 'badge-success' },
            overdue: { label: 'เกินกำหนด', class: 'badge-danger' },
            draft: { label: 'ร่าง', class: 'badge-secondary' }
        }
        const badge = badges[status] || { label: status, class: 'badge-secondary' }
        return <span className={`status-badge ${badge.class}`}>{badge.label}</span>
    }

    const getBillingModelLabel = (model) => {
        const labels = {
            per_device: 'ต่อเครื่อง + User',
            package: 'แพ็คเกจ',
            percentage: 'เปอร์เซ็นต์'
        }
        return labels[model] || model
    }

    // === FILTER DATA ===
    const filteredDealers = dealers.filter(d => {
        const matchSearch = searchTerm === '' ||
            d.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.email?.toLowerCase().includes(searchTerm.toLowerCase())

        const matchFilter = filterStatus === 'all' ||
            (filterStatus === 'active' && d.is_active) ||
            (filterStatus === 'inactive' && !d.is_active) ||
            (filterStatus === 'trial' && d.subscription_status === 'trial') ||
            (filterStatus === 'expired' && d.subscription_status === 'expired')

        return matchSearch && matchFilter
    })

    // === AUTH CHECK ===
    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>กำลังโหลด...</p>
            </div>
        )
    }

    if (!user || !isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    // === RENDER TABS ===
    const renderDashboard = () => (
        <div className="dashboard-tab">
            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon dealers">
                        <FiUsers />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.totalDealers}</div>
                        <div className="stat-label">เจ้ามือทั้งหมด</div>
                        <div className="stat-sub">
                            <span className="active">{stats.activeDealers} ใช้งาน</span>
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon users">
                        <FiUsers />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.totalUsers}</div>
                        <div className="stat-label">ลูกค้าทั้งหมด</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon subscriptions">
                        <FiPackage />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{stats.activeSubscriptions}</div>
                        <div className="stat-label">Subscription ใช้งาน</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <FiDollarSign />
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{formatCurrency(stats.thisMonthRevenue)}</div>
                        <div className="stat-label">รายได้เดือนนี้</div>
                        <div className="stat-sub">
                            {stats.thisMonthRevenue >= stats.lastMonthRevenue ? (
                                <span className="trend-up">
                                    <FiTrendingUp />
                                    {stats.lastMonthRevenue > 0
                                        ? `+${((stats.thisMonthRevenue / stats.lastMonthRevenue - 1) * 100).toFixed(0)}%`
                                        : 'ใหม่'
                                    }
                                </span>
                            ) : (
                                <span className="trend-down">
                                    <FiTrendingDown />
                                    {((stats.thisMonthRevenue / stats.lastMonthRevenue - 1) * 100).toFixed(0)}%
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Alerts */}
            <div className="alerts-section">
                {stats.pendingPayments > 0 && (
                    <div className="alert alert-warning">
                        <FiAlertCircle />
                        <span>มี <strong>{stats.pendingPayments}</strong> การชำระเงินรอยืนยัน</span>
                        <button onClick={() => setActiveTab('payments')} className="btn btn-sm">
                            ดูรายการ
                        </button>
                    </div>
                )}

                {stats.expiringSubscriptions > 0 && (
                    <div className="alert alert-info">
                        <FiClock />
                        <span>มี <strong>{stats.expiringSubscriptions}</strong> subscription จะหมดอายุใน 7 วัน</span>
                        <button onClick={() => { setFilterStatus('expired'); setActiveTab('dealers') }} className="btn btn-sm">
                            ดูรายการ
                        </button>
                    </div>
                )}
            </div>

            {/* Recent Activity */}
            <div className="recent-section">
                <h3>การชำระเงินล่าสุด</h3>
                <div className="recent-list">
                    {payments.slice(0, 5).map(payment => (
                        <div key={payment.id} className="recent-item">
                            <div className="recent-info">
                                <span className="recent-name">{payment.profiles?.full_name || 'ไม่ทราบชื่อ'}</span>
                                <span className="recent-amount">{formatCurrency(payment.amount)}</span>
                            </div>
                            <div className="recent-meta">
                                <span>{formatDate(payment.created_at)}</span>
                                {getStatusBadge(payment.status)}
                            </div>
                        </div>
                    ))}
                    {payments.length === 0 && (
                        <div className="empty-state">ยังไม่มีการชำระเงิน</div>
                    )}
                </div>
            </div>
        </div>
    )

    const renderDealers = () => (
        <div className="dealers-tab">
            {/* Dealer Invitation Section */}
            <div className="invitation-card">
                <div className="invitation-header">
                    <h3><FiShare2 /> ลิงก์เชิญเจ้ามือใหม่</h3>
                    <p>ส่งลิงก์หรือ QR Code นี้ให้คนที่ต้องการเป็นเจ้ามือในระบบ</p>
                </div>
                <div className="invitation-content">
                    <div className="qr-wrapper">
                        <div className="qr-code-bg">
                            <QRCode
                                value={`${window.location.origin}/register?role=dealer`}
                                size={120}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            />
                        </div>
                    </div>
                    <div className="link-wrapper">
                        <div className="invitation-link">
                            {`${window.location.origin}/register?role=dealer`}
                        </div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                                const link = `${window.location.origin}/register?role=dealer`
                                // Fallback for HTTP (non-HTTPS)
                                const textArea = document.createElement('textarea')
                                textArea.value = link
                                textArea.style.position = 'fixed'
                                textArea.style.left = '-9999px'
                                document.body.appendChild(textArea)
                                textArea.select()
                                try {
                                    document.execCommand('copy')
                                    toast.success('คัดลอกลิงก์แล้ว!')
                                } catch (err) {
                                    // Try modern API as backup
                                    navigator.clipboard?.writeText(link).then(() => {
                                        toast.success('คัดลอกลิงก์แล้ว!')
                                    }).catch(() => {
                                        toast.error('ไม่สามารถคัดลอกได้ กรุณาคัดลอกด้วยตัวเอง')
                                    })
                                }
                                document.body.removeChild(textArea)
                            }}
                        >
                            <FiCopy /> คัดลอก
                        </button>
                    </div>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="toolbar">
                <div className="search-box">
                    <FiSearch />
                    <input
                        type="text"
                        placeholder="ค้นหาเจ้ามือ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-buttons">
                    {[
                        { value: 'all', label: 'ทั้งหมด' },
                        { value: 'active', label: 'ใช้งาน' },
                        { value: 'inactive', label: 'ไม่ใช้งาน' },
                        { value: 'trial', label: 'ทดลอง' },
                        { value: 'expired', label: 'หมดอายุ' }
                    ].map(filter => (
                        <button
                            key={filter.value}
                            className={`filter-btn ${filterStatus === filter.value ? 'active' : ''}`}
                            onClick={() => setFilterStatus(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dealers Table */}
            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>เจ้ามือ</th>
                            <th>แพ็คเกจ</th>
                            <th>สถานะ</th>
                            <th>หมดอายุ</th>
                            <th>จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDealers.map(dealer => {
                            const subscription = dealer.dealer_subscriptions?.[0]
                            return (
                                <tr key={dealer.id} className={!dealer.is_active ? 'inactive' : ''}>
                                    <td>
                                        <div className="dealer-info">
                                            <span className="dealer-name">{dealer.full_name || 'ไม่มีชื่อ'}</span>
                                            <span className="dealer-email">{dealer.email}</span>
                                        </div>
                                    </td>
                                    <td>
                                        {subscription ? (
                                            <>
                                                <div>{subscription.subscription_packages?.name || 'ไม่มีแพ็คเกจ'}</div>
                                                <small className="text-muted">
                                                    {getBillingModelLabel(subscription.billing_model)}
                                                </small>
                                            </>
                                        ) : (
                                            <span className="text-muted">ไม่มี subscription</span>
                                        )}
                                    </td>
                                    <td>
                                        {getStatusBadge(dealer.subscription_status || 'inactive')}
                                        {!dealer.is_active && (
                                            <span className="status-badge badge-danger ml-1">ปิดใช้งาน</span>
                                        )}
                                    </td>
                                    <td>
                                        {subscription?.end_date ? (
                                            <span className={
                                                new Date(subscription.end_date) < new Date() ? 'text-danger' :
                                                    new Date(subscription.end_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'text-warning' :
                                                        ''
                                            }>
                                                {formatDate(subscription.end_date)}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                className="btn btn-icon btn-sm"
                                                title="ดูรายละเอียด"
                                                onClick={() => {
                                                    setSelectedDealer(dealer)
                                                    setShowDealerModal(true)
                                                }}
                                            >
                                                <FiEye />
                                            </button>
                                            <button
                                                className="btn btn-icon btn-sm btn-primary"
                                                title="กำหนดแพ็คเกจ"
                                                onClick={() => {
                                                    setSelectedDealer(dealer)
                                                    setShowAssignPackageModal(true)
                                                }}
                                            >
                                                <FiPackage />
                                            </button>
                                            <button
                                                className={`btn btn-icon btn-sm ${dealer.is_active ? 'btn-danger' : 'btn-success'}`}
                                                title={dealer.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                                                onClick={() => toggleDealerStatus(dealer, !dealer.is_active)}
                                            >
                                                <FiPower />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {filteredDealers.length === 0 && (
                    <div className="empty-state">
                        ไม่พบเจ้ามือ
                    </div>
                )}
            </div>
        </div>
    )

    const renderPackages = () => (
        <div className="packages-tab">
            <div className="toolbar">
                <button className="btn btn-primary" onClick={() => openPackageModal()}>
                    <FiPlus /> เพิ่มแพ็คเกจ
                </button>
            </div>

            <div className="packages-grid">
                {packages.map(pkg => (
                    <div key={pkg.id} className={`package-card ${pkg.is_featured ? 'featured' : ''} ${!pkg.is_active ? 'inactive' : ''}`}>
                        {pkg.is_featured && <div className="featured-badge">แนะนำ</div>}
                        {!pkg.is_active && <div className="inactive-overlay">ปิดใช้งาน</div>}

                        <div className="package-header">
                            <h3>{pkg.name}</h3>
                            <span className="billing-model">{getBillingModelLabel(pkg.billing_model)}</span>
                        </div>

                        <div className="package-pricing">
                            {pkg.billing_model === 'percentage' ? (
                                <div className="price">
                                    <span className="amount">{pkg.percentage_rate}%</span>
                                    <span className="period">ของยอด</span>
                                </div>
                            ) : (
                                <>
                                    <div className="price">
                                        <span className="amount">{formatCurrency(pkg.monthly_price)}</span>
                                        <span className="period">/เดือน</span>
                                    </div>
                                    {pkg.yearly_price > 0 && (
                                        <div className="price yearly">
                                            <span className="amount">{formatCurrency(pkg.yearly_price)}</span>
                                            <span className="period">/ปี</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="package-features">
                            <div className="feature">
                                <FiUsers /> {pkg.max_users === 0 ? 'ไม่จำกัดลูกค้า' : `${pkg.max_users} ลูกค้า`}
                            </div>
                            {pkg.extra_user_price > 0 && (
                                <div className="feature">
                                    <FiDollarSign /> ลูกค้าเพิ่ม {formatCurrency(pkg.extra_user_price)}/คน
                                </div>
                            )}
                        </div>

                        {pkg.description && (
                            <p className="package-description">{pkg.description}</p>
                        )}

                        <div className="package-actions">
                            <button className="btn btn-sm" onClick={() => openPackageModal(pkg)}>
                                <FiEdit2 /> แก้ไข
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePackage(pkg)}>
                                <FiTrash2 /> ลบ
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )

    const renderInvoices = () => (
        <div className="invoices-tab">
            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>เลขที่</th>
                            <th>เจ้ามือ</th>
                            <th>ยอดเงิน</th>
                            <th>ครบกำหนด</th>
                            <th>สถานะ</th>
                            <th>จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map(invoice => (
                            <tr key={invoice.id}>
                                <td><strong>{invoice.invoice_number}</strong></td>
                                <td>
                                    <div>{invoice.profiles?.full_name || 'ไม่ทราบชื่อ'}</div>
                                    <small className="text-muted">{invoice.profiles?.email}</small>
                                </td>
                                <td>{formatCurrency(invoice.total_amount)}</td>
                                <td>
                                    <span className={
                                        invoice.status === 'paid' ? '' :
                                            new Date(invoice.due_date) < new Date() ? 'text-danger' : ''
                                    }>
                                        {formatDate(invoice.due_date)}
                                    </span>
                                </td>
                                <td>{getStatusBadge(invoice.status)}</td>
                                <td>
                                    <button className="btn btn-icon btn-sm" title="ดูรายละเอียด">
                                        <FiEye />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {invoices.length === 0 && (
                    <div className="empty-state">ยังไม่มีใบแจ้งหนี้</div>
                )}
            </div>
        </div>
    )

    const renderPayments = () => (
        <div className="payments-tab">
            <div className="toolbar">
                <div className="filter-buttons">
                    {[
                        { value: 'all', label: 'ทั้งหมด' },
                        { value: 'pending', label: 'รอยืนยัน' },
                        { value: 'confirmed', label: 'ยืนยันแล้ว' },
                        { value: 'rejected', label: 'ปฏิเสธ' }
                    ].map(filter => (
                        <button
                            key={filter.value}
                            className={`filter-btn ${filterStatus === filter.value ? 'active' : ''}`}
                            onClick={() => setFilterStatus(filter.value)}
                        >
                            {filter.label}
                            {filter.value === 'pending' && stats.pendingPayments > 0 && (
                                <span className="badge">{stats.pendingPayments}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>เจ้ามือ</th>
                            <th>ใบแจ้งหนี้</th>
                            <th>ยอดเงิน</th>
                            <th>วิธีชำระ</th>
                            <th>วันที่</th>
                            <th>สถานะ</th>
                            <th>จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payments
                            .filter(p => filterStatus === 'all' || p.status === filterStatus)
                            .map(payment => (
                                <tr key={payment.id}>
                                    <td>
                                        <div>{payment.profiles?.full_name || 'ไม่ทราบชื่อ'}</div>
                                        <small className="text-muted">{payment.profiles?.email}</small>
                                    </td>
                                    <td>{payment.invoices?.invoice_number || '-'}</td>
                                    <td><strong>{formatCurrency(payment.amount)}</strong></td>
                                    <td>{payment.payment_method || '-'}</td>
                                    <td>{formatDate(payment.created_at)}</td>
                                    <td>{getStatusBadge(payment.status)}</td>
                                    <td>
                                        <div className="action-buttons">
                                            {payment.payment_proof_url && (
                                                <button
                                                    className="btn btn-icon btn-sm"
                                                    title="ดูหลักฐาน"
                                                    onClick={() => window.open(payment.payment_proof_url, '_blank')}
                                                >
                                                    <FiImage />
                                                </button>
                                            )}
                                            {payment.status === 'pending' && (
                                                <>
                                                    <button
                                                        className="btn btn-icon btn-sm btn-success"
                                                        title="ยืนยัน"
                                                        onClick={() => handlePaymentAction(payment, 'confirmed')}
                                                    >
                                                        <FiCheck />
                                                    </button>
                                                    <button
                                                        className="btn btn-icon btn-sm btn-danger"
                                                        title="ปฏิเสธ"
                                                        onClick={() => {
                                                            const reason = prompt('เหตุผลในการปฏิเสธ:')
                                                            if (reason) handlePaymentAction(payment, 'rejected', reason)
                                                        }}
                                                    >
                                                        <FiX />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
                {payments.length === 0 && (
                    <div className="empty-state">ยังไม่มีการชำระเงิน</div>
                )}
            </div>
        </div>
    )

    const renderCredits = () => (
        <div className="credits-tab">
            {/* Header Actions */}
            <div className="tab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                        จัดการเครดิตเจ้ามือ - เติมเครดิต, ดูประวัติการทำรายการ
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowTopupModal(true)}>
                    <FiPlus /> เติมเครดิต
                </button>
            </div>

            {/* Dealer Credits List */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <h3><FiCreditCard /> ยอดเครดิตเจ้ามือ</h3>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>เจ้ามือ</th>
                                <th>เครดิตคงเหลือ</th>
                                <th>แพ็คเกจ</th>
                                <th>สถานะ</th>
                                <th>อัพเดทล่าสุด</th>
                                <th>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dealerCredits.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        ยังไม่มีข้อมูลเครดิต
                                    </td>
                                </tr>
                            ) : (
                                dealerCredits.map(credit => (
                                    <tr key={credit.id}>
                                        <td>
                                            <div>
                                                <strong>{credit.dealer?.full_name || 'ไม่ระบุชื่อ'}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                    {credit.dealer?.email}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                fontWeight: 'bold', 
                                                fontSize: '1.1rem',
                                                color: credit.balance <= 0 ? 'var(--color-danger)' : 
                                                       credit.balance <= credit.warning_threshold ? 'var(--color-warning)' : 
                                                       'var(--color-success)'
                                            }}>
                                                ฿{(credit.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td>{credit.package?.name || 'Standard'}</td>
                                        <td>
                                            {credit.is_blocked ? (
                                                <span className="badge badge-danger">บล็อค</span>
                                            ) : credit.balance <= credit.warning_threshold ? (
                                                <span className="badge badge-warning">เครดิตต่ำ</span>
                                            ) : (
                                                <span className="badge badge-success">ปกติ</span>
                                            )}
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                            {new Date(credit.updated_at).toLocaleString('th-TH')}
                                        </td>
                                        <td>
                                            <button 
                                                className="btn btn-sm btn-primary"
                                                onClick={() => {
                                                    setTopupForm({ dealer_id: credit.dealer_id, amount: '', description: '' })
                                                    setShowTopupModal(true)
                                                }}
                                            >
                                                <FiPlus /> เติม
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="card">
                <div className="card-header">
                    <h3><FiFileText /> ประวัติการทำรายการ (ล่าสุด 100 รายการ)</h3>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>วันที่</th>
                                <th>เจ้ามือ</th>
                                <th>ประเภท</th>
                                <th>จำนวน</th>
                                <th>ยอดคงเหลือ</th>
                                <th>รายละเอียด</th>
                                <th>ดำเนินการโดย</th>
                            </tr>
                        </thead>
                        <tbody>
                            {creditTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        ยังไม่มีประวัติการทำรายการ
                                    </td>
                                </tr>
                            ) : (
                                creditTransactions.map(trans => (
                                    <tr key={trans.id}>
                                        <td style={{ fontSize: '0.85rem' }}>
                                            {new Date(trans.created_at).toLocaleString('th-TH')}
                                        </td>
                                        <td>
                                            <div>
                                                <strong>{trans.dealer?.full_name || 'ไม่ระบุ'}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${trans.transaction_type === 'topup' ? 'badge-success' : 'badge-danger'}`}>
                                                {trans.transaction_type === 'topup' ? 'เติมเครดิต' : 
                                                 trans.transaction_type === 'deduction' ? 'หักเครดิต' : 
                                                 trans.transaction_type}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                fontWeight: 'bold',
                                                color: trans.amount >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                                            }}>
                                                {trans.amount >= 0 ? '+' : ''}฿{trans.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td>฿{(trans.balance_after || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                            {trans.description || '-'}
                                        </td>
                                        <td style={{ fontSize: '0.85rem' }}>
                                            {trans.performer?.full_name || 'ระบบ'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )

    const renderSettings = () => (
        <div className="settings-tab">
            <div className="settings-section">
                <h3>ค่าตั้งระบบ</h3>

                <div className="settings-grid">
                    <div className="setting-item">
                        <label>จำนวนวันทดลองใช้งาน (Default)</label>
                        <div className="setting-input">
                            <input
                                type="number"
                                value={settings.default_trial_days || 30}
                                onChange={(e) => setSettings({ ...settings, default_trial_days: parseInt(e.target.value) })}
                            />
                            <span className="unit">วัน</span>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleUpdateSetting('default_trial_days', parseInt(settings.default_trial_days))}
                            >
                                <FiSave />
                            </button>
                        </div>
                    </div>

                    <div className="setting-item">
                        <label>Auto-deactivation หลังหมดอายุ</label>
                        <div className="setting-input">
                            <input
                                type="number"
                                value={settings.auto_deactivation_days || 3}
                                onChange={(e) => setSettings({ ...settings, auto_deactivation_days: parseInt(e.target.value) })}
                            />
                            <span className="unit">วัน</span>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleUpdateSetting('auto_deactivation_days', parseInt(settings.auto_deactivation_days))}
                            >
                                <FiSave />
                            </button>
                        </div>
                    </div>

                    <div className="setting-item">
                        <label>สกุลเงินหลัก</label>
                        <div className="setting-input">
                            <select
                                value={settings.default_currency || 'THB'}
                                onChange={(e) => {
                                    setSettings({ ...settings, default_currency: e.target.value })
                                    handleUpdateSetting('default_currency', e.target.value)
                                }}
                            >
                                <option value="THB">บาท (THB)</option>
                                <option value="LAK">กีบ (LAK)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    // === MAIN RENDER ===
    return (
        <div className="super-admin">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2>Super Admin</h2>
                </div>
                <nav className="sidebar-nav">
                    {[
                        { id: 'dashboard', label: 'Dashboard', icon: <FiHome /> },
                        { id: 'dealers', label: 'เจ้ามือ', icon: <FiUsers /> },
                        { id: 'credits', label: 'เครดิต', icon: <FiCreditCard /> },
                        { id: 'packages', label: 'แพ็คเกจ', icon: <FiPackage /> },
                        { id: 'invoices', label: 'ใบแจ้งหนี้', icon: <FiFileText /> },
                        { id: 'payments', label: 'การชำระเงิน', icon: <FiDollarSign />, badge: stats.pendingPayments },
                        { id: 'settings', label: 'ตั้งค่า', icon: <FiSettings /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {tab.badge > 0 && <span className="nav-badge">{tab.badge}</span>}
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="main-content-admin">
                <header className="content-header">
                    <h1>
                        {activeTab === 'dashboard' && 'Dashboard'}
                        {activeTab === 'dealers' && 'จัดการเจ้ามือ'}
                        {activeTab === 'credits' && 'จัดการเครดิต'}
                        {activeTab === 'packages' && 'จัดการแพ็คเกจ'}
                        {activeTab === 'invoices' && 'ใบแจ้งหนี้'}
                        {activeTab === 'payments' && 'การชำระเงิน'}
                        {activeTab === 'settings' && 'ตั้งค่าระบบ'}
                    </h1>
                    <button className="btn btn-icon" onClick={fetchAllData} title="รีเฟรช">
                        <FiRefreshCw />
                    </button>
                </header>

                <div className="content-body">
                    {isLoading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>กำลังโหลด...</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'dashboard' && renderDashboard()}
                            {activeTab === 'dealers' && renderDealers()}
                            {activeTab === 'credits' && renderCredits()}
                            {activeTab === 'packages' && renderPackages()}
                            {activeTab === 'invoices' && renderInvoices()}
                            {activeTab === 'payments' && renderPayments()}
                            {activeTab === 'settings' && renderSettings()}
                        </>
                    )}
                </div>
            </main>

            {/* Package Modal */}
            {showPackageModal && (
                <div className="modal-overlay" onClick={() => setShowPackageModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingPackage ? 'แก้ไขแพ็คเกจ' : 'เพิ่มแพ็คเกจใหม่'}</h3>
                            <button className="btn btn-icon" onClick={() => setShowPackageModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>ชื่อแพ็คเกจ</label>
                                <input
                                    type="text"
                                    value={packageForm.name}
                                    onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                                    placeholder="เช่น เริ่มต้น, มาตรฐาน, พรีเมียม"
                                />
                            </div>

                            <div className="form-group">
                                <label>รายละเอียด</label>
                                <textarea
                                    value={packageForm.description}
                                    onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
                                    placeholder="คำอธิบายแพ็คเกจ"
                                ></textarea>
                            </div>

                            <div className="form-group">
                                <label>โมเดลการเก็บเงิน</label>
                                <select
                                    value={packageForm.billing_model}
                                    onChange={(e) => setPackageForm({ ...packageForm, billing_model: e.target.value })}
                                >
                                    <option value="package">แพ็คเกจ (รายเดือน/รายปี)</option>
                                    <option value="per_device">ต่อเครื่อง + User</option>
                                    <option value="percentage">เปอร์เซ็นต์จากยอด</option>
                                </select>
                            </div>

                            {packageForm.billing_model !== 'percentage' ? (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>ราคารายเดือน (฿)</label>
                                        <input
                                            type="number"
                                            value={packageForm.monthly_price}
                                            onChange={(e) => setPackageForm({ ...packageForm, monthly_price: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>ราคารายปี (฿)</label>
                                        <input
                                            type="number"
                                            value={packageForm.yearly_price}
                                            onChange={(e) => setPackageForm({ ...packageForm, yearly_price: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label>อัตราเปอร์เซ็นต์ (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={packageForm.percentage_rate}
                                        onChange={(e) => setPackageForm({ ...packageForm, percentage_rate: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="form-row">
                                <div className="form-group">
                                    <label>จำนวนลูกค้าสูงสุด (0 = ไม่จำกัด)</label>
                                    <input
                                        type="number"
                                        value={packageForm.max_users}
                                        onChange={(e) => setPackageForm({ ...packageForm, max_users: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>ค่าลูกค้าเพิ่ม (฿/คน)</label>
                                    <input
                                        type="number"
                                        value={packageForm.extra_user_price}
                                        onChange={(e) => setPackageForm({ ...packageForm, extra_user_price: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-row checkboxes">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={packageForm.is_featured}
                                        onChange={(e) => setPackageForm({ ...packageForm, is_featured: e.target.checked })}
                                    />
                                    แพ็คเกจแนะนำ
                                </label>
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={packageForm.is_active}
                                        onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })}
                                    />
                                    เปิดใช้งาน
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn" onClick={() => setShowPackageModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleSavePackage}>
                                <FiSave /> บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Package Modal */}
            {showAssignPackageModal && selectedDealer && (
                <div className="modal-overlay" onClick={() => setShowAssignPackageModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><FiPackage /> กำหนดแพ็คเกจ</h2>
                            <button className="close-btn" onClick={() => setShowAssignPackageModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="dealer-assign-info">
                                <strong>เจ้ามือ:</strong> {selectedDealer.full_name || selectedDealer.email}
                            </div>

                            <div className="form-group">
                                <label>เลือกแพ็คเกจ</label>
                                <select
                                    value={assignPackageForm.package_id}
                                    onChange={(e) => setAssignPackageForm({ ...assignPackageForm, package_id: e.target.value })}
                                >
                                    <option value="">-- เลือกแพ็คเกจ --</option>
                                    {packages.filter(p => p.is_active).map(pkg => (
                                        <option key={pkg.id} value={pkg.id}>
                                            {pkg.name} - {formatCurrency(pkg.monthly_price)}/เดือน
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>รอบการเรียกเก็บ</label>
                                <select
                                    value={assignPackageForm.billing_cycle}
                                    onChange={(e) => setAssignPackageForm({ ...assignPackageForm, billing_cycle: e.target.value })}
                                    disabled={assignPackageForm.is_trial}
                                >
                                    <option value="monthly">รายเดือน</option>
                                    <option value="yearly">รายปี</option>
                                </select>
                            </div>

                            <div className="form-row checkboxes">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={assignPackageForm.is_trial}
                                        onChange={(e) => setAssignPackageForm({ ...assignPackageForm, is_trial: e.target.checked })}
                                    />
                                    ทดลองใช้
                                </label>
                            </div>

                            {assignPackageForm.is_trial && (
                                <div className="form-group">
                                    <label>จำนวนวันทดลอง</label>
                                    <input
                                        type="number"
                                        value={assignPackageForm.trial_days}
                                        onChange={(e) => setAssignPackageForm({ ...assignPackageForm, trial_days: parseInt(e.target.value) || 30 })}
                                        min="1"
                                        max="365"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn" onClick={() => setShowAssignPackageModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleAssignPackage}>
                                <FiCheck /> กำหนดแพ็คเกจ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Topup Credit Modal */}
            {showTopupModal && (
                <div className="modal-overlay" onClick={() => setShowTopupModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2><FiCreditCard /> เติมเครดิต</h2>
                            <button className="close-btn" onClick={() => setShowTopupModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>เลือกเจ้ามือ</label>
                                <select
                                    value={topupForm.dealer_id}
                                    onChange={(e) => setTopupForm({ ...topupForm, dealer_id: e.target.value })}
                                >
                                    <option value="">-- เลือกเจ้ามือ --</option>
                                    {dealers.map(dealer => (
                                        <option key={dealer.id} value={dealer.id}>
                                            {dealer.full_name || dealer.email}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>จำนวนเงิน (บาท)</label>
                                <input
                                    type="number"
                                    value={topupForm.amount}
                                    onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                />
                            </div>

                            <div className="form-group">
                                <label>หมายเหตุ (ไม่บังคับ)</label>
                                <input
                                    type="text"
                                    value={topupForm.description}
                                    onChange={(e) => setTopupForm({ ...topupForm, description: e.target.value })}
                                    placeholder="เช่น เติมเครดิตครั้งแรก, โอนเงินวันที่..."
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowTopupModal(false)}>
                                ยกเลิก
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleTopupCredit}
                                disabled={topupLoading || !topupForm.dealer_id || !topupForm.amount}
                            >
                                {topupLoading ? 'กำลังดำเนินการ...' : <><FiCheck /> เติมเครดิต</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
