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
    status: 'success' | 'amount_mismatch' | 'duplicate_slip' | 'unlinked_member' | 'wrong_bank' | 'no_debt' | 'invalid_slip'
    memberName?: string
    memberCode?: string
    lotteryTypeName?: string
    settlementMode?: 'immediate' | 'cross_round' | 'cross_round_all' | 'auto'
    roundDateText?: string
    currentRoundDateText?: string
    expectedAmount?: number
    slipAmount?: number
    toleranceAmount?: number
    bankAccountText?: string
    pastDebtTotal?: number
    currentRoundPrize?: number
    currentRoundDebt?: number
    pastCreditsTotal?: number
    pastDebts?: Array<{ roundDate?: string; debt: number }>
    pastCredits?: Array<{ roundDate?: string; debt: number }>
    totalAllDebts?: number
    adjustmentNote?: string | null
    transRef?: string
    transferDateText?: string
    senderLineUserId?: string
    autoCandidatesSummary?: string
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
    const expAmt = Math.round(Number(expectedAmount) || 0)
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
    const net = Math.round((Number(totalAmount) || 0) - (Number(totalCommission) || 0) - (Number(totalWinnings) || 0)) - Math.round(Number(alreadyPaid) || 0)
    return Math.max(0, net)
}

const THAI_MONTHS = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
]

export function formatThaiDate(dateStr?: string): string {
    if (!dateStr) return ''
    try {
        const parts = dateStr.split('-')
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10) + 543
            const month = THAI_MONTHS[parseInt(parts[1], 10) - 1]
            const day = parseInt(parts[2], 10)
            return `${day} ${month} ${year}`
        }
    } catch {
        // Fallback
    }
    return dateStr
}

export function formatThaiDateDDMMYYYY(dateStr?: string, separator: string = '-'): string {
    if (!dateStr) return '-'
    try {
        const iso = dateStr.slice(0, 10)
        const parts = iso.split('-')
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10)
            const d = parseInt(parts[2], 10)
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                const thaiYear = y > 2500 ? y : y + 543
                const dd = String(d).padStart(2, '0')
                const mm = String(m).padStart(2, '0')
                return `${dd}${separator}${mm}${separator}${thaiYear}`
            }
        }
    } catch {
        // Fallback
    }
    return dateStr
}

/**
 * Formats user-friendly LINE reply message.
 */
function formatSettlementModeLabel(mode?: string): string {
    if (mode === 'cross_round') return 'เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)'
    if (mode === 'cross_round_all') return 'เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)'
    if (mode === 'auto') return 'ตรวจสอบอัตโนมัติ'
    return 'เคลียร์งวดต่องวด'
}

