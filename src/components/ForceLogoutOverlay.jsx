import { FiAlertTriangle, FiLogOut, FiSmartphone } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'

export default function ForceLogoutOverlay() {
    const { forceLogoutReason, signOut } = useAuth()

    if (!forceLogoutReason) return null

    const handleLogout = async () => {
        await signOut()
        window.location.href = '/login'
    }

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={iconWrapperStyle}>
                    <FiSmartphone size={36} color="#f5576c" />
                </div>

                <h2 style={titleStyle}>มีการเข้าสู่ระบบจากอุปกรณ์อื่น</h2>

                <p style={messageStyle}>
                    บัญชีของคุณถูกเข้าสู่ระบบจากอุปกรณ์ใหม่
                    <br />
                    เซสชันนี้ถูกยกเลิกแล้ว
                </p>

                <div style={warningBoxStyle}>
                    <FiAlertTriangle size={16} color="#ffc107" />
                    <span>หากไม่ใช่คุณที่เข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที</span>
                </div>

                <button onClick={handleLogout} style={buttonStyle}>
                    <FiLogOut size={18} />
                    กลับไปหน้าเข้าสู่ระบบ
                </button>
            </div>
        </div>
    )
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
