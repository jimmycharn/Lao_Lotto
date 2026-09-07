import React, { useState, useEffect } from 'react'
import { FiX, FiUser, FiMail, FiLock, FiPhone, FiCreditCard, FiEye, FiEyeOff, FiRefreshCw, FiCheck, FiShield } from 'react-icons/fi'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import './EditMemberModal.css'

const THAI_BANKS = [
    { code: 'KBANK', name: 'ธนาคารกสิกรไทย (KBANK)' },
    { code: 'SCB', name: 'ธนาคารไทยพาณิชย์ (SCB)' },
    { code: 'BBL', name: 'ธนาคารกรุงเทพ (BBL)' },
    { code: 'KTB', name: 'ธนาคารกรุงไทย (KTB)' },
    { code: 'TTB', name: 'ธนาคารทหารไทยธนชาต (TTB)' },
    { code: 'BAY', name: 'ธนาคารกรุงศรีอยุธยา (BAY)' },
    { code: 'GSB', name: 'ธนาคารออมสิน (GSB)' },
    { code: 'BAAC', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)' },
    { code: 'PROMPTPAY', name: 'พร้อมเพย์ (PromptPay)' },
    { code: 'OTHER', name: 'อื่นๆ' }
]

export const generateSecurePassword = (length = 8) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pwd = ''
    for (let i = 0; i < length; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pwd
}

