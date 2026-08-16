import { FiAlertTriangle, FiLogOut, FiSmartphone } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'

export default function ForceLogoutOverlay() {
    const { forceLogoutReason, signOut, pendingOtp } = useAuth()

    if (!forceLogoutReason || pendingOtp) return null

    const handleLogout = async () => {
        await signOut()
        window.location.href = '/login'
    }

    const content = LOGOUT_MESSAGES[forceLogoutReason] || LOGOUT_MESSAGES.DEFAULT

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={iconWrapperStyle}>
                    {content.icon === 'device' ? (
                        <FiSmartphone size={36} color="#f5576c" />
                    ) : (
                        <FiAlertTriangle size={36} color="#f5576c" />
                    )}
                </div>

                <h2 style={titleStyle}>{content.title}</h2>

                <p style={messageStyle}>
                    {content.lines.map((line, i) => (
                        <span key={i}>
                            {line}
                            {i < content.lines.length - 1 && <br />}
                        </span>
                    ))}
                </p>

                <div style={warningBoxStyle}>
                    <FiAlertTriangle size={16} color="#ffc107" />
                    <span>{content.warning}</span>
                </div>

                <button onClick={handleLogout} style={buttonStyle}>
                    <FiLogOut size={18} />
                    กลับไปหน้าเข้าสู่ระบบ
                </button>
            </div>
        </div>
    )
}

// Keyed by the reason reported from AuthContext / check_session_valid.
// Only 'new_device_login' means another device really took over the session —
// every other reason must NOT claim that, otherwise users get a misleading
// "logged in from another device" message for an ordinary expired session.
const LOGOUT_MESSAGES = {
    ACCOUNT_BLOCKED: {
        icon: 'alert',
        title: 'บัญชีของคุณถูกระงับการใช้งาน',
        lines: ['บัญชีของคุณถูกบล็อกการใช้งาน', 'กรุณาติดต่อ Admin เพื่อขอให้ปลดบล็อกให้ต่อไป'],
        warning: 'ติดต่อ Admin เพื่อขอความช่วยเหลือ'
    },
    new_device_login: {
        icon: 'device',
        title: 'มีการเข้าสู่ระบบจากอุปกรณ์อื่น',
        lines: ['บัญชีของคุณถูกเข้าสู่ระบบจากอุปกรณ์ใหม่', 'เซสชันนี้ถูกยกเลิกแล้ว'],
        warning: 'หากไม่ใช่คุณที่เข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที'
    },
    admin_force: {
        icon: 'alert',
        title: 'เซสชันถูกยกเลิกโดยผู้ดูแลระบบ',
        lines: ['ผู้ดูแลระบบได้ยกเลิกเซสชันนี้', 'กรุณาเข้าสู่ระบบใหม่'],
        warning: 'ติดต่อ Admin หากต้องการข้อมูลเพิ่มเติม'
    },
    DEFAULT: {
        icon: 'alert',
        title: 'เซสชันหมดอายุ',
        lines: ['เซสชันการใช้งานของคุณสิ้นสุดลงแล้ว', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง'],
        warning: 'หากพบปัญหานี้บ่อยครั้ง กรุณาแจ้ง Admin'
    }
}

const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '20px',
    animation: 'fadeIn 0.3s ease'
}

const modalStyle = {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '20px',
    padding: '40px 32px',
    maxWidth: '400px',
    width: '100%',
    border: '1px solid rgba(245, 87, 108, 0.3)',
    boxShadow: '0 20px 60px rgba(245, 87, 108, 0.15)',
    textAlign: 'center'
}

const iconWrapperStyle = {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'rgba(245, 87, 108, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px'
}

const titleStyle = {
    margin: '0 0 12px',
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff'
}

const messageStyle = {
    margin: '0 0 20px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.6
}

const warningBoxStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'rgba(255, 193, 7, 0.08)',
    border: '1px solid rgba(255, 193, 7, 0.2)',
    borderRadius: '10px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '24px'
}

const buttonStyle = {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #f5576c 0%, #ff6b6b 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
}
