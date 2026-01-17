import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import {
    FiSettings,
    FiUsers,
    FiCalendar,
    FiPlus,
    FiEdit2,
    FiTrash2,
    FiCheck,
    FiSave,
    FiX,
    FiGift
} from 'react-icons/fi'
import './Admin.css'

export default function Admin() {
    const { isSuperAdmin } = useAuth()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState('draws')
    const [draws, setDraws] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingDraw, setEditingDraw] = useState(null)
    const [formData, setFormData] = useState({
        draw_date: '',
        two_digit: '',
        three_digit: '',
        four_digit: '',
        six_digit: '',
        is_published: false
    })

    // Redirect if not superadmin
    if (!isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    useEffect(() => {
        if (activeTab === 'draws') {
            fetchDraws()
        } else {
            fetchUsers()
        }
    }, [activeTab])

    async function fetchDraws() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('lottery_draws')
                .select('*')
                .order('draw_date', { ascending: false })

            if (!error) setDraws(data || [])
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    async function fetchUsers() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false })

            if (!error) setUsers(data || [])
        } catch (error) {
            console.error('Error:', error)
        } finally {
            setLoading(false)
        }
    }

    const openDrawModal = (draw = null) => {
        if (draw) {
            setEditingDraw(draw)
            setFormData({
                draw_date: draw.draw_date,
                two_digit: draw.two_digit || '',
                three_digit: draw.three_digit || '',
                four_digit: draw.four_digit || '',
                six_digit: draw.six_digit || '',
                is_published: draw.is_published
            })
        } else {
            setEditingDraw(null)
            setFormData({
                draw_date: new Date().toISOString().split('T')[0],
                two_digit: '',
                three_digit: '',
                four_digit: '',
                six_digit: '',
                is_published: false
            })
        }
        setShowModal(true)
    }

    const handleSaveDraw = async () => {
        try {
            if (editingDraw) {
                const { error } = await supabase
                    .from('lottery_draws')
                    .update(formData)
                    .eq('id', editingDraw.id)

                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('lottery_draws')
                    .insert([formData])

                if (error) throw error
            }

            // If published, calculate winners
            if (formData.is_published) {
                await calculateWinners(editingDraw?.id)
            }

            setShowModal(false)
            fetchDraws()
        } catch (error) {
            console.error('Error saving draw:', error)
            toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        }
    }

    const calculateWinners = async (drawId) => {
        try {
            // Get all purchases for this draw
            const { data: purchases } = await supabase
                .from('purchases')
                .select('*')
                .eq('draw_id', drawId)

            if (!purchases) return

            const rates = {
                two_digit: 90,
                three_digit: 500,
                four_digit: 5000,
                six_digit: 100000
            }

            const winningNumbers = {
                two_digit: formData.two_digit,
                three_digit: formData.three_digit,
                four_digit: formData.four_digit,
                six_digit: formData.six_digit
            }

            for (const purchase of purchases) {
                const isWinner = purchase.numbers === winningNumbers[purchase.bet_type]
                const prizeAmount = isWinner ? purchase.amount * rates[purchase.bet_type] : 0

                await supabase
                    .from('purchases')
                    .update({
                        is_winner: isWinner,
                        prize_amount: prizeAmount
                    })
                    .eq('id', purchase.id)
            }
        } catch (error) {
            console.error('Error calculating winners:', error)
        }
    }

    const handleDeleteDraw = async (id) => {
        if (!confirm('ต้องการลบงวดนี้?')) return

        try {
            const { error } = await supabase
                .from('lottery_draws')
                .delete()
                .eq('id', id)

            if (!error) fetchDraws()
        } catch (error) {
            console.error('Error:', error)
        }
    }

    const handleUpdateUserRole = async (userId, newRole) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId)

            if (!error) fetchUsers()
        } catch (error) {
            console.error('Error:', error)
        }
    }

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'superadmin': return 'role-admin'
            case 'dealer': return 'role-dealer'
            default: return 'role-user'
        }
    }

    return (
        <div className="admin-page">
            <div className="container">
                <div className="page-header">
                    <h1>
                        <FiSettings />
                        แอดมิน
                    </h1>
                    <p>จัดการระบบหวยลาว</p>
                </div>

                {/* Tabs */}
                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'draws' ? 'active' : ''}`}
                        onClick={() => setActiveTab('draws')}
                    >
                        <FiCalendar />
                        จัดการงวดหวย
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        <FiUsers />
                        จัดการสมาชิก
                    </button>
                </div>

                {/* Content */}
                <div className="admin-content card">
                    {activeTab === 'draws' ? (
                        <>
                            <div className="content-header">
                                <h3>งวดหวยทั้งหมด</h3>
                                <button className="btn btn-primary" onClick={() => openDrawModal()}>
                                    <FiPlus />
                                    เพิ่มงวดใหม่
                                </button>
                            </div>

                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : draws.length === 0 ? (
                                <div className="empty-state">
                                    <FiGift className="empty-icon" />
                                    <p>ยังไม่มีงวดหวย</p>
                                </div>
                            ) : (
                                <div className="table-wrap">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>วันที่</th>
                                                <th>2 ตัว</th>
                                                <th>3 ตัว</th>
                                                <th>4 ตัว</th>
                                                <th>6 ตัว</th>
                                                <th>สถานะ</th>
                                                <th>จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {draws.map(draw => (
                                                <tr key={draw.id}>
                                                    <td>
                                                        {new Date(draw.draw_date).toLocaleDateString('th-TH')}
                                                    </td>
                                                    <td className="number-cell">{draw.two_digit || '-'}</td>
                                                    <td className="number-cell">{draw.three_digit || '-'}</td>
                                                    <td className="number-cell">{draw.four_digit || '-'}</td>
                                                    <td className="number-cell highlight">{draw.six_digit || '-'}</td>
                                                    <td>
                                                        <span className={`status-badge ${draw.is_published ? 'published' : 'pending'}`}>
                                                            {draw.is_published ? 'ประกาศแล้ว' : 'รอประกาศ'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            <button
                                                                className="action-btn edit"
                                                                onClick={() => openDrawModal(draw)}
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                className="action-btn delete"
                                                                onClick={() => handleDeleteDraw(draw.id)}
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="content-header">
                                <h3>สมาชิกทั้งหมด ({users.length})</h3>
                            </div>

                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : (
                                <div className="table-wrap">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>ชื่อ</th>
                                                <th>อีเมล</th>
                                                <th>ยอดเงิน</th>
                                                <th>สิทธิ์</th>
                                                <th>สมัครเมื่อ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(user => (
                                                <tr key={user.id}>
                                                    <td>{user.full_name || '-'}</td>
                                                    <td>{user.email}</td>
                                                    <td>฿{(user.balance || 0).toLocaleString()}</td>
                                                    <td>
                                                        <select
                                                            className={`role-select ${getRoleBadgeClass(user.role)}`}
                                                            value={user.role || 'user'}
                                                            onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                                                        >
                                                            <option value="user">ผู้ใช้</option>
                                                            <option value="dealer">เจ้ามือ</option>
                                                            <option value="superadmin">Admin</option>
                                                        </select>
                                                    </td>
                                                    <td className="time-cell">
                                                        {new Date(user.created_at).toLocaleDateString('th-TH')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingDraw ? 'แก้ไขงวดหวย' : 'เพิ่มงวดหวยใหม่'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">วันที่ออกรางวัล</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.draw_date}
                                    onChange={e => setFormData({ ...formData, draw_date: e.target.value })}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">เลข 2 ตัว</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        maxLength={2}
                                        placeholder="00"
                                        value={formData.two_digit}
                                        onChange={e => setFormData({ ...formData, two_digit: e.target.value.replace(/\D/g, '') })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เลข 3 ตัว</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        maxLength={3}
                                        placeholder="000"
                                        value={formData.three_digit}
                                        onChange={e => setFormData({ ...formData, three_digit: e.target.value.replace(/\D/g, '') })}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">เลข 4 ตัว</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        maxLength={4}
                                        placeholder="0000"
                                        value={formData.four_digit}
                                        onChange={e => setFormData({ ...formData, four_digit: e.target.value.replace(/\D/g, '') })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">เลข 6 ตัว (รางวัลใหญ่)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        maxLength={6}
                                        placeholder="000000"
                                        value={formData.six_digit}
                                        onChange={e => setFormData({ ...formData, six_digit: e.target.value.replace(/\D/g, '') })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_published}
                                        onChange={e => setFormData({ ...formData, is_published: e.target.checked })}
                                    />
                                    <span className="checkmark"></span>
                                    ประกาศผล (คำนวณผู้ชนะอัตโนมัติ)
                                </label>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveDraw}>
                                <FiSave />
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
