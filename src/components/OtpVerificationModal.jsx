import { useState, useEffect, useRef } from 'react'
import { FiShield, FiMail, FiAlertTriangle, FiClock, FiLock } from 'react-icons/fi'
import { verifyDeviceOtp } from '../utils/deviceSession'

export default function OtpVerificationModal({ 
    isOpen, 
    onVerified, 
    onCancel, 
    otpRequestId, 
    userId, 
    email,
    blockedUntil: initialBlockedUntil,
    otpHint,      // OTP code for testing when email isn't configured
    emailSent     // whether the OTP email was actually sent
}) {
    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [attemptsLeft, setAttemptsLeft] = useState(3)
    const [blocked, setBlocked] = useState(false)
    const [blockedUntil, setBlockedUntil] = useState(initialBlockedUntil || null)
    const [countdown, setCountdown] = useState(300) // 5 minutes in seconds
    const [blockCountdown, setBlockCountdown] = useState(0)
    const inputRefs = useRef([])

    // Focus first input on mount
    useEffect(() => {
        if (isOpen && inputRefs.current[0]) {
            setTimeout(() => inputRefs.current[0]?.focus(), 100)
        }
    }, [isOpen])

    // OTP expiry countdown
    useEffect(() => {
        if (!isOpen || countdown <= 0) return
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [isOpen])

    // Block countdown
    useEffect(() => {
        if (!blockedUntil) {
            setBlockCountdown(0)
            return
        }
        const updateBlockCountdown = () => {
            const remaining = Math.max(0, Math.ceil((new Date(blockedUntil) - new Date()) / 1000))
            setBlockCountdown(remaining)
            if (remaining <= 0) {
                setBlocked(false)
                setBlockedUntil(null)
            }
        }
        updateBlockCountdown()
        const timer = setInterval(updateBlockCountdown, 1000)
        return () => clearInterval(timer)
    }, [blockedUntil])

    // Check initial blocked state
    useEffect(() => {
        if (initialBlockedUntil && new Date(initialBlockedUntil) > new Date()) {
            setBlocked(true)
            setBlockedUntil(initialBlockedUntil)
        }
    }, [initialBlockedUntil])

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const maskEmail = (email) => {
        if (!email) return ''
        const [local, domain] = email.split('@')
        if (local.length <= 3) return `${local[0]}***@${domain}`
        return `${local.slice(0, 3)}***@${domain}`
    }

    const handleInputChange = (index, value) => {
        // Only allow digits
        const digit = value.replace(/\D/g, '').slice(-1)
        const newOtp = [...otp]
        newOtp[index] = digit
        setOtp(newOtp)
        setError('')

        // Auto-focus next input
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }

        // Auto-submit when all 6 digits are entered
        if (digit && index === 5) {
            const fullCode = newOtp.join('')
            if (fullCode.length === 6) {
                handleVerify(fullCode)
            }
        }
    }

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
        if (e.key === 'Enter') {
            const fullCode = otp.join('')
            if (fullCode.length === 6) {
                handleVerify(fullCode)
            }
        }
    }

    const handlePaste = (e) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (pasted.length > 0) {
            const newOtp = [...otp]
            for (let i = 0; i < 6; i++) {
                newOtp[i] = pasted[i] || ''
            }
            setOtp(newOtp)
            
            // Focus appropriate input
            const focusIndex = Math.min(pasted.length, 5)
            inputRefs.current[focusIndex]?.focus()

            // Auto-submit if all 6 digits pasted
            if (pasted.length === 6) {
                handleVerify(pasted)
            }
        }
    }

    const handleVerify = async (code) => {
        if (blocked || loading || countdown <= 0) return
        
        const otpCode = code || otp.join('')
        if (otpCode.length !== 6) {
            setError('กรุณากรอกรหัส OTP ให้ครบ 6 หลัก')
            return
        }

        setLoading(true)
        setError('')

        try {
            const result = await verifyDeviceOtp(otpRequestId, otpCode, userId)

            if (result.success) {
                onVerified()
            } else {
                setError(result.error || 'รหัส OTP ไม่ถูกต้อง')
                setOtp(['', '', '', '', '', ''])
                inputRefs.current[0]?.focus()

                if (result.attempts_left !== undefined) {
                    setAttemptsLeft(result.attempts_left)
                }
                if (result.blocked) {
                    setBlocked(true)
                    setBlockedUntil(result.blocked_until || new Date(Date.now() + 15 * 60 * 1000).toISOString())
                }
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={iconWrapperStyle}>
                        <FiShield size={32} color="#667eea" />
                    </div>
                    <h2 style={titleStyle}>ยืนยันตัวตน</h2>
                    <p style={subtitleStyle}>
                        ตรวจพบการเข้าสู่ระบบจากอุปกรณ์ใหม่
                    </p>
                </div>

                {/* Email info */}
                <div style={emailInfoStyle}>
                    <FiMail size={16} />
                    <span>
                        {emailSent 
                            ? <>ส่งรหัส OTP ไปยัง <strong>{maskEmail(email)}</strong></>
                            : <>กรุณากรอกรหัส OTP เพื่อยืนยันตัวตน</>
                        }
                    </span>
                </div>

                {/* OTP Hint - shown for testing until email is properly configured */}
                {otpHint && (
                    <div style={otpHintStyle}>
                        <span>🔑 รหัส OTP: <strong style={{ letterSpacing: '4px', fontSize: '18px' }}>{otpHint}</strong></span>
                    </div>
                )}

                {/* Countdown */}
                <div style={countdownStyle}>
                    <FiClock size={14} />
                    <span>
                        {countdown > 0 
                            ? `รหัสหมดอายุใน ${formatTime(countdown)}`
                            : 'รหัส OTP หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่'
                        }
                    </span>
                </div>

                {/* Blocked state */}
                {blocked && blockCountdown > 0 ? (
                    <div style={blockedStyle}>
                        <FiLock size={20} />
                        <div>
                            <strong>ถูกบล็อคชั่วคราว</strong>
                            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                                กรอก OTP ผิดเกินจำนวนครั้ง<br />
                                ลองใหม่ได้ในอีก {formatTime(blockCountdown)}
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* OTP Input */}
                        <div style={otpContainerStyle}>
                            {otp.map((digit, index) => (
                                <input
                                    key={index}
                                    ref={(el) => inputRefs.current[index] = el}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleInputChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(index, e)}
                                    onPaste={index === 0 ? handlePaste : undefined}
                                    disabled={loading || countdown <= 0}
                                    style={{
                                        ...otpInputStyle,
                                        borderColor: error ? '#f5576c' : digit ? '#667eea' : 'rgba(255,255,255,0.15)',
                                        background: digit ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255,255,255,0.05)'
                                    }}
                                />
                            ))}
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={errorStyle}>
                                <FiAlertTriangle size={14} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Attempts left */}
                        {attemptsLeft < 3 && !blocked && (
                            <p style={attemptsStyle}>
                                เหลือโอกาสอีก {attemptsLeft} ครั้ง
                            </p>
                        )}

                        {/* Verify button */}
                        <button
                            onClick={() => handleVerify()}
                            disabled={loading || otp.join('').length !== 6 || countdown <= 0}
                            style={{
                                ...verifyButtonStyle,
                                opacity: (loading || otp.join('').length !== 6 || countdown <= 0) ? 0.5 : 1
                            }}
                        >
                            {loading ? (
                                <div className="spinner" style={{ width: 20, height: 20 }}></div>
                            ) : (
                                'ยืนยันรหัส OTP'
                            )}
                        </button>
                    </>
                )}

                {/* Cancel button */}
                <button onClick={onCancel} style={cancelButtonStyle}>
                    ยกเลิก
                </button>

                {/* Warning */}
                <div style={warningStyle}>
                    <FiAlertTriangle size={14} color="#ffc107" />
                    <span>หากไม่ใช่คุณที่กำลังเข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที</span>
                </div>
            </div>
        </div>
    )
}

