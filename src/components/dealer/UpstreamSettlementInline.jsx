import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
    FiZap,
    FiPlus,
    FiX,
    FiCheck,
    FiTrash2,
    FiCalendar,
    FiClock,
    FiFileText,
    FiHash,
    FiEdit2,
    FiDollarSign,
    FiCreditCard
} from 'react-icons/fi'
import {
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance,
    getUpstreamSettlementStatus,
    getUpstreamPaymentPresetAmount
} from '../../utils/memberSettlementCalculator'
import {
    findUpstreamPastUnpaidRounds,
    getRoundCloseDate,
    parsePaymentNotes,
    buildPaymentNotes,
    formatThaiDate
} from '../../utils/crossRoundOffsetCalculator'
import { THAI_BANKS, matchBankOption } from '../../utils/paymentNoticeHelper'
import CrossRoundOffsetModal from './CrossRoundOffsetModal'
import './UpstreamSettlementInline.css'
import './CrossRoundOffsetModal.css'

const getTodayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const getCurrentTimeBangkok = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })

export default function UpstreamSettlementInline({
    transfer,
    round,
    payments = [],
    settlementOverview,
    roundHistory = [],
    dealerId,
    lotteryTypeFilter = null,
    autoFocusPaymentBtn = false,
    onSavePayment,
    onUpdatePayment,
    onDeletePayment,
    onCrossRoundOffset,
    onClose
}) {
    const paymentBtnRef = useRef(null)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    useEffect(() => {
        if (autoFocusPaymentBtn && paymentBtnRef.current) {
            requestAnimationFrame(() => {
                paymentBtnRef.current?.focus()
            })
        }
    }, [autoFocusPaymentBtn])

    // Edit Modal states
    const [editingPayment, setEditingPayment] = useState(null)
    const [editPaymentType, setEditPaymentType] = useState('net_settlement')
    const [editDirection, setEditDirection] = useState('dealer_to_upstream')
    const [editAmount, setEditAmount] = useState('')
    const [editPaidAt, setEditPaidAt] = useState('')
    const [editPaidTime, setEditPaidTime] = useState('')
    const [editReferenceDoc, setEditReferenceDoc] = useState('')
    const [editSenderBank, setEditSenderBank] = useState('')
    const [editCustomNotes, setEditCustomNotes] = useState('')
    const [editOriginalPrefix, setEditOriginalPrefix] = useState('')
    const [editSaving, setEditSaving] = useState(false)
    const editDateInputRef = useRef(null)
    const editTimeInputRef = useRef(null)

    const availableEditBankOptions = useMemo(() => {
        if (editSenderBank && !THAI_BANKS.includes(editSenderBank)) {
            return [editSenderBank, ...THAI_BANKS]
        }
        return THAI_BANKS
    }, [editSenderBank])

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

    // Prize already collected from upstream in current round
    const prizeCollected = useMemo(() => {
        return payments
            .filter(p => p.direction === 'upstream_to_dealer' || p.payment_type === 'prize_collection')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    }, [payments])

    // Available prize from current round that can be used for cross-round offset
    const availableWinnings = Math.max(0, Math.round(totalWinnings - prizeCollected))

    const todayStr = new Date().toISOString().split('T')[0]
    const getRoundDateIso = (r) => {
        if (!r) return null
        return getRoundCloseDate(r) || null
    }
    const roundDateIso = getRoundDateIso(round)

    // Cross-round offset detection
    const [showOffsetModal, setShowOffsetModal] = useState(false)

    const pastUnpaidRounds = useMemo(() => {
        const dealerName = transfer?.target_dealer_name || transfer?.upstream_dealer_name || transfer?.dealerName
        return findUpstreamPastUnpaidRounds({
            dealerName,
            currentRoundId: round?.round_id || round?.id,
            currentRoundDate: roundDateIso,
            transfers: settlementOverview?.transfers || [],
            upstreamPayments: settlementOverview?.upstreamPayments || [],
            roundHistory: roundHistory || [],
            lotteryType: (lotteryTypeFilter && lotteryTypeFilter !== 'all') ? lotteryTypeFilter : null
        })
    }, [transfer, round, roundDateIso, settlementOverview, roundHistory, lotteryTypeFilter])

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
        setEditPaidAt(p.paid_at || roundDateIso || getTodayBangkok())

        const parsed = parsePaymentNotes(p.notes)
        setEditPaidTime(parsed.paidTime || '')
        setEditReferenceDoc(parsed.referenceDoc || '')
        setEditCustomNotes(parsed.customNotes || '')
        setEditOriginalPrefix(parsed.prefix || '')

        let initialSenderBank = ''
        if (parsed.senderBank) {
            initialSenderBank = matchBankOption(parsed.senderBank, THAI_BANKS)
        }
        setEditSenderBank(initialSenderBank)
    }

    const handleConfirmEditPayment = async (e) => {
        if (e) e.preventDefault()
        if (!editingPayment) return
        const numAmount = Number(editAmount)
        if (!numAmount || numAmount <= 0) return

        const fullNotes = buildPaymentNotes({
            paymentType: editPaymentType,
            direction: editDirection,
            isUpstream: true,
            customNotes: editCustomNotes,
            paidTime: editPaidTime,
            referenceDoc: editReferenceDoc,
            originalPrefix: editOriginalPrefix,
            senderBank: editSenderBank
        })

        setEditSaving(true)
        try {
            if (onUpdatePayment) {
                const ok = await onUpdatePayment(editingPayment.id, {
                    payment_type: editPaymentType,
                    direction: editDirection,
                    amount: numAmount,
                    paid_at: editPaidAt || todayStr,
                    notes: fullNotes
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

            {/* Smart Detection Banner for Cross-Round Offset */}
            {pastUnpaidRounds.length > 0 && (availableWinnings > 0 || pastPrizesTotal > 0 || pastDebtsTotal > 0) && (
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
                                        เรามียอดค้างชำระ <strong style={{ color: '#ef4444' }}>฿{pastDebtsTotal.toLocaleString()}</strong> และยอดถูกรางวัลงวดเก่า <strong style={{ color: '#22c55e' }}>฿{pastPrizesTotal.toLocaleString()}</strong>{availableWinnings > 0 ? ` พร้อมยอดถูกรางวัลงวดนี้ (฿${availableWinnings.toLocaleString()})` : ''} สามารถนำมาหักล้างกันได้
                                    </>
                                ) : pastDebtsTotal > 0 ? (
                                    <>
                                        เรามียอดค้างชำระรวม <strong style={{ color: '#ef4444' }}>฿{pastDebtsTotal.toLocaleString()}</strong>{availableWinnings > 0 ? ` สามารถนำยอดถูกรางวัลงวดนี้ (฿${availableWinnings.toLocaleString()}) ไปหักล้างได้` : ' สามารถเลือกหักล้างข้ามงวดได้'}
                                    </>
                                ) : (
                                    <>
                                        มียอดถูกรางวัลค้างรับ <strong style={{ color: '#22c55e' }}>฿{pastPrizesTotal.toLocaleString()}</strong> สามารถนำมาหักล้างหรือเคลียร์พร้อมงวดนี้ได้
                                    </>
                                )}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn-cross-offset"
                        onClick={() => setShowOffsetModal(true)}
                    >
                        ⚡ บันทึกชำระเงิน
                    </button>
                </div>
            )}

            {/* 2. Action Buttons Header */}
            <div className="upstream-settlement-actions-header">
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    จัดการการชำระเงินสำหรับ: <strong>{upstreamName}</strong>
                </span>
                <div className="upstream-settlement-btn-group">
                    <button
                        ref={paymentBtnRef}
                        type="button"
                        className="btn-upstream-settle-action btn-cross-offset-action"
                        onClick={() => setShowOffsetModal(true)}
                        title="บันทึกชำระเงิน"
                        style={{
                            background: 'rgba(250, 204, 21, 0.12)',
                            color: '#facc15',
                            border: '1px solid rgba(250, 204, 21, 0.35)',
                            fontWeight: 600
                        }}
                    >
                        <FiZap size={14} /> บันทึกชำระเงิน{pastUnpaidRounds.length > 0 ? ` (${pastUnpaidRounds.length})` : ''}
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
                    <div className="upstream-settlement-logs-table-wrapper">
                        <table className="upstream-settlement-logs-table">
                            <colgroup>
                                <col className="col-log-date" />
                                <col className="col-log-type" />
                                <col className="col-log-direction" />
                                <col className="col-log-amount" />
                                <col className="col-log-notes" />
                                <col className="col-log-actions" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="col-log-date">วันที่จ่าย</th>
                                    <th className="col-log-type">ประเภท</th>
                                    <th className="col-log-direction">ทิศทาง</th>
                                    <th className="col-log-amount" style={{ textAlign: 'right' }}>จำนวนเงิน</th>
                                    <th className="col-log-notes">หมายเหตุ</th>
                                    <th className="col-log-actions" style={{ textAlign: 'center' }}>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((p) => {
                                    const isDealerPay = p.direction === 'dealer_to_upstream'
                                    return (
                                        <tr key={p.id}>
                                            <td className="col-log-date" style={{ whiteSpace: 'nowrap' }}>
                                                {p.paid_at ? new Date(p.paid_at).toLocaleDateString('th-TH') : '-'}
                                            </td>
                                            <td className="col-log-type">
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
                                            <td className="col-log-direction">
                                                <span style={{ color: isDealerPay ? '#ef4444' : 'var(--color-success)', fontWeight: 600 }}>
                                                    {isDealerPay ? '🔴 เราจ่ายให้เจ้ามือ' : '🟢 เจ้ามือจ่ายเรา'}
                                                </span>
                                            </td>
                                            <td className="col-log-amount" style={{ textAlign: 'right', fontWeight: 700, color: isDealerPay ? '#ef4444' : 'var(--color-success)' }}>
                                                {isDealerPay ? '-฿' : '+฿'}{Number(p.amount || 0).toLocaleString()}
                                            </td>
                                            <td className="col-log-notes" style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                                                <div
                                                    className="upstream-settlement-log-notes-cell"
                                                    title={p.notes || ''}
                                                >
                                                    {p.notes || '-'}
                                                </div>
                                            </td>
                                            <td className="col-log-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
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
                    className="modal-overlay nested" 
                    style={{ 
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.75rem'
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

                        <form onSubmit={handleConfirmQuickSettle} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0.75rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.55rem 0.85rem', borderRadius: '8px' }}>
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
                                        style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
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
                                        style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
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
                    onClick={() => !editSaving && setEditingPayment(null)}
                >
                    <div className="cross-round-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                <FiEdit2 color="#facc15" /> แก้ไขรายการชำระเงิน
                            </h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !editSaving && setEditingPayment(null)}
                                title="ปิด"
                            >
                                <FiX size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleConfirmEditPayment} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body">
                                {/* 1. Dealer Info Bar */}
                                <div className="cross-round-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>เจ้ามือรับตีออก: </span>
                                        <strong>{transfer?.dealerName || upstreamName || 'เจ้ามือรับตีออก'}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>งวดวันที่: </span>
                                        <strong style={{ color: 'var(--color-primary, #facc15)' }}>
                                            {formatThaiDate(roundDateIso || getRoundCloseDate(round))}
                                        </strong>
                                    </div>
                                </div>

                                {/* 2. Payment Type (รูปแบบการชำระเงิน) */}
                                <div className="cross-round-box">
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                                        รูปแบบการชำระเงิน
                                    </label>
                                    <div className="cross-round-modes-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                        <div
                                            className={`cross-round-mode-card ${editPaymentType === 'net_settlement' ? 'active' : ''}`}
                                            onClick={() => {
                                                setEditPaymentType('net_settlement')
                                                if (editDirection === 'upstream_to_dealer' && currentBalance >= 0) {
                                                    setEditDirection('dealer_to_upstream')
                                                }
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                className="cross-round-mode-checkbox"
                                                checked={editPaymentType === 'net_settlement'}
                                                onChange={() => {
                                                    setEditPaymentType('net_settlement')
                                                    if (editDirection === 'upstream_to_dealer' && currentBalance >= 0) {
                                                        setEditDirection('dealer_to_upstream')
                                                    }
                                                }}
                                            />
                                            <span>จ่ายหนี้งวดนี้</span>
                                        </div>
                                        <div
                                            className={`cross-round-mode-card ${editPaymentType === 'prize_collection' ? 'active' : ''}`}
                                            onClick={() => {
                                                setEditPaymentType('prize_collection')
                                                setEditDirection('upstream_to_dealer')
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                className="cross-round-mode-checkbox"
                                                checked={editPaymentType === 'prize_collection'}
                                                onChange={() => {
                                                    setEditPaymentType('prize_collection')
                                                    setEditDirection('upstream_to_dealer')
                                                }}
                                            />
                                            <span>รับคืนรางวัลงวดนี้</span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem', fontStyle: 'italic' }}>
                                        {editPaymentType === 'net_settlement' && 'ℹ️ รายการชำระหนี้/เคลียร์ยอดคงค้างของงวดปัจจุบัน'}
                                        {editPaymentType === 'prize_collection' && 'ℹ️ รายการรับคืนเงินรางวัลจากการตีออกของงวดปัจจุบัน'}
                                    </div>
                                </div>

                                {/* 3. Direction (ทิศทางการเงิน) - Only for net_settlement */}
                                {editPaymentType === 'net_settlement' && (
                                    <div className="cross-round-box">
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                                            ทิศทางการเงิน
                                        </label>
                                        <div className="cross-round-modes-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                            <div
                                                className={`cross-round-mode-card ${editDirection === 'dealer_to_upstream' ? 'active' : ''}`}
                                                onClick={() => setEditDirection('dealer_to_upstream')}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="cross-round-mode-checkbox"
                                                    checked={editDirection === 'dealer_to_upstream'}
                                                    onChange={() => setEditDirection('dealer_to_upstream')}
                                                />
                                                <span>🔴 เราจ่ายให้เจ้ามือ</span>
                                            </div>
                                            <div
                                                className={`cross-round-mode-card ${editDirection === 'upstream_to_dealer' ? 'active' : ''}`}
                                                onClick={() => setEditDirection('upstream_to_dealer')}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="cross-round-mode-checkbox"
                                                    checked={editDirection === 'upstream_to_dealer'}
                                                    onChange={() => setEditDirection('upstream_to_dealer')}
                                                />
                                                <span>🟢 เจ้ามือจ่ายคืนเรา</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 4. Direction & Amount Summary Box */}
                                <div className="cross-round-box" style={{ background: 'rgba(250, 204, 21, 0.05)', borderColor: 'rgba(250, 204, 21, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                            {editDirection === 'dealer_to_upstream'
                                                ? '🔴 เราโอนชำระให้เจ้ามือรับตีออก:'
                                                : (editPaymentType === 'prize_collection' ? '🟢 เจ้ามือโอนจ่ายคืนรางวัลให้เรา:' : '🟢 เจ้ามือโอนชำระให้เรา:')}
                                        </span>
                                        <span style={{
                                            fontSize: '1.1rem',
                                            fontWeight: 800,
                                            color: editDirection === 'dealer_to_upstream' ? 'var(--color-danger, #ef4444)' : 'var(--color-success, #10b981)'
                                        }}>
                                            ฿{Number(editAmount || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* 5. 3 Columns: Amount, Date, Time */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', alignItems: 'start' }}>
                                    <div className="settlement-form-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                                            <FiDollarSign /> จำนวนเงิน
                                        </label>
                                        <input
                                            type="number"
                                            className="settlement-input"
                                            min="0.01"
                                            step="any"
                                            value={editAmount}
                                            onChange={e => setEditAmount(e.target.value)}
                                            required
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                padding: '0.38rem 0.55rem',
                                                fontSize: '0.85rem',
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: '6px',
                                                color: '#f8fafc',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                    <div className="settlement-form-field">
                                        <label
                                            onClick={() => {
                                                try { editDateInputRef.current?.showPicker?.() } catch {}
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                fontSize: '0.78rem',
                                                color: 'var(--color-text-muted, #94a3b8)',
                                                marginBottom: '0.2rem',
                                                cursor: 'pointer'
                                            }}
                                            title="คลิกเพื่อเปิดปฏิทินเลือกวันที่"
                                        >
                                            <FiCalendar /> วันที่ชำระ
                                        </label>
                                        <div className="settlement-input-icon-wrapper">
                                            <input
                                                ref={editDateInputRef}
                                                type="date"
                                                className="settlement-input-with-action"
                                                value={editPaidAt}
                                                onChange={e => setEditPaidAt(e.target.value)}
                                                onDoubleClick={() => {
                                                    try { editDateInputRef.current?.showPicker?.() } catch {}
                                                }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className={`btn-input-trailing-action ${editPaidAt === getTodayBangkok() ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditPaidAt(getTodayBangkok())
                                                }}
                                                title="คลิกเพื่อตั้งเป็นวันที่ปัจจุบัน (วันนี้)"
                                            >
                                                <FiCalendar size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="settlement-form-field">
                                        <label
                                            onClick={() => {
                                                try { editTimeInputRef.current?.showPicker?.() } catch {}
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                fontSize: '0.78rem',
                                                color: 'var(--color-text-muted, #94a3b8)',
                                                marginBottom: '0.2rem',
                                                cursor: 'pointer'
                                            }}
                                            title="คลิกเพื่อเปิดตัวเลือกเวลา"
                                        >
                                            <FiClock /> เวลาโอน
                                        </label>
                                        <div className="settlement-input-icon-wrapper">
                                            <input
                                                ref={editTimeInputRef}
                                                type="time"
                                                className="settlement-input-with-action"
                                                value={editPaidTime}
                                                onChange={e => setEditPaidTime(e.target.value)}
                                                onDoubleClick={() => {
                                                    try { editTimeInputRef.current?.showPicker?.() } catch {}
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className={`btn-input-trailing-action ${editPaidTime ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditPaidTime(getCurrentTimeBangkok())
                                                }}
                                                title="คลิกเพื่อตั้งเป็นเวลาปัจจุบัน"
                                            >
                                                <FiClock size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 6. Sender Bank & Reference Document (2 columns) */}
                                <div className="settlement-form-grid-2">
                                    <div className="settlement-form-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem', whiteSpace: 'nowrap', minHeight: '20px' }}>
                                            <FiCreditCard /> ธนาคารผู้โอน
                                        </label>
                                        <select
                                            className="settlement-select"
                                            value={editSenderBank}
                                            onChange={e => setEditSenderBank(e.target.value)}
                                            style={{ height: '36px', boxSizing: 'border-box' }}
                                        >
                                            <option value="">-- เลือกธนาคาร --</option>
                                            {availableEditBankOptions.map(bank => (
                                                <option key={bank} value={bank}>{bank}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="settlement-form-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem', whiteSpace: 'nowrap', minHeight: '20px' }}>
                                            <FiHash /> เอกสารอ้างอิง <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>(ถ้ามี)</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="settlement-input"
                                            placeholder="เช่น เลขที่สลิป หรือ รหัสอ้างอิงการโอน"
                                            value={editReferenceDoc}
                                            onChange={e => setEditReferenceDoc(e.target.value)}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                padding: '0.38rem 0.55rem',
                                                fontSize: '0.85rem',
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: '6px',
                                                color: '#f8fafc',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* 7. Notes */}
                                <div className="settlement-form-field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.2rem' }}>
                                        <FiFileText /> หมายเหตุเพิ่มเติม (ระบุหรือไม่ก็ได้)
                                    </label>
                                    <input
                                        type="text"
                                        className="settlement-input"
                                        placeholder="เช่น บัญชีธนาคาร หรือ หมายเหตุการโอน"
                                        value={editCustomNotes}
                                        onChange={e => setEditCustomNotes(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '36px',
                                            padding: '0.38rem 0.55rem',
                                            fontSize: '0.85rem',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            borderRadius: '6px',
                                            color: '#f8fafc',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
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
                                            <FiCheck size={14} /> บันทึกการแก้ไข
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
                    member={transfer}
                    dealerId={dealerId}
                    pastUnpaidRounds={pastUnpaidRounds}
                    currentBalance={currentBalance}
                    currentWinnings={totalWinnings}
                    availableWinnings={availableWinnings}
                    isUpstream={true}
                    upstreamDealerName={transfer?.target_dealer_name || transfer?.upstream_dealer_name || transfer?.dealerName}
                />
            )}
        </div>
    )
}
