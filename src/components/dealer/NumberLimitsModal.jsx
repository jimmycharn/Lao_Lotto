import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { FiAlertTriangle, FiX, FiPlus, FiTrash2, FiSearch, FiEdit2, FiCheck, FiSlash, FiClock, FiRefreshCw } from 'react-icons/fi'
import { BET_TYPES, BET_TYPES_BY_LOTTERY, getPermutations } from '../../constants/lotteryTypes'
import { confirmDialog } from '../../utils/confirmDialog'

// Generate all permutations (reversed numbers) for a given number string
export function generateReversedNumbers(numbers) {
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
    const [digitFilter, setDigitFilter] = useState('all')
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({})
    const numberInputRef = useRef(null)

    // Batch adjust limits by bet type
    const [showBatchAdjust, setShowBatchAdjust] = useState(false)
    const [batchSelectedTypes, setBatchSelectedTypes] = useState([])
    const [batchAmount, setBatchAmount] = useState('')
    const [batchLimitType, setBatchLimitType] = useState('limited')
    const [batchPayoutPercent, setBatchPayoutPercent] = useState('50')
    const [batchSaving, setBatchSaving] = useState(false)

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
        limit_type: 'limited', // 'limited' = เลขอั้น, 'blocked' = เลขปิด, 'rate_limit' = จำกัดอัตราจ่าย
        use_default_limit: true, // For rate_limit: checkbox "อั้นปกติ"
        payout_percent: 50,
        include_reversed: true,
        selected_bet_types: [], // Default: none selected
        select_all: false
    })

    // Store user-selected bet types remembered per digit length:
    // e.g. { 2: ['2_top', '2_front', '2_center', '2_bottom'] }
    const [rememberedTypesByLength, setRememberedTypesByLength] = useState({})

    // Determine which bet type keys are enabled based on the number input length
    const numberLength = (newLimit.numbers || '').length
    const enabledBetKeys = useMemo(() => {
        if (numberLength === 0) return new Set()
        const matched = betTypeGroups.filter(g => g.digitCount === numberLength)
        return new Set(matched.flatMap(g => g.types.map(t => t.key)))
    }, [numberLength, betTypeGroups])

    // Update selected bet types when number length / enabledBetKeys change
    useEffect(() => {
        if (enabledBetKeys.size === 0) {
            setNewLimit(prev => ({ ...prev, selected_bet_types: [], select_all: false }))
            return
        }

        const allEnabled = [...enabledBetKeys]
        const remembered = rememberedTypesByLength[numberLength]

        if (Array.isArray(remembered) && remembered.length > 0) {
            // Filter remembered types to only valid keys for this digit length
            const validSelected = remembered.filter(k => enabledBetKeys.has(k))
            if (validSelected.length > 0) {
                setNewLimit(prev => ({
                    ...prev,
                    selected_bet_types: validSelected,
                    select_all: validSelected.length === enabledBetKeys.size
                }))
                return
            }
        }

        // Default: select all enabled bet types (ทั้งหมด)
        setNewLimit(prev => ({
            ...prev,
            selected_bet_types: allEnabled,
            select_all: true
        }))
    }, [enabledBetKeys, numberLength])

    useEffect(() => {
        fetchLimits()
    }, [round.id])

    // Focus number input on modal open
    useEffect(() => {
        const timer = setTimeout(() => {
            if (numberInputRef.current) {
                numberInputRef.current.focus()
            }
        }, 150)
        return () => clearTimeout(timer)
    }, [])

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
        const nextTypes = checked ? enabledKeys : []
        if (numberLength > 0) {
            setRememberedTypesByLength(prev => ({
                ...prev,
                [numberLength]: nextTypes
            }))
        }
        setNewLimit(prev => ({
            ...prev,
            select_all: checked,
            selected_bet_types: nextTypes
        }))
    }

    // Toggle individual bet type
    function handleToggleBetType(betType) {
        setNewLimit(prev => {
            const types = prev.selected_bet_types.includes(betType)
                ? prev.selected_bet_types.filter(t => t !== betType)
                : [...prev.selected_bet_types, betType]
            const isAllSelected = types.length === enabledBetKeys.size

            if (numberLength > 0) {
                setRememberedTypesByLength(rPrev => ({
                    ...rPrev,
                    [numberLength]: types
                }))
            }

            return {
                ...prev,
                selected_bet_types: types,
                select_all: isAllSelected
            }
        })
    }

    async function handleAddLimit() {
        if (saving) return
        if (!newLimit.numbers) {
            toast.warning('กรุณากรอกเลข')
            return
        }
        const isRateLimit = newLimit.limit_type === 'rate_limit'
        const isDefaultLimit = isRateLimit && newLimit.use_default_limit
        if (!isDefaultLimit && newLimit.limit_type !== 'blocked' && (newLimit.max_amount === '' || newLimit.max_amount === null || newLimit.max_amount === undefined)) {
            toast.warning('กรุณากรอกวงเงินสูงสุด')
            return
        }
        if (newLimit.selected_bet_types.length === 0) {
            toast.warning('กรุณาเลือกประเภทอย่างน้อย 1 ประเภท')
            return
        }

        const targetNumber = newLimit.numbers
        setSaving(true)
        try {
            const reversedNumbers = newLimit.include_reversed
                ? generateReversedNumbers(newLimit.numbers)
                : []

            const timeCondition = {
                use_default_limit: isDefaultLimit,
                is_rate_limit: isRateLimit
            }

            // Create one record per selected bet type
            const records = newLimit.selected_bet_types.map(betType => ({
                round_id: round.id,
                bet_type: betType,
                numbers: newLimit.numbers,
                max_amount: isDefaultLimit ? 0 : (parseFloat(newLimit.max_amount) || 0),
                limit_type: isRateLimit ? 'rate_limit' : newLimit.limit_type,
                use_default_limit: isDefaultLimit,
                payout_percent: newLimit.limit_type === 'blocked' ? 100 : (parseFloat(newLimit.payout_percent) || 50),
                include_reversed: newLimit.include_reversed,
                reversed_numbers: reversedNumbers,
                time_condition: timeCondition,
                is_active: true
            }))

            let { error } = await supabase
                .from('number_limits')
                .upsert(records, { onConflict: 'round_id,bet_type,numbers' })

            // Fallback if DB check constraint rejects 'rate_limit' or use_default_limit column not present yet
            if (error && (error.message?.includes('limit_type') || error.message?.includes('use_default_limit') || error.message?.includes('constraint'))) {
                console.warn('[NumberLimits] Fallback insert without limit_type check constraint error:', error)
                const fallbackRecords = records.map(r => {
                    const { use_default_limit, ...rest } = r
                    return {
                        ...rest,
                        limit_type: isRateLimit ? 'limited' : r.limit_type
                    }
                })
                const retryRes = await supabase
                    .from('number_limits')
                    .upsert(fallbackRecords, { onConflict: 'round_id,bet_type,numbers' })
                if (retryRes.error) throw retryRes.error
            } else if (error) {
                throw error
            }

            const limitTypeName = isRateLimit ? 'จำกัดอัตราจ่าย' : (newLimit.limit_type === 'blocked' ? 'ปิด' : 'อั้น')
            toast.success(`เพิ่มเลข${limitTypeName} ${newLimit.numbers} สำเร็จ (${newLimit.selected_bet_types.length} ประเภท)`)
            fetchLimits()
            // Keep number and select all for rapid continuous entry
            setTimeout(() => {
                if (numberInputRef.current) {
                    numberInputRef.current.focus()
                    if (numberInputRef.current.value === targetNumber) {
                        numberInputRef.current.select()
                        numberInputRef.current.setSelectionRange?.(0, 9999)
                    }
                }
            }, 50)
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
        const isRate = limit.limit_type === 'rate_limit' || limit.time_condition?.is_rate_limit === true
        const isDef = limit.use_default_limit === true || limit.time_condition?.use_default_limit === true
        setEditForm({
            max_amount: limit.max_amount,
            payout_percent: limit.payout_percent || 100,
            limit_type: isRate ? 'rate_limit' : (limit.limit_type || 'limited'),
            use_default_limit: isDef,
            has_time_condition: !!limit.time_condition?.after_time,
            after_time: limit.time_condition?.after_time || '',
            time_payout_percent: limit.time_condition?.payout_percent || 50
        })
    }

    async function handleSaveEdit(id) {
        try {
            const isRate = editForm.limit_type === 'rate_limit'
            const isDef = isRate && editForm.use_default_limit

            const timeCondition = {
                use_default_limit: isDef,
                is_rate_limit: isRate,
                ...(editForm.has_time_condition && editForm.after_time ? {
                    after_time: editForm.after_time,
                    payout_percent: parseFloat(editForm.time_payout_percent) || 50
                } : {})
            }

            const payload = {
                max_amount: isDef ? 0 : (parseFloat(editForm.max_amount) || 0),
                payout_percent: editForm.limit_type === 'blocked' ? 100 : (parseFloat(editForm.payout_percent) || 50),
                limit_type: isRate ? 'rate_limit' : editForm.limit_type,
                use_default_limit: isDef,
                time_condition: timeCondition
            }

            let { error } = await supabase
                .from('number_limits')
                .update(payload)
                .eq('id', id)

            if (error && (error.message?.includes('limit_type') || error.message?.includes('use_default_limit') || error.message?.includes('constraint'))) {
                const { use_default_limit, ...rest } = payload
                const retryRes = await supabase
                    .from('number_limits')
                    .update({
                        ...rest,
                        limit_type: isRate ? 'limited' : editForm.limit_type
                    })
                    .eq('id', id)
                if (retryRes.error) throw retryRes.error
            } else if (error) {
                throw error
            }

            setEditingId(null)
            fetchLimits()
            toast.success('บันทึกการแก้ไขเรียบร้อย')
        } catch (error) {
            console.error('Error updating limit:', error)
            toast.error('เกิดข้อผิดพลาด: ' + error.message)
        }
    }

    async function handleDeleteBulkFilteredLimits() {
        if (filteredLimits.length === 0) return

        let filterLabel = ''
        if (digitFilter !== 'all') {
            filterLabel = `เลข ${digitFilter} ตัว`
        }
        if (searchQuery) {
            filterLabel += (filterLabel ? ' ' : '') + `ที่ค้นหา "${searchQuery}"`
        }
        if (!filterLabel) {
            filterLabel = 'ทั้งหมด'
        }

        const uniqueNumbersCount = new Set(filteredLimits.map(l => l.numbers)).size
        const totalItems = filteredLimits.length

        const confirmMsg = `คุณต้องการลบเลขอั้น/ปิด (${filterLabel}) จำนวน ${uniqueNumbersCount} เลข (รวม ${totalItems} รายการ) ใช่หรือไม่?`

        if (!(await confirmDialog({
            title: 'ยืนยันการลบเลขอั้นแบบกลุ่ม',
            message: confirmMsg,
            confirmText: 'ลบทั้งหมด',
            confirmButtonClass: 'danger'
        }))) return

        try {
            const idsToDelete = filteredLimits.map(l => l.id)
            const { error } = await supabase
                .from('number_limits')
                .delete()
                .in('id', idsToDelete)

            if (error) throw error

            toast.success(`ลบเลขอั้น/ปิด (${filterLabel}) เรียบร้อยแล้ว`)
            fetchLimits()
        } catch (error) {
            console.error('Error bulk deleting limits:', error)
            toast.error('เกิดข้อผิดพลาดในการลบ: ' + error.message)
        }
    }

    // Extract unique bet types currently present in the limits list with their counts
    const existingBetTypes = useMemo(() => {
        const counts = {}
        limits.forEach(l => {
            counts[l.bet_type] = (counts[l.bet_type] || 0) + 1
        })
        return Object.keys(counts).map(key => ({
            key,
            label: BET_TYPES[key] || key,
            count: counts[key]
        })).sort((a, b) => (BET_TYPES[a.key] || a.key).localeCompare(BET_TYPES[b.key] || b.key, 'th'))
    }, [limits])

    // Number of limits targeted by current batch selection
    const batchTargetCount = useMemo(() => {
        if (batchSelectedTypes.length === 0) return 0
        return limits.filter(l => batchSelectedTypes.includes(l.bet_type)).length
    }, [limits, batchSelectedTypes])

    async function handleApplyBatchAdjust() {
        if (batchSelectedTypes.length === 0) {
            toast.error('กรุณาเลือกประเภทเลขอย่างน้อย 1 ประเภท')
            return
        }

        const isRate = batchLimitType === 'rate_limit'
        const isBlocked = batchLimitType === 'blocked'
        const newMaxAmount = isBlocked ? 0 : (parseFloat(batchAmount) || 0)

        const targetItems = limits.filter(l => batchSelectedTypes.includes(l.bet_type))
        if (targetItems.length === 0) {
            toast.error('ไม่พบรายการเลขอั้นในประเภทที่เลือก')
            return
        }

        const selectedLabels = batchSelectedTypes.map(k => BET_TYPES[k] || k).join(', ')
        const confirmMsg = `คุณต้องการปรับเลขอั้นในประเภท:\n[ ${selectedLabels} ]\n\nจำนวนทั้งหมด ${targetItems.length} รายการ\nวงเงินรับสูงสุด: ${isBlocked ? 'ปิดรับ' : `${round.currency_symbol}${newMaxAmount.toLocaleString()}`}${isRate ? ` (อัตราจ่าย ${batchPayoutPercent}%)` : ''}\n\nต้องการดำเนินการต่อหรือไม่?`

        if (!(await confirmDialog({
            title: 'ยืนยันการปรับวงเงินเลขอั้นตามประเภท',
            message: confirmMsg,
            confirmText: 'ยืนยันปรับวงเงิน',
            confirmButtonClass: 'primary'
        }))) return

        setBatchSaving(true)
        try {
            const timeCondition = {
                use_default_limit: false,
                is_rate_limit: isRate
            }

            const payload = {
                max_amount: newMaxAmount,
                limit_type: isRate ? 'rate_limit' : batchLimitType,
                payout_percent: isBlocked ? 100 : isRate ? (parseFloat(batchPayoutPercent) || 50) : 100,
                use_default_limit: false,
                time_condition: timeCondition
            }

            const targetIds = targetItems.map(l => l.id)
            const chunkSize = 200
            for (let i = 0; i < targetIds.length; i += chunkSize) {
                const chunk = targetIds.slice(i, i + chunkSize)
                let { error } = await supabase
                    .from('number_limits')
                    .update(payload)
                    .in('id', chunk)

                if (error && (error.message?.includes('limit_type') || error.message?.includes('use_default_limit') || error.message?.includes('constraint'))) {
                    const { use_default_limit, ...rest } = payload
                    const retryRes = await supabase
                        .from('number_limits')
                        .update({
                            ...rest,
                            limit_type: isRate ? 'limited' : batchLimitType
                        })
                        .in('id', chunk)
                    if (retryRes.error) throw retryRes.error
                } else if (error) {
                    throw error
                }
            }

            toast.success(`ปรับวงเงิน ${targetItems.length} รายการเป็น ${isBlocked ? 'ปิดรับ' : `${round.currency_symbol}${newMaxAmount.toLocaleString()}`} สำเร็จ`)
            setShowBatchAdjust(false)
            fetchLimits()
        } catch (error) {
            console.error('Error batch updating limits:', error)
            toast.error('เกิดข้อผิดพลาดในการปรับวงเงิน: ' + error.message)
        } finally {
            setBatchSaving(false)
        }
    }

    // Filtered limits based on search and digit filter
    const filteredLimits = useMemo(() => {
        return limits.filter(l => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase()
                const matchSearch = l.numbers.includes(q) || (BET_TYPES[l.bet_type] || '').toLowerCase().includes(q)
                if (!matchSearch) return false
            }
            if (digitFilter !== 'all') {
                const reqLen = parseInt(digitFilter, 10)
                if (l.numbers.length !== reqLen) return false
            }
            return true
        })
    }, [limits, searchQuery, digitFilter])

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
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            if (!saving) {
                                                handleAddLimit()
                                            }
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ flex: '1 1 140px', minWidth: '120px' }}>
                                <label style={labelStyle}>ประเภทจำกัด</label>
                                <select
                                    style={inputStyle}
                                    value={newLimit.limit_type}
                                    onChange={e => {
                                        const nextType = e.target.value
                                        setNewLimit(prev => ({
                                            ...prev,
                                            limit_type: nextType,
                                            use_default_limit: nextType === 'rate_limit' ? true : false,
                                            payout_percent: nextType === 'blocked' ? 100 : (prev.payout_percent || 50)
                                        }))
                                    }}
                                >
                                    <option value="limited">🔶 อั้น (รับเกินได้)</option>
                                    <option value="blocked">🔴 ปิด (ปิดรับ)</option>
                                    <option value="rate_limit">🟡 จำกัดอัตราจ่าย</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Max Amount + Payout % (same row) */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                            <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                                {newLimit.limit_type === 'rate_limit' ? (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                                            <label style={{ ...labelStyle, marginBottom: 0 }}>วงเงินรับสูงสุด</label>
                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={newLimit.use_default_limit}
                                                    onChange={e => setNewLimit({ ...newLimit, use_default_limit: e.target.checked })}
                                                    style={{ width: '15px', height: '15px', accentColor: '#eab308' }}
                                                />
                                                <span style={{ fontWeight: '600', color: newLimit.use_default_limit ? '#eab308' : 'var(--color-text)' }}>
                                                    อั้นปกติ
                                                </span>
                                            </label>
                                        </div>
                                        {newLimit.use_default_limit ? (
                                            <div style={{
                                                padding: '0.45rem 0.6rem',
                                                borderRadius: '6px',
                                                background: 'rgba(234, 179, 8, 0.1)',
                                                border: '1px dashed rgba(234, 179, 8, 0.35)',
                                                fontSize: '0.78rem',
                                                color: '#eab308',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                minHeight: '34px'
                                            }}>
                                                <span>✓ อั้นตามประเภทเลข</span>
                                            </div>
                                        ) : (
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                style={inputStyle}
                                                placeholder="0"
                                                value={newLimit.max_amount}
                                                onChange={e => setNewLimit({ ...newLimit, max_amount: e.target.value })}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        if (!saving) handleAddLimit()
                                                    }
                                                }}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <label style={labelStyle}>วงเงินรับสูงสุด ({round.currency_symbol})</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            style={inputStyle}
                                            placeholder="0"
                                            value={newLimit.max_amount}
                                            onChange={e => setNewLimit({ ...newLimit, max_amount: e.target.value })}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    if (!saving) handleAddLimit()
                                                }
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                            {(newLimit.limit_type === 'limited' || newLimit.limit_type === 'rate_limit') && (
                                <div style={{ flex: '0 0 110px', minWidth: '90px' }}>
                                    <label style={labelStyle}>อัตราจ่าย %</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        style={inputStyle}
                                        placeholder="50"
                                        min="0"
                                        max="100"
                                        value={newLimit.payout_percent}
                                        onChange={e => setNewLimit({ ...newLimit, payout_percent: e.target.value })}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                if (!saving) {
                                                    handleAddLimit()
                                                }
                                            }
                                        }}
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
                            onClick={e => { e.currentTarget?.blur(); handleAddLimit() }}
                            disabled={
                                saving ||
                                !newLimit.numbers ||
                                newLimit.selected_bet_types.length === 0 ||
                                (
                                    newLimit.limit_type !== 'blocked' &&
                                    !(newLimit.limit_type === 'rate_limit' && newLimit.use_default_limit) &&
                                    newLimit.max_amount !== 0 &&
                                    (newLimit.max_amount === '' || newLimit.max_amount === null || newLimit.max_amount === undefined)
                                )
                            }
                            style={{ marginTop: '0.3rem' }}
                        >
                            {saving ? 'กำลังบันทึก...' : (
                                <>
                                    <FiPlus /> เพิ่มเลข{
                                        newLimit.limit_type === 'rate_limit' ? 'จำกัดอัตราจ่าย' :
                                        newLimit.limit_type === 'blocked' ? 'ปิด' : 'อั้น'
                                    } {newLimit.numbers || ''}
                                    {newLimit.selected_bet_types.length > 0 && ` (${newLimit.selected_bet_types.length} ประเภท)`}
                                </>
                            )}
                        </button>
                    </div>

                    {/* === Current Limits List === */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                รายการเลขอั้น/ปิด ({filteredLimits.length === limits.length ? limits.length : `${filteredLimits.length}/${limits.length}`})
                            </h4>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {/* Dropdown filter by digit count */}
                                <select
                                    style={{ ...inputStyle, width: 'auto', minWidth: '105px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                                    value={digitFilter}
                                    onChange={e => setDigitFilter(e.target.value)}
                                >
                                    <option value="all">ทุกประเภทหลัก</option>
                                    <option value="1">เลข 1 ตัว</option>
                                    <option value="2">เลข 2 ตัว</option>
                                    <option value="3">เลข 3 ตัว</option>
                                    <option value="4">เลข 4 ตัว</option>
                                    <option value="5">เลข 5 ตัว</option>
                                </select>

                                {/* Search input */}
                                <div style={{ position: 'relative', width: '120px' }}>
                                    <FiSearch style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={13} />
                                    <input
                                        type="text"
                                        style={{ ...inputStyle, paddingLeft: '1.6rem', paddingRight: searchQuery ? '1.4rem' : '0.4rem', padding: '0.35rem 0.4rem 0.35rem 1.6rem', fontSize: '0.8rem' }}
                                        placeholder="ค้นหา..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            style={{ position: 'absolute', right: '0.3rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0 }}
                                        >
                                            <FiX size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Batch Adjust Button */}
                                {limits.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn btn-sm"
                                        onClick={() => setShowBatchAdjust(prev => !prev)}
                                        title="ปรับวงเงินเลขอั้นตามประเภทเลขพร้อมกัน"
                                        style={{
                                            padding: '0.35rem 0.6rem',
                                            height: '30px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            fontSize: '0.78rem',
                                            borderRadius: '6px',
                                            background: showBatchAdjust ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.1)',
                                            border: '1px solid rgba(212, 175, 55, 0.4)',
                                            color: 'var(--color-primary, #d4af37)',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        <FiEdit2 size={12} /> ปรับวงเงินตามประเภท
                                    </button>
                                )}

                                {/* Bulk Delete Button */}
                                {filteredLimits.length > 0 && (
                                    <button
                                        className="icon-btn danger"
                                        onClick={handleDeleteBulkFilteredLimits}
                                        title={digitFilter !== 'all' || searchQuery ? `ลบทั้งหมดที่กรองอยู่ (${filteredLimits.length} รายการ)` : `ลบรายการเลขอั้นทั้งหมด (${limits.length} รายการ)`}
                                        style={{ padding: '0.35rem 0.55rem', height: '30px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', borderRadius: '6px' }}
                                    >
                                        <FiTrash2 size={13} /> ลบทั้งหมด
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Batch Adjust Panel */}
                        {showBatchAdjust && limits.length > 0 && (
                            <div style={{
                                background: 'var(--color-card, #1a1a2e)',
                                border: '1.5px solid rgba(212, 175, 55, 0.45)',
                                borderRadius: '8px',
                                padding: '0.75rem',
                                marginBottom: '0.75rem',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-primary, #d4af37)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <FiEdit2 size={13} /> ปรับวงเงินเลขอั้นตามประเภท (ปรับพร้อมกัน)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowBatchAdjust(false)}
                                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                                    >
                                        <FiX size={14} />
                                    </button>
                                </div>

                                {/* Step 1: Select Bet Types */}
                                <div style={{ marginBottom: '0.65rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                        <label style={{ ...labelStyle, marginBottom: 0, fontSize: '0.78rem' }}>
                                            1. เลือกประเภทเลขที่ต้องการปรับ:
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setBatchSelectedTypes(existingBetTypes.map(t => t.key))}
                                                style={{ background: 'none', border: 'none', color: 'var(--color-primary, #d4af37)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                เลือกทั้งหมด
                                            </button>
                                            <span style={{ opacity: 0.3, fontSize: '0.72rem' }}>|</span>
                                            <button
                                                type="button"
                                                onClick={() => setBatchSelectedTypes([])}
                                                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                            >
                                                ล้าง
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        {existingBetTypes.map(t => {
                                            const isSelected = batchSelectedTypes.includes(t.key)
                                            return (
                                                <span
                                                    key={t.key}
                                                    onClick={() => {
                                                        setBatchSelectedTypes(prev => 
                                                            prev.includes(t.key) ? prev.filter(k => k !== t.key) : [...prev, t.key]
                                                        )
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        padding: '0.25rem 0.55rem',
                                                        borderRadius: '16px',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer',
                                                        userSelect: 'none',
                                                        border: isSelected ? '1.5px solid var(--color-primary, #d4af37)' : '1px solid var(--color-border)',
                                                        background: isSelected ? 'rgba(212, 175, 55, 0.2)' : 'var(--color-surface-light)',
                                                        color: isSelected ? 'var(--color-primary, #d4af37)' : 'var(--color-text)',
                                                        fontWeight: isSelected ? '600' : 'normal'
                                                    }}
                                                >
                                                    {isSelected && <FiCheck size={11} />}
                                                    {t.label}
                                                    <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>({t.count})</span>
                                                </span>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Step 2: New Amount & Limit Type */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 120px' }}>
                                        <label style={{ ...labelStyle, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                                            2. วงเงินรับสูงสุดใหม่ ({round.currency_symbol})
                                        </label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            style={{ ...inputStyle, padding: '0.4rem 0.55rem', fontSize: '0.85rem' }}
                                            placeholder="เช่น 800"
                                            value={batchAmount}
                                            onChange={e => setBatchAmount(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    if (!batchSaving && batchTargetCount > 0) handleApplyBatchAdjust()
                                                }
                                            }}
                                        />
                                    </div>

                                    <div style={{ flex: '1 1 120px' }}>
                                        <label style={{ ...labelStyle, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                                            ประเภทจำกัด
                                        </label>
                                        <select
                                            style={{ ...inputStyle, padding: '0.4rem 0.55rem', fontSize: '0.85rem' }}
                                            value={batchLimitType}
                                            onChange={e => setBatchLimitType(e.target.value)}
                                        >
                                            <option value="limited">🔶 อั้น (รับเกินได้)</option>
                                            <option value="rate_limit">🟡 จำกัดอัตราจ่าย</option>
                                            <option value="blocked">🔴 ปิด (ปิดรับ)</option>
                                        </select>
                                    </div>

                                    {batchLimitType === 'rate_limit' && (
                                        <div style={{ flex: '0 0 90px' }}>
                                            <label style={{ ...labelStyle, fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                                                อัตราจ่าย %
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="0"
                                                max="100"
                                                style={{ ...inputStyle, padding: '0.4rem 0.55rem', fontSize: '0.85rem' }}
                                                placeholder="50"
                                                value={batchPayoutPercent}
                                                onChange={e => setBatchPayoutPercent(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Step 3: Summary and Action Button */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingTop: '0.5rem',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                    flexWrap: 'wrap',
                                    gap: '0.4rem'
                                }}>
                                    <div style={{ fontSize: '0.78rem', color: batchTargetCount > 0 ? '#eab308' : 'var(--color-text-muted)' }}>
                                        {batchTargetCount > 0 ? (
                                            <>
                                                จะปรับทั้งหมด <strong>{batchTargetCount} รายการ</strong> (ใน {batchSelectedTypes.length} ประเภท) เป็น <strong>{round.currency_symbol}{parseFloat(batchAmount || 0).toLocaleString()}</strong>
                                            </>
                                        ) : (
                                            'กรุณาเลือกประเภทเลขที่ต้องการปรับ'
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setShowBatchAdjust(false)}
                                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            disabled={batchSaving || batchTargetCount === 0 || (batchLimitType !== 'blocked' && (batchAmount === '' || batchAmount === null))}
                                            onClick={handleApplyBatchAdjust}
                                            style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
                                        >
                                            {batchSaving ? 'กำลังบันทึก...' : `ยืนยันปรับวงเงิน (${batchTargetCount})`}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div className="spinner"></div>
                            </div>
                        ) : groupedLimits.length === 0 ? (
                            <p style={{ textAlign: 'center', opacity: 0.5, padding: '1.5rem' }}>
                                {searchQuery || digitFilter !== 'all' ? 'ไม่พบเลขตามเงื่อนไขที่กรอง/ค้นหา' : 'ยังไม่มีการตั้งค่าเลขอั้น/ปิด'}
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
                                                            style={{ ...inputStyle, width: '115px', padding: '0.3rem' }}
                                                            value={editForm.limit_type}
                                                            onChange={e => setEditForm({ ...editForm, limit_type: e.target.value, use_default_limit: e.target.value === 'rate_limit' ? true : false })}
                                                        >
                                                            <option value="limited">อั้น</option>
                                                            <option value="blocked">ปิด</option>
                                                            <option value="rate_limit">จำกัดอัตราจ่าย</option>
                                                        </select>

                                                        {editForm.limit_type === 'rate_limit' && (
                                                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editForm.use_default_limit}
                                                                    onChange={e => setEditForm({ ...editForm, use_default_limit: e.target.checked })}
                                                                    style={{ accentColor: '#eab308' }}
                                                                />
                                                                <span style={{ color: editForm.use_default_limit ? '#eab308' : 'inherit', fontWeight: '500' }}>อั้นปกติ</span>
                                                            </label>
                                                        )}

                                                        {!(editForm.limit_type === 'rate_limit' && editForm.use_default_limit) && (
                                                            <input
                                                                type="number"
                                                                style={{ ...inputStyle, width: '70px', padding: '0.3rem' }}
                                                                value={editForm.max_amount}
                                                                onChange={e => setEditForm({ ...editForm, max_amount: e.target.value })}
                                                                placeholder="วงเงิน"
                                                            />
                                                        )}

                                                        {(editForm.limit_type === 'limited' || editForm.limit_type === 'rate_limit') && (
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
                                                            {(() => {
                                                                const isRate = limit.limit_type === 'rate_limit' || limit.time_condition?.is_rate_limit === true
                                                                const isBlocked = limit.limit_type === 'blocked'
                                                                const isDef = limit.use_default_limit === true || limit.time_condition?.use_default_limit === true

                                                                const badgeBg = isBlocked ? 'rgba(244, 67, 54, 0.2)' : isRate ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 152, 0, 0.2)'
                                                                const badgeColor = isBlocked ? '#f44336' : isRate ? '#eab308' : '#ff9800'
                                                                const badgeText = isBlocked ? 'ปิด' : isRate ? 'จำกัดอัตราจ่าย' : 'อั้น'

                                                                return (
                                                                    <>
                                                                        <span style={{
                                                                            fontSize: '0.65rem',
                                                                            padding: '0.05rem 0.3rem',
                                                                            borderRadius: '3px',
                                                                            fontWeight: '600',
                                                                            background: badgeBg,
                                                                            color: badgeColor,
                                                                            lineHeight: '1.3'
                                                                        }}>
                                                                            {badgeText}
                                                                        </span>
                                                                        <span style={{ fontWeight: '500', minWidth: '55px', fontSize: '0.8rem' }}>{BET_TYPES[limit.bet_type]}</span>
                                                                        <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                                                                            {isDef ? (
                                                                                <span style={{ color: '#eab308', fontWeight: '500' }}>วงเงิน: อั้นตามประเภทเลข</span>
                                                                            ) : (
                                                                                `${round.currency_symbol}${limit.max_amount?.toLocaleString()}`
                                                                            )}
                                                                        </span>
                                                                        {(limit.limit_type === 'limited' || isRate) && limit.payout_percent !== 100 && (
                                                                            <span style={{ fontSize: '0.72rem', color: isRate ? '#eab308' : 'var(--color-warning)', fontWeight: '500' }}>
                                                                                จ่าย {limit.payout_percent}%
                                                                            </span>
                                                                        )}
                                                                        {limit.time_condition?.after_time && (
                                                                            <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                                                                                <FiClock size={10} /> {limit.time_condition.after_time}→{limit.time_condition.payout_percent}%
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )
                                                            })()}
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
