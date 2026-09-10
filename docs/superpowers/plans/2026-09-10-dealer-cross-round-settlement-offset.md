# Cross-Round Settlement Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Cross-Round Settlement Offset Wizard allowing dealers to offset a member's (or upstream dealer's) current round prize winnings against unpaid debts from past rounds and settle the remaining difference in a single slip.

**Architecture:** A pure functional calculator (`crossRoundOffsetCalculator.js`) handles FIFO allocation across multiple past rounds and net difference math; a dedicated modal component (`CrossRoundOffsetModal.jsx`) presents the smart detection checklist and calculation summary; `Dealer.jsx` handles multi-record atomic insertion into `member_round_payments` / `upstream_round_payments` and updates React state across all affected rounds.

**Tech Stack:** React 19, Supabase, Vitest, Vanilla CSS (Dark Glassmorphism).

## Global Constraints
- Must not modify or break existing per-round settlement tables or calculators.
- Uses existing `member_round_payments` and `upstream_round_payments` tables without altering their DB schemas.
- Modals must be vertically constrained with sticky footer and internal scroll to prevent screen overflow.
- All test runs on Windows must use `npm.cmd test` and builds must use `npm.cmd run build`.

---

### Task 1: Pure Calculator Logic for Cross-Round Offset (`crossRoundOffsetCalculator.js`)

**Files:**
- Create: `src/utils/crossRoundOffsetCalculator.js`
- Test: `src/utils/__tests__/crossRoundOffsetCalculator.test.js`

**Interfaces:**
- Produces:
  - `calculateOffsetSummary({ pastDebtTotal, prizeAmount, slipAmount })`
    - Returns: `{ netDifference, direction, isExactMatch, memberPays, dealerPays }`
  - `allocateCrossRoundOffsetPayments({ selectedPastRounds, offsetPrizeAmount, actualSlipAmount, paidAt, currentRound, memberUserId, dealerId, isUpstream })`
    - Returns: `{ currentRoundPayment, pastRoundPayments }`

- [ ] **Step 1: Write failing tests for cross-round offset calculations**

```javascript
// src/utils/__tests__/crossRoundOffsetCalculator.test.js
import { describe, it, expect } from 'vitest'
import {
    calculateOffsetSummary,
    allocateCrossRoundOffsetPayments
} from '../crossRoundOffsetCalculator'

describe('crossRoundOffsetCalculator', () => {
    describe('calculateOffsetSummary', () => {
        it('calculates debt > prize correctly (member pays dealer difference)', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 4000,
                prizeAmount: 3000,
                slipAmount: 1000
            })
            expect(result.netDifference).toBe(1000)
            expect(result.direction).toBe('member_to_dealer')
            expect(result.isExactMatch).toBe(false)
        })

        it('calculates prize > debt correctly (dealer pays member difference)', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 2000,
                prizeAmount: 5000,
                slipAmount: 3000
            })
            expect(result.netDifference).toBe(-3000)
            expect(result.direction).toBe('dealer_to_member')
            expect(result.isExactMatch).toBe(false)
        })

        it('calculates exact match debt === prize correctly', () => {
            const result = calculateOffsetSummary({
                pastDebtTotal: 3000,
                prizeAmount: 3000,
                slipAmount: 0
            })
            expect(result.netDifference).toBe(0)
            expect(result.isExactMatch).toBe(true)
        })
    })

    describe('allocateCrossRoundOffsetPayments', () => {
        it('allocates payment across single past round', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-16', debt: 4000, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-2', roundDate: '2026-09-01', lotteryType: 'lao' }
            
            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 3000,
                actualSlipAmount: 1000,
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: 'user-1',
                dealerId: 'dealer-1',
                isUpstream: false
            })

            expect(allocation.currentRoundPayment).toMatchObject({
                round_id: 'round-2',
                payment_type: 'prize_payout',
                direction: 'dealer_to_member',
                amount: 3000
            })
            expect(allocation.pastRoundPayments).toHaveLength(1)
            expect(allocation.pastRoundPayments[0]).toMatchObject({
                round_id: 'round-1',
                payment_type: 'net_settlement',
                direction: 'member_to_dealer',
                amount: 4000
            })
        })

        it('allocates payment sequentially (FIFO) across multiple past rounds', () => {
            const pastRounds = [
                { roundId: 'round-1', roundDate: '2026-08-01', debt: 1500, lotteryType: 'lao' },
                { roundId: 'round-2', roundDate: '2026-08-16', debt: 2500, lotteryType: 'lao' }
            ]
            const currentRound = { id: 'round-3', roundDate: '2026-09-01', lotteryType: 'lao' }

            const allocation = allocateCrossRoundOffsetPayments({
                selectedPastRounds: pastRounds,
                offsetPrizeAmount: 3000,
                actualSlipAmount: 1000, // Total funds = 4000
                paidAt: '2026-09-10',
                currentRound,
                memberUserId: 'user-1',
                dealerId: 'dealer-1',
                isUpstream: false
            })

            expect(allocation.pastRoundPayments).toHaveLength(2)
            expect(allocation.pastRoundPayments[0].amount).toBe(1500)
            expect(allocation.pastRoundPayments[0].round_id).toBe('round-1')
            expect(allocation.pastRoundPayments[1].amount).toBe(2500)
            expect(allocation.pastRoundPayments[1].round_id).toBe('round-2')
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test src/utils/__tests__/crossRoundOffsetCalculator.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/utils/crossRoundOffsetCalculator.js`**

