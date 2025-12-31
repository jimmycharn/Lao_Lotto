import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import QRCode from 'react-qr-code'
import { FiUsers, FiFileText, FiCheck, FiX, FiCalendar, FiDollarSign, FiEye, FiGift, FiShare2, FiCopy } from 'react-icons/fi'
import './Dealer.css'

export default function Dealer() {
    const { user, profile, isDealer, isSuperAdmin } = useAuth()
    const [activeTab, setActiveTab] = useState('purchases')
    const [purchases, setPurchases] = useState([])
    const [members, setMembers] = useState([])
    const [draws, setDraws] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedDraw, setSelectedDraw] = useState(null)

    // Redirect if not dealer or admin
    if (!isDealer && !isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    useEffect(() => {
        fetchData()
    }, [activeTab, selectedDraw])

    async function fetchData() {
        setLoading(true)
        try {
            // Fetch draws
            const { data: drawsData } = await supabase
                .from('lottery_draws')
                .select('*')
                .order('draw_date', { ascending: false })
                .limit(10)

            setDraws(drawsData || [])

            // If no draw selected, select the latest unpublished
            if (!selectedDraw && drawsData?.length > 0) {
                const unpublished = drawsData.find(d => !d.is_published)
                setSelectedDraw(unpublished || drawsData[0])
            }

            // Fetch purchases for selected draw
            if (selectedDraw) {
                let query = supabase
                    .from('purchases')
                    .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
                    .eq('draw_id', selectedDraw.id)
                    .order('created_at', { ascending: false })

                const { data: purchasesData } = await query
                setPurchases(purchasesData || [])
            }

            // Fetch members
            const { data: membersData } = await supabase
                .from('profiles')
                .select('*')
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            setMembers(membersData || [])

        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    const getBetTypeLabel = (type) => {
        const labels = {
            two_digit: '2 ตัว',
            three_digit: '3 ตัว',
            four_digit: '4 ตัว',
            six_digit: '6 ตัว'
        }
        return labels[type] || type
    }

    const getStats = () => {
        const total = purchases.length
        const totalAmount = purchases.reduce((sum, p) => sum + (p.amount || 0), 0)
        const byType = purchases.reduce((acc, p) => {
            acc[p.bet_type] = (acc[p.bet_type] || 0) + 1
            return acc
        }, {})
        return { total, totalAmount, byType }
    }

    const stats = getStats()

    return (
        <div className="dealer-page">
            <div className="container">
                <div className="page-header">
                    <h1><FiFileText /> จัดการโพย</h1>
                    <p>ดูและจัดการรายการโพยทั้งหมด</p>
                </div>

                <div className="dealer-tabs" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
                    <button
                        className={`btn ${activeTab === 'purchases' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('purchases')}
                    >
                        <FiFileText /> รายการโพย
                    </button>
                    <button
                        className={`btn ${activeTab === 'members' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('members')}
                    >
                        <FiUsers /> สมาชิก ({members.length})
                    </button>
                </div>

                <div className="dealer-layout">
                    {activeTab === 'purchases' ? (
                        <>
                            {/* Sidebar - Draw Selection */}
                            <div className="dealer-sidebar">
                                <h3 className="sidebar-title">
                                    <FiCalendar />
                                    งวดหวย
                                </h3>
                                <div className="draw-list">
                                    {draws.map(draw => (
                                        <button
                                            key={draw.id}
                                            className={`draw-item ${selectedDraw?.id === draw.id ? 'active' : ''}`}
                                            onClick={() => setSelectedDraw(draw)}
                                        >
                                            <span className="draw-date">
                                                {new Date(draw.draw_date).toLocaleDateString('th-TH', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                            <span className={`draw-status ${draw.is_published ? 'published' : 'pending'}`}>
                                                {draw.is_published ? 'ประกาศแล้ว' : 'รอประกาศ'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="dealer-main">
                                {/* Referral Section */}
                                <div className="referral-section card">
                                    <div className="referral-header">
                                        <h3><FiShare2 /> ลิงก์รับสมัครสมาชิก</h3>
                                        <p>ส่งลิงก์หรือ QR Code นี้ให้สมาชิกเพื่อเข้ากลุ่มของคุณ</p>
                                    </div>
                                    <div className="referral-content">
                                        <div className="qr-wrapper">
                                            <div className="qr-code-bg">
                                                <QRCode
                                                    value={`${window.location.origin}/register?ref=${user?.id}`}
                                                    size={120}
                                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                                    viewBox={`0 0 256 256`}
                                                />
                                            </div>
                                        </div>
                                        <div className="link-wrapper">
                                            <div className="referral-link">
                                                {`${window.location.origin}/register?ref=${user?.id}`}
                                            </div>
                                            <button
                                                className="btn btn-outline btn-sm"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user?.id}`)
                                                    alert('คัดลอกลิงก์แล้ว!')
                                                }}
                                            >
                                                <FiCopy /> คัดลอก
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="stats-row">
                                    <div className="stat-box">
                                        <FiFileText className="stat-icon" />
                                        <div>
                                            <div className="stat-value">{stats.total}</div>
                                            <div className="stat-label">โพยทั้งหมด</div>
                                        </div>
                                    </div>
                                    <div className="stat-box">
                                        <FiDollarSign className="stat-icon" />
                                        <div>
                                            <div className="stat-value">฿{stats.totalAmount.toLocaleString()}</div>
                                            <div className="stat-label">ยอดรวม</div>
                                        </div>
                                    </div>
                                    <div className="stat-box">
                                        <FiGift className="stat-icon" />
                                        <div>
                                            <div className="stat-value">{stats.byType.two_digit || 0}</div>
                                            <div className="stat-label">หวย 2 ตัว</div>
                                        </div>
                                    </div>
                                    <div className="stat-box">
                                        <FiGift className="stat-icon" />
                                        <div>
                                            <div className="stat-value">{stats.byType.six_digit || 0}</div>
                                            <div className="stat-label">หวย 6 ตัว</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Purchase List */}
                                <div className="purchases-section card">
                                    <div className="section-header">
                                        <h3>รายการโพย</h3>
                                        <span className="badge">{purchases.length} รายการ</span>
                                    </div>

                                    {loading ? (
                                        <div className="loading-state">
                                            <div className="spinner"></div>
                                        </div>
                                    ) : purchases.length === 0 ? (
                                        <div className="empty-state">
                                            <FiFileText className="empty-icon" />
                                            <p>ไม่มีรายการโพย</p>
                                        </div>
                                    ) : (
                                        <div className="purchases-table-wrap">
                                            <table className="purchases-table">
                                                <thead>
                                                    <tr>
                                                        <th>ผู้ส่ง</th>
                                                        <th>ประเภท</th>
                                                        <th>เลข</th>
                                                        <th>จำนวน</th>
                                                        <th>เวลา</th>
                                                        <th>สถานะ</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {purchases.map(purchase => (
                                                        <tr key={purchase.id}>
                                                            <td>
                                                                <div className="user-cell">
                                                                    <span className="user-name">
                                                                        {purchase.profiles?.full_name || 'ไม่ระบุ'}
                                                                    </span>
                                                                    <span className="user-email">
                                                                        {purchase.profiles?.email}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span className="type-badge">
                                                                    {getBetTypeLabel(purchase.bet_type)}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className="number-cell">{purchase.numbers}</span>
                                                            </td>
                                                            <td>฿{purchase.amount?.toLocaleString()}</td>
                                                            <td className="time-cell">
                                                                {new Date(purchase.created_at).toLocaleString('th-TH', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </td>
                                                            <td>
                                                                {selectedDraw?.is_published ? (
                                                                    purchase.is_winner ? (
                                                                        <span className="status-badge won">
                                                                            <FiCheck /> ถูกรางวัล
                                                                        </span>
                                                                    ) : (
                                                                        <span className="status-badge lost">
                                                                            <FiX /> ไม่ถูก
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span className="status-badge pending">รอผล</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="members-section card" style={{ width: '100%' }}>
                            <div className="section-header">
                                <h3>รายชื่อสมาชิก</h3>
                                <span className="badge">{members.length} คน</span>
                            </div>

                            <div className="purchases-table-wrap">
                                <table className="purchases-table">
                                    <thead>
                                        <tr>
                                            <th>ชื่อ-นามสกุล</th>
                                            <th>อีเมล</th>
                                            <th>เบอร์โทร</th>
                                            <th>ยอดเงินคงเหลือ</th>
                                            <th>วันที่สมัคร</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.map(member => (
                                            <tr key={member.id}>
                                                <td>{member.full_name}</td>
                                                <td>{member.email}</td>
                                                <td>{member.phone || '-'}</td>
                                                <td>฿{member.balance?.toLocaleString()}</td>
                                                <td className="time-cell">
                                                    {new Date(member.created_at).toLocaleDateString('th-TH')}
                                                </td>
                                            </tr>
                                        ))}
                                        {members.length === 0 && (
                                            <tr>
                                                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>
                                                    ยังไม่มีสมาชิกในสังกัด
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
