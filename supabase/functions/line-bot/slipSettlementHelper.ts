export interface ToleranceParams {
    slipAmount: number
    expectedAmount: number
    toleranceAmount: number
    toleranceMode: 'forgive_difference' | 'carry_remainder'
}

export interface ToleranceResult {
    isValid: boolean
    diff: number
    recordedAmount: number
    adjustmentNote: string | null
}

export interface SlipResultMessageParams {
    status: 'success' | 'amount_mismatch' | 'duplicate_slip' | 'unlinked_member' | 'wrong_bank' | 'no_debt'
    memberName?: string
    memberCode?: string
    lotteryTypeName?: string
    settlementMode?: 'immediate' | 'cross_round'
    roundDateText?: string
    expectedAmount?: number
    slipAmount?: number
    toleranceAmount?: number
    bankAccountText?: string
    pastDebtTotal?: number
    currentRoundPrize?: number
    adjustmentNote?: string | null
    transRef?: string
    transferDateText?: string
}

/**
 * Validates slip amount against expected payment amount taking dealer tolerance into account.
 */
export function validateSlipTolerance({
    slipAmount,
    expectedAmount,
    toleranceAmount = 0,
    toleranceMode = 'forgive_difference'
}: ToleranceParams): ToleranceResult {
    const sAmt = Number(slipAmount) || 0
    const expAmt = Number(expectedAmount) || 0
    const tol = Math.max(0, Number(toleranceAmount) || 0)

    const diff = Math.round((sAmt - expAmt) * 100) / 100

    if (Math.abs(diff) <= tol) {
        if (diff === 0) {
            return {
                isValid: true,
                diff: 0,
                recordedAmount: sAmt,
                adjustmentNote: null
            }
        }

        if (diff < 0) {
            // Underpaid but within tolerance
            const underpaid = Math.abs(diff)
            if (toleranceMode === 'forgive_difference') {
                return {
                    isValid: true,
                    diff,
                    recordedAmount: expAmt,
                    adjustmentNote: `ปัดเศษส่วนต่าง ฿${underpaid.toFixed(2)} ให้สมาชิก (ยอดสลิปจริง ฿${sAmt.toFixed(2)})`
                }
            } else {
                return {
                    isValid: true,
                    diff,
                    recordedAmount: sAmt,
                    adjustmentNote: `ชำระตามสลิป ฿${sAmt.toFixed(2)} (คงเหลือค้าง ฿${underpaid.toFixed(2)})`
                }
            }
        } else {
            // Overpaid within tolerance
            return {
                isValid: true,
                diff,
                recordedAmount: sAmt,
                adjustmentNote: `โอนเกิน ฿${diff.toFixed(2)} (ยอดเรียกเก็บ ฿${expAmt.toFixed(2)})`
            }
        }
    }

    return {
        isValid: false,
        diff,
        recordedAmount: sAmt,
        adjustmentNote: null
    }
}

/**
 * Calculates net debt for immediate settlement round.
 */
export function calculateImmediateDebt(
    totalAmount: number,
    totalCommission: number,
    totalWinnings: number,
    alreadyPaid: number = 0
): number {
    const net = (Number(totalAmount) || 0) - (Number(totalCommission) || 0) - (Number(totalWinnings) || 0) - (Number(alreadyPaid) || 0)
    return Math.max(0, Math.round(net * 100) / 100)
}

/**
 * Formats user-friendly LINE reply message.
 */
export function formatSlipSettlementLineMessage(params: SlipResultMessageParams): string {
    const lines: string[] = []
    const memberLabel = params.memberName
        ? `${params.memberName}${params.memberCode ? ` (${params.memberCode})` : ''}`
        : 'สมาชิก'

    if (params.status === 'success') {
        lines.push('🧾 บันทึกการชำระเงินอัตโนมัติ')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        lines.push(`📌 รูปแบบ: ${params.settlementMode === 'cross_round' ? 'เคลียร์งวดชนงวด (หักล้างรางวัล)' : 'เคลียร์งวดต่องวด'}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'cross_round') {
            if (params.pastDebtTotal !== undefined) {
                lines.push(`- รวมหนี้งวดค้างเก่า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                lines.push(`- หักลบรางวัลงวดนี้: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
        }

        if (params.expectedAmount !== undefined) {
            lines.push(`- ยอดที่ต้องโอนสุทธิ: ฿${params.expectedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        }
        if (params.slipAmount !== undefined) {
            lines.push(`💰 ยอดเงินตามสลิป: ฿${params.slipAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        }
        if (params.adjustmentNote) {
            lines.push(`ℹ️ หมายเหตุ: ${params.adjustmentNote}`)
        }
        if (params.bankAccountText) {
            lines.push(`💳 โอนเข้าบัญชี: ${params.bankAccountText}`)
        }
        lines.push('----------------------------')
        lines.push('✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว')
    } else if (params.status === 'amount_mismatch') {
        lines.push('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        lines.push('----------------------------')
        lines.push(`- ยอดที่ต้องชำระ: ฿${(params.expectedAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        lines.push(`- ยอดเงินในสลิป: ฿${(params.slipAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        const diff = Math.abs((params.slipAmount || 0) - (params.expectedAmount || 0))
        lines.push(`- ส่วนต่าง: ฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (ยอมรับได้ไม่เกิน ฿${(params.toleranceAmount || 0).toFixed(2)})`)
        lines.push('----------------------------')
        lines.push('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
    } else if (params.status === 'duplicate_slip') {
        lines.push('⚠️ สลิปนี้เคยใช้งานในระบบแล้ว')
        if (params.transRef) lines.push(`- รหัสธุรกรรม: ${params.transRef}`)
        if (params.transferDateText) lines.push(`- วันที่โอน: ${params.transferDateText}`)
        lines.push('❌ ระบบปฏิเสธการทำรายการซ้ำ')
    } else if (params.status === 'wrong_bank') {
        lines.push('⚠️ บัญชีปลายทางไม่ตรงกับบัญชีของเจ้ามือ')
        lines.push('❌ กรุณาตรวจสอบสลิปการโอนเงินอีกครั้ง')
    } else if (params.status === 'unlinked_member') {
        lines.push('ℹ️ ตรวจพบสลิปโอนเงิน')
        if (params.slipAmount) lines.push(`💰 ยอดเงิน: ฿${params.slipAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        lines.push('⚠️ บัญชี LINE ของท่านยังไม่ได้ผูกกับรหัสสมาชิกในระบบ')
        lines.push('กรุณาติดต่อเจ้ามือเพื่อผูกรหัสสมาชิกก่อนทำรายการ')
    } else if (params.status === 'no_debt') {
        lines.push('ℹ️ ตรวจสอบสลิปเรียบร้อย')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        lines.push('⚪ ปัจจุบันไม่มียอดหนี้ค้างชำระในงวดนี้')
    }

    return lines.join('\n')
}
