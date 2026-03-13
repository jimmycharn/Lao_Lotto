import { getPermutations } from '../constants/lotteryTypes'

/**
 * Parse multi-line pasted text into bet entries.
 * 
 * Supports:
 * - Context lines: "บน", "บ", "บ.", "ล่าง", "ล", "ล." set top/bottom mode
 * - Number lines: "123=20", "123=20*20", "123 20*20", "1234", etc.
 * - Auto-detection of bet type from digit count, amount parts, and permutation count
 * 
 * @param {string} text - Raw pasted text (multi-line)
 * @param {string} lotteryType - 'thai', 'lao', or 'hanoi'
 * @returns {Array<{ numbers: string, amount: number, amount2: number|null, betType: string, typeLabel: string, rawLine: string, formattedLine: string }>}
 */
export function parseMultiLinePaste(text, lotteryType = 'lao') {
    if (!text || !text.trim()) return []

    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
    const lines = text.split('\n')
    const results = []
    let contextMode = 'top' // default: บน

    for (const rawLine of lines) {
        const trimmed = rawLine.trim()
        if (!trimmed) continue

        // Check if this line is a context-setting line (บน/ล่าง)
        const modeResult = parseContextLine(trimmed)
        if (modeResult !== null) {
            contextMode = modeResult
            continue
        }

        // Try to parse as a number line
        const parsed = parseNumberLine(trimmed, contextMode, isLaoOrHanoi, lotteryType)
        if (parsed) {
            results.push(...parsed)
        }
    }

    return results
}

/**
 * Strip timestamp, Thai text, and other noise prefixes from a line.
 * Examples:
 *   "08:18 ไอซ์(ร้านตัดผม) 528=20*20" → "528=20*20"
 *   "12:30 ข้อความ 285=10*6" → "285=10*6"
 *   "285=10*6" → "285=10*6" (no change)
 *   "1234" → "1234" (no change)
 */
function stripPrefixNoise(line) {
    let s = line.trim()

    // Remove leading timestamp patterns: HH:MM, HH:MM:SS, HH.MM, etc.
    s = s.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '')

    // Remove leading Thai text (and parenthesized text) until we hit a digit
    // Keep stripping Thai chars, spaces, parens, punctuation until a digit block
    s = s.replace(/^[^\d]*(?=[\d])/, '')

    return s.trim()
}

/**
 * Check if a line is a context-setting line (บน/ล่าง)
 * Returns 'top', 'bottom', or null if not a context line
 */
function parseContextLine(line) {
    // Match standalone "บ", "บ.", "บน" (not attached to other Thai chars)
    // Match standalone "ล", "ล.", "ล่าง" (not attached to other Thai chars)
    const cleaned = line.replace(/[^ก-๛a-zA-Z0-9]/g, '').trim()

    if (/^(บน|บ)$/.test(cleaned)) return 'top'
    if (/^(ล่าง|ล)$/.test(cleaned)) return 'bottom'

    // Also check original line with punctuation: "บ.", "ล."
    const withPunct = line.trim()
    if (/^บ\.?$/.test(withPunct)) return 'top'
    if (/^ล\.?$/.test(withPunct)) return 'bottom'
    if (/^บน$/.test(withPunct)) return 'top'
    if (/^ล่าง$/.test(withPunct)) return 'bottom'

    return null
}

/**
 * Get unique permutation count for a number string
 */
function getPermutationCount(numStr) {
    if (!numStr || numStr.length < 2) return 1
    const perms = getPermutations(numStr)
    return perms.length
}

/**
 * Parse a single number line into one or more bet entries
 */
