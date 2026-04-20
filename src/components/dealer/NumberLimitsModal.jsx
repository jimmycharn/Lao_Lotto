import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { FiAlertTriangle, FiX, FiPlus, FiTrash2, FiSearch, FiEdit2, FiCheck, FiSlash, FiClock, FiRefreshCw } from 'react-icons/fi'
import { BET_TYPES, BET_TYPES_BY_LOTTERY, getPermutations } from '../../constants/lotteryTypes'
import { confirmDialog } from '../../utils/confirmDialog'

// Generate all permutations (reversed numbers) for a given number string
function generateReversedNumbers(numbers) {
    if (!numbers || numbers.length <= 1) return []
    const perms = getPermutations(numbers)
    // Filter out the original number
    return perms.filter(p => p !== numbers)
}

export default function NumberLimitsModal({ round, onClose }) {
    const { toast } = useToast()
    const [limits, setLimits] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({})
    const numberInputRef = useRef(null)

    // Available bet types for this lottery type
    const availableBetTypes = useMemo(() => {
        const types = BET_TYPES_BY_LOTTERY[round.lottery_type] || {}
        // Filter out set types (4_set, 3_set) as they are managed differently
        return Object.entries(types).filter(([key]) => !key.includes('_set'))
    }, [round.lottery_type])

    // Group bet types by digit count for organized display
    const betTypeGroups = useMemo(() => {
        const groups = [
            { label: 'เลข 1 ตัว', digitCount: 1, keys: ['run_top', 'run_bottom', 'pak_top', 'pak_bottom'] },
            { label: 'เลข 2 ตัว', digitCount: 2, keys: ['2_top', '2_front', '2_center', '2_run', '2_bottom'] },
            { label: 'เลข 3 ตัว', digitCount: 3, keys: ['3_top', '3_tod', '3_bottom'] },
            { label: 'เลข 4 ตัว', digitCount: 4, keys: ['4_set', '4_float'] },
            { label: 'เลข 5 ตัว', digitCount: 5, keys: ['5_float'] }
        ]
        const availableKeys = availableBetTypes.map(([key]) => key)
        return groups
            .map(g => ({
                ...g,
                types: g.keys
                    .filter(k => availableKeys.includes(k))
                    .map(k => {
                        const config = availableBetTypes.find(([key]) => key === k)
                        return config ? { key: config[0], label: config[1].label } : null
                    })
                    .filter(Boolean)
            }))
            .filter(g => g.types.length > 0)
    }, [availableBetTypes])

    // New limit form state
    const [newLimit, setNewLimit] = useState({
        numbers: '',
        max_amount: 0,
        limit_type: 'limited', // 'limited' = เลขอั้น, 'blocked' = เลขปิด
        payout_percent: 50,
        include_reversed: true,
        selected_bet_types: [], // Default: none selected
        select_all: false
    })

    // Determine which bet type keys are enabled based on the number input length
    const enabledBetKeys = useMemo(() => {
        const len = (newLimit.numbers || '').length
        if (len === 0) return new Set()
        const matched = betTypeGroups.filter(g => g.digitCount === len)
        return new Set(matched.flatMap(g => g.types.map(t => t.key)))
    }, [newLimit.numbers, betTypeGroups])

    // Auto-clear selected bet types that no longer match when number changes
    useEffect(() => {
        if (enabledBetKeys.size === 0) {
            setNewLimit(prev => ({ ...prev, selected_bet_types: [], select_all: false }))
        } else {
            // Default: select all enabled bet types (ทั้งหมด)
            const allEnabled = [...enabledBetKeys]
            setNewLimit(prev => ({
                ...prev,
                selected_bet_types: allEnabled,
                select_all: true
            }))
        }
    }, [enabledBetKeys])

    useEffect(() => {
        fetchLimits()
    }, [round.id])

    async function fetchLimits() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('number_limits')
                .select('*')
                .eq('round_id', round.id)
                .order('created_at', { ascending: false })

            if (!error) setLimits(data || [])
        } catch (error) {
            console.error('Error fetching limits:', error)
        } finally {
            setLoading(false)
        }
    }

    // Toggle select all bet types (only visible/enabled ones)
    function handleToggleSelectAll(checked) {
        const enabledKeys = [...enabledBetKeys]
        setNewLimit(prev => ({
            ...prev,
            select_all: checked,
            selected_bet_types: checked ? enabledKeys : []
        }))
    }

    // Toggle individual bet type
    function handleToggleBetType(betType) {
        setNewLimit(prev => {
            const types = prev.selected_bet_types.includes(betType)
                ? prev.selected_bet_types.filter(t => t !== betType)
                : [...prev.selected_bet_types, betType]
            return {
                ...prev,
                selected_bet_types: types,
                select_all: types.length === availableBetTypes.length
            }
        })
    }

    async function handleAddLimit() {
        if (!newLimit.numbers) {
            toast.warning('กรุณากรอกเลข')
            return
        }
        if ((newLimit.max_amount === '' || newLimit.max_amount === null || newLimit.max_amount === undefined) && newLimit.limit_type !== 'blocked') {
            toast.warning('กรุณากรอกวงเงินสูงสุด')
            return
        }
        if (newLimit.selected_bet_types.length === 0) {
            toast.warning('กรุณาเลือกประเภทอย่างน้อย 1 ประเภท')
            return
        }

        setSaving(true)
        try {
            const reversedNumbers = newLimit.include_reversed
                ? generateReversedNumbers(newLimit.numbers)
                : []

            // Create one record per selected bet type
            const records = newLimit.selected_bet_types.map(betType => ({
                round_id: round.id,
                bet_type: betType,
                numbers: newLimit.numbers,
                max_amount: parseFloat(newLimit.max_amount) || 0,
                limit_type: newLimit.limit_type,
                payout_percent: parseFloat(newLimit.payout_percent) || 100,
                include_reversed: newLimit.include_reversed,
                reversed_numbers: reversedNumbers,
                time_condition: null,
                is_active: true
            }))

            const { error } = await supabase
                .from('number_limits')
                .upsert(records, { onConflict: 'round_id,bet_type,numbers' })

            if (error) throw error

            toast.success(`เพิ่มเลข${newLimit.limit_type === 'blocked' ? 'ปิด' : 'อั้น'} ${newLimit.numbers} สำเร็จ (${newLimit.selected_bet_types.length} ประเภท)`)
            setNewLimit(prev => ({ ...prev, numbers: '' }))
            fetchLimits()
            setTimeout(() => numberInputRef.current?.focus(), 100)
        } catch (error) {
            console.error('Error adding limit:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteLimit(id) {
        if (!(await confirmDialog({ title: 'ยืนยันการลบ', message: 'ต้องการลบรายการนี้?', confirmText: 'ลบเลย' }))) return

        try {
            const { error } = await supabase
                .from('number_limits')
                .delete()
                .eq('id', id)

            if (!error) {
                setLimits(prev => prev.filter(l => l.id !== id))
                toast.success('ลบเรียบร้อย')
            }
        } catch (error) {
            console.error('Error deleting limit:', error)
        }
    }

    async function handleDeleteByNumber(numbers) {
        const matching = limits.filter(l => l.numbers === numbers)
        if (matching.length === 0) return
        if (!(await confirmDialog({ title: 'ยืนยันการลบ', message: `ต้องการลบเลข ${numbers} ทั้งหมด (${matching.length} รายการ)?`, confirmText: 'ลบเลย' }))) return

        try {
            const { error } = await supabase
                .from('number_limits')
                .delete()
                .eq('round_id', round.id)
                .eq('numbers', numbers)

            if (!error) {
                fetchLimits()
                toast.success(`ลบเลข ${numbers} ทั้งหมดเรียบร้อย`)
            }
        } catch (error) {
            console.error('Error deleting limits:', error)
        }
    }

    async function handleToggleActive(limit) {
        try {
            const { error } = await supabase
                .from('number_limits')
                .update({ is_active: !limit.is_active })
                .eq('id', limit.id)

            if (!error) {
                setLimits(prev => prev.map(l => l.id === limit.id ? { ...l, is_active: !l.is_active } : l))
            }
        } catch (error) {
            console.error('Error toggling active:', error)
        }
    }

    function startEdit(limit) {
        setEditingId(limit.id)
        setEditForm({
            max_amount: limit.max_amount,
            payout_percent: limit.payout_percent || 100,
            limit_type: limit.limit_type || 'limited',
            has_time_condition: !!limit.time_condition,
            after_time: limit.time_condition?.after_time || '',
            time_payout_percent: limit.time_condition?.payout_percent || 50
        })
    }

    async function handleSaveEdit(id) {
        try {
            const timeCondition = editForm.has_time_condition && editForm.after_time
                ? {
                    after_time: editForm.after_time,
                    payout_percent: parseFloat(editForm.time_payout_percent) || 50
                }
                : null

            const { error } = await supabase
                .from('number_limits')
                .update({
                    max_amount: parseFloat(editForm.max_amount) || 0,
                    payout_percent: parseFloat(editForm.payout_percent) || 100,
                    limit_type: editForm.limit_type,
                    time_condition: timeCondition
                })
                .eq('id', id)

            if (error) throw error

            setEditingId(null)
            fetchLimits()
            toast.success('บันทึกการแก้ไขเรียบร้อย')
        } catch (error) {
            console.error('Error updating limit:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    // Filtered limits based on search
    const filteredLimits = useMemo(() => {
        if (!searchQuery) return limits
        const q = searchQuery.toLowerCase()
        return limits.filter(l =>
            l.numbers.includes(q) ||
            (BET_TYPES[l.bet_type] || '').toLowerCase().includes(q)
        )
    }, [limits, searchQuery])

    // Group limits by number for display
    const groupedLimits = useMemo(() => {
        const groups = {}
        filteredLimits.forEach(l => {
            if (!groups[l.numbers]) {
                groups[l.numbers] = {
                    numbers: l.numbers,
                    limit_type: l.limit_type,
                    items: [],
                    is_active: l.is_active
                }
            }
            groups[l.numbers].items.push(l)
        })
        return Object.values(groups).sort((a, b) => a.numbers.localeCompare(b.numbers))
    }, [filteredLimits])

    const sectionStyle = {
        background: 'var(--color-surface-light)',
        borderRadius: '10px',
        padding: '0.6rem',
        marginBottom: '0.75rem',
        border: '1px solid var(--color-border)'
    }

    const labelStyle = {
        fontSize: '0.8rem',
        fontWeight: '600',
        marginBottom: '0.3rem',
        display: 'block',
        color: 'var(--color-text)'
    }

    const inputStyle = {
        width: '100%',
        padding: '0.5rem 0.6rem',
        borderRadius: '6px',
        border: '1px solid var(--color-border)',
        background: 'var(--color-card)',
        color: 'var(--color-text)',
        fontSize: '0.85rem'
    }

    const chipStyle = (active) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.25rem 0.6rem',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: '500',
        cursor: 'pointer',
        border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
        background: active ? 'rgba(102, 126, 234, 0.2)' : 'var(--color-surface-light)',
        color: active ? 'var(--color-primary)' : 'var(--color-text)',
        opacity: active ? 1 : 0.7,
        transition: 'all 0.15s'
    })

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div className="modal-header" style={{ flexShrink: 0 }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FiAlertTriangle /> ตั้งค่าเลขอั้น/ปิด — {round.lottery_name}
                    </h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>

                    {/* === Add New Limit Section === */}
                    <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
                            <FiPlus style={{ marginRight: '0.3rem' }} /> เพิ่มเลขอั้น/ปิด
                        </h4>

                        {/* Row 1: Number + Limit Type (same row) */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                            <div style={{ flex: '1 1 100px', minWidth: '80px' }}>
                                <label style={labelStyle}>เลข</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    style={inputStyle}
                                    ref={numberInputRef}
                                    placeholder="เช่น 123"
                                    value={newLimit.numbers}
                                    onChange={e => setNewLimit({ ...newLimit, numbers: e.target.value.replace(/\D/g, '') })}
                                />
                            </div>
                            <div style={{ flex: '1 1 140px', minWidth: '120px' }}>
                                <label style={labelStyle}>ประเภทจำกัด</label>
                                <select
                                    style={inputStyle}
                                    value={newLimit.limit_type}
                                    onChange={e => setNewLimit({ ...newLimit, limit_type: e.target.value })}
                                >
                                    <option value="limited">🔶 อั้น (รับเกินได้)</option>
                                    <option value="blocked">🔴 ปิด (ปิดรับ)</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Max Amount + Payout % (same row) */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                            <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                                <label style={labelStyle}>วงเงินรับสูงสุด ({round.currency_symbol})</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    style={inputStyle}
                                    placeholder="0"
                                    value={newLimit.max_amount}
                                    onChange={e => setNewLimit({ ...newLimit, max_amount: e.target.value })}
                                />
                            </div>
                            {newLimit.limit_type === 'limited' && (
                                <div style={{ flex: '0 0 110px', minWidth: '90px' }}>
                                    <label style={labelStyle}>อัตราจ่าย %</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        style={inputStyle}
                                        placeholder="100"
                                        min="0"
                                        max="100"
                                        value={newLimit.payout_percent}
                                        onChange={e => setNewLimit({ ...newLimit, payout_percent: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Row 3: Include Reversed Checkbox */}
                        <div style={{ marginBottom: '0.6rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={newLimit.include_reversed}
                                    onChange={e => setNewLimit({ ...newLimit, include_reversed: e.target.checked })}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <FiRefreshCw size={14} /> รวมเลขกลับทุกชุด
                            </label>
                        </div>

                        {/* Show reversed preview */}
                        {newLimit.include_reversed && newLimit.numbers && newLimit.numbers.length >= 2 && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg-card-hover)', borderRadius: '6px' }}>
                                เลขกลับ: {generateReversedNumbers(newLimit.numbers).join(', ') || 'ไม่มี'}
                            </div>
                        )}

                        {/* Bet Type Selection - Grouped by digit count (only visible when number entered) */}
                        <div style={{ marginBottom: '0.6rem' }}>
                            <label style={{ ...labelStyle, marginBottom: '0.4rem' }}>ประเภทการแทง</label>
                            {enabledBetKeys.size > 0 && (
                                <>
                                    {/* Select All Chip */}
                                    <div style={{ marginBottom: '0.4rem' }}>
                                        <span
                                            onClick={() => handleToggleSelectAll(!newLimit.select_all)}
                                            style={{
                                                ...chipStyle(newLimit.select_all),
                                                fontWeight: '600',
                                                borderColor: newLimit.select_all ? 'var(--color-success)' : undefined,
                                                background: newLimit.select_all ? 'rgba(76, 175, 80, 0.2)' : undefined,
                                                color: newLimit.select_all ? 'var(--color-success)' : undefined
                                            }}
                                        >
                                            <FiCheck size={12} /> ทั้งหมด
                                        </span>
                                    </div>
                                    {/* Only show matching groups */}
                                    {betTypeGroups.filter(g => g.types.some(t => enabledBetKeys.has(t.key))).map((group) => (
                                        <div key={group.label} style={{ marginBottom: '0.35rem' }}>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '0.2rem', fontWeight: '600' }}>{group.label}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                {group.types.filter(t => enabledBetKeys.has(t.key)).map((t) => (
                                                    <span
                                                        key={t.key}
                                                        style={chipStyle(newLimit.selected_bet_types.includes(t.key))}
                                                        onClick={() => handleToggleBetType(t.key)}
                                                    >
                                                        {t.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                            {enabledBetKeys.size === 0 && (
                                <div style={{ fontSize: '0.8rem', opacity: 0.4, padding: '0.5rem 0' }}>
                                    กรุณาป้อนเลขก่อนเพื่อเลือกประเภท
                                </div>
                            )}
                        </div>

                        {/* Add Button */}
                        <button
                            className="btn btn-primary full-width"
                            onClick={e => { e.target.blur(); handleAddLimit() }}
                            disabled={saving || !newLimit.numbers || newLimit.selected_bet_types.length === 0 || (newLimit.limit_type !== 'blocked' && newLimit.max_amount !== 0 && (newLimit.max_amount === '' || newLimit.max_amount === null || newLimit.max_amount === undefined))}
                            style={{ marginTop: '0.3rem' }}
                        >
                            {saving ? 'กำลังบันทึก...' : (
                                <>
                                    <FiPlus /> เพิ่มเลข{newLimit.limit_type === 'blocked' ? 'ปิด' : 'อั้น'} {newLimit.numbers || ''}
                                    {newLimit.selected_bet_types.length > 0 && ` (${newLimit.selected_bet_types.length} ประเภท)`}
                                </>
                            )}
                        </button>
                    </div>

                    {/* === Current Limits List === */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                รายการเลขอั้น/ปิด ({limits.length})
                            </h4>
                            <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: '250px' }}>
                                <FiSearch style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={14} />
                                <input
                                    type="text"
                                    style={{ ...inputStyle, paddingLeft: '1.8rem' }}
                                    placeholder="ค้นหาเลข..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div className="spinner"></div>
                            </div>
                        ) : groupedLimits.length === 0 ? (
                            <p style={{ textAlign: 'center', opacity: 0.5, padding: '1.5rem' }}>
                                {searchQuery ? 'ไม่พบเลขที่ค้นหา' : 'ยังไม่มีการตั้งค่าเลขอั้น/ปิด'}
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {groupedLimits.map(group => (
                                    <div key={group.numbers} style={{
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '8px',
                                        overflow: 'hidden'
                                    }}>
                                        {/* Group Header */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.4rem 0.5rem',
                                            background: 'var(--bg-card-hover)',
                                            borderBottom: '1px solid var(--color-border)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '1.1rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                                    {group.numbers}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                                    {group.items.length} ประเภท
                                                </span>
                                                {group.items[0]?.include_reversed && (
                                                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                                                        <FiRefreshCw size={10} /> กลับ
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                className="icon-btn danger"
                                                onClick={() => handleDeleteByNumber(group.numbers)}
                                                title="ลบทั้งหมด"
                                                style={{ padding: '0.2rem 0.3rem' }}
                                            >
                                                <FiTrash2 size={14} />
                                            </button>
                                        </div>

                                        {/* Items */}
                                        {group.items.map(limit => (
                                            <div key={limit.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.3rem 0.5rem',
                                                borderBottom: '1px solid var(--color-border)',
                                                opacity: limit.is_active ? 1 : 0.4,
                                                fontSize: '0.82rem'
                                            }}>
                                                {editingId === limit.id ? (
                                                    /* Edit Mode */
                                                    <div style={{ display: 'flex', gap: '0.3rem', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: '500', minWidth: '70px' }}>{BET_TYPES[limit.bet_type]}</span>
                                                        <select
                                                            style={{ ...inputStyle, width: '90px', padding: '0.3rem' }}
                                                            value={editForm.limit_type}
                                                            onChange={e => setEditForm({ ...editForm, limit_type: e.target.value })}
                                                        >
                                                            <option value="limited">อั้น</option>
                                                            <option value="blocked">ปิด</option>
                                                        </select>
                                                        <input
                                                            type="number"
                                                            style={{ ...inputStyle, width: '70px', padding: '0.3rem' }}
                                                            value={editForm.max_amount}
                                                            onChange={e => setEditForm({ ...editForm, max_amount: e.target.value })}
                                                            placeholder="วงเงิน"
                                                        />
                                                        {editForm.limit_type === 'limited' && (
                                                            <input
                                                                type="number"
                                                                style={{ ...inputStyle, width: '55px', padding: '0.3rem' }}
                                                                value={editForm.payout_percent}
                                                                onChange={e => setEditForm({ ...editForm, payout_percent: e.target.value })}
                                                                placeholder="%"
                                                            />
                                                        )}
                                                        <button
                                                            className="icon-btn"
                                                            onClick={() => handleSaveEdit(limit.id)}
                                                            style={{ color: 'var(--color-success)', padding: '0.2rem' }}
                                                        >
                                                            <FiCheck size={14} />
                                                        </button>
                                                        <button
                                                            className="icon-btn"
                                                            onClick={() => setEditingId(null)}
                                                            style={{ opacity: 0.5, padding: '0.2rem' }}
                                                        >
                                                            <FiX size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    /* View Mode */
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                                            <span style={{
                                                                fontSize: '0.65rem',
                                                                padding: '0.05rem 0.3rem',
                                                                borderRadius: '3px',
                                                                fontWeight: '600',
                                                                background: limit.limit_type === 'blocked' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                                                                color: limit.limit_type === 'blocked' ? '#f44336' : '#ff9800',
                                                                lineHeight: '1.3'
                                                            }}>
                                                                {limit.limit_type === 'blocked' ? 'ปิด' : 'อั้น'}
                                                            </span>
                                                            <span style={{ fontWeight: '500', minWidth: '55px', fontSize: '0.8rem' }}>{BET_TYPES[limit.bet_type]}</span>
                                                            <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                                                                {round.currency_symbol}{limit.max_amount?.toLocaleString()}
                                                            </span>
                                                            {limit.limit_type === 'limited' && limit.payout_percent !== 100 && (
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--color-warning)', fontWeight: '500' }}>
                                                                    จ่าย {limit.payout_percent}%
                                                                </span>
                                                            )}
                                                            {limit.time_condition?.after_time && (
                                                                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                                                                    <FiClock size={10} /> {limit.time_condition.after_time}→{limit.time_condition.payout_percent}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }}>
                                                            <button
                                                                className="icon-btn"
                                                                onClick={() => handleToggleActive(limit)}
                                                                title={limit.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                                                                style={{ padding: '0.2rem', opacity: 0.6 }}
                                                            >
                                                                {limit.is_active ? <FiCheck size={13} style={{ color: 'var(--color-success)' }} /> : <FiSlash size={13} />}
                                                            </button>
                                                            <button
                                                                className="icon-btn"
                                                                onClick={() => startEdit(limit)}
                                                                title="แก้ไข"
                                                                style={{ padding: '0.2rem', opacity: 0.6 }}
                                                            >
                                                                <FiEdit2 size={13} />
                                                            </button>
                                                            <button
                                                                className="icon-btn danger"
                                                                onClick={() => handleDeleteLimit(limit.id)}
                                                                title="ลบ"
                                                                style={{ padding: '0.2rem' }}
                                                            >
                                                                <FiTrash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ flexShrink: 0 }}>
                    <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
                </div>
            </div>
        </div>
    )
}
