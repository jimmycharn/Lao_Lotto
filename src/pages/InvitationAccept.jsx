import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiUserPlus, FiCheck, FiX, FiUsers, FiAlertCircle } from 'react-icons/fi'
import './Auth.css'

export default function InvitationAccept() {
    const { user, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const dealerId = searchParams.get('ref')

    const [dealerInfo, setDealerInfo] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [existingMembership, setExistingMembership] = useState(null)

    useEffect(() => {
        if (dealerId && user) {
            fetchDealerAndMembership()
        } else if (!dealerId) {
            setLoading(false)
            setError('ไม่พบลิงก์เชิญ')
        }
    }, [dealerId, user])

    async function fetchDealerAndMembership() {
        try {
            // Fetch dealer info
            const { data: dealer, error: dealerError } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('id', dealerId)
                .eq('role', 'dealer')
                .single()

            if (dealerError || !dealer) {
                setError('ไม่พบเจ้ามือนี้ในระบบ')
                setLoading(false)
                return
            }

            setDealerInfo(dealer)

            // Check if membership already exists
            const { data: membership } = await supabase
                .from('user_dealer_memberships')
                .select('*')
                .eq('user_id', user.id)
                .eq('dealer_id', dealerId)
                .single()

            if (membership) {
                setExistingMembership(membership)
            }

            setLoading(false)
        } catch (err) {
            console.error('Error fetching dealer:', err)
            setError('เกิดข้อผิดพลาด')
            setLoading(false)
        }
    }

    async function handleAccept() {
        setSubmitting(true)
        setError('')

        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .insert({
                    user_id: user.id,
                    dealer_id: dealerId,
                    status: 'pending'
                })

            if (error) {
                if (error.code === '23505') {
                    setError('คุณได้ส่งคำขอเข้าร่วมแล้ว')
                } else {
                    throw error
                }
            } else {
                setSuccess(true)
            }
        } catch (err) {
            console.error('Error accepting invitation:', err)
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setSubmitting(false)
        }
    }

    // Not logged in - redirect to register with ref
    if (!authLoading && !user) {
        return <Navigate to={`/register?ref=${dealerId}`} replace />
    }

    // Loading auth
    if (authLoading || loading) {
        return (
            <div className="auth-page">
                <div className="auth-container">
                    <div className="loading-screen" style={{ background: 'transparent', position: 'relative' }}>
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                </div>
            </div>
        )
    }

    // Success state
    if (success) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiCheck className="auth-logo success" style={{ color: 'var(--color-success)' }} />
                        <h1>ส่งคำขอสำเร็จ!</h1>
                        <p>กรุณารอเจ้ามือยืนยัน</p>
                    </div>
                    <div className="invite-dealer-card">
                        <FiUsers />
                        <span>เจ้ามือ: <strong>{dealerInfo?.full_name}</strong></span>
                    </div>
                    <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '1rem' }}>
                        เมื่อเจ้ามือยืนยันแล้ว คุณจะสามารถส่งเลขให้เจ้ามือนี้ได้
                    </p>
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate('/dashboard')}
                    >
                        ไปยังหน้าหลัก
                    </button>
                </div>
            </div>
        )
    }

    // Already has membership
    if (existingMembership) {
        const statusMessages = {
            pending: 'คุณได้ส่งคำขอไปแล้ว รอเจ้ามือยืนยัน',
            active: 'คุณเป็นสมาชิกของเจ้ามือนี้อยู่แล้ว',
            blocked: 'คุณถูกบล็อคจากเจ้ามือนี้',
            rejected: 'คำขอของคุณถูกปฏิเสธ'
        }

        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiAlertCircle className="auth-logo" style={{ color: existingMembership.status === 'active' ? 'var(--color-success)' : 'var(--color-warning)' }} />
                        <h1>{existingMembership.status === 'active' ? 'เข้าร่วมแล้ว' : 'มีสถานะอยู่แล้ว'}</h1>
                        <p>{statusMessages[existingMembership.status]}</p>
                    </div>
                    <div className="invite-dealer-card">
                        <FiUsers />
                        <span>เจ้ามือ: <strong>{dealerInfo?.full_name}</strong></span>
                    </div>
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate('/dashboard')}
                    >
                        ไปยังหน้าหลัก
                    </button>
                </div>
            </div>
        )
    }

    // Error state
    if (error && !dealerInfo) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiX className="auth-logo" style={{ color: 'var(--color-error)' }} />
                        <h1>เกิดข้อผิดพลาด</h1>
                        <p>{error}</p>
                    </div>
                    <Link to="/" className="btn btn-primary btn-lg auth-submit">
                        กลับหน้าหลัก
                    </Link>
                </div>
            </div>
        )
    }

    // Main invitation UI
    return (
        <div className="auth-page">
            <div className="auth-container animate-slideUp">
                <div className="auth-header">
                    <FiUserPlus className="auth-logo" />
                    <h1>คำเชิญเข้าร่วม</h1>
                    <p>คุณได้รับคำเชิญจากเจ้ามือ</p>
                </div>

                <div className="invite-dealer-card">
                    <FiUsers />
                    <span>เจ้ามือ: <strong>{dealerInfo?.full_name}</strong></span>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <p style={{ textAlign: 'center', opacity: 0.7 }}>
                    หากตอบรับ คุณจะสามารถส่งเลขให้เจ้ามือนี้ได้หลังจากที่เจ้ามือยืนยันสมาชิก
                </p>

                <div className="invite-actions">
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleAccept}
                        disabled={submitting}
                        style={{ flex: 1 }}
                    >
                        {submitting ? (
                            <div className="spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            <>
                                <FiCheck /> ตอบรับ
                            </>
                        )}
                    </button>
                    <button
                        className="btn btn-secondary btn-lg"
                        onClick={() => navigate('/dashboard')}
                        disabled={submitting}
                        style={{ flex: 1 }}
                    >
                        <FiX /> ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    )
}