```javascript
/**
 * Cross-Round Offset Calculator
 * Handles arithmetic and allocation for cross-round settlement offsets.
 */

export function calculateOffsetSummary({ pastDebtTotal = 0, prizeAmount = 0, slipAmount = 0 }) {
    const debt = Math.max(0, Number(pastDebtTotal) || 0)
    const prize = Math.max(0, Number(prizeAmount) || 0)
    const netDifference = Math.round(debt - prize)

    let direction = 'even'
    if (netDifference > 0) {
        direction = 'member_to_dealer'
    } else if (netDifference < 0) {
        direction = 'dealer_to_member'
    }

    return {
        pastDebtTotal: debt,
        prizeAmount: prize,
        netDifference,
        direction,
        isExactMatch: netDifference === 0,
        suggestedSlipAmount: Math.abs(netDifference)
    }
}

export function allocateCrossRoundOffsetPayments({
    selectedPastRounds = [],
    offsetPrizeAmount = 0,
    actualSlipAmount = 0,
    paidAt = new Date().toISOString().split('T')[0],
    currentRound = {},
    memberUserId = null,
    dealerId = null,
    isUpstream = false
}) {
    const prize = Math.max(0, Number(offsetPrizeAmount) || 0)
    const slip = Math.max(0, Number(actualSlipAmount) || 0)
    const totalAvailableToClear = Math.round(prize + slip)

    const curRoundId = currentRound.id || currentRound.round_id
    const curRoundDate = currentRound.round_date || (currentRound.close_time ? currentRound.close_time.split('T')[0] : 'งวดปัจจุบัน')

    // 1. Current round prize payout record
    const currentRoundPayment = {
        dealer_id: dealerId,
        user_id: memberUserId,
        round_id: curRoundId,
        lottery_type: currentRound.lottery_type || null,
        round_date: curRoundDate,
        payment_type: isUpstream ? 'prize_collection' : 'prize_payout',
        direction: isUpstream ? 'upstream_to_dealer' : 'dealer_to_member',
        amount: prize,
        paid_at: paidAt,
        notes: `หักล้างหนี้งวดเก่า (${selectedPastRounds.map(r => r.roundDate).join(', ')}) ฿${prize.toLocaleString()}${slip > 0 ? ` [สลิปโอน ฿${slip.toLocaleString()}]` : ''}`,
        created_by: dealerId
    }

    // 2. Allocate across selected past rounds in chronological order
    let remainingToAllocate = totalAvailableToClear
    const pastRoundPayments = []

    for (const past of selectedPastRounds) {
        if (remainingToAllocate <= 0) break
        const roundDebt = Math.max(0, Number(past.debt || 0))
        const allocatedAmount = Math.min(roundDebt, remainingToAllocate)

        if (allocatedAmount > 0) {
            pastRoundPayments.push({
                dealer_id: dealerId,
                user_id: memberUserId,
                round_id: past.roundId,
                lottery_type: past.lotteryType || null,
                round_date: past.roundDate || null,
                payment_type: isUpstream ? 'net_settlement' : 'net_settlement',
                direction: isUpstream ? 'dealer_to_upstream' : 'member_to_dealer',
                amount: allocatedAmount,
                paid_at: paidAt,
                notes: `หักล้างรางวัลจากงวด ${curRoundDate} (฿${prize.toLocaleString()})${slip > 0 ? ` + สลิปโอน ฿${slip.toLocaleString()}` : ''}`,
                created_by: dealerId
            })
            remainingToAllocate -= allocatedAmount
        }
    }

    return {
        currentRoundPayment,
        pastRoundPayments
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test src/utils/__tests__/crossRoundOffsetCalculator.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit Task 1**

Run:
```bash
git add src/utils/crossRoundOffsetCalculator.js src/utils/__tests__/crossRoundOffsetCalculator.test.js
git commit -m "feat(dealer): add cross-round settlement offset calculator with unit tests"
```

---

### Task 2: Cross-Round Offset Modal Component (`CrossRoundOffsetModal.jsx`)

**Files:**
- Create: `src/components/dealer/CrossRoundOffsetModal.jsx`
- Create: `src/components/dealer/CrossRoundOffsetModal.css`

**Interfaces:**
- Consumes:
  - `calculateOffsetSummary`, `allocateCrossRoundOffsetPayments` from Task 1
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onConfirmOffset: (payload) => Promise<void>`
  - `currentRound: Object`
  - `member: Object` (or upstream target)
  - `pastUnpaidRounds: Array<{ roundId, roundDate, lotteryType, debt }>`
  - `currentWinnings: number`
  - `isUpstream?: boolean`

