export const THAI_BANKS = [
    'ธนาคารกสิกรไทย',
    'ธนาคารไทยพาณิชย์',
    'ธนาคารกรุงเทพ',
    'ธนาคารกรุงไทย',
    'ธนาคารกรุงศรีอยุธยา',
    'ธนาคารทหารไทยธนชาต (ttb)',
    'ธนาคารออมสิน',
    'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    'ธนาคารอาคารสงเคราะห์',
    'ธนาคารยูโอบี',
    'ธนาคารซีไอเอ็มบี',
    'ธนาคารเกียรตินาคินภัทร',
    'ธนาคารแลนด์ แอนด์ เฮ้าส์',
    'พร้อมเพย์',
    'อื่นๆ'
]

export function matchBankOption(rawName, options = THAI_BANKS) {
    if (!rawName || typeof rawName !== 'string') return ''
    const trimmed = rawName.trim()
    if (!trimmed) return ''

    const exact = options.find(opt => opt.toLowerCase() === trimmed.toLowerCase())
    if (exact) return exact

    const cleanRaw = trimmed.replace(/^ธนาคาร\s*/, '').toLowerCase()
    const cleanMatch = options.find(opt => {
        const cleanOpt = opt.replace(/^ธนาคาร\s*/, '').toLowerCase()
        return cleanOpt === cleanRaw || opt.toLowerCase().includes(cleanRaw) || cleanRaw.includes(cleanOpt)
    })
    if (cleanMatch) return cleanMatch

    return trimmed
}

export const BOT_BANK_CODE_MAP = {
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
    '069': { fullName: 'ธนาคารเกียรตินาคินภัทร', shortName: 'เกียรตินาคินภัทร' },
    '070': { fullName: 'ธนาคารไอซีบีซี', shortName: 'ไอซีบีซี' },
    '071': { fullName: 'ธนาคารไทยเครดิต', shortName: 'ไทยเครดิต' },
    '073': { fullName: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', shortName: 'แลนด์ แอนด์ เฮ้าส์' }
}

export function getSenderBankShortName(slipData) {
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

export function getSlipTransferTime(slipData) {
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

export function isPromptPayReceiver(receiverData) {
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

export function isDealerBankMatchingSlip(dealerBankName, receiverData) {
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

export function getSlipDestinationAccountNote(receiverData, dealerBankAccounts = []) {
    let matchedAccount = null
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
