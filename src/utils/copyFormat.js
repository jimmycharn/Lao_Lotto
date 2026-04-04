import { LOTTERY_TYPES, BET_TYPES_WITH_DIGITS as BET_TYPES } from '../constants/lotteryTypes'

// Bet type display order for copy text
const BET_TYPE_ORDER = [
    'run_top',        // ลอยบน / วิ่งบน
    'run_bottom',     // ลอยล่าง / วิ่งล่าง
    'front_top_1',    // หน้าบน
    'middle_top_1',   // กลางบน
    'back_top_1',     // หลังบน
    'front_bottom_1', // หน้าล่าง
    'back_bottom_1',  // หลังล่าง
    'pak_top',        // ปักบน
    'pak_bottom',     // ปักล่าง
    '2_top',          // 2 ตัวบน
    '2_front',        // 2 ตัวหน้า
    '2_center',       // 2 ตัวถ่าง
    '2_run',          // 2 ตัวลอย
    '2_bottom',       // 2 ตัวล่าง
    'teng_tod',       // 3 ตัวเต็งโต๊ด (virtual type)
    '3_top',          // 3 ตัวบน/ตรง
    '3_tod',          // 3 ตัวโต๊ด
    'koon_chud',      // คูณชุด (virtual type)
    '3_bottom',       // 3 ตัวล่าง
    '4_float',        // 4 ตัวลอย
    '5_float',        // 5 ตัวลอย
    '4_set',          // 4 ตัวชุด
]

// Thai type suffixes that appear at the end of display_numbers (longest first to match correctly)
const TYPE_SUFFIXES = [
    'เต็งโต๊ด', 'บนกลับ', 'ล่างกลับ', 'หน้ากลับ', 'ถ่างกลับ',
    'คูณชุด', '4ตัวชุด', 'ลอยแพ', 'ลอยบน', 'ลอยล่าง', 'วิ่งบน', 'วิ่งล่าง',
    'หน้าบน', 'หน้าล่าง', 'กลางบน', 'หลังบน', 'หลังล่าง',
    'ตรง', 'โต๊ด', 'บน', 'ล่าง', 'กลับ', 'หน้า', 'ถ่าง', 'ลอย', 'มี', 'ชุด'
]

/**
 * Strip Thai type suffix from a display_numbers line.
 * e.g. "553=10*3 คูณชุด" → "553=10*3"
 * Also returns the detected suffix if any.
 */
function stripTypeSuffix(rawLine) {
    let line = rawLine.trim()
    let detectedSuffix = null
    for (const suffix of TYPE_SUFFIXES) {
        if (line.endsWith(' ' + suffix)) {
            detectedSuffix = suffix
            line = line.substring(0, line.length - suffix.length).trim()
            break
        }
    }
    return { cleanLine: line, suffix: detectedSuffix }
}

// Get bet type label based on lottery type
function getBetTypeLabel(betType, lotteryType) {
    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
    if (betType === '3_top') return isLaoOrHanoi ? '3 ตัวตรง' : '3 ตัวบน'
    if (betType === 'teng_tod') return '3 ตัวเต็งโต๊ด'
    if (betType === 'koon_chud') return 'คูณชุด'
    if (betType === 'run_top') return 'ลอยบน'
    if (betType === 'run_bottom') return 'ลอยล่าง'
    return BET_TYPES[betType]?.label || betType
}

/**
 * Build grouped entries from raw submissions.
 * Uses display_numbers (raw input line) directly — it already contains
 * the correct format like "378=10*6", "26=20*20", etc.
 * Strips Thai type suffixes (e.g. "คูณชุด", "บน") so only number=amount remains.
 * 
 * Groups by entry_id first, then determines the display bet type.
 * Detects เต็งโต๊ด (same entry_id with 3_top + 3_tod).
 * Detects คูณชุด (suffix "คูณชุด" in display_numbers) for separate grouping.
 * 
 * Returns array of { displayType, displayLine, sortKey }
 */
function buildCopyEntries(submissions) {
    // Group all submissions by entry_id
    const byEntryId = {}
    submissions.forEach(sub => {
        const key = sub.entry_id || sub.id
        if (!byEntryId[key]) byEntryId[key] = []
        byEntryId[key].push(sub)
    })

    const results = []

    Object.entries(byEntryId).forEach(([entryId, entries]) => {
        const firstEntry = entries[0]
        // display_numbers stores the raw input line (e.g. "553=10*3 คูณชุด")
        const rawLine = firstEntry.display_numbers || `${firstEntry.numbers}=${firstEntry.amount}`
        const { cleanLine, suffix } = stripTypeSuffix(rawLine)

        // Detect เต็งโต๊ด: same entry_id has both 3_top and 3_tod
        const betTypes = new Set(entries.map(e => e.bet_type))
        const isTengTod = betTypes.has('3_top') && betTypes.has('3_tod') && entries.length >= 2

        if (isTengTod) {
            results.push({
                displayType: 'teng_tod',
                displayLine: cleanLine,
                sortKey: firstEntry.numbers,
                payoutPercent: firstEntry.actual_payout_percent
            })
            return
        }

        // Detect คูณชุด from suffix
        if (suffix === 'คูณชุด') {
            results.push({
                displayType: 'koon_chud',
                displayLine: cleanLine,
                sortKey: firstEntry.numbers,
                payoutPercent: firstEntry.actual_payout_percent
            })
            return
        }

        // Use the bet_type from first entry
        results.push({
            displayType: firstEntry.bet_type,
            displayLine: cleanLine,
            sortKey: firstEntry.numbers,
            payoutPercent: firstEntry.actual_payout_percent
        })
    })

    return results
}

