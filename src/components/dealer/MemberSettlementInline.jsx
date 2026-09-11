import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
    FiPlus,
    FiTrash2,
    FiCheck,
    FiX,
    FiZap,
    FiCalendar,
    FiDollarSign,
    FiFileText,
    FiEdit2,
    FiSend
} from 'react-icons/fi'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    getMemberSettlementStatus,
    getPaymentPresetAmount
} from '../../utils/memberSettlementCalculator'
import { findMemberPastUnpaidRounds, getRoundCloseDate } from '../../utils/crossRoundOffsetCalculator'
import CrossRoundOffsetModal from './CrossRoundOffsetModal'
import PaymentNoticeModal from './PaymentNoticeModal'
import './MemberSettlementInline.css'

export default function MemberSettlementInline({
    member,
    round,
    payments = [],
    settlementOverview,
    roundHistory = [],
    dealerId,
    onSavePayment,
    onUpdatePayment,
    onDeletePayment,
    onCrossRoundOffset,
    onClose
}) {
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    // Edit Modal states
    const [editingPayment, setEditingPayment] = useState(null)
    const [editPaymentType, setEditPaymentType] = useState('net_settlement')
    const [editDirection, setEditDirection] = useState('member_to_dealer')
    const [editAmount, setEditAmount] = useState('')
    const [editPaidAt, setEditPaidAt] = useState('')
    const [editNotes, setEditNotes] = useState('')
    const [editSaving, setEditSaving] = useState(false)

    // Form states
    const [paymentType, setPaymentType] = useState('net_settlement') // 'net_settlement' | 'prize_payout'
    const [direction, setDirection] = useState('member_to_dealer') // 'member_to_dealer' | 'dealer_to_member'
    const [amount, setAmount] = useState('')
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    // Balances
    const initialBalance = calculateMemberInitialBalance(member)
    const currentBalance = calculateMemberCurrentBalance(initialBalance, payments)
    const status = getMemberSettlementStatus(currentBalance)

    const netBetAmount = Math.round((member?.total_amount || 0) - (member?.total_commission || 0))
    const totalWinnings = Math.round(member?.total_winnings || 0)

    // Calculate total payments made
    const paidByMember = payments
        .filter(p => p.direction === 'member_to_dealer')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const paidByDealer = payments
        .filter(p => p.direction === 'dealer_to_member')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)

    // Prize already paid in current round
    const prizePaid = useMemo(() => {
        return payments
            .filter(p => p.direction === 'dealer_to_member' || p.payment_type === 'prize_payout')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    }, [payments])

    // Available prize from current round that can be used for cross-round offset
    const availableWinnings = Math.max(0, Math.round(totalWinnings - prizePaid))

    const todayStr = new Date().toISOString().split('T')[0]
    const getRoundDateIso = (r) => {
        if (!r) return null
        return getRoundCloseDate(r) || null
    }
    const roundDateIso = getRoundDateIso(round)

    // Cross-round offset detection
    const [showOffsetModal, setShowOffsetModal] = useState(false)
    const [showPaymentNoticeModal, setShowPaymentNoticeModal] = useState(false)

    const pastUnpaidRounds = useMemo(() => {
        return findMemberPastUnpaidRounds({
            userId: member?.user_id,
            currentRoundId: round?.round_id || round?.id,
            currentRoundDate: roundDateIso,
            userHistories: settlementOverview?.userHistories || [],
            memberPayments: settlementOverview?.memberPayments || [],
            roundHistory: roundHistory || []
        })
    }, [member?.user_id, round, roundDateIso, settlementOverview, roundHistory])

    const pastDebtsTotal = useMemo(() => {
        return pastUnpaidRounds
            .filter(r => Number(r.debt || 0) > 0)
            .reduce((sum, r) => sum + Number(r.debt || 0), 0)
    }, [pastUnpaidRounds])

    const pastPrizesTotal = useMemo(() => {
        return pastUnpaidRounds
            .filter(r => Number(r.debt || 0) < 0)
            .reduce((sum, r) => sum + Math.abs(Number(r.debt || 0)), 0)
    }, [pastUnpaidRounds])

    const pastDebtTotal = useMemo(() => {
        return pastUnpaidRounds.reduce((sum, r) => sum + (Number(r.debt) || 0), 0)
    }, [pastUnpaidRounds])

    // Open form with prefilled defaults
    const handleOpenForm = (type, isTabSwitch = false) => {
        const targetType = type || (totalWinnings > 0 ? 'prize_payout' : 'net_settlement')
        setPaymentType(targetType)

        if (!isTabSwitch) {
            setPaidAt(roundDateIso || todayStr)
            setNotes('โอนแล้ว')
        } else {
            if (!paidAt) setPaidAt(roundDateIso || todayStr)
            if (!notes) setNotes('โอนแล้ว')
        }

        if (targetType === 'prize_payout') {
            setDirection('dealer_to_member')
            const presetPrize = getPaymentPresetAmount(member, payments, 'prize_payout', 'dealer_to_member')
            const prizeVal = presetPrize > 0 ? presetPrize : totalWinnings
            setAmount(prizeVal > 0 ? String(prizeVal) : '')
        } else {
            // Net settlement: default direction based on current balance
            const defDir = currentBalance >= 0 ? 'member_to_dealer' : 'dealer_to_member'
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
        setQuickPaidAt(todayStr)
        setQuickNotes('เคลียร์ยอดครบจำนวน')
        setShowQuickSettleModal(true)
    }

    // Confirm and save Quick settlement
    const handleConfirmQuickSettle = async (e) => {
        if (e) e.preventDefault()
        if (currentBalance === 0) return
        const defDir = currentBalance > 0 ? 'member_to_dealer' : 'dealer_to_member'
        const settleAmount = Math.abs(currentBalance)

        setSaving(true)
        try {
            await onSavePayment({
                user_id: member.user_id,
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
            console.error('Error in handleConfirmQuickSettle:', err)
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
                user_id: member.user_id,
                round_id: round.round_id || round.id,
                lottery_type: round.lottery_type,
                round_date: roundDateIso,
                payment_type: paymentType,
                direction: direction,
                amount: numAmount,
                paid_at: paidAt || todayStr,
                notes: notes.trim()
            })
            setShowForm(false)
            setAmount('')
            setNotes('')
        } catch (err) {
            console.error('Error saving settlement payment:', err)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (paymentId) => {
        if (!window.confirm('ยืนยันการลบรายการชำระเงินนี้? ยอดคงค้างจะถูกปรับปรุงย้อนกลับ')) return
        setDeletingId(paymentId)
        try {
            await onDeletePayment(paymentId)
        } finally {
            setDeletingId(null)
        }
    }

    // Handlers for Edit Modal
    const handleOpenEditModal = (p) => {
        setEditingPayment(p)
        setEditPaymentType(p.payment_type || 'net_settlement')
        setEditDirection(p.direction || 'member_to_dealer')
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
            console.error('Error confirming edit payment:', err)
        } finally {
            setEditSaving(false)
        }
    }

    const memberName = member?.profiles?.full_name || member?.profiles?.line_display_name || member?.profiles?.email || 'สมาชิก'

    return (
        <div className="member-settlement-inline">
            {/* 1. Summary Strip */}
            <div className="settlement-summary-strip">
                <div className="settlement-summary-item">
                    <span className="label">ยอดส่งสุทธิ (หักคอม)</span>
                    <span className="value">฿{netBetAmount.toLocaleString()}</span>
                </div>
                <div className="settlement-summary-item">
                    <span className="label">เงินถูกรางวัล</span>
                    <span className="value" style={{ color: totalWinnings > 0 ? 'var(--color-danger)' : 'inherit' }}>
                        ฿{totalWinnings.toLocaleString()}
                    </span>
                </div>
                <div className="settlement-summary-item">
                    <span className="label">ชำระแล้ว (ผู้ส่ง / เจ้ามือ)</span>
                    <span className="value" style={{ fontSize: '0.85rem' }}>
                        ฿{paidByMember.toLocaleString()} / ฿{paidByDealer.toLocaleString()}
                    </span>
                </div>
                <div className="settlement-summary-item">
                    <span className="label">ยอดคงค้างปัจจุบัน</span>
                    <span
                        className="settlement-balance-badge"
                        style={{
                            background: status.badgeBg,
                            border: `1px solid ${status.badgeBorder}`,
                            color: status.color
                        }}
                    >
                        {status.formattedText} ({status.label})
                    </span>
                </div>
            </div>

            {/* Smart Detection Banner for Payment Notice: strictly requires both past debt and current round debt/outstanding */}
            {pastUnpaidRounds.length > 0 && currentBalance !== 0 && (
                <div className="cross-round-smart-banner">
                    <div className="banner-left">
                        <span className="banner-icon"><FiZap color="#facc15" size={18} /></span>
                        <div className="banner-text">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <strong>ตรวจพบยอดคงค้างจากงวดก่อนหน้า</strong>
                                <span className="banner-count-badge">{pastUnpaidRounds.length} งวด</span>
                            </div>
                            <span>
                                {pastDebtsTotal > 0 && pastPrizesTotal > 0 ? (
                                    <>
                                        มียอดค้างชำระ <strong style={{ color: '#ef4444' }}>฿{pastDebtsTotal.toLocaleString()}</strong> และค้างจ่ายรางวัลเก่า <strong style={{ color: '#22c55e' }}>฿{pastPrizesTotal.toLocaleString()}</strong>{availableWinnings > 0 ? ` พร้อมเงินรางวัลงวดนี้ (฿${availableWinnings.toLocaleString()})` : ''} สามารถนำมาหักล้างกันได้
                                    </>
                                ) : pastDebtsTotal > 0 ? (
                                    <>
                                        มียอดค้างรวม <strong style={{ color: '#ef4444' }}>฿{pastDebtsTotal.toLocaleString()}</strong>{availableWinnings > 0 ? ` สามารถนำเงินรางวัลงวดนี้ (฿${availableWinnings.toLocaleString()}) ไปหักล้างได้` : ' สามารถเลือกหักล้างข้ามงวดได้'}
                                    </>
                                ) : (
                                    <>
                                        มียอดค้างจ่ายรางวัลเก่า <strong style={{ color: '#22c55e' }}>฿{pastPrizesTotal.toLocaleString()}</strong> สามารถนำมาหักล้างหรือเคลียร์พร้อมงวดนี้ได้
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn-payment-notice"
                        onClick={() => setShowPaymentNoticeModal(true)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.45rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FiSend size={14} /> แจ้งชำระเงิน
                    </button>
                </div>
            )}

            {/* 2. Actions Header */}
            <div className="settlement-actions-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    จัดการการชำระเงินสำหรับ: <strong>{memberName}</strong>
                </span>
                <div className="settlement-btn-group">
                    {pastUnpaidRounds.length > 0 && (
                        <button
                            type="button"
                            className="btn-settle-action btn-cross-offset-action"
                            onClick={() => setShowOffsetModal(true)}
                            title="หักล้างยอดข้ามงวด"
                            style={{
                                background: 'rgba(250, 204, 21, 0.12)',
                                color: '#facc15',
                                border: '1px solid rgba(250, 204, 21, 0.35)',
                                fontWeight: 600
                            }}
                        >
                            <FiZap size={14} /> ⚡ หักล้างข้ามงวด ({pastUnpaidRounds.length})
                        </button>
                    )}
                    {!status.isSettled && (
                        <button
                            type="button"
                            className="btn-settle-action btn-settle-quick"
                            onClick={handleOpenQuickSettle}
                            disabled={saving}
                            title="ระบุวันที่/หมายเหตุ และบันทึกชำระยอดคงค้างครบจำนวน"
                        >
                            <FiZap size={14} /> ⚡ เคลียร์ครบ ({status.formattedText})
                        </button>
                    )}
                    <button
                        type="button"
                        className={`btn-settle-action btn-settle-add ${showForm ? 'active' : ''}`}
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
                <form className="settlement-form-box" onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                            📝 บันทึกรายการเงิน
                        </span>
                        {totalWinnings > 0 && (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button
                                    type="button"
                                    className="preset-pill-btn"
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
                                    className="preset-pill-btn"
                                    style={{
                                        background: paymentType === 'prize_payout' ? 'var(--color-danger)' : undefined,
                                        color: paymentType === 'prize_payout' ? '#fff' : undefined,
                                        fontWeight: paymentType === 'prize_payout' ? 700 : 400
                                    }}
                                    onClick={() => handleOpenForm('prize_payout', true)}
                                >
                                    จ่ายเฉพาะเงินรางวัล
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="settlement-form-grid">
                        {/* Direction selector (only if net_settlement) */}
                        {paymentType === 'net_settlement' ? (
                            <div className="settlement-form-field">
                                <label>ทิศทางการเงิน</label>
                                <select
                                    value={direction}
                                    onChange={(e) => setDirection(e.target.value)}
                                >
                                    <option value="member_to_dealer">🟢 คนส่งเลขจ่ายให้เจ้ามือ (รับชำระ)</option>
                                    <option value="dealer_to_member">🔴 เจ้ามือจ่ายให้คนส่งเลข (เคลียร์ยอด)</option>
                                </select>
                            </div>
                        ) : (
                            <div className="settlement-form-field">
                                <label>ประเภท</label>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)', fontWeight: 600, paddingTop: '0.4rem' }}>
                                    🏆 เจ้ามือจ่ายเงินถูกรางวัล
                                </div>
                            </div>
                        )}

                        {/* Amount */}
                        <div className="settlement-form-field">
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
                            <div className="settlement-presets">
                                {Math.abs(currentBalance) > 0 && (
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${Number(amount) === Math.abs(currentBalance) ? 'active' : ''}`}
                                        onClick={() => setAmount(String(Math.abs(currentBalance)))}
                                    >
                                        ยอดคงค้าง ฿{Math.abs(currentBalance).toLocaleString()}
                                    </button>
                                )}
                                {totalWinnings > 0 && (
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${Number(amount) === totalWinnings ? 'active' : ''}`}
                                        onClick={() => setAmount(String(totalWinnings))}
                                    >
                                        เงินรางวัล ฿{totalWinnings.toLocaleString()}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Date */}
                        <div className="settlement-form-field">
                            <label>วันที่จ่าย</label>
                            <input
                                type="date"
                                value={paidAt}
                                onChange={(e) => setPaidAt(e.target.value)}
                            />
                            <div className="settlement-presets">
                                <button
                                    type="button"
                                    className={`preset-pill-btn ${paidAt === todayStr ? 'active' : ''}`}
                                    onClick={() => setPaidAt(todayStr)}
                                >
                                    วันนี้
                                </button>
                                {roundDateIso && (
                                    <button
                                        type="button"
                                        className={`preset-pill-btn ${paidAt === roundDateIso ? 'active' : ''}`}
                                        onClick={() => setPaidAt(roundDateIso)}
                                        title={`วันที่งวดหวย (${roundDateIso})`}
                                    >
                                        วันที่งวดหวย
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="settlement-form-field">
                            <label>หมายเหตุ (ถ้ามี)</label>
                            <input
                                type="text"
                                placeholder="เช่น โอน SCB, เงินสด"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                            <div className="settlement-presets">
                                <button
                                    type="button"
                                    className={`preset-pill-btn ${notes === 'โอนแล้ว' ? 'active' : ''}`}
                                    onClick={() => setNotes('โอนแล้ว')}
                                >
                                    โอนแล้ว
                                </button>
                                <button
                                    type="button"
                                    className={`preset-pill-btn ${notes === 'เงินสด' ? 'active' : ''}`}
                                    onClick={() => setNotes('เงินสด')}
                                >
                                    เงินสด
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="settlement-form-actions">
                        <button
                            type="button"
                            className="btn-settle-action btn-settle-add"
                            onClick={() => setShowForm(false)}
                            disabled={saving}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn-settle-action btn-settle-quick"
                            disabled={saving || !Number(amount)}
                        >
                            <FiCheck size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                        </button>
                    </div>
                </form>
            )}

            {/* 4. Payment History Logs Table */}
            <div className="settlement-logs-container">
                <span className="settlement-logs-title">
                    📜 ประวัติการรับ-จ่ายเงินในงวดนี้ ({payments.length} รายการ)
                </span>
                {payments.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '0.35rem 0' }}>
                        ยังไม่มีบันทึกการชำระเงินสำหรับสมาชิกรายนี้
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="settlement-logs-table">
                            <thead>
                                <tr>
                                    <th>วันที่จ่าย</th>
                                    <th>ประเภทรายการ</th>
                                    <th>ทิศทาง</th>
                                    <th style={{ textAlign: 'right' }}>จำนวนเงิน</th>
                                    <th>หมายเหตุ</th>
                                    <th style={{ textAlign: 'center', width: '70px' }}>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((p) => {
                                    const isMemberPay = p.direction === 'member_to_dealer'
                                    const isPrize = p.payment_type === 'prize_payout'
                                    return (
                                        <tr key={p.id}>
                                            <td style={{ color: 'var(--color-text-muted)' }}>
                                                {p.paid_at || '-'}
                                            </td>
                                            <td>
                                                {isPrize ? (
                                                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                                        จ่ายเงินรางวัล
                                                    </span>
                                                ) : (
                                                    <span>เคลียร์ยอดสุทธิ</span>
                                                )}
                                            </td>
                                            <td>
                                                {isMemberPay ? (
                                                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                        🟢 คนส่งจ่ายเจ้ามือ
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                                        🔴 เจ้ามือจ่ายคนส่ง
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                ฿{Number(p.amount || 0).toLocaleString()}
                                            </td>
                                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                                {p.notes || '-'}
                                            </td>
                                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <button
                                                        type="button"
                                                        className="btn-edit-log"
                                                        title="แก้ไขรายการนี้"
                                                        onClick={() => handleOpenEditModal(p)}
                                                    >
                                                        <FiEdit2 size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-delete-log"
                                                        title="ลบรายการนี้"
                                                        disabled={deletingId === p.id}
                                                        onClick={() => handleDelete(p.id)}
                                                    >
                                                        <FiTrash2 size={14} />
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
                    className="modal-overlay nested" 
                    style={{ 
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.75rem'
                    }}
                    onClick={() => setShowQuickSettleModal(false)}
                >
                    <div className="modal modal-sm quick-settle-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                <FiZap style={{ color: 'var(--color-success, #10b981)' }} /> เคลียร์ยอดคงค้างครบ
                            </h3>
                            <button type="button" className="modal-close" onClick={() => setShowQuickSettleModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <form onSubmit={handleConfirmQuickSettle}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* Summary Info Box */}
                                <div style={{
                                    background: 'rgba(0, 0, 0, 0.35)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '8px',
                                    padding: '0.65rem 0.85rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                        <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>สมาชิก:</span>
                                        <span style={{ fontWeight: 600 }}>{memberName}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                        <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>ทิศทาง:</span>
                                        <span style={{ 
                                            fontWeight: 600, 
                                            color: currentBalance > 0 ? 'var(--color-warning, #f59e0b)' : 'var(--color-danger, #ef4444)' 
                                        }}>
                                            {currentBalance > 0 ? '🟢 คนส่งจ่ายให้เจ้ามือ (รับชำระ)' : '🔴 เจ้ามือจ่ายให้คนส่ง (เคลียร์ยอด)'}
                                        </span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        marginTop: '0.2rem', 
                                        paddingTop: '0.35rem', 
                                        borderTop: '1px solid rgba(255,255,255,0.06)' 
                                    }}>
                                        <span style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.82rem' }}>ยอดเคลียร์ครบ:</span>
                                        <span style={{ 
                                            fontSize: '1.25rem', 
                                            fontWeight: 700, 
                                            color: 'var(--color-success, #10b981)' 
                                        }}>
                                            ฿{Math.abs(currentBalance).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Date Picker with Quick Chips */}
                                <div className="settlement-form-field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                        <FiCalendar /> วันที่ชำระ:
                                    </label>
                                    <input
                                        type="date"
                                        value={quickPaidAt}
                                        onChange={e => setQuickPaidAt(e.target.value)}
                                        required
                                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                    />
                                    <div className="settlement-presets">
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${quickPaidAt === todayStr ? 'active' : ''}`}
                                            onClick={() => setQuickPaidAt(todayStr)}
                                        >
                                            วันนี้
                                        </button>
                                        {roundDateIso && (
                                            <button
                                                type="button"
                                                className={`preset-pill-btn ${quickPaidAt === roundDateIso ? 'active' : ''}`}
                                                onClick={() => setQuickPaidAt(roundDateIso)}
                                                title={`วันที่งวดหวย (${roundDateIso})`}
                                            >
                                                วันที่งวดหวย
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Notes with Quick Chips */}
                                <div className="settlement-form-field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                        <FiFileText /> หมายเหตุ:
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="ระบุหมายเหตุ (เช่น โอน SCB, เงินสด ฯลฯ)"
                                        value={quickNotes}
                                        onChange={e => setQuickNotes(e.target.value)}
                                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                    />
                                    <div className="settlement-presets">
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${quickNotes === 'เคลียร์ยอดครบจำนวน' ? 'active' : ''}`}
                                            onClick={() => setQuickNotes('เคลียร์ยอดครบจำนวน')}
                                        >
                                            เคลียร์ยอดครบจำนวน
                                        </button>
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${quickNotes === 'โอนแล้ว' ? 'active' : ''}`}
                                            onClick={() => setQuickNotes('โอนแล้ว')}
                                        >
                                            โอนแล้ว
                                        </button>
                                        <button
                                            type="button"
                                            className={`preset-pill-btn ${quickNotes === 'เงินสด' ? 'active' : ''}`}
                                            onClick={() => setQuickNotes('เงินสด')}
                                        >
                                            เงินสด
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer" style={{ 
                                display: 'flex', 
                                justifyContent: 'flex-end', 
                                gap: '0.5rem', 
                                padding: '0.75rem 1.15rem', 
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(0,0,0,0.2)' 
                            }}>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setShowQuickSettleModal(false)}
                                    disabled={saving}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-success btn-sm"
                                    disabled={saving}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {saving ? (
                                        <>กำลังบันทึก...</>
                                    ) : (
                                        <>
                                            <FiCheck /> ยืนยันเคลียร์ครบ (฿{Math.abs(currentBalance).toLocaleString()})
                                        </>
                                    )}
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
                    style={{ 
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.75rem'
                    }}
                    onClick={() => setEditingPayment(null)}
                >
                    <div className="modal modal-sm quick-settle-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                <FiEdit2 style={{ color: 'var(--color-primary, #facc15)' }} /> แก้ไขรายการชำระเงิน
                            </h3>
                            <button type="button" className="modal-close" onClick={() => setEditingPayment(null)}>
                                <FiX />
                            </button>
                        </div>
                        <form onSubmit={handleConfirmEditPayment} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0.75rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {/* Member Info Bar */}
                                <div style={{
                                    background: 'rgba(0, 0, 0, 0.35)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '6px',
                                    padding: '0.45rem 0.75rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.82rem'
                                }}>
                                    <div><span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>สมาชิก: </span><strong>{memberName}</strong></div>
                                    <div style={{ fontWeight: 600, color: editPaymentType === 'prize_payout' ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                                        {editPaymentType === 'prize_payout' ? '🏆 จ่ายเงินรางวัล' : 'เคลียร์ยอดสุทธิ'}
                                    </div>
                                </div>

                                {/* Type & Direction (Compact grid if winnings > 0) */}
                                {totalWinnings > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                        <div className="settlement-form-field">
                                            <label style={{ fontSize: '0.78rem' }}>ประเภทรายการ</label>
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
                                                        if (editDirection === 'dealer_to_member' && currentBalance >= 0) {
                                                            setEditDirection('member_to_dealer')
                                                        }
                                                    }}
                                                >
                                                    เคลียร์ยอดสุทธิ
                                                </button>
                                                <button
                                                    type="button"
                                                    className="preset-pill-btn"
                                                    style={{
                                                        background: editPaymentType === 'prize_payout' ? 'var(--color-danger)' : undefined,
                                                        color: editPaymentType === 'prize_payout' ? '#fff' : undefined,
                                                        fontWeight: editPaymentType === 'prize_payout' ? 700 : 400
                                                    }}
                                                    onClick={() => {
                                                        setEditPaymentType('prize_payout')
                                                        setEditDirection('dealer_to_member')
                                                    }}
                                                >
                                                    จ่ายเฉพาะเงินรางวัล
                                                </button>
                                            </div>
                                        </div>

                                        {editPaymentType === 'net_settlement' ? (
                                            <div className="settlement-form-field">
                                                <label style={{ fontSize: '0.78rem' }}>ทิศทางการเงิน</label>
                                                <select
                                                    value={editDirection}
                                                    onChange={(e) => setEditDirection(e.target.value)}
                                                    style={{ padding: '0.38rem 0.55rem', fontSize: '0.82rem' }}
                                                >
                                                    <option value="member_to_dealer">🟢 คนส่งจ่ายเจ้ามือ (รับชำระ)</option>
                                                    <option value="dealer_to_member">🔴 เจ้ามือจ่ายคนส่ง (เคลียร์ยอด)</option>
                                                </select>
                                            </div>
                                        ) : (
                                            <div className="settlement-form-field">
                                                <label style={{ fontSize: '0.78rem' }}>ทิศทางการเงิน</label>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--color-danger)', fontWeight: 600, paddingTop: '0.3rem' }}>
                                                    🔴 เจ้ามือจ่ายคนส่ง (เงินรางวัล)
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="settlement-form-field">
                                        <label style={{ fontSize: '0.78rem' }}>ทิศทางการเงิน</label>
                                        <select
                                            value={editDirection}
                                            onChange={(e) => setEditDirection(e.target.value)}
                                            style={{ padding: '0.38rem 0.55rem', fontSize: '0.82rem' }}
                                        >
                                            <option value="member_to_dealer">🟢 คนส่งจ่ายเจ้ามือ (รับชำระ)</option>
                                            <option value="dealer_to_member">🔴 เจ้ามือจ่ายคนส่ง (เคลียร์ยอด)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Amount & Date (2-column grid) */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                    {/* Amount */}
                                    <div className="settlement-form-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                            <FiDollarSign /> จำนวนเงิน (บาท) *
                                        </label>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="any"
                                            required
                                            placeholder="0.00"
                                            value={editAmount}
                                            onChange={(e) => setEditAmount(e.target.value)}
                                            style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
                                        />
                                        <div className="settlement-presets">
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
                                                    เงินรางวัล ฿{totalWinnings.toLocaleString()}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Date */}
                                    <div className="settlement-form-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                            <FiCalendar /> วันที่ชำระ
                                        </label>
                                        <input
                                            type="date"
                                            value={editPaidAt}
                                            onChange={(e) => setEditPaidAt(e.target.value)}
                                            required
                                            style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
                                        />
                                        <div className="settlement-presets">
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
                                </div>

                                {/* Notes */}
                                <div className="settlement-form-field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                        <FiFileText /> หมายเหตุ
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="เช่น โอน SCB, เงินสด"
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
                                    />
                                    <div className="settlement-presets">
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
                            </div>

                            <div className="modal-footer" style={{ 
                                display: 'flex', 
                                justifyContent: 'flex-end', 
                                gap: '0.5rem', 
                                padding: '0.65rem 1.15rem', 
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(0,0,0,0.25)',
                                flexShrink: 0
                            }}>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setEditingPayment(null)}
                                    disabled={editSaving}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary btn-sm"
                                    disabled={editSaving || !Number(editAmount)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {editSaving ? (
                                        <>กำลังบันทึก...</>
                                    ) : (
                                        <>
                                            <FiCheck /> บันทึกการแก้ไข
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {showOffsetModal && (
                <CrossRoundOffsetModal
                    isOpen={showOffsetModal}
                    onClose={() => setShowOffsetModal(false)}
                    onConfirmOffset={async (allocations) => {
                        if (onCrossRoundOffset) {
                            await onCrossRoundOffset(allocations)
                        }
                    }}
                    currentRound={round}
                    member={{ ...member, name: memberName }}
                    dealerId={dealerId}
                    pastUnpaidRounds={pastUnpaidRounds}
                    currentWinnings={availableWinnings}
                    isUpstream={false}
                />
            )}

            {showPaymentNoticeModal && (
                <PaymentNoticeModal
                    isOpen={showPaymentNoticeModal}
                    onClose={() => setShowPaymentNoticeModal(false)}
                    member={{
                        ...member,
                        name: memberName,
                        line_user_id: member?.line_user_id || member?.profiles?.line_user_id || ''
                    }}
                    round={round}
                    dealerId={dealerId}
                    pastUnpaidRounds={pastUnpaidRounds}
                    currentBalance={currentBalance}
                    currentWinnings={totalWinnings}
                    availableWinnings={availableWinnings}
                    roundHistory={roundHistory}
                />
            )}
        </div>
    )
}
