import { useState } from 'react'
import {
    FiClock,
    FiCheck,
    FiUser,
    FiSlash,
    FiChevronDown,
    FiSettings,
    FiEdit2,
    FiTrash2
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import UpstreamDealerSettingsInline from './UpstreamDealerSettingsInline'
import UpstreamDealerSettings from './UpstreamDealerSettings'

// Upstream Dealer Accordion Item Component
export default function UpstreamDealerAccordionItem({ dealer, isExpanded, onToggle, onEdit, onDelete, onToggleBlock, onSaveSettings }) {
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'settings'
    const isLinked = dealer.is_linked
    const isBlocked = dealer.is_blocked
    const isPending = dealer.status === 'pending'

    return (
        <div className={`upstream-dealer-accordion-item ${isExpanded ? 'expanded' : ''}`} style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            border: isPending ? '2px solid var(--color-warning)' : isLinked ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            opacity: isBlocked ? 0.7 : 1
        }}>
            {/* Header - Click to toggle */}
            <div
                className="upstream-dealer-accordion-header"
                onClick={onToggle}
                style={{
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--color-surface-light)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none'
                }}
            >
                <div className="dealer-info-summary" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="dealer-avatar" style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: isPending ? 'var(--color-warning)' : isLinked ? 'var(--color-success)' : 'var(--color-text-muted)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        fontWeight: 'bold'
                    }}>
                        {isPending ? <FiClock /> : isLinked ? <FiCheck /> : <FiUser />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="dealer-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
                                {dealer.upstream_name || 'ไม่ระบุชื่อ'}
                            </span>
                            {isPending ? (
                                <span style={{
                                    background: 'var(--color-warning)',
                                    color: '#000',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    รออนุมัติ
                                </span>
                            ) : isLinked && (
                                <span style={{
                                    background: 'var(--color-success)',
                                    color: '#fff',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    ในระบบ
                                </span>
                            )}
                            {isBlocked && (
                                <span style={{
                                    background: 'var(--color-danger)',
                                    color: '#fff',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600'
                                }}>
                                    <FiSlash size={10} /> บล็อก
                                </span>
                            )}
                        </div>
                        <span className="dealer-contact" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            {isLinked && dealer.upstream_profile ? dealer.upstream_profile.email : (dealer.upstream_contact || 'ไม่มีข้อมูลติดต่อ')}
                        </span>
                    </div>
                </div>
                <div className="accordion-icon" style={{
                    color: isExpanded ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease'
                }}>
                    <FiChevronDown size={24} />
                </div>
            </div>

            {/* Body - Only visible if expanded */}
            {isExpanded && (
                <div className="upstream-dealer-accordion-body" style={{ padding: '1.5rem' }}>
                    {/* Internal Tabs */}
                    <div className="dealer-internal-tabs" style={{
                        display: 'flex',
                        gap: '1rem',
                        marginBottom: '1.5rem',
                        borderBottom: '1px solid var(--color-border)'
                    }}>
                        <button
                            onClick={() => setActiveTab('info')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'info' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'info' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <FiUser /> โปรไฟล์
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'settings' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <FiSettings /> ค่าคอม/อัตราจ่าย
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'info' && (
                        <div className="dealer-info-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div className="info-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '1.5rem'
                            }}>
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ชื่อเจ้ามือ</label>
                                    <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_name || '-'}</div>
                                </div>
                                {isLinked && dealer.upstream_profile && (
                                    <>
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>อีเมล</label>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_profile.email || '-'}</div>
                                        </div>
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>เบอร์โทร</label>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_profile.phone || '-'}</div>
                                        </div>
                                    </>
                                )}
                                {!isLinked && (
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ข้อมูลติดต่อ</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{dealer.upstream_contact || '-'}</div>
                                    </div>
                                )}
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ประเภท</label>
                                    <div style={{ fontSize: '1.1rem', color: isLinked ? 'var(--color-success)' : 'var(--color-warning)' }}>
                                        {isLinked ? 'เจ้ามือในระบบ' : 'เจ้ามือนอกระบบ'}
                                    </div>
                                </div>
                                <div className="info-item">
                                    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>สถานะ</label>
                                    <div style={{ fontSize: '1.1rem', color: isBlocked ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                        {isBlocked ? 'ถูกบล็อก' : 'ปกติ'}
                                    </div>
                                </div>
                                {dealer.notes && (
                                    <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>หมายเหตุ</label>
                                        <div style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{dealer.notes}</div>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={(e) => { e.stopPropagation(); onToggleBlock(); }}
                                    style={{ color: isBlocked ? 'var(--color-success)' : 'var(--color-warning)', borderColor: isBlocked ? 'var(--color-success)' : 'var(--color-warning)' }}
                                >
                                    {isBlocked ? <><FiCheck /> ปลดบล็อก</> : <><FiSlash /> บล็อก</>}
                                </button>
                                {!isLinked && (
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    >
                                        <FiEdit2 /> แก้ไข
                                    </button>
                                )}
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                >
                                    <FiTrash2 /> {isLinked ? 'ยกเลิกการเชื่อมต่อ' : 'ลบ'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="dealer-settings-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <UpstreamDealerSettingsInline
                                dealer={dealer}
                                isLinked={isLinked}
                                onSaved={onSaveSettings}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
