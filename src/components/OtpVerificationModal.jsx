import { useState, useEffect, useRef } from 'react'
import { FiShield, FiMail, FiAlertTriangle, FiClock, FiLock, FiCheckCircle, FiXCircle, FiSmartphone } from 'react-icons/fi'
import { verifyDeviceOtp, subscribeToLoginRequests } from '../utils/deviceSession'
import { supabase } from '../lib/supabase'

export default function OtpVerificationModal({ 
    isOpen, 
    onVerified, 
    onCancel, 
    onRejected,
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
    const [remoteApproved, setRemoteApproved] = useState(false)
    const [remoteRejected, setRemoteRejected] = useState(false)
    const inputRefs = useRef([])
    const isProcessingRef = useRef(false)

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

    // ── Subscribe to Realtime decisions from Device A (Approve / Reject) ──
    useEffect(() => {
        if (!isOpen || !userId || !otpRequestId) return

        const handleDecision = (record) => {
            const reqId = record?.id || record?.requestId || record?.request_id
            if (reqId && reqId !== otpRequestId) return

            const status = record?.status
            if (status === 'approved') {
                if (isProcessingRef.current) return
                isProcessingRef.current = true
                setRemoteApproved(true)
                setTimeout(() => {
                    onVerified()
                }, 800)
            } else if (status === 'rejected') {
                if (isProcessingRef.current) return
                isProcessingRef.current = true
                setRemoteRejected(true)
                setTimeout(() => {
                    if (onRejected) {
                        onRejected('ท่านถูกปฏิเสธการใช้งานบัญชี')
                    } else {
                        onCancel()
                    }
                }, 1500)
            }
        }

        // 1. Realtime subscription (Postgres Changes + Broadcast)
        const unsubscribe = subscribeToLoginRequests(userId, {
            onStatusChange: handleDecision
        })

        // 2. Periodic Polling fallback (every 2.5s) to ensure zero dropouts
        const pollInterval = setInterval(async () => {
            if (isProcessingRef.current || !supabase) return
            try {
                const { data, error: pollErr } = await supabase
                    .from('login_otp_requests')
                    .select('status')
                    .eq('id', otpRequestId)
                    .single()

                if (!pollErr && data?.status) {
                    if (data.status === 'approved' || data.status === 'rejected') {
                        handleDecision({ id: otpRequestId, status: data.status })
                    }
                }
            } catch (_) {}
        }, 2500)

        return () => {
            unsubscribe()
            clearInterval(pollInterval)
        }
    }, [isOpen, userId, otpRequestId, onVerified, onRejected, onCancel])

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
            
            const focusIndex = Math.min(pasted.length, 5)
            inputRefs.current[focusIndex]?.focus()

            if (pasted.length === 6) {
                handleVerify(pasted)
            }
        }
    }

    const handleVerify = async (code) => {
        if (blocked || loading || countdown <= 0 || isProcessingRef.current) return
        
        const otpCode = code || otp.join('')
        if (otpCode.length !== 6) {
            setError('กรุณากรอกรหัส PIN ให้ครบ 6 หลัก')
            return
        }

        setLoading(true)
        setError('')

        try {
            const result = await verifyDeviceOtp(otpRequestId, otpCode, userId)

            if (result.success) {
                isProcessingRef.current = true
                onVerified()
            } else if (result.rejected) {
                isProcessingRef.current = true
                setRemoteRejected(true)
                setTimeout(() => {
                    if (onRejected) {
                        onRejected(result.error || 'ท่านถูกปฏิเสธการใช้งานบัญชี')
                    } else {
                        onCancel()
                    }
                }, 1500)
            } else {
                let errMsg = result.error || 'รหัส PIN ไม่ถูกต้อง'
                if (errMsg.includes('OTP')) {
                    errMsg = errMsg.replace(/OTP/gi, 'PIN')
                }
                setError(errMsg)
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
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
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
                        <FiShield size={34} color="#667eea" />
                    </div>
                    <h2 style={titleStyle}>ยืนยันการเข้าสู่ระบบ</h2>
                    <p style={subtitleStyle}>
                        ตรวจพบว่าบัญชีนี้มีการเข้าใช้งานอยู่บนอุปกรณ์อื่น
                    </p>
                </div>

                {/* State: Device A Approved! */}
                {remoteApproved && (
                    <div style={approvedBannerStyle}>
                        <FiCheckCircle size={28} color="#10b981" />
                        <div>
                            <strong style={{ display: 'block', fontSize: '15px', color: '#10b981' }}>
                                ได้รับการอนุญาตแล้ว!
                            </strong>
                            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                                กำลังเข้าสู่ระบบ...
                            </span>
                        </div>
                    </div>
                )}

                {/* State: Device A Rejected! */}
                {remoteRejected && (
                    <div style={rejectedBannerStyle}>
                        <FiXCircle size={28} color="#ef4444" />
                        <div>
                            <strong style={{ display: 'block', fontSize: '15px', color: '#ef4444' }}>
                                ท่านถูกปฏิเสธการใช้งานบัญชี
                            </strong>
                            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                                อุปกรณ์เดิมไม่อนุญาตให้เข้าใช้งานบัญชีนี้
                            </span>
                        </div>
                    </div>
                )}

                {!remoteApproved && !remoteRejected && (
                    <>
                        {/* Section 1: Real-time Device Approval Card */}
                        <div style={deviceWaitingCardStyle}>
                            <div style={waitingHeaderStyle}>
                                <span style={pulseDotStyle}></span>
                                <FiSmartphone size={16} color="#60a5fa" />
                                <strong style={{ color: '#93c5fd', fontSize: '14px' }}>
                                    กำลังรอการอนุญาตจากอุปกรณ์เดิม...
                                </strong>
                            </div>
                            <p style={waitingDescStyle}>
                                ระบบได้ส่งการแจ้งเตือนไปยังหน้าจออุปกรณ์เดิมแล้ว หากคุณเปิดอุปกรณ์นั้นอยู่ สามารถกดปุ่ม <strong>[อนุญาต]</strong> ที่หน้าจอนั้นเพื่อเข้าใช้งานได้ทันที
                            </p>
                        </div>

                        {/* Divider */}
                        <div style={dividerStyle}>
                            <span style={dividerLineStyle}></span>
                            <span style={dividerTextStyle}>หรือ กรอกรหัส PIN 6 หลักจากอีเมล</span>
                            <span style={dividerLineStyle}></span>
                        </div>

                        {/* Email Info */}
                        <div style={emailInfoStyle}>
                            <FiMail size={15} color="#94a3b8" />
                            <span>
                                ส่งรหัส PIN 6 หลักไปยัง <strong>{maskEmail(email)}</strong>
                            </span>
                        </div>


                        {/* Countdown */}
                        <div style={countdownStyle}>
                            <FiClock size={14} />
                            <span>
                                {countdown > 0 
                                    ? `รหัส PIN หมดอายุใน ${formatTime(countdown)}`
                                    : 'รหัส PIN หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่'
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
                                        กรอกรหัสผิดเกินจำนวนครั้ง<br />
                                        ลองใหม่ได้ในอีก {formatTime(blockCountdown)}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* 6-Digit PIN Inputs */}
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
                                                background: digit ? 'rgba(102, 126, 234, 0.12)' : 'rgba(255,255,255,0.05)'
                                            }}
                                        />
                                    ))}
                                </div>

                                {/* Error message */}
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
                                        'ยืนยันรหัส PIN'
                                    )}
                                </button>
                            </>
                        )}
                    </>
                )}

                {/* Cancel button */}
                <button onClick={onCancel} style={cancelButtonStyle}>
                    ยกเลิก
                </button>

                {/* Footer Warning */}
                <div style={warningStyle}>
                    <FiAlertTriangle size={13} color="#ffc107" />
                    <span>หากคุณไม่ได้เป็นผู้เข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที</span>
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
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
}

