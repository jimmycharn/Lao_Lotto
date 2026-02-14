import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiUser, FiEdit2, FiSave, FiCheck, FiLock, FiPlus, FiTrash2, FiStar, FiX } from 'react-icons/fi'
import ChangePasswordModal from '../components/ChangePasswordModal'
import './Profile.css'

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

export default function Profile() {
    const { user, profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const [showPasswordModal, setShowPasswordModal] = useState(false)

    // Bank accounts state
    const [bankAccounts, setBankAccounts] = useState([])
    const [bankLoading, setBankLoading] = useState(false)
    const [showBankForm, setShowBankForm] = useState(false)
    const [editingBankId, setEditingBankId] = useState(null)
    const [bankForm, setBankForm] = useState({ bank_name: '', bank_account: '', account_name: '' })

    const [profileData, setProfileData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        role: profile?.role || 'user'
    })

    const [formData, setFormData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || ''
    })

    useEffect(() => {
        if (profile) {
            setProfileData({
                full_name: profile.full_name || '',
                phone: profile.phone || '',
                role: profile.role || 'user'
            })
            setFormData({
                full_name: profile.full_name || '',
                phone: profile.phone || ''
            })
        }
    }, [profile])

    useEffect(() => {
        if (user?.id) fetchBankAccounts()
    }, [user?.id])

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    async function fetchBankAccounts() {
        setBankLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', user.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (!error && data) setBankAccounts(data)
        } catch (err) {
            console.error('Error fetching bank accounts:', err)
        } finally {
            setBankLoading(false)
        }
    }

    const handleSave = async () => {
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

    const handleSaveBankAccount = async () => {
        if (!bankForm.bank_name || !bankForm.bank_account) {
            setToast({ type: 'error', message: 'กรุณากรอกธนาคารและเลขบัญชี' })
            return
        }
        setSaving(true)
        try {
            if (editingBankId) {
                // Update existing
                const { error } = await supabase
                    .from('user_bank_accounts')
                    .update({
                        bank_name: bankForm.bank_name,
                        bank_account: bankForm.bank_account,
                        account_name: bankForm.account_name || null
                    })
                    .eq('id', editingBankId)
                    .eq('user_id', user.id)

                if (error) throw error
                setToast({ type: 'success', message: 'แก้ไขบัญชีสำเร็จ!' })
            } else {
                // Insert new - set as default if first account
                const isFirst = bankAccounts.length === 0
                const { error } = await supabase
                    .from('user_bank_accounts')
                    .insert({
                        user_id: user.id,
                        bank_name: bankForm.bank_name,
                        bank_account: bankForm.bank_account,
                        account_name: bankForm.account_name || null,
                        is_default: isFirst
                    })

                if (error) throw error
                setToast({ type: 'success', message: 'เพิ่มบัญชีสำเร็จ!' })
            }

            setShowBankForm(false)
            setEditingBankId(null)
            setBankForm({ bank_name: '', bank_account: '', account_name: '' })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error saving bank account:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteBank = async (bankId) => {
        if (!confirm('ต้องการลบบัญชีนี้?')) return
        try {
            const { error } = await supabase
                .from('user_bank_accounts')
                .delete()
                .eq('id', bankId)
                .eq('user_id', user.id)

            if (error) throw error
            setToast({ type: 'success', message: 'ลบบัญชีสำเร็จ!' })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error deleting bank:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        }
    }

    const handleSetDefault = async (bankId) => {
        try {
            const { error } = await supabase
                .from('user_bank_accounts')
                .update({ is_default: true })
                .eq('id', bankId)
                .eq('user_id', user.id)

            if (error) throw error
            setToast({ type: 'success', message: 'ตั้งเป็นบัญชีหลักแล้ว!' })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error setting default:', error)
            setToast({ type: 'error', message: 'เกิดข้อผิดพลาด: ' + error.message })
        }
    }

    const handleEditBank = (bank) => {
        setEditingBankId(bank.id)
        setBankForm({
            bank_name: bank.bank_name,
            bank_account: bank.bank_account,
            account_name: bank.account_name || ''
        })
        setShowBankForm(true)
    }

    return (
        <div className="profile-page">
            <div className="container">
                <div className="page-header">
                    <h1><FiUser /> โปรไฟล์ของฉัน</h1>
                    <p>จัดการข้อมูลส่วนตัวและบัญชีธนาคาร</p>
                </div>

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

                    {/* Bank Accounts - Multiple */}
                    <div className="profile-details card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>บัญชีธนาคาร</h3>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                    setEditingBankId(null)
                                    setBankForm({ bank_name: '', bank_account: '', account_name: '' })
                                    setShowBankForm(true)
                                }}
                            >
                                <FiPlus /> เพิ่มบัญชี
                            </button>
                        </div>

                        {/* Add/Edit Bank Form */}
                        {showBankForm && (
                            <div style={{
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-primary)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem',
                                marginBottom: '1rem'
                            }}>
                                <h4 style={{ margin: '0 0 0.75rem', color: 'var(--color-primary)' }}>
                                    {editingBankId ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}
                                </h4>
                                <div className="profile-form">
                                    <div className="form-group">
                                        <label className="form-label">ธนาคาร *</label>
                                        <select
                                            className="form-input"
                                            value={bankForm.bank_name}
                                            onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })}
                                        >
                                            <option value="">เลือกธนาคาร</option>
                                            {bankOptions.map(bank => (
                                                <option key={bank} value={bank}>{bank}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">ชื่อบัญชี</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={bankForm.account_name}
                                            onChange={e => setBankForm({ ...bankForm, account_name: e.target.value })}
                                            placeholder="ชื่อ-นามสกุล (เจ้าของบัญชี)"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">เลขบัญชี *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={bankForm.bank_account}
                                            onChange={e => setBankForm({ ...bankForm, bank_account: e.target.value })}
                                            placeholder="xxx-x-xxxxx-x"
                                        />
                                    </div>
                                    <div className="form-actions">
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setShowBankForm(false)
                                                setEditingBankId(null)
                                            }}
                                        >
                                            <FiX /> ยกเลิก
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleSaveBankAccount}
                                            disabled={saving}
                                        >
                                            {saving ? 'กำลังบันทึก...' : <><FiSave /> บันทึก</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bank Accounts List */}
                        {bankLoading ? (
                            <div className="loading-state"><div className="spinner"></div></div>
                        ) : bankAccounts.length === 0 ? (
                            <div className="empty-state small" style={{ padding: '1.5rem', textAlign: 'center' }}>
                                <p style={{ color: 'var(--color-text-muted)' }}>ยังไม่มีบัญชีธนาคาร กดปุ่ม "เพิ่มบัญชี" เพื่อเริ่มต้น</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {bankAccounts.map(bank => (
                                    <div key={bank.id} style={{
                                        background: bank.is_default ? 'rgba(212, 175, 55, 0.08)' : 'var(--color-surface)',
                                        border: bank.is_default ? '2px solid var(--color-primary)' : '1px solid rgba(128,128,128,0.2)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '0.75rem 1rem',
                                        position: 'relative'
                                    }}>
                                        {bank.is_default && (
                                            <span style={{
                                                position: 'absolute',
                                                top: '-8px',
                                                right: '12px',
                                                background: 'var(--color-primary)',
                                                color: '#000',
                                                padding: '0.1rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: 600
                                            }}>
                                                <FiStar style={{ verticalAlign: 'text-bottom', marginRight: '0.2rem' }} />
                                                บัญชีหลัก
                                            </span>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
                                                    {bank.bank_name}
                                                </div>
                                                {bank.account_name && (
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem' }}>
                                                        {bank.account_name}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.05em', color: 'var(--color-text)' }}>
                                                    {bank.bank_account}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                                {!bank.is_default && (
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => handleSetDefault(bank.id)}
                                                        title="ตั้งเป็นบัญชีหลัก"
                                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                    >
                                                        <FiStar />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => handleEditBank(bank)}
                                                    title="แก้ไข"
                                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => handleDeleteBank(bank.id)}
                                                    title="ลบ"
                                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Security Settings */}
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

                    {/* Toast Notification */}
                    {toast && (
                        <div className={`toast-notification ${toast.type}`}>
                            <FiCheck /> {toast.message}
                        </div>
                    )}
                </div>
            </div>

            {/* Change Password Modal */}
            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </div>
    )
}
