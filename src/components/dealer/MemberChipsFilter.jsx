import React from 'react'
import { FiFileText, FiCopy, FiClock, FiX } from 'react-icons/fi'
import SearchableDropdown from './SearchableDropdown'

/**
 * MemberChipsFilter
 * Handles member mode toggle (all vs submitted), include/exclude mode switch,
 * SearchableDropdown selector to add member chips, active chips display, and action buttons.
 */
export default function MemberChipsFilter({
    memberFilterMode = 'all',
    onMemberFilterModeChange,
    allMembersCount = 0,
    submittedMembersCount = 0,
    selectedMembers = [],
    onSelectedMembersChange,
    mode = 'include',
    onModeChange,
    memberOptions = [],
    canWriteBet = false,
    onWriteBet,
    onCopy,
    onExtend,
    isAnnounced = false,
    hasSubmissions = false
}) {
    const handleSelectOption = (val) => {
        if (!val || val === 'all') {
            onSelectedMembersChange([])
            return
        }
        if (!selectedMembers.includes(val)) {
            onSelectedMembersChange([...selectedMembers, val])
        }
    }

    const handleRemoveMember = (name) => {
        onSelectedMembersChange(selectedMembers.filter(m => m !== name))
    }

    const handleClearMembers = () => {
        onSelectedMembersChange([])
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {/* Row 0: Member filter buttons (all vs submitted) */}
            <div className="member-filter-row">
                <button
                    type="button"
                    className={`filter-btn ${memberFilterMode === 'all' ? 'active' : ''}`}
                    onClick={() => {
                        onMemberFilterModeChange('all')
                        onSelectedMembersChange([])
                    }}
                    style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '20px',
                        border: memberFilterMode === 'all' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: memberFilterMode === 'all' ? 'var(--color-primary)' : 'transparent',
                        color: memberFilterMode === 'all' ? '#000' : 'var(--color-text)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                    }}
                >
                    สมาชิกทั้งหมด ({allMembersCount})
                </button>
                <button
                    type="button"
                    className={`filter-btn ${memberFilterMode === 'submitted' ? 'active' : ''}`}
                    onClick={() => {
                        onMemberFilterModeChange('submitted')
                        onSelectedMembersChange([])
                    }}
                    style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '20px',
                        border: memberFilterMode === 'submitted' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: memberFilterMode === 'submitted' ? 'var(--color-primary)' : 'transparent',
                        color: memberFilterMode === 'submitted' ? '#000' : 'var(--color-text)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                    }}
                >
                    สมาชิกส่งเลข ({submittedMembersCount})
                </button>
            </div>

            {/* Row 0.5: Mode Switch + Dropdown Selector + Action Buttons */}
            <div className="round-filter-member-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                    {/* Include / Exclude Mode Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                        <button
                            type="button"
                            className={`filter-btn ${mode === 'include' ? 'active' : ''}`}
                            onClick={() => onModeChange('include')}
                            style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '16px',
                                border: mode === 'include' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                background: mode === 'include' ? 'var(--color-primary)' : 'transparent',
                                color: mode === 'include' ? '#000' : 'var(--color-text)',
                                fontSize: '0.78rem',
                                fontWeight: mode === 'include' ? 600 : 400,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                            title="แสดงเฉพาะสมาชิกที่เลือก"
                        >
                            แสดงเฉพาะ
                        </button>
                        <button
                            type="button"
                            className={`filter-btn ${mode === 'exclude' ? 'active' : ''}`}
                            onClick={() => onModeChange('exclude')}
                            style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '16px',
                                border: mode === 'exclude' ? '1px solid #ef4444' : '1px solid var(--color-border)',
                                background: mode === 'exclude' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                                color: mode === 'exclude' ? '#ef4444' : 'var(--color-text)',
                                fontSize: '0.78rem',
                                fontWeight: mode === 'exclude' ? 600 : 400,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                            title="ไม่แสดง / ยกเว้นสมาชิกที่เลือก"
                        >
                            ไม่เอา
                        </button>
                    </div>

                    {/* Member Selector Dropdown */}
                    <div className="round-filter-dropdown-wrapper" style={{ flex: 1, minWidth: '160px' }}>
                        <SearchableDropdown
                            value=""
                            onChange={handleSelectOption}
                            options={memberOptions}
                            placeholder="+ ค้นหาและเลือกสมาชิก..."
                            displayLabel={selectedMembers.length === 0 ? "ทุกคน (เลือกเพิ่ม...)" : `+ เพิ่มสมาชิก (${selectedMembers.length} คน)...`}
                        />
                    </div>
                </div>

                {/* Actions Group */}
                <div className="round-filter-actions-group">
                    {canWriteBet && (
                        <button
                            type="button"
                            className="btn btn-primary btn-sm round-filter-btn"
                            onClick={onWriteBet}
                            title="เขียนโพย"
                        >
                            <FiFileText /> เขียนโพย
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-outline btn-sm round-filter-btn"
                        onClick={onCopy}
                        disabled={!hasSubmissions}
                        title="คัดลอกยอดรับรวม"
                    >
                        <FiCopy /> คัดลอก
                    </button>
                    {!isAnnounced && (
                        <button
                            type="button"
                            className="btn btn-outline btn-sm round-filter-btn round-filter-btn-extend"
                            onClick={onExtend}
                            title="ตั้งเวลาปิดรับ หรือยืดเวลาส่งเลขเฉพาะบุคคล"
                        >
                            <FiClock /> ขยายเวลา
                        </button>
                    )}
                </div>
            </div>

            {/* Row 0.6: Selected Member Chips */}
            {selectedMembers.length > 0 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    padding: '0.45rem 0.65rem',
                    background: mode === 'exclude' ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)',
                    border: `1px solid ${mode === 'exclude' ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.28)'}`,
                    borderRadius: '8px'
                }}>
                    <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: mode === 'exclude' ? '#ef4444' : 'var(--color-warning)'
                    }}>
                        {mode === 'exclude' ? `🚫 ยกเว้นสมาชิก (${selectedMembers.length}):` : `สมาชิกที่เลือก (${selectedMembers.length}):`}
                    </span>

                    {selectedMembers.map(memberName => (
                        <span
                            key={memberName}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                background: mode === 'exclude' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                border: `1px solid ${mode === 'exclude' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                                color: mode === 'exclude' ? '#ef4444' : '#fbbf24'
                            }}
                        >
                            <span>{memberName}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveMember(memberName)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    marginLeft: '0.15rem',
                                    cursor: 'pointer',
                                    color: 'inherit',
                                    display: 'inline-flex',
                                    alignItems: 'center'
                                }}
                                title={`ลบ ${memberName}`}
                            >
                                <FiX size={12} />
                            </button>
                        </span>
                    ))}

                    <button
                        type="button"
                        onClick={handleClearMembers}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.72rem',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            marginLeft: 'auto'
                        }}
                        title="ล้างรายชื่อสมาชิกที่เลือกทั้งหมด"
                    >
                        ล้างสมาชิก
                    </button>
                </div>
            )}
        </div>
    )
}
