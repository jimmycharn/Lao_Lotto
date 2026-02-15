import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
    FiSend,
    FiUsers,
    FiChevronDown,
    FiCopy,
    FiLock,
    FiTrash2,
    FiLink,
    FiSettings,
    FiStar,
    FiCreditCard
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import MemberSettings from './MemberSettings'
import BankAccountCard from '../BankAccountCard'

// Member Accordion Item Component
export default function MemberAccordionItem({ member, formatDate, isExpanded, onToggle, onBlock, onDelete, onDisconnect, dealerBankAccounts = [], onUpdateBank, isDealer = false, onCopyCredentials }) {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'bank' | 'settings'

    return (
        <div className={`member-accordion-item ${isExpanded ? 'expanded' : ''}`} style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '1rem',
            border: isDealer ? '2px solid var(--color-info)' : '1px solid var(--color-border)',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
        }}>
            {/* Header - Click to toggle */}
            <div
                className="member-accordion-header"
                onClick={onToggle}
                style={{
                    padding: '1rem 1.25rem',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--color-surface-light)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none'
                }}
            >
                {/* Top row: Avatar, Name/Email, Chevron */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="member-info-summary" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="member-avatar" style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: isDealer ? 'var(--color-info)' : 'var(--color-primary)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            fontWeight: 'bold'
                        }}>
                            {isDealer ? <FiSend /> : (member.full_name ? member.full_name.charAt(0).toUpperCase() : <FiUsers />)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="member-name" style={{ fontWeight: '600', color: 'var(--color-text)', fontSize: '1.1rem' }}>
                                    {member.full_name || 'ไม่ระบุชื่อ'}
                                </span>
                                {isDealer && (
                                    <span style={{
                                        background: member.id === user?.id ? 'var(--color-warning)' : 'var(--color-info)',
                                        color: '#fff',
                                        padding: '0.15rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        fontWeight: '600'
                                    }}>
                                        {member.id === user?.id ? 'เจ้ามือส่งออก' : 'เจ้ามือ'}
                                    </span>
                                )}
                            </div>
                            <span className="member-email" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                {member.email}
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

                {/* Bottom row: Action buttons - icon only for mobile friendly */}
                <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--color-border)',
                    marginLeft: '56px'
                }}>
                    {/* Copy button - only for non-dealer and password not changed */}
                    {!isDealer && onCopyCredentials && !member.password_changed && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCopyCredentials(member); }}
                            style={{ 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                borderRadius: '50%',
                                color: 'var(--color-text-muted)',
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px'
                            }}
                            title="คัดลอกข้อมูลเข้าสู่ระบบ"
                        >
                            <FiCopy size={14} />
                        </button>
                    )}
                    {/* Block button - for all members */}
                    {onBlock && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBlock(); }}
                            style={{ 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: '1px solid var(--color-warning)',
                                borderRadius: '50%',
                                color: 'var(--color-warning)',
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px'
                            }}
                            title="บล็อคสมาชิก"
                        >
                            <FiLock size={14} />
                        </button>
                    )}
                    {/* Delete button - only for non-dealer */}
                    {!isDealer && onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            style={{ 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: '1px solid var(--color-error)',
                                borderRadius: '50%',
                                color: 'var(--color-error)',
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px'
                            }}
                            title="ลบสมาชิก"
                        >
                            <FiTrash2 size={14} />
                        </button>
                    )}
                    {/* Disconnect button - only for dealer */}
                    {isDealer && onDisconnect && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
                            style={{ 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: '1px solid var(--color-error)',
                                borderRadius: '50%',
                                color: 'var(--color-error)',
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px'
                            }}
                            title="ยกเลิกการเชื่อมต่อ"
                        >
                            <FiLink size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Body - Only visible if expanded */}
            {isExpanded && (
                <div className="member-accordion-body" style={{ padding: '1.5rem' }}>
                    {/* Internal Tabs */}
                    <div className="member-internal-tabs" style={{
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
                                transition: 'all 0.2s'
                            }}
                        >
                            <FiUsers style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                            ข้อมูลทั่วไป
                        </button>
                        <button
                            onClick={() => setActiveTab('bank')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'bank' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'bank' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FiCreditCard style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                            บัญชีธนาคาร
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
                                transition: 'all 0.2s'
                            }}
                        >
                            <FiSettings style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                            ตั้งค่า
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="member-tab-content">
                        {activeTab === 'info' && (
                            <div className="member-info-view" style={{ animation: 'fadeIn 0.3s ease' }}>
                                <div className="info-grid" style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '1.5rem'
                                }}>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>เบอร์โทรศัพท์</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{member.phone || '-'}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>วันที่สมัคร</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{formatDate(member.created_at)}</div>
                                    </div>
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>สถานะ</label>
                                        <div style={{ fontSize: '1.1rem', color: 'var(--color-success)' }}>
                                            <span className="status-badge open" style={{ fontSize: '0.9rem' }}>ปกติ</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'bank' && (
                            <div className="member-bank-view" style={{ animation: 'fadeIn 0.3s ease' }}>
                                {/* Member's bank account display */}
                                {(member.member_bank || member.bank_name) ? (
                                    <BankAccountCard
                                        bank={member.member_bank || { bank_name: member.bank_name, bank_account: member.bank_account, account_name: member.account_name }}
                                        title="บัญชีธนาคารสมาชิก"
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)', opacity: 0.7 }}>
                                        สมาชิกยังไม่ได้ตั้งค่าบัญชีธนาคาร
                                    </div>
                                )}

                                {/* Bank Account Assignment for this member */}
                                {dealerBankAccounts.length > 0 && onUpdateBank && (
                                    <div className="bank-assignment-section" style={{
                                        marginTop: '1.5rem',
                                        padding: '1rem',
                                        background: 'rgba(212, 175, 55, 0.1)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)'
                                    }}>
                                        <label style={{
                                            display: 'block',
                                            color: 'var(--color-primary)',
                                            fontSize: '0.9rem',
                                            marginBottom: '0.5rem',
                                            fontWeight: '500'
                                        }}>
                                            <FiStar style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                                            บัญชีธนาคารสำหรับโอนเงิน
                                        </label>
                                        <select
                                            className="form-input"
                                            value={member.assigned_bank_account_id || ''}
                                            onChange={(e) => onUpdateBank(e.target.value || null)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                background: 'var(--color-surface)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: '0.75rem 1rem',
                                                color: 'var(--color-text)',
                                                width: '100%',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">ใช้บัญชีหลัก (Default)</option>
                                            {dealerBankAccounts.map(bank => (
                                                <option key={bank.id} value={bank.id}>
                                                    {bank.bank_name} - {bank.bank_account}
                                                    {bank.is_default ? ' (หลัก)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <p style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--color-text-muted)',
                                            marginTop: '0.5rem',
                                            opacity: 0.8
                                        }}>
                                            ลูกค้าจะเห็นบัญชีนี้ในหน้าข้อมูลเจ้ามือ
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="member-settings-wrapper" style={{ animation: 'fadeIn 0.3s ease' }}>
                                <MemberSettings
                                    member={member}
                                    isInline={true}
                                    onClose={() => { }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
