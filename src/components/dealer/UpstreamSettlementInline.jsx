import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import {
    FiZap,
    FiPlus,
    FiX,
    FiCheck,
    FiTrash2,
    FiCalendar,
    FiFileText,
    FiEdit2
} from 'react-icons/fi'
import {
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance,
    getUpstreamSettlementStatus,
    getUpstreamPaymentPresetAmount
} from '../../utils/memberSettlementCalculator'
import './UpstreamSettlementInline.css'

export default function UpstreamSettlementInline({
    transfer,
    round,
    payments = [],
    onSavePayment,
    onUpdatePayment,
    onDeletePayment,
    onClose
}) {
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    // Edit Modal states
    const [editingPayment, setEditingPayment] = useState(null)
    const [editPaymentType, setEditPaymentType] = useState('net_settlement')
    const [editDirection, setEditDirection] = useState('dealer_to_upstream')
    const [editAmount, setEditAmount] = useState('')
    const [editPaidAt, setEditPaidAt] = useState('')
    const [editNotes, setEditNotes] = useState('')
    const [editSaving, setEditSaving] = useState(false)

    // Form states
    const [paymentType, setPaymentType] = useState('net_settlement') // 'net_settlement' | 'prize_collection'
    const [direction, setDirection] = useState('dealer_to_upstream') // 'dealer_to_upstream' | 'upstream_to_dealer'
    const [amount, setAmount] = useState('')
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    // Upstream Balances
    const initialBalance = calculateUpstreamInitialBalance(transfer)
    const currentBalance = calculateUpstreamCurrentBalance(initialBalance, payments)
    const status = getUpstreamSettlementStatus(currentBalance)

    const netLayoff = Math.round(Number(transfer?.amount || 0) - Number(transfer?.commission_earned || 0))
    const totalWinnings = Math.round(Number(transfer?.winnings || 0))

    // Calculate total payments made
    const paidByDealer = payments
        .filter(p => p.direction === 'dealer_to_upstream')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const paidByUpstream = payments
        .filter(p => p.direction === 'upstream_to_dealer')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)

    const todayStr = new Date().toISOString().split('T')[0]
    const getRoundDateIso = (r) => {
        const raw = r?.round_date || r?.close_time || r?.created_at
        if (!raw) return null
        if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
            return raw.slice(0, 10)
        }
        try {
            const d = new Date(raw)
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear()
                const month = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                return `${year}-${month}-${day}`
            }
        } catch {
            return null
        }
        return null
    }
    const roundDateIso = getRoundDateIso(round)

    // Open form with prefilled defaults
    const handleOpenForm = (type, isTabSwitch = false) => {
        const targetType = type || (totalWinnings > 0 ? 'prize_collection' : 'net_settlement')
        setPaymentType(targetType)

        if (!isTabSwitch) {
            setPaidAt(roundDateIso || todayStr)
            setNotes('โอนแล้ว')
        } else {
            if (!paidAt) setPaidAt(roundDateIso || todayStr)
            if (!notes) setNotes('โอนแล้ว')
        }

        if (targetType === 'prize_collection') {
            setDirection('upstream_to_dealer')
            const presetPrize = getUpstreamPaymentPresetAmount(transfer, payments, 'prize_collection')
            const prizeVal = presetPrize > 0 ? presetPrize : totalWinnings
            setAmount(prizeVal > 0 ? String(prizeVal) : '')
        } else {
            // Net settlement: default direction based on current balance
            // currentBalance >= 0: Dealer owes Upstream -> dealer_to_upstream
            // currentBalance < 0: Upstream owes Dealer -> upstream_to_dealer
            const defDir = currentBalance >= 0 ? 'dealer_to_upstream' : 'upstream_to_dealer'
            setDirection(defDir)
            const presetNet = Math.abs(currentBalance)
            setAmount(presetNet > 0 ? String(presetNet) : '')
        }
        setShowForm(true)
    }

    // Quick Settle Modal states
    const [showQuickSettleModal, setShowQuickSettleModal] = useState(false)
    const [quickPaidAt, setQuickPaidAt] = useState(() => new Date().toISOString().split('T')[0])
    const [quickNotes, setQuickNotes] = useState('เคลียร์ยอดครบจำนวน')

    // Open Quick full settlement modal
    const handleOpenQuickSettle = () => {
        setQuickPaidAt(roundDateIso || todayStr)
        setQuickNotes('เคลียร์ยอดครบจำนวน')
        setShowQuickSettleModal(true)
    }

    // Confirm and save Quick settlement
    const handleConfirmQuickSettle = async (e) => {
        if (e) e.preventDefault()
        if (currentBalance === 0) return
        const defDir = currentBalance > 0 ? 'dealer_to_upstream' : 'upstream_to_dealer'
        const settleAmount = Math.abs(currentBalance)

        setSaving(true)
        try {
            await onSavePayment({
                upstream_dealer_name: transfer.dealerName || 'เจ้ามือรับตีออก',
                upstream_dealer_id: transfer.upstream_dealer_id || null,
                round_id: round.round_id || round.id,
                lottery_type: round.lottery_type,
                round_date: roundDateIso,
                payment_type: 'net_settlement',
                direction: defDir,
                amount: settleAmount,
                paid_at: quickPaidAt || todayStr,
                notes: quickNotes.trim() || 'เคลียร์ยอดครบจำนวน'
            })
            setShowQuickSettleModal(false)
        } catch (err) {
            console.error('Error in handleConfirmQuickSettle upstream:', err)
        } finally {
            setSaving(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const numAmount = Number(amount)
        if (!numAmount || numAmount <= 0) return

        setSaving(true)
        try {
            await onSavePayment({
                upstream_dealer_name: transfer.dealerName || 'เจ้ามือรับตีออก',
                upstream_dealer_id: transfer.upstream_dealer_id || null,
                round_id: round.round_id || round.id,
                lottery_type: round.lottery_type,
                round_date: roundDateIso,
                payment_type: paymentType,
                direction,
                amount: numAmount,
                paid_at: paidAt || todayStr,
                notes: notes.trim() || null
            })
            setShowForm(false)
            setAmount('')
            setNotes('')
        } catch (err) {
            console.error('Error saving upstream payment:', err)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (paymentId) => {
        if (!window.confirm('คุณต้องการลบรายการชำระเงินนี้หรือไม่?')) return
        setDeletingId(paymentId)
        try {
            await onDeletePayment(paymentId)
        } catch (err) {
            console.error('Error deleting upstream payment:', err)
        } finally {
            setDeletingId(null)
        }
    }

    // Handlers for Edit Modal
    const handleOpenEditModal = (p) => {
        setEditingPayment(p)
        setEditPaymentType(p.payment_type || 'net_settlement')
        setEditDirection(p.direction || 'dealer_to_upstream')
        setEditAmount(p.amount ? String(p.amount) : '')
        setEditPaidAt(p.paid_at || todayStr)
        setEditNotes(p.notes || '')
    }

    const handleConfirmEditPayment = async (e) => {
        if (e) e.preventDefault()
        if (!editingPayment) return
        const numAmount = Number(editAmount)
        if (!numAmount || numAmount <= 0) return

        setEditSaving(true)
        try {
            if (onUpdatePayment) {
                const ok = await onUpdatePayment(editingPayment.id, {
                    payment_type: editPaymentType,
                    direction: editDirection,
                    amount: numAmount,
                    paid_at: editPaidAt || todayStr,
                    notes: editNotes.trim()
                })
                if (ok !== false) {
                    setEditingPayment(null)
                }
            }
        } catch (err) {
            console.error('Error confirming edit upstream payment:', err)
        } finally {
            setEditSaving(false)
        }
    }

    const upstreamName = transfer?.dealerName || 'เจ้ามือรับตีออก'

    return (
        <div className="upstream-settlement-inline-container">
            {/* 1. Summary Strip */}
            <div className="upstream-settlement-strip">
                <div className="upstream-strip-col">
                    <span className="upstream-strip-label">ยอดตีออกสุทธิ (หักคอม)</span>
                    <span className="upstream-strip-val" style={{ color: '#ef4444' }}>
                        -฿{netLayoff.toLocaleString()}
                    </span>
                </div>
                <div className="upstream-strip-col">
                    <span className="upstream-strip-label">รับคืนรางวัล</span>
                    <span className="upstream-strip-val" style={{ color: 'var(--color-success)' }}>
                        +฿{totalWinnings.toLocaleString()}
                    </span>
                </div>
                <div className="upstream-strip-col">
                    <span className="upstream-strip-label">ชำระแล้ว (เราจ่าย / เจ้ามือจ่าย)</span>
                    <span className="upstream-strip-val" style={{ fontSize: '0.9rem' }}>
                        ฿{paidByDealer.toLocaleString()} / ฿{paidByUpstream.toLocaleString()}
                    </span>
                </div>
                <div className="upstream-strip-col">
                    <span className="upstream-strip-label">ยอดคงค้างปัจจุบัน</span>
                    <span
                        className="upstream-strip-badge"
                        style={{
                            background: status.badgeBg,
                            color: status.color,
                            border: `1px solid ${status.badgeBorder}`
                        }}
                    >
                        {status.formattedText} {status.partyWhoOwes === 'dealer' ? '(เราค้างเจ้ามือ)' : (status.partyWhoOwes === 'upstream' ? '(เจ้ามือค้างเรา)' : '')}
                    </span>
                </div>
            </div>

            {/* 2. Action Buttons Header */}
            <div className="upstream-settlement-actions-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    จัดการการชำระเงินสำหรับ: <strong>{upstreamName}</strong>
                </span>
                <div className="upstream-settlement-btn-group">
                    {!status.isSettled && (
                        <button
                            type="button"
                            className="btn-upstream-settle-action btn-upstream-settle-quick"
                            onClick={handleOpenQuickSettle}
                            disabled={saving}
                            title="ระบุวันที่/หมายเหตุ และบันทึกชำระยอดคงค้างครบจำนวน"
                        >
                            <FiZap size={14} /> ⚡ เคลียร์ครบ ({status.formattedText})
                        </button>
                    )}
                    <button
                        type="button"
                        className={`btn-upstream-settle-action btn-upstream-settle-add ${showForm ? 'active' : ''}`}
                        onClick={() => {
                            if (showForm) {
                                setShowForm(false)
                            } else {
                                handleOpenForm()
                            }
                        }}
                    >
                        {showForm ? <FiX size={14} /> : <FiPlus size={14} />}
                        {showForm ? 'ปิดฟอร์ม' : '+ บันทึกการจ่าย/รับเงิน'}
                    </button>
                </div>
            </div>

            {/* 3. Inline Payment Form */}
            {showForm && (
                <form className="upstream-settlement-form-box" onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                            📝 บันทึกรายการเงิน
                        </span>
                        {totalWinnings > 0 && (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button
                                    type="button"
                                    className="upstream-preset-pill-btn"
                                    style={{
                                        background: paymentType === 'net_settlement' ? 'var(--color-primary)' : undefined,
                                        color: paymentType === 'net_settlement' ? '#000' : undefined,
                                        fontWeight: paymentType === 'net_settlement' ? 700 : 400
                                    }}
                                    onClick={() => handleOpenForm('net_settlement', true)}
                                >
                                    เคลียร์ยอดสุทธิ
                                </button>
                                <button
                                    type="button"
                                    className="upstream-preset-pill-btn"
                                    style={{
                                        background: paymentType === 'prize_collection' ? 'var(--color-success)' : undefined,
                                        color: paymentType === 'prize_collection' ? '#fff' : undefined,
                                        fontWeight: paymentType === 'prize_collection' ? 700 : 400
                                    }}
                                    onClick={() => handleOpenForm('prize_collection', true)}
                                >
                                    รับคืนเงินรางวัล
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="upstream-settlement-form-grid">
                        {/* Direction selector (only if net_settlement) */}
                        {paymentType === 'net_settlement' ? (
                            <div className="upstream-settlement-form-field">
                                <label>ทิศทางการเงิน</label>
                                <select
                                    value={direction}
                                    onChange={(e) => setDirection(e.target.value)}
                                >
                                    <option value="dealer_to_upstream">🔴 เราจ่ายให้เจ้ามือรับตีออก (เคลียร์ยอด)</option>
                                    <option value="upstream_to_dealer">🟢 เจ้ามือรับตีออกจ่ายคืนเรา (รับชำระ)</option>
                                </select>
                            </div>
                        ) : (
                            <div className="upstream-settlement-form-field">
                                <label>ประเภท</label>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600, paddingTop: '0.4rem' }}>
                                    🎁 เจ้ามือรับตีออกจ่ายคืนเงินรางวัล
                                </div>
                            </div>
                        )}

                        {/* Amount */}
                        <div className="upstream-settlement-form-field">
                            <label>จำนวนเงิน (บาท) *</label>
                            <input
                                type="number"
                                min="0.01"
                                step="any"
                                required
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                autoFocus
                            />
                            <div className="upstream-settlement-presets">
                                {Math.abs(currentBalance) > 0 && (
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${Number(amount) === Math.abs(currentBalance) ? 'active' : ''}`}
                                        onClick={() => setAmount(String(Math.abs(currentBalance)))}
                                    >
                                        ยอดคงค้าง ฿{Math.abs(currentBalance).toLocaleString()}
                                    </button>
                                )}
                                {totalWinnings > 0 && (
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${Number(amount) === totalWinnings ? 'active' : ''}`}
                                        onClick={() => setAmount(String(totalWinnings))}
                                    >
                                        รับคืนรางวัล ฿{totalWinnings.toLocaleString()}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Date */}
                        <div className="upstream-settlement-form-field">
                            <label>วันที่จ่าย</label>
                            <input
                                type="date"
                                value={paidAt}
                                onChange={(e) => setPaidAt(e.target.value)}
                            />
                            <div className="upstream-settlement-presets">
                                <button
                                    type="button"
                                    className={`upstream-preset-pill-btn ${paidAt === todayStr ? 'active' : ''}`}
                                    onClick={() => setPaidAt(todayStr)}
                                >
                                    วันนี้
                                </button>
                                {roundDateIso && (
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${paidAt === roundDateIso ? 'active' : ''}`}
                                        onClick={() => setPaidAt(roundDateIso)}
                                        title={`วันที่งวดหวย (${roundDateIso})`}
                                    >
                                        วันที่งวดหวย
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="upstream-settlement-form-field">
                            <label>หมายเหตุ (ถ้ามี)</label>
                            <input
                                type="text"
                                placeholder="เช่น โอน SCB, เงินสด"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                            <div className="upstream-settlement-presets">
                                <button
                                    type="button"
                                    className={`upstream-preset-pill-btn ${notes === 'โอนแล้ว' ? 'active' : ''}`}
                                    onClick={() => setNotes('โอนแล้ว')}
                                >
                                    โอนแล้ว
                                </button>
                                <button
                                    type="button"
                                    className={`upstream-preset-pill-btn ${notes === 'เงินสด' ? 'active' : ''}`}
                                    onClick={() => setNotes('เงินสด')}
                                >
                                    เงินสด
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="upstream-settlement-form-actions">
                        <button
                            type="button"
                            className="btn-upstream-settle-action btn-upstream-settle-add"
                            onClick={() => setShowForm(false)}
                            disabled={saving}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn-upstream-settle-action btn-upstream-settle-quick"
                            disabled={saving || !Number(amount)}
                        >
                            <FiCheck size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                        </button>
                    </div>
                </form>
            )}

            {/* 4. Payment History Logs */}
            <div className="upstream-settlement-logs-container">
                <span className="upstream-settlement-logs-title">
                    <FiFileText size={14} /> ประวัติการรับ-จ่ายเงินในงวดนี้ ({payments.length} รายการ)
                </span>

                {payments.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
                        ยังไม่มีบันทึกการชำระเงินสำหรับเจ้ามือรับตีออกรายนี้
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="upstream-settlement-logs-table">
                            <thead>
                                <tr>
                                    <th>วันที่จ่าย</th>
                                    <th>ประเภท</th>
                                    <th>ทิศทาง</th>
                                    <th style={{ textAlign: 'right' }}>จำนวนเงิน</th>
                                    <th>หมายเหตุ</th>
                                    <th style={{ textAlign: 'center' }}>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((p) => {
                                    const isDealerPay = p.direction === 'dealer_to_upstream'
                                    return (
                                        <tr key={p.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {p.paid_at ? new Date(p.paid_at).toLocaleDateString('th-TH') : '-'}
                                            </td>
                                            <td>
                                                {p.payment_type === 'prize_collection' ? (
                                                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                        รับคืนรางวัล
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-primary)' }}>
                                                        เคลียร์ยอดสุทธิ
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ color: isDealerPay ? '#ef4444' : 'var(--color-success)', fontWeight: 600 }}>
                                                    {isDealerPay ? '🔴 เราจ่ายให้เจ้ามือ' : '🟢 เจ้ามือจ่ายเรา'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: isDealerPay ? '#ef4444' : 'var(--color-success)' }}>
                                                {isDealerPay ? '-฿' : '+฿'}{Number(p.amount || 0).toLocaleString()}
                                            </td>
                                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                                                {p.notes || '-'}
                                            </td>
                                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <button
                                                        type="button"
                                                        className="upstream-btn-log-edit"
                                                        title="แก้ไขรายการนี้"
                                                        onClick={() => handleOpenEditModal(p)}
                                                    >
                                                        <FiEdit2 size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="upstream-btn-log-del"
                                                        title="ลบรายการนี้"
                                                        disabled={deletingId === p.id}
                                                        onClick={() => handleDelete(p.id)}
                                                    >
                                                        <FiTrash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 5. Quick Settle Confirmation Modal */}
            {showQuickSettleModal && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        boxSizing: 'border-box'
                    }}
                    onClick={() => !saving && setShowQuickSettleModal(false)}
                >
                    <div
                        className="upstream-quick-settle-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h3>
                                <FiZap color="#10b981" /> ยืนยันเคลียร์ยอดคงค้างครบจำนวน
                            </h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !saving && setShowQuickSettleModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmQuickSettle} className="modal-body">
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                                    เจ้ามือรับตีออก: <strong style={{ color: '#fff' }}>{upstreamName}</strong>
                                </div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                                    ทิศทางการเงิน: <strong style={{ color: currentBalance > 0 ? '#ef4444' : 'var(--color-success)' }}>
                                        {currentBalance > 0 ? '🔴 เราจ่ายให้เจ้ามือรับตีออก' : '🟢 เจ้ามือรับตีออกจ่ายคืนเรา'}
                                    </strong>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>ยอดเงินที่จะบันทึกเคลียร์:</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: currentBalance > 0 ? '#ef4444' : 'var(--color-success)' }}>
                                        ฿{Math.abs(currentBalance).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Date Field with Presets */}
                            <div className="upstream-settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
                                    <FiCalendar size={13} /> วันที่ชำระ
                                </label>
                                <input
                                    type="date"
                                    value={quickPaidAt}
                                    onChange={(e) => setQuickPaidAt(e.target.value)}
                                    required
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                />
                                <div className="upstream-settlement-presets">
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${quickPaidAt === todayStr ? 'active' : ''}`}
                                        onClick={() => setQuickPaidAt(todayStr)}
                                    >
                                        วันนี้
                                    </button>
                                    {roundDateIso && (
                                        <button
                                            type="button"
                                            className={`upstream-preset-pill-btn ${quickPaidAt === roundDateIso ? 'active' : ''}`}
                                            onClick={() => setQuickPaidAt(roundDateIso)}
                                            title={`วันที่งวดหวย (${roundDateIso})`}
                                        >
                                            วันที่งวดหวย
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Notes Field with Presets */}
                            <div className="upstream-settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
                                    <FiFileText size={13} /> หมายเหตุ
                                </label>
                                <input
                                    type="text"
                                    placeholder="ระบุหมายเหตุ เช่น โอนเงินแล้ว"
                                    value={quickNotes}
                                    onChange={(e) => setQuickNotes(e.target.value)}
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                />
                                <div className="upstream-settlement-presets">
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${quickNotes === 'เคลียร์ยอดครบจำนวน' ? 'active' : ''}`}
                                        onClick={() => setQuickNotes('เคลียร์ยอดครบจำนวน')}
                                    >
                                        เคลียร์ยอดครบจำนวน
                                    </button>
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${quickNotes === 'โอนแล้ว' ? 'active' : ''}`}
                                        onClick={() => setQuickNotes('โอนแล้ว')}
                                    >
                                        โอนแล้ว
                                    </button>
                                    <button
                                        type="button"
                                        className={`upstream-preset-pill-btn ${quickNotes === 'เงินสด' ? 'active' : ''}`}
                                        onClick={() => setQuickNotes('เงินสด')}
                                    >
                                        เงินสด
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.35rem' }}>
                                <button
                                    type="button"
                                    className="btn-upstream-settle-action btn-upstream-settle-add"
                                    onClick={() => setShowQuickSettleModal(false)}
                                    disabled={saving}
                                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn-upstream-settle-action btn-upstream-settle-quick"
                                    disabled={saving}
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}
                                >
                                    <FiCheck size={14} /> {saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึกเคลียร์ยอด'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* 6. Edit Payment Modal */}
            {editingPayment && typeof document !== 'undefined' && createPortal(
                <div 
                    className="modal-overlay nested" 
                    style={{ zIndex: 99999 }}
                    onClick={() => setEditingPayment(null)}
                >
                    <div 
                        className="modal modal-sm" 
                        style={{
                            background: '#0f172a',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                            color: '#f8fafc',
                            width: '90%',
                            maxWidth: '440px',
                            overflow: 'hidden',
                            padding: '1.25rem'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <FiEdit2 style={{ color: 'var(--color-primary, #facc15)' }} /> แก้ไขรายการชำระเงิน
                            </h3>
                            <button
                                type="button"
                                onClick={() => setEditingPayment(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmEditPayment} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {/* Summary info */}
                            <div style={{
                                background: 'rgba(0,0,0,0.35)',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>เจ้ามือรับตีออก:</span>
                                    <span style={{ fontWeight: 600 }}>{transfer?.dealerName || 'เจ้ามือรับตีออก'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>ประเภท:</span>
                                    <span style={{ fontWeight: 600, color: editPaymentType === 'prize_collection' ? 'var(--color-success)' : 'var(--color-primary)' }}>
                                        {editPaymentType === 'prize_collection' ? '🏆 รับคืนรางวัล' : 'เคลียร์ยอดสุทธิ'}
                                    </span>
                                </div>
                            </div>

                            {/* Payment type switcher (if totalWinnings > 0) */}
                            {totalWinnings > 0 && (
                                <div className="upstream-settlement-form-field">
                                    <label>ประเภทรายการ</label>
                                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                                        <button
                                            type="button"
                                            className="preset-pill-btn"
                                            style={{
                                                background: editPaymentType === 'net_settlement' ? 'var(--color-primary)' : undefined,
                                                color: editPaymentType === 'net_settlement' ? '#000' : undefined,
                                                fontWeight: editPaymentType === 'net_settlement' ? 700 : 400
                                            }}
                                            onClick={() => {
                                                setEditPaymentType('net_settlement')
                                                const defDir = currentBalance >= 0 ? 'dealer_to_upstream' : 'upstream_to_dealer'
                                                setEditDirection(defDir)
                                            }}
                                        >
                                            เคลียร์ยอดสุทธิ
                                        </button>
                                        <button
                                            type="button"
                                            className="preset-pill-btn"
                                            style={{
                                                background: editPaymentType === 'prize_collection' ? 'var(--color-success)' : undefined,
                                                color: editPaymentType === 'prize_collection' ? '#fff' : undefined,
                                                fontWeight: editPaymentType === 'prize_collection' ? 700 : 400
                                            }}
                                            onClick={() => {
                                                setEditPaymentType('prize_collection')
                                                setEditDirection('upstream_to_dealer')
                                            }}
                                        >
                                            รับคืนเงินรางวัล
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Direction selector */}
                            {editPaymentType === 'net_settlement' ? (
                                <div className="upstream-settlement-form-field">
                                    <label>ทิศทางการเงิน</label>
                                    <select
                                        value={editDirection}
                                        onChange={(e) => setEditDirection(e.target.value)}
                                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                    >
                                        <option value="dealer_to_upstream">🔴 เราจ่ายให้เจ้ามือรับตีออก</option>
                                        <option value="upstream_to_dealer">🟢 เจ้ามือรับตีออกจ่ายคืนเรา</option>
                                    </select>
                                </div>
                            ) : (
                                <div className="upstream-settlement-form-field">
                                    <label>ทิศทางการเงิน</label>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600 }}>
                                        🟢 เจ้ามือรับตีออกจ่ายคืนเรา (รับคืนรางวัล)
                                    </div>
                                </div>
                            )}

                            {/* Amount */}
                            <div className="upstream-settlement-form-field">
                                <label>จำนวนเงิน (บาท) *</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    required
                                    placeholder="0.00"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                />
                                <div className="upstream-settlement-presets">
                                    {Math.abs(currentBalance) > 0 && (
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${Number(editAmount) === Math.abs(currentBalance) ? 'active' : ''}`}
                                            onClick={() => setEditAmount(String(Math.abs(currentBalance)))}
                                        >
                                            ยอดคงค้าง ฿{Math.abs(currentBalance).toLocaleString()}
                                        </button>
                                    )}
                                    {totalWinnings > 0 && (
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${Number(editAmount) === totalWinnings ? 'active' : ''}`}
                                            onClick={() => setEditAmount(String(totalWinnings))}
                                        >
                                            รับคืนรางวัล ฿{totalWinnings.toLocaleString()}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Date */}
                            <div className="upstream-settlement-form-field">
                                <label>วันที่ชำระ</label>
                                <input
                                    type="date"
                                    value={editPaidAt}
                                    onChange={(e) => setEditPaidAt(e.target.value)}
                                    required
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                />
                                <div className="upstream-settlement-presets">
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${editPaidAt === todayStr ? 'active' : ''}`}
                                        onClick={() => setEditPaidAt(todayStr)}
                                    >
                                        วันนี้
                                    </button>
                                    {roundDateIso && (
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${editPaidAt === roundDateIso ? 'active' : ''}`}
                                            onClick={() => setEditPaidAt(roundDateIso)}
                                            title={`วันที่งวดหวย (${roundDateIso})`}
                                        >
                                            วันที่งวดหวย
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="upstream-settlement-form-field">
                                <label>หมายเหตุ</label>
                                <input
                                    type="text"
                                    placeholder="เช่น โอนแล้ว, เงินสด"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                />
                                <div className="upstream-settlement-presets">
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${editNotes === 'โอนแล้ว' ? 'active' : ''}`}
                                        onClick={() => setEditNotes('โอนแล้ว')}
                                    >
                                        โอนแล้ว
                                    </button>
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${editNotes === 'เงินสด' ? 'active' : ''}`}
                                        onClick={() => setEditNotes('เงินสด')}
                                    >
                                        เงินสด
                                    </button>
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${editNotes === 'เคลียร์ยอดครบจำนวน' ? 'active' : ''}`}
                                        onClick={() => setEditNotes('เคลียร์ยอดครบจำนวน')}
                                    >
                                        เคลียร์ยอดครบจำนวน
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.35rem' }}>
                                <button
                                    type="button"
                                    className="btn-upstream-settle-action btn-upstream-settle-add"
                                    onClick={() => setEditingPayment(null)}
                                    disabled={editSaving}
                                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn-upstream-settle-action btn-upstream-settle-quick"
                                    disabled={editSaving || !Number(editAmount)}
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.82rem' }}
                                >
                                    <FiCheck size={14} /> {editSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
