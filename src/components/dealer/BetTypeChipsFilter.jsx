import React, { useMemo } from 'react'
import { FiTag } from 'react-icons/fi'
import { getFilterBetTypes, getDigitGroups } from '../../utils/betTypeFilterHelper'

/**
 * Multi-Select Chips Filter for Bet Types
 * Styled similarly to MemberTimeExtensionModal selection box
 * 
 * @param {Object} props
 * @param {string} props.lotteryType - e.g. 'thai', 'lao', 'hanoi', 'stock'
 * @param {string[]} props.selectedTypes - Array of selected bet type IDs
 * @param {function} props.onChange - (newSelectedTypes: string[]) => void
 */
export default function BetTypeChipsFilter({ lotteryType, selectedTypes = [], onChange }) {
    // 1. Get bet types configured for this lottery
    const allTypes = useMemo(() => getFilterBetTypes(lotteryType), [lotteryType])

    // 2. Get digit groups (1 ตัว, 2 ตัว, 3 ตัว, 4 ตัว, 5 ตัว)
    const digitGroups = useMemo(() => getDigitGroups(lotteryType), [lotteryType])

    // 3. Map for quick lookup of labels
    const typeMap = useMemo(() => {
        const map = {}
        allTypes.forEach(t => {
            map[t.id] = t
        })
        return map
    }, [allTypes])

    // 4. Types available to be added
    const availableTypes = useMemo(() => {
        return allTypes.filter(t => !selectedTypes.includes(t.id))
    }, [allTypes, selectedTypes])

    // Select all available types
    const handleSelectAll = () => {
        onChange(allTypes.map(t => t.id))
    }

    // Clear all selections (defaults to showing all in filter logic)
    const handleClearAll = () => {
        onChange([])
    }

    // Add single type
    const handleAddType = (typeId) => {
        if (!typeId) return
        if (!selectedTypes.includes(typeId)) {
            onChange([...selectedTypes, typeId])
        }
    }

    // Remove single type
    const handleRemoveType = (typeId) => {
        onChange(selectedTypes.filter(id => id !== typeId))
    }

    // Toggle or add entire digit group
    const handleToggleGroup = (groupTypes, forceAdd = false) => {
        if (!groupTypes || groupTypes.length === 0) return
        const isFull = groupTypes.every(t => selectedTypes.includes(t))
        if (isFull && !forceAdd) {
            // Toggle OFF: remove this group's types
            onChange(selectedTypes.filter(id => !groupTypes.includes(id)))
        } else {
            // Toggle ON: add missing types from this group
            const merged = Array.from(new Set([...selectedTypes, ...groupTypes]))
            onChange(merged)
        }
    }

    const isAllSelected = selectedTypes.length === allTypes.length && allTypes.length > 0

    return (
        <div 
            className="bet-type-selection-box"
            style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '8px',
                padding: '0.5rem 0.65rem',
                margin: '0.4rem 0 0.6rem 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem'
            }}
        >
            {/* Header: Title and Quick Action Buttons */}
            <div 
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem'
                }}
            >
                <div 
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        color: 'var(--color-text, #fff)',
                        fontWeight: 600
                    }}
                >
                    <FiTag size={13} style={{ color: '#f59e0b' }} />
                    <span>
                        {`ประเภทเลขที่เลือก (${selectedTypes.length === 0 ? 'ทั้งหมด' : `${selectedTypes.length}/${allTypes.length}`})`}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {!isAllSelected && (
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                background: 'rgba(245, 158, 11, 0.1)',
                                color: '#f59e0b',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="เลือกประเภทเลขทั้งหมดของงวดนี้"
                        >
                            {`เลือกทั้งหมด (${allTypes.length})`}
                        </button>
                    )}
                    {selectedTypes.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            style={{
                                padding: '2px 6px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                background: 'transparent',
                                color: 'var(--color-text-muted, #94a3b8)',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="ล้างตัวเลือกเพื่อดูทุกประเภท"
                        >
                            ล้าง
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Group Shortcuts - Centered for clean mobile & desktop layout */}
            {digitGroups.length > 0 && (
                <div 
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '3px 0 5px 0',
                        borderBottom: '1px dashed rgba(255, 255, 255, 0.08)'
                    }}
                >
                    {digitGroups.map(group => {
                        const selectedCount = group.types.filter(t => selectedTypes.includes(t)).length
                        const isFull = selectedCount === group.types.length && group.types.length > 0
                        const isPartial = selectedCount > 0 && !isFull

                        return (
                            <button
                                key={group.id}
                                type="button"
                                onClick={() => handleToggleGroup(group.types)}
                                style={{
                                    padding: '3px 9px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    fontWeight: isFull ? 600 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    border: isFull
                                        ? '1px solid #f59e0b'
                                        : isPartial
                                        ? '1px dashed rgba(245, 158, 11, 0.6)'
                                        : '1px solid rgba(255, 255, 255, 0.15)',
                                    background: isFull
                                        ? 'rgba(245, 158, 11, 0.22)'
                                        : isPartial
                                        ? 'rgba(245, 158, 11, 0.08)'
                                        : 'rgba(255, 255, 255, 0.04)',
                                    color: isFull
                                        ? '#f59e0b'
                                        : isPartial
                                        ? '#fbbf24'
                                        : 'var(--color-text, #cbd5e1)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.25rem'
                                }}
                                title={`คลิกเพื่อเลือกหรือยกเลิก ${group.label} (${group.types.length} ประเภท)`}
                            >
                                {isFull && <span style={{ fontSize: '0.7rem' }}>✓</span>}
                                <span>{group.label}</span>
                                <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>
                                    ({selectedCount > 0 && !isFull ? `${selectedCount}/${group.types.length}` : group.types.length})
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Chips Container - Centered */}
            <div 
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    minHeight: '28px',
                    alignItems: 'center',
                    padding: '2px 0'
                }}
            >
                {selectedTypes.length === 0 ? (
                    <span 
                        style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--color-text-muted, #94a3b8)', 
                            fontStyle: 'italic',
                            width: '100%',
                            textAlign: 'center',
                            display: 'block',
                            padding: '2px 0'
                        }}
                    >
                        แสดงทุกประเภทเลข (กดเลือกประเภทหรือคลิกปุ่มทางลัดด้านบนเพื่อกรองเจาะจง)
                    </span>
                ) : (
                    selectedTypes.map(typeId => {
                        const label = typeMap[typeId]?.label || typeId
                        return (
                            <div
                                key={typeId}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '2px 8px',
                                    borderRadius: '16px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    border: '1px solid rgba(245, 158, 11, 0.4)',
                                    background: 'rgba(245, 158, 11, 0.12)',
                                    color: '#f59e0b',
                                    userSelect: 'none'
                                }}
                            >
                                <span>{label}</span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveType(typeId)
                                    }}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#f59e0b',
                                        cursor: 'pointer',
                                        padding: '0 1px',
                                        fontSize: '0.75rem',
                                        lineHeight: 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0.8
                                    }}
                                    title={`เอา ${label} ออก`}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
                                >
                                    ✕
                                </button>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Dropdown for adding more bet types */}
            {availableTypes.length > 0 && (
                <div style={{ marginTop: '0.15rem' }}>
                    <select
                        value=""
                        onChange={(e) => {
                            const val = e.target.value
                            if (!val) return
                            if (val.startsWith('group:')) {
                                const groupId = val.replace('group:', '')
                                const group = digitGroups.find(g => g.id === groupId)
                                if (group) {
                                    handleToggleGroup(group.types, true)
                                }
                            } else {
                                handleAddType(val)
                            }
                        }}
                        style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--color-text, #fff)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '0.78rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="" style={{ background: '#1e2230', color: '#94a3b8' }}>
                            ➕ เลือกเพิ่มประเภทเลข... (เหลืออีก {availableTypes.length} ประเภท)
                        </option>

                        {/* Option group for digit groups that have unselected items */}
                        {digitGroups.some(g => g.types.some(t => !selectedTypes.includes(t))) && (
                            <optgroup label="⚡ ทางลัดเลือกตามจำนวนหลัก" style={{ background: '#1e2230', color: '#f59e0b' }}>
                                {digitGroups
                                    .filter(g => g.types.some(t => !selectedTypes.includes(t)))
                                    .map(g => (
                                        <option key={`group-${g.id}`} value={`group:${g.id}`} style={{ background: '#1e2230', color: '#fff' }}>
                                            📁 {g.label} ({g.types.length} ประเภท)
                                        </option>
                                    ))}
                            </optgroup>
                        )}

                        {/* Individual bet types */}
                        <optgroup label="🏷️ เลือกทีละประเภท" style={{ background: '#1e2230', color: '#94a3b8' }}>
                            {availableTypes.map(t => (
                                <option key={t.id} value={t.id} style={{ background: '#1e2230', color: '#fff' }}>
                                    {t.label}
                                </option>
                            ))}
                        </optgroup>
                    </select>
                </div>
            )}
        </div>
    )
}

