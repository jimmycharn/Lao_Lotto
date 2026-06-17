function isConversationalSingleNumberLine(line) {
    const trimmed = line.trim()
    const digitMatches = trimmed.match(/\d+/g) || []
    console.log('digitMatches:', digitMatches);
    if (digitMatches.length !== 1) {
        return false
    }

    const numStr = digitMatches[0]
    const textOnly = trimmed.replace(numStr, '').trim()
    console.log('textOnly:', JSON.stringify(textOnly));
    if (textOnly.length === 0) {
        return false
    }

    let cleaned = textOnly.toLowerCase()
    cleaned = cleaned.replace(/[\s.+\-*×xX\/=\(\)\[\]{}]/g, '')
    cleaned = cleaned.replace(/ตัวละ|ตูละ|ชุดละ|ตัวตรง|ตรง|กลับ|คูณชุด|คูณ|ชุด|บาท|บ\.?|บน|ล่าง|วิ่ง|ลอย|โต๊ด|มี|ตัว|ช|ซ/g, '')
    console.log('cleaned:', JSON.stringify(cleaned));

    if (cleaned.length === 0) {
        return false
    }

    const conversationalKeywords = [
        'โอน', 'จ่าย', 'ส่ง', 'เงิน', 'สลิป', 'แจ้ง', 'กิน', 'กาแฟ', 
        'รวม', 'ยอด', 'คะ', 'ค่ะ', 'ครับ', 'จ้า', 'ลูกค้า', 'ขอบคุณ', 
        'ทะลุ', 'ออก', 'นั้น', 'นี้', 'แล้ว', 'ได้', 'มี', 'ไป', 'มา'
    ]

    const hasConversationalKeyword = conversationalKeywords.some(kw => {
        const contains = cleaned.includes(kw);
        if (contains) {
            console.log(`Matched keyword "${kw}" in "${cleaned}"`);
        }
        return contains;
    })
    console.log('hasConversationalKeyword:', hasConversationalKeyword);
    if (hasConversationalKeyword || cleaned.length > 10) {
        return true
    }

    return false
}

console.log('20 พี่รี:', isConversationalSingleNumberLine('20 พี่รี'));