export function formatSlipSettlementLineMessage(params: SlipResultMessageParams): string {
    const lines: string[] = []
    const memberLabel = params.memberName
        ? `${params.memberName}${params.memberCode ? ` (${params.memberCode})` : ''}`
        : 'สมาชิก'

    if (params.status === 'success') {
        lines.push('🧾 บันทึกการชำระเงินอัตโนมัติ')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        if (params.roundDateText) lines.push(`📅 งวดวันที่: ${formatThaiDate(params.roundDateText)}`)
        lines.push(`📌 รูปแบบ: ${formatSettlementModeLabel(params.settlementMode)}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'cross_round' || params.settlementMode === 'cross_round_all') {
            if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                lines.push(`- รวมหนี้งวดก่อนหน้า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.pastCreditsTotal !== undefined && params.pastCreditsTotal > 0) {
                lines.push(`- หักลบรางวัลค้างงวดก่อนๆ: -฿${params.pastCreditsTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                lines.push(`- หักลบรางวัลงวดล่าสุด: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
        } else if (params.settlementMode === 'immediate') {
            if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                lines.push(`- รวมยอดค้างงวดก่อนๆ: +฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.pastCreditsTotal !== undefined && params.pastCreditsTotal > 0) {
                lines.push(`- หักลบรางวัลค้างงวดก่อนๆ: -฿${params.pastCreditsTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
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
        lines.push('✅ บันทึกตัดชำระเรียบร้อยแล้ว✅')
        lines.push('🙏 ขอบคุณมากค่ะ 🙏')
    } else if (params.status === 'amount_mismatch') {
        lines.push('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        if (params.roundDateText) lines.push(`📅 งวดวันที่: ${formatThaiDate(params.roundDateText)}`)
        lines.push(`📌 รูปแบบ: ${formatSettlementModeLabel(params.settlementMode)}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'auto' && (params.currentRoundDebt !== undefined || (params.pastDebts && params.pastDebts.length > 0))) {
            lines.push('- ยอดที่ต้องชำระในระบบ:')
            if (params.currentRoundDebt !== undefined && params.currentRoundDebt > 0) {
                const curDate = formatThaiDateDDMMYYYY(params.currentRoundDateText || params.roundDateText)
                lines.push(`  • ยอดงวดปัจจุบัน ${curDate}: ฿${params.currentRoundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.pastDebts && params.pastDebts.length > 0) {
                for (const pd of params.pastDebts) {
                    if (pd.debt > 0) {
                        const pastDate = formatThaiDateDDMMYYYY(pd.roundDate)
                        lines.push(`  • ยอดค้างจ่ายงวด ${pastDate}: ฿${pd.debt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                    }
                }
            }
            if (params.pastCredits && params.pastCredits.length > 0) {
                for (const pc of params.pastCredits) {
                    const pastDate = formatThaiDateDDMMYYYY(pc.roundDate)
                    lines.push(`  • หักลบรางวัลค้างงวด ${pastDate}: -฿${Math.abs(pc.debt).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                }
            } else if (params.pastCreditsTotal && params.pastCreditsTotal > 0) {
                lines.push(`  • หักลบรางวัลค้างงวดก่อนๆ: -฿${params.pastCreditsTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize && params.currentRoundPrize > 0) {
                lines.push(`  • หักลบรางวัลงวดล่าสุด: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            lines.push('----------------------------')
            const total = params.totalAllDebts !== undefined
                ? params.totalAllDebts
                : Math.max(0, (params.currentRoundDebt || 0) + (params.pastDebts?.reduce((s, d) => s + (d.debt || 0), 0) || 0) - (params.pastCreditsTotal || 0) - (params.currentRoundPrize || 0))
            lines.push(`  • รวมทุกงวด: ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            lines.push(`- ยอดเงินในสลิป: ฿${(params.slipAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            lines.push('- ยอดเงินในสลิป ไม่ตรงตามเงื่อนไขการชำระ')
            lines.push('----------------------------')
            lines.push('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
        } else if (params.autoCandidatesSummary) {
            lines.push(params.autoCandidatesSummary)
            lines.push(`- ยอดเงินในสลิป: ฿${(params.slipAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            const diff = Math.abs((params.slipAmount || 0) - (params.expectedAmount || 0))
            lines.push(`- ส่วนต่าง: ฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (ยอมรับได้ไม่เกิน ฿${(params.toleranceAmount || 0).toFixed(2)})`)
            lines.push('----------------------------')
            lines.push('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
        } else {
            if (params.settlementMode === 'cross_round' || params.settlementMode === 'cross_round_all') {
                if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                    lines.push(`- รวมหนี้งวดก่อนหน้า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                }
                if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                    lines.push(`- หักลบรางวัลงวดล่าสุด: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                }
            } else if (params.settlementMode === 'immediate') {
                if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                    lines.push(`- รวมยอดค้างงวดก่อนๆ: +฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                }
                if (params.pastCreditsTotal !== undefined && params.pastCreditsTotal > 0) {
                    lines.push(`- หักลบรางวัลค้างงวดก่อนๆ: -฿${params.pastCreditsTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
                }
            }
            lines.push(`- ยอดที่ต้องชำระ: ฿${(params.expectedAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            lines.push(`- ยอดเงินในสลิป: ฿${(params.slipAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            const diff = Math.abs((params.slipAmount || 0) - (params.expectedAmount || 0))
            lines.push(`- ส่วนต่าง: ฿${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (ยอมรับได้ไม่เกิน ฿${(params.toleranceAmount || 0).toFixed(2)})`)
            lines.push('----------------------------')
            lines.push('❌ ยังไม่ได้ตัดยอดในระบบ กรุณาตรวจสอบกับเจ้ามือ')
        }
    } else if (params.status === 'duplicate_slip') {
        lines.push('⚠️ สลิปนี้เคยใช้งานในระบบแล้ว')
        if (params.transRef) lines.push(`- รหัสธุรกรรม: ${params.transRef}`)
        if (params.transferDateText) lines.push(`- วันที่โอน: ${params.transferDateText}`)
        lines.push('❌ ระบบปฏิเสธการทำรายการซ้ำ')
    } else if (params.status === 'wrong_bank') {
        lines.push('⚠️ บัญชีปลายทางไม่ตรงกับบัญชีของเจ้ามือ')
        if (params.bankAccountText) lines.push(`- ปลายทางในสลิป: ${params.bankAccountText}`)
        lines.push('❌ กรุณาตรวจสอบสลิปการโอนเงินอีกครั้ง')
    } else if (params.status === 'unlinked_member') {
        lines.push('ℹ️ ตรวจพบสลิปโอนเงิน')
        if (params.slipAmount) lines.push(`💰 ยอดเงิน: ฿${params.slipAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
        lines.push('⚠️ บัญชี LINE ของท่านยังไม่ได้ผูกกับรหัสสมาชิกในระบบ')
        if (params.senderLineUserId) lines.push(`(LINE UID: ${params.senderLineUserId})`)
        lines.push('กรุณาติดต่อเจ้ามือเพื่อผูกรหัสสมาชิกก่อนทำรายการ')
    } else if (params.status === 'no_debt') {
        lines.push('ℹ️ ตรวจสอบสลิปเรียบร้อย')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        if (params.roundDateText) lines.push(`📅 งวดวันที่: ${formatThaiDate(params.roundDateText)}`)
        lines.push('⚪ ปัจจุบันไม่มียอดหนี้ค้างชำระ')
    } else if (params.status === 'invalid_slip') {
        const isDelaySlip = params.adjustmentNote && (
            params.adjustmentNote.includes('กรุณารอ') ||
            params.adjustmentNote.includes('ล่าช้า') ||
            params.adjustmentNote.includes('ธนาคารกรุงเทพ') ||
            params.adjustmentNote.includes('delay')
        )
        if (isDelaySlip) {
            lines.push('❌ ไม่สามารถบันทึกการชำระเงินได้ ❌')
            if (params.adjustmentNote.includes('ธนาคารกรุงเทพ')) {
                lines.push('- สาเหตุ: เนื่องจากเป็นสลิปจากธนาคารกรุงเทพ การประมวลผลต้องใช้เวลาประมาณ 7-10 นาที กรุณาโยนสลิปลงในกลุ่มอีกครั้งหลังโอน 7-10 นาที')
            } else {
                lines.push(`- สาเหตุ: ${params.adjustmentNote} การประมวลผลของธนาคารต้องใช้เวลา กรุณาโยนสลิปลงในกลุ่มอีกครั้ง`)
            }
            lines.push('และกรุณาตรวจสอบ QR Code หรือความชัดเจนของสลิปด้วยค่ะ')
        } else {
            lines.push('⚠️ ไม่พบข้อมูลสลิปการโอนเงิน')
            if (params.adjustmentNote) lines.push(`- สาเหตุ: ${params.adjustmentNote}`)
            lines.push('❌ กรุณาตรวจสอบ QR Code หรือความชัดเจนของรูปภาพอีกครั้งค่ะ')
        }
    }

    return lines.join('\n')
}

export interface CrossRoundDebtItem {
    roundId: string
    roundDate: string
    lotteryType?: string
    debt: number
}

export interface CrossRoundAllocationParams {
    pastDebts: CrossRoundDebtItem[]
    pastCredits?: CrossRoundDebtItem[]
    currentRoundPrize: number
    slipAmount: number
    dealerId: string
    memberUserId: string
    currentRound: {
        id: string
        round_date?: string
        close_time?: string
        lottery_type?: string
    }
    paidAt: string
    transRef?: string
    adjustmentNote?: string | null
    slipData?: any
    dealerAccounts?: any[]
    currentRoundDebt?: number
}

export interface AllocatedPayment {
    dealer_id: string
    user_id: string
    round_id: string
    lottery_type?: string
    round_date?: string
    payment_type: 'net_settlement' | 'prize_payout'
    direction: 'member_to_dealer' | 'dealer_to_member'
    amount: number
    paid_at: string
    notes: string
    created_by: string
}

export interface CrossRoundAllocationResult {
    payments: AllocatedPayment[]
    remainingFunds: number
}

export const BOT_BANK_CODE_MAP: Record<string, { fullName: string; shortName: string }> = {
    '002': { fullName: 'ธนาคารกรุงเทพ', shortName: 'กรุงเทพ' },
    '004': { fullName: 'ธนาคารกสิกรไทย', shortName: 'กสิกรไทย' },
    '006': { fullName: 'ธนาคารกรุงไทย', shortName: 'กรุงไทย' },
    '011': { fullName: 'ธนาคารทหารไทยธนชาต (ttb)', shortName: 'ทหารไทยธนชาต (ttb)' },
    '014': { fullName: 'ธนาคารไทยพาณิชย์', shortName: 'ไทยพาณิชย์' },
    '022': { fullName: 'ธนาคารซีไอเอ็มบี', shortName: 'ซีไอเอ็มบี' },
    '024': { fullName: 'ธนาคารยูโอบี', shortName: 'ยูโอบี' },
    '025': { fullName: 'ธนาคารกรุงศรีอยุธยา', shortName: 'กรุงศรีอยุธยา' },
    '030': { fullName: 'ธนาคารออมสิน', shortName: 'ออมสิน' },
    '033': { fullName: 'ธนาคารอาคารสงเคราะห์', shortName: 'อาคารสงเคราะห์' },
    '034': { fullName: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)', shortName: 'ธ.ก.ส.' },
    '067': { fullName: 'ธนาคารทิสโก้', shortName: 'ทิสโก้' },
    '069': { fullName: 'ธนาคารเกียรตินาคินภัทร', shortName: 'เกียรตินาคินภัทร' },
    '070': { fullName: 'ธนาคารไอซีบีซี', shortName: 'ไอซีบีซี' },
    '071': { fullName: 'ธนาคารไทยเครดิต', shortName: 'ไทยเครดิต' },
    '073': { fullName: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', shortName: 'แลนด์ แอนด์ เฮ้าส์' }
}

export function getSenderBankShortName(slipData: any): string {
    if (!slipData) return ''
    const bankCode = String(slipData.sendingBank || slipData.sender?.bank?.id || '').padStart(3, '0')
    if (BOT_BANK_CODE_MAP[bankCode]) {
        return BOT_BANK_CODE_MAP[bankCode].shortName
    }

    const rawName = String(slipData.sender?.bank?.name || slipData.sender?.bank?.shortName || '').trim()
    if (!rawName) return ''

    const lower = rawName.toLowerCase()
    if (lower.includes('กสิกร') || lower.includes('kbank') || lower.includes('kasikorn')) return 'กสิกรไทย'
    if (lower.includes('ไทยพาณิชย์') || lower.includes('scb') || lower.includes('siam commercial')) return 'ไทยพาณิชย์'
    if (lower.includes('กรุงเทพ') || lower.includes('bbl') || lower.includes('bangkok')) return 'กรุงเทพ'
    if (lower.includes('กรุงไทย') || lower.includes('ktb') || lower.includes('krungthai')) return 'กรุงไทย'
    if (lower.includes('กรุงศรี') || lower.includes('bay') || lower.includes('krungsri')) return 'กรุงศรีอยุธยา'
    if (lower.includes('ทหารไทย') || lower.includes('ttb') || lower.includes('tmb')) return 'ทหารไทยธนชาต (ttb)'
    if (lower.includes('ออมสิน') || lower.includes('gsb')) return 'ออมสิน'
    if (lower.includes('ธ.ก.ส.') || lower.includes('baac') || lower.includes('เกษตร')) return 'ธ.ก.ส.'
    if (lower.includes('อาคารสงเคราะห์') || lower.includes('ghb')) return 'อาคารสงเคราะห์'
    if (lower.includes('ยูโอบี') || lower.includes('uob')) return 'ยูโอบี'
    if (lower.includes('ซีไอเอ็มบี') || lower.includes('cimb')) return 'ซีไอเอ็มบี'
    if (lower.includes('เกียรตินาคิน') || lower.includes('kkp')) return 'เกียรตินาคินภัทร'
    if (lower.includes('แลนด์ แอนด์ เฮ้าส์') || lower.includes('lhb')) return 'แลนด์ แอนด์ เฮ้าส์'

    return rawName.replace(/^ธนาคาร\s*/, '').trim()
}

export function getSlipTransferDate(slipData: any): string {
    if (!slipData) return ''
    if (slipData.transDate) {
        const str = String(slipData.transDate).trim()
        if (/^\d{8}$/.test(str)) {
            return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str
        }
    }
    if (slipData.transTimestamp) {
        try {
            const d = new Date(slipData.transTimestamp)
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
            }
        } catch {}
    }
    return ''
}

export function getSlipTransferTime(slipData: any): string {
    if (!slipData) return ''
    if (slipData.transTime) {
        const match = String(slipData.transTime).match(/^(\d{1,2}:\d{2})/)
        if (match) {
            return match[1].padStart(5, '0')
        }
    }
    if (slipData.transTimestamp) {
        try {
            const d = new Date(slipData.transTimestamp)
            if (!isNaN(d.getTime())) {
                return d.toLocaleTimeString('th-TH', {
                    timeZone: 'Asia/Bangkok',
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }
        } catch {}
    }
    return ''
}

export function isPromptPayReceiver(receiverData: any): boolean {
    if (!receiverData) return false
    if (receiverData.proxy?.value && String(receiverData.proxy.value).trim()) return true
    if (receiverData.proxy?.type && String(receiverData.proxy.type).trim() !== 'BANKAC') return true

    const rawBank = String(receiverData.bank?.name || receiverData.bank?.shortName || '').toLowerCase()
    if (rawBank.includes('พร้อมเพย์') || rawBank.includes('promptpay')) return true

    const rawVal = String(receiverData.account?.value || receiverData.proxy?.value || '').trim()
    const cleanDigits = rawVal.replace(/\D/g, '')
    // Thai mobile phone: starts with 06, 08, 09 and total 10 chars/masked
    if (/^0[689]/.test(rawVal) && (cleanDigits.length === 10 || (rawVal.includes('x') && rawVal.length >= 10))) {
        return true
    }
    // Thai national ID: 13 digits
    if (cleanDigits.length === 13 || (/^\d/.test(rawVal) && rawVal.includes('x') && rawVal.replace(/[^0-9xX*]/g, '').length === 13)) {
        return true
    }

    return false
}

function isDealerBankMatchingSlip(dealerBankName: string, receiverData: any): boolean {
    if (!dealerBankName || !receiverData) return false
    const dLower = dealerBankName.toLowerCase().replace(/^ธนาคาร\s*/, '').trim()

    if (receiverData.receivingBank && BOT_BANK_CODE_MAP[receiverData.receivingBank]) {
        const botShort = BOT_BANK_CODE_MAP[receiverData.receivingBank].shortName.toLowerCase()
        const botFull = BOT_BANK_CODE_MAP[receiverData.receivingBank].fullName.toLowerCase()
        if (dLower.includes(botShort) || botShort.includes(dLower) || dLower.includes(botFull) || botFull.includes(dLower)) {
            return true
        }
    }

    const rBank = String(receiverData.bank?.name || receiverData.bank?.shortName || '').toLowerCase().replace(/^ธนาคาร\s*/, '').trim()
    if (rBank) {
        if (dLower.includes(rBank) || rBank.includes(dLower)) {
            return true
        }
    }

    return false
}

export function getSlipDestinationAccountNote(receiverData: any, dealerBankAccounts: any[] = []): string {
    let matchedAccount: any = null
    const isPromptPay = isPromptPayReceiver(receiverData)

    if (dealerBankAccounts && dealerBankAccounts.length > 0 && receiverData) {
        const rawSlipVal = String(
            (isPromptPay ? (receiverData.proxy?.value || receiverData.account?.value) : (receiverData.account?.value || receiverData.proxy?.value))
            || ''
        ).trim()
        const slipDigitsOnly = rawSlipVal.replace(/\D/g, '')

        for (const dAcc of dealerBankAccounts) {
            const dealerBankLower = String(dAcc.bank_name || '').toLowerCase()
            const isDealerPromptPay = dealerBankLower.includes('พร้อมเพย์') || dealerBankLower.includes('promptpay')

            // If slip is PromptPay, do not match against non-PromptPay bank accounts unless digits explicitly match
            if (isPromptPay && !isDealerPromptPay && (!slipDigitsOnly || slipDigitsOnly.length < 4)) {
                continue
            }

            const dealerDigits = String(dAcc.bank_account || '').replace(/\D/g, '')
            if (dealerDigits && slipDigitsOnly && dealerDigits === slipDigitsOnly) {
                matchedAccount = dAcc
                break
            }
            const digitChunks = rawSlipVal.match(/\d+/g) || []
            for (const chunk of digitChunks) {
                if (chunk.length >= 4 && dealerDigits.includes(chunk)) {
                    matchedAccount = dAcc
                    break
                }
            }
            if (matchedAccount) break

            const cleanSlipMask = rawSlipVal.replace(/[^0-9xX*]/g, '')
            if (dealerDigits && cleanSlipMask.length === dealerDigits.length) {
                let unmaskedMatchCount = 0
                let mismatch = false
                for (let i = 0; i < cleanSlipMask.length; i++) {
                    const c = cleanSlipMask[i]
                    if (c === 'x' || c === 'X' || c === '*') continue
                    if (c === dealerDigits[i]) {
                        unmaskedMatchCount++
                    } else {
                        mismatch = true
                        break
                    }
                }
                if (!mismatch && unmaskedMatchCount >= 3) {
                    matchedAccount = dAcc
                    break
                }
            }
        }

        // Only fall back to dealer account if NOT PromptPay AND the bank actually matches
        if (!matchedAccount && !isPromptPay) {
            const sameBankAcc = dealerBankAccounts.find(d => isDealerBankMatchingSlip(d.bank_name, receiverData))
            if (sameBankAcc) {
                matchedAccount = sameBankAcc
            }
        }
    }

    if (matchedAccount) {
        const cleanBank = String(matchedAccount.bank_name || '').replace(/^ธนาคาร\s*/, '').trim()
        const accNum = String(matchedAccount.bank_account || '').trim()
        const accName = String(matchedAccount.account_name || '').trim()
        const parts = [cleanBank, accNum, accName ? `(${accName})` : ''].filter(Boolean)
        return parts.length > 0 ? `โอนไป ${parts.join(' ')}` : ''
    }

    if (receiverData) {
        let bankName = ''
        if (isPromptPay) {
            bankName = 'พร้อมเพย์'
        } else {
            bankName = receiverData.bank?.name || ''
            if (!bankName && receiverData.receivingBank && BOT_BANK_CODE_MAP[receiverData.receivingBank]) {
                bankName = BOT_BANK_CODE_MAP[receiverData.receivingBank].shortName
            }
        }

        const cleanBank = String(bankName || '').replace(/^ธนาคาร\s*/, '').trim()
        const accNum = String(
            (isPromptPay ? (receiverData.proxy?.value || receiverData.account?.value) : (receiverData.account?.value || receiverData.proxy?.value))
            || ''
        ).trim()
        const accName = String(
            (typeof receiverData.account?.name === 'object' ? receiverData.account?.name?.th : receiverData.account?.name)
            || receiverData.displayName
            || receiverData.name
            || ''
        ).trim()
        const parts = [cleanBank, accNum, accName ? `(${accName})` : ''].filter(Boolean)
        return parts.length > 0 ? `โอนไป ${parts.join(' ')}` : ''
    }

    return ''
}

export interface SlipTransferDetails {
    paidAt: string
    paidTime: string
    senderBank: string
    destinationNote: string
    referenceDoc: string
    fullNotes: string
}

export function extractSlipTransferDetails(params: {
    slipData: any
    dealerBankAccounts?: any[]
    prefix?: string
    adjustmentNote?: string | null
    fallbackPaidAt?: string
}): SlipTransferDetails {
    const { slipData, dealerBankAccounts = [], prefix = 'ชำระหนี้งวดนี้', adjustmentNote, fallbackPaidAt } = params

    const paidAt = getSlipTransferDate(slipData) || fallbackPaidAt || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const paidTime = getSlipTransferTime(slipData)
    const senderBank = getSenderBankShortName(slipData)
    let destinationNote = getSlipDestinationAccountNote(slipData?.receiver, dealerBankAccounts)
    if (adjustmentNote && adjustmentNote.trim()) {
        destinationNote = destinationNote ? `${destinationNote} - ${adjustmentNote.trim()}` : adjustmentNote.trim()
    }
    const referenceDoc = String(slipData?.transRef || '').trim()

    let noteContent = destinationNote
    if (senderBank) {
        noteContent = noteContent ? `${senderBank} ${noteContent}` : senderBank
    }
    const details = [
        noteContent,
        paidTime ? `เวลา ${paidTime}` : '',
        referenceDoc ? `#${referenceDoc}` : ''
    ].filter(Boolean).join(' ')

    const fullNotes = details ? `${prefix} (${details})` : prefix

    return {
        paidAt,
        paidTime,
        senderBank,
        destinationNote,
        referenceDoc,
        fullNotes
    }
}

/**
 * Extracts and formats the true round date (YYYY-MM-DD) which ALWAYS corresponds
 * to the draw/closing date (close_time / close_date), NOT open_time / open_date.
 * Uses 'Asia/Bangkok' timezone formatting.
 */
export function getRoundCloseDate(roundOrVal: any): string {
    if (!roundOrVal) return ''
    let raw = roundOrVal
    if (typeof roundOrVal === 'object' && !(roundOrVal instanceof Date)) {
        raw = roundOrVal.close_time || roundOrVal.close_date || roundOrVal.round_date || roundOrVal.open_time || roundOrVal.created_at || ''
    }
    if (!raw) return ''
    if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed
        }
    }
    try {
        const d = new Date(raw)
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        }
    } catch {
        // Fallback
    }
    return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

/**
 * Allocates clearing funds (current round prize + slip payment) to past debts in FIFO order.
 */
export function allocateCrossRoundOffset(params: CrossRoundAllocationParams): CrossRoundAllocationResult {
    const {
        pastDebts,
        pastCredits = [],
        currentRoundPrize = 0,
        slipAmount = 0,
        dealerId,
        memberUserId,
        currentRound,
        paidAt,
        transRef = '',
        adjustmentNote = null,
        slipData,
        dealerAccounts,
        currentRoundDebt = 0
    } = params

    const payments: AllocatedPayment[] = []
    const curRoundDate = getRoundCloseDate(currentRound)
    const prize = Math.max(0, Number(currentRoundPrize) || 0)
    const slip = Math.max(0, Number(slipAmount) || 0)

    let effectivePaidAt = paidAt
    let pastDebtNotes = `[สลิปอัตโนมัติ] หักล้างยอดข้ามงวด${transRef ? ` (Ref: ${transRef})` : ''}${adjustmentNote ? ` - ${adjustmentNote}` : ''}`

    if (slipData) {
        const details = extractSlipTransferDetails({
            slipData,
            dealerBankAccounts: dealerAccounts,
            prefix: 'ชำระหนี้งวดนี้',
            adjustmentNote,
            fallbackPaidAt: paidAt
        })
        pastDebtNotes = details.fullNotes
        if (details.paidAt) {
            effectivePaidAt = details.paidAt
        }
    }

    // 1. For each past round with unpaid prize credit (debt < 0), record prize payout to clear it
    let totalPastPrizeCredit = 0
    for (const credit of pastCredits) {
        const prizeAmt = Math.abs(Number(credit.debt) || 0)
        if (prizeAmt <= 0) continue
        totalPastPrizeCredit += prizeAmt

        let pastCreditNotes = `นำรางวัลไปหักล้างยอดข้ามงวด (งวด ${curRoundDate}) [สลิปอัตโนมัติ]${transRef ? ` #${transRef}` : ''}`
        if (slipData) {
            const prizeDetails = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: dealerAccounts,
                prefix: `นำรางวัลไปหักล้างยอดข้ามงวด (งวด ${curRoundDate}) [สลิปอัตโนมัติ]`,
                adjustmentNote,
                fallbackPaidAt: paidAt
            })
            pastCreditNotes = prizeDetails.fullNotes
        }

        payments.push({
            dealer_id: dealerId,
            user_id: memberUserId,
            round_id: credit.roundId,
            lottery_type: credit.lotteryType,
            round_date: credit.roundDate,
            payment_type: 'prize_payout',
            direction: 'dealer_to_member',
            amount: prizeAmt,
            paid_at: effectivePaidAt,
            notes: pastCreditNotes,
            created_by: dealerId
        })
    }

    // 2. Calculate how much current round prize is actually needed to offset past debts (after considering past prize credits)
    const totalPastDebts = pastDebts.reduce((sum, d) => sum + Math.max(0, Number(d.debt) || 0), 0)
    const pastDebtsAfterCredits = Math.max(0, totalPastDebts - totalPastPrizeCredit)
    const prizeUsedForPast = Math.min(prize, pastDebtsAfterCredits)

    // Current round prize payout record is ONLY created for the portion of prize actually used to clear past debts
    if (prizeUsedForPast > 0) {
        let prizeNotes = `หักล้างหนี้งวดเก่า [สลิปอัตโนมัติ]${transRef ? ` #${transRef}` : ''}`
        if (slipData) {
            const prizeDetails = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: dealerAccounts,
                prefix: 'หักล้างหนี้งวดเก่า [สลิปอัตโนมัติ]',
                adjustmentNote,
                fallbackPaidAt: paidAt
            })
            prizeNotes = prizeDetails.fullNotes
        }

        payments.push({
            dealer_id: dealerId,
            user_id: memberUserId,
            round_id: currentRound.id,
            lottery_type: currentRound.lottery_type,
            round_date: curRoundDate,
            payment_type: 'prize_payout',
            direction: 'dealer_to_member',
            amount: prizeUsedForPast,
            paid_at: effectivePaidAt,
            notes: prizeNotes,
            created_by: dealerId
        })
    }

    // 3. Allocate clearing funds (prizeUsedForPast + totalPastPrizeCredit + slip) to past debts
    let remainingToPast = Math.round((prizeUsedForPast + totalPastPrizeCredit + slip) * 100) / 100

    for (const past of pastDebts) {
        if (remainingToPast <= 0) break
        const debtAmt = Math.max(0, Number(past.debt) || 0)
        if (debtAmt <= 0) continue

        const alloc = Math.min(debtAmt, remainingToPast)
        remainingToPast = Math.round((remainingToPast - alloc) * 100) / 100

        if (alloc > 0) {
            payments.push({
                dealer_id: dealerId,
                user_id: memberUserId,
                round_id: past.roundId,
                lottery_type: past.lotteryType,
                round_date: past.roundDate,
                payment_type: 'net_settlement',
                direction: 'member_to_dealer',
                amount: alloc,
                paid_at: effectivePaidAt,
                notes: pastDebtNotes,
                created_by: dealerId
            })
        }
    }

    // 4. Allocate remaining slip funds to current round debt (if any)
    const totalPrizeUsedForPast = prizeUsedForPast + totalPastPrizeCredit
    const slipUsedForPast = Math.max(0, Math.min(slip, totalPastDebts - totalPrizeUsedForPast))
    let remainingSlipForCurrent = Math.max(0, Math.round((slip - slipUsedForPast) * 100) / 100)

    if (remainingSlipForCurrent > 0 && currentRoundDebt > 0) {
        const curAlloc = Math.min(currentRoundDebt, remainingSlipForCurrent)
        remainingSlipForCurrent = Math.round((remainingSlipForCurrent - curAlloc) * 100) / 100

        if (curAlloc > 0) {
            payments.push({
                dealer_id: dealerId,
                user_id: memberUserId,
                round_id: currentRound.id,
                lottery_type: currentRound.lottery_type,
                round_date: curRoundDate,
                payment_type: 'net_settlement',
                direction: 'member_to_dealer',
                amount: curAlloc,
                paid_at: effectivePaidAt,
                notes: pastDebtNotes,
                created_by: dealerId
            })
        }
    }

    return {
        payments,
        remainingFunds: remainingSlipForCurrent
    }
}

export interface CalculatePastDebtsParams {
    userId: string
    currentRoundId?: string
    currentRoundDate?: string
    targetLotteryType?: string
    userHistories?: any[]
    payments?: any[]
}

/**
 * Calculates member's outstanding debts across past rounds.
 * - Strictly filters by targetLotteryType so debts from other lotteries (e.g. Thai in Lao group) are not included.
 * - Applies 20% fallback commission if total_commission is missing/0.
 * - Aggregates payments by direction (member_to_dealer vs dealer_to_member).
 * - Excludes fractional satang rounding noise (requires Math.round(bal) > 0).
 * - Sorts FIFO (oldest first) for offset allocation.
 */
export interface MemberPastUnpaidRoundsResult {
    pastDebts: CrossRoundDebtItem[]
    pastCredits: CrossRoundDebtItem[]
}

/**
 * Calculates member's outstanding debts and prize credits across past rounds.
 * - Strictly filters by targetLotteryType so debts/credits from other lotteries are not included.
 * - Applies 20% fallback commission if total_commission is missing/0.
 * - Aggregates payments by direction (member_to_dealer vs dealer_to_member).
 * - Excludes fractional satang rounding noise (requires Math.round(bal) !== 0).
 * - Separates bal > 0 (debts) and bal < 0 (prize credits).
 * - Sorts FIFO (oldest first).
 */
export function calculateMemberPastUnpaidRounds({
    userId,
    currentRoundId,
    currentRoundDate,
    targetLotteryType,
    userHistories = [],
    payments = []
}: CalculatePastDebtsParams): MemberPastUnpaidRoundsResult {
    const normType = targetLotteryType ? String(targetLotteryType).trim().toLowerCase() : ''
    const roundMap: Record<string, {
        roundId: string
        roundDate: string
        lotteryType?: string
        total_amount: number
        total_commission: number
        total_winnings: number
    }> = {}

    for (const h of userHistories) {
        if (!h) continue
        const uId = h.user_id
        if (userId && uId && String(uId) !== String(userId)) continue

        const rId = String(h.round_id || h.id || '')
        if (!rId) continue
        if (currentRoundId && rId === String(currentRoundId)) continue

        const itemType = String(h.lottery_type || h.lotteryType || '').trim().toLowerCase()
        if (normType && itemType && itemType !== normType) continue

        const roundDate = getRoundCloseDate(h) || h.round_date || ''
        if (currentRoundDate && roundDate && roundDate > currentRoundDate) continue

        if (!roundMap[rId]) {
            roundMap[rId] = {
                roundId: rId,
                roundDate,
                lotteryType: h.lottery_type,
                total_amount: 0,
                total_commission: 0,
                total_winnings: 0
            }
        }

        const amt = Number(h.total_amount) || 0
        const comm = (h.total_commission !== undefined && h.total_commission !== null && Number(h.total_commission) > 0)
            ? Number(h.total_commission)
            : (amt > 0 ? Math.round(amt * 0.20) : 0)
        const win = Number(h.total_winnings) || 0

        roundMap[rId].total_amount += amt
        roundMap[rId].total_commission += comm
        roundMap[rId].total_winnings += win
        if (!roundMap[rId].roundDate && roundDate) roundMap[rId].roundDate = roundDate
        if (!roundMap[rId].lotteryType && h.lottery_type) roundMap[rId].lotteryType = h.lottery_type
    }

    const pastDebts: CrossRoundDebtItem[] = []
    const pastCredits: CrossRoundDebtItem[] = []

    for (const rId of Object.keys(roundMap)) {
        const item = roundMap[rId]
        const initial = Math.round(item.total_amount - item.total_commission - item.total_winnings)
        const roundPayments = (payments || []).filter(p => String(p.round_id || p.roundId) === rId)

        let paidByMember = 0
        let paidByDealer = 0
        for (const p of roundPayments) {
            const pAmt = Number(p.amount) || 0
            if (p.direction === 'member_to_dealer') {
                paidByMember += pAmt
            } else if (p.direction === 'dealer_to_member') {
                paidByDealer += pAmt
            }
        }

        const bal = Math.round(initial - paidByMember + paidByDealer)
        if (bal > 0) {
            pastDebts.push({
                roundId: rId,
                roundDate: item.roundDate,
                lotteryType: item.lotteryType,
                debt: bal
            })
        } else if (bal < 0) {
            pastCredits.push({
                roundId: rId,
                roundDate: item.roundDate,
                lotteryType: item.lotteryType,
                debt: bal
            })
        }
    }

    pastDebts.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))
    pastCredits.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))

    return { pastDebts, pastCredits }
}

/**
 * Calculates member's outstanding debts across past rounds (only bal > 0).
 */
export function calculateMemberPastDebts(params: CalculatePastDebtsParams): CrossRoundDebtItem[] {
    return calculateMemberPastUnpaidRounds(params).pastDebts
}

export interface ImmediateModeDebtParams {
    userId: string
    latestRound: {
        id: string
        round_date?: string
        close_time?: string
        lottery_type?: string
    }
    userHistories?: any[]
    payments?: any[]
    targetLotteryType: string
}

export interface ImmediateModeDebtResult {
    currentRoundDebt: number
    pastDebtsTotal: number
    pastCreditsTotal: number
    totalExpectedAmount: number
    debtsToPay: CrossRoundDebtItem[]
    pastCredits: CrossRoundDebtItem[]
}

/**
 * Implements Mode 1 (งวดต่องวด):
 * 1. Calculate net balance for latest round: (ยอดส่ง - ค่าคอม) - เงินถูกรางวัล - paidByMember + paidByDealer.
 * 2. If no past debts/credits, member pays this amount (if > 0).
 * 3. If there are unpaid balances from other rounds in this lottery type (either member owes dealer or dealer owes member prize),
 *    include them all into the net balance.
 * 4. If total net balance > 0, that is what member must transfer.
 */
export function calculateImmediateModeDebt({
    userId,
    latestRound,
    userHistories = [],
    payments = [],
    targetLotteryType
}: ImmediateModeDebtParams): ImmediateModeDebtResult {
    const normType = targetLotteryType ? String(targetLotteryType).trim().toLowerCase() : ''
    const latestRoundId = String(latestRound?.id || '')
    const latestRoundDate = getRoundCloseDate(latestRound) || latestRound?.round_date || ''

    // 1. Calculate latest round balance
    let curAmt = 0
    let curComm = 0
    let curWin = 0

    for (const h of userHistories) {
        if (!h) continue
        const uId = h.user_id
        if (userId && uId && String(uId) !== String(userId)) continue
        const rId = String(h.round_id || h.id || '')
        if (rId === latestRoundId) {
            const amt = Number(h.total_amount) || 0
            const comm = (h.total_commission !== undefined && h.total_commission !== null && Number(h.total_commission) > 0)
                ? Number(h.total_commission)
                : (amt > 0 ? Math.round(amt * 0.20) : 0)
            curAmt += amt
            curComm += comm
            curWin += Number(h.total_winnings) || 0
        }
    }

    const curInitial = Math.round(curAmt - curComm - curWin)
    const curPayments = (payments || []).filter(p => String(p.round_id || p.roundId) === latestRoundId)
    let curPaidByMember = 0
    let curPaidByDealer = 0
    for (const p of curPayments) {
        const amt = Number(p.amount) || 0
        if (p.direction === 'member_to_dealer') curPaidByMember += amt
        else if (p.direction === 'dealer_to_member') curPaidByDealer += amt
    }
    const currentRoundBal = Math.round(curInitial - curPaidByMember + curPaidByDealer)

    // 2. Calculate past rounds balances (rounds before latestRound)
    const pastDebts: CrossRoundDebtItem[] = []
    const pastCredits: CrossRoundDebtItem[] = []

    const roundMap: Record<string, {
        roundId: string
        roundDate: string
        lotteryType?: string
        total_amount: number
        total_commission: number
        total_winnings: number
    }> = {}

    for (const h of userHistories) {
        if (!h) continue
        const uId = h.user_id
        if (userId && uId && String(uId) !== String(userId)) continue

        const rId = String(h.round_id || h.id || '')
        if (!rId || rId === latestRoundId) continue

        const itemType = String(h.lottery_type || h.lotteryType || '').trim().toLowerCase()
        if (normType && itemType && itemType !== normType) continue

        const roundDate = getRoundCloseDate(h) || h.round_date || ''
        if (latestRoundDate && roundDate && roundDate > latestRoundDate) continue

        if (!roundMap[rId]) {
            roundMap[rId] = {
                roundId: rId,
                roundDate,
                lotteryType: h.lottery_type,
                total_amount: 0,
                total_commission: 0,
                total_winnings: 0
            }
        }

        const amt = Number(h.total_amount) || 0
        const comm = (h.total_commission !== undefined && h.total_commission !== null && Number(h.total_commission) > 0)
            ? Number(h.total_commission)
            : (amt > 0 ? Math.round(amt * 0.20) : 0)
        const win = Number(h.total_winnings) || 0

        roundMap[rId].total_amount += amt
        roundMap[rId].total_commission += comm
        roundMap[rId].total_winnings += win
        if (!roundMap[rId].roundDate && roundDate) roundMap[rId].roundDate = roundDate
        if (!roundMap[rId].lotteryType && h.lottery_type) roundMap[rId].lotteryType = h.lottery_type
    }

    for (const rId of Object.keys(roundMap)) {
        const item = roundMap[rId]
        const initial = Math.round(item.total_amount - item.total_commission - item.total_winnings)
        const roundPayments = (payments || []).filter(p => String(p.round_id || p.roundId) === rId)

        let paidByMember = 0
        let paidByDealer = 0
        for (const p of roundPayments) {
            const amt = Number(p.amount) || 0
            if (p.direction === 'member_to_dealer') paidByMember += amt
            else if (p.direction === 'dealer_to_member') paidByDealer += amt
        }

        const bal = Math.round(initial - paidByMember + paidByDealer)
        if (bal > 0) {
            pastDebts.push({
                roundId: rId,
                roundDate: item.roundDate,
                lotteryType: item.lotteryType,
                debt: bal
            })
        } else if (bal < 0) {
            pastCredits.push({
                roundId: rId,
                roundDate: item.roundDate,
                lotteryType: item.lotteryType,
                debt: bal
            })
        }
    }

    pastDebts.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))
    pastCredits.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))

    const pastDebtsTotal = pastDebts.reduce((sum, d) => sum + d.debt, 0)
    const pastCreditsTotal = pastCredits.reduce((sum, c) => sum + Math.abs(c.debt), 0)

    const debtsToPay: CrossRoundDebtItem[] = [...pastDebts]
    if (currentRoundBal > 0) {
        debtsToPay.push({
            roundId: latestRoundId,
            roundDate: latestRoundDate,
            lotteryType: latestRound.lottery_type,
            debt: currentRoundBal
        })
    }

    const netTotal = currentRoundBal + pastDebtsTotal - pastCreditsTotal
    const totalExpectedAmount = Math.max(0, Math.round(netTotal))

    return {
        currentRoundDebt: Math.max(0, currentRoundBal),
        pastDebtsTotal,
        pastCreditsTotal,
        totalExpectedAmount,
        debtsToPay,
        pastCredits
    }
}

/**
 * Allocates payments for Mode 1 (งวดต่องวด):
 * 1. If past prize credits exist, record dealer_to_member prize payouts to offset.
 * 2. Allocate slipAmount + credits to debtsToPay (FIFO: oldest past rounds first, then latest round).
 */
export function allocateImmediateSettlement(params: {
    debtsToPay: CrossRoundDebtItem[]
    pastCredits: CrossRoundDebtItem[]
    slipAmount: number
    dealerId: string
    memberUserId: string
    latestRound: { id: string; round_date?: string; close_time?: string; lottery_type?: string }
    paidAt: string
    transRef?: string
    adjustmentNote?: string | null
    slipData?: any
    dealerAccounts?: any[]
}): { payments: AllocatedPayment[]; remainingFunds: number } {
    const { debtsToPay, pastCredits, slipAmount, dealerId, memberUserId, latestRound, paidAt, transRef, adjustmentNote, slipData, dealerAccounts } = params

    const payments: AllocatedPayment[] = []
    let effectivePaidAt = paidAt
    let defaultNotes = `[สลิปอัตโนมัติ] ชำระงวดต่องวด${transRef ? ` (Ref: ${transRef})` : ''}${adjustmentNote ? ` - ${adjustmentNote}` : ''}`

    if (slipData) {
        const details = extractSlipTransferDetails({
            slipData,
            dealerBankAccounts: dealerAccounts,
            prefix: 'ชำระหนี้งวดนี้',
            adjustmentNote,
            fallbackPaidAt: paidAt
        })
        defaultNotes = details.fullNotes
        if (details.paidAt) effectivePaidAt = details.paidAt
    }

    // 1. Record prize payout for any past credits used to offset debts
    let totalCreditsUsed = 0
    for (const credit of pastCredits) {
        const creditAmt = Math.abs(credit.debt)
        totalCreditsUsed += creditAmt

        let prizeNotes = `นำรางวัลไปหักล้างยอด [สลิปอัตโนมัติ] (สลิปโอน ฿${slipAmount.toLocaleString()})`
        if (slipData) {
            const creditDetails = extractSlipTransferDetails({
                slipData,
                dealerBankAccounts: dealerAccounts,
                prefix: 'นำรางวัลไปหักล้างยอด [สลิปอัตโนมัติ]',
                adjustmentNote,
                fallbackPaidAt: paidAt
            })
            prizeNotes = creditDetails.fullNotes
        }

        payments.push({
            dealer_id: dealerId,
            user_id: memberUserId,
            round_id: credit.roundId,
            lottery_type: credit.lotteryType,
            round_date: credit.roundDate,
            payment_type: 'prize_payout',
            direction: 'dealer_to_member',
            amount: creditAmt,
            paid_at: effectivePaidAt,
            notes: prizeNotes,
            created_by: dealerId
        })
    }

    // 2. Allocate funds (slipAmount + totalCreditsUsed) to debtsToPay (FIFO)
    let remaining = Math.round((slipAmount + totalCreditsUsed) * 100) / 100

    for (const debtItem of debtsToPay) {
        if (remaining <= 0) break
        const debtAmt = Math.max(0, debtItem.debt)
        if (debtAmt <= 0) continue

        const alloc = Math.min(debtAmt, remaining)
        remaining = Math.round((remaining - alloc) * 100) / 100

        if (alloc > 0) {
            payments.push({
                dealer_id: dealerId,
                user_id: memberUserId,
                round_id: debtItem.roundId,
                lottery_type: debtItem.lotteryType,
                round_date: debtItem.roundDate,
                payment_type: 'net_settlement',
                direction: 'member_to_dealer',
                amount: alloc,
                paid_at: effectivePaidAt,
                notes: defaultNotes,
                created_by: dealerId
            })
        }
    }

    return {
        payments,
        remainingFunds: remaining
    }
}

export interface CrossRoundModeDebtParams {
    userId: string
    latestAnnouncedRound: {
        id: string
        round_date?: string
        close_time?: string
        lottery_type?: string
    }
    userHistories?: any[]
    payments?: any[]
    targetLotteryType: string
}

export interface CrossRoundModeDebtResult {
    latestRoundPrize: number
    pastDebtsTotal: number
    pastCreditsTotal?: number
    expectedAmount: number
    pastDebts: CrossRoundDebtItem[]
    pastCredits?: CrossRoundDebtItem[]
    currentRoundDebt: number
    totalDebtWithCurrent: number
}

/**
 * Implements Mode 2 (งวดชนงวด):
 * 1. "คำว่างวดล่าสุด ให้หมายถึงงวดล่าสุดที่ประกาศผลรางวัลแล้ว"
 * 2. "ถ้าไม่มีการถูกรางวัล เงินที่สมาชิกต้องโอน ก็คือเงินงวดก่อนหน้าที่ยังค้างอยู่ ไม่ว่ากี่งวดก็ตามที่มีในระบบ"
 * 3. "และถ้างวดล่าสุดสมาชิกมีการถูกรางวัล ก็ให้เอาเงินรางวัลนั้นมาหักกับเงินค้างงวดอื่นๆ โดยยังไม่ต้องโอน เงินจ่ายสุทธิ ซึ่งก็คือ(ยอดส่ง-ค่าคอม)"
 * 4. หากสมาชิกไม่มีหนี้งวดก่อนหน้า (pastDebtsTotal === 0) แต่มีหนี้ในงวดล่าสุดที่ประกาศผล ยอดที่ต้องชำระ (expectedAmount) คือหนี้ของงวดล่าสุดนั้น (เช่น กรณีพี่น้ำ)
 * 5. หากสมาชิกมีทั้งหนี้งวดเก่าและงวดล่าสุด สามารถรับชำระได้ทั้งแบบเคลียร์เฉพาะงวดเก่า หรือเคลียร์รวมทั้งหมด (totalDebtWithCurrent)
 */
export function calculateCrossRoundModeDebt({
    userId,
    latestAnnouncedRound,
    userHistories = [],
    payments = [],
    targetLotteryType
}: CrossRoundModeDebtParams): CrossRoundModeDebtResult {
    const latestRoundId = String(latestAnnouncedRound?.id || '')
    const latestRoundDate = getRoundCloseDate(latestAnnouncedRound) || latestAnnouncedRound?.round_date || ''

    // 1. Calculate latest announced round details (net bet, winnings, payments)
    let curAmt = 0
    let curComm = 0
    let latestWin = 0

    for (const h of userHistories) {
        if (!h) continue
        const uId = h.user_id
        if (userId && uId && String(uId) !== String(userId)) continue
        const rId = String(h.round_id || h.id || '')
        if (rId === latestRoundId) {
            const amt = Number(h.total_amount) || 0
            const comm = (h.total_commission !== undefined && h.total_commission !== null && Number(h.total_commission) > 0)
                ? Number(h.total_commission)
                : (amt > 0 ? Math.round(amt * 0.20) : 0)
            curAmt += amt
            curComm += comm
            latestWin += Number(h.total_winnings) || 0
        }
    }

    const curPayments = (payments || []).filter(p => String(p.round_id || p.roundId) === latestRoundId)
    let alreadyPrizePaid = 0
    let curPaidByMember = 0
    let curPaidByDealer = 0
    for (const p of curPayments) {
        const amt = Number(p.amount) || 0
        if (p.payment_type === 'prize_payout' && p.direction === 'dealer_to_member') {
            alreadyPrizePaid += amt
        }
        if (p.direction === 'member_to_dealer') {
            curPaidByMember += amt
        } else if (p.direction === 'dealer_to_member') {
            curPaidByDealer += amt
        }
    }
    const availableWinnings = Math.max(0, Math.round(latestWin - alreadyPrizePaid))

    // Net initial debt of current round: (ยอดส่ง - ค่าคอม) - เงินถูกรางวัล
    const curInitial = Math.round(curAmt - curComm - latestWin)
    const currentRoundDebt = Math.max(0, Math.round(curInitial - curPaidByMember + curPaidByDealer))

    // 2. Calculate past debts and credits strictly before latestAnnouncedRound
    const { pastDebts, pastCredits } = calculateMemberPastUnpaidRounds({
        userId,
        currentRoundId: latestRoundId,
        currentRoundDate: latestRoundDate,
        targetLotteryType,
        userHistories,
        payments
    })

    const pastDebtsTotal = pastDebts.reduce((sum, d) => sum + d.debt, 0)
    const pastCreditsTotal = pastCredits.reduce((sum, c) => sum + Math.abs(c.debt), 0)

    const totalPrizeForPastDebts = availableWinnings + pastCreditsTotal

    // Net past debt: past debts minus (current round winnings + past prize credits)
    const netPastDebt = Math.max(0, Math.round(pastDebtsTotal - totalPrizeForPastDebts))

    // Surplus past prize credits (beyond past debts) can offset current round debt.
    // (Note: availableWinnings is from the current round and is ALREADY deducted from currentRoundDebt,
    // so availableWinnings cannot be applied to currentRoundDebt a second time!)
    const surplusPastCreditsForCurrent = Math.max(0, Math.round(pastCreditsTotal - pastDebtsTotal))
    const netCurrentDebt = Math.max(0, Math.round(currentRoundDebt - surplusPastCreditsForCurrent))

    // If member has past debts, the primary cross-round expected amount is netPastDebt.
    // If past debts are fully covered by prizes (netPastDebt === 0) or member had no past debts,
    // expectedAmount is netCurrentDebt.
    const expectedAmount = pastDebtsTotal > 0
        ? (netPastDebt > 0 ? netPastDebt : netCurrentDebt)
        : netCurrentDebt

    const totalDebtWithCurrent = Math.round(netPastDebt + netCurrentDebt)

    return {
        latestRoundPrize: availableWinnings,
        pastDebtsTotal,
        pastCreditsTotal,
        expectedAmount,
        pastDebts,
        pastCredits,
        currentRoundDebt,
        totalDebtWithCurrent
    }
}

export interface AutoSettlementCandidateResult {
    matched: boolean
    mode?: 'immediate' | 'cross_round' | 'cross_round_all'
    expectedAmount?: number
    label?: string
    candidateImmediate?: number
    candidateCrossRound?: number
    candidateCrossRoundAll?: number
}

/**
 * Evaluates a slip against the 3 settlement candidates in auto mode:
 * 1. immediate: currentRoundDebt
 * 2. cross_round: netPastDebt (pastDebtsTotal - availableWinnings)
 * 3. cross_round_all: totalDebtWithCurrent (netPastDebt + currentRoundDebt)
 */
export function evaluateAutoSettlementCandidate(params: {
    slipAmount: number
    toleranceAmount: number
    currentRoundDebt: number
    netPastDebt: number
    totalDebtWithCurrent: number
    pastDebtsTotal?: number
}): AutoSettlementCandidateResult {
    const slipAmt = params.slipAmount || 0
    const tolAmt = params.toleranceAmount || 0
    const curDebt = Math.max(0, Math.round(params.currentRoundDebt || 0))
    const netPast = Math.max(0, Math.round(params.netPastDebt || 0))
    const totDebt = Math.max(0, Math.round(params.totalDebtWithCurrent || 0))
    const pastTot = Math.max(0, Math.round(params.pastDebtsTotal || 0))
    const hasPast = pastTot > 0

    // Candidates:
    // 1. Immediate: currentRoundDebt
    // 2. Cross Round: netPastDebt (or curDebt if no past debt)
    // 3. Cross Round All:
    //    - Gross All: currentRoundDebt + pastDebtsTotal (e.g. 31130 + 62839 = 93969)
    //    - Net All: totalDebtWithCurrent (netPast + curDebt = 29889 + 31130 = 61019)
    const candidateImmediate = curDebt > 0 ? curDebt : 0
    const candidateCrossRound = hasPast ? (netPast > 0 ? netPast : 0) : 0
    const candidateGrossAll = (curDebt > 0 && pastTot > 0) ? Math.round(curDebt + pastTot) : 0
    const candidateNetAll = (totDebt > 0 && totDebt !== candidateCrossRound && totDebt !== candidateImmediate && totDebt !== candidateGrossAll) ? totDebt : 0
    const candidateCrossRoundAll = candidateGrossAll > 0 ? candidateGrossAll : (candidateNetAll > 0 ? candidateNetAll : (totDebt > 0 ? totDebt : 0))

    const candidates: Array<{
        mode: 'immediate' | 'cross_round' | 'cross_round_all'
        amount: number
        label: string
        diff: number
    }> = []

    // Check candidate 2 (cross_round)
    if (candidateCrossRound > 0 && Math.abs(slipAmt - candidateCrossRound) <= tolAmt) {
        candidates.push({
            mode: 'cross_round',
            amount: candidateCrossRound,
            label: 'เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)',
            diff: Math.abs(slipAmt - candidateCrossRound)
        })
    }

    // Check candidate 1 (immediate)
    if (candidateImmediate > 0 && Math.abs(slipAmt - candidateImmediate) <= tolAmt) {
        candidates.push({
            mode: 'immediate',
            amount: candidateImmediate,
            label: 'เคลียร์งวดต่องวด',
            diff: Math.abs(slipAmt - candidateImmediate)
        })
    }

    // Check candidate 3 (cross_round_all - gross: curDebt + pastTot)
    if (candidateGrossAll > 0 && candidateGrossAll !== candidateCrossRound && candidateGrossAll !== candidateImmediate && Math.abs(slipAmt - candidateGrossAll) <= tolAmt) {
        candidates.push({
            mode: 'cross_round_all',
            amount: candidateGrossAll,
            label: 'เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)',
            diff: Math.abs(slipAmt - candidateGrossAll)
        })
    }

    // Check candidate 3 (cross_round_all - net: netPast + curDebt)
    if (candidateNetAll > 0 && Math.abs(slipAmt - candidateNetAll) <= tolAmt) {
        candidates.push({
            mode: 'cross_round_all',
            amount: candidateNetAll,
            label: 'เคลียร์หนี้ทั้งหมด (รวมงวดปัจจุบัน)',
            diff: Math.abs(slipAmt - candidateNetAll)
        })
    }

    if (candidates.length === 0) {
        return {
            matched: false,
            candidateImmediate,
            candidateCrossRound,
            candidateCrossRoundAll
        }
    }

    // Sort by smallest difference
    candidates.sort((a, b) => a.diff - b.diff)
    const best = candidates[0]

    return {
        matched: true,
        mode: best.mode,
        expectedAmount: best.amount,
        label: best.label,
        candidateImmediate,
        candidateCrossRound,
        candidateCrossRoundAll
    }
}


