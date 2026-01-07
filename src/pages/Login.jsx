import { useState, useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiGift } from 'react-icons/fi'
import './Auth.css'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { signIn, user, profile, loading: authLoading, isDealer, isSuperAdmin } = useAuth()
    const navigate = useNavigate()

    // Reset local loading state if authLoading finishes
    useEffect(() => {
        if (!authLoading) {
            setLoading(false)
        }
    }, [authLoading])

    // If user is already logged in and profile is loaded, redirect based on role
    if (user && profile && !authLoading) {
        // Only dealers go to dealer dashboard
        if (isDealer) {
            return <Navigate to="/dealer" replace />
        }
        // Regular users and superadmin go to user dashboard
        return <Navigate to="/dashboard" replace />
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const { error: signInError } = await signIn(email, password)
            if (signInError) {
                let msg = signInError.message
                if (msg === 'Invalid login credentials') msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
                else if (msg.includes('Email not confirmed')) msg = 'กรุณายืนยันอีเมลในกล่องข้อความของคุณก่อนเข้าสู่ระบบ'
                setError(msg)
                setLoading(false)
            }
            // On success, authLoading will become true while fetching profile,
            // and the useEffect above will reset loading when it's done.
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-container animate-slideUp">
                <div className="auth-header">
                    <FiGift className="auth-logo" />
                    <h1>เข้าสู่ระบบ</h1>
                    <p>ยินดีต้อนรับกลับมา!</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

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
                                placeholder="••••••••"
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

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg auth-submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <div className="spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            'เข้าสู่ระบบ'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        ยังไม่มีบัญชี?{' '}
                        <Link to="/register">สมัครสมาชิก</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