// Styles
const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
}

const modalStyle = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '20px',
    padding: '32px',
    maxWidth: '420px',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    textAlign: 'center'
}

const headerStyle = {
    marginBottom: '24px'
}

const iconWrapperStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(102, 126, 234, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px'
}

const titleStyle = {
    margin: '0 0 8px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#fff'
}

const subtitleStyle = {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)'
}

const emailInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'rgba(102, 126, 234, 0.1)',
    borderRadius: '10px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '12px'
}

const otpHintStyle = {
    padding: '12px 16px',
    background: 'rgba(255, 193, 7, 0.1)',
    border: '1px dashed rgba(255, 193, 7, 0.4)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#ffc107',
    marginBottom: '12px',
    textAlign: 'center'
}

const countdownStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '24px'
}

const otpContainerStyle = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginBottom: '16px'
}

const otpInputStyle = {
    width: '48px',
    height: '56px',
    textAlign: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    outline: 'none',
    transition: 'all 0.2s ease'
}

const errorStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    color: '#f5576c',
    fontSize: '13px',
    marginBottom: '12px'
}

const attemptsStyle = {
    color: '#ffc107',
    fontSize: '13px',
    margin: '0 0 12px'
}

const blockedStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    background: 'rgba(245, 87, 108, 0.1)',
    border: '1px solid rgba(245, 87, 108, 0.3)',
    borderRadius: '12px',
    color: '#f5576c',
    textAlign: 'left',
    marginBottom: '16px'
}

const verifyButtonStyle = {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '12px',
    transition: 'opacity 0.2s'
}

const cancelButtonStyle = {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    fontSize: '14px',
    cursor: 'pointer',
    marginBottom: '16px'
}

const warningStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.4)',
    padding: '8px',
    background: 'rgba(255, 193, 7, 0.05)',
    borderRadius: '8px'
}
