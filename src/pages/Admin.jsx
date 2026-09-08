import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../utils/confirmDialog'
import MemberTreeView from '../components/admin/MemberTreeView'
import EditMemberModal from '../components/admin/EditMemberModal'
import DealerRoundsAdminTab from '../components/admin/DealerRoundsAdminTab'
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
    const [users, setUsers] = useState([])
    const [memberships, setMemberships] = useState([])
    const [viewMode, setViewMode] = useState('table') // 'table' or 'tree'
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all') // 'all', 'admin', 'dealer', 'user'
    const [loading, setLoading] = useState(true)
    const [editingUser, setEditingUser] = useState(null)
    const [showEditUserModal, setShowEditUserModal] = useState(false)

    const handleEditUser = (userToEdit) => {
        setEditingUser(userToEdit)
        setShowEditUserModal(true)
    }

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

    // Redirect if not superadmin
    if (!isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers()
        }
    }, [activeTab])

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
                        <DealerRoundsAdminTab currentUser={currentUser} />
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
                                    onEditUser={handleEditUser}
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
                                                                <button
                                                                    className="action-btn edit"
                                                                    title="แก้ไขข้อมูลสมาชิก"
                                                                    onClick={() => handleEditUser(user)}
                                                                >
                                                                    <FiEdit2 />
                                                                </button>
                                                                {!isSelf && (
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



            {/* Edit Member Modal */}
            <EditMemberModal
                isOpen={showEditUserModal}
                user={editingUser}
                onClose={() => {
                    setShowEditUserModal(false)
                    setEditingUser(null)
                }}
                onUpdated={fetchUsers}
            />
        </div>
    )
}
