import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiLink, FiCheck, FiX, FiUsers, FiAlertCircle, FiSend } from 'react-icons/fi'
import './Auth.css'

/**
 * DealerConnect - Page for dealers to connect with other dealers
 * 
 * Flow:
 * 1. Dealer A shares QR/link: /dealer-connect?ref={dealer_a_id}
 * 2. Dealer B scans/clicks the link
 * 3. If not logged in -> redirect to login
 * 4. If logged in but not a dealer -> show error
 * 5. If logged in as dealer -> show connection UI
 * 6. On accept -> create dealer_upstream_connections record with is_linked=true
 * 7. Dealer B can now transfer excess bets to Dealer A
 */
export default function DealerConnect() {
    const { user, profile, loading: authLoading, isDealer } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const upstreamDealerId = searchParams.get('ref')

    const [upstreamDealer, setUpstreamDealer] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [existingConnection, setExistingConnection] = useState(null)

    useEffect(() => {
        if (upstreamDealerId && user && profile) {
            fetchUpstreamDealerAndConnection()
        } else if (!upstreamDealerId) {
            setLoading(false)
            setError('ไม่พบลิงก์เชื่อมต่อ')
        }
    }, [upstreamDealerId, user, profile])

    async function fetchUpstreamDealerAndConnection() {
        try {
            // Fetch upstream dealer info
            const { data: dealer, error: dealerError } = await supabase
                .from('profiles')
                .select('id, full_name, email, phone')
                .eq('id', upstreamDealerId)
                .eq('role', 'dealer')
                .single()

            if (dealerError || !dealer) {
                setError('ไม่พบเจ้ามือนี้ในระบบ หรือไม่ใช่เจ้ามือ')
                setLoading(false)
                return
            }

            // Can't connect to yourself
            if (dealer.id === user.id) {
                setError('ไม่สามารถเชื่อมต่อกับตัวเองได้')
                setLoading(false)
                return
            }

            setUpstreamDealer(dealer)

            // Check if connection already exists
            const { data: connection } = await supabase
                .from('dealer_upstream_connections')
                .select('*')
                .eq('dealer_id', user.id)
                .eq('upstream_dealer_id', upstreamDealerId)
                .single()

            if (connection) {
                setExistingConnection(connection)
            }

            setLoading(false)
        } catch (err) {
            console.error('Error fetching upstream dealer:', err)
            setError('เกิดข้อผิดพลาด')
            setLoading(false)
        }
    }

    async function handleConnect() {
        setSubmitting(true)
        setError('')

        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .insert({
                    dealer_id: user.id,
                    upstream_dealer_id: upstreamDealerId,
                    upstream_name: upstreamDealer.full_name || upstreamDealer.email,
                    upstream_contact: upstreamDealer.phone || upstreamDealer.email,
                    is_linked: true,
                    status: 'pending',
                    notes: 'เชื่อมต่อผ่าน QR Code/Link'
                })

            if (error) {
                if (error.code === '23505') {
                    setError('คุณเชื่อมต่อกับเจ้ามือนี้อยู่แล้ว')
                } else {
                    throw error
                }
            } else {
                setSuccess(true)
            }
        } catch (err) {
            console.error('Error connecting to dealer:', err)
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setSubmitting(false)
        }
    }

    // Not logged in - redirect to login with return URL
    if (!authLoading && !user) {
        return <Navigate to={`/login?redirect=/dealer-connect?ref=${upstreamDealerId}`} replace />
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

    // Not a dealer - show error
    if (!isDealer) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiAlertCircle className="auth-logo" style={{ color: 'var(--color-error)' }} />
                        <h1>ไม่สามารถเชื่อมต่อได้</h1>
                        <p>ฟีเจอร์นี้สำหรับเจ้ามือเท่านั้น</p>
                    </div>
                    <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '1.5rem' }}>
                        หากคุณต้องการเป็นเจ้ามือ กรุณาติดต่อผู้ดูแลระบบ
                    </p>
                    <Link to="/" className="btn btn-primary btn-lg auth-submit">
                        กลับหน้าหลัก
                    </Link>
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
                        <h1>เชื่อมต่อสำเร็จ!</h1>
                        <p>คุณสามารถตีเลขออกไปยังเจ้ามือนี้ได้แล้ว</p>
                    </div>
                    <div className="invite-dealer-card">
                        <FiUsers />
                        <span>เจ้ามือ: <strong>{upstreamDealer?.full_name}</strong></span>
                    </div>
                    <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '1rem' }}>
                        ไปที่แท็บ "เจ้ามือตีออก" เพื่อดูรายชื่อเจ้ามือที่เชื่อมต่อแล้ว
                    </p>
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate('/dealer?tab=upstreamDealers')}
                    >
                        <FiSend /> ไปยังหน้าเจ้ามือตีออก
                    </button>
                </div>
            </div>
        )
    }

    // Already connected
    if (existingConnection) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiLink className="auth-logo" style={{ color: 'var(--color-success)' }} />
                        <h1>เชื่อมต่อแล้ว</h1>
                        <p>คุณเชื่อมต่อกับเจ้ามือนี้อยู่แล้ว</p>
                    </div>
                    <div className="invite-dealer-card">
                        <FiUsers />
                        <span>เจ้ามือ: <strong>{upstreamDealer?.full_name}</strong></span>
                    </div>
                    <p style={{ textAlign: 'center', opacity: 0.7, marginTop: '1rem' }}>
                        คุณสามารถตีเลขออกไปยังเจ้ามือนี้ได้จากแท็บ "เจ้ามือตีออก"
                    </p>
                    <button
                        className="btn btn-primary btn-lg auth-submit"
                        onClick={() => navigate('/dealer?tab=upstreamDealers')}
                    >
                        <FiSend /> ไปยังหน้าเจ้ามือตีออก
                    </button>
                </div>
            </div>
        )
    }

    // Error state
    if (error && !upstreamDealer) {
        return (
            <div className="auth-page">
                <div className="auth-container animate-slideUp">
                    <div className="auth-header">
                        <FiX className="auth-logo" style={{ color: 'var(--color-error)' }} />
                        <h1>เกิดข้อผิดพลาด</h1>
                        <p>{error}</p>
                    </div>
                    <Link to="/dealer" className="btn btn-primary btn-lg auth-submit">
                        กลับหน้าเจ้ามือ
                    </Link>
                </div>
            </div>
        )
    }

    // Main connection UI
    return (
        <div className="auth-page">
            <div className="auth-container animate-slideUp">
                <div className="auth-header">
                    <FiLink className="auth-logo" style={{ color: 'var(--color-primary)' }} />
                    <h1>เชื่อมต่อเจ้ามือ</h1>
                    <p>เชื่อมต่อเพื่อตีเลขออกไปยังเจ้ามือนี้</p>
                </div>

                <div className="invite-dealer-card">
                    <FiUsers />
                    <span>เจ้ามือ: <strong>{upstreamDealer?.full_name}</strong></span>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <div style={{ 
                    background: 'var(--color-surface)', 
                    padding: '1rem', 
                    borderRadius: '8px', 
                    marginTop: '1rem',
                    marginBottom: '1rem'
                }}>
                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--color-text)' }}>
                        <FiSend style={{ marginRight: '0.5rem' }} />
                        สิ่งที่คุณจะได้รับ:
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                        <li>สามารถตีเลขที่เกินอั้นไปยังเจ้ามือนี้ได้</li>
                        <li>เจ้ามือนี้จะปรากฏในรายการ "เจ้ามือตีออก"</li>
                        <li>สามารถยกเลิกการเชื่อมต่อได้ทุกเมื่อ</li>
                    </ul>
                </div>

                <div className="invite-actions">
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleConnect}
                        disabled={submitting}
                        style={{ flex: 1 }}
                    >
                        {submitting ? (
                            <div className="spinner" style={{ width: 20, height: 20 }}></div>
                        ) : (
                            <>
                                <FiCheck /> เชื่อมต่อ
                            </>
                        )}
                    </button>
                    <button
                        className="btn btn-secondary btn-lg"
                        onClick={() => navigate('/dealer')}
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
