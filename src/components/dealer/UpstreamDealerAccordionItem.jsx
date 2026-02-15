import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
    FiClock,
    FiCheck,
    FiUser,
    FiSlash,
    FiChevronDown,
    FiSettings,
    FiEdit2,
    FiTrash2,
    FiPlus,
    FiStar,
    FiCreditCard,
    FiX
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import UpstreamDealerSettingsInline from './UpstreamDealerSettingsInline'
import UpstreamDealerSettings from './UpstreamDealerSettings'
import BankAccountCard from '../BankAccountCard'
import CopyButton from '../CopyButton'

// Upstream Dealer Accordion Item Component
export default function UpstreamDealerAccordionItem({ dealer, isExpanded, onToggle, onEdit, onDelete, onToggleBlock, onSaveSettings }) {
    const [activeTab, setActiveTab] = useState('info') // 'info' | 'settings' | 'bank'
    const isLinked = dealer.is_linked
    const isBlocked = dealer.is_blocked
    const isPending = isLinked && dealer.status === 'pending'

    // Bank account state (for external dealers)
    const [bankAccounts, setBankAccounts] = useState([])
    const [loadingBanks, setLoadingBanks] = useState(false)
    const [showBankForm, setShowBankForm] = useState(false)
    const [editingBank, setEditingBank] = useState(null)
    const [savingBank, setSavingBank] = useState(false)
    const [bankFormData, setBankFormData] = useState({
        bank_name: '',
        bank_account: '',
        account_name: '',
        is_default: false
    })

    // Bank account state (for linked/in-system dealers - read only)
    const [linkedDealerBank, setLinkedDealerBank] = useState(null)
    const [loadingLinkedBank, setLoadingLinkedBank] = useState(false)

    // Current dealer's own bank accounts (to assign to upstream dealer)
    const [myBankAccounts, setMyBankAccounts] = useState([])
    const [myMemberBankAccountId, setMyMemberBankAccountId] = useState(null)
    const [savingMyBank, setSavingMyBank] = useState(false)

    // Fetch bank accounts when expanded and tab is bank
    useEffect(() => {
        if (isExpanded && activeTab === 'bank') {
            if (isLinked) {
                fetchLinkedDealerBank()
            } else {
                fetchBankAccounts()
            }
        }
    }, [isExpanded, activeTab])

    // Fetch the bank account that the upstream (linked) dealer assigned for us, or their default
    async function fetchLinkedDealerBank() {
        if (!dealer.upstream_dealer_id) return
        setLoadingLinkedBank(true)
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser()
            if (!currentUser) return

            // Check membership for assigned_bank_account_id and member_bank_account_id
            const { data: membership } = await supabase
                .from('user_dealer_memberships')
                .select('assigned_bank_account_id, member_bank_account_id')
                .eq('user_id', currentUser.id)
                .eq('dealer_id', dealer.upstream_dealer_id)
                .eq('status', 'active')
                .maybeSingle()

            // Also check dealer_upstream_connections for assigned_bank_account_id and my_bank_account_id
            const { data: connection } = await supabase
                .from('dealer_upstream_connections')
                .select('assigned_bank_account_id, my_bank_account_id')
                .eq('dealer_id', currentUser.id)
                .eq('upstream_dealer_id', dealer.upstream_dealer_id)
                .maybeSingle()

            // Resolve assigned_bank_account_id: connection takes priority over membership
            const assignedId = connection?.assigned_bank_account_id || membership?.assigned_bank_account_id

            // Fetch the upstream dealer's bank accounts
            const { data: dealerBanks } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', dealer.upstream_dealer_id)
                .order('is_default', { ascending: false })

            if (dealerBanks && dealerBanks.length > 0) {
                const bank = assignedId
                    ? dealerBanks.find(b => b.id === assignedId)
                    : (dealerBanks.find(b => b.is_default) || dealerBanks[0])
                setLinkedDealerBank(bank || null)
            } else {
                setLinkedDealerBank(null)
            }

            // Fetch current dealer's own bank accounts for the "my bank" dropdown
            // Dealers have both user_bank_accounts and dealer_bank_accounts
            // member_bank_account_id FK references user_bank_accounts
            // my_bank_account_id FK references dealer_bank_accounts
            // Fetch both and combine
            const { data: myUserBanks } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('is_default', { ascending: false })

            const { data: myDealerBanks } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', currentUser.id)
                .order('is_default', { ascending: false })

            // Combine both types of bank accounts for the dropdown
            const allMyBanks = [...(myUserBanks || []), ...(myDealerBanks || [])]
            setMyBankAccounts(allMyBanks)

            // Resolve current "my bank" setting: connection.my_bank_account_id > membership.member_bank_account_id
            setMyMemberBankAccountId(connection?.my_bank_account_id || membership?.member_bank_account_id || null)
        } catch (error) {
            console.error('Error fetching linked dealer bank:', error)
        } finally {
            setLoadingLinkedBank(false)
        }
    }

    async function fetchBankAccounts() {
        if (!dealer.id || isLinked) return
        setLoadingBanks(true)
        try {
            const { data, error } = await supabase
                .from('upstream_dealer_bank_accounts')
                .select('*')
                .eq('connection_id', dealer.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false })
            if (error) throw error
            setBankAccounts(data || [])

            // Also fetch current dealer's own bank accounts and my_bank_account_id
            const { data: { user: currentUser } } = await supabase.auth.getUser()
            if (currentUser) {
                const { data: myDealerBanks } = await supabase
                    .from('dealer_bank_accounts')
                    .select('*')
                    .eq('dealer_id', currentUser.id)
                    .order('is_default', { ascending: false })

                const { data: myUserBanks } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('is_default', { ascending: false })

                setMyBankAccounts([...(myDealerBanks || []), ...(myUserBanks || [])])

                // Get my_bank_account_id from the connection
                const { data: conn } = await supabase
                    .from('dealer_upstream_connections')
                    .select('my_bank_account_id')
                    .eq('id', dealer.id)
                    .single()
                setMyMemberBankAccountId(conn?.my_bank_account_id || null)
            }
        } catch (error) {
            console.error('Error fetching bank accounts:', error)
        } finally {
            setLoadingBanks(false)
        }
    }

    async function handleSaveBank() {
        if (!bankFormData.bank_name.trim() || !bankFormData.bank_account.trim()) return
        setSavingBank(true)
        try {
            if (editingBank) {
                const { error } = await supabase
                    .from('upstream_dealer_bank_accounts')
                    .update({
                        bank_name: bankFormData.bank_name,
                        bank_account: bankFormData.bank_account,
                        account_name: bankFormData.account_name,
                        is_default: bankFormData.is_default
                    })
                    .eq('id', editingBank.id)
                if (error) throw error
            } else {
                const { data: { user } } = await supabase.auth.getUser()
                const { error } = await supabase
                    .from('upstream_dealer_bank_accounts')
                    .insert({
                        connection_id: dealer.id,
                        dealer_id: user.id,
                        bank_name: bankFormData.bank_name,
                        bank_account: bankFormData.bank_account,
                        account_name: bankFormData.account_name,
                        is_default: bankAccounts.length === 0 ? true : bankFormData.is_default
                    })
                if (error) throw error
            }
            setShowBankForm(false)
            setEditingBank(null)
            setBankFormData({ bank_name: '', bank_account: '', account_name: '', is_default: false })
            fetchBankAccounts()
        } catch (error) {
            console.error('Error saving bank:', error)
        } finally {
            setSavingBank(false)
        }
    }

    async function handleDeleteBank(bankId) {
        if (!confirm('ต้องการลบบัญชีนี้?')) return
        try {
            const { error } = await supabase
                .from('upstream_dealer_bank_accounts')
                .delete()
                .eq('id', bankId)
            if (error) throw error
            fetchBankAccounts()
        } catch (error) {
            console.error('Error deleting bank:', error)
        }
    }

    async function handleSetDefaultBank(bankId) {
        try {
            const { error } = await supabase
                .from('upstream_dealer_bank_accounts')
                .update({ is_default: true })
                .eq('id', bankId)
            if (error) throw error
            fetchBankAccounts()
        } catch (error) {
            console.error('Error setting default:', error)
        }
    }

    function openEditBank(bank) {
        setEditingBank(bank)
        setBankFormData({
            bank_name: bank.bank_name,
            bank_account: bank.bank_account,
            account_name: bank.account_name || '',
            is_default: bank.is_default
        })
        setShowBankForm(true)
    }

    function openAddBank() {
        setEditingBank(null)
        setBankFormData({ bank_name: '', bank_account: '', account_name: '', is_default: false })
        setShowBankForm(true)
    }

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
                            {isLinked && isPending && (
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
                            )}
                            {isLinked && !isPending && (
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
                            {isLinked && isBlocked && (
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
                            onClick={() => setActiveTab('bank')}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'bank' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: activeTab === 'bank' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <FiCreditCard /> บัญชีธนาคาร
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
                                {isLinked && (
                                    <div className="info-item">
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>สถานะ</label>
                                        <div style={{ fontSize: '1.1rem', color: isBlocked ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                            {isBlocked ? 'ถูกบล็อก' : 'ปกติ'}
                                        </div>
                                    </div>
                                )}
                                {dealer.notes && (
                                    <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>หมายเหตุ</label>
                                        <div style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{dealer.notes}</div>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {isLinked && (
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={(e) => { e.stopPropagation(); onToggleBlock(); }}
                                        style={{ color: isBlocked ? 'var(--color-success)' : 'var(--color-warning)', borderColor: isBlocked ? 'var(--color-success)' : 'var(--color-warning)' }}
                                    >
                                        {isBlocked ? <><FiCheck /> ปลดบล็อก</> : <><FiSlash /> บล็อก</>}
                                    </button>
                                )}
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

                    {activeTab === 'bank' && isLinked && (
                        <div className="dealer-bank-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <h4 style={{ margin: '0 0 1rem', color: 'var(--color-text)', fontSize: '1rem' }}>
                                <FiCreditCard style={{ marginRight: '0.5rem' }} />
                                บัญชีธนาคารเจ้ามือ (สำหรับโอนเงิน)
                            </h4>
                            {loadingLinkedBank ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                    <div className="spinner" style={{ margin: '0 auto 0.5rem' }}></div>
                                    กำลังโหลด...
                                </div>
                            ) : linkedDealerBank ? (
                                <BankAccountCard bank={linkedDealerBank} />
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '2rem',
                                    color: 'var(--color-text-muted)',
                                    background: 'var(--color-surface-light)',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    <FiCreditCard style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.5rem' }} />
                                    เจ้ามือยังไม่ได้ตั้งค่าบัญชีธนาคาร
                                </div>
                            )}

                            {/* Section: Select my bank account to show to upstream dealer */}
                            {myBankAccounts.length > 0 && (
                                <div style={{
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
                                        บัญชีของฉันที่ให้เจ้ามือเห็น
                                    </label>
                                    <select
                                        className="form-input"
                                        value={myMemberBankAccountId || ''}
                                        onChange={async (e) => {
                                            const newId = e.target.value || null
                                            setSavingMyBank(true)
                                            try {
                                                const { data: { user: currentUser } } = await supabase.auth.getUser()
                                                if (!currentUser) return

                                                // Save to dealer_upstream_connections.my_bank_account_id (primary)
                                                const { data: connData, error: connError } = await supabase
                                                    .from('dealer_upstream_connections')
                                                    .update({ my_bank_account_id: newId })
                                                    .eq('dealer_id', currentUser.id)
                                                    .eq('upstream_dealer_id', dealer.upstream_dealer_id)
                                                    .select()

                                                if (connError) throw connError

                                                // Also try membership table as fallback (for member_bank_account_id)
                                                if (!connData || connData.length === 0) {
                                                    const { error: memError } = await supabase
                                                        .from('user_dealer_memberships')
                                                        .update({ member_bank_account_id: newId })
                                                        .eq('user_id', currentUser.id)
                                                        .eq('dealer_id', dealer.upstream_dealer_id)
                                                        .eq('status', 'active')
                                                    if (memError) throw memError
                                                }

                                                setMyMemberBankAccountId(newId)
                                            } catch (err) {
                                                console.error('Error updating member bank:', err)
                                            } finally {
                                                setSavingMyBank(false)
                                            }
                                        }}
                                        disabled={savingMyBank}
                                        style={{
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '0.75rem 1rem',
                                            color: 'var(--color-text)',
                                            width: '100%',
                                            cursor: savingMyBank ? 'wait' : 'pointer'
                                        }}
                                    >
                                        <option value="">ใช้บัญชีหลัก (Default)</option>
                                        {myBankAccounts.map(bank => (
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
                                        {savingMyBank ? 'กำลังบันทึก...' : 'เจ้ามือจะเห็นบัญชีนี้ในหน้าข้อมูลสมาชิก'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'bank' && !isLinked && (
                        <div className="dealer-bank-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '1rem' }}>
                                    <FiCreditCard style={{ marginRight: '0.5rem' }} />
                                    บัญชีธนาคาร
                                </h4>
                                <button className="btn btn-primary btn-sm" onClick={openAddBank}>
                                    <FiPlus /> เพิ่มบัญชี
                                </button>
                            </div>

                            {loadingBanks ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                    <div className="spinner" style={{ margin: '0 auto 0.5rem' }}></div>
                                    กำลังโหลด...
                                </div>
                            ) : bankAccounts.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '2rem',
                                    color: 'var(--color-text-muted)',
                                    background: 'var(--color-surface-light)',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    <FiCreditCard style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block', margin: '0 auto 0.5rem' }} />
                                    ยังไม่มีบัญชีธนาคาร
                                    <br />
                                    <button className="btn btn-primary btn-sm" onClick={openAddBank} style={{ marginTop: '0.75rem' }}>
                                        <FiPlus /> เพิ่มบัญชีแรก
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {bankAccounts.map(bank => (
                                        <div key={bank.id} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '1rem',
                                            background: 'var(--color-surface-light)',
                                            borderRadius: 'var(--radius-md)',
                                            border: bank.is_default ? '2px solid var(--color-primary)' : '1px solid var(--color-border)'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{bank.bank_name}</span>
                                                    {bank.is_default && (
                                                        <span style={{
                                                            background: 'var(--color-primary)',
                                                            color: '#000',
                                                            padding: '0.1rem 0.4rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: '600'
                                                        }}>
                                                            <FiStar size={10} /> ค่าเริ่มต้น
                                                        </span>
                                                    )}
                                                </div>
                                                {bank.account_name && (
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.15rem' }}>
                                                        {bank.account_name}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '0.95rem', color: 'var(--color-text)', fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}>
                                                    {bank.bank_account}
                                                    <CopyButton text={bank.bank_account} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                {!bank.is_default && (
                                                    <button
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => handleSetDefaultBank(bank.id)}
                                                        title="ตั้งเป็นค่าเริ่มต้น"
                                                        style={{ padding: '0.3rem 0.5rem' }}
                                                    >
                                                        <FiStar />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => openEditBank(bank)}
                                                    title="แก้ไข"
                                                    style={{ padding: '0.3rem 0.5rem' }}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => handleDeleteBank(bank.id)}
                                                    title="ลบ"
                                                    style={{ padding: '0.3rem 0.5rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add/Edit Bank Form Modal */}
                            {showBankForm && (
                                <div style={{
                                    marginTop: '1rem',
                                    padding: '1.25rem',
                                    background: 'var(--color-surface)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '2px solid var(--color-primary)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h5 style={{ margin: 0, color: 'var(--color-text)' }}>
                                            {editingBank ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}
                                        </h5>
                                        <button
                                            onClick={() => { setShowBankForm(false); setEditingBank(null) }}
                                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                        >
                                            <FiX size={18} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ชื่อธนาคาร *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="เช่น กสิกร, กรุงไทย"
                                                value={bankFormData.bank_name}
                                                onChange={e => setBankFormData({ ...bankFormData, bank_name: e.target.value })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>เลขบัญชี *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="xxx-x-xxxxx-x"
                                                value={bankFormData.bank_account}
                                                onChange={e => setBankFormData({ ...bankFormData, bank_account: e.target.value })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ชื่อบัญชี</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="ชื่อเจ้าของบัญชี"
                                                value={bankFormData.account_name}
                                                onChange={e => setBankFormData({ ...bankFormData, account_name: e.target.value })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowBankForm(false); setEditingBank(null) }}>
                                            ยกเลิก
                                        </button>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={handleSaveBank}
                                            disabled={savingBank || !bankFormData.bank_name.trim() || !bankFormData.bank_account.trim()}
                                        >
                                            {savingBank ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Section: Select my bank account to show to this upstream dealer */}
                            {myBankAccounts.length > 0 && (
                                <div style={{
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
                                        บัญชีของฉันที่ให้เจ้ามือเห็น
                                    </label>
                                    <select
                                        className="form-input"
                                        value={myMemberBankAccountId || ''}
                                        onChange={async (e) => {
                                            const newId = e.target.value || null
                                            setSavingMyBank(true)
                                            try {
                                                const { error } = await supabase
                                                    .from('dealer_upstream_connections')
                                                    .update({ my_bank_account_id: newId })
                                                    .eq('id', dealer.id)
                                                if (error) throw error
                                                setMyMemberBankAccountId(newId)
                                            } catch (err) {
                                                console.error('Error updating my bank for upstream:', err)
                                            } finally {
                                                setSavingMyBank(false)
                                            }
                                        }}
                                        disabled={savingMyBank}
                                        style={{
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '0.75rem 1rem',
                                            color: 'var(--color-text)',
                                            width: '100%',
                                            cursor: savingMyBank ? 'wait' : 'pointer'
                                        }}
                                    >
                                        <option value="">ใช้บัญชีหลัก (Default)</option>
                                        {myBankAccounts.map(bank => (
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
                                        {savingMyBank ? 'กำลังบันทึก...' : 'เจ้ามือจะเห็นบัญชีนี้ในหน้าข้อมูลสมาชิก'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
