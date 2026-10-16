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
    settlementMode?: 'immediate' | 'cross_round'
    roundDateText?: string
    expectedAmount?: number
    slipAmount?: number
    toleranceAmount?: number
    bankAccountText?: string
    pastDebtTotal?: number
    currentRoundPrize?: number
    currentRoundDebt?: number
    pastCreditsTotal?: number
    adjustmentNote?: string | null
    transRef?: string
    transferDateText?: string
    senderLineUserId?: string
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
        if (params.roundDateText) lines.push(`📅 งวดวันที่: ${formatThaiDate(params.roundDateText)}`)
        lines.push(`📌 รูปแบบ: ${params.settlementMode === 'cross_round' ? 'เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)' : 'เคลียร์งวดต่องวด'}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'cross_round') {
            if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                lines.push(`- รวมหนี้งวดก่อนหน้า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                lines.push(`- หักลบรางวัลงวดล่าสุด: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundDebt !== undefined && params.currentRoundDebt > 0 && ((params.pastDebtTotal || 0) === 0 || (params.expectedAmount || 0) >= params.currentRoundDebt)) {
                lines.push(`- ยอดสุทธิงวดนี้: ฿${params.currentRoundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
        } else if (params.settlementMode === 'immediate') {
            if (params.currentRoundDebt !== undefined) {
                lines.push(`- ยอดสุทธิงวดนี้: ฿${params.currentRoundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
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
        lines.push('✅ บันทึกตัดชำระในระบบเรียบร้อยแล้ว')
    } else if (params.status === 'amount_mismatch') {
        lines.push('⚠️ แจ้งเตือนยอดเงินไม่ตรง')
        lines.push(`👤 สมาชิก: ${memberLabel}`)
        if (params.lotteryTypeName) lines.push(`🎯 ประเภทหวย: ${params.lotteryTypeName}`)
        if (params.roundDateText) lines.push(`📅 งวดวันที่: ${formatThaiDate(params.roundDateText)}`)
        lines.push(`📌 รูปแบบ: ${params.settlementMode === 'cross_round' ? 'เคลียร์งวดชนงวด (หักรางวัล/ยกยอด)' : 'เคลียร์งวดต่องวด'}`)
        lines.push('----------------------------')

        if (params.settlementMode === 'cross_round') {
            if (params.pastDebtTotal !== undefined && params.pastDebtTotal > 0) {
                lines.push(`- รวมหนี้งวดก่อนหน้า: ฿${params.pastDebtTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundPrize !== undefined && params.currentRoundPrize > 0) {
                lines.push(`- หักลบรางวัลงวดล่าสุด: -฿${params.currentRoundPrize.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
            if (params.currentRoundDebt !== undefined && params.currentRoundDebt > 0 && ((params.pastDebtTotal || 0) === 0 || (params.expectedAmount || 0) >= params.currentRoundDebt)) {
                lines.push(`- ยอดสุทธิงวดนี้: ฿${params.currentRoundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
        } else if (params.settlementMode === 'immediate') {
            if (params.currentRoundDebt !== undefined) {
                lines.push(`- ยอดสุทธิงวดนี้: ฿${params.currentRoundDebt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`)
            }
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
        lines.push('⚠️ ไม่พบข้อมูลสลิปการโอนเงิน')
        if (params.adjustmentNote) lines.push(`- สาเหตุ: ${params.adjustmentNote}`)
        lines.push('❌ กรุณาตรวจสอบ QR Code หรือความชัดเจนของรูปภาพอีกครั้งค่ะ')
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
    if (lower.includes('กสิกร') || lower.includes('kbank')) return 'กสิกรไทย'
    if (lower.includes('ไทยพาณิชย์') || lower.includes('scb')) return 'ไทยพาณิชย์'
    if (lower.includes('กรุงเทพ') || lower.includes('bbl')) return 'กรุงเทพ'
    if (lower.includes('กรุงไทย') || lower.includes('ktb')) return 'กรุงไทย'
    if (lower.includes('กรุงศรี') || lower.includes('bay')) return 'กรุงศรีอยุธยา'
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

export function getSlipDestinationAccountNote(receiverData: any, dealerBankAccounts: any[] = []): string {
    let matchedAccount: any = null

    if (dealerBankAccounts && dealerBankAccounts.length > 0 && receiverData) {
        const rawSlipVal = String(receiverData.account?.value || receiverData.proxy?.value || '').trim()
        const slipDigitsOnly = rawSlipVal.replace(/\D/g, '')

        for (const dAcc of dealerBankAccounts) {
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

        if (!matchedAccount) {
            if (dealerBankAccounts.length === 1) {
                matchedAccount = dealerBankAccounts[0]
            } else {
                matchedAccount = dealerBankAccounts.find(a => a.is_default) || dealerBankAccounts[0]
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
        let bankName = receiverData.bank?.name || ''
        if (!bankName && receiverData.receivingBank && BOT_BANK_CODE_MAP[receiverData.receivingBank]) {
            bankName = BOT_BANK_CODE_MAP[receiverData.receivingBank].shortName
        }
        const cleanBank = String(bankName || '').replace(/^ธนาคาร\s*/, '').trim()
        const accNum = String(receiverData.account?.value || receiverData.proxy?.value || '').trim()
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

    // 1. Current round prize payout record (if prize > 0)
    if (prize > 0) {
        payments.push({
            dealer_id: dealerId,
            user_id: memberUserId,
            round_id: currentRound.id,
            lottery_type: currentRound.lottery_type,
            round_date: curRoundDate,
            payment_type: 'prize_payout',
            direction: 'dealer_to_member',
            amount: prize,
            paid_at: effectivePaidAt,
            notes: `หักล้างหนี้งวดเก่า [สลิปอัตโนมัติ]${transRef ? ` #${transRef}` : ''}`,
            created_by: dealerId
        })
    }

    // 2. Allocate clearing funds (prize + slip) to past debts
    let remaining = Math.round((prize + slip) * 100) / 100

    for (const past of pastDebts) {
        if (remaining <= 0) break
        const debtAmt = Math.max(0, Number(past.debt) || 0)
        if (debtAmt <= 0) continue

        const alloc = Math.min(debtAmt, remaining)
        remaining = Math.round((remaining - alloc) * 100) / 100

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

    // 3. Allocate remaining funds to current round debt (if any)
    if (remaining > 0 && currentRoundDebt > 0) {
        const curAlloc = Math.min(currentRoundDebt, remaining)
        remaining = Math.round((remaining - curAlloc) * 100) / 100

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
        remainingFunds: remaining
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
export function calculateMemberPastDebts({
    userId,
    currentRoundId,
    currentRoundDate,
    targetLotteryType,
    userHistories = [],
    payments = []
}: CalculatePastDebtsParams): CrossRoundDebtItem[] {
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

    const results: CrossRoundDebtItem[] = []

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
            results.push({
                roundId: rId,
                roundDate: item.roundDate,
                lotteryType: item.lotteryType,
                debt: bal
            })
        }
    }

    return results.sort((a, b) => (a.roundDate || '').localeCompare(b.roundDate || ''))
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
            notes: `นำรางวัลไปหักล้างยอด (สลิปโอน ฿${slipAmount.toLocaleString()})`,
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
    expectedAmount: number
    pastDebts: CrossRoundDebtItem[]
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
        } else if (p.direction === 'dealer_to_member' && p.payment_type !== 'prize_payout') {
            curPaidByDealer += amt
        }
    }
    const availableWinnings = Math.max(0, Math.round(latestWin - alreadyPrizePaid))

    // Net initial debt of current round: (ยอดส่ง - ค่าคอม) - เงินถูกรางวัล
    const curInitial = Math.round(curAmt - curComm - latestWin)
    const currentRoundDebt = Math.max(0, Math.round(curInitial - curPaidByMember + curPaidByDealer))

    // 2. Calculate past debts strictly before latestAnnouncedRound
    const pastDebts = calculateMemberPastDebts({
        userId,
        currentRoundId: latestRoundId,
        currentRoundDate: latestRoundDate,
        targetLotteryType,
        userHistories,
        payments
    })

    const pastDebtsTotal = pastDebts.reduce((sum, d) => sum + d.debt, 0)
    const netPastDebt = Math.max(0, Math.round(pastDebtsTotal - availableWinnings))

    // If member has past debts, the primary cross-round expected amount is netPastDebt.
    // If member has NO past debts (pastDebtsTotal === 0), they owe the current round debt!
    const expectedAmount = pastDebtsTotal > 0 ? netPastDebt : currentRoundDebt
    const totalDebtWithCurrent = Math.round(netPastDebt + currentRoundDebt)

    return {
        latestRoundPrize: availableWinnings,
        pastDebtsTotal,
        expectedAmount,
        pastDebts,
        currentRoundDebt,
        totalDebtWithCurrent
    }
}

