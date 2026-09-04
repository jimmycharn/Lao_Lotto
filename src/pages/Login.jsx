import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiGift } from 'react-icons/fi'
import { checkDeviceSession } from '../utils/deviceSession'
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
    const [pendingOtpUserId, setPendingOtpUserId] = useState(null) // userId waiting for OTP
    const { signIn, signOut, user, profile, loading: authLoading, isDealer, isSuperAdmin, setPendingOtp, pendingOtp } = useAuth()
    const navigate = useNavigate()

    const loadingTimerRef = useRef(null)
    const isSubmittingRef = useRef(false)

    // Reset local loading state if authLoading finishes
    // But NOT if we're in the middle of submitting or OTP verification
    useEffect(() => {
        if (!authLoading && !showOtpModal && !isSubmittingRef.current) {
            setLoading(false)
        }
    }, [authLoading, showOtpModal])

    // Safety: spinner can never be stuck for more than 12 seconds
    useEffect(() => {
        if (loading) {
            loadingTimerRef.current = setTimeout(() => {
                console.warn('Login safety timeout: forcing loading=false')
                isSubmittingRef.current = false
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
    // But NEVER redirect if we are currently submitting, checking device, or showing OTP modal!
    const isChallengedOrSubmitting = 
        loading || 
        showOtpModal || 
        pendingOtpUserId || 
        pendingOtp || 
        otpData || 
        isSubmittingRef.current

    if (user && profile && !authLoading && !isChallengedOrSubmitting) {
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
        isSubmittingRef.current = true
        setPendingOtpUserId(true) // Immediately block redirect before ANY await!
        setPendingOtp(true)

        try {
            // Step 1: Authenticate with Supabase
            const { data, error: signInError } = await signIn(email, password)
            if (signInError) {
                let msg = signInError.message
                if (msg === 'Invalid login credentials') msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
                else if (msg.includes('Email not confirmed')) msg = 'กรุณายืนยันอีเมลในกล่องข้อความของคุณก่อนเข้าสู่ระบบ'
                setError(msg)
                isSubmittingRef.current = false
                setPendingOtpUserId(null)
                setPendingOtp(false)
                setLoading(false)
                return
            }

            const userId = data?.user?.id
            if (userId) {
                // Check if account is blocked (is_active === false)
                const { data: profileCheck } = await supabase
                    .from('profiles')
                    .select('is_active')
                    .eq('id', userId)
                    .single()

                if (profileCheck && profileCheck.is_active === false) {
                    setError('บัญชีนี้ถูกระงับการใช้งาน (โดนบล็อก) กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้')
                    isSubmittingRef.current = false
                    setPendingOtpUserId(null)
                    setPendingOtp(false)
                    await signOut()
                    setLoading(false)
                    return
                }

                try {
                    console.log('Checking device session for user:', userId)
                    setPendingOtpUserId(userId)
                    const sessionResult = await checkDeviceSession(userId)
                    console.log('Device session result:', sessionResult)

                    if (sessionResult.needs_otp) {
                        // Need OTP verification - user has active session on another device
                        if (sessionResult.blocked) {
                            setError(`ถูกบล็อคเนื่องจากกรอก OTP ผิดหลายครั้ง ลองใหม่ได้ในอีกสักครู่`)
                            isSubmittingRef.current = false
                            setPendingOtpUserId(null)
                            setPendingOtp(false)
                            await signOut({ skipDeviceInvalidation: true })
                            setLoading(false)
                            return
                        }

                        // Store OTP data and show modal
                        // Keep user on Login page with OTP modal
                        setOtpData({
                            otpRequestId: sessionResult.otp_request_id,
                            userId: userId,
                            email: sessionResult.email,
                            blockedUntil: sessionResult.blocked_until || null,
                            emailSent: sessionResult.email_sent === true
                        })
                        setShowOtpModal(true)
                        setLoading(false)
                        console.log('OTP modal shown, user stays on login page to verify')
                        return
                    }

                    // No OTP needed (first device login or superadmin)
                    isSubmittingRef.current = false
                    setPendingOtpUserId(null)
                    setPendingOtp(false)
                    setLoading(false)
                    console.log('No OTP needed, session created')
                } catch (sessionErr) {
                    console.error('Device session check failed:', sessionErr)
                    isSubmittingRef.current = false
                    setPendingOtpUserId(null)
                    setPendingOtp(false)
                    setLoading(false)
                }
            } else {
                isSubmittingRef.current = false
                setPendingOtpUserId(null)
                setPendingOtp(false)
                setLoading(false)
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
            isSubmittingRef.current = false
            setPendingOtpUserId(null)
            setPendingOtp(false)
            setLoading(false)
        }
    }

    const handleOtpVerified = async () => {
        // OTP verified successfully (either via Device A approval or PIN entered)
        isSubmittingRef.current = false
        setShowOtpModal(false)
        setOtpData(null)
        setPendingOtpUserId(null)
        setPendingOtp(false)
        setLoading(false)
    }

    const handleOtpCancel = async () => {
        isSubmittingRef.current = false
        setShowOtpModal(false)
        setOtpData(null)
        setPendingOtpUserId(null)
        setPendingOtp(false)
        setLoading(false)
        await signOut({ skipDeviceInvalidation: true })
    }

    const handleOtpRejected = async (reason) => {
        isSubmittingRef.current = false
        setShowOtpModal(false)
        setOtpData(null)
        setPendingOtpUserId(null)
        setPendingOtp(false)
        setLoading(false)
        setError(reason || 'ท่านถูกปฏิเสธการใช้งานบัญชี')
        await signOut({ skipDeviceInvalidation: true })
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

            </div>

            {/* OTP Verification Modal */}
            {showOtpModal && otpData && (
                <OtpVerificationModal
                    isOpen={showOtpModal}
                    onVerified={handleOtpVerified}
                    onCancel={handleOtpCancel}
                    onRejected={handleOtpRejected}
                    otpRequestId={otpData.otpRequestId}
                    userId={otpData.userId}
                    email={otpData.email}
                    blockedUntil={otpData.blockedUntil}
                    emailSent={otpData.emailSent}
                />
            )}
        </div>
    )
}