- [ ] **Step 1: Create `CrossRoundOffsetModal.css` with dark glassmorphism and sticky footer**

```css
/* src/components/dealer/CrossRoundOffsetModal.css */
.cross-round-modal {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    color: #f8fafc;
    width: 95%;
    max-width: 520px;
    max-height: min(88vh, 580px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: auto;
    animation: crossModalFadeIn 0.2s ease-out;
}

@keyframes crossModalFadeIn {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}

.cross-round-modal .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.15rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
}

.cross-round-modal .modal-body {
    padding: 0.8rem 1.15rem;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.cross-round-modal .modal-body::-webkit-scrollbar {
    width: 6px;
}
.cross-round-modal .modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
}

.cross-round-box {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
}

.past-rounds-list {
    max-height: 140px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.4rem;
}

.past-round-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.5rem;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    font-size: 0.82rem;
    transition: background 0.15s;
}

.past-round-row:hover {
    background: rgba(255, 255, 255, 0.07);
}

.past-round-row.selected {
    border-color: rgba(250, 204, 21, 0.4);
    background: rgba(250, 204, 21, 0.08);
}

.cross-round-modal .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.65rem 1.15rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
}
```

- [ ] **Step 2: Create `CrossRoundOffsetModal.jsx` component**

```javascript
// src/components/dealer/CrossRoundOffsetModal.jsx
import React, { useState, useMemo } from 'react'
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
    isUpstream = false
}) {
    if (!isOpen || typeof document === 'undefined') return null

    // Default select all past unpaid rounds
    const [selectedRoundIds, setSelectedRoundIds] = useState(() => 
        pastUnpaidRounds.map(r => r.roundId)
    )
    const [customSlipAmount, setCustomSlipAmount] = useState('')
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().split('T')[0])
    const [customNotes, setCustomNotes] = useState('')
    const [saving, setSaving] = useState(false)

    // Calculate selected past debt
    const selectedPastRounds = useMemo(() => {
        return pastUnpaidRounds.filter(r => selectedRoundIds.includes(r.roundId))
    }, [pastUnpaidRounds, selectedRoundIds])

    const pastDebtTotal = useMemo(() => {
        return selectedPastRounds.reduce((sum, r) => sum + Number(r.debt || 0), 0)
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
        if (selectedRoundIds.length === pastUnpaidRounds.length) {
            setSelectedRoundIds([])
        } else {
            setSelectedRoundIds(pastUnpaidRounds.map(r => r.roundId))
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (selectedPastRounds.length === 0) return

        const allocations = allocateCrossRoundOffsetPayments({
            selectedPastRounds,
            offsetPrizeAmount: currentWinnings,
            actualSlipAmount: activeSlipAmount,
            paidAt,
            currentRound,
            memberUserId: member?.user_id,
            dealerId: member?.dealer_id,
            isUpstream
        })

        if (customNotes) {
            allocations.currentRoundPayment.notes += ` (${customNotes})`
            allocations.pastRoundPayments.forEach(p => { p.notes += ` (${customNotes})` })
        }

        setSaving(true)
        try {
            await onConfirmOffset(allocations)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const todayStr = new Date().toISOString().split('T')[0]

    return createPortal(
        <div 
            className="modal-overlay nested" 
            style={{ 
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.75rem'
            }}
            onClick={() => !saving && onClose()}
        >
            <div className="cross-round-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <FiZap color="#facc15" /> หักล้างยอดข้ามงวด (Cross-Round Offset)
                    </h3>
                    <button type="button" className="modal-close" onClick={() => !saving && onClose()}>
                        <FiX />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="modal-body">
                        {/* Target Info & Prize Available */}
                        <div className="cross-round-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                            <div>
                                <span style={{ color: 'var(--color-text-muted)' }}>{isUpstream ? 'เจ้ามือรับตีออก: ' : 'สมาชิก: '}</span>
                                <strong>{member?.name || member?.user_name || 'สมาชิก'}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--color-text-muted)' }}>รางวัลงวดนี้ที่นำมาหักล้าง: </span>
                                <strong style={{ color: 'var(--color-primary, #facc15)', fontSize: '0.9rem' }}>฿{Number(currentWinnings).toLocaleString()}</strong>
                            </div>
                        </div>

                        {/* Past Rounds Selector */}
                        <div className="cross-round-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                    เลือกงวดเก่าที่ต้องการหักล้าง ({selectedRoundIds.length}/{pastUnpaidRounds.length})
                                </label>
                                <button type="button" onClick={toggleSelectAll} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #facc15)', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    {selectedRoundIds.length === pastUnpaidRounds.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                </button>
                            </div>

                            <div className="past-rounds-list">
                                {pastUnpaidRounds.map(r => {
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
                                                <span>งวดวันที่ <strong>{r.roundDate}</strong></span>
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                <span>รวมหนี้เก่าที่เลือก:</span>
                                <span>฿{pastDebtTotal.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                                <span>หักลบเงินรางวัลงวดนี้:</span>
                                <span style={{ color: 'var(--color-primary)' }}>-฿{Number(currentWinnings).toLocaleString()}</span>
                            </div>
                            <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    {summary.direction === 'member_to_dealer' && '🟢 สมาชิกต้องโอนชำระเพิ่ม:'}
                                    {summary.direction === 'dealer_to_member' && '🔴 เจ้ามือต้องโอนคืนสมาชิก:'}
                                    {summary.direction === 'even' && '⚪ ยอดหักล้างกันพอดี (ไม่ต้องโอน):'}
                                </span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: summary.direction === 'even' ? '#fff' : summary.direction === 'member_to_dealer' ? 'var(--color-warning, #f59e0b)' : 'var(--color-danger, #ef4444)' }}>
                                    ฿{Math.abs(summary.netDifference).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Actual Slip Amount & Date (2 columns) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                            <div className="settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                    <FiDollarSign /> จำนวนเงินตามสลิปจริง (บาท)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={customSlipAmount !== '' ? customSlipAmount : summary.suggestedSlipAmount}
                                    onChange={e => setCustomSlipAmount(e.target.value)}
                                    style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div className="settlement-form-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                    <FiCalendar /> วันที่ชำระ
                                </label>
                                <input
                                    type="date"
                                    value={paidAt}
                                    onChange={e => setPaidAt(e.target.value)}
                                    required
                                    style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="settlement-form-field">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                                <FiFileText /> หมายเหตุเพิ่มเติม (ระบุหรือไม่ก็ได้)
                            </label>
                            <input
                                type="text"
                                placeholder="เช่น โอนผ่าน KBank สลิปเวลา 14:20"
                                value={customNotes}
                                onChange={e => setCustomNotes(e.target.value)}
                                style={{ padding: '0.38rem 0.55rem', fontSize: '0.85rem' }}
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
```

