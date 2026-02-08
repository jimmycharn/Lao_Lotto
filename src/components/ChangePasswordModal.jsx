import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { FiLock, FiEye, FiEyeOff, FiX, FiMail, FiCheck } from 'react-icons/fi'
import toast from 'react-hot-toast'
import './ChangePasswordModal.css'

export default function ChangePasswordModal({ isOpen, onClose }) {
    const [mode, setMode] = useState('change') // 'change' or 'forgot' or 'success'
    const [loading, setLoading] = useState(false)
    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [emailSent, setEmailSent] = useState(false)
    const [passwordChanged, setPasswordChanged] = useState(false)

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        email: ''
    })

    const [errors, setErrors] = useState({})

    const validateChangePassword = () => {
        const newErrors = {}

        if (!formData.currentPassword) {
            newErrors.currentPassword = 'กรุณากรอกรหัสผ่านปัจจุบัน'
        }

        if (!formData.newPassword) {
            newErrors.newPassword = 'กรุณากรอกรหัสผ่านใหม่'
        } else if (formData.newPassword.length < 6) {
            newErrors.newPassword = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
        } else if (formData.newPassword === formData.currentPassword) {
            newErrors.newPassword = 'รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม'
        }

        if (!formData.confirmPassword) {
            newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่านใหม่'
        } else if (formData.newPassword !== formData.confirmPassword) {
            newErrors.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const validateForgotPassword = () => {
        const newErrors = {}

        if (!formData.email) {
            newErrors.email = 'กรุณากรอกอีเมล'
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleChangePassword = async (e) => {
        e.preventDefault()

        if (!validateChangePassword()) return

        setLoading(true)
        try {
            // First verify current password by trying to sign in
            const { data: { user } } = await supabase.auth.getUser()
            
            if (!user?.email) {
                toast.error('ไม่พบข้อมูลผู้ใช้')
                return
            }

            // Try to sign in with current password to verify
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: formData.currentPassword
            })

            if (signInError) {
                setErrors({ currentPassword: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
                setLoading(false)
                return
            }

            // Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: formData.newPassword
            })

            if (updateError) throw updateError

            // Update password_changed flag in profiles
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ password_changed: true })
                .eq('id', user.id)

            if (profileError) {
                console.error('Error updating password_changed flag:', profileError)
            }

            setPasswordChanged(true)
            setMode('success')
        } catch (error) {
            console.error('Error changing password:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleForgotPassword = async (e) => {
        e.preventDefault()

        if (!validateForgotPassword()) return

        setLoading(true)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
                redirectTo: `${window.location.origin}/reset-password`
            })

            if (error) throw error

            setEmailSent(true)
            toast.success('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว')
        } catch (error) {
            console.error('Error sending reset email:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setFormData({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
            email: ''
        })
        setErrors({})
        setMode('change')
        setEmailSent(false)
        setPasswordChanged(false)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="change-password-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        <FiLock />
                        {mode === 'change' ? 'เปลี่ยนรหัสผ่าน' : 'ลืมรหัสผ่าน'}
                    </h2>
                    <button className="btn-close" onClick={handleClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    {mode === 'success' ? (
                        <div className="password-success-message">
                            <div className="success-icon">
                                <FiCheck />
                            </div>
                            <h3>เปลี่ยนรหัสผ่านสำเร็จ!</h3>
                            <p>รหัสผ่านของคุณได้รับการเปลี่ยนแปลงเรียบร้อยแล้ว</p>
                            <p className="hint">คุณสามารถใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไป</p>
                            <button className="btn btn-primary" onClick={handleClose}>
                                ปิด
                            </button>
                        </div>
                    ) : mode === 'change' ? (
                        <form onSubmit={handleChangePassword}>
                            <div className="form-group">
                                <label className="form-label">รหัสผ่านปัจจุบัน</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        className={`form-input ${errors.currentPassword ? 'error' : ''}`}
                                        value={formData.currentPassword}
                                        onChange={e => setFormData({ ...formData, currentPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านปัจจุบัน"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    >
                                        {showCurrentPassword ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                                {errors.currentPassword && <span className="error-text">{errors.currentPassword}</span>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">รหัสผ่านใหม่</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        className={`form-input ${errors.newPassword ? 'error' : ''}`}
                                        value={formData.newPassword}
                                        onChange={e => setFormData({ ...formData, newPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                    >
                                        {showNewPassword ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                                {errors.newPassword && <span className="error-text">{errors.newPassword}</span>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                                        value={formData.confirmPassword}
                                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    >
                                        {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                                {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'กำลังดำเนินการ...' : 'เปลี่ยนรหัสผ่าน'}
                                </button>
                            </div>

                            <div className="forgot-password-link">
                                <button type="button" onClick={() => setMode('forgot')}>
                                    ลืมรหัสผ่าน?
                                </button>
                            </div>
                        </form>
                    ) : (
                        <>
                            {emailSent ? (
                                <div className="email-sent-message">
                                    <div className="success-icon">
                                        <FiMail />
                                    </div>
                                    <h3>ส่งอีเมลสำเร็จ!</h3>
                                    <p>เราได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปยัง</p>
                                    <p className="email-highlight">{formData.email}</p>
                                    <p className="hint">กรุณาตรวจสอบกล่องจดหมายของคุณ</p>
                                    <button className="btn btn-primary" onClick={handleClose}>
                                        ปิด
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleForgotPassword}>
                                    <p className="forgot-description">
                                        กรอกอีเมลที่ใช้สมัครสมาชิก เราจะส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปให้คุณ
                                    </p>

                                    <div className="form-group">
                                        <label className="form-label">อีเมล</label>
                                        <input
                                            type="email"
                                            className={`form-input ${errors.email ? 'error' : ''}`}
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            placeholder="example@email.com"
                                        />
                                        {errors.email && <span className="error-text">{errors.email}</span>}
                                    </div>

                                    <div className="form-actions">
                                        <button type="submit" className="btn btn-primary" disabled={loading}>
                                            {loading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ต'}
                                        </button>
                                    </div>

                                    <div className="back-to-change">
                                        <button type="button" onClick={() => setMode('change')}>
                                            ← กลับไปเปลี่ยนรหัสผ่าน
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