function parseNumberLine(line, contextMode, isLaoOrHanoi, lotteryType) {
    // Strip timestamp/Thai text prefixes first
    let normalized = stripPrefixNoise(line)
    if (!normalized) return null

    // Normalize separators:
    // Replace &, ×, · between amounts with *
    // Replace . between digit groups with * (e.g., "258.33.20" → "258*33*20")
    // Replace - and + between amounts with *
    // Also handle "ชุด" keyword

    // Handle "ชุด" attached to number: "123=50ชุด" → "123=50*ชุด"
    normalized = normalized.replace(/(\d)(ชุด)/g, '$1*ชุด')

    // Normalize dot-separated format: "258.33.20" → "258=33*20"
    // Pattern: digits.digits.digits (3 groups separated by dots)
    const dotTriple = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/)
    if (dotTriple) {
        normalized = `${dotTriple[1]}=${dotTriple[2]}*${dotTriple[3]}`
    }

    // Normalize & and × between amount parts to *
    // e.g., "54=50&50" → "54=50*50", "304=11×10" → "304=11*10"
    normalized = normalized.replace(/[&×]/g, '*')
    // Replace 'x' or 'X' only when between digits: "11x10" → "11*10"
    normalized = normalized.replace(/(\d)[xX](\d)/g, '$1*$2')

    // Extract numbers and amounts from the line
    // Supported formats:
    //   123=20          → numbers=123, amount1=20
    //   123=20*20       → numbers=123, amount1=20, amount2=20
    //   123=20-20       → numbers=123, amount1=20, amount2=20
    //   123=20+20       → numbers=123, amount1=20, amount2=20
    //   123 20*20       → numbers=123, amount1=20, amount2=20
    //   123 20          → numbers=123, amount1=20
    //   1234            → numbers=1234 (bare 4-digit for lao/hanoi → 4_set=1)
    //   258.33.20       → numbers=258, amount1=33, amount2=20
    //   54=50&50        → numbers=54, amount1=50, amount2=50
    //   304=11×10       → numbers=304, amount1=11, amount2=10

    let numbers = null
    let amount1 = null
    let amount2 = null
    let hasChud = false // "ชุด" keyword present

    // Try format with = first
    const eqMatch = normalized.match(/^(\d+)\s*[=]\s*(.+)$/)
    if (eqMatch) {
        numbers = eqMatch[1]
        const amountPart = eqMatch[2].trim()
        const parsed = parseAmountPart(amountPart)
        amount1 = parsed.amount1
        amount2 = parsed.amount2
        hasChud = parsed.hasChud
    } else {
        // Try format with space: "123 20*20" or "123 20"
        const spaceMatch = normalized.match(/^(\d+)\s+(.+)$/)
        if (spaceMatch) {
            numbers = spaceMatch[1]
            const amountPart = spaceMatch[2].trim()
            const parsed = parseAmountPart(amountPart)
            amount1 = parsed.amount1
            amount2 = parsed.amount2
            hasChud = parsed.hasChud
        } else {
            // Bare number (no amount): e.g., "1234" for 4_set
            const bareMatch = normalized.match(/^(\d+)$/)
            if (bareMatch) {
                numbers = bareMatch[1]
            }
        }
    }

    if (!numbers || numbers.length < 1 || numbers.length > 5) return null
    if (!/^\d+$/.test(numbers)) return null

    const numLen = numbers.length
    const permCount = numLen >= 2 ? getPermutationCount(numbers) : 1

    // Determine bet type and format based on digit count, amounts, context
    return determineBetType(numbers, numLen, amount1, amount2, hasChud, permCount, contextMode, isLaoOrHanoi, lotteryType, line)
}

/**
 * Parse the amount part of a line (after = or space)
 * Returns { amount1, amount2, hasChud }
 */
function parseAmountPart(str) {
    let hasChud = false
    let cleaned = str.trim()

    // Check for "ชุด" keyword
    if (cleaned.includes('ชุด')) {
        hasChud = true
        cleaned = cleaned.replace(/\*?ชุด/g, '').trim()
    }

    // Split by * or - or + (amount separators)
    const parts = cleaned.split(/[*\-+]/).map(s => s.trim()).filter(s => s)

    const amount1 = parts[0] ? parseInt(parts[0]) : null
    const amount2 = parts[1] ? parseInt(parts[1]) : null

    // If hasChud but no amount2, amount2 will be calculated as permutation count later
    return { amount1: (amount1 && amount1 > 0) ? amount1 : null, amount2: (amount2 && amount2 > 0) ? amount2 : null, hasChud }
}

/**
 * Determine bet type and return formatted entries
 */