/**
 * Format submissions for clipboard copy
 * @param {Object} options
 * @param {Array} options.submissions - Array of submission objects
 * @param {Object} options.round - Round object with lottery_type, lottery_name, close_time, currency_symbol
 * @param {string} options.userName - User's display name
 * @param {string} [options.billName] - Optional bill name/note for per-bill copy
 * @returns {string} Formatted text for clipboard
 */
export function formatCopyText({ submissions, round, userName, billName, bonusSettings }) {
    if (!submissions || submissions.length === 0) return ''

    const lotteryType = round.lottery_type
    const currencySymbol = round.currency_symbol || '฿'

    // Group individual submissions by bet_type (full/expanded — one line per submission)
    const groupedByType = {}
    submissions.forEach(sub => {
        const bt = sub.bet_type
        if (!groupedByType[bt]) groupedByType[bt] = []
        groupedByType[bt].push(sub)
    })

    // Sort bet types by defined order
    const sortedBetTypes = Object.keys(groupedByType).sort((a, b) => {
        const idxA = BET_TYPE_ORDER.indexOf(a)
        const idxB = BET_TYPE_ORDER.indexOf(b)
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
    })

    // Calculate total actual amount from all submissions
    const totalAmount = submissions.reduce((sum, s) => sum + s.amount, 0)

    /**
     * Reconstruct base amount (before bonus) mathematically using the exact bonus settings.
     * This avoids all issues with display_amount string parsing for grouped combinations.
     */
    const getBaseAmountForSub = (sub) => {
        let base = sub.amount
        if (bonusSettings && bonusSettings.bonusEnabled && bonusSettings.betTypeBonus) {
            const bt = sub.bet_type
            if (bt !== '4_set') {
                const bonusPct = bonusSettings.betTypeBonus[bt] || 0
                if (bonusPct > 0) {
                    base = Math.round(sub.amount / (1 + bonusPct / 100))
                }
            }
        }
        return base
    }

    const baseAmount = submissions.reduce((sum, s) => sum + getBaseAmountForSub(s), 0)
    const bonusAmount = totalAmount - baseAmount

    // Format close time (date only, no time)
    const closeTime = round.close_time ? new Date(round.close_time) : null
    const closeDateStr = closeTime
        ? closeTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-'

    // Build header
    let text = `📋 ${round.lottery_name || LOTTERY_TYPES[lotteryType] || lotteryType}\n`
    if (billName) {
        text += `🎫 ใบโพย: ${billName}\n`
    }
    text += `📅 งวดวันที่: ${closeDateStr}\n`
    text += `👤 ผู้ขาย: ${userName || '-'}\n`
    text += `📊 ทั้งหมด (${submissions.length} รายการ)\n`
    if (bonusAmount > 0) {
        text += `💰 ยอดแทง: ${currencySymbol}${baseAmount.toLocaleString()}\n`
        text += `🎁 ยอดแถม: ${currencySymbol}${bonusAmount.toLocaleString()}\n`
    } else {
        text += `💰 ยอดรวม: ${currencySymbol}${totalAmount.toLocaleString()}\n`
    }
    text += `━━━━━━━━━━━━━━━━\n`

    // Build body grouped by bet type — each submission is its own line
    sortedBetTypes.forEach((betType, idx) => {
        const label = getBetTypeLabel(betType, lotteryType)
        text += `${label}\n`

        // Sort items by number
        const items = groupedByType[betType].sort((a, b) => {
            return (a.numbers || '').localeCompare(b.numbers || '', undefined, { numeric: true })
        })

        items.forEach(sub => {
            let line = `${sub.numbers}=${sub.amount}`
            // Add payout annotation if not 100%
            const pct = sub.actual_payout_percent
            if (pct != null && pct !== 100) {
                if (pct === 50) {
                    line += ' จ่ายครึ่ง'
                } else {
                    line += ` จ่าย ${pct}%`
                }
            }
            text += `${line}\n`
        })

        // Add separator between groups
        if (idx < sortedBetTypes.length - 1) {
            text += `---------------------\n`
        }
    })

    text += `━━━━━━━━━━━━━━━━`
    return text
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch (err) {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        return true
    }
}