- [ ] **Step 3: Verify build**

Run: `npm.cmd run build`
Expected: PASS

- [ ] **Step 4: Commit Task 2**

Run:
```bash
git add src/components/dealer/CrossRoundOffsetModal.jsx src/components/dealer/CrossRoundOffsetModal.css
git commit -m "feat(dealer): create CrossRoundOffsetModal component with smart summary and multi-round selection"
```

---

### Task 3: Backend Handlers in `Dealer.jsx` for Batch Offset Execution

**Files:**
- Modify: `src/pages/Dealer.jsx`

**Interfaces:**
- Produces:
  - `handleSaveMemberCrossRoundOffset(allocations)`
  - `handleSaveUpstreamCrossRoundOffset(allocations)`
  - `fetchMemberPastUnpaidRounds(userId, currentRoundDate)`
  - `fetchUpstreamPastUnpaidRounds(dealerName, currentRoundDate)`

- [ ] **Step 1: Add cross-round offset handlers in `src/pages/Dealer.jsx`**

```javascript
// In Dealer.jsx:
async function handleSaveMemberCrossRoundOffset(allocations) {
    if (!allocations) return
    const { currentRoundPayment, pastRoundPayments } = allocations
    const recordsToInsert = [
        currentRoundPayment,
        ...pastRoundPayments
    ].filter(r => r && r.amount > 0)

    const { data: inserted, error } = await supabase
        .from('member_round_payments')
        .insert(recordsToInsert)
        .select()

    if (error) {
        console.error('Error in member cross-round offset:', error)
        toast.error('บันทึกหักล้างยอดไม่สำเร็จ: ' + error.message)
        throw error
    }

    toast.success(`บันทึกหักล้างยอดข้ามงวดสำเร็จ (${pastRoundPayments.length + 1} รายการ)`)

    // Update historyDetails for current round and any cached past rounds
    setHistoryDetails(prev => {
        let updated = { ...prev }
        inserted.forEach(rec => {
            const foundKey = Object.keys(updated).find(k => {
                const item = updated[k]
                return (item.round_id === rec.round_id || k === rec.round_id)
            })
            if (foundKey && updated[foundKey]) {
                const existing = updated[foundKey].payments || []
                updated[foundKey] = {
                    ...updated[foundKey],
                    payments: [...existing, rec]
                }
            }
        })
        return updated
    })

    setSettlementOverview(prev => ({
        ...prev,
        memberPayments: [...prev.memberPayments, ...inserted]
    }))
}

async function handleSaveUpstreamCrossRoundOffset(allocations) {
    if (!allocations) return
    const { currentRoundPayment, pastRoundPayments } = allocations
    const recordsToInsert = [
        currentRoundPayment,
        ...pastRoundPayments
    ].filter(r => r && r.amount > 0)

    const { data: inserted, error } = await supabase
        .from('upstream_round_payments')
        .insert(recordsToInsert)
        .select()

    if (error) {
        console.error('Error in upstream cross-round offset:', error)
        toast.error('บันทึกหักล้างยอดไม่สำเร็จ: ' + error.message)
        throw error
    }

    toast.success(`บันทึกหักล้างยอดข้ามงวดสำเร็จ (${pastRoundPayments.length + 1} รายการ)`)

    setHistoryDetails(prev => {
        let updated = { ...prev }
        inserted.forEach(rec => {
            const foundKey = Object.keys(updated).find(k => {
                const item = updated[k]
                return (item.round_id === rec.round_id || k === rec.round_id)
            })
            if (foundKey && updated[foundKey]) {
                const existing = updated[foundKey].upstreamPayments || []
                updated[foundKey] = {
                    ...updated[foundKey],
                    upstreamPayments: [...existing, rec]
                }
            }
        })
        return updated
    })

    setSettlementOverview(prev => ({
        ...prev,
        upstreamPayments: [...prev.upstreamPayments, ...inserted]
    }))
}
```

