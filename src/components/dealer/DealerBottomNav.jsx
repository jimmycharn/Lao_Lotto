import React from 'react'
import {
    FiCalendar,
    FiUsers,
    FiMessageSquare,
    FiShare2,
    FiUser
} from 'react-icons/fi'

export default function DealerBottomNav({
    activeTab,
    onSelectTab,
    membersCount = 0,
    upstreamCount = 0
}) {
    const isMembersActive = activeTab === 'members' || activeTab === 'upstreamDealers'
    const isLineBotActive = activeTab === 'lineBot' || activeTab === 'automation'
    const totalMembers = (Number(membersCount) || 0) + (Number(upstreamCount) || 0)

    const navItems = [
        {
            id: 'rounds',
            label: 'งวดหวย',
            icon: FiCalendar,
            isActive: activeTab === 'rounds'
        },
        {
            id: 'members',
            label: 'สมาชิก',
            icon: FiUsers,
            isActive: isMembersActive,
            badge: totalMembers > 0 ? totalMembers : null
        },
        {
            id: 'lineBot',
            label: 'LINE Bot',
            icon: FiMessageSquare,
            isActive: isLineBotActive
        },
        {
            id: 'referral',
            label: 'แนะนำ',
            icon: FiShare2,
            isActive: activeTab === 'referral'
        },
        {
            id: 'profile',
            label: 'โปรไฟล์',
            icon: FiUser,
            isActive: activeTab === 'profile'
        }
    ]

    return (
        <nav className="dealer-bottom-nav" aria-label="Dealer Navigation">
            {navItems.map(item => {
                const IconComponent = item.icon
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`dealer-bottom-nav-item ${item.isActive ? 'active' : ''}`}
                        onClick={() => onSelectTab && onSelectTab(item.id)}
                    >
                        <div className="dealer-bottom-nav-icon-wrapper">
                            <IconComponent className="dealer-bottom-nav-icon" />
                            {item.badge !== undefined && item.badge !== null && (
                                <span className="dealer-bottom-nav-badge">{item.badge}</span>
                            )}
                        </div>
                        <span className="dealer-bottom-nav-label">{item.label}</span>
                    </button>
                )
            })}
        </nav>
    )
}
