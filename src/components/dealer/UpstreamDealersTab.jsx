import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import {
    FiSend,
    FiPlus,
    FiClock,
    FiCheck,
    FiUser,
    FiEdit2,
    FiX
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'
import UpstreamDealerAccordionItem from './UpstreamDealerAccordionItem'
import UpstreamDealerSettings from './UpstreamDealerSettings'

// Upstream Dealers Tab - For managing dealers to transfer bets to
export default function UpstreamDealersTab({ user, upstreamDealers, setUpstreamDealers, loadingUpstream, setLoadingUpstream }) {
    const { toast } = useToast()
    const [showAddModal, setShowAddModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingDealer, setEditingDealer] = useState(null)
    const [formData, setFormData] = useState({
        upstream_name: '',
        upstream_contact: '',
        notes: ''
    })
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [settingsDealer, setSettingsDealer] = useState(null)
    const [expandedDealerId, setExpandedDealerId] = useState(null)

    // Fetch upstream dealers on mount - only if not already loaded
    useEffect(() => {
        if (upstreamDealers.length === 0 && !loadingUpstream) {
            fetchUpstreamDealers()
        }
    }, [user?.id])

    async function fetchUpstreamDealers() {
        if (!user?.id) {
            setLoadingUpstream(false)
            return
        }
        setLoadingUpstream(true)

        // Set a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            console.warn('Fetch upstream dealers timeout')
            setLoadingUpstream(false)
        }, 10000)

        try {
            // Fetch manual upstream connections
            const { data: manualData, error: manualError } = await supabase
                .from('dealer_upstream_connections')
                .select(`
                    *,
                    upstream_profile:upstream_dealer_id (
                        id, full_name, email, phone
                    )
                `)
                .eq('dealer_id', user.id)
                .order('created_at', { ascending: false })

            // Fetch dealers that user was a member of (excluding self)
            const { data: membershipData, error: membershipError } = await supabase
                .from('user_dealer_memberships')
                .select(`
                    dealer_id,
                    status,
                    created_at,
                    profiles:dealer_id (
                        id, full_name, email, phone, role
                    )
                `)
                .eq('user_id', user.id)
                .eq('status', 'active')
                .neq('dealer_id', user.id) // Exclude self-membership

            clearTimeout(timeoutId)

            let allDealers = []

            // Add manual upstream connections
            if (!manualError && manualData) {
                allDealers = [...manualData]
            }

            // Add dealers from memberships (convert to upstream format)
            // Only include profiles with role = 'dealer' (not superadmin or other roles)
            if (!membershipError && membershipData) {
                const membershipDealers = membershipData
                    .filter(m => m.profiles?.id && m.profiles?.role === 'dealer') // Only include dealers
                    .map(m => ({
                        id: `membership-${m.dealer_id}`,
                        dealer_id: user.id,
                        upstream_dealer_id: m.dealer_id,
                        upstream_name: m.profiles?.full_name || m.profiles?.email || 'ไม่ระบุชื่อ',
                        upstream_contact: m.profiles?.phone || m.profiles?.email || '',
                        upstream_profile: m.profiles,
                        is_linked: true,
                        is_from_membership: true, // Mark as from membership
                        created_at: m.created_at
                    }))

                // Merge, avoiding duplicates (by upstream_dealer_id)
                const existingIds = allDealers.map(d => d.upstream_dealer_id).filter(Boolean)
                const newDealers = membershipDealers.filter(d => !existingIds.includes(d.upstream_dealer_id))
                allDealers = [...allDealers, ...newDealers]
            }

            setUpstreamDealers(allDealers)
        } catch (error) {
            clearTimeout(timeoutId)
            console.error('Error fetching upstream dealers:', error)
            setUpstreamDealers([])
        } finally {
            setLoadingUpstream(false)
        }
    }

    // Open modal for adding new manual dealer
    function handleOpenAddModal() {
        setEditingDealer(null)
        setFormData({ upstream_name: '', upstream_contact: '', notes: '' })
        setShowAddModal(true)
    }

    // Open modal for editing
    function handleEditDealer(dealer) {
        setEditingDealer(dealer)
        setFormData({
            upstream_name: dealer.upstream_name || '',
            upstream_contact: dealer.upstream_contact || '',
            notes: dealer.notes || ''
        })
        setShowAddModal(true)
    }

    // Save (add or update)
    async function handleSave() {
        if (!formData.upstream_name.trim()) {
            toast.warning('กรุณากรอกชื่อเจ้ามือ')
            return
        }

        setSaving(true)
        try {
            if (editingDealer) {
                // Update
                const { error } = await supabase
                    .from('dealer_upstream_connections')
                    .update({
                        upstream_name: formData.upstream_name,
                        upstream_contact: formData.upstream_contact,
                        notes: formData.notes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingDealer.id)

                if (error) throw error
                toast.success('แก้ไขข้อมูลสำเร็จ!')
            } else {
                // Insert new manual dealer
                const { error } = await supabase
                    .from('dealer_upstream_connections')
                    .insert({
                        dealer_id: user.id,
                        upstream_name: formData.upstream_name,
                        upstream_contact: formData.upstream_contact,
                        notes: formData.notes,
                        is_linked: false
                    })

                if (error) throw error
                toast.success('เพิ่มเจ้ามือสำเร็จ!')
            }

            setShowAddModal(false)
            fetchUpstreamDealers()
        } catch (error) {
            console.error('Error saving upstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    // Delete / Disconnect
    async function handleDelete(dealer) {
        if (!confirm(`ต้องการยกเลิกการเชื่อมต่อกับ "${dealer.upstream_name}"?\n\nรายชื่อจะหายไปทั้ง 2 ฝ่าย`)) return

        try {
            let error

            if (dealer.is_from_membership) {
                // Delete from user_dealer_memberships table
                const result = await supabase
                    .from('user_dealer_memberships')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('dealer_id', dealer.upstream_dealer_id)

                error = result.error
            } else {
                // Delete from dealer_upstream_connections table
                const result = await supabase
                    .from('dealer_upstream_connections')
                    .delete()
                    .eq('id', dealer.id)

                error = result.error
            }

            if (error) throw error

            toast.success('ยกเลิกการเชื่อมต่อสำเร็จ!')
            fetchUpstreamDealers()
        } catch (error) {
            console.error('Error deleting upstream dealer:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Toggle block/unblock
    async function handleToggleBlock(dealer) {
        const newBlockedState = !dealer.is_blocked
        try {
            const { error } = await supabase
                .from('dealer_upstream_connections')
                .update({
                    is_blocked: newBlockedState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dealer.id)

            if (error) throw error

            // Update state immediately for instant UI feedback
            setUpstreamDealers(prev => prev.map(d =>
                d.id === dealer.id ? { ...d, is_blocked: newBlockedState } : d
            ))

            toast.success(newBlockedState ? 'บล็อกเจ้ามือแล้ว' : 'ยกเลิกการบล็อกแล้ว')
        } catch (error) {
            console.error('Error toggling block:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Open settings modal
    function handleOpenSettings(dealer) {
        setSettingsDealer(dealer)
        setShowSettingsModal(true)
    }

    return (
        <div className="upstream-dealers-section">
            {/* Header */}
            <div className="section-header">
                <h2><FiSend /> เจ้ามือตีออก</h2>
                <button className="btn btn-primary" onClick={handleOpenAddModal}>
                    <FiPlus /> เพิ่มเจ้ามือ
                </button>
            </div>

            <p className="section-description" style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
                จัดการรายชื่อเจ้ามือที่คุณสามารถตีเลขออกไปได้ สามารถเพิ่มเจ้ามือด้วยตนเอง หรือเชื่อมต่อกับเจ้ามือในระบบ
            </p>

            {loadingUpstream ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>กำลังโหลด...</p>
                </div>
            ) : upstreamDealers.length === 0 ? (
                <div className="empty-state card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <FiSend style={{ fontSize: '3rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }} />
                    <h3>ยังไม่มีเจ้ามือตีออก</h3>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
                        เพิ่มเจ้ามือที่คุณต้องการตีเลขออกไป
                    </p>
                    <button className="btn btn-primary" onClick={handleOpenAddModal}>
                        <FiPlus /> เพิ่มเจ้ามือคนแรก
                    </button>
                </div>
            ) : (
                <>
                    {/* Pending Dealers Section - รออนุมัติ */}
                    {upstreamDealers.filter(d => d.is_linked && d.status === 'pending').length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FiClock style={{ color: 'var(--color-warning)' }} /> รออนุมัติ ({upstreamDealers.filter(d => d.is_linked && d.status === 'pending').length})
                            </h4>
                            <div className="upstream-dealers-accordion-list">
                                {upstreamDealers.filter(d => d.is_linked && d.status === 'pending').map(dealer => (
                                    <UpstreamDealerAccordionItem
                                        key={dealer.id}
                                        dealer={dealer}
                                        isExpanded={expandedDealerId === dealer.id}
                                        onToggle={() => setExpandedDealerId(expandedDealerId === dealer.id ? null : dealer.id)}
                                        onEdit={() => handleEditDealer(dealer)}
                                        onDelete={() => handleDelete(dealer)}
                                        onToggleBlock={() => handleToggleBlock(dealer)}
                                        onSaveSettings={fetchUpstreamDealers}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Linked Dealers Section - เจ้ามือในระบบ (approved only) */}
                    {upstreamDealers.filter(d => d.is_linked && d.status !== 'pending').length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FiCheck style={{ color: 'var(--color-success)' }} /> เจ้ามือในระบบ ({upstreamDealers.filter(d => d.is_linked && d.status !== 'pending').length})
                            </h4>
                            <div className="upstream-dealers-accordion-list">
                                {upstreamDealers.filter(d => d.is_linked && d.status !== 'pending').map(dealer => (
                                    <UpstreamDealerAccordionItem
                                        key={dealer.id}
                                        dealer={dealer}
                                        isExpanded={expandedDealerId === dealer.id}
                                        onToggle={() => setExpandedDealerId(expandedDealerId === dealer.id ? null : dealer.id)}
                                        onEdit={() => handleEditDealer(dealer)}
                                        onDelete={() => handleDelete(dealer)}
                                        onToggleBlock={() => handleToggleBlock(dealer)}
                                        onSaveSettings={fetchUpstreamDealers}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Manual Dealers Section */}
                    {upstreamDealers.filter(d => !d.is_linked).length > 0 && (
                        <div>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FiUser style={{ color: 'var(--color-text-muted)' }} /> เจ้ามือนอกระบบ ({upstreamDealers.filter(d => !d.is_linked).length})
                            </h4>
                            <div className="upstream-dealers-accordion-list">
                                {upstreamDealers.filter(d => !d.is_linked).map(dealer => (
                                    <UpstreamDealerAccordionItem
                                        key={dealer.id}
                                        dealer={dealer}
                                        isExpanded={expandedDealerId === dealer.id}
                                        onToggle={() => setExpandedDealerId(expandedDealerId === dealer.id ? null : dealer.id)}
                                        onEdit={() => handleEditDealer(dealer)}
                                        onDelete={() => handleDelete(dealer)}
                                        onToggleBlock={() => handleToggleBlock(dealer)}
                                        onSaveSettings={fetchUpstreamDealers}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingDealer ? <><FiEdit2 /> แก้ไขเจ้ามือ</> : <><FiPlus /> เพิ่มเจ้ามือใหม่</>}</h3>
                            <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">ชื่อเจ้ามือ *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น พี่หนึ่ง, เจ้ใหญ่"
                                    value={formData.upstream_name}
                                    onChange={e => setFormData({ ...formData, upstream_name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">เบอร์ติดต่อ / Line ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="เช่น 08x-xxx-xxxx หรือ line_id"
                                    value={formData.upstream_contact}
                                    onChange={e => setFormData({ ...formData, upstream_contact: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">หมายเหตุ</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    placeholder="เช่น รับได้แค่ 2 ตัว, หลัง 5 โมง"
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                ></textarea>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                                ยกเลิก
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'กำลังบันทึก...' : <><FiCheck /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upstream Dealer Settings Modal */}
            {showSettingsModal && settingsDealer && (
                <UpstreamDealerSettings
                    dealer={settingsDealer}
                    onClose={() => { setShowSettingsModal(false); setSettingsDealer(null); }}
                    onSaved={fetchUpstreamDealers}
                />
            )}
        </div>
    )
}
