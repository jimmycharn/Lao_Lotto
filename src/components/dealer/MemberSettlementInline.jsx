import { useState } from 'react'
import {
    FiPlus,
    FiTrash2,
    FiCheck,
    FiX,
    FiZap,
    FiCalendar,
    FiDollarSign,
    FiFileText
} from 'react-icons/fi'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    getMemberSettlementStatus,
    getPaymentPresetAmount
} from '../../utils/memberSettlementCalculator'
import './MemberSettlementInline.css'

export default function MemberSettlementInline({
    member,
    round,
    payments = [],
    onSavePayment,
    onDeletePayment,
    onClose
}) {
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

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

    // Open form with prefilled defaults
    const handleOpenForm = (type = 'net_settlement') => {
        setPaymentType(type)
        if (type === 'prize_payout') {
            setDirection('dealer_to_member')
            const presetPrize = getPaymentPresetAmount(member, payments, 'prize_payout', 'dealer_to_member')
            setAmount(presetPrize > 0 ? String(presetPrize) : '')
        } else {
            // Net settlement: default direction based on current balance
            const defDir = currentBalance >= 0 ? 'member_to_dealer' : 'dealer_to_member'
            setDirection(defDir)
            const presetNet = Math.abs(currentBalance)
            setAmount(presetNet > 0 ? String(presetNet) : '')
        }
        setShowForm(true)
    }

    // Quick full settlement button
    const handleQuickSettle = async () => {
        if (currentBalance === 0) return
        const defDir = currentBalance > 0 ? 'member_to_dealer' : 'dealer_to_member'
        const settleAmount = Math.abs(currentBalance)

        setSaving(true)
        try {
            await onSavePayment({
                user_id: member.user_id,
                round_id: round.round_id || round.id,
                lottery_type: round.lottery_type,
                round_date: round.round_date || round.close_time?.split('T')[0],
                payment_type: 'net_settlement',
                direction: defDir,
                amount: settleAmount,
                paid_at: new Date().toISOString().split('T')[0],
                notes: 'เคลียร์ยอดครบจำนวน'
            })
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
                round_date: round.round_date || round.close_time?.split('T')[0],
                payment_type: paymentType,
                direction: direction,
                amount: numAmount,
                paid_at: paidAt || new Date().toISOString().split('T')[0],
                notes: notes.trim()
            })
            setShowForm(false)
            setAmount('')
            setNotes('')
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

            {/* 2. Actions Header */}
            <div className="settlement-actions-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    จัดการการชำระเงินสำหรับ: <strong>{memberName}</strong>
                </span>
                <div className="settlement-btn-group">
                    {!status.isSettled && (
                        <button
                            type="button"
                            className="btn-settle-action btn-settle-quick"
                            onClick={handleQuickSettle}
                            disabled={saving}
                            title="บันทึกชำระยอดคงค้างเต็มจำนวนใน 1 คลิก"
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
                                handleOpenForm('net_settlement')
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
                                    onClick={() => handleOpenForm('net_settlement')}
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
                                    onClick={() => handleOpenForm('prize_payout')}
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
                                        className="preset-pill-btn"
                                        onClick={() => setAmount(String(Math.abs(currentBalance)))}
                                    >
                                        ยอดคงค้าง ฿{Math.abs(currentBalance).toLocaleString()}
                                    </button>
                                )}
                                {totalWinnings > 0 && (
                                    <button
                                        type="button"
                                        className="preset-pill-btn"
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
                                    <th style={{ textAlign: 'center', width: '40px' }}></th>
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
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="btn-delete-log"
                                                    title="ลบรายการนี้"
                                                    disabled={deletingId === p.id}
                                                    onClick={() => handleDelete(p.id)}
                                                >
                                                    <FiTrash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
