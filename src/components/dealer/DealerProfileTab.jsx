import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import ChangePasswordModal from '../ChangePasswordModal'
import {
    FiUser,
    FiEdit2,
    FiPackage,
    FiAlertCircle,
    FiSave,
    FiLock,
    FiPlus,
    FiStar,
    FiTrash2,
    FiCheck,
    FiX
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import CopyButton from '../CopyButton'

// Dealer Profile Tab Component
export default function DealerProfileTab({ user, profile, subscription, formatDate }) {
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [bankAccounts, setBankAccounts] = useState([])
    const [loadingBanks, setLoadingBanks] = useState(true)
    const [showAddBankModal, setShowAddBankModal] = useState(false)
    const [editingBank, setEditingBank] = useState(null)
    const [toast, setToast] = useState(null)
    const [showPasswordModal, setShowPasswordModal] = useState(false)

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
                                    {subscription.expires_at ? (
                                        <span className="sub-expiry">
                                            หมดอายุ: {formatDate(subscription.expires_at)}
                                        </span>
                                    ) : (
                                        <span className="sub-expiry" style={{ color: 'var(--color-success)' }}>
                                            ไม่มีวันหมดอายุ
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

            {/* Security Settings Card */}
            <div className="profile-details card">
                <h3>ความปลอดภัย</h3>
                <div className="security-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', background: 'var(--color-bg)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '2rem', color: 'var(--color-gold)', marginBottom: '0.75rem' }}>
                        <FiLock />
                    </div>
                    <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--color-text)' }}>รหัสผ่าน</h4>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>เปลี่ยนรหัสผ่านเพื่อความปลอดภัย</p>
                    <button
                        className="btn btn-outline"
                        onClick={() => setShowPasswordModal(true)}
                    >
                        เปลี่ยนรหัสผ่าน
                    </button>
                </div>
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
                                    {bank.account_name && (
                                        <div className="account-name">{bank.account_name}</div>
                                    )}
                                    <div className="bank-account-number" style={{ display: 'flex', alignItems: 'center' }}>
                                        {bank.bank_account}
                                        <CopyButton text={bank.bank_account} />
                                    </div>
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

            {/* Change Password Modal */}
            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </div>
    )
}
