import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FiZap, FiX, FiCheck, FiCalendar, FiDollarSign, FiFileText } from 'react-icons/fi'
import { calculateOffsetSummary, allocateCrossRoundOffsetPayments } from '../../utils/crossRoundOffsetCalculator'
import './CrossRoundOffsetModal.css'

export default function CrossRoundOffsetModal({
    isOpen,
    onClose,
    onConfirmOffset,
    currentRound,
    member,
    pastUnpaidRounds = [],
    currentWinnings = 0,
    isUpstream = false,
    upstreamDealerName = null
}) {
    if (!isOpen || typeof document === 'undefined') return null

    // Sort past unpaid rounds chronologically (oldest first)
    const sortedPastRounds = useMemo(() => {
        return [...pastUnpaidRounds].sort((a, b) => {
            const dateA = a.roundDate || a.round_date || ''
            const dateB = b.roundDate || b.round_date || ''
            return dateA.localeCompare(dateB)
        })
    }, [pastUnpaidRounds])

    // Default select all past unpaid rounds
    const [selectedRoundIds, setSelectedRoundIds] = useState(() =>
        sortedPastRounds.map(r => r.roundId)
    )
    const [customSlipAmount, setCustomSlipAmount] = useState('')
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().split('T')[0])
    const [customNotes, setCustomNotes] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset selection if pastUnpaidRounds change
    useEffect(() => {
        setSelectedRoundIds(sortedPastRounds.map(r => r.roundId))
    }, [sortedPastRounds])

    // Keyboard escape listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !saving) {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [saving, onClose])

    // Calculate selected past debt
    const selectedPastRounds = useMemo(() => {
        return sortedPastRounds.filter(r => selectedRoundIds.includes(r.roundId))
    }, [sortedPastRounds, selectedRoundIds])

    const pastDebtTotal = useMemo(() => {
        return selectedPastRounds.reduce((sum, r) => sum + Math.max(0, Number(r.debt || 0)), 0)
    }, [selectedPastRounds])

    const summary = useMemo(() => {
        return calculateOffsetSummary({
            pastDebtTotal,
            prizeAmount: currentWinnings
        })
    }, [pastDebtTotal, currentWinnings])

    const activeSlipAmount = customSlipAmount !== '' ? Number(customSlipAmount) : summary.suggestedSlipAmount

    const toggleRound = (roundId) => {
        setSelectedRoundIds(prev =>
            prev.includes(roundId) ? prev.filter(id => id !== roundId) : [...prev, roundId]
        )
    }

    const toggleSelectAll = () => {
        if (selectedRoundIds.length === sortedPastRounds.length) {
            setSelectedRoundIds([])
        } else {
            setSelectedRoundIds(sortedPastRounds.map(r => r.roundId))
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (selectedPastRounds.length === 0 || saving) return

        const targetUpstreamName = upstreamDealerName || member?.name || member?.user_name || member?.dealerName

        const allocations = allocateCrossRoundOffsetPayments({
            selectedPastRounds,
            offsetPrizeAmount: currentWinnings,
            actualSlipAmount: activeSlipAmount,
            paidAt,
            currentRound,
            memberUserId: member?.user_id,
            dealerId: member?.dealer_id,
            isUpstream,
            upstreamDealerName: targetUpstreamName,
            upstreamDealerId: member?.upstream_dealer_id || null
        })

        if (customNotes && customNotes.trim()) {
            const noteText = customNotes.trim()
            allocations.currentRoundPayment.notes += ` (${noteText})`
            allocations.pastRoundPayments.forEach(p => {
                p.notes += ` (${noteText})`
            })
        }

        setSaving(true)
        try {
            await onConfirmOffset(allocations)
            onClose()
        } catch (err) {
            console.error('Error confirming cross-round offset:', err)
        } finally {
            setSaving(false)
        }
    }

    const targetDisplayName = member?.name || member?.user_name || member?.dealerName || (isUpstream ? 'เจ้ามือรับตีออก' : 'สมาชิก')

    return createPortal(
        <div
            className="modal-overlay nested"
            style={{
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.75rem',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)'
            }}
            onClick={() => !saving && onClose()}
        >
            <div className="cross-round-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <FiZap color="#facc15" /> หักล้างยอดข้ามงวด (Cross-Round Offset)
                    </h3>
                    <button
                        type="button"
                        className="modal-close"
                        onClick={() => !saving && onClose()}
                        title="ปิด"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="modal-body">
                        {/* Target Info & Prize Available */}
                        <div className="cross-round-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                            <div>
                                <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>{isUpstream ? 'เจ้ามือรับตีออก: ' : 'สมาชิก: '}</span>
                                <strong>{targetDisplayName}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>{isUpstream ? 'ยอดถูกที่นำมาหักล้าง: ' : 'รางวัลงวดนี้ที่นำมาหักล้าง: '}</span>
                                <strong style={{ color: 'var(--color-primary, #facc15)', fontSize: '0.9rem' }}>฿{Number(currentWinnings).toLocaleString()}</strong>
                            </div>
                        </div>

                        {/* Past Rounds Selector */}
                        <div className="cross-round-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)' }}>
                                    เลือกงวดเก่าที่ต้องการหักล้าง ({selectedRoundIds.length}/{sortedPastRounds.length})
                                </label>
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-primary, #facc15)',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        padding: '0 0.2rem'
                                    }}
                                >
                                    {selectedRoundIds.length === sortedPastRounds.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                </button>
                            </div>

                            <div className="past-rounds-list">
                                {sortedPastRounds.map(r => {
                                    const isChecked = selectedRoundIds.includes(r.roundId)
                                    return (
                                        <div
                                            key={r.roundId}
                                            className={`past-round-row ${isChecked ? 'selected' : ''}`}
                                            onClick={() => toggleRound(r.roundId)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {}}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span>งวดวันที่ <strong>{r.roundDate || r.round_date}</strong></span>
                                            </div>
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                                ค้าง ฿{Number(r.debt).toLocaleString()}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Offset Calculation Box */}
                        <div className="cross-round-box" style={{ background: 'rgba(250, 204, 21, 0.05)', borderColor: 'rgba(250, 204, 21, 0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                <span>รวมหนี้เก่าที่เลือก:</span>
                                <span>฿{pastDebtTotal.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)', marginTop: '0.2rem' }}>
                                <span>หักลบเงินรางวัลงวดนี้:</span>
                                <span style={{ color: 'var(--color-primary, #facc15)' }}>-฿{Number(currentWinnings).toLocaleString()}</span>
                            </div>
                            <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    {!isUpstream ? (
                                        <>
                                            {summary.direction === 'member_to_dealer' && '🟢 สมาชิกต้องโอนชำระเพิ่ม:'}
                                            {summary.direction === 'dealer_to_member' && '🔴 เจ้ามือต้องโอนคืนสมาชิก:'}
                                            {summary.direction === 'even' && '⚪ ยอดหักล้างกันพอดี (ไม่ต้องโอน):'}
                                        </>
                                    ) : (
                                        <>
                                            {summary.direction === 'member_to_dealer' && '🔴 เจ้ามือต้องโอนชำระเพิ่ม:'}
                                            {summary.direction === 'dealer_to_member' && '🟢 เจ้ามือรับตีออกต้องโอนจ่าย:'}
                                            {summary.direction === 'even' && '⚪ ยอดหักล้างกันพอดี (ไม่ต้องโอน):'}
                                        </>
                                    )}
                                </span>
                                <span style={{
                                    fontSize: '1.1rem',
                                    fontWeight: 800,
                                    color: summary.direction === 'even' ? '#f8fafc' : 'var(--color-warning, #f59e0b)'
                                }}>
                                    ฿{Math.abs(summary.netDifference).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Actual Slip Amount & Date (2 columns) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                            <div className="settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                                    <FiDollarSign /> จำนวนเงินตามสลิปจริง (บาท)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={customSlipAmount !== '' ? customSlipAmount : summary.suggestedSlipAmount}
                                    onChange={e => setCustomSlipAmount(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.38rem 0.55rem',
                                        fontSize: '0.85rem',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '6px',
                                        color: '#f8fafc'
                                    }}
                                />
                            </div>
                            <div className="settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                                    <FiCalendar /> วันที่ชำระ
                                </label>
                                <input
                                    type="date"
                                    value={paidAt}
                                    onChange={e => setPaidAt(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.38rem 0.55rem',
                                        fontSize: '0.85rem',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '6px',
                                        color: '#f8fafc'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="settlement-form-field">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                                <FiFileText /> หมายเหตุเพิ่มเติม (ระบุหรือไม่ก็ได้)
                            </label>
                            <input
                                type="text"
                                placeholder="เช่น โอนผ่าน KBank สลิปเวลา 14:20"
                                value={customNotes}
                                onChange={e => setCustomNotes(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.38rem 0.55rem',
                                    fontSize: '0.85rem',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '6px',
                                    color: '#f8fafc'
                                }}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={onClose}
                            disabled={saving}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={saving || selectedPastRounds.length === 0}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                        >
                            <FiCheck size={14} /> {saving ? 'กำลังบันทึก...' : `ยืนยันหักล้างยอด (${selectedPastRounds.length} งวด)`}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
