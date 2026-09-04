import { useState } from 'react'
import { FiShield, FiAlertTriangle, FiCheck, FiX, FiSmartphone, FiClock } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'

export default function LoginApprovalModal() {
    const { pendingLoginApproval, approvePendingLogin, rejectPendingLogin } = useAuth()
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    if (!pendingLoginApproval) return null

    const formatRequestTime = (isoString) => {
        if (!isoString) return 'เมื่อสักครู่'
        try {
            const date = new Date(isoString)
            return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        } catch {
            return 'เมื่อสักครู่'
        }
    }

    const handleApprove = async () => {
        if (submitting) return
        setSubmitting(true)
        setError('')
        try {
            const result = await approvePendingLogin(pendingLoginApproval.id || pendingLoginApproval.request_id)
            if (!result?.success) {
                setError(result?.error || 'เกิดข้อผิดพลาดในการอนุญาต')
                setSubmitting(false)
            }
            // If success, device session will be invalidated and force logout overlay takes over automatically
        } catch (err) {
            setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ')
            setSubmitting(false)
        }
    }

    const handleReject = async () => {
        if (submitting) return
        setSubmitting(true)
        setError('')
        try {
            const result = await rejectPendingLogin(pendingLoginApproval.id || pendingLoginApproval.request_id)
            if (!result?.success) {
                setError(result?.error || 'เกิดข้อผิดพลาดในการปฏิเสธ')
            }
        } catch (err) {
            setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ')
        } finally {
            setSubmitting(false)
        }
    }

    const deviceInfo = pendingLoginApproval.device_info || 'อุปกรณ์อื่น'
    const requestTime = formatRequestTime(pendingLoginApproval.created_at)

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                {/* Security Shield Icon with Pulse */}
                <div style={iconWrapperStyle}>
                    <FiShield size={36} color="#3b82f6" />
                </div>

                <h2 style={titleStyle}>ตรวจพบการเข้าสู่ระบบจากอุปกรณ์อื่น</h2>
                <p style={subtitleStyle}>
                    มีอุปกรณ์ใหม่กำลังพยายามเข้าสู่ระบบด้วยบัญชีของคุณในขณะนี้
                </p>

                {/* Device Info Card */}
                <div style={deviceCardStyle}>
                    <div style={deviceRowStyle}>
                        <FiSmartphone size={18} color="#94a3b8" />
                        <span style={deviceLabelStyle}>อุปกรณ์:</span>
                        <strong style={deviceValueStyle}>{deviceInfo}</strong>
                    </div>
                    <div style={deviceRowStyle}>
                        <FiClock size={16} color="#94a3b8" />
                        <span style={deviceLabelStyle}>เวลาที่ขอ:</span>
                        <span style={timeValueStyle}>{requestTime}</span>
                    </div>
                </div>

                {/* Impact Notice */}
                <div style={noticeBoxStyle}>
                    <FiAlertTriangle size={18} color="#eab308" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={noticeTextStyle}>
                        หากคุณกด <strong>"อนุญาต"</strong> อุปกรณ์นี้จะถูกออกจากระบบทันที เพื่อให้อุปกรณ์ใหม่เข้าใช้งานแทน
                    </div>
                </div>

                {error && (
                    <div style={errorStyle}>
                        <FiAlertTriangle size={14} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={buttonContainerStyle}>
                    <button
                        onClick={handleReject}
                        disabled={submitting}
                        style={rejectButtonStyle}
                    >
                        <FiX size={18} />
                        <span>ปฏิเสธ</span>
                    </button>

                    <button
                        onClick={handleApprove}
                        disabled={submitting}
                        style={approveButtonStyle}
                    >
                        {submitting ? (
                            <div className="spinner" style={{ width: 18, height: 18 }}></div>
                        ) : (
                            <>
                                <FiCheck size={18} />
                                <span>อนุญาต</span>
                            </>
                        )}
                    </button>
                </div>

                <div style={footerHelpStyle}>
                    หากไม่ใช่คุณที่กำลังเข้าสู่ระบบ กรุณากด <strong>ปฏิเสธ</strong> ทันที
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
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99998, // just below ForceLogoutOverlay
    padding: '20px',
    animation: 'fadeIn 0.25s ease'
}

const modalStyle = {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '24px',
    padding: '36px 28px',
    maxWidth: '440px',
    width: '100%',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(59, 130, 246, 0.15)',
    textAlign: 'center'
}

const iconWrapperStyle = {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '2px solid rgba(59, 130, 246, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)'
}

const titleStyle = {
    margin: '0 0 10px',
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.4
}

const subtitleStyle = {
    margin: '0 0 20px',
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: 1.5
}

const deviceCardStyle = {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '16px',
    textAlign: 'left'
}

const deviceRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '6px 0',
    fontSize: '14px'
}

const deviceLabelStyle = {
    color: '#64748b',
    minWidth: '65px'
}

const deviceValueStyle = {
    color: '#e2e8f0',
    fontWeight: 600,
    wordBreak: 'break-word'
}

const timeValueStyle = {
    color: '#cbd5e1'
}

const noticeBoxStyle = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    background: 'rgba(234, 179, 8, 0.08)',
    border: '1px solid rgba(234, 179, 8, 0.25)',
    borderRadius: '12px',
    marginBottom: '20px',
    textAlign: 'left'
}

const noticeTextStyle = {
    fontSize: '13px',
    color: '#fef08a',
    lineHeight: 1.5
}

const errorStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    color: '#f87171',
    fontSize: '13px',
    marginBottom: '14px'
}

const buttonContainerStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px'
}

const rejectButtonStyle = {
    padding: '14px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease'
}

const approveButtonStyle = {
    padding: '14px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
    transition: 'all 0.2s ease'
}

const footerHelpStyle = {
    fontSize: '12px',
    color: '#64748b'
}
