import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../utils/confirmDialog'
import MemberTreeView from '../components/admin/MemberTreeView'
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
    FiGift,
    FiSearch,
    FiFilter,
    FiList,
    FiGitBranch,
    FiSlash,
    FiUnlock,
    FiLock
} from 'react-icons/fi'
import './Admin.css'

export default function Admin() {
    const { isSuperAdmin, user: currentUser } = useAuth()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState('draws')
    const [draws, setDraws] = useState([])
    const [users, setUsers] = useState([])
    const [memberships, setMemberships] = useState([])
    const [viewMode, setViewMode] = useState('table') // 'table' or 'tree'
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all') // 'all', 'admin', 'dealer', 'user'
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingDraw, setEditingDraw] = useState(null)

    const filteredUsers = users.filter(user => {
        // 1. Role Filter
        if (roleFilter === 'admin') {
            if (user.role !== 'superadmin' && user.role !== 'admin') return false
        } else if (roleFilter === 'dealer') {
            if (user.role !== 'dealer') return false
        } else if (roleFilter === 'user') {
            if (user.role && user.role !== 'user') return false
        }

        // 2. Search Term Filter
        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase().trim()
            const nameMatch = (user.full_name || '').toLowerCase().includes(term)
            const emailMatch = (user.email || '').toLowerCase().includes(term)
            const codeMatch = (user.member_code || '').toLowerCase().includes(term)
            if (!nameMatch && !emailMatch && !codeMatch) return false
        }

        return true
    })
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

            const { data: memData } = await supabase
                .from('user_dealer_memberships')
                .select('*')

            setMemberships(memData || [])
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
        if (!(await confirmDialog({ title: 'ยืนยันการลบ', message: 'ต้องการลบงวดนี้?', confirmText: 'ลบเลย' }))) return

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

    const handleToggleBlockUser = async (targetUser) => {
        const isCurrentlyBlocked = targetUser.is_active === false
        const actionText = isCurrentlyBlocked ? 'ปลดบล็อก' : 'ระงับการใช้งาน (บล็อก)'

        if (!(await confirmDialog({
            title: `ยืนยัน${actionText}`,
            message: `ต้องการ${actionText} สมาชิกคุณ ${targetUser.full_name || targetUser.email}?`,
            confirmText: actionText,
            type: isCurrentlyBlocked ? 'info' : 'danger'
        }))) return

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    is_active: isCurrentlyBlocked ? true : false,
                    deactivated_at: isCurrentlyBlocked ? null : new Date().toISOString()
                })
                .eq('id', targetUser.id)

            if (error) throw error
            toast.success(`${actionText}สมาชิกเรียบร้อยแล้ว`)
            fetchUsers()
        } catch (error) {
            console.error('Error toggling block status:', error)
            toast.error('เกิดข้อผิดพลาดในการเปลี่ยนสถานะสมาชิก')
        }
    }

    const handleDeleteUser = async (targetUser) => {
        if (!(await confirmDialog({
            title: 'ยืนยันการลบสมาชิก',
            message: `ต้องการลบสมาชิกคุณ ${targetUser.full_name || targetUser.email}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmText: 'ลบสมาชิก',
            type: 'danger'
        }))) return

        try {
            // First attempt to delete via RPC function (deletes from auth.users & profiles)
            const { error: rpcError } = await supabase.rpc('delete_user_by_superadmin', {
                target_user_id: targetUser.id
            })

            if (rpcError) {
                console.warn('RPC delete failed, falling back to direct profiles delete:', rpcError)
                const { error: directError } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('id', targetUser.id)

                if (directError) throw directError
            }

            toast.success('ลบสมาชิกเรียบร้อยแล้ว')
            fetchUsers()
        } catch (error) {
            console.error('Error deleting user:', error)
            toast.error('เกิดข้อผิดพลาดในการลบสมาชิก: ' + (error.message || ''))
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
                    <p>จัดการระบบ Big Lotto</p>
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
                            <div className="content-header users-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <h3>
                                        สมาชิกทั้งหมด ({filteredUsers.length}{filteredUsers.length !== users.length ? ` / ${users.length}` : ''})
                                    </h3>
                                    <div className="tree-mode-toggle">
                                        <button
                                            className={`tree-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                                            onClick={() => setViewMode('table')}
                                        >
                                            <FiList /> ตาราง
                                        </button>
                                        <button
                                            className={`tree-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
                                            onClick={() => setViewMode('tree')}
                                        >
                                            <FiGitBranch /> แผนผัง (Tree View)
                                        </button>
                                    </div>
                                </div>

                                <div className="user-filter-controls">
                                    <div className="search-input-wrap">
                                        <FiSearch className="search-icon" />
                                        <input
                                            type="text"
                                            placeholder="ค้นหาชื่อ หรืออีเมล..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button
                                                className="clear-search-btn"
                                                onClick={() => setSearchTerm('')}
                                                title="ล้างคำค้นหา"
                                            >
                                                <FiX />
                                            </button>
                                        )}
                                    </div>

                                    {viewMode === 'table' && (
                                        <div className="filter-select-wrap">
                                            <FiFilter className="filter-icon" />
                                            <select
                                                className="role-filter-select"
                                                value={roleFilter}
                                                onChange={(e) => setRoleFilter(e.target.value)}
                                            >
                                                <option value="all">สิทธิ์ทั้งหมด (ทุกประเภท)</option>
                                                <option value="admin">Admin</option>
                                                <option value="dealer">เจ้ามือ</option>
                                                <option value="user">ผู้ใช้</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {loading ? (
                                <div className="loading-state">
                                    <div className="spinner"></div>
                                </div>
                            ) : viewMode === 'tree' ? (
                                <MemberTreeView
                                    users={users}
                                    memberships={memberships}
                                    searchTerm={searchTerm}
                                    onToggleBlock={handleToggleBlockUser}
                                    onDeleteUser={handleDeleteUser}
                                    currentUserId={currentUser?.id}
                                />
                            ) : filteredUsers.length === 0 ? (
                                <div className="empty-state">
                                    <FiUsers className="empty-icon" />
                                    <p>ไม่พบสมาชิกตรงตามเงื่อนไขค้นหา</p>
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
                                                <th>ใช้งานล่าสุด</th>
                                                <th>สมัครเมื่อ</th>
                                                <th style={{ textAlign: 'center' }}>จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.map(user => {
                                                const isSelf = user.id === currentUser?.id
                                                return (
                                                    <tr key={user.id} className={user.is_active === false ? 'row-blocked' : ''}>
                                                        <td>
                                                            {user.full_name || '-'}
                                                            {isSelf && (
                                                                <span className="status-badge current-user" style={{ marginLeft: '6px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '0.75rem' }}>(คุณ)</span>
                                                            )}
                                                            {user.is_active === false && (
                                                                <span className="status-badge blocked" style={{ marginLeft: '6px' }}>🔴 โดนบล็อก</span>
                                                            )}
                                                        </td>
                                                        <td>{user.email}</td>
                                                        <td>฿{(user.balance || 0).toLocaleString()}</td>
                                                        <td>
                                                            <select
                                                                className={`role-select ${getRoleBadgeClass(user.role)}`}
                                                                value={user.role || 'user'}
                                                                onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                                                                disabled={isSelf}
                                                            >
                                                                <option value="user">ผู้ใช้</option>
                                                                <option value="dealer">เจ้ามือ</option>
                                                                <option value="superadmin">Admin</option>
                                                            </select>
                                                        </td>
                                                        <td className="time-cell">
                                                            {user.last_login_at
                                                                ? new Date(user.last_login_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
                                                                : '-'}
                                                        </td>
                                                        <td className="time-cell">
                                                            {new Date(user.created_at).toLocaleDateString('th-TH')}
                                                        </td>
                                                        <td>
                                                            <div className="action-buttons" style={{ justifyContent: 'center' }}>
                                                                {!isSelf ? (
                                                                    <>
                                                                        <button
                                                                            className={`action-btn ${user.is_active === false ? 'unblock' : 'block'}`}
                                                                            title={user.is_active === false ? 'ปลดบล็อก' : 'ระงับการใช้งาน (บล็อก)'}
                                                                            onClick={() => handleToggleBlockUser(user)}
                                                                        >
                                                                            {user.is_active === false ? <FiUnlock /> : <FiSlash />}
                                                                        </button>
                                                                        <button
                                                                            className="action-btn delete"
                                                                            title="ลบสมาชิก"
                                                                            onClick={() => handleDeleteUser(user)}
                                                                        >
                                                                            <FiTrash2 />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>-</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
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
