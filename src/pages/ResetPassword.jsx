import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FiLock, FiEye, FiEyeOff, FiCheck } from 'react-icons/fi'
import toast from 'react-hot-toast'
import './Auth.css'

export default function ResetPassword() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const [formData, setFormData] = useState({
        password: '',
        confirmPassword: ''
    })

    const [errors, setErrors] = useState({})

    useEffect(() => {
        // Check if we have a valid session from the reset link
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ')
                navigate('/login')
            }
        }
        checkSession()
    }, [navigate])

    const validate = () => {
        const newErrors = {}

        if (!formData.password) {
            newErrors.password = 'กรุณากรอกรหัสผ่านใหม่'
        } else if (formData.password.length < 6) {
            newErrors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
        }

        if (!formData.confirmPassword) {
            newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่านใหม่'
        } else if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!validate()) return

        setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({
                password: formData.password
            })

            if (error) throw error

            setSuccess(true)
            toast.success('ตั้งรหัสผ่านใหม่สำเร็จ!')

            // Redirect to login after 3 seconds
            setTimeout(() => {
                navigate('/login')
            }, 3000)
        } catch (error) {
            console.error('Error resetting password:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="auth-page">
                <div className="auth-container">
                    <div className="auth-card card animate-slideUp">
                        <div className="success-message">
                            <div className="success-icon">
                                <FiCheck />
                            </div>
                            <h2>ตั้งรหัสผ่านใหม่สำเร็จ!</h2>
                            <p>กำลังนำคุณไปยังหน้าเข้าสู่ระบบ...</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-card card animate-slideUp">
                    <div className="auth-header">
                        <div className="auth-icon">
                            <FiLock />
                        </div>
                        <h1>ตั้งรหัสผ่านใหม่</h1>
                        <p>กรอกรหัสผ่านใหม่ที่ต้องการใช้</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label">รหัสผ่านใหม่</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className={`form-input ${errors.password ? 'error' : ''}`}
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="กรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <FiEyeOff /> : <FiEye />}
                                </button>
                            </div>
                            {errors.password && <span className="error-text">{errors.password}</span>}
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

                        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                            {loading ? 'กำลังดำเนินการ...' : 'ตั้งรหัสผ่านใหม่'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
