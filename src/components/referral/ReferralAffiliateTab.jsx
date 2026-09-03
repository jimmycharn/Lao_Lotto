import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import {
    FiShare2,
    FiUsers,
    FiDollarSign,
    FiCopy,
    FiCheck,
    FiArrowDownRight,
    FiTrendingUp,
    FiClock,
    FiCheckCircle,
    FiXCircle,
    FiAlertCircle,
    FiCreditCard,
    FiRefreshCw,
    FiExternalLink,
    FiImage
} from 'react-icons/fi'
import './ReferralAffiliateTab.css'

export default function ReferralAffiliateTab({ user, profile, isDealer = false }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [referrals, setReferrals] = useState([])
    const [commissions, setCommissions] = useState([])
    const [withdrawals, setWithdrawals] = useState([])
    const [walletBalance, setWalletBalance] = useState(0)
    const [defaultRate, setDefaultRate] = useState(10)
    const [copiedLink, setCopiedLink] = useState(false)
    const [copiedCode, setCopiedCode] = useState(false)

    // Modal states
    const [showWithdrawModal, setShowWithdrawModal] = useState(false)
    const [withdrawLoading, setWithdrawLoading] = useState(false)
    const [withdrawForm, setWithdrawForm] = useState({
        amount: '',
        bank_name: '',
        account_number: '',
        account_name: ''
    })

    const [showConvertModal, setShowConvertModal] = useState(false)
    const [convertLoading, setConvertLoading] = useState(false)
    const [convertAmount, setConvertAmount] = useState('')

    const [slipModalUrl, setSlipModalUrl] = useState(null)

    const memberCode = profile?.member_code || ''
    const referralLink = `${window.location.origin}/register?role=dealer&ref=${memberCode}`

    const fetchData = useCallback(async (isRefresh = false) => {
        if (!user?.id) return
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        try {
            // 1. Fetch current profile wallet balance
            const { data: profData } = await supabase
                .from('profiles')
                .select('referral_wallet_balance, member_code, full_name')
                .eq('id', user.id)
                .single()

            if (profData) {
                setWalletBalance(parseFloat(profData.referral_wallet_balance || 0))
            }

            // 2. Fetch default referral rate from system_settings
            const { data: sysRate } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'default_dealer_referral_rate')
                .maybeSingle()

            if (sysRate?.value) {
                setDefaultRate(parseFloat(sysRate.value))
            }

            // 3. Fetch referrals list with dealer details
            const { data: refList, error: refErr } = await supabase
                .from('dealer_referrals')
                .select(`
                    id,
                    commission_rate,
                    status,
                    created_at,
                    referred_dealer:referred_dealer_id (
                        id,
                        full_name,
                        member_code,
                        email,
                        created_at
                    )
                `)
                .eq('referrer_id', user.id)
                .order('created_at', { ascending: false })

            if (refErr) console.error('Error fetching referrals:', refErr)

            // 4. Fetch commissions history
            const { data: commList, error: commErr } = await supabase
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
                    referred_dealer:referred_dealer_id (
                        full_name,
                        member_code
                    ),
                    round:round_id (
                        round_date
                    )
                `)
                .eq('referrer_id', user.id)
                .order('created_at', { ascending: false })

            if (commErr) console.error('Error fetching commissions:', commErr)

            // 5. Fetch withdrawals history
            const { data: withList, error: withErr } = await supabase
                .from('referral_withdrawals')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (withErr) console.error('Error fetching withdrawals:', withErr)

            // Calculate total earned per dealer
            const commByDealer = {}
            ;(commList || []).forEach(c => {
                const dId = c.referred_dealer?.member_code || 'unknown'
                commByDealer[dId] = (commByDealer[dId] || 0) + parseFloat(c.commission_amount || 0)
            })

            const mappedReferrals = (refList || []).map(r => ({
                ...r,
                totalEarned: commByDealer[r.referred_dealer?.member_code] || 0
            }))

            setReferrals(mappedReferrals)
            setCommissions(commList || [])
            setWithdrawals(withList || [])
        } catch (error) {
            console.error('Error loading referral data:', error)
            toast?.error?.('ไม่สามารถโหลดข้อมูลระบบแนะนำได้')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [user?.id])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Calculate aggregated stats
    const totalEarned = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0)
    const totalWithdrawn = withdrawals
        .filter(w => w.status === 'approved' && w.withdrawal_type === 'cash')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
    const totalConverted = withdrawals
        .filter(w => w.status === 'approved' && w.withdrawal_type === 'convert_dealer_credit')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
    const pendingWithdrawal = withdrawals
        .filter(w => w.status === 'pending')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)

    const handleCopyLink = async (e) => {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (!referralLink) return
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(referralLink)
            } else {
                const el = document.createElement('textarea')
                el.value = referralLink
                el.setAttribute('readonly', '')
                el.style.position = 'absolute'
                el.style.left = '-9999px'
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)
            }
            setCopiedLink(true)
            toast?.success?.('คัดลอกลิงก์แนะนำเรียบร้อยแล้ว')
            setTimeout(() => setCopiedLink(false), 2500)
        } catch (err) {
            console.error('Failed to copy link:', err)
            toast?.error?.('ไม่สามารถคัดลอกลิงก์ได้')
        }
    }

    const handleCopyCode = async (e) => {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (!memberCode) return
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(memberCode)
            } else {
                const el = document.createElement('textarea')
                el.value = memberCode
                el.setAttribute('readonly', '')
                el.style.position = 'absolute'
                el.style.left = '-9999px'
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)
            }
            setCopiedCode(true)
            toast?.success?.('คัดลอกรหัสแนะนำเรียบร้อยแล้ว')
            setTimeout(() => setCopiedCode(false), 2500)
        } catch (err) {
            console.error('Failed to copy code:', err)
            toast?.error?.('ไม่สามารถคัดลอกรหัสได้')
        }
    }

    // Submit cash withdrawal request
    const handleWithdrawSubmit = async (e) => {
        e.preventDefault()
        const amountNum = parseFloat(withdrawForm.amount)
        if (isNaN(amountNum) || amountNum <= 0) {
            toast?.error?.('กรุณาระบุจำนวนเงินที่ต้องการถอนให้ถูกต้อง')
            return
        }
        if (amountNum > walletBalance) {
            toast?.error?.('ยอดเงินในกระเป๋าไม่เพียงพอ')
            return
        }
        if (!withdrawForm.bank_name.trim() || !withdrawForm.account_number.trim() || !withdrawForm.account_name.trim()) {
            toast?.error?.('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน')
            return
        }

        setWithdrawLoading(true)
        try {
            const { data, error } = await supabase.rpc('request_referral_withdrawal', {
                p_amount: amountNum,
                p_bank_name: withdrawForm.bank_name,
                p_account_number: withdrawForm.account_number,
                p_account_name: withdrawForm.account_name
            })

            if (error || (data && !data.success)) {
                throw new Error(error?.message || data?.message || 'เกิดข้อผิดพลาดในการยื่นคำขอ')
            }

            toast?.success?.(`ยื่นคำขอถอนเงิน ฿${amountNum.toLocaleString()} สำเร็จแล้ว กรุณารอแอดมินดำเนินการโอนเงิน`)
            setShowWithdrawModal(false)
            setWithdrawForm({ amount: '', bank_name: '', account_number: '', account_name: '' })
            fetchData(true)
        } catch (err) {
            console.error('Withdrawal error:', err)
            toast?.error?.(err.message || 'เกิดข้อผิดพลาดในการยื่นคำขอถอนเงิน')
        } finally {
            setWithdrawLoading(false)
        }
    }

    // Convert referral wallet to dealer credit (dealers only)
    const handleConvertSubmit = async (e) => {
        e.preventDefault()
        const amountNum = parseFloat(convertAmount)
        if (isNaN(amountNum) || amountNum <= 0) {
            toast?.error?.('กรุณาระบุจำนวนเงินที่ต้องการแปลงให้ถูกต้อง')
            return
        }
        if (amountNum > walletBalance) {
            toast?.error?.('ยอดเงินในกระเป๋าไม่เพียงพอ')
            return
        }

        setConvertLoading(true)
        try {
            const { data, error } = await supabase.rpc('convert_referral_to_dealer_credit', {
                p_amount: amountNum
            })

            if (error || (data && !data.success)) {
                throw new Error(error?.message || data?.message || 'เกิดข้อผิดพลาดในการแปลงเครดิต')
            }

            toast?.success?.(`แปลงค่าคอมมิชชั่น ฿${amountNum.toLocaleString()} เป็นเครดิตดีลเลอร์สำเร็จแล้ว!`)
            setShowConvertModal(false)
            setConvertAmount('')
            fetchData(true)
        } catch (err) {
            console.error('Convert error:', err)
            toast?.error?.(err.message || 'เกิดข้อผิดพลาดในการแปลงเครดิต')
        } finally {
            setConvertLoading(false)
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

    if (loading) {
        return (
            <div className="referral-loading-container">
                <div className="spinner"></div>
                <p>กำลังโหลดข้อมูลระบบแนะนำ...</p>
            </div>
        )
    }

    return (
        <div className="referral-tab-wrapper">
            {/* Header & Refresh */}
            <div className="referral-top-header">
                <div>
                    <h2 className="referral-main-title">
                        <FiShare2 className="title-icon" /> ระบบแนะนำเจ้ามือ (Affiliate)
                    </h2>
                    <p className="referral-subtitle">
                        รับค่าคอมมิชชั่น {defaultRate}% จากรายได้ค่าบริการที่ระบบได้รับจากเจ้ามือที่คุณแนะนำตลอดชีพ
                    </p>
                </div>
                <button
                    className="btn btn-secondary btn-sm refresh-btn"
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                >
                    <FiRefreshCw className={refreshing ? 'spinning' : ''} /> {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
                </button>
            </div>

            {/* Wallet Overview & Earnings Cards */}
            <div className="referral-stats-grid">
                <div className="referral-stat-card primary-card">
                    <div className="card-header-icon">
                        <FiDollarSign />
                    </div>
                    <div className="card-content">
                        <span className="card-label">ยอดเงินในกระเป๋า (พร้อมถอน)</span>
                        <h3 className="card-value highlight">฿{walletBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <div className="referral-wallet-actions">
                        <button
                            type="button"
                            className="referral-btn referral-btn-withdraw"
                            disabled={walletBalance <= 0}
                            onClick={() => {
                                setWithdrawForm({ ...withdrawForm, amount: walletBalance.toString() })
                                setShowWithdrawModal(true)
                            }}
                        >
                            <FiArrowDownRight className="referral-btn-icon" />
                            <span>ขอถอนเงิน</span>
                        </button>
                        {isDealer && (
                            <button
                                type="button"
                                className="referral-btn referral-btn-convert"
                                disabled={walletBalance <= 0}
                                onClick={() => {
                                    setConvertAmount(walletBalance.toString())
                                    setShowConvertModal(true)
                                }}
                            >
                                <FiCreditCard className="referral-btn-icon" />
                                <span>แปลงเป็นเครดิตร้าน</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="referral-stat-card">
                    <div className="card-header-icon success">
                        <FiTrendingUp />
                    </div>
                    <div className="card-content">
                        <span className="card-label">รายได้ค่าคอมรวมทั้งหมด</span>
                        <h3 className="card-value">฿{totalEarned.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</h3>
                        <span className="card-subtext">จาก {commissions.length} รายการ</span>
                    </div>
                </div>

                <div className="referral-stat-card">
                    <div className="card-header-icon info">
                        <FiUsers />
                    </div>
                    <div className="card-content">
                        <span className="card-label">เจ้ามือที่แนะนำ</span>
                        <h3 className="card-value">{referrals.length} <span className="unit">ราย</span></h3>
                        <span className="card-subtext">กำลังใช้งาน {referrals.filter(r => r.status === 'active').length} ราย</span>
                    </div>
                </div>

                <div className="referral-stat-card">
                    <div className="card-header-icon warning">
                        <FiClock />
                    </div>
                    <div className="card-content">
                        <span className="card-label">ถอนแล้ว / รอดำเนินการ</span>
                        <h3 className="card-value">฿{totalWithdrawn.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</h3>
                        {pendingWithdrawal > 0 && (
                            <span className="card-subtext pending">รอแอดมินโอน: ฿{pendingWithdrawal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                        )}
                        {totalConverted > 0 && (
                            <span className="card-subtext converted">แปลงเป็นเครดิตแล้ว: ฿{totalConverted.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Share & Invite Section */}
            <div className="referral-share-card">
                <div className="share-card-header">
                    <h3>📢 ลิงก์และรหัสสำหรับแนะนำเจ้ามือใหม่</h3>
                    <p>ส่งลิงก์นี้ให้เพื่อนที่ต้องการเปิดร้านรับแทงหวย เมื่อเพื่อนสมัครและมียอดแทง คุณจะได้รับค่าคอมมิชชั่นทันทีทุกงวด</p>
                </div>

                <div className="share-controls-row">
                    <div className="share-code-box">
                        <span className="code-label">รหัสผู้แนะนำของคุณ:</span>
                        <div className="code-display">
                            <strong>{memberCode || '-'}</strong>
                            <button
                                type="button"
                                className={`btn-copy ${copiedCode ? 'copied' : ''}`}
                                onClick={handleCopyCode}
                                title="คัดลอกรหัส"
                            >
                                {copiedCode ? <FiCheck /> : <FiCopy />}
                                {copiedCode ? ' คัดลอกแล้ว' : ' คัดลอกรหัส'}
                            </button>
                        </div>
                    </div>

                    <div className="share-link-box">
                        <span className="code-label">ลิงก์สมัครเจ้ามือโดยตรง:</span>
                        <div className="link-input-group">
                            <input
                                type="text"
                                readOnly
                                value={referralLink}
                                className="form-input link-input"
                                onClick={(e) => e.target.select()}
                            />
                            <button
                                type="button"
                                className={`btn btn-primary ${copiedLink ? 'btn-success' : ''}`}
                                onClick={handleCopyLink}
                            >
                                {copiedLink ? <FiCheck /> : <FiCopy />}
                                {copiedLink ? ' คัดลอกแล้ว' : ' คัดลอกลิงก์'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Breakdown: Referred Dealers Table */}
            <div className="referral-section-card">
                <div className="section-card-header">
                    <h3>
                        <FiUsers /> รายชื่อเจ้ามือที่คุณแนะนำ ({referrals.length} ร้าน)
                    </h3>
                    <span className="section-header-hint">ดูยอดคอมมิชชั่นสะสมที่สร้างได้จากแต่ละร้าน</span>
                </div>

                {referrals.length === 0 ? (
                    <div className="empty-state-box">
                        <FiUsers className="empty-icon" />
                        <p>ยังไม่มีเจ้ามือที่สมัครผ่านรหัสของคุณ</p>
                        <span className="empty-subtext">แชร์ลิงก์หรือรหัสแนะนำของคุณด้านบน เพื่อเริ่มสร้างรายได้ได้เลยค่ะ</span>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="referral-table">
                            <thead>
                                <tr>
                                    <th>ร้านเจ้ามือ</th>
                                    <th>รหัสร้าน</th>
                                    <th>วันที่เข้าร่วม</th>
                                    <th>ส่วนแบ่ง (%)</th>
                                    <th className="text-right">รายได้สะสมจากร้านนี้</th>
                                    <th className="text-center">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {referrals.map((ref) => {
                                    const dealer = ref.referred_dealer || {}
                                    const rate = ref.commission_rate !== null ? ref.commission_rate : defaultRate
                                    return (
                                        <tr key={ref.id}>
                                            <td>
                                                <div className="dealer-name-cell">
                                                    <strong>{dealer.full_name || 'เจ้ามือ'}</strong>
                                                    <span className="dealer-email">{dealer.email || ''}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-code">{dealer.member_code || '-'}</span>
                                            </td>
                                            <td>{formatDate(ref.created_at)}</td>
                                            <td>
                                                <span className="rate-badge">{rate}%</span>
                                            </td>
                                            <td className="text-right">
                                                <strong className="earned-text">
                                                    ฿{ref.totalEarned.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                </strong>
                                            </td>
                                            <td className="text-center">
                                                <span className={`status-pill ${ref.status}`}>
                                                    {ref.status === 'active' ? 'กำลังใช้งาน' : 'ระงับชั่วคราว'}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detailed History: Commissions Log per Round */}
            <div className="referral-section-card">
                <div className="section-card-header">
                    <h3>
                        <FiDollarSign /> ประวัติการรับค่าคอมมิชชั่นรายงวด
                    </h3>
                    <span className="section-header-hint">บันทึกที่มาของรายได้ทุกงวดที่ระบบตัดแบ่งให้คุณ</span>
                </div>

                {commissions.length === 0 ? (
                    <div className="empty-state-box">
                        <FiTrendingUp className="empty-icon" />
                        <p>ยังไม่มีรายการค่าคอมมิชชั่น</p>
                        <span className="empty-subtext">เมื่อเจ้ามือที่คุณแนะนำมีการออกผลหวยและตัดค่าบริการ ค่าคอมมิชชั่นจะปรากฏที่นี่ทันที</span>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="referral-table">
                            <thead>
                                <tr>
                                    <th>วันที่/เวลา</th>
                                    <th>เจ้ามือต้นทาง</th>
                                    <th>งวดหวย / ประเภท</th>
                                    <th className="text-right">ค่าบริการระบบ</th>
                                    <th className="text-center">% ได้รับ</th>
                                    <th className="text-right">ค่าคอมมิชชั่น</th>
                                </tr>
                            </thead>
                            <tbody>
                                {commissions.map((c) => {
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
                                                <strong>{d.full_name || 'เจ้ามือ'}</strong>
                                                <span className="dealer-code-sub">({d.member_code || '-'})</span>
                                            </td>
                                            <td>
                                                <div className="round-info-cell">
                                                    <span className="lottery-type-tag">{ltype}</span>
                                                    <span className="round-date">งวด {roundDateStr}</span>
                                                </div>
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

            {/* Withdrawals History */}
            <div className="referral-section-card">
                <div className="section-card-header">
                    <h3>
                        <FiClock /> ประวัติการถอนเงิน / แปลงเครดิต
                    </h3>
                </div>

                {withdrawals.length === 0 ? (
                    <div className="empty-state-box">
                        <FiClock className="empty-icon" />
                        <p>ยังไม่มีประวัติการทำรายการถอนเงิน</p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="referral-table">
                            <thead>
                                <tr>
                                    <th>วันที่ยื่นคำขอ</th>
                                    <th>ประเภท</th>
                                    <th>บัญชีปลายทาง</th>
                                    <th className="text-right">จำนวนเงิน</th>
                                    <th className="text-center">สถานะ</th>
                                    <th className="text-center">หลักฐาน / หมายเหตุ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {withdrawals.map((w) => (
                                    <tr key={w.id}>
                                        <td className="time-cell">{formatDateTime(w.created_at)}</td>
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
                                                <div className="bank-info-cell">
                                                    <strong>{w.bank_name}</strong>
                                                    <span>{w.account_number} ({w.account_name})</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            <strong>฿{parseFloat(w.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
                                        </td>
                                        <td className="text-center">
                                            <span className={`status-pill ${w.status}`}>
                                                {w.status === 'approved' && 'โอนแล้ว / สำเร็จ'}
                                                {w.status === 'pending' && 'รอดำเนินการ'}
                                                {w.status === 'rejected' && 'ปฏิเสธ (คืนเงิน)'}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            {w.slip_url && (
                                                <button
                                                    className="btn btn-outline-primary btn-xs"
                                                    onClick={() => setSlipModalUrl(w.slip_url)}
                                                >
                                                    <FiImage /> ดูสลิป
                                                </button>
                                            )}
                                            {w.rejected_reason && (
                                                <span className="reject-reason" title={w.rejected_reason}>
                                                    {w.rejected_reason}
                                                </span>
                                            )}
                                            {!w.slip_url && !w.rejected_reason && '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal: Request Cash Withdrawal */}
            {showWithdrawModal && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog referral-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3>
                                <FiArrowDownRight /> ขอยื่นถอนเงินค่าคอมมิชชั่น
                            </h3>
                            <button className="modal-close-btn" onClick={() => setShowWithdrawModal(false)}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleWithdrawSubmit} className="modal-body">
                            <div className="wallet-balance-banner">
                                <span>ยอดเงินที่สามารถถอนได้:</span>
                                <strong>฿{walletBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
                            </div>

                            <div className="form-group">
                                <label className="form-label">จำนวนเงินที่ต้องการถอน (บาท) *</label>
                                <input
                                    type="number"
                                    step="any"
                                    min="1"
                                    max={walletBalance}
                                    className="form-input"
                                    placeholder="ระบุจำนวนเงิน"
                                    value={withdrawForm.amount}
                                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">ธนาคาร *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น กสิกรไทย, ไทยพาณิชย์, พร้อมเพย์"
                                    value={withdrawForm.bank_name}
                                    onChange={(e) => setWithdrawForm({ ...withdrawForm, bank_name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เลขที่บัญชี / หมายเลขพร้อมเพย์ *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ระบุเลขที่บัญชี"
                                    value={withdrawForm.account_number}
                                    onChange={(e) => setWithdrawForm({ ...withdrawForm, account_number: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">ชื่อบัญชี *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ชื่อ-นามสกุล เจ้าของบัญชี"
                                    value={withdrawForm.account_name}
                                    onChange={(e) => setWithdrawForm({ ...withdrawForm, account_name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowWithdrawModal(false)}
                                    disabled={withdrawLoading}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={withdrawLoading || !withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0}
                                >
                                    {withdrawLoading ? 'กำลังบันทึกคำขอ...' : 'ยืนยันการขอถอนเงิน'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Convert to Dealer Credit */}
            {showConvertModal && (
                <div className="modal-overlay animate-fadeIn">
                    <div className="modal-dialog referral-modal animate-scaleUp">
                        <div className="modal-header">
                            <h3>
                                <FiCreditCard /> แปลงค่าคอมมิชชั่นเป็นเครดิตดีลเลอร์
                            </h3>
                            <button className="modal-close-btn" onClick={() => setShowConvertModal(false)}>
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleConvertSubmit} className="modal-body">
                            <div className="wallet-balance-banner">
                                <span>ยอดเงินในกระเป๋าค่าแนะนำ:</span>
                                <strong>฿{walletBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
                            </div>

                            <p className="convert-modal-desc">
                                ยอดเงินที่แปลงจะถูกโอนเข้าไปยังเครดิตร้านของคุณในทันที เพื่อใช้รองรับการเปิดรับแทงหวยในร้านโดยไม่ต้องรอแอดมินโอนเงิน
                            </p>

                            <div className="form-group">
                                <label className="form-label">จำนวนเงินที่ต้องการแปลงเป็นเครดิต (บาท) *</label>
                                <input
                                    type="number"
                                    step="any"
                                    min="1"
                                    max={walletBalance}
                                    className="form-input"
                                    placeholder="ระบุจำนวนเงิน"
                                    value={convertAmount}
                                    onChange={(e) => setConvertAmount(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowConvertModal(false)}
                                    disabled={convertLoading}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-success"
                                    disabled={convertLoading || !convertAmount || parseFloat(convertAmount) <= 0}
                                >
                                    {convertLoading ? 'กำลังทำรายการ...' : 'ยืนยันแปลงเป็นเครดิต'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: View Slip */}
            {slipModalUrl && (
                <div className="modal-overlay animate-fadeIn" onClick={() => setSlipModalUrl(null)}>
                    <div className="modal-dialog slip-view-modal animate-scaleUp" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>หลักฐานการโอนเงิน (สลิป)</h3>
                            <button className="modal-close-btn" onClick={() => setSlipModalUrl(null)}>
                                ×
                            </button>
                        </div>
                        <div className="modal-body text-center">
                            <img src={slipModalUrl} alt="Transfer Slip" className="slip-image-preview" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
