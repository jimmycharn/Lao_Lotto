import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiUserPlus, FiCheck, FiX, FiUsers, FiAlertCircle, FiLink } from 'react-icons/fi'
import './Auth.css'

export default function InvitationAccept() {
    const { user, profile, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const dealerId = searchParams.get('ref')

    const [dealerInfo, setDealerInfo] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [existingMembership, setExistingMembership] = useState(null)
    const [existingUpstreamLink, setExistingUpstreamLink] = useState(null)
    const [isCurrentUserDealer, setIsCurrentUserDealer] = useState(false)

    useEffect(() => {
        if (dealerId && user) {
            fetchDealerAndMembership()
        } else if (!dealerId) {
            setLoading(false)
            setError('ไม่พบลิงก์เชิญ')
        }
    }, [dealerId, user, profile])

    async function fetchDealerAndMembership() {
        try {
            // Check if current user is a dealer
            const { data: currentUserProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            
            const userIsDealer = currentUserProfile?.role === 'dealer'
            setIsCurrentUserDealer(userIsDealer)

            // Fetch target dealer info
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

            // Check if trying to link to self
            if (dealerId === user.id) {
                setError('ไม่สามารถเชื่อมต่อกับตัวเองได้')
                setLoading(false)
                return
            }

            setDealerInfo(dealer)

            if (userIsDealer) {
                // Check if upstream link already exists
                const { data: upstreamLink } = await supabase
                    .from('dealer_upstream_connections')
                    .select('*')
                    .eq('dealer_id', user.id)
                    .eq('upstream_dealer_id', dealerId)
                    .single()

                if (upstreamLink) {
                    setExistingUpstreamLink(upstreamLink)
                }
            } else {
                // Check if membership already exists (for regular users)
                const { data: membership } = await supabase
                    .from('user_dealer_memberships')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('dealer_id', dealerId)
                    .single()

                if (membership) {
                    setExistingMembership(membership)
                }
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
            if (isCurrentUserDealer) {
                // Dealer linking to upstream dealer - status pending until approved
                const { error } = await supabase
                    .from('dealer_upstream_connections')
                    .insert({
                        dealer_id: user.id,
                        upstream_dealer_id: dealerId,
                        upstream_name: dealerInfo?.full_name || 'เจ้ามือ',
                        is_linked: true,
                        status: 'pending'
                    })

                if (error) {
                    if (error.code === '23505') {
                        setError('คุณได้ส่งคำขอเชื่อมต่อแล้ว')
                    } else {
                        throw error
                    }
                } else {
                    setSuccess(true)
                }
            } else {
                // Regular user joining dealer
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
                        {isCurrentUserDealer ? <FiLink /> : <FiUsers />}
                        <span>{isCurrentUserDealer ? 'เชื่อมต่อกับ' : 'เจ้ามือ'}: <strong>{dealerInfo?.full_name}</strong></span>
                    </div>
                    <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '1rem' }}>
                        {isCurrentUserDealer 
                            ? 'เมื่อเจ้ามือยืนยันแล้ว คุณจะสามารถตีออกยอดไปให้เจ้ามือนี้ได้'
                            : 'เมื่อเจ้ามือยืนยันแล้ว คุณจะสามารถส่งเลขให้เจ้ามือนี้ได้'
                        }
                    </p>
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate(isCurrentUserDealer ? '/dealer' : '/dashboard')}
                    >
                        {isCurrentUserDealer ? 'ไปยังหน้าเจ้ามือ' : 'ไปยังหน้าหลัก'}
                    </button>
                </div>
            </div>
        )
    }

    async function handleReapply() {
        setSubmitting(true)
        setError('')

        try {
            const { error } = await supabase
                .from('user_dealer_memberships')
                .update({ status: 'pending' })
                .eq('id', existingMembership.id)

            if (error) throw error

            setSuccess(true)
        } catch (err) {
            console.error('Error reapplying:', err)
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setSubmitting(false)
        }
    }

    async function handleReapplyUpstream() {
        setSubmitting(true)
        setError('')

        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({ status: 'pending' })
                .eq('id', existingUpstreamLink.id)

            if (error) throw error

            setSuccess(true)
        } catch (err) {
            console.error('Error reapplying upstream:', err)
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setSubmitting(false)
        }
    }

    // Already has upstream link (for dealers)
    if (existingUpstreamLink) {
        const statusMessages = {
            pending: 'คุณได้ส่งคำขอเชื่อมต่อไปแล้ว รอเจ้ามือยืนยัน',
            active: 'คุณเชื่อมต่อกับเจ้ามือนี้อยู่แล้ว',
            blocked: 'คุณถูกบล็อคจากเจ้ามือนี้',
            rejected: 'คำขอของคุณถูกปฏิเสธ'
        }
        const isActive = existingUpstreamLink.status === 'active'
        const isPending = existingUpstreamLink.status === 'pending'
        const isRejected = existingUpstreamLink.status === 'rejected'

        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiAlertCircle className="auth-logo" style={{ color: isActive ? 'var(--color-success)' : 'var(--color-warning)' }} />
                        <h1>{isActive ? 'เชื่อมต่อแล้ว' : isPending ? 'รอการยืนยัน' : 'มีสถานะอยู่แล้ว'}</h1>
                        <p>{statusMessages[existingUpstreamLink.status] || 'มีการเชื่อมต่ออยู่แล้ว'}</p>
                    </div>
                    <div className="invite-dealer-card">
                        <FiLink />
                        <span>เชื่อมต่อกับ: <strong>{dealerInfo?.full_name}</strong></span>
                    </div>
                    {isActive && (
                        <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '1rem' }}>
                            คุณสามารถตีออกยอดไปให้เจ้ามือนี้ได้แล้ว
                        </p>
                    )}
                    {isRejected && (
                        <button
                            className="btn btn-primary btn-lg auth-submit"
                            onClick={handleReapplyUpstream}
                            disabled={submitting}
                            style={{ marginTop: '1rem' }}
                        >
                            {submitting ? 'กำลังส่ง...' : 'ขอเชื่อมต่ออีกครั้ง'}
                        </button>
                    )}
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate('/dealer')}
                        style={{ marginTop: isRejected ? '0.5rem' : '1rem' }}
                    >
                        ไปยังหน้าเจ้ามือ
                    </button>
                </div>
            </div>
        )
    }

    // Already has membership (for regular users)
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

                    {existingMembership.status === 'rejected' ? (
                        <div className="invite-actions" style={{ marginTop: '1.5rem' }}>
                            <button
                                className="btn btn-primary btn-lg"
                                onClick={handleReapply}
                                disabled={submitting}
                                style={{ flex: 1 }}
                            >
                                {submitting ? (
                                    <div className="spinner" style={{ width: 20, height: 20 }}></div>
                                ) : (
                                    'ขอเข้าร่วมอีกครั้ง'
                                )}
                            </button>
                            <button
                                className="btn btn-secondary btn-lg"
                                onClick={() => navigate('/dashboard')}
                                disabled={submitting}
                                style={{ flex: 1 }}
                            >
                                กลับหน้าหลัก
                            </button>
                        </div>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg auth-submit"
                            onClick={() => navigate('/dashboard')}
                        >
                            ไปยังหน้าหลัก
                        </button>
                    )}
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
                    {isCurrentUserDealer ? <FiLink className="auth-logo" /> : <FiUserPlus className="auth-logo" />}
                    <h1>{isCurrentUserDealer ? 'เชื่อมต่อเจ้ามือ' : 'คำเชิญเข้าร่วม'}</h1>
                    <p>{isCurrentUserDealer ? 'คุณต้องการเชื่อมต่อกับเจ้ามือนี้เพื่อตีออกยอด' : 'คุณได้รับคำเชิญจากเจ้ามือ'}</p>
                </div>

                <div className="invite-dealer-card">
                    {isCurrentUserDealer ? <FiLink /> : <FiUsers />}
                    <span>{isCurrentUserDealer ? 'เชื่อมต่อกับ' : 'เจ้ามือ'}: <strong>{dealerInfo?.full_name}</strong></span>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <p style={{ textAlign: 'center', opacity: 0.7 }}>
                    {isCurrentUserDealer 
                        ? 'หากตอบรับ คุณจะสามารถตีออกยอดไปให้เจ้ามือนี้ได้หลังจากที่เจ้ามือยืนยัน'
                        : 'หากตอบรับ คุณจะสามารถส่งเลขให้เจ้ามือนี้ได้หลังจากที่เจ้ามือยืนยันสมาชิก'
                    }
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
                        onClick={() => navigate(isCurrentUserDealer ? '/dealer' : '/dashboard')}
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
