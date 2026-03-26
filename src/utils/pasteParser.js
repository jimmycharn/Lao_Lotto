import { getPermutations } from '../constants/lotteryTypes'

// Debug flag for paste parser — set to true only when troubleshooting paste issues
const DEBUG_PASTE = false

/**
 * Parse multi-line pasted text into bet entries.
 * 
 * Supports:
 * - Context lines: "บน", "บ", "บ.", "ล่าง", "ล", "ล.", "บนล่าง", "บล", "ลบ", etc.
 * - Bare number buffering: bare digit lines accumulate until an amount-bearing line resolves them
 * - Trailing amount line: "15*ชุด", "=100", "20×20" applies amount to all buffered bare numbers
 * - Last line with number+amount: "395=15*ชุด" adds 395 to buffer then applies amount to all
 * - Inline context: "บน.77=30", "72=20*20 ล่าง", "39=บล10*10"
 * - "บนล่าง" mode: duplicates entries as both top and bottom
 * 
 * @param {string} text - Raw pasted text (multi-line)
 * @param {string} lotteryType - 'thai', 'lao', or 'hanoi'
 * @returns {Array<{ numbers: string, amount: number, amount2: number|null, betType: string, typeLabel: string, rawLine: string, formattedLine: string }>}
 */
export { get3DigitPermCount }

/**
 * Normalize Unicode characters commonly found in LINE chat / social media pastes.
 * Converts various dash, multiplication, and full-width variants to standard ASCII.
 */
function normalizeUnicode(str) {
    return str
        // Remove zero-width and invisible characters that break regex matching
        .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g, '')
        // Dashes: en-dash (–), em-dash (—), minus sign (−), figure dash (‒), horizontal bar (―) → hyphen-minus (-)
        .replace(/[\u2013\u2014\u2212\u2012\u2015]/g, '-')
        // Multiplication/asterisk variants: × (U+00D7), ✕ (U+2715), ✖ (U+2716), ⨉ (U+2A09),
        // ﹡ (U+FE61), ・ (U+30FB), ∗ (U+2217), ⁎ (U+204E), ✱ (U+2731), ✲ (U+2732),
        // ✳ (U+2733), ٭ (U+066D), ＊ (U+FF0A), ⋆ (U+22C6), ★ (U+2605), ☆ (U+2606) → *
        .replace(/[\u00D7\u2715\u2716\u2A09\uFE61\u30FB\u2217\u204E\u2731\u2732\u2733\u066D\uFF0A\u22C6]/g, '*')
        // Solidus variants: ∕ (U+2215), ⁄ (U+2044) → /
        .replace(/[\u2215\u2044]/g, '/')
        // Full-width digits → ASCII digits
        .replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
        // Full-width letters → ASCII letters (for x, X, t, T etc.)
        .replace(/[\uFF21-\uFF3A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41))
        .replace(/[\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF41 + 0x61))
        // Full-width symbols: ＝ → =, ＊ → *, ＋ → +, ／ → /, ，→ ,, ．→ .
        .replace(/\uFF1D/g, '=')
        .replace(/\uFF0A/g, '*')
        .replace(/\uFF0B/g, '+')
        .replace(/\uFF0F/g, '/')
        .replace(/\uFF0C/g, ',')
        .replace(/\uFF0E/g, '.')
        // Non-breaking space → regular space
        .replace(/\u00A0/g, ' ')
        // Smart quotes and other noise
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/[\u2018\u2019\u201A]/g, "'")
}

/**
 * Pre-process lines: expand comma/slash-separated numbers and normalize formatted amounts.
 * 
 * Rules:
 * 1. Comma/slash BEFORE = means multiple numbers sharing the same amount:
 *    "123,456,712=10*ชุด" → ["123=10*ชุด", "456=10*ชุด", "712=10*ชุด"]
 *    "145/237/201/308=20*20" → ["145=20*20", "237=20*20", "201=20*20", "308=20*20"]
 * 2. Comma AFTER = means formatted amount (strip commas):
 *    "123=1,000" → "123=1000"
 *    "12=25,000" → "12=25000"
 * 3. "ต" or "t" between two amounts → "*" (เต็งโต๊ด separator):
 *    "123=50 ต 50" → "123=50*50"
 *    "456=20t20" → "456=20*20"
 */
function expandLines(rawLines) {
    const expanded = []
    for (const rawLine of rawLines) {
        const trimmed = normalizeUnicode(rawLine.trim())
        if (!trimmed) { expanded.push(trimmed); continue }

        // --- Step 1: Normalize "ต" / "t" between amounts to "*" ---
        // "123=50 ต 50" → "123=50*50", "456=20t20" → "456=20*20"
        let line = trimmed.replace(/(\d)\s*[tTตt]\s*(\d)/g, '$1*$2')

        // --- Step 2: Normalize "/" and "+" between amounts to "*" ---
        // Only AFTER = sign: "789=50/50" → "789=50*50", "587=20+20" → "587=20*20"
        // Also handle space-separated: "174 10-10" → handled later in parseNumberLine
        if (line.includes('=')) {
            const eqIdx = line.indexOf('=')
            const beforeEq = line.substring(0, eqIdx)
            let afterEq = line.substring(eqIdx + 1)
            // Strip commas in amounts after = (formatted numbers like 1,000)
            afterEq = afterEq.replace(/(\d),(\d{3})/g, '$1$2')
            // Normalize / and + between digit groups in amount part to *
            afterEq = afterEq.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2')
            line = beforeEq + '=' + afterEq
        }

        // --- Step 3: Check for comma/slash-separated numbers BEFORE = or space+amount ---
        // "123,456,712=10*ชุด" → ["123=10*ชุด", "456=10*ชุด", "712=10*ชุด"]
        // "145/237/201/308=20*20" → ["145=20*20", "237=20*20", ...]
        // "123, 456 20*20" → ["123=20*20", "456=20*20"]
        // Strategy: find the numbers portion (before = or before space+amount),
        // check if it contains comma or slash separating multiple digit groups.
        let didExpand = false
        if (line.includes('=')) {
            const eqIdx = line.indexOf('=')
            const numsPart = line.substring(0, eqIdx).trim()
            const amtPart = line.substring(eqIdx + 1).trim()
            // Check if numsPart has comma or slash separating digit groups
            if (/[,/]/.test(numsPart)) {
                const numTokens = numsPart.split(/[,/]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s))
                if (numTokens.length >= 2) {
                    for (const num of numTokens) {
                        expanded.push(`${num}=${amtPart}`)
                    }
                    didExpand = true
                }
            }
        } else {
            // No = sign: check for "nums space amount" pattern
            // e.g., "123,456 20*20" or "123/456 20*20"
            const spaceAmtMatch = line.match(/^([\d,/\s]+?)\s+(\d+[*]\d+.*)$/)
            if (spaceAmtMatch) {
                const numsPart = spaceAmtMatch[1].trim()
                const amtPart = spaceAmtMatch[2].trim()
                if (/[,/]/.test(numsPart)) {
                    const numTokens = numsPart.split(/[,/]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s))
                    if (numTokens.length >= 2) {
                        for (const num of numTokens) {
                            expanded.push(`${num}=${amtPart}`)
                        }
                        didExpand = true
                    }
                }
            }
        }
        if (didExpand) continue

        // --- Step 4: Handle various separator formats without = sign ---
        if (!line.includes('=')) {
            // Strip trailing dot/period after number: "579. 11-10" → "579 11-10"
            line = line.replace(/^(\d{1,5})\.\s/, '$1 ')

            // "741/20/20" → "741=20*20" (num/amt/amt triple)
            const slashTriple = line.match(/^(\d{1,5})\s*\/\s*(\d+)\s*\/\s*(\d+)$/)
            if (slashTriple) {
                line = `${slashTriple[1]}=${slashTriple[2]}*${slashTriple[3]}`
            } else {
                // Normalize -, /, + between amounts in space-separated format:
                // "736 11-10" → "736 11*10", "52 20/20" → "52 20*20", "87 20+20" → "87 20*20"
                line = line.replace(/^(\d{1,5}\.?\s+\d+)\s*[\-/+]\s*(\d+)/, '$1*$2')
            }
        }

        expanded.push(line)
    }
    return expanded
}