export const validateEmailFormat = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function EditMemberModal({ isOpen, user, onClose, onUpdated }) {
    const { toast } = useToast()
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [phone, setPhone] = useState('')
    const [role, setRole] = useState('user')
    const [isActive, setIsActive] = useState(true)
    const [bankName, setBankName] = useState('')
    const [bankAccountName, setBankAccountName] = useState('')
    const [bankAccountNumber, setBankAccountNumber] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [copiedPassword, setCopiedPassword] = useState(false)

    useEffect(() => {
        if (user && isOpen) {
            setFullName(user.full_name || '')
            setEmail(user.email || '')
            setNewPassword('')
            setShowPassword(false)
            setPhone(user.phone || '')
            setRole(user.role || 'user')
            setIsActive(user.is_active !== false)
            setBankName(user.bank_name || '')
            setBankAccountName(user.bank_account_name || '')
            setBankAccountNumber(user.bank_account_number || user.bank_account || '')
            setError('')
            setCopiedPassword(false)
        }
    }, [user, isOpen])

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !submitting) {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, submitting, onClose])

    if (!isOpen || !user) return null

    const handleGeneratePassword = () => {
        const pwd = generateSecurePassword(8)
        setNewPassword(pwd)
        setShowPassword(true)
        if (navigator.clipboard) {
            navigator.clipboard.writeText(pwd).then(() => {
                setCopiedPassword(true)
                toast?.success(`สร้างรหัสผ่าน "${pwd}" และคัดลอกลงคลิปบอร์ดแล้ว`)
                setTimeout(() => setCopiedPassword(false), 3000)
            }).catch(() => {
                toast?.success(`สร้างรหัสผ่าน: ${pwd}`)
            })
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        // Validations
        const cleanName = fullName.trim()
        const cleanEmail = email.trim()
        const cleanPassword = newPassword.trim()

        if (!cleanName) {
            setError('กรุณากรอกชื่อ-นามสกุล')
            return
        }

        if (!cleanEmail) {
            setError('กรุณากรอกอีเมล')
            return
        }

        if (!validateEmailFormat(cleanEmail)) {
            setError('รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง: member@example.com)')
            return
        }

        if (cleanPassword && cleanPassword.length < 6) {
            setError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
            return
        }

        setSubmitting(true)
        try {
            const { data, error: rpcError } = await supabase.rpc('update_user_by_superadmin', {
                target_user_id: user.id,
                new_full_name: cleanName,
                new_phone: phone.trim() || null,
                new_email: cleanEmail,
                new_password: cleanPassword || null,
                new_role: role,
                new_bank_name: bankName.trim() || null,
                new_bank_account_name: bankAccountName.trim() || null,
                new_bank_account_number: bankAccountNumber.trim() || null,
                new_is_active: isActive
            })

            if (rpcError) {
                throw rpcError
            }

            toast?.success(`อัปเดตข้อมูลคุณ ${cleanName} เรียบร้อยแล้ว`)
            if (onUpdated) {
                onUpdated()
            }
            onClose()
        } catch (err) {
            console.error('Error updating member by superadmin:', err)
            const msg = err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
            setError(msg)
            toast?.error(msg)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="edit-member-overlay" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}>
            <div className="edit-member-modal">
                <div className="edit-member-header">
                    <div className="edit-member-title">
                        <FiUser className="title-icon" />
                        <div>
                            <h3>แก้ไขข้อมูลสมาชิก</h3>
                            <span className="user-subtitle">{user.full_name || user.email} ({user.id.slice(0, 8)}...)</span>
                        </div>
                    </div>
                    <button className="btn-close-modal" onClick={onClose} disabled={submitting}>
                        <FiX />
                    </button>
                </div>

                {error && (
                    <div className="edit-member-error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="edit-member-form">
                    <div className="edit-member-body">
                        {/* Section 1: ข้อมูลบัญชีผู้ใช้ (Credentials) */}
                    <div className="form-section">
                        <h4 className="section-title">
                            <FiMail /> ข้อมูลการเข้าสู่ระบบ (Credentials)
                        </h4>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>อีเมล (Email) <span className="required">*</span></label>
                                <div className="input-with-icon">
                                    <FiMail className="field-icon" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                        required
                                        disabled={submitting}
                                    />
                                </div>
                                <span className="field-hint">สมาชิกรวมถึงระบบ Login จะใช้อีเมลนี้ในการเข้าสู่ระบบ</span>
                            </div>

                            <div className="form-group">
                                <label>รหัสผ่านใหม่ (New Password)</label>
                                <div className="password-input-group">
                                    <div className="input-with-icon" style={{ flex: 1 }}>
                                        <FiLock className="field-icon" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยน"
                                            disabled={submitting}
                                        />
                                        <button
                                            type="button"
                                            className="toggle-password-btn"
                                            onClick={() => setShowPassword(!showPassword)}
                                            tabIndex={-1}
                                            title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                        >
                                            {showPassword ? <FiEyeOff /> : <FiEye />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-generate-password"
                                        onClick={handleGeneratePassword}
                                        disabled={submitting}
                                        title="สุ่มรหัสผ่าน 8 หลักและคัดลอกให้อัตโนมัติ"
                                    >
                                        {copiedPassword ? <FiCheck /> : <FiRefreshCw />}
                                        <span>{copiedPassword ? 'คัดลอกแล้ว' : 'สุ่มรหัส'}</span>
                                    </button>
                                </div>
                                <span className="field-hint">กรอกเฉพาะกรณีที่ต้องการรีเซ็ต/เปลี่ยนรหัสผ่านให้สมาชิก (ขั้นต่ำ 6 ตัวอักษร)</span>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: ข้อมูลส่วนตัวและสิทธิ์ */}
                    <div className="form-section">
                        <h4 className="section-title">
                            <FiShield /> ข้อมูลโปรไฟล์และสิทธิ์
                        </h4>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>ชื่อ-นามสกุล <span className="required">*</span></label>
                                <div className="input-with-icon">
                                    <FiUser className="field-icon" />
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="ชื่อแสดงผลของสมาชิก"
                                        required
                                        disabled={submitting}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>เบอร์โทรศัพท์</label>
                                <div className="input-with-icon">
                                    <FiPhone className="field-icon" />
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="08xxxxxxxx"
                                        disabled={submitting}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>สิทธิ์การใช้งาน (Role)</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    disabled={submitting}
                                    className="edit-role-select"
                                >
                                    <option value="user">ผู้ใช้ทั่วไป (user)</option>
                                    <option value="dealer">เจ้ามือ (dealer)</option>
                                    <option value="superadmin">Admin / Super Admin (superadmin)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>สถานะบัญชี</label>
                                <div className="member-status-toggle-container">
                                    <label className="member-status-toggle">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={(e) => setIsActive(e.target.checked)}
                                            disabled={submitting}
                                        />
                                        <span className="member-status-slider"></span>
                                        <span className={`member-status-badge ${isActive ? 'active' : 'blocked'}`}>
                                            {isActive ? 'ใช้งานปกติ (Active)' : 'ระงับการใช้งาน (Blocked)'}
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: ข้อมูลบัญชีธนาคาร */}
                    <div className="form-section">
                        <h4 className="section-title">
                            <FiCreditCard /> ข้อมูลบัญชีธนาคาร
                        </h4>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>ธนาคาร</label>
                                <select
                                    value={bankName}
                                    onChange={(e) => setBankName(e.target.value)}
                                    disabled={submitting}
                                    className="bank-select"
                                >
                                    <option value="">-- เลือกธนาคาร --</option>
                                    {THAI_BANKS.map(b => (
                                        <option key={b.code} value={b.name}>{b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>เลขที่บัญชี</label>
                                <input
                                    type="text"
                                    value={bankAccountNumber}
                                    onChange={(e) => setBankAccountNumber(e.target.value)}
                                    placeholder="เช่น 123-4-56789-0"
                                    disabled={submitting}
                                />
                            </div>

                            <div className="form-group form-full-width">
                                <label>ชื่อบัญชีธนาคาร</label>
                                <input
                                    type="text"
                                    value={bankAccountName}
                                    onChange={(e) => setBankAccountName(e.target.value)}
                                    placeholder="ชื่อ-นามสกุล เจ้าของบัญชี"
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="edit-member-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting}
                        >
                            {submitting ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