- [ ] **Step 2: Pass `onCrossRoundOffset` prop down to `<MemberSettlementInline />` and `<UpstreamSettlementInline />` in `Dealer.jsx`**

- [ ] **Step 3: Run build and unit tests to verify no regressions**

Run: `npm.cmd test && npm.cmd run build`
Expected: PASS (all tests pass)

- [ ] **Step 4: Commit Task 3**

Run:
```bash
git add src/pages/Dealer.jsx
git commit -m "feat(dealer): add handleSaveMemberCrossRoundOffset and handleSaveUpstreamCrossRoundOffset in Dealer.jsx"
```

---

### Task 4: Integrate Smart Banner & Offset Wizard in `MemberSettlementInline.jsx`

**Files:**
- Modify: `src/components/dealer/MemberSettlementInline.jsx`
- Modify: `src/components/dealer/MemberSettlementInline.css`

- [ ] **Step 1: In `MemberSettlementInline.jsx`, detect past unpaid debts for current member**
  - Compute `pastUnpaidRounds` from available history overview or query prop.
  - If `totalWinnings > 0` and `pastUnpaidRounds.length > 0`, render the Smart Detection Banner above the payment form:
    ```jsx
    {pastUnpaidRounds.length > 0 && totalWinnings > 0 && (
        <div className="cross-round-smart-banner">
            <div className="banner-text">
                <FiZap color="#facc15" />
                <span>
                    พบยอดค้างชำระจากงวดก่อนหน้า <strong>฿{pastDebtTotal.toLocaleString()}</strong> ({pastUnpaidRounds.length} งวด)
                </span>
            </div>
            <button 
                type="button" 
                className="btn-cross-offset"
                onClick={() => setShowOffsetModal(true)}
            >
                ⚡ หักล้างยอดกับงวดเก่า
            </button>
        </div>
    )}
    ```

