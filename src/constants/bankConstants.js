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
