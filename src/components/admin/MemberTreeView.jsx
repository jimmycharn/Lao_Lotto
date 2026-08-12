import React, { useState, useMemo } from 'react'
import {
    FiChevronRight,
    FiChevronDown,
    FiUserCheck,
    FiUsers,
    FiBriefcase,
    FiMaximize2,
    FiMinimize2
} from 'react-icons/fi'
import './MemberTreeView.css'

export default function MemberTreeView({ users = [], memberships = [], searchTerm = '' }) {
    const [perspective, setPerspective] = useState('dealer') // 'dealer' (Dealer -> Members) or 'member' (Member -> Dealers)
    const [expandedNodeIds, setExpandedNodeIds] = useState({})

    // Create map for user objects
    const userMap = useMemo(() => {
        const map = {}
        users.forEach(u => {
            map[u.id] = u
        })
        return map
    }, [users])

    // Dealer ID -> List of Member profile objects
    const dealerMembersMap = useMemo(() => {
        const map = {}
        memberships.forEach(m => {
            if (!map[m.dealer_id]) map[m.dealer_id] = []
            if (userMap[m.user_id] && !map[m.dealer_id].some(u => u.id === m.user_id)) {
                map[m.dealer_id].push(userMap[m.user_id])
            }
        })
        return map
    }, [memberships, userMap])

    // Member ID -> List of Dealer profile objects
    const memberDealersMap = useMemo(() => {
        const map = {}
        memberships.forEach(m => {
            if (!map[m.user_id]) map[m.user_id] = []
            if (userMap[m.dealer_id] && !map[m.user_id].some(d => d.id === m.dealer_id)) {
                map[m.user_id].push(userMap[m.dealer_id])
            }
        })
        return map
    }, [memberships, userMap])

    // Root nodes according to chosen perspective and search filter
    const rootNodes = useMemo(() => {
        let list = []
        if (perspective === 'dealer') {
            list = users.filter(u => u.role === 'dealer' || u.role === 'superadmin' || u.role === 'admin')
        } else {
            list = users.filter(u => !u.role || u.role === 'user')
        }

        if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase().trim()
            list = list.filter(node => {
                const nameMatch = (node.full_name || '').toLowerCase().includes(term)
                const emailMatch = (node.email || '').toLowerCase().includes(term)
                const children = perspective === 'dealer'
                    ? (dealerMembersMap[node.id] || [])
                    : (memberDealersMap[node.id] || [])
                const childMatch = children.some(c =>
                    (c.full_name || '').toLowerCase().includes(term) ||
                    (c.email || '').toLowerCase().includes(term)
                )
                return nameMatch || emailMatch || childMatch
            })
        }

        return list
    }, [users, perspective, searchTerm, dealerMembersMap, memberDealersMap])

    const toggleNode = (id) => {
        setExpandedNodeIds(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const expandAll = () => {
        const nextState = {}
        rootNodes.forEach(node => {
            nextState[node.id] = true
        })
        setExpandedNodeIds(nextState)
    }

    const collapseAll = () => {
        setExpandedNodeIds({})
    }

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'superadmin':
            case 'admin':
                return 'role-admin'
            case 'dealer':
                return 'role-dealer'
            default:
                return 'role-user'
        }
    }

    const getRoleLabel = (role) => {
        switch (role) {
            case 'superadmin':
            case 'admin':
                return 'Admin'
            case 'dealer':
                return 'เจ้ามือ'
            default:
                return 'ผู้ใช้'
        }
    }

    return (
        <div className="member-tree-container">
            {/* Toolbar */}
            <div className="tree-toolbar">
                <div className="tree-mode-toggle">
                    <button
                        className={`tree-mode-btn ${perspective === 'dealer' ? 'active' : ''}`}
                        onClick={() => setPerspective('dealer')}
                    >
                        <FiBriefcase />
                        มองตามเจ้ามือ (Dealers → Members)
                    </button>
                    <button
                        className={`tree-mode-btn ${perspective === 'member' ? 'active' : ''}`}
                        onClick={() => setPerspective('member')}
                    >
                        <FiUsers />
                        มองตามสมาชิก (Members → Dealers)
                    </button>
                </div>

                <div className="tree-action-btns">
                    <button className="tree-action-btn" onClick={expandAll}>
                        <FiMaximize2 style={{ marginRight: '4px' }} />
                        ขยายทั้งหมด
                    </button>
                    <button className="tree-action-btn" onClick={collapseAll}>
                        <FiMinimize2 style={{ marginRight: '4px' }} />
                        ย่อทั้งหมด
                    </button>
                </div>
            </div>

            {/* Tree Nodes */}
            <div className="tree-nodes-wrap">
                {rootNodes.length === 0 ? (
                    <div className="empty-state">
                        <FiUsers className="empty-icon" />
                        <p>ไม่พบข้อมูลตามเงื่อนไขที่กรอง</p>
                    </div>
                ) : (
                    rootNodes.map(node => {
                        const children = perspective === 'dealer'
                            ? (dealerMembersMap[node.id] || [])
                            : (memberDealersMap[node.id] || [])
                        const isExpanded = !!expandedNodeIds[node.id] || (searchTerm && searchTerm.trim() !== '')

                        return (
                            <div className="tree-node-card" key={node.id}>
                                <div className="tree-node-header" onClick={() => toggleNode(node.id)}>
                                    <div className="tree-node-left">
                                        <div className="tree-expand-icon">
                                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                        </div>
                                        <div className="tree-node-info">
                                            <span className="tree-node-title">
                                                {node.full_name || 'ไม่ระบุชื่อ'}
                                            </span>
                                            <span className="tree-node-sub">{node.email}</span>
                                        </div>
                                    </div>

                                    <div className="tree-node-right">
                                        <span className={`role-badge ${getRoleBadgeClass(node.role)}`}>
                                            {getRoleLabel(node.role)}
                                        </span>
                                        <span className="tree-count-badge">
                                            {perspective === 'dealer'
                                                ? `สมาชิก ${children.length} คน`
                                                : `สังกัด ${children.length} เจ้ามือ`}
                                        </span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="tree-children-list">
                                        {children.length === 0 ? (
                                            <div className="tree-child-empty" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                                                {perspective === 'dealer' ? 'ยังไม่มีสมาชิกในสังกัด' : 'ยังไม่ได้สังกัดเจ้ามือใด'}
                                            </div>
                                        ) : (
                                            children.map(child => (
                                                <div className="tree-child-item" key={child.id}>
                                                    <div className="tree-node-info">
                                                        <span className="tree-node-title" style={{ fontSize: '0.875rem' }}>
                                                            {child.full_name || 'ไม่ระบุชื่อ'}
                                                        </span>
                                                        <span className="tree-node-sub">{child.email}</span>
                                                    </div>
                                                    <span className={`role-badge ${getRoleBadgeClass(child.role)}`}>
                                                        {getRoleLabel(child.role)}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
