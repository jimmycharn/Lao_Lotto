import React, { useState, useEffect } from 'react'
import { FiClock, FiCheck, FiX, FiAlertCircle, FiUser, FiCalendar, FiTrash2, FiUsers, FiPlus } from 'react-icons/fi'
import { LOTTERY_TYPES } from '../../constants/lotteryTypes'
import './MemberTimeExtensionModal.css'

export default function MemberTimeExtensionModal({
    isOpen,
    onClose,
    round,
    member,
    allMembers = [],
    onSave,
    onRevoke
}) {
    if (!isOpen || !round) return null

    // Multi-member selected IDs state
    const [selectedMemberIds, setSelectedMemberIds] = useState([])
    const [currentTime, setCurrentTime] = useState(new Date())

    // Update current time every second for live calculations
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    // Check if round's normal close time is in the future
    const isRoundBeforeClose = round.close_time && new Date(round.close_time) > currentTime

    // Mode: 'duration' (ยืดเวลา) | 'specific_time' (กำหนดเวลาปิดตรงๆ)
    const [mode, setMode] = useState('duration')
    // Base time mode when round is still open: 'round_close' (ยืดจากเวลาปิดงวดปกติ) | 'now' (นับจากเวลาขณะนี้)
    const [baseTimeMode, setBaseTimeMode] = useState(isRoundBeforeClose ? 'round_close' : 'now')
    const [durationMinutes, setDurationMinutes] = useState(5)
    const [durationUnit, setDurationUnit] = useState('minutes') // 'minutes' | 'seconds'
    const [specificTime, setSpecificTime] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isRevoking, setIsRevoking] = useState(false)

    // Sync selected members when modal opens or member prop changes
    useEffect(() => {
        if (!isOpen) return
        if (member?.id) {
            // When opened for a specific member from their row
            setSelectedMemberIds([member.id])
        } else {
            // When opened from top-level button
            // If some members already have active extensions, preselect them; otherwise start empty
            const activeIds = Object.entries(round.temp_open_members || {})
                .filter(([_, info]) => info?.expires_at && new Date(info.expires_at) > new Date())
                .map(([id]) => id)

            if (activeIds.length > 0) {
                setSelectedMemberIds(activeIds)
            } else {
                setSelectedMemberIds([])
            }
        }
    }, [isOpen, member?.id, round.id])

    // Member helper methods
    const handleAddMember = (memberId) => {
        if (!memberId) return
        if (!selectedMemberIds.includes(memberId)) {
            setSelectedMemberIds(prev => [...prev, memberId])
        }
    }

    const handleRemoveMember = (memberId) => {
        setSelectedMemberIds(prev => prev.filter(id => id !== memberId))
    }

    const handleSelectAll = () => {
        setSelectedMemberIds(allMembers.map(m => m.id))
    }

    const handleSelectActiveOnly = () => {
        const activeIds = Object.entries(round.temp_open_members || {})
            .filter(([_, info]) => info?.expires_at && new Date(info.expires_at) > new Date())
            .map(([id]) => id)
        setSelectedMemberIds(activeIds)
    }

    const handleClearAll = () => {
        setSelectedMemberIds([])
    }

    // Selected member objects
    const selectedMembers = allMembers.filter(m => selectedMemberIds.includes(m.id))
    const availableMembers = allMembers.filter(m => !selectedMemberIds.includes(m.id))

    // Active extensions count among selected
    const activeSelectedCount = selectedMemberIds.filter(id => {
        const ext = round.temp_open_members?.[id] || (
            round.temp_open_member_id === id && round.temp_open_expires_at
                ? { expires_at: round.temp_open_expires_at }
                : null
        )
        return ext?.expires_at && new Date(ext.expires_at) > currentTime
    }).length

    const totalActiveInRound = Object.entries(round.temp_open_members || {})
        .filter(([_, info]) => info?.expires_at && new Date(info.expires_at) > currentTime).length

    // Set initial specific time based on whether round is open or closed
    useEffect(() => {
        if (!specificTime) {
            let target
            if (round?.close_time && new Date(round.close_time) > new Date()) {
                target = new Date(new Date(round.close_time).getTime() + 5 * 60 * 1000)
            } else {
                target = new Date(Date.now() + 10 * 60 * 1000)
            }
            const hh = String(target.getHours()).padStart(2, '0')
            const mm = String(target.getMinutes()).padStart(2, '0')
            setSpecificTime(`${hh}:${mm}`)
        }
    }, [round?.close_time])

    // Calculate Target Expiry Date based on chosen mode and base time
    const getTargetExpiryDate = () => {
        const now = currentTime
        if (mode === 'duration') {
            const baseDate = (isRoundBeforeClose && baseTimeMode === 'round_close')
                ? new Date(round.close_time)
                : now
            const msToAdd = durationUnit === 'minutes' 
                ? (Number(durationMinutes) || 0) * 60 * 1000
                : (Number(durationMinutes) || 0) * 1000
            return new Date(baseDate.getTime() + msToAdd)
        } else {
            // Specific time (HH:mm)
            if (!specificTime) return null
            const [hours, minutes] = specificTime.split(':').map(Number)
            if (isNaN(hours) || isNaN(minutes)) return null
            
            const baseDate = round?.close_time ? new Date(round.close_time) : new Date(now)
            const target = new Date(baseDate)
            target.setHours(hours, minutes, 0, 0)
            if (target.getTime() <= now.getTime() && !isRoundBeforeClose) {
                target.setDate(target.getDate() + 1)
            }
            return target
        }
    }

    const targetDate = getTargetExpiryDate()
    const targetDiffSeconds = targetDate ? Math.max(0, Math.floor((targetDate.getTime() - currentTime.getTime()) / 1000)) : 0
    const targetDiffMins = Math.floor(targetDiffSeconds / 60)
    const targetDiffRemainingSecs = targetDiffSeconds % 60

    // Compare with normal round close time
    const normalCloseDate = round?.close_time ? new Date(round.close_time) : null
    const diffFromNormalCloseMins = (targetDate && normalCloseDate)
        ? Math.round((targetDate.getTime() - normalCloseDate.getTime()) / 60000)
        : 0

    const formatTimeDisplay = (date) => {
        if (!date) return '-'
        return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    const formatNormalCloseTime = (isoString) => {
        if (!isoString) return '-'
        return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    }

    const handleQuickPreset = (minutes) => {
        setMode('duration')
        setDurationUnit('minutes')
        setDurationMinutes(minutes)
        if (isRoundBeforeClose) {
            setBaseTimeMode('round_close')
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (selectedMemberIds.length === 0) {
            alert('กรุณาเลือกสมาชิกอย่างน้อย 1 คน')
            return
        }
        if (!targetDate || targetDiffSeconds <= 0) {
            alert('กรุณาระบุเวลาที่มากกว่าเวลาปัจจุบัน')
            return
        }

        setIsSaving(true)
        try {
            const extensionInfos = {}
            selectedMemberIds.forEach(id => {
                const m = allMembers.find(mem => mem.id === id) || {}
                extensionInfos[id] = {
                    expires_at: targetDate.toISOString(),
                    granted_at: new Date().toISOString(),
                    duration_minutes: mode === 'duration' && durationUnit === 'minutes' ? Number(durationMinutes) : Math.round(targetDiffSeconds / 60),
                    member_name: m.full_name || m.name || 'สมาชิก',
                    member_code: m.member_code || ''
                }
            })

            await onSave(selectedMemberIds, targetDate.toISOString(), extensionInfos)
            onClose()
        } catch (error) {
            console.error('Error saving extensions:', error)
            alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleRevoke = async () => {
        if (selectedMemberIds.length === 0) {
            alert('กรุณาเลือกสมาชิกที่ต้องการยกเลิกสิทธิ์อย่างน้อย 1 คน')
            return
        }
        if (!confirm(`ต้องการยกเลิกสิทธิ์ขยายเวลาของสมาชิกที่เลือก (${selectedMemberIds.length} คน) หรือไม่?`)) return

        setIsRevoking(true)
        try {
            await onRevoke(selectedMemberIds)
            onClose()
        } catch (error) {
            console.error('Error revoking extensions:', error)
            alert('เกิดข้อผิดพลาดในการยกเลิก: ' + error.message)
        } finally {
            setIsRevoking(false)
        }
    }

    return (
        <div 
            className="member-extension-backdrop" 
            onClick={onClose}
        >
            <div 
                className="modal-content member-extension-modal"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="member-extension-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="icon-wrapper">
                            <FiClock size={20} />
                        </div>
                        <div className="title-area">
                            <h3>
                                {isRoundBeforeClose ? 'ตั้งเวลาปิดรับ / ขยายเวลาเฉพาะบุคคล' : 'ขยายเวลาส่งเลขเฉพาะบุคคล'}
                            </h3>
                            <p>
                                งวด: {round.lottery_name || LOTTERY_TYPES[round.lottery_type]} (ปิดปกติ {formatNormalCloseTime(round.close_time)} น.)
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="member-extension-close-btn"
                        type="button"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* Modal Body (Scrollable) */}
                <form className="member-extension-body" onSubmit={handleSubmit}>
                    
                    {/* Member Selection Section */}
                    <div className="member-selection-box">
                        {/* Member Controls Header */}
                        <div className="member-selection-header">
                            <div className="member-selection-title">
                                <FiUsers size={14} style={{ color: '#f59e0b' }} />
                                <span>
                                    สมาชิกที่เลือก ({selectedMemberIds.length})
                                </span>
                            </div>

                            {/* Quick Selection Shortcuts */}
                            <div className="member-quick-actions">
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
                                        cursor: 'pointer'
                                    }}
                                >
                                    เลือกทั้งหมด ({allMembers.length})
                                </button>
                                {totalActiveInRound > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleSelectActiveOnly}
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(16, 185, 129, 0.4)',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#10b981',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        เฉพาะคนที่มีสิทธิ์ ({totalActiveInRound})
                                    </button>
                                )}
                                {selectedMemberIds.length > 0 && (
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
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ล้าง
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Selected Members Chips Container */}
                        <div className="member-chips-container">
                            {selectedMembers.length === 0 ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)', fontStyle: 'italic', padding: '0.2rem' }}>
                                    ยังไม่ได้เลือกสมาชิก (กดปุ่ม "เลือกทั้งหมด" หรือเลือกเพิ่มจากเมนูด้านล่าง)
                                </span>
                            ) : (
                                selectedMembers.map(m => {
                                    const ext = round.temp_open_members?.[m.id] || (
                                        round.temp_open_member_id === m.id && round.temp_open_expires_at
                                            ? { expires_at: round.temp_open_expires_at }
                                            : null
                                    )
                                    const hasExt = ext?.expires_at && new Date(ext.expires_at) > currentTime
                                    return (
                                        <div 
                                            key={m.id}
                                            className={`member-pill-chip ${hasExt ? 'status-active' : 'status-normal'}`}
                                        >
                                            <span>{m.full_name || m.name || m.email} {m.member_code ? `(${m.member_code})` : ''}</span>
                                            {hasExt && (
                                                <span style={{ 
                                                    fontSize: '0.7rem', 
                                                    background: '#047857', 
                                                    color: '#fff', 
                                                    padding: '1px 5px', 
                                                    borderRadius: '10px',
                                                    fontWeight: '700'
                                                }}>
                                                    ปิด {formatNormalCloseTime(ext.expires_at)}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRemoveMember(m.id)
                                                }}
                                                title="ลบออกจากรายการที่เลือก"
                                                className="member-chip-remove"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {/* Add Member Dropdown */}
                        {availableMembers.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                                <select
                                    value=""
                                    onChange={e => handleAddMember(e.target.value)}
                                    style={{
                                        flex: 1,
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        color: '#fff',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        padding: '5px 10px',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="" style={{ background: '#1e2230', color: '#94a3b8' }}>
                                        ➕ เลือกเพิ่มสมาชิกรายคน... (เหลืออีก {availableMembers.length} คน)
                                    </option>
                                    {availableMembers.map(m => (
                                        <option key={m.id} value={m.id} style={{ background: '#1e2230', color: '#fff' }}>
                                            👤 {m.full_name || m.name || m.email} {m.member_code ? `(${m.member_code})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Mode Selector Tabs */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.4rem' }}>
                            รูปแบบการกำหนดเวลา:
                        </label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.2)',
                            padding: '3px',
                            borderRadius: '8px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setMode('duration')}
                                style={{
                                    padding: '0.5rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    transition: 'all 0.2s',
                                    background: mode === 'duration' ? 'var(--color-primary, #f59e0b)' : 'transparent',
                                    color: mode === 'duration' ? '#000' : 'var(--color-text-muted, #94a3b8)'
                                }}
                            >
                                กำหนดเป็นระยะเวลา
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('specific_time')}
                                style={{
                                    padding: '0.5rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    transition: 'all 0.2s',
                                    background: mode === 'specific_time' ? 'var(--color-primary, #f59e0b)' : 'transparent',
                                    color: mode === 'specific_time' ? '#000' : 'var(--color-text-muted, #94a3b8)'
                                }}
                            >
                                กำหนดเวลาปิดตรงๆ
                            </button>
                        </div>
                    </div>

                    {/* Mode A: Duration Preset & Custom */}
                    {mode === 'duration' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {/* Base Time Selector if round is still open */}
                            {isRoundBeforeClose && (
                                <div style={{
                                    padding: '0.5rem 0.75rem',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem'
                                }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>ฐานเวลาเริ่มต้น:</span>
                                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: baseTimeMode === 'round_close' ? '#f59e0b' : '#cbd5e1' }}>
                                            <input 
                                                type="radio" 
                                                name="baseTimeMode" 
                                                checked={baseTimeMode === 'round_close'} 
                                                onChange={() => setBaseTimeMode('round_close')} 
                                            />
                                            ยืดจากเวลาปิดปกติ ({formatNormalCloseTime(round.close_time)} น.)
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: baseTimeMode === 'now' ? '#f59e0b' : '#cbd5e1' }}>
                                            <input 
                                                type="radio" 
                                                name="baseTimeMode" 
                                                checked={baseTimeMode === 'now'} 
                                                onChange={() => setBaseTimeMode('now')} 
                                            />
                                            นับจากตอนนี้ ({formatNormalCloseTime(currentTime)} น.)
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                    {isRoundBeforeClose && baseTimeMode === 'round_close' ? 'ยืดเวลาเพิ่มด่วน:' : 'กดเลือกเวลาด่วน:'}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                                {[3, 5, 10, 15].map(mins => (
                                    <button
                                        key={mins}
                                        type="button"
                                        onClick={() => handleQuickPreset(mins)}
                                        style={{
                                            padding: '0.45rem 0.2rem',
                                            borderRadius: '8px',
                                            border: durationMinutes === mins && durationUnit === 'minutes'
                                                ? '1px solid var(--color-primary, #f59e0b)'
                                                : '1px solid rgba(255, 255, 255, 0.1)',
                                            background: durationMinutes === mins && durationUnit === 'minutes'
                                                ? 'rgba(245, 158, 11, 0.2)'
                                                : 'rgba(255, 255, 255, 0.04)',
                                            color: durationMinutes === mins && durationUnit === 'minutes'
                                                ? 'var(--color-primary, #f59e0b)'
                                                : 'var(--color-text, #fff)',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        +{mins} นาที
                                    </button>
                                ))}
                            </div>

                            {/* Custom Number Input */}
                            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem' }}>
                                <input 
                                    type="number"
                                    min="1"
                                    max={durationUnit === 'minutes' ? 120 : 3600}
                                    value={durationMinutes}
                                    onChange={e => setDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{
                                        flex: 1,
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        padding: '0.6rem 0.8rem',
                                        color: '#fff',
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        outline: 'none'
                                    }}
                                />
                                <select
                                    value={durationUnit}
                                    onChange={e => setDurationUnit(e.target.value)}
                                    style={{
                                        width: '100px',
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        padding: '0.6rem 0.5rem',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        fontWeight: 500,
                                        outline: 'none'
                                    }}
                                >
                                    <option value="minutes" style={{ background: '#1e2230', color: '#fff' }}>นาที</option>
                                    <option value="seconds" style={{ background: '#1e2230', color: '#fff' }}>วินาที</option>
                                </select>
                            </div>
                        </div>
                    ) : (
                        /* Mode B: Specific Close Time Picker */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                ระบุเวลาปิดรับสำหรับสมาชิกที่เลือก:
                            </label>
                            <input 
                                type="time"
                                step="60"
                                value={specificTime}
                                onChange={e => setSpecificTime(e.target.value)}
                                style={{
                                    background: 'rgba(0, 0, 0, 0.25)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '8px',
                                    padding: '0.6rem 0.8rem',
                                    color: '#fff',
                                    fontSize: '1.2rem',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}

                    {/* Calculated Target Preview Box */}
                    <div className="member-target-preview">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>🕒 จะปิดรับเวลา:</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-warning, #f59e0b)', fontSize: '1rem' }}>
                                {formatTimeDisplay(targetDate)} น.
                            </span>
                        </div>
                        {isRoundBeforeClose && diffFromNormalCloseMins !== 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.8rem',
                                color: diffFromNormalCloseMins > 0 ? '#10b981' : '#f59e0b'
                            }}>
                                <span>{diffFromNormalCloseMins > 0 ? '➕ ยืดเวลาเพิ่ม:' : '⚠️ ปิดก่อนเวลาปกติ:'}</span>
                                <span style={{ fontWeight: 600 }}>
                                    {diffFromNormalCloseMins > 0 
                                        ? `+${diffFromNormalCloseMins} นาที จากเวลาปิดปกติของงวด`
                                        : `${Math.abs(diffFromNormalCloseMins)} นาที ก่อนเวลาปิดปกติของงวด`}
                                </span>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>⏳ คิดเป็นระยะเวลา:</span>
                            <span style={{ color: 'var(--color-text, #fff)', fontWeight: 500 }}>
                                อีก {targetDiffMins > 0 ? `${targetDiffMins} นาที ` : ''}{targetDiffRemainingSecs} วินาที จากตอนนี้
                            </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.3rem', marginTop: '0.2rem' }}>
                            มีผลกับสมาชิกที่เลือกทั้งหมด: <strong>{selectedMemberIds.length} คน</strong>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="member-extension-footer">
                        {activeSelectedCount > 0 && (
                            <button
                                type="button"
                                onClick={handleRevoke}
                                disabled={isRevoking || isSaving || selectedMemberIds.length === 0}
                                style={{
                                    padding: '0.65rem 0.8rem',
                                    borderRadius: '8px',
                                    border: '1px solid #ef4444',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease'
                                }}
                                title={`ยกเลิกการตั้งเวลาพิเศษสำหรับสมาชิกที่เลือก (${selectedMemberIds.length} คน)`}
                            >
                                <FiTrash2 size={14} /> {isRevoking ? 'กำลังยกเลิก...' : `ยกเลิกสิทธิ์ (${selectedMemberIds.length})`}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving || isRevoking}
                            style={{
                                flex: 1,
                                padding: '0.65rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                background: 'transparent',
                                color: 'var(--color-text, #fff)',
                                fontWeight: 500,
                                fontSize: '0.9rem',
                                cursor: 'pointer'
                            }}
                        >
                            ปิดหน้าต่าง
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || isRevoking || !targetDate || targetDiffSeconds <= 0 || selectedMemberIds.length === 0}
                            style={{
                                flex: 2,
                                padding: '0.65rem 1rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: selectedMemberIds.length === 0 ? 'rgba(255,255,255,0.1)' : '#10b981',
                                color: selectedMemberIds.length === 0 ? 'var(--color-text-muted, #94a3b8)' : '#fff',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                cursor: selectedMemberIds.length === 0 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                boxShadow: selectedMemberIds.length === 0 ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            <FiCheck size={16} /> {isSaving ? 'กำลังบันทึก...' : `บันทึกเวลาปิดรับ (${selectedMemberIds.length} คน)`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
