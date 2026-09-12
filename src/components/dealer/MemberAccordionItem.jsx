import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
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
    FiCreditCard,
    FiRefreshCw,
    FiClock,
    FiCheck
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import MemberSettings from './MemberSettings'
import BankAccountCard from '../BankAccountCard'
import CopyButton from '../CopyButton'

// Member Accordion Item Component
export default function MemberAccordionItem({ member, formatDate, isExpanded, onToggle, onBlock, onDelete, onDisconnect, dealerBankAccounts = [], onUpdateBank, isDealer = false, onCopyCredentials, isPerUserYearly = false, onRenew, onUpdateLineUserId }) {
    // Membership expiry helpers
    const membershipExpired = isPerUserYearly && !isDealer && member.membership_expires_at
        ? new Date(member.membership_expires_at) < new Date()
        : (isPerUserYearly && !isDealer && !member.membership_expires_at) // No expiry set = expired for per_user_yearly
    const membershipExpiringSoon = isPerUserYearly && !isDealer && member.membership_expires_at && !membershipExpired
        ? (new Date(member.membership_expires_at) - new Date()) / (1000 * 60 * 60 * 24) <= 30
        : false
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'bank' | 'settings'
    const [lineUserId, setLineUserId] = useState(member.line_user_id || '')
    const [isSavingLineId, setIsSavingLineId] = useState(false)
    const [memberPayoutBank, setMemberPayoutBank] = useState(member.member_bank || null)
    const [loadingBank, setLoadingBank] = useState(false)

    useEffect(() => {
        setLineUserId(member.line_user_id || '')
    }, [member.line_user_id])

    useEffect(() => {
        if (member.member_bank) {
            setMemberPayoutBank(member.member_bank)
        }
    }, [member.member_bank])

    const fetchMemberBank = async (force = false) => {
        if (!member?.id) return
        if (!force && memberPayoutBank) return
        setLoadingBank(true)
        try {
            // 1. Check user_dealer_memberships for member_bank_account_id
            let targetBankId = member.member_bank_account_id || null
            if (!targetBankId && user?.id) {
                const { data: membership } = await supabase
                    .from('user_dealer_memberships')
                    .select('member_bank_account_id')
                    .eq('dealer_id', user.id)
                    .eq('user_id', member.id)
                    .maybeSingle()
                if (membership?.member_bank_account_id) {
                    targetBankId = membership.member_bank_account_id
                }
            }

            // 2. Fetch specific bank if assigned
            if (targetBankId) {
                const { data: specificBank } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .eq('id', targetBankId)
                    .maybeSingle()
                if (specificBank) {
                    setMemberPayoutBank({
                        ...specificBank,
                        is_assigned: true
                    })
                    setLoadingBank(false)
                    return
                }
            }

            // 3. Fallback to member's user_bank_accounts (default first)
            const { data: userBanks } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', member.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (userBanks && userBanks.length > 0) {
                const topBank = userBanks[0]
                setMemberPayoutBank({
                    ...topBank,
                    is_assigned: false,
                    is_default: topBank.is_default
                })
                setLoadingBank(false)
                return
            }

            // 4. If isDealer, check dealer_bank_accounts
            if (isDealer || member.is_dealer) {
                const { data: dealerBanks } = await supabase
                    .from('dealer_bank_accounts')
                    .select('*')
                    .eq('dealer_id', member.id)
                    .order('is_default', { ascending: false })
                    .order('created_at', { ascending: true })

                if (dealerBanks && dealerBanks.length > 0) {
                    const topDealerBank = dealerBanks[0]
                    setMemberPayoutBank({
                        ...topDealerBank,
                        is_assigned: false,
                        is_default: topDealerBank.is_default
                    })
                    setLoadingBank(false)
                    return
                }
            }

            // 5. Fallback to profile bank details if available
            if (member.bank_name || member.bank_account) {
                setMemberPayoutBank({
                    bank_name: member.bank_name,
                    bank_account: member.bank_account || member.bank_account_number,
                    account_name: member.bank_account_name || member.full_name,
                    is_assigned: false,
                    is_default: false
                })
                setLoadingBank(false)
                return
            }

            setMemberPayoutBank(null)
        } catch (err) {
            console.error('Error fetching member payout bank:', err)
        } finally {
            setLoadingBank(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'bank' && !memberPayoutBank) {
            fetchMemberBank()
        }
    }, [activeTab])

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
                            {isPerUserYearly && !isDealer && (
                                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                    {membershipExpired ? (
                                        <span style={{
                                            background: 'var(--color-error)',
                                            color: '#fff',
                                            padding: '0.1rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}>
                                            หมดอายุแล้ว
                                        </span>
                                    ) : membershipExpiringSoon ? (
                                        <span style={{
                                            background: 'var(--color-warning)',
                                            color: '#fff',
                                            padding: '0.1rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}>
                                            <FiClock size={10} style={{ marginRight: '3px', verticalAlign: 'text-bottom' }} />
                                            ใกล้หมดอายุ
                                        </span>
                                    ) : member.membership_expires_at ? (
                                        <span style={{
                                            background: 'var(--color-success)',
                                            color: '#fff',
                                            padding: '0.1rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}>
                                            ใช้งานได้
                                        </span>
                                    ) : null}
                                    {member.membership_expires_at && (
                                        <span style={{
                                            color: 'var(--color-text-muted)',
                                            fontSize: '0.7rem',
                                            lineHeight: '1.5'
                                        }}>
                                            ถึง {new Date(member.membership_expires_at).toLocaleDateString('th-TH')}
                                        </span>
                                    )}
                                </div>
                            )}
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
                    {/* Renew button - only for per_user_yearly non-dealer members */}
                    {isPerUserYearly && !isDealer && onRenew && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRenew(member); }}
                            style={{ 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: membershipExpired ? 'var(--color-primary)' : 'transparent',
                                border: membershipExpired ? '1px solid var(--color-primary)' : '1px solid var(--color-success)',
                                borderRadius: '50%',
                                color: membershipExpired ? '#fff' : 'var(--color-success)',
                                cursor: 'pointer',
                                width: '32px',
                                height: '32px'
                            }}
                            title="ต่ออายุสมาชิก"
                        >
                            <FiRefreshCw size={14} />
                        </button>
                    )}
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
                                        <div style={{ fontSize: '1.1rem', color: membershipExpired ? 'var(--color-error)' : 'var(--color-success)' }}>
                                            <span className={`status-badge ${membershipExpired ? 'closed' : 'open'}`} style={{ fontSize: '0.9rem' }}>
                                                {membershipExpired ? 'หมดอายุ' : 'ปกติ'}
                                            </span>
                                        </div>
                                    </div>
                                    {isPerUserYearly && !isDealer && member.membership_expires_at && (
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>วันหมดอายุ</label>
                                            <div style={{ fontSize: '1.1rem', color: membershipExpired ? 'var(--color-error)' : 'var(--color-text)' }}>
                                                {new Date(member.membership_expires_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </div>
                                        </div>
                                    )}
                                    {isPerUserYearly && !isDealer && member.membership_years && (
                                        <div className="info-item">
                                            <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>จำนวนปีที่ซื้อ</label>
                                            <div style={{ fontSize: '1.1rem', color: 'var(--color-text)' }}>{member.membership_years} ปี</div>
                                        </div>
                                    )}
                                    <div className="info-item" style={{ gridColumn: 'span 2' }}>
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ผูกบัญชี Line User ID</label>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="ระบุ Line User ID (เช่น U94906fc...)"
                                                value={lineUserId}
                                                onChange={(e) => setLineUserId(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={isSavingLineId}
                                                style={{
                                                    flex: 1,
                                                    background: 'var(--color-surface)',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    padding: '0.5rem 0.75rem',
                                                    color: 'var(--color-text)',
                                                    fontSize: '0.95rem'
                                                }}
                                            />
                                            <button
                                                className="btn btn-primary"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setIsSavingLineId(true);
                                                    try {
                                                        await onUpdateLineUserId(lineUserId);
                                                    } catch (err) {
                                                        // error toast shown by parent
                                                    } finally {
                                                        setIsSavingLineId(false);
                                                    }
                                                }}
                                                disabled={isSavingLineId || lineUserId === (member.line_user_id || '')}
                                                style={{
                                                    padding: '0.5rem 1.25rem',
                                                    fontSize: '0.95rem',
                                                    fontWeight: '500',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer',
                                                    background: lineUserId === (member.line_user_id || '') ? 'var(--color-border)' : 'var(--color-primary)',
                                                    borderColor: lineUserId === (member.line_user_id || '') ? 'var(--color-border)' : 'var(--color-primary)',
                                                    color: '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {isSavingLineId ? 'กำลังบันทึก...' : 'บันทึก'}
                                            </button>
                                        </div>
                                        <p style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--color-text-muted)',
                                            marginTop: '0.35rem',
                                            opacity: 0.8
                                        }}>
                                            เมื่อผูกแล้ว สมาชิกจะสามารถส่งเลขทางไลน์ของกลุ่มร้านคุณได้ทันที
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'bank' && (
                            <div className="member-bank-view" style={{ animation: 'fadeIn 0.3s ease' }}>
                                {/* Section 1: Member's Payout Bank Account (for dealer to transfer winnings to member) */}
                                <div className="member-payout-bank-section" style={{
                                    background: 'rgba(34, 197, 94, 0.05)',
                                    border: '1px solid rgba(34, 197, 94, 0.25)',
                                    borderRadius: 'var(--radius-md, 8px)',
                                    padding: '1.25rem'
                                }}>
                                    {/* Section Header */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        marginBottom: '0.85rem',
                                        gap: '0.5rem'
                                    }}>
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                color: '#22c55e',
                                                fontWeight: 600,
                                                fontSize: '1rem'
                                            }}>
                                                <FiCreditCard style={{ fontSize: '1.15rem' }} />
                                                <span>บัญชีสำหรับรับเงินรางวัล (ของสมาชิก)</span>
                                            </div>
                                            <p style={{
                                                fontSize: '0.82rem',
                                                color: 'var(--color-text-muted)',
                                                margin: '0.25rem 0 0 0',
                                                opacity: 0.9
                                            }}>
                                                เมื่อสมาชิกถูกรางวัล เจ้ามือโอนเงินรางวัลไปยังบัญชีนี้
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                fetchMemberBank(true)
                                            }}
                                            disabled={loadingBank}
                                            title="รีเฟรชข้อมูลบัญชีสมาชิก"
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--color-border)',
                                                color: 'var(--color-text-muted)',
                                                cursor: loadingBank ? 'not-allowed' : 'pointer',
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                fontSize: '0.78rem',
                                                flexShrink: 0,
                                                transition: 'all 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                        >
                                            <FiRefreshCw style={{
                                                fontSize: '0.85rem',
                                                animation: loadingBank ? 'spin 1s linear infinite' : 'none'
                                            }} />
                                            <span>{loadingBank ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
                                        </button>
                                    </div>

                                    {/* Bank Details or Empty State */}
                                    {loadingBank ? (
                                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                            <FiRefreshCw style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom', animation: 'spin 1s linear infinite' }} />
                                            กำลังตรวจสอบข้อมูลบัญชีสมาชิก...
                                        </div>
                                    ) : memberPayoutBank ? (
                                        <div style={{
                                            background: 'var(--color-surface)',
                                            border: '1px solid rgba(34, 197, 94, 0.35)',
                                            borderRadius: 'var(--radius-md, 8px)',
                                            padding: '1rem 1.25rem',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                        }}>
                                            {/* Bank Name + Badge */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '0.5rem',
                                                marginBottom: '0.5rem',
                                                paddingBottom: '0.5rem',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <FiStar style={{ color: '#22c55e', fontSize: '1.1rem' }} />
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '1.05rem' }}>
                                                        {memberPayoutBank.bank_name || 'ไม่ระบุธนาคาร'}
                                                    </span>
                                                </div>

                                                {/* Status Badge */}
                                                {memberPayoutBank.is_assigned ? (
                                                    <span style={{
                                                        background: 'rgba(34, 197, 94, 0.15)',
                                                        color: '#22c55e',
                                                        border: '1px solid rgba(34, 197, 94, 0.35)',
                                                        borderRadius: '4px',
                                                        padding: '0.15rem 0.5rem',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}>
                                                        <FiCheck style={{ fontSize: '0.75rem' }} />
                                                        บัญชีที่สมาชิกเลือกให้ร้านนี้
                                                    </span>
                                                ) : memberPayoutBank.is_default ? (
                                                    <span style={{
                                                        background: 'rgba(212, 175, 55, 0.15)',
                                                        color: 'var(--color-primary)',
                                                        border: '1px solid rgba(212, 175, 55, 0.35)',
                                                        borderRadius: '4px',
                                                        padding: '0.15rem 0.5rem',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600
                                                    }}>
                                                        บัญชีหลักของสมาชิก
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        background: 'rgba(255, 255, 255, 0.08)',
                                                        color: 'var(--color-text-muted)',
                                                        borderRadius: '4px',
                                                        padding: '0.15rem 0.5rem',
                                                        fontSize: '0.72rem'
                                                    }}>
                                                        บัญชีของสมาชิก
                                                    </span>
                                                )}
                                            </div>

                                            {/* Account Name */}
                                            {memberPayoutBank.account_name && (
                                                <div style={{
                                                    fontSize: '0.88rem',
                                                    color: 'var(--color-text-muted)',
                                                    marginBottom: '0.4rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem'
                                                }}>
                                                    <span style={{ opacity: 0.7 }}>ชื่อบัญชี:</span>
                                                    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{memberPayoutBank.account_name}</span>
                                                </div>
                                            )}

                                            {/* Account Number & Copy */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '0.5rem',
                                                marginTop: '0.35rem',
                                                padding: '0.5rem 0.75rem',
                                                background: 'rgba(0,0,0,0.25)',
                                                borderRadius: '6px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', opacity: 0.7 }}>
                                                        เลขบัญชี:
                                                    </span>
                                                    <span style={{
                                                        fontSize: '1.15rem',
                                                        fontFamily: 'monospace',
                                                        letterSpacing: '0.06em',
                                                        color: '#22c55e',
                                                        fontWeight: 700
                                                    }}>
                                                        {memberPayoutBank.bank_account || memberPayoutBank.account_number || '-'}
                                                    </span>
                                                </div>
                                                {(memberPayoutBank.bank_account || memberPayoutBank.account_number) && (
                                                    <CopyButton text={memberPayoutBank.bank_account || memberPayoutBank.account_number} size={14} />
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            textAlign: 'center',
                                            padding: '1.25rem 1rem',
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px dashed rgba(255, 255, 255, 0.15)',
                                            borderRadius: 'var(--radius-md, 8px)'
                                        }}>
                                            <FiCreditCard style={{ fontSize: '1.75rem', color: 'var(--color-text-muted)', opacity: 0.5, marginBottom: '0.35rem' }} />
                                            <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-text)', fontSize: '0.92rem' }}>
                                                สมาชิกยังไม่ได้ระบุบัญชีสำหรับรับเงินรางวัล
                                            </p>
                                            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', opacity: 0.8 }}>
                                                เมื่อสมาชิกเพิ่มบัญชีในหน้า "ข้อมูลเจ้ามือ" หรือ "โปรไฟล์" ข้อมูลจะแสดงที่นี่โดยอัตโนมัติ
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Section 2: Dealer's Bank Account Assigned to this Member (for member to pay in) */}
                                {dealerBankAccounts.length > 0 && onUpdateBank && (
                                    <div className="bank-assignment-section" style={{
                                        marginTop: '1.25rem',
                                        padding: '1.25rem',
                                        background: 'rgba(212, 175, 55, 0.08)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(212, 175, 55, 0.3)'
                                    }}>
                                        <label style={{
                                            display: 'block',
                                            color: 'var(--color-primary)',
                                            fontSize: '0.95rem',
                                            marginBottom: '0.25rem',
                                            fontWeight: '600'
                                        }}>
                                            <FiStar style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                                            บัญชีธนาคารของเจ้ามือ (สำหรับให้สมาชิกโอนชำระเงิน)
                                        </label>
                                        <p style={{
                                            fontSize: '0.82rem',
                                            color: 'var(--color-text-muted)',
                                            marginBottom: '0.75rem',
                                            opacity: 0.9
                                        }}>
                                            เลือกว่าต้องการให้สมาชิกรายนี้เห็นบัญชีใดของร้านในหน้า "ข้อมูลเจ้ามือ" เพื่อโอนชำระยอด
                                        </p>
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
                                                cursor: 'pointer',
                                                fontSize: '0.92rem'
                                            }}
                                        >
                                            <option value="">ใช้บัญชีหลักของร้าน (Default)</option>
                                            {dealerBankAccounts.map(bank => (
                                                <option key={bank.id} value={bank.id}>
                                                    {bank.bank_name} - {bank.bank_account}
                                                    {bank.is_default ? ' (หลัก)' : ''}
                                                </option>
                                            ))}
                                        </select>
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
