import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiUser, FiEdit2, FiSave, FiCheck } from 'react-icons/fi'
import './Profile.css'

export default function Profile() {
    const { user, profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)

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

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

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

            setProfileData({
                ...profileData,
                full_name: formData.full_name,
                phone: formData.phone,
                bank_name: formData.bank_name,
                bank_account: formData.bank_account
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
            </div>
        </div>
    )
}
