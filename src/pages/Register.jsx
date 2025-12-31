import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiGift } from 'react-icons/fi'
import './Auth.css'

export default function Register() {
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const { signUp } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const dealerId = searchParams.get('ref')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('รหัสผ่านไม่ตรงกัน')
            return
        }

        if (password.length < 6) {
            setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
            return
        }

        setLoading(true)

        try {
            const { data, error } = await signUp(email, password, fullName)

            if (error) {
                let msg = error.message
                if (msg === 'User already registered') msg = 'อีเมลนี้ถูกใช้งานแล้ว'
                setError(msg)
            } else {
                // Create profile
                if (data.user) {
                    await supabase.from('profiles').insert({
                        id: data.user.id,
                        email: email,
                        full_name: fullName,
                        role: 'user',
                        balance: 0,
                        dealer_id: dealerId || null
                    })
                }

                if (data.session) {
                    navigate('/')
                } else {
                    setSuccess(true)
                }
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiGift className="auth-logo success" />
                        <h1>สมัครสำเร็จ!</h1>
                        <p>กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี</p>
                    </div>
                    <Link to="/login" className="btn btn-primary btn-lg auth-submit">
                        ไปยังหน้าเข้าสู่ระบบ
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="auth-page">
            <div className="auth-container animate-slideUp">
                <div className="auth-header">
                    <FiGift className="auth-logo" />
                    <h1>สมัครสมาชิก</h1>
                    <p>เริ่มต้นเสี่ยงโชคกับเรา</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">ชื่อ-นามสกุล</label>
                        <div className="input-wrapper">
                            <FiUser className="input-icon" />
                            <input
                                type="text"
                                className="form-input with-icon"
                                placeholder="ชื่อของคุณ"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">อีเมล</label>
                        <div className="input-wrapper">
                            <FiMail className="input-icon" />
                            <input
                                type="email"
                                className="form-input with-icon"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">รหัสผ่าน</label>
                        <div className="input-wrapper">
                            <FiLock className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input with-icon"
                                placeholder="อย่างน้อย 6 ตัวอักษร"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <FiEyeOff /> : <FiEye />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">ยืนยันรหัสผ่าน</label>
                        <div className="input-wrapper">
                            <FiLock className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input with-icon"
                                placeholder="ยืนยันรหัสผ่าน"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg auth-submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <div className="spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            'สมัครสมาชิก'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        มีบัญชีอยู่แล้ว?{' '}
                        <Link to="/login">เข้าสู่ระบบ</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