export function parseMultiLinePaste(text, lotteryType = 'lao') {
    if (!text || !text.trim()) return []

    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
    const rawLines = text.split('\n')
    // Pre-process: expand lines with comma/slash-separated numbers and normalize amounts
    const lines = expandLines(rawLines)
    const results = []
    let contextMode = 'top' // default: บน
    let bareNumberBuffer = [] // accumulate bare numbers waiting for a trailing amount line

    /**
     * Flush bare number buffer: process each number individually (no trailing amount found).
     * For lao/hanoi 4-digit bare numbers → 4_set=1, others get skipped if no amount.
     */
    function flushBareBuffer() {
        for (const bareNum of bareNumberBuffer) {
            const parsed = parseNumberLine(bareNum, contextMode, isLaoOrHanoi, lotteryType)
            if (parsed) {
                if (contextMode === 'both') {
                    results.push(...emitBoth(bareNum, isLaoOrHanoi, lotteryType))
                } else {
                    results.push(...parsed)
                }
            }
        }
        bareNumberBuffer = []
    }

    /**
     * Apply an amount string to all buffered bare numbers, then clear the buffer.
     */
    function applyAmountToBuffer(amountStr, mode) {
        const ctx = mode || contextMode
        if (DEBUG_PASTE) console.log(`[applyAmountToBuffer] amountStr="${amountStr}" mode=${mode} ctx=${ctx} buffer=[${bareNumberBuffer.join(',')}]`)
        for (const bareNum of bareNumberBuffer) {
            const synthLine = `${bareNum}=${amountStr}`
            if (ctx === 'both') {
                const bothEntries = emitBoth(synthLine, isLaoOrHanoi, lotteryType)
                if (DEBUG_PASTE) console.log(`[applyAmountToBuffer] emitBoth("${synthLine}") → ${bothEntries.length} entries:`, bothEntries.map(e => e.formattedLine))
                results.push(...bothEntries)
            } else {
                const parsed = parseNumberLine(synthLine, ctx, isLaoOrHanoi, lotteryType)
                if (parsed) results.push(...parsed)
            }
        }
        bareNumberBuffer = []
    }

    for (let i = 0; i < lines.length; i++) {
        const trimmed = normalizeUnicode(lines[i].trim())
        if (!trimmed) continue

        if (DEBUG_PASTE) console.log(`[pasteParser] Line ${i}: "${trimmed}" | buffer=[${bareNumberBuffer.join(',')}] | contextMode=${contextMode}`)

        // Check if this line is a context-setting line (บน/ล่าง/บนล่าง)
        const modeResult = parseContextLine(trimmed)
        if (modeResult !== null) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → context line: ${modeResult}`)
            // Flush pending bare numbers before switching context
            if (bareNumberBuffer.length > 0) flushBareBuffer()
            contextMode = modeResult
            continue
        }

        // Check if this is a bare number line (digits only, 1-5 digits)
        if (isBareNumberLine(trimmed)) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → bare number, added to buffer`)
            bareNumberBuffer.push(trimmed)
            continue
        }

        // Strip prefix noise (timestamps, Thai names, etc.) and re-check
        const stripped = stripPrefixNoise(trimmed)
        const lineToProcess = stripped || trimmed
        if (DEBUG_PASTE) console.log(`[pasteParser]   → stripped: "${stripped}" from "${trimmed}"`)

        // After stripping noise, re-check if the result is a context line
        // e.g. "12:48 ไอซ์(ร้านตัดผม) ล่าง" → stripped still has noise but ends with "ล่าง"
        const strippedMode = parseContextLine(stripped)
        if (strippedMode !== null) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → stripped to context line: ${strippedMode}`)
            if (bareNumberBuffer.length > 0) flushBareBuffer()
            contextMode = strippedMode
            continue
        }
        // Also check if the original line ends with a trailing context keyword (after noise)
        const trailingCtx = extractTrailingContext(trimmed)
        if (trailingCtx !== null) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → trailing context detected: ${trailingCtx}`)
            if (bareNumberBuffer.length > 0) flushBareBuffer()
            contextMode = trailingCtx
            continue
        }

        // After stripping noise, the cleaned line might be a bare number
        if (stripped && isBareNumberLine(stripped)) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → stripped to bare number, added to buffer`)
            bareNumberBuffer.push(stripped)
            continue
        }

        // Not a bare number — check if it can resolve the buffer
        if (bareNumberBuffer.length > 0) {
            // Try to extract amount info from this line (try ORIGINAL first to preserve context like บล, fallback to stripped)
            const amountInfo = extractAmountFromLine(trimmed) || extractAmountFromLine(lineToProcess)
            if (DEBUG_PASTE) console.log(`[pasteParser]   → extractAmountFromLine:`, JSON.stringify(amountInfo))
            if (amountInfo) {
                // If this line also has its own number, add it to the buffer first
                if (amountInfo.number) {
                    bareNumberBuffer.push(amountInfo.number)
                }
                applyAmountToBuffer(amountInfo.amountStr, amountInfo.mode)
                continue
            }
            // This line is not an amount line — flush buffer individually first
            if (DEBUG_PASTE) console.log(`[pasteParser]   → flushing buffer (no amount found)`)
            flushBareBuffer()
        }

        // Process as a normal number+amount line
        // IMPORTANT: Check inline context from ORIGINAL line first (before stripping noise)
        // because stripPrefixNoise removes Thai text like "ล่าง" which is a context keyword.
        let processLine = (stripped && stripped !== trimmed) ? stripped : trimmed

        // Auto-reset context: when contextMode is 'bottom' or 'both' and we encounter a 3+ digit number,
        // reset to 'top' because 'bottom'/'both' context only applies to 1-2 digit numbers.
        // This handles cases like: "ล่าง 25=20*20 / 36=10*10 / 123=10*6 / 48=20" where
        // 123 and 48 should be treated as top (คูณชุด / บน) not bottom.
        if (contextMode === 'bottom' || contextMode === 'both') {
            const numMatch = (processLine || '').match(/^(\d+)/)
            if (numMatch && numMatch[1].length >= 3) {
                if (DEBUG_PASTE) console.log(`[pasteParser]   → auto-reset context from '${contextMode}' to 'top' (${numMatch[1].length}-digit number)`)
                contextMode = 'top'
            }
        }

        let lineCtx = getLineEffectiveContext(processLine, contextMode)
        // If stripped version lost context, try extracting from original trimmed line
        if (lineCtx === contextMode && stripped && stripped !== trimmed) {
            const origCtx = getLineEffectiveContext(trimmed, contextMode)
            if (origCtx !== contextMode) {
                lineCtx = origCtx
                // Also use the cleaned line from extractInlineContext on the original
                const origInline = extractInlineContext(trimmed)
                if (origInline.mode) {
                    processLine = origInline.cleaned
                }
            }
        }

        // When a line has an explicit inline context (anywhere in the line — prefix, suffix,
        // middle, attached to number/amount), update contextMode so subsequent lines inherit it.
        // This makes "ล่าง 25=20*20" or "25=20*20 ล่าง" or "25 ล่าง 20*20" etc.
        // all set contextMode to 'bottom' for following 1-2 digit lines.
        if (lineCtx !== contextMode) {
            if (DEBUG_PASTE) console.log(`[pasteParser]   → inline context updates contextMode: ${contextMode} → ${lineCtx}`)
            contextMode = lineCtx
        }

        if (DEBUG_PASTE) console.log(`[pasteParser]   → normal line: "${processLine}", lineCtx=${lineCtx}`)
        if (lineCtx === 'both') {
            const bothResults = emitBoth(processLine, isLaoOrHanoi, lotteryType)
            if (DEBUG_PASTE) console.log(`[pasteParser]   → emitBoth produced ${bothResults.length} entries`)
            results.push(...bothResults)
        } else {
            const parsed = parseNumberLine(processLine, lineCtx, isLaoOrHanoi, lotteryType)
            if (DEBUG_PASTE) console.log(`[pasteParser]   → parseNumberLine produced ${parsed ? parsed.length : 0} entries`)
            if (parsed) results.push(...parsed)
        }
    }

    // Flush remaining bare numbers at end of input
    if (bareNumberBuffer.length > 0) flushBareBuffer()

    return results
}

/**
 * Check if a line is a bare number (digits only, no amount, no separators)
 */
function isBareNumberLine(line) {
    return /^\d{1,5}$/.test(line.trim())
}

/**
 * Extract amount information from a non-bare line to apply to buffered bare numbers.
 * 
 * Returns { amountStr, mode, number } or null.
 *   - amountStr: the amount portion (e.g. "15*ชุด", "100", "20*20")
 *   - mode: 'top', 'bottom', 'both', or null (inherit from contextMode)
 *   - number: if this line has its own number (e.g. "395=15*ชุด" → number="395"), else null
 * 
 * Cases:
 *   "15*ชุด"         → { amountStr: "15*ชุด", number: null }
 *   "=100"           → { amountStr: "100", number: null }
 *   "20×20"          → { amountStr: "20×20", number: null }
 *   "20×20 บนล่าง"   → { amountStr: "20×20", mode: "both", number: null }
 *   "395=15*ชุด"     → { amountStr: "15*ชุด", number: "395" }
 *   "395 15*ชุด"     → { amountStr: "15*ชุด", number: "395" }
 *   "39=บล10*10"     → { amountStr: "10*10", mode: "both", number: "39" }
 */
function extractAmountFromLine(line) {
    let s = normalizeUnicode(line.trim())
    if (DEBUG_PASTE) console.log(`[extractAmount] input: "${s}" | charCodes: [${[...s].map(c => c.charCodeAt(0)).join(',')}]`)

    // --- Normalize ชุด variants: "20ชุด", "20 ชุด", "20-ชุด", "20+ชุด" → "20*ชุด" ---
    s = s.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด')

    // --- Normalize "ต" / "t" between amounts to "*": "50 ต 50" → "50*50", "20t20" → "20*20" ---
    s = s.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2')
    // --- Normalize "/" and "+" between amounts to "*": "50/50" → "50*50", "20+20" → "20*20" ---
    s = s.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2')
    // --- Strip commas in formatted amounts: "1,000" → "1000" ---
    s = s.replace(/(\d),(\d{3})/g, '$1$2')

    // --- Extract trailing context suffix (วิ่ง/ลอย/โต๊ด/บนล่าง/ลบ/ล่างบน/บน/ล่าง etc.) ---
    let mode = null
    // Float suffix: "วิ่งล่าง", "ลอยล่าง" → float_bottom
    const floatBotSuffix = s.match(/\s+(วิ่งล่าง|ลอยล่าง)\s*$/)
    if (floatBotSuffix) {
        mode = 'float_bottom'
        s = s.slice(0, floatBotSuffix.index).trim()
    }
    // Float suffix: "วิ่งบน", "ลอยบน", "วิ่ง", "ลอย", "โต๊ด" → float_top
    if (!mode) {
        const floatTopSuffix = s.match(/\s+(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\s*$/)
        if (floatTopSuffix) {
            mode = 'float_top'
            s = s.slice(0, floatTopSuffix.index).trim()
        }
    }
    if (!mode) {
        const bothSuffix = s.match(/\s+(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล\.?|ล[+\-]?บ\.?|บล\.?|ลบ\.?)\s*$/)
        if (bothSuffix) {
            mode = 'both'
            s = s.slice(0, bothSuffix.index).trim()
        } else {
            const singleCtx = s.match(/\s+(บน|บ\.?|ล่าง|ล\.?)\s*$/)
            if (singleCtx) {
                const modeStr = singleCtx[1].replace('.', '')
                mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
                s = s.slice(0, singleCtx.index).trim()
            }
        }
    }

    // --- Check for inline context prefix right after = (e.g. "39=บล10*10", "39=ลบ10*10") ---
    const eqInlineMatch = s.match(/^(\d{1,5})\s*=\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(.+)$/)
    if (eqInlineMatch) {
        return { amountStr: eqInlineMatch[3].trim(), mode: 'both', number: eqInlineMatch[1] }
    }

    // --- Context prefix attached to amount (no =): "บล50*50", "89 บล50*50", "89=บล50*50" ---
    // "both" prefix variants: บล, ลบ, บนล่าง, ล่างบน, บ+ล, ล+บ, etc.
    const bothPrefixRe = /^(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.+)$/
    // "single" prefix variants: บน, บ, ล่าง, ล
    const singlePrefixRe = /^(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/

    // Case: "number space/= contextAmount" e.g. "89 บล50*50" or "89=บล50*50"
    const numCtxMatch = s.match(/^(\d{1,5})\s*[=\s]\s*((?:บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*\d.+)$/)
    if (numCtxMatch) {
        const ctxPart = numCtxMatch[2].trim()
        const bothM = ctxPart.match(bothPrefixRe)
        if (bothM) {
            const amt = bothM[2].trim()
            if (isAmountPattern(amt)) return { amountStr: amt, mode: 'both', number: numCtxMatch[1] }
        }
        const singleM = ctxPart.match(singlePrefixRe)
        if (singleM) {
            const amt = singleM[2].trim()
            const mStr = singleM[1]
            const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom'
            if (isAmountPattern(amt)) return { amountStr: amt, mode: m, number: numCtxMatch[1] }
        }
    }

    // Case: pure context-prefixed amount (no number): "บล50*50", "บน20*20"
    const pureBothM = s.match(bothPrefixRe)
    if (pureBothM) {
        const amt = pureBothM[2].trim()
        if (isAmountPattern(amt)) return { amountStr: amt, mode: 'both', number: null }
    }
    const pureSingleM = s.match(singlePrefixRe)
    if (pureSingleM) {
        const amt = pureSingleM[2].trim()
        const mStr = pureSingleM[1]
        const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom'
        if (isAmountPattern(amt)) return { amountStr: amt, mode: m, number: null }
    }

    // --- Normalize -/* separated formats to = format ---
    // e.g., "258*20*20" → "258=20*20", "967-40*40" → "967=40*40", "213-50" → "213=50"
    // Only apply when there's no = already AND the string is NOT a valid amount pattern
    // (to avoid converting "20*20" buffer-amount into "20=20")
    if (!s.includes('=') && !isAmountPattern(s)) {
        const sepNorm = s.match(/^(\d{1,5})\s*[\-*]\s*(\d.*)$/)
        if (sepNorm) {
            let amtPart = sepNorm[2]
            amtPart = amtPart.replace(/(\d)\s*\-\s*(\d)/g, '$1*$2')
            s = `${sepNorm[1]}=${amtPart}`
        }
    }

    // --- "=amountStr" (no number before =) ---
    const eqOnlyMatch = s.match(/^=\s*(.+)$/)
    if (eqOnlyMatch) {
        const amt = eqOnlyMatch[1].trim()
        if (isAmountPattern(amt)) return { amountStr: amt, mode, number: null }
        return null
    }

    // --- "number=amountStr" or "number amountStr" ---
    const eqMatch = s.match(/^(\d{1,5})\s*=\s*(.+)$/)
    if (eqMatch) {
        const amt = eqMatch[2].trim()
        if (isAmountPattern(amt)) return { amountStr: amt, mode, number: eqMatch[1] }
        return null
    }
    const spaceMatch = s.match(/^(\d{1,5})\s+(.+)$/)
    if (spaceMatch) {
        const amt = spaceMatch[2].trim()
        if (isAmountPattern(amt)) return { amountStr: amt, mode, number: spaceMatch[1] }
        return null
    }

    // --- Pure amount pattern (no number, no =) e.g. "15*ชุด", "20×20" ---
    if (isAmountPattern(s)) return { amountStr: s, mode, number: null }

    return null
}

/**
 * Check if a string is a pure amount pattern (digits with separators/ชุด, NOT a bare number).
 * Must contain at least one non-digit character (*, ×, x, -, +, ชุด) to distinguish from bare numbers.
 */
function isAmountPattern(s) {
    if (!s || !s.trim()) return false
    const t = s.trim()
    // Must have at least one separator or ชุด to be an amount pattern
    if (/^\d+$/.test(t)) return false // pure digits = bare number, not amount
    // Match common amount patterns:
    //   50*50, 20×20, 10x10, 10+10, 10-10
    //   15*ชุด, 20ชุด, 20 ชุด, 20-ชุด, 20+ชุด
    //   50*50*ชุด
    return /^\d+[*×xX\-+/](\d+|ชุด)$/.test(t) ||  // "50*50", "50/50", "15*ชุด"
           /^\d+[*×xX\-+/]\d+[*×xX\-+/]ชุด$/.test(t) ||  // "50*50*ชุด"
           /^\d+\s*[tTต]\s*\d+$/.test(t) ||  // "50 ต 50", "20t20"
           /^\d+\s*ชุด$/.test(t)  // "20ชุด" or "20 ชุด"
}

/**
 * Get the effective context for a line (checks inline context).
 * Returns 'top', 'bottom', 'both', or the passed contextMode.
 */
function getLineEffectiveContext(line, contextMode) {
    const preClean = line.trim()
    let inlineCtx = extractInlineContext(preClean)
    if (inlineCtx.mode) return inlineCtx.mode
    const normalized = stripPrefixNoise(preClean)
    if (normalized) {
        inlineCtx = extractInlineContext(normalized)
        if (inlineCtx.mode) return inlineCtx.mode
    }
    return contextMode
}

/**
 * Emit entries for both top and bottom context (for "บนล่าง" mode).
 * Strips inline context from the line, then parses with 'top' and 'bottom' separately.
 */
function emitBoth(rawLine, isLaoOrHanoi, lotteryType) {
    const results = []
    const inlineCtx = extractInlineContext(rawLine.trim())
    const cleanLine = inlineCtx.mode ? inlineCtx.cleaned : rawLine
    // Also strip "บล/ลบ" from after = sign
    const eqCtx = cleanLine.match(/^(\d{1,5}\s*=\s*)(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(.+)$/)
    const finalLine = eqCtx ? `${eqCtx[1]}${eqCtx[3]}` : cleanLine
    if (DEBUG_PASTE) console.log(`[emitBoth] rawLine="${rawLine}" cleanLine="${cleanLine}" finalLine="${finalLine}"`)
    const topParsed = parseNumberLine(finalLine, 'top', isLaoOrHanoi, lotteryType)
    if (topParsed) results.push(...topParsed)

    // Only emit bottom version for 1-2 digit numbers.
    // 3+ digit numbers don't have separate top/bottom bet types,
    // so "บน-ล่าง" context should NOT duplicate them.
    const numDigits = topParsed && topParsed.length > 0 ? topParsed[0].numbers.length : 0
    if (numDigits <= 2) {
        const botParsed = parseNumberLine(finalLine, 'bottom', isLaoOrHanoi, lotteryType)
        if (DEBUG_PASTE) console.log(`[emitBoth] topParsed=${topParsed ? topParsed.length : 'null'} botParsed=${botParsed ? botParsed.length : 'null'}`)
        if (DEBUG_PASTE && botParsed) console.log(`[emitBoth] botParsed:`, JSON.stringify(botParsed.map(e => e.formattedLine || e.rawLine)))
        if (botParsed) results.push(...botParsed)
    } else {
        if (DEBUG_PASTE) console.log(`[emitBoth] ${numDigits}-digit number, skipping bottom (no top/bottom distinction for 3+ digits)`)
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
 * Check if a string contains BOTH a บน-variant and a ล่าง-variant,
 * indicating "บนล่าง" (top+bottom) context regardless of separators between them.
 * Examples: "บน-ล่าง", "บ/ล", "บน----ล่าง", "บนและล่าง", "บน กับ ล่าง", 
 *           "ล่าง*บน", "บ.ล", "บ-ล", "บล.", "บล", "บ+ล"
 * Must NOT contain digits (to avoid matching "บน 77=30" as context line).
 */
function isBothContext(line) {
    const s = line.trim()
    // Quick check: must not contain digits (context-only line)
    if (/\d/.test(s)) return false
    // Remove all non-Thai characters to get just Thai letters
    const thaiOnly = s.replace(/[^ก-๛]/g, '')
    // Check known combined patterns: บล, ลบ, บนล่าง, ล่างบน
    if (/^(บนล่าง|ล่างบน|บล|ลบ)$/.test(thaiOnly)) return true
    // Check if the string contains both a บน-variant and a ล่าง-variant somewhere
    const hasTop = /(บน|บ)/.test(thaiOnly)
    const hasBottom = /(ล่าง|ล)/.test(thaiOnly)
    // Must contain both, and the Thai content should be short (context line, not a sentence)
    if (hasTop && hasBottom && thaiOnly.length <= 10) return true
    return false
}

/**
 * Check if a line is a context-setting line (บน/ล่าง/บนล่าง)
 * Returns 'top', 'bottom', 'both', or null if not a context line
 */
function parseContextLine(line) {
    const withPunct = line.trim()

    // --- Bracketed/prefixed context: [2 ตัวล่าง], [3 ตัวบน], [2 ตัวบนล่าง] ---
    // Also handles without brackets: "2ตัวล่าง", "2 ตัว ล่าง", "3ตัวบน"
    const bracketCleaned = withPunct.replace(/[\[\](){}]/g, '').replace(/[\s.+\-]/g, '')
    // "2ตัวบนล่าง", "3ตัวบนล่าง", "2ตัวลบ", "2ตัวบล" → both
    if (/^\d*ตัว(บนล่าง|ล่างบน|บล|ลบ)$/.test(bracketCleaned)) return 'both'
    // "2ตัวล่าง", "2ตัวล" → bottom
    if (/^\d*ตัว(ล่าง|ล)$/.test(bracketCleaned)) return 'bottom'
    // "3ตัวบน", "2ตัวบ" → top
    if (/^\d*ตัว(บน|บ)$/.test(bracketCleaned)) return 'top'
    // "2ตัววิ่งล่าง", "2ตัวลอยล่าง" → float_bottom
    if (/^\d*ตัว(วิ่งล่าง|ลอยล่าง)$/.test(bracketCleaned)) return 'float_bottom'
    // "2ตัววิ่งบน", "2ตัวลอยบน", "2ตัววิ่ง", "2ตัวลอย" → float_top
    if (/^\d*ตัว(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|มี)$/.test(bracketCleaned)) return 'float_top'

    // Check for "วิ่ง/ลอย/โต๊ด/มี" float context FIRST (before บน/ล่าง checks)
    // These keywords indicate "ลอย" (float/run) bet type
    const cleanedFloat = withPunct.replace(/[\s.+\-]/g, '')
    // "วิ่งบน", "ลอยบน", "วิ่ง บน" → float_top
    if (/^(วิ่งบน|ลอยบน|วิ่งบ|ลอยบ)$/.test(cleanedFloat)) return 'float_top'
    // "วิ่งล่าง", "ลอยล่าง", "วิ่ง ล่าง" → float_bottom
    if (/^(วิ่งล่าง|ลอยล่าง|วิ่งล|ลอยล)$/.test(cleanedFloat)) return 'float_bottom'
    // "วิ่ง", "ลอย", "โต๊ด" standalone → float_top (default to บน)
    if (/^(วิ่ง|ลอย|โต๊ด)$/.test(cleanedFloat)) return 'float_top'
    // "2ตัวมี", "2 ตัว มี", "2ตัววิ่ง", "2ตัวลอย", "2ตัวโต๊ด" → float_top
    if (/^2ตัว(มี|วิ่ง|ลอย|โต๊ด)$/.test(cleanedFloat)) return 'float_top'

    // Check for "บนล่าง" / "ล่างบน" variants first (must come before single checks)
    // If a line contains BOTH a บน-variant AND a ล่าง-variant (in any order, with any separators),
    // treat it as 'both'. E.g. "บน-ล่าง", "บ/ล", "บน----ล่าง", "บนและล่าง", "บน กับ ล่าง", "ล่าง*บน"
    if (isBothContext(withPunct)) return 'both'

    // Match standalone "บ", "บ.", "บน"
    // Match standalone "ล", "ล.", "ล่าง"
    const cleaned = line.replace(/[^ก-๛a-zA-Z0-9]/g, '').trim()

    if (/^(บน|บ)$/.test(cleaned)) return 'top'
    if (/^(ล่าง|ล)$/.test(cleaned)) return 'bottom'

    // Also check original line with punctuation: "บ.", "ล."
    if (/^บ\.?$/.test(withPunct)) return 'top'
    if (/^ล\.?$/.test(withPunct)) return 'bottom'
    if (/^บน$/.test(withPunct)) return 'top'
    if (/^ล่าง$/.test(withPunct)) return 'bottom'

    return null
}

/**
 * Extract a trailing context keyword from a noisy line.
 * Handles cases like "12:48 ไอซ์(ร้านตัดผม) ล่าง" where the line is mostly noise
 * but ends with a context keyword that should set the mode.
 * Returns 'top', 'bottom', 'both', or null.
 */
function extractTrailingContext(line) {
    const s = line.trim()

    // Helper: strip timestamp from the "before" portion so it doesn't count as having digits
    function stripTimestamp(str) {
        return str.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '').trim()
    }

    // Helper: check if the "before" part is pure noise (no bet-related digits after removing timestamp)
    function isPureNoise(before) {
        if (!before) return false
        const noTs = stripTimestamp(before)
        // After removing timestamp, should have no digits (only Thai text, parens, spaces, etc.)
        return !/\d/.test(noTs)
    }

    // Check if the line ends with a "both" context keyword
    const bothMatch = s.match(/(?:^|\s)(บนล่าง|ล่างบน|บล\.?|ลบ\.?|บ[+\-]?ล\.?|ล[+\-]?บ\.?)\s*$/)
    if (bothMatch) {
        const before = s.slice(0, bothMatch.index).trim()
        if (isPureNoise(before)) return 'both'
    }

    // Check if the line ends with a "single" context keyword
    const singleMatch = s.match(/(?:^|\s)(บน|บ\.?|ล่าง|ล\.?)\s*$/)
    if (singleMatch) {
        const before = s.slice(0, singleMatch.index).trim()
        if (isPureNoise(before)) {
            const kw = singleMatch[1].replace('.', '')
            return (kw === 'บน' || kw === 'บ') ? 'top' : 'bottom'
        }
    }

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
 * Extract inline context (บน/ล่าง/บนล่าง) from a line as prefix or suffix.
 * Returns { cleaned, mode } where mode is 'top', 'bottom', 'both', or null.
 */
function extractInlineContext(line) {
    let s = line.trim()

    // --- FLOAT PREFIX: "วิ่ง83=100", "ลอย25=20", "โต๊ด78=500" followed by digit ---
    const floatPrefixTop = s.match(/^(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\.?\s*(\d.*)$/)
    if (floatPrefixTop) {
        const kw = floatPrefixTop[1]
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top'
        return { cleaned: floatPrefixTop[2].trim(), mode }
    }
    const floatPrefixBot = s.match(/^(วิ่งล่าง|ลอยล่าง)\.?\s*(\d.*)$/)
    if (floatPrefixBot) {
        return { cleaned: floatPrefixBot[2].trim(), mode: 'float_bottom' }
    }

    // --- FLOAT SUFFIX: "83=100 วิ่ง", "83=100 ลอย", "2=150 วิ่งล่าง" ---
    const floatSuffixBot = s.match(/^(.+?)\s+(วิ่งล่าง|ลอยล่าง)\s*$/)
    if (floatSuffixBot) {
        return { cleaned: floatSuffixBot[1].trim(), mode: 'float_bottom' }
    }
    const floatSuffix = s.match(/^(.+?)\s+(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\s*$/)
    if (floatSuffix) {
        return { cleaned: floatSuffix[1].trim(), mode: 'float_top' }
    }

    // --- FLOAT MIDDLE: "78 โต๊ด 500", "78 วิ่ง 500", "78 ลอย 500", "78 มี 500" ---
    const floatMiddle = s.match(/^(\d+)\s+(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|มี)\s+(\d[\d*=\-+]*)$/)
    if (floatMiddle) {
        const kw = floatMiddle[2]
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top'
        return { cleaned: `${floatMiddle[1]}=${floatMiddle[3].trim()}`, mode }
    }

    // --- PREFIX "บนล่าง/ลบ/บล" variants followed by digit or = ---
    const bothPrefix = s.match(/^(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.*)$/)
    if (bothPrefix) {
        return { cleaned: bothPrefix[2].trim(), mode: 'both' }
    }

    // --- PREFIX patterns: "บน.", "บน", "บ.", "บ", "ล่าง.", "ล่าง", "ล.", "ล" followed by digit ---
    const prefixMatch = s.match(/^(บน|บ|ล่าง|ล)\.?\s*(\d.*)$/)
    if (prefixMatch) {
        const modeStr = prefixMatch[1]
        const rest = prefixMatch[2]
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: rest.trim(), mode }
    }

    // --- SUFFIX "บนล่าง/ลบ/ล่างบน" variants ---
    const bothSuffix = s.match(/^(.+?)\s+(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล|ล[+\-]?บ|บล|ลบ)\s*$/)
    if (bothSuffix) {
        return { cleaned: bothSuffix[1].trim(), mode: 'both' }
    }

    // --- SUFFIX patterns: "บน", "บ", "ล่าง", "ล" at end ---
    const suffixMatch = s.match(/^(.+?)\s+(บน|บ|ล่าง|ล)\.?\s*$/)
    if (suffixMatch) {
        const rest = suffixMatch[1]
        const modeStr = suffixMatch[2].replace('.', '')
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: rest.trim(), mode }
    }

    // --- MIDDLE pattern: "number contextAmount" e.g. "89 บล50*50", "89 บน50*50" ---
    // "both" context prefix attached to amount
    const midBothMatch = s.match(/^(\d+)\s+(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.+)$/)
    if (midBothMatch) {
        return { cleaned: `${midBothMatch[1]} ${midBothMatch[3].trim()}`, mode: 'both' }
    }
    // "single" context prefix attached to amount
    const midSingleMatch = s.match(/^(\d+)\s+(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/)
    if (midSingleMatch) {
        const modeStr = midSingleMatch[2]
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: `${midSingleMatch[1]} ${midSingleMatch[3].trim()}`, mode }
    }

    // --- MIDDLE pattern: "2 ล่าง 500" or "2 บน 500" (context with spaces around it) ---
    const middleMatch = s.match(/^(\d+)\s+(บน|บ|ล่าง|ล)\s+(\d[\d*=\-+]*)$/)
    if (middleMatch) {
        const num = middleMatch[1]
        const modeStr = middleMatch[2]
        const amt = middleMatch[3]
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: `${num} ${amt}`, mode }
    }

    // --- Inline context after = sign: "39=บล10*10", "39=ลบ10*10" ---
    const eqInline = s.match(/^(\d+\s*=\s*)(บนล่าง|ล่างบน|บล\.?|ลบ\.?|บ[+\-]?ล\.?|ล[+\-]?บ\.?)(.+)$/)
    if (eqInline) {
        return { cleaned: `${eqInline[1]}${eqInline[3]}`.trim(), mode: 'both' }
    }
    // --- Inline "both" context after = with space: "25= บล 20*20" ---
    const eqBothSpace = s.match(/^(\d+)\s*=\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s+(\d.+)$/)
    if (eqBothSpace) {
        return { cleaned: `${eqBothSpace[1]}=${eqBothSpace[3].trim()}`, mode: 'both' }
    }
    // --- Inline single context after = with space: "25= ล่าง 20*20", "25=บน20*20" ---
    const eqSingleInline = s.match(/^(\d+)\s*=\s*(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/)
    if (eqSingleInline) {
        const modeStr = eqSingleInline[2]
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: `${eqSingleInline[1]}=${eqSingleInline[3].trim()}`, mode }
    }

    // --- "num context=amt" pattern: "25 ล่าง=20*20", "25 ล่าง =20*20", "25ล่าง=20*20" ---
    const numCtxEqBoth = s.match(/^(\d+)\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*=\s*(.+)$/)
    if (numCtxEqBoth) {
        return { cleaned: `${numCtxEqBoth[1]}=${numCtxEqBoth[3].trim()}`, mode: 'both' }
    }
    const numCtxEqSingle = s.match(/^(\d+)\s*(บน|บ|ล่าง|ล)\.?\s*=\s*(.+)$/)
    if (numCtxEqSingle) {
        const modeStr = numCtxEqSingle[2]
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom'
        return { cleaned: `${numCtxEqSingle[1]}=${numCtxEqSingle[3].trim()}`, mode }
    }

    return { cleaned: s, mode: null }
}

/**
 * Parse a single number line into one or more bet entries
 */
function parseNumberLine(line, contextMode, isLaoOrHanoi, lotteryType) {
    // Extract inline context
    const preClean = normalizeUnicode(line.trim())
    let inlineCtx = extractInlineContext(preClean)
    let normalized
    if (inlineCtx.mode) {
        normalized = stripPrefixNoise(inlineCtx.cleaned)
    } else {
        normalized = stripPrefixNoise(preClean)
        if (normalized) {
            inlineCtx = extractInlineContext(normalized)
            if (inlineCtx.mode) {
                normalized = inlineCtx.cleaned
            }
        }
    }
    const effectiveContext = inlineCtx.mode || contextMode
    const parseContext = (effectiveContext === 'both') ? 'top' : effectiveContext
    // float_top and float_bottom pass through to determineBetType as-is
    if (!normalized) return null

    // Normalize separators:
    // Replace &, ×, · between amounts with *
    // Replace . between digit groups with * (e.g., "258.33.20" → "258*33*20")
    // Replace - and + between amounts with *
    // Also handle "ชุด" keyword

    // Handle "ชุด" variants: "123=50ชุด", "123=50 ชุด", "123=50-ชุด" → "123=50*ชุด"
    normalized = normalized.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด')

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

    // Normalize "ต" / "t" between digit amounts to * (เต็งโต๊ด separator)
    // e.g., "123=50 ต 50" → "123=50*50", "456=20t20" → "456=20*20"
    normalized = normalized.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2')

    // Normalize / and + between digit amounts to * (after = sign)
    // e.g., "789=50/50" → "789=50*50", "587=20+20" → "587=20*20"
    if (normalized.includes('=')) {
        const eqIdx = normalized.indexOf('=')
        let afterEq = normalized.substring(eqIdx + 1)
        // Strip commas in formatted amounts: "1,000" → "1000"
        afterEq = afterEq.replace(/(\d),(\d{3})/g, '$1$2')
        afterEq = afterEq.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2')
        normalized = normalized.substring(0, eqIdx + 1) + afterEq
    }

    // === KEY NORMALIZATION: Convert -/*/+// separated formats to = format ===
    // If no = sign present, and the line has 2-3 digit groups separated by -, *, /, +
    // convert the FIRST separator to = so it becomes "number=amount" or "number=amount*amount".
    //
    // Examples:
    //   258*20*20      → 258=20*20   (เต็งโต๊ด)
    //   967-40*40      → 967=40*40   (เต็งโต๊ด)
    //   213-50         → 213=50      (บน)
    //   375-100*6      → 375=100*6   (ชุด)
    //   220-50*ชุด     → 220=50*ชุด  (ชุด)
    //   23*10*10       → 23=10*10    (บนกลับ)
    //   45*20-20       → 45=20*20    (กลับ — normalize remaining - to *)
    //   741/20/20      → 741=20*20   (เต็งโต๊ด)
    //   87+20+20       → 87=20*20    (บนกลับ)
    //
    // ONLY apply when there's no = already and the first group is 1-5 digit number
    if (!normalized.includes('=')) {
        // Match: digits{1-5} followed by -, *, /, or + followed by more content containing digits
        const sepMatch = normalized.match(/^(\d{1,5})\s*[\-*/+]\s*(\d.*)$/)
        if (sepMatch) {
            const numPart = sepMatch[1]
            let amtPart = sepMatch[2]
            // Normalize remaining -, /, + between digit groups in amount part to *
            amtPart = amtPart.replace(/(\d)\s*[\-/+]\s*(\d)/g, '$1*$2')
            normalized = `${numPart}=${amtPart}`
        }
    }

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
    //   258*20*20       → numbers=258, amount1=20, amount2=20
    //   967-40*40       → numbers=967, amount1=40, amount2=40
    //   213-50          → numbers=213, amount1=50
    //   375-100*6       → numbers=375, amount1=100, amount2=6

    let numbers = null
    let amount1 = null
    let amount2 = null
    let amount3 = null
    let hasChud = false // "ชุด" keyword present

    // Try format with = first
    const eqMatch = normalized.match(/^(\d+)\s*[=]\s*(.+)$/)
    if (eqMatch) {
        numbers = eqMatch[1]
        const amountPart = eqMatch[2].trim()
        const parsed = parseAmountPart(amountPart)
        amount1 = parsed.amount1
        amount2 = parsed.amount2
        amount3 = parsed.amount3
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
            amount3 = parsed.amount3
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
    if (DEBUG_PASTE) console.log(`[parseNumberLine] FINAL: numbers=${numbers}, amt1=${amount1}, amt2=${amount2}, amt3=${amount3}, hasChud=${hasChud}, permCount=${permCount}, ctx=${parseContext}, normalized="${normalized}"`)
    return determineBetType(numbers, numLen, amount1, amount2, amount3, hasChud, permCount, parseContext, isLaoOrHanoi, lotteryType, line)
}

/**
 * Parse the amount part of a line (after = or space)
 * Returns { amount1, amount2, amount3, hasChud }
 */
function parseAmountPart(str) {
    let hasChud = false
    let cleaned = normalizeUnicode(str.trim())
    // Normalize x/X between digits to *: "220x5x44" → "220*5*44"
    cleaned = cleaned.replace(/(\d)[xX](\d)/g, '$1*$2')

    // Check for "ชุด" keyword
    if (cleaned.includes('ชุด')) {
        hasChud = true
        cleaned = cleaned.replace(/\*?ชุด/g, '').trim()
    }

    // Strip commas in formatted amounts: "1,000" → "1000"
    cleaned = cleaned.replace(/(\d),(\d{3})/g, '$1$2')
    // Normalize /, +, t/ต between digit amounts to *
    cleaned = cleaned.replace(/(\d)\s*[/+tTต]\s*(\d)/g, '$1*$2')

    // Split by * or - (amount separators)
    const parts = cleaned.split(/[*\-]/).map(s => s.trim()).filter(s => s)

    const amount1 = parts[0] ? parseInt(parts[0]) : null
    const amount2 = parts[1] ? parseInt(parts[1]) : null
    const amount3 = parts[2] ? parseInt(parts[2]) : null

    // If hasChud but no amount2, amount2 will be calculated as permutation count later
    return {
        amount1: (amount1 && amount1 > 0) ? amount1 : null,
        amount2: (amount2 && amount2 > 0) ? amount2 : null,
        amount3: (amount3 && amount3 > 0) ? amount3 : null,
        hasChud
    }
}

/**
 * Determine bet type and return formatted entries
 */
function determineBetType(numbers, numLen, amount1, amount2, amount3, hasChud, permCount, contextMode, isLaoOrHanoi, lotteryType, rawLine) {
    const isFloat = contextMode === 'float_top' || contextMode === 'float_bottom'
    const isTop = contextMode === 'top' || contextMode === 'float_top'
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

        // Float mode (วิ่ง/ลอย/โต๊ด/มี) → 2_run (ลอย)
        if (isFloat) {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '2_run',
                typeLabel: 'ลอย',
                rawLine,
                formattedLine: `${numbers}=${amount1} ลอย`
            })
            return results
        }

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

        // --- 4-group pattern: num=A*B*C (3-digit number with 3 amount parts) ---
        // One of amt2/amt3 is a permutation indicator (permCount or permCount-1).
        // The OTHER non-indicator value is the reverse bet amount (otherAmt).
        //
        // perm-1 indicator: keep amt1, use otherAmt as amt2 → กลับ
        //   e.g. 123=30*20*5 → 123=30*20 กลับ  (perm=6, indicator=5=perm-1)
        //   e.g. 334=50*2*10 → 334=50*10 กลับ  (perm=3, indicator=2=perm-1)
        //
        // perm indicator: amt1 += otherAmt, use otherAmt as amt2 → กลับ
        //   e.g. 123=30*20*6 → 123=50*20 กลับ  (perm=6, indicator=6=perm, 30+20=50)
        //   e.g. 122=100*20*3 → 122=120*20 กลับ (perm=3, indicator=3=perm, 100+20=120)
        if (amount3 !== null && amount1 !== null && amount2 !== null) {
            // 4-group: num=amt1*amt2*amt3
            // Check if amt2 or amt3 is a permutation indicator
            const isAmt2PermMinusOne = (amount2 === permCount - 1)
            const isAmt2Perm = (amount2 === permCount)
            const isAmt3PermMinusOne = (amount3 === permCount - 1)
            const isAmt3Perm = (amount3 === permCount)

            let finalAmt1 = null
            let finalAmt2 = null
            let matched = false

            if (isAmt2PermMinusOne) {
                // amt2 is perm-1 indicator, amt3 is the reverse amount
                finalAmt1 = amount1
                finalAmt2 = amount3
                matched = true
            } else if (isAmt2Perm) {
                // amt2 is perm indicator, amt3 is the reverse amount, add to amt1
                finalAmt1 = amount1 + amount3
                finalAmt2 = amount3
                matched = true
            } else if (isAmt3PermMinusOne) {
                // amt3 is perm-1 indicator, amt2 is the reverse amount
                finalAmt1 = amount1
                finalAmt2 = amount2
                matched = true
            } else if (isAmt3Perm) {
                // amt3 is perm indicator, amt2 is the reverse amount, add to amt1
                finalAmt1 = amount1 + amount2
                finalAmt2 = amount2
                matched = true
            }

            if (matched) {
                const typeLabel = 'กลับ'
                results.push({
                    numbers,
                    amount: finalAmt1,
                    amount2: finalAmt2,
                    betType: '3_top',
                    specialType: 'reverse',
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${finalAmt1}*${finalAmt2} ${typeLabel}`
                })
                return results
            }
            // If no perm indicator matched, fall through to normal 2-amount handling
        }

        if (amount2 !== null || hasChud) {
            // 2 amounts for 3-digit number: determine เต็งโต๊ด or คูณชุด
            const effectiveAmount2 = hasChud ? permCount : amount2

            if (effectiveAmount2 === permCount) {
                // amount2 matches permutation count → คูณชุด (multiply by permutations)
                const typeLabel = 'คูณชุด'
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: effectiveAmount2,
                    betType: '3_top',
                    specialType: `set${permCount}`,
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
                })
            } else {
                // amount2 does NOT match permutation count → เต็งโต๊ด (straight + tod)
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