- [ ] **Step 2: Connect `CrossRoundOffsetModal` in `MemberSettlementInline.jsx`**

- [ ] **Step 3: Style `.cross-round-smart-banner` in `MemberSettlementInline.css`**

- [ ] **Step 4: Verify build and tests**

Run: `npm.cmd test && npm.cmd run build`
Expected: PASS

- [ ] **Step 5: Commit Task 4**

Run:
```bash
git add src/components/dealer/MemberSettlementInline.jsx src/components/dealer/MemberSettlementInline.css
git commit -m "feat(dealer): integrate cross-round smart banner and offset modal in MemberSettlementInline"
```

---

### Task 5: Integrate Smart Banner & Offset Wizard in `UpstreamSettlementInline.jsx`

**Files:**
- Modify: `src/components/dealer/UpstreamSettlementInline.jsx`
- Modify: `src/components/dealer/UpstreamSettlementInline.css`

- [ ] **Step 1: In `UpstreamSettlementInline.jsx`, compute past unpaid debts for current upstream dealer**
- [ ] **Step 2: Render Smart Banner when past debt exists and current round has winnings to collect**
- [ ] **Step 3: Connect `CrossRoundOffsetModal` with `isUpstream={true}`**
- [ ] **Step 4: Add matching styling in `UpstreamSettlementInline.css`**
- [ ] **Step 5: Verify build and tests**

Run: `npm.cmd test && npm.cmd run build`
Expected: PASS

- [ ] **Step 6: Commit Task 5**

Run:
```bash
git add src/components/dealer/UpstreamSettlementInline.jsx src/components/dealer/UpstreamSettlementInline.css
git commit -m "feat(dealer): integrate cross-round offset in UpstreamSettlementInline"
```

---

### Task 6: Full Verification & End-to-End Test

**Files:**
- Test all components and workflows

- [ ] **Step 1: Run complete Vitest suite**
Run: `npm.cmd test`
Expected: All test suites pass (0 errors)

- [ ] **Step 2: Run production Vite build**
Run: `npm.cmd run build`
Expected: Vite build succeeds with 0 errors

- [ ] **Step 3: Final commit and summary documentation**
Run:
```bash
git status
```
Expected: Clean working tree
