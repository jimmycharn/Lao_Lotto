import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiGift } from 'react-icons/fi'
import { checkDeviceSession, sendOtpEmail } from '../utils/deviceSession'
import OtpVerificationModal from '../components/OtpVerificationModal'
import './Auth.css'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showOtpModal, setShowOtpModal] = useState(false)
    const [otpData, setOtpData] = useState(null) // { otpRequestId, userId, email, blockedUntil }
    const [pendingSession, setPendingSession] = useState(null) // store Supabase session temporarily
    const { signIn, signOut, user, profile, loading: authLoading, isDealer, isSuperAdmin } = useAuth()
    const navigate = useNavigate()

    const loadingTimerRef = useRef(null)

    // Reset local loading state if authLoading finishes
    useEffect(() => {
        if (!authLoading) {
            setLoading(false)
        }
    }, [authLoading])

    // Safety: spinner can never be stuck for more than 12 seconds
    useEffect(() => {
        if (loading) {
            loadingTimerRef.current = setTimeout(() => {
                console.warn('Login safety timeout: forcing loading=false')
                setLoading(false)
                setError('การเข้าสู่ระบบใช้เวลานาน กรุณาลองใหม่อีกครั้ง')
            }, 12000)
        } else {
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current)
                loadingTimerRef.current = null
            }
        }
        return () => {
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
        }
    }, [loading])

    // If user is already logged in and profile is loaded, redirect based on role
    // But NOT if we're showing OTP modal (pending verification)
    if (user && profile && !authLoading && !showOtpModal) {
        // Super Admin goes to Super Admin dashboard
        if (isSuperAdmin) {
            return <Navigate to="/superadmin" replace />
        }
        // Dealers go to dealer dashboard
        if (isDealer) {
            return <Navigate to="/dealer" replace />
        }
        // Regular users go to user dashboard
        return <Navigate to="/dashboard" replace />
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            // Step 1: Authenticate with Supabase
            const { data, error: signInError } = await signIn(email, password)
            if (signInError) {
                let msg = signInError.message
                if (msg === 'Invalid login credentials') msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
                else if (msg.includes('Email not confirmed')) msg = 'กรุณายืนยันอีเมลในกล่องข้อความของคุณก่อนเข้าสู่ระบบ'
                setError(msg)
                setLoading(false)
                return
            }

            // Step 2: Check device session
            const userId = data?.user?.id
            if (userId) {
                try {
                    const sessionResult = await checkDeviceSession(userId)

                    if (sessionResult.needs_otp) {
                        // Need OTP verification - user has active session on another device
                        if (sessionResult.blocked) {
                            setError(`ถูกบล็อคเนื่องจากกรอก OTP ผิดหลายครั้ง ลองใหม่ได้ในอีกสักครู่`)
                            // Sign out since we can't proceed
                            await signOut()
                            setLoading(false)
                            return
                        }

                        // Send OTP email
                        const emailResult = await sendOtpEmail(
                            sessionResult.email,
                            sessionResult.otp_code,
                            null
                        )

                        if (!emailResult.success) {
                            console.error('Failed to send OTP email:', emailResult.error)
                            // Even if email fails, still show OTP modal
                            // (user might not receive email but we show error)
                        }

                        // Store OTP data and show modal
                        setOtpData({
                            otpRequestId: sessionResult.otp_request_id,
                            userId: userId,
                            email: sessionResult.email,
                            blockedUntil: sessionResult.blocked_until || null
                        })
                        setPendingSession(data)

                        // Sign out temporarily - will re-authenticate after OTP
                        await signOut()
                        setShowOtpModal(true)
                        setLoading(false)
                        return
                    }

                    // No OTP needed - session created, proceed normally
                } catch (sessionErr) {
                    console.error('Device session check failed:', sessionErr)
                    // If session check fails, allow login anyway (graceful degradation)
                }
            }

            // Login successful - onAuthStateChange will handle profile fetching
            // Keep loading=true until authLoading becomes false (handled by useEffect)
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
            setLoading(false)
        }
    }

    const handleOtpVerified = async () => {
        // OTP verified successfully - re-authenticate
        setShowOtpModal(false)
        setOtpData(null)
        setLoading(true)

        try {
            const { data, error: signInError } = await signIn(email, password)
            if (signInError) {
                setError('เกิดข้อผิดพลาด กรุณาเข้าสู่ระบบใหม่')
                setLoading(false)
                return
            }
            // Successfully re-authenticated after OTP - let normal flow proceed
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาเข้าสู่ระบบใหม่')
            setLoading(false)
        }
    }

    const handleOtpCancel = async () => {
        setShowOtpModal(false)
        setOtpData(null)
        setPendingSession(null)
        setLoading(false)
    }

    return (
        <div className="auth-page">
            <div className="auth-container">
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

            {/* OTP Verification Modal */}
            {showOtpModal && otpData && (
                <OtpVerificationModal
                    isOpen={showOtpModal}
                    onVerified={handleOtpVerified}
                    onCancel={handleOtpCancel}
                    otpRequestId={otpData.otpRequestId}
                    userId={otpData.userId}
                    email={otpData.email}
                    blockedUntil={otpData.blockedUntil}
                />
            )}
        </div>
    )
}