function determineBetType(numbers, numLen, amount1, amount2, hasChud, permCount, contextMode, isLaoOrHanoi, lotteryType, rawLine) {
    const isTop = contextMode === 'top'
    const results = []

    // === 1 digit ===
    if (numLen === 1) {
        if (amount1 === null) return null
        const betType = isTop ? 'run_top' : 'run_bottom'
        const typeLabel = isTop ? 'ลอยบน' : 'ลอยล่าง'
        results.push({
            numbers,
            amount: amount1,
            amount2: null,
            betType,
            typeLabel,
            rawLine,
            formattedLine: `${numbers}=${amount1} ${typeLabel}`
        })
        return results
    }

    // === 2 digits ===
    if (numLen === 2) {
        if (amount1 === null) return null

        if (amount2 !== null) {
            // 2 amounts → กลับ (reverse)
            const betType = isTop ? '2_top' : '2_bottom'
            const typeLabel = isTop ? 'บนกลับ' : 'ล่างกลับ'
            results.push({
                numbers,
                amount: amount1,
                amount2,
                betType,
                specialType: 'reverse',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${amount2} ${typeLabel}`
            })
        } else {
            // 1 amount → บน or ล่าง
            const betType = isTop ? '2_top' : '2_bottom'
            const typeLabel = isTop ? 'บน' : 'ล่าง'
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType,
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1} ${typeLabel}`
            })
        }
        return results
    }

    // === 3 digits ===
    if (numLen === 3) {
        if (amount1 === null) return null

        if (amount2 !== null || hasChud) {
            // Has second amount or "ชุด" keyword
            // Determine: เต็งโต๊ด vs คูณชุด
            const effectiveAmount2 = hasChud ? permCount : amount2

            if (effectiveAmount2 === permCount) {
                // amount2 matches permutation count → คูณชุด
                const typeLabel = 'คูณชุด'
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: permCount,
                    betType: '3_top',
                    specialType: permCount === 3 ? 'set3' : (permCount === 6 ? 'set6' : 'set' + permCount),
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1}*${permCount} ${typeLabel}`
                })
            } else {
                // amount2 doesn't match permutation count → เต็งโต๊ด
                const typeLabel = 'เต็งโต๊ด'
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: effectiveAmount2,
                    betType: '3_top',
                    specialType: 'tengTod',
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
                })
            }
        } else {
            // Single amount → ตรง/บน (for lao/hanoi → ตรง, for thai → บน)
            // If context is ล่าง and 3 digits → treat as บน (per user's spec)
            const betType = '3_top'
            const typeLabel = isLaoOrHanoi ? 'ตรง' : 'บน'
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType,
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1} ${typeLabel}`
            })
        }
        return results
    }

    // === 4 digits ===
    if (numLen === 4) {
        // Bare 4-digit number (no amount) for lao/hanoi → 4_set=1
        if (amount1 === null) {
            if (isLaoOrHanoi) {
                results.push({
                    numbers,
                    amount: 1,
                    amount2: null,
                    betType: '4_set',
                    typeLabel: '4ตัวชุด',
                    rawLine,
                    formattedLine: `${numbers}=1 4ตัวชุด`
                })
                return results
            }
            return null // Thai needs amount
        }

        if (amount2 !== null || hasChud) {
            // 3 parts → คูณชุด (generate 3-digit combinations)
            const effectiveAmount2 = hasChud ? get3DigitPermCount(numbers) : amount2
            const typeLabel = 'คูณชุด'
            results.push({
                numbers,
                amount: amount1,
                amount2: effectiveAmount2,
                betType: '3_top',
                specialType: '3xPerm',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
            })
        } else {
            // 2 parts (numbers=amount)
            // Check if amount is small → could be 4_set (set count) for lao/hanoi
            if (isLaoOrHanoi && amount1 <= 99) {
                // Ambiguous: could be 4_set (set count) or 4_float (amount)
                // Use ลอยแพ by default when amount > 1, 4ตัวชุด when amount <= 10
                // Actually per spec: "1234=50 → ลอยแพ" regardless
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: null,
                    betType: '4_float',
                    typeLabel: 'ลอยแพ',
                    rawLine,
                    formattedLine: `${numbers}=${amount1} ลอยแพ`
                })
            } else {
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: null,
                    betType: '4_float',
                    typeLabel: 'ลอยแพ',
                    rawLine,
                    formattedLine: `${numbers}=${amount1} ลอยแพ`
                })
            }
        }
        return results
    }

    // === 5 digits ===
    if (numLen === 5) {
        if (amount1 === null) return null

        if (amount2 !== null || hasChud) {
            const effectiveAmount2 = hasChud ? get3DigitPermCount(numbers) : amount2
            const typeLabel = 'คูณชุด'
            results.push({
                numbers,
                amount: amount1,
                amount2: effectiveAmount2,
                betType: '3_top',
                specialType: '3xPerm',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
            })
        } else {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '5_float',
                typeLabel: 'ลอยแพ',
                rawLine,
                formattedLine: `${numbers}=${amount1} ลอยแพ`
            })
        }
        return results
    }

    return null
}

/**
 * Get 3-digit permutation count from 4 or 5 digit number
 * (number of unique 3-digit combinations × their permutations)
 */
function get3DigitPermCount(numbers) {
    const digits = numbers.split('')
    const combinations = new Set()

    for (let i = 0; i < digits.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            if (j === i) continue
            for (let k = 0; k < digits.length; k++) {
                if (k === i || k === j) continue
                combinations.add(digits[i] + digits[j] + digits[k])
            }
        }
    }

    return combinations.size
}
