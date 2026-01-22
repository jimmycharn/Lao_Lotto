import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiGift, FiUsers } from 'react-icons/fi'
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
    const [dealerInfo, setDealerInfo] = useState(null)
    const { signUp, user, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const dealerId = searchParams.get('ref')
    const registerRole = searchParams.get('role') // For dealer registration
    const isDealerRegistration = registerRole === 'dealer'

    // Fetch dealer info if ref exists
    useEffect(() => {
        if (dealerId) {
            fetchDealerInfo()
        }
    }, [dealerId])

    async function fetchDealerInfo() {
        const { data } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', dealerId)
            .single()

        if (data) {
            setDealerInfo(data)
        }
    }

    // Redirect if already logged in (after all hooks)
    if (user && !authLoading) {
        if (dealerId) {
            return <Navigate to={`/invite?ref=${dealerId}`} replace />
        }
        return <Navigate to="/dashboard" replace />
    }

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
            // Pass role for dealer registration, but don't pass dealer_id anymore
            // Membership will be created separately
            const role = isDealerRegistration ? 'dealer' : 'user'
            const { data, error } = await signUp(email, password, fullName, null, role)

            if (error) {
                let msg = error.message
                if (msg === 'User already registered') msg = 'อีเมลนี้ถูกใช้งานแล้ว'
                setError(msg)
                setLoading(false)
            } else {
                // Profile is auto-created by database trigger

                // If there's a dealer ref, create a pending membership
                if (dealerId && data.user && !isDealerRegistration) {
                    try {
                        const { error: membershipError } = await supabase
                            .from('user_dealer_memberships')
                            .insert({
                                user_id: data.user.id,
                                dealer_id: dealerId,
                                status: 'pending'
                            })

                        if (membershipError) {
                            console.error('Error creating membership:', membershipError)
                            // Don't fail registration if membership creation fails
                        }
                    } catch (membershipErr) {
                        console.error('Error creating membership:', membershipErr)
                    }
                }

                // Handle redirect or success message
                if (data.session) {
                    // Auto login successful - redirect based on role
                    navigate(isDealerRegistration ? '/dealer' : '/dashboard')
                } else {
                    // Email confirmation required
                    setSuccess(true)
                    setLoading(false)
                }
            }
        } catch (err) {
            console.error('Registration error:', err)
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiGift className={`auth-logo success ${isDealerRegistration ? 'dealer' : ''}`} />
                        <h1>สมัครสำเร็จ!</h1>
                        <p>กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี</p>
                        {isDealerRegistration ? (
                            <p className="dealer-welcome">คุณสมัครเป็นเจ้ามือสำเร็จแล้ว!</p>
                        ) : dealerInfo && (
                            <p className="dealer-welcome">คุณเป็นสมาชิกของ {dealerInfo.full_name} แล้ว</p>
                        )}
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
                    <FiGift className={`auth-logo ${isDealerRegistration ? 'dealer' : ''}`} />
                    <h1>{isDealerRegistration ? 'สมัครเป็นเจ้ามือ' : 'สมัครสมาชิก'}</h1>
                    {isDealerRegistration ? (
                        <div className="referral-info dealer">
                            <FiUsers />
                            <span>เริ่มต้นเป็นเจ้ามือในระบบ Big Lotto</span>
                        </div>
                    ) : dealerInfo ? (
                        <div className="referral-info">
                            <FiUsers />
                            <span>เจ้ามือ: <strong>{dealerInfo.full_name}</strong></span>
                        </div>
                    ) : (
                        <p>เริ่มต้นเสี่ยงโชคกับเรา</p>
                    )}
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
