import React, { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
    FiSend,
    FiX,
    FiCheck,
    FiCalendar,
    FiDollarSign,
    FiCreditCard,
    FiCopy,
    FiAlertCircle,
    FiCheckCircle
} from 'react-icons/fi'
import { supabase } from '../../lib/supabase'
import {
    calculatePaymentNoticeSummary,
    resolvePaymentNoticeBankAccount,
    formatPaymentNoticeMessage
} from '../../utils/paymentNoticeHelper'
import { getRoundCloseDate } from '../../utils/crossRoundOffsetCalculator'
import toast from 'react-hot-toast'
import './PaymentNoticeModal.css'

export default function PaymentNoticeModal({
    isOpen,
    onClose,
    member,
    round,
    dealerId,
    pastUnpaidRounds = [],
    currentBalance = 0,
    currentWinnings = 0,
    availableWinnings = 0,
    roundHistory = []
}) {
    if (!isOpen || typeof document === 'undefined') return null

    // Sort past unpaid rounds descending by close date
    const sortedPastRounds = useMemo(() => {
        return [...pastUnpaidRounds].sort((a, b) => {
            const dateA = a.roundDate || getRoundCloseDate(a) || a.round_date || ''
            const dateB = b.roundDate || getRoundCloseDate(b) || b.round_date || ''
            return dateB.localeCompare(dateA)
        })
    }, [pastUnpaidRounds])

    // Modes: 'current_debt' (หนี้งวดนี้), 'offset_prize_past_debt' (หักลบรางวัลกับหนี้เก่า), 'combine_all' (หักลบทั้งหมด)
    const [mode, setMode] = useState('offset_prize_past_debt')
    const [selectedRoundIds, setSelectedRoundIds] = useState(() =>
        sortedPastRounds.map(r => r.roundId)
    )

    const [customAmount, setCustomAmount] = useState('')
    const [noticeDate, setNoticeDate] = useState(() => new Date().toISOString().split('T')[0])
    const [customNotes, setCustomNotes] = useState('')

    // Bank account state
    const [resolvedBank, setResolvedBank] = useState(null)
    const [bankAccountText, setBankAccountText] = useState('')
    const [loadingBank, setLoadingBank] = useState(true)

    // Send state
    const [sending, setSending] = useState(false)
    const [copied, setCopied] = useState(false)

    const masterCheckboxRef = useRef(null)

    // Reset round selection when past rounds change
    useEffect(() => {
        setSelectedRoundIds(sortedPastRounds.map(r => r.roundId))
    }, [sortedPastRounds])

    // Filter selected past rounds
    const selectedPastRounds = useMemo(() => {
        return sortedPastRounds.filter(r => selectedRoundIds.includes(r.roundId))
    }, [sortedPastRounds, selectedRoundIds])

    // Master checkbox indeterminate state
    const isAllSelected = sortedPastRounds.length > 0 && selectedRoundIds.length === sortedPastRounds.length
    const isIndeterminate = selectedRoundIds.length > 0 && selectedRoundIds.length < sortedPastRounds.length

    useEffect(() => {
        if (masterCheckboxRef.current) {
            masterCheckboxRef.current.indeterminate = isIndeterminate
        }
    }, [isIndeterminate])

    // Calculate live summary based on mode & selection
    const prizeToOffset = availableWinnings > 0 ? availableWinnings : currentWinnings
    const summary = useMemo(() => {
        return calculatePaymentNoticeSummary({
            mode,
            currentBalance,
            currentWinnings: prizeToOffset,
            selectedPastRounds: mode === 'current_debt' ? [] : selectedPastRounds
        })
    }, [mode, currentBalance, prizeToOffset, selectedPastRounds])

    // Auto-fill custom amount whenever summary.netAmount changes if user hasn't overridden
    const displayAmount = customAmount !== '' ? customAmount : String(summary.netAmount)

    // Resolve Bank Account whenever direction changes
    useEffect(() => {
        let isMounted = true
        async function loadBank() {
            setLoadingBank(true)
            const memberUserId = member?.user_id || member?.id || member?.userId
            const effDealerId = dealerId || member?.dealer_id || round?.dealer_id

            const bank = await resolvePaymentNoticeBankAccount({
                direction: summary.direction,
                dealerId: effDealerId,
                memberUserId,
                supabase,
                assignedBankAccountId: member?.assigned_bank_account_id || null
            })

            if (isMounted) {
                setResolvedBank(bank)
                if (bank) {
                    const formatted = [
                        bank.bank_name,
                        bank.bank_account,
                        bank.account_name ? `(${bank.account_name})` : ''
                    ].filter(Boolean).join(' ')
                    setBankAccountText(formatted)
                } else {
                    setBankAccountText('')
                }
                setLoadingBank(false)
            }
        }

        loadBank()
        return () => {
            isMounted = false
        }
    }, [summary.direction, dealerId, member, round])

    // Escape key listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !sending) {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [sending, onClose])

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

    // Target display metadata
    const targetDisplayName =
        member?.profiles?.full_name ||
        member?.profiles?.line_display_name ||
        member?.profiles?.email ||
        member?.name ||
        member?.user_name ||
        'สมาชิก'

    const roundDateIso = round ? (getRoundCloseDate(round) || round.round_date || '') : ''
    const lotteryType = round?.lottery_type || 'thai'
    const lotteryName = lotteryType === 'thai' ? 'หวยไทย' : lotteryType === 'lao' ? 'หวยลาว' : lotteryType

    const effectiveLineUserId = (
        member?.line_user_id ||
        member?.profiles?.line_user_id ||
        ''
    ).trim()

    // Format full notice message
    const formattedMessage = useMemo(() => {
        return formatPaymentNoticeMessage({
            memberName: targetDisplayName,
            roundDate: roundDateIso,
            lotteryTypeName: lotteryName,
            mode,
            summary: {
                ...summary,
                netAmount: Number(displayAmount || summary.netAmount)
            },
            bankAccount: {
                bank_name: bankAccountText || resolvedBank?.bank_name || '',
                bank_account: '',
                account_name: ''
            },
            customNotes
        })
    }, [targetDisplayName, roundDateIso, lotteryName, mode, summary, displayAmount, bankAccountText, resolvedBank, customNotes])

    // Copy to clipboard
    const handleCopyNotice = async () => {
        try {
            await navigator.clipboard.writeText(formattedMessage)
            setCopied(true)
            toast.success('คัดลอกข้อความแจ้งชำระเงินแล้ว')
            setTimeout(() => setCopied(false), 2500)
        } catch (err) {
            console.error('Failed to copy notice:', err)
            toast.error('ไม่สามารถคัดลอกข้อความได้')
        }
    }

    // Submit / Send notice via LINE Bot
    const handleSendNotice = async (e) => {
        e.preventDefault()
        if (sending) return

        if (!effectiveLineUserId) {
            toast.error('สมาชิกยังไม่ได้ผูกบัญชี LINE (สามารถกดคัดลอกข้อความเพื่อส่งเองได้)')
            return
        }

        setSending(true)
        try {
            const { data, error } = await supabase.functions.invoke('line-bot', {
                body: {
                    action: 'send_payment_notice',
                    line_user_id: effectiveLineUserId,
                    message_text: formattedMessage
                }
            })

            if (error) throw error
            if (data && data.success === false) {
                throw new Error(data.error || 'เกิดข้อผิดพลาดในการส่งข้อความ')
            }

            toast.success(`ส่งใบแจ้งชำระเงินไปยัง LINE ของ ${targetDisplayName} เรียบร้อยแล้ว`)
            onClose()
        } catch (err) {
            console.error('Error sending payment notice via LINE:', err)
            toast.error(`ส่งข้อความไม่สำเร็จ: ${err.message || 'กรุณาลองใหม่อีกครั้ง'}`)
        } finally {
            setSending(false)
        }
    }

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
            onClick={() => !sending && onClose()}
        >
            <div className="payment-notice-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h3>
                        <FiSend color="#eab308" /> แจ้งชำระเงิน
                    </h3>
                    <button
                        type="button"
                        className="modal-close"
                        onClick={() => !sending && onClose()}
                        title="ปิด"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <form onSubmit={handleSendNotice} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="modal-body">
                        {/* Member and Current Prize Info */}
                        <div className="notice-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                            <div>
                                <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>สมาชิก: </span>
                                <strong>{targetDisplayName}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>รางวัลงวดนี้ที่นำมาหักล้าง: </span>
                                <strong style={{ color: 'var(--color-primary, #facc15)', fontSize: '0.9rem' }}>
                                    ฿{Number(prizeToOffset).toLocaleString()}
                                </strong>
                            </div>
                        </div>

                        {/* 3 Modes Selection Checkboxes */}
                        <div className="notice-box">
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                                รูปแบบใบแจ้งชำระเงิน
                            </label>
                            <div className="notice-modes-grid">
                                <div
                                    className={`notice-mode-card ${mode === 'current_debt' ? 'active' : ''}`}
                                    onClick={() => setMode('current_debt')}
                                >
                                    <input
                                        type="checkbox"
                                        className="notice-mode-checkbox"
                                        checked={mode === 'current_debt'}
                                        onChange={() => setMode('current_debt')}
                                    />
                                    <span>หนี้งวดนี้</span>
                                </div>
                                <div
                                    className={`notice-mode-card ${mode === 'offset_prize_past_debt' ? 'active' : ''}`}
                                    onClick={() => setMode('offset_prize_past_debt')}
                                >
                                    <input
                                        type="checkbox"
                                        className="notice-mode-checkbox"
                                        checked={mode === 'offset_prize_past_debt'}
                                        onChange={() => setMode('offset_prize_past_debt')}
                                    />
                                    <span>หักลบรางวัลกับหนี้เก่า</span>
                                </div>
                                <div
                                    className={`notice-mode-card ${mode === 'combine_all' ? 'active' : ''}`}
                                    onClick={() => setMode('combine_all')}
                                >
                                    <input
                                        type="checkbox"
                                        className="notice-mode-checkbox"
                                        checked={mode === 'combine_all'}
                                        onChange={() => setMode('combine_all')}
                                    />
                                    <span>หักลบทั้งหมด</span>
                                </div>
                            </div>
                        </div>

                        {/* Past Rounds Selector (only when mode is not current_debt) */}
                        {mode !== 'current_debt' ? (
                            <div className="notice-box">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <label style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: '#f8fafc',
                                        userSelect: 'none'
                                    }}>
                                        <input
                                            ref={masterCheckboxRef}
                                            type="checkbox"
                                            checked={isAllSelected}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                        />
                                        <span>เลือกงวดเก่าที่ต้องการหักล้าง ({selectedRoundIds.length}/{sortedPastRounds.length})</span>
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
                                        {isAllSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                    </button>
                                </div>

                                <div className="notice-past-rounds-list">
                                    {sortedPastRounds.map(r => {
                                        const isChecked = selectedRoundIds.includes(r.roundId)
                                        const roundDebtNum = Number(r.debt || 0)
                                        const isDebtPositive = roundDebtNum > 0
                                        const isDebtNegative = roundDebtNum < 0

                                        return (
                                            <div
                                                key={r.roundId}
                                                className={`notice-round-row ${isChecked ? 'selected' : ''}`}
                                                onClick={() => toggleRound(r.roundId)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <span>
                                                        งวดวันที่ <strong>{r.roundDate || getRoundCloseDate(r) || r.round_date}</strong>
                                                        {r.lotteryType && (
                                                            <span style={{ fontSize: '0.75rem', opacity: 0.75, marginLeft: '0.35rem' }}>
                                                                ({r.lotteryType === 'thai' ? 'หวยไทย' : r.lotteryType === 'lao' ? 'หวยลาว' : r.lotteryType})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                {isDebtPositive ? (
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                                        ค้าง ฿{roundDebtNum.toLocaleString()}
                                                    </span>
                                                ) : isDebtNegative ? (
                                                    <span style={{ color: '#22c55e', fontWeight: 600 }}>
                                                        ค้างจ่าย -฿{Math.abs(roundDebtNum).toLocaleString()}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                                                        ฿0
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="notice-box" style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <FiAlertCircle size={15} color="#38bdf8" />
                                <span>โหมดนี้จะออกใบแจ้งยอดเฉพาะยอดค้างชำระของงวดปัจจุบันเท่านั้น (ไม่รวมยอดงวดเก่า)</span>
                            </div>
                        )}

                        {/* Calculation Summary Box */}
                        <div className="notice-box" style={{ background: 'rgba(234, 179, 8, 0.05)', borderColor: 'rgba(234, 179, 8, 0.2)' }}>
                            {mode === 'current_debt' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                                    <span>ยอดค้างชำระงวดปัจจุบัน:</span>
                                    <span style={{ fontWeight: 600 }}>฿{Number(summary.currentRoundDebt || 0).toLocaleString()}</span>
                                </div>
                            )}

                            {mode === 'offset_prize_past_debt' && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                                        <span>รวมหนี้เก่าที่เลือก:</span>
                                        <span style={{ fontWeight: 600 }}>฿{Number(summary.selectedPastDebt || 0).toLocaleString()}</span>
                                    </div>
                                    {summary.currentRoundPrize > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                            <span>หักลบเงินรางวัลงวดนี้:</span>
                                            <span style={{ color: 'var(--color-primary, #facc15)', fontWeight: 600 }}>
                                                -฿{Number(summary.currentRoundPrize).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            {mode === 'combine_all' && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                                        <span>ยอดค้างงวดปัจจุบัน:</span>
                                        <span style={{ fontWeight: 600 }}>฿{Number(summary.currentRoundDebt || 0).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                        <span>รวมหนี้เก่าที่เลือก:</span>
                                        <span style={{ fontWeight: 600 }}>฿{Number(summary.selectedPastDebt || 0).toLocaleString()}</span>
                                    </div>
                                </>
                            )}

                            <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    {summary.direction === 'member_to_dealer' && '🟢 สมาชิกต้องโอนชำระ:'}
                                    {summary.direction === 'dealer_to_member' && '🔴 เจ้ามือต้องโอนคืนสมาชิก:'}
                                    {summary.direction === 'even' && '⚪ ยอดหักล้างพอดี (ไม่ต้องโอน):'}
                                </span>
                                <span style={{
                                    fontSize: '1.15rem',
                                    fontWeight: 800,
                                    color: summary.direction === 'even' ? '#f8fafc' : '#facc15'
                                }}>
                                    ฿{Number(summary.netAmount).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Amount & Date inputs */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                            <div className="notice-bank-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                                    <FiDollarSign /> จำนวนเงินตามสลิปจริง (บาท)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={displayAmount}
                                    onChange={e => setCustomAmount(e.target.value)}
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
                            <div className="notice-bank-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                                    <FiCalendar /> วันที่ชำระ
                                </label>
                                <input
                                    type="date"
                                    value={noticeDate}
                                    onChange={e => setNoticeDate(e.target.value)}
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

                        {/* Bank Account */}
                        <div className="notice-bank-field">
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <FiCreditCard /> บัญชีโอนเงิน
                                </span>
                                <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>
                                    {loadingBank ? 'กำลังโหลด...' : (
                                        summary.direction === 'dealer_to_member' ? 'ดึงจากบัญชีสมาชิก' :
                                        resolvedBank?.source === 'dealer_assigned' ? 'ดึงจากบัญชีที่กำหนดให้สมาชิก' :
                                        'ดึงจากบัญชีหลักเจ้ามือ'
                                    )}
                                </span>
                            </label>
                            <input
                                type="text"
                                className="notice-bank-input"
                                value={bankAccountText}
                                onChange={e => setBankAccountText(e.target.value)}
                                placeholder="เช่น ไทยพาณิชย์ 9972081291"
                            />
                        </div>

                        {/* LINE Status & Copy Fallback */}
                        {!effectiveLineUserId && (
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '6px',
                                padding: '0.5rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.8rem',
                                color: '#fca5a5'
                            }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FiAlertCircle size={15} /> สมาชิกยังไม่ได้ผูก LINE UID
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyNotice}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#fff',
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem'
                                    }}
                                >
                                    {copied ? <FiCheckCircle color="#22c55e" /> : <FiCopy />}
                                    {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn-notice-cancel"
                            onClick={() => !sending && onClose()}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="btn-notice-send"
                            disabled={sending}
                        >
                            <FiSend size={15} />
                            {sending ? 'กำลังส่ง...' : 'ส่งใบแจ้งชำระ'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