const modalStyle = {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '24px',
    padding: '32px 28px',
    maxWidth: '440px',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
    textAlign: 'center'
}

const headerStyle = {
    marginBottom: '20px'
}

const iconWrapperStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(102, 126, 234, 0.15)',
    border: '1px solid rgba(102, 126, 234, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px'
}

const titleStyle = {
    margin: '0 0 6px',
    fontSize: '21px',
    fontWeight: 700,
    color: '#fff'
}

const subtitleStyle = {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)'
}

const deviceWaitingCardStyle = {
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '14px',
    padding: '14px',
    marginBottom: '16px',
    textAlign: 'left'
}

const waitingHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px'
}

const pulseDotStyle = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#38bdf8',
    boxShadow: '0 0 8px #38bdf8',
    animation: 'pulse 1.5s infinite'
}

const waitingDescStyle = {
    margin: 0,
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.5
}

const dividerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '16px 0'
}

const dividerLineStyle = {
    flex: 1,
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)'
}

const dividerTextStyle = {
    fontSize: '12px',
    color: '#64748b',
    whiteSpace: 'nowrap'
}

const approvedBannerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    borderRadius: '14px',
    margin: '20px 0',
    textAlign: 'left'
}

const rejectedBannerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '14px',
    margin: '20px 0',
    textAlign: 'left'
}

const emailInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '10px'
}


const countdownStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '16px'
}

const otpContainerStyle = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginBottom: '14px'
}

const otpInputStyle = {
    width: '46px',
    height: '52px',
    textAlign: 'center',
    fontSize: '22px',
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
    color: '#f87171',
    fontSize: '13px',
    marginBottom: '12px'
}

const attemptsStyle = {
    color: '#fbbf24',
    fontSize: '12px',
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
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '10px',
    transition: 'opacity 0.2s'
}

const cancelButtonStyle = {
    width: '100%',
    padding: '11px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    fontSize: '13px',
    cursor: 'pointer',
    marginBottom: '14px'
}

const warningStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.4)',
    padding: '6px',
    background: 'rgba(255, 193, 7, 0.05)',
    borderRadius: '8px'
}
