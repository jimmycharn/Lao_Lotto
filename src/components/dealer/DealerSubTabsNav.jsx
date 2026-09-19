import React from 'react'
import { FiUsers, FiSend, FiMessageSquare, FiSettings } from 'react-icons/fi'

export default function DealerSubTabsNav({
    currentGroup,
    activeTab,
    onSelectSubTab,
    membersCount = 0,
    upstreamCount = 0
}) {
    if (currentGroup !== 'members' && currentGroup !== 'lineBot') {
        return null
    }

    if (currentGroup === 'members') {
        return (
            <div className="dealer-sub-tabs-container">
                <div className="dealer-sub-tabs-pill">
                    <button
                        type="button"
                        className={`dealer-sub-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => onSelectSubTab && onSelectSubTab('members')}
                    >
                        <FiUsers className="sub-tab-icon" />
                        <span>{`สมาชิก (${membersCount})`}</span>
                    </button>
                    <button
                        type="button"
                        className={`dealer-sub-tab-btn ${activeTab === 'upstreamDealers' ? 'active' : ''}`}
                        onClick={() => onSelectSubTab && onSelectSubTab('upstreamDealers')}
                    >
                        <FiSend className="sub-tab-icon" />
                        <span>{`เจ้ามือตีออก (${upstreamCount})`}</span>
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="dealer-sub-tabs-container">
            <div className="dealer-sub-tabs-pill">
                <button
                    type="button"
                    className={`dealer-sub-tab-btn ${activeTab === 'lineBot' ? 'active' : ''}`}
                    onClick={() => onSelectSubTab && onSelectSubTab('lineBot')}
                >
                    <FiMessageSquare className="sub-tab-icon" />
                    <span>จัดการ LINE Bot</span>
                </button>
                <button
                    type="button"
                    className={`dealer-sub-tab-btn ${activeTab === 'automation' ? 'active' : ''}`}
                    onClick={() => onSelectSubTab && onSelectSubTab('automation')}
                >
                    <FiSettings className="sub-tab-icon" />
                    <span>ตั้งค่าออโตเมชัน</span>
                </button>
            </div>
        </div>
    )
}
