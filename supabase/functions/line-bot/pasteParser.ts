// ============================================================
// LAO LOTTO - LINE Bot Paste Parser (Deno TypeScript)
// Ported from: src/utils/pasteParser.js
// ============================================================

export interface ParsedBet {
    numbers: string;
    amount: number;
    amount2: number | null;
    betType: string;
    typeLabel: string;
    rawLine: string;
    formattedLine: string;
    specialType?: string;
}

// Helper: get all permutations
export function getPermutations(str: string): string[] {
    if (str.length <= 1) return [str];
    const perms: string[] = [];
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const remainingChars = str.slice(0, i) + str.slice(i + 1);
        for (const subPerm of getPermutations(remainingChars)) {
            perms.push(char + subPerm);
        }
    }
    return [...new Set(perms)];
}

// Helper: get unique 3-digit permutations from 4 digits
export function getUnique3DigitPermsFrom4(str: string): string[] {
    if (str.length !== 4) return [];
    const results = new Set<string>();
    for (let i = 0; i < 4; i++) {
        const combination = str.slice(0, i) + str.slice(i + 1);
        const perms = getPermutations(combination);
        perms.forEach(p => results.add(p));
    }
    return Array.from(results);
}

// Helper: get unique 3-digit permutations from 5 digits
export function getUnique3DigitPermsFrom5(str: string): string[] {
    if (str.length !== 5) return [];
    const results = new Set<string>();
    const chars = str.split('');
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
                const combination = chars[i] + chars[j] + chars[k];
                const perms = getPermutations(combination);
                perms.forEach(p => results.add(p));
            }
        }
    }
    return Array.from(results);
}

export function get3DigitPermCount(numbers: string): number {
    const digits = numbers.split('');
    const combinations = new Set<string>();

    for (let i = 0; i < digits.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            if (j === i) continue;
            for (let k = 0; k < digits.length; k++) {
                if (k === i || k === j) continue;
                combinations.add(digits[i] + digits[j] + digits[k]);
            }
        }
    }
    return combinations.size;
}

export function getPermutationCount(numStr: string): number {
    if (!numStr || numStr.length < 2) return 1;
    const perms = getPermutations(numStr);
    return perms.length;
}

function normalizeUnicode(str: string): string {
    if (!str) return '';
    let s = str
        .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g, '')
        .replace(/[\u2013\u2014\u2212\u2012\u2015]/g, '-')
        .replace(/[\u00D7\u2715\u2716\u2A09\uFE61\u30FB\u2217\u204E\u2731\u2732\u2733\u066D\uFF0A\u22C6]/g, '*')
        .replace(/[\u2215\u2044]/g, '/')
        .replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
        .replace(/[\uFF21-\uFF3A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41))
        .replace(/[\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF41 + 0x61))
        .replace(/\uFF1D/g, '=')
        .replace(/\uFF0A/g, '*')
        .replace(/\uFF0B/g, '+')
        .replace(/\uFF0F/g, '/')
        .replace(/\uFF0C/g, ',')
        .replace(/\uFF0E/g, '.')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/[\u2018\u2019\u201A]/g, "'");

    // Replace ทุกประตู / ทุกประตุ / ทุกตู / ทุกตุ with ชุด
    s = s.replace(/ทุกประตู|ทุกประตุ|ทุกตู|ทุกตุ/g, 'ชุด');

    // Normalize ช / ซ (abbreviations for ชุด) to ชุด when following a digit or operator
    s = s.replace(/(\d+)\s*[*×xX\-+]?\s*[ชซ](?![ก-๛a-zA-Z0-9])/g, '$1*ชุด');

    // "ตัวละ" / "ตูละ" (= per number) means "=" followed by the bet amount.
    // e.g. a trailing line "ตัวละ10 บาท" applies amount 10 to all buffered bare numbers above.
    s = s.replace(/ตัว\s*ละ|ตู\s*ละ/g, '=');

    // Normalize x and X between digits (with optional spaces) to *
    s = s.replace(/(\d)\s*[xX]\s*(\d)/g, '$1*$2');
    // Normalize spaces around standard operators (*, -, +, /) between digits
    s = s.replace(/(\d)\s*([*\-+/\/])\s*(\d)/g, '$1$2$3');
    // Normalize t, T, ต between digits (with optional spaces) to *
    s = s.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2');

    return s;
}

function findAmountIndex(tokens: string[]): number {
    let rightmostCandidateIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        const tok = tokens[i].trim();
        if (isAmountPattern(tok) || /^\d+$/.test(tok)) {
            rightmostCandidateIdx = i;
            break;
        }
    }
    
    if (rightmostCandidateIdx === -1) return -1;
    
    const candidate = tokens[rightmostCandidateIdx].trim();
    
    if (isAmountPattern(candidate)) {
        return rightmostCandidateIdx;
    }
    
    if (/^\d+$/.test(candidate) && rightmostCandidateIdx > 0) {
        const preceding = tokens.slice(0, rightmostCandidateIdx).map(t => t.trim());
        const allPrecedingAreNumbers = preceding.every(t => /^\d+$/.test(t));
        if (allPrecedingAreNumbers && preceding.length > 0) {
            const firstLen = preceding[0].length;
            const allPrecedingSameLen = preceding.every(t => t.length === firstLen);
            if (allPrecedingSameLen && candidate.length !== firstLen) {
                return rightmostCandidateIdx;
            }
        }
    }
    
    return -1;
}

function expandLines(rawLines: string[]): string[] {
    const expanded: string[] = [];
    for (const rawLine of rawLines) {
        const trimmed = normalizeUnicode(rawLine.trim());
        if (!trimmed) { expanded.push(trimmed); continue; }
        if (isDateLine(trimmed)) continue;

        let line = trimmed.replace(/(\d)\s*[tTตt]\s*(\d)/g, '$1*$2');

        // --- Step 1.5: If line has slashes but no =, try to detect trailing amount ---
        if (!line.includes('=') && line.includes('/')) {
            const tokens = line.split('/');
            const amountIdx = findAmountIndex(tokens);
            if (amountIdx > 0) {
                const numsPart = tokens.slice(0, amountIdx).join('/');
                const amtPart = tokens.slice(amountIdx).join('/');
                line = `${numsPart}=${amtPart}`;
            }
        }

        if (line.includes('=')) {
            const eqIdx = line.indexOf('=');
            const beforeEq = line.substring(0, eqIdx);
            let afterEq = line.substring(eqIdx + 1);
            afterEq = afterEq.replace(/(\d),(\d{3})/g, '$1$2');
            afterEq = afterEq.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2');
            line = beforeEq + '=' + afterEq;
        }

        let didExpand = false;
        if (line.includes('=')) {
            const eqIdx = line.indexOf('=');
            const numsPart = line.substring(0, eqIdx).trim();
            const amtPart = line.substring(eqIdx + 1).trim();
            if (/[,/]/.test(numsPart)) {
                const numTokens = numsPart.split(/[,/]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                if (numTokens.length >= 2) {
                    for (const num of numTokens) {
                        expanded.push(`${num}=${amtPart}`);
                    }
                    didExpand = true;
                }
            }
        } else {
            const spaceAmtMatch = line.match(/^([\d,/\s]+?)\s+(\d+[*]\d+.*)$/);
            if (spaceAmtMatch) {
                const numsPart = spaceAmtMatch[1].trim();
                const amtPart = spaceAmtMatch[2].trim();
                if (/[,/]/.test(numsPart)) {
                    const numTokens = numsPart.split(/[,/]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                    if (numTokens.length >= 2) {
                        for (const num of numTokens) {
                            expanded.push(`${num}=${amtPart}`);
                        }
                        didExpand = true;
                    }
                }
            }
        }
        if (didExpand) continue;

        if (!line.includes('=')) {
            line = line.replace(/^(\d{1,5})\.\s/, '$1 ');
            const slashTriple = line.match(/^(\d{1,5})\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
            if (slashTriple) {
                line = `${slashTriple[1]}=${slashTriple[2]}*${slashTriple[3]}`;
            } else {
                line = line.replace(/^(\d{1,5}\.?\s+\d+)\s*[\-/+]\s*(\d+)/, '$1*$2');
            }
        }

        expanded.push(line);
    }
    return expanded;
}

export function parseMultiLinePaste(text: string, lotteryType = 'lao'): ParsedBet[] {
    if (!text || !text.trim()) return [];

    // Filter out laughter (555, 5555, etc.) that are standalone and not part of a bet specification
    const filteredText = text.replace(/(?<!\d)5{3,}\+*(?!\d)(?!\s*([=\*xX×tTต\-/]|\d|\+\s*\d))/g, '');

    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType);
    const rawLines = filteredText.split('\n');
    const lines = expandLines(rawLines);
    const results: ParsedBet[] = [];
    let contextMode = 'top'; // default: บน
    let bareNumberBuffer: string[] = [];

    function flushBareBuffer() {
        for (const bareNum of bareNumberBuffer) {
            const parsed = parseNumberLine(bareNum, contextMode, isLaoOrHanoi, lotteryType);
            if (parsed) {
                if (contextMode === 'both') {
                    results.push(...emitBoth(bareNum, isLaoOrHanoi, lotteryType));
                } else {
                    results.push(...parsed);
                }
            }
        }
        bareNumberBuffer = [];
    }

    function applyAmountToBuffer(amountStr: string, mode: string | null) {
        const ctx = mode || contextMode;
        for (const bareNum of bareNumberBuffer) {
            const synthLine = `${bareNum}=${amountStr}`;
            if (ctx === 'both') {
                const bothEntries = emitBoth(synthLine, isLaoOrHanoi, lotteryType);
                results.push(...bothEntries);
            } else {
                const parsed = parseNumberLine(synthLine, ctx, isLaoOrHanoi, lotteryType);
                if (parsed) results.push(...parsed);
            }
        }
        bareNumberBuffer = [];
    }

    for (let i = 0; i < lines.length; i++) {
        const trimmed = normalizeUnicode(lines[i].trim());
        if (!trimmed) continue;

        const modeResult = parseContextLine(trimmed);
        if (modeResult !== null) {
            if (bareNumberBuffer.length > 0) flushBareBuffer();
            contextMode = modeResult;
            continue;
        }

        if (isBareNumberLine(trimmed)) {
            bareNumberBuffer.push(trimmed);
            continue;
        }

        const stripped = stripPrefixNoise(trimmed);
        const lineToProcess = stripped || trimmed;

        const strippedMode = parseContextLine(stripped);
        if (strippedMode !== null) {
            if (bareNumberBuffer.length > 0) flushBareBuffer();
            contextMode = strippedMode;
            continue;
        }
        const trailingCtx = extractTrailingContext(trimmed);
        if (trailingCtx !== null) {
            if (bareNumberBuffer.length > 0) flushBareBuffer();
            contextMode = trailingCtx;
            continue;
        }

        if (stripped && isBareNumberLine(stripped)) {
            bareNumberBuffer.push(stripped);
            continue;
        }

        if (bareNumberBuffer.length > 0) {
            const amountInfo = extractAmountFromLine(trimmed) || extractAmountFromLine(lineToProcess);
            if (amountInfo) {
                if (amountInfo.number) {
                    bareNumberBuffer.push(amountInfo.number);
                }
                applyAmountToBuffer(amountInfo.amountStr, amountInfo.mode);
                continue;
            }
            flushBareBuffer();
        }

        let processLine = (stripped && stripped !== trimmed) ? stripped : trimmed;

        if (contextMode === 'bottom' || contextMode === 'both') {
            const numMatch = (processLine || '').match(/^(\d+)/);
            if (numMatch && numMatch[1].length >= 3) {
                contextMode = 'top';
            }
        }

        let lineCtx = getLineEffectiveContext(processLine, contextMode);
        if (lineCtx === contextMode && stripped && stripped !== trimmed) {
            const origCtx = getLineEffectiveContext(trimmed, contextMode);
            if (origCtx !== contextMode) {
                lineCtx = origCtx;
                const origInline = extractInlineContext(trimmed);
                if (origInline.mode) {
                    processLine = origInline.cleaned;
                }
            }
        }

        if (lineCtx !== contextMode) {
            contextMode = lineCtx;
        }

        if (lineCtx === 'both') {
            const bothResults = emitBoth(processLine, isLaoOrHanoi, lotteryType);
            results.push(...bothResults);
        } else {
            const parsed = parseNumberLine(processLine, lineCtx, isLaoOrHanoi, lotteryType);
            if (parsed) results.push(...parsed);
        }
    }

    if (bareNumberBuffer.length > 0) flushBareBuffer();

    return results;
}

function isBareNumberLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 4 && /^\d{4}$/.test(trimmed)) {
        return false;
    }
    return /^\d{1,5}$/.test(trimmed);
}

interface AmountInfo {
    amountStr: string;
    mode: string | null;
    number: string | null;
}

function extractAmountFromLine(line: string): AmountInfo | null {
    let s = normalizeUnicode(line.trim());
    const split = splitAmountAndTrailingText(s);
    if (split) {
        s = split.amountStr;
    }
    s = s.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด');
    s = s.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2');
    s = s.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2');
    s = s.replace(/(\d),(\d{3})/g, '$1$2');

    let mode: string | null = null;
    const floatBotSuffix = s.match(/\s+(วิ่งล่าง|ลอยล่าง)\s*$/);
    if (floatBotSuffix) {
        mode = 'float_bottom';
        s = s.slice(0, floatBotSuffix.index).trim();
    }
    if (!mode) {
        const floatTopSuffix = s.match(/\s+(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\s*$/);
        if (floatTopSuffix) {
            mode = 'float_top';
            s = s.slice(0, floatTopSuffix.index).trim();
        }
    }
    if (!mode) {
        const bothSuffix = s.match(/\s+(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล\.?|ล[+\-]?บ\.?|บล\.?|ลบ\.?)\s*$/);
        if (bothSuffix) {
            mode = 'both';
            s = s.slice(0, bothSuffix.index).trim();
        } else {
            const singleCtx = s.match(/\s+(บน|บ\.?|ล่าง|ล\.?)\s*$/);
            if (singleCtx) {
                const modeStr = singleCtx[1].replace('.', '');
                mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
                s = s.slice(0, singleCtx.index).trim();
            }
        }
    }

    const eqInlineMatch = s.match(/^(\d{1,5})\s*=\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(.+)$/);
    if (eqInlineMatch) {
        return { amountStr: eqInlineMatch[3].trim(), mode: 'both', number: eqInlineMatch[1] };
    }

    const ctxEqMatch = s.match(/^(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*=\s*(.+)$/);
    if (ctxEqMatch) {
        const ctxStr = ctxEqMatch[1];
        const amt = ctxEqMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt)) {
            let mode = 'both';
            if (/^(บน|บ)$/.test(ctxStr)) mode = 'top';
            else if (/^(ล่าง|ล)$/.test(ctxStr)) mode = 'bottom';
            return { amountStr: amt, mode, number: null };
        }
    }

    const bothPrefixRe = /^(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.+)$/;
    const singlePrefixRe = /^(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/;

    const numCtxMatch = s.match(/^(\d{1,5})\s*[=\s]\s*((?:บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*\d.+)$/);
    if (numCtxMatch) {
        const ctxPart = numCtxMatch[2].trim();
        const bothM = ctxPart.match(bothPrefixRe);
        if (bothM) {
            const amt = bothM[2].trim();
            if (isAmountPattern(amt)) return { amountStr: amt, mode: 'both', number: numCtxMatch[1] };
        }
        const singleM = ctxPart.match(singlePrefixRe);
        if (singleM) {
            const amt = singleM[2].trim();
            const mStr = singleM[1];
            const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom';
            if (isAmountPattern(amt)) return { amountStr: amt, mode: m, number: numCtxMatch[1] };
        }
    }

    const pureBothM = s.match(bothPrefixRe);
    if (pureBothM) {
        const amt = pureBothM[2].trim();
        if (isAmountPattern(amt)) return { amountStr: amt, mode: 'both', number: null };
    }
    const pureSingleM = s.match(singlePrefixRe);
    if (pureSingleM) {
        const amt = pureSingleM[2].trim();
        const mStr = pureSingleM[1];
        const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom';
        if (isAmountPattern(amt)) return { amountStr: amt, mode: m, number: null };
    }

    if (!s.includes('=') && !isAmountPattern(s)) {
        const sepNorm = s.match(/^(\d{1,5})\s*[\-*]\s*(\d.*)$/);
        if (sepNorm) {
            let amtPart = sepNorm[2];
            amtPart = amtPart.replace(/(\d)\s*\-\s*(\d)/g, '$1*$2');
            s = `${sepNorm[1]}=${amtPart}`;
        }
    }

    const eqOnlyMatch = s.match(/^=\s*(.+)$/);
    if (eqOnlyMatch) {
        const amt = eqOnlyMatch[1].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt)) return { amountStr: amt, mode, number: null };
        return null;
    }

    const eqMatch = s.match(/^(\d{1,5})\s*=\s*(.+)$/);
    if (eqMatch) {
        const amt = eqMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt)) return { amountStr: amt, mode, number: eqMatch[1] };
        return null;
    }
    const spaceMatch = s.match(/^(\d{1,5})\s+(.+)$/);
    if (spaceMatch) {
        const amt = spaceMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt)) return { amountStr: amt, mode, number: spaceMatch[1] };
        return null;
    }

    if (isAmountPattern(s)) return { amountStr: s, mode, number: null };

    return null;
}

function isAmountPattern(s: string): boolean {
    if (!s || !s.trim()) return false;
    const t = s.trim();
    if (/^\d+$/.test(t)) return false;
    return /^\d+[*×xX\-+/](\d+|ชุด)$/.test(t) ||
           /^\d+[*×xX\-+/]\d+[*×xX\-+/]ชุด$/.test(t) ||
           /^\d+\s*[tTต]\s*\d+$/.test(t) ||
           /^\d+\s*ชุด$/.test(t) ||
           /^\d+\s*(?:บาท|บ\.?)$/i.test(t);
}

function getLineEffectiveContext(line: string, contextMode: string): string {
    const preClean = line.trim();
    let inlineCtx = extractInlineContext(preClean);
    if (inlineCtx.mode) return inlineCtx.mode;
    const normalized = stripPrefixNoise(preClean);
    if (normalized) {
        inlineCtx = extractInlineContext(normalized);
        if (inlineCtx.mode) return inlineCtx.mode;
    }
    return contextMode;
}

function emitBoth(rawLine: string, isLaoOrHanoi: boolean, lotteryType: string): ParsedBet[] {
    const results: ParsedBet[] = [];
    const inlineCtx = extractInlineContext(rawLine.trim());
    const cleanLine = inlineCtx.mode ? inlineCtx.cleaned : rawLine;
    const eqCtx = cleanLine.match(/^(\d{1,5}\s*=\s*)(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(.+)$/);
    const finalLine = eqCtx ? `${eqCtx[1]}${eqCtx[3]}` : cleanLine;
    
    const topParsed = parseNumberLine(finalLine, 'top', isLaoOrHanoi, lotteryType);
    if (topParsed) results.push(...topParsed);

    const numDigits = topParsed && topParsed.length > 0 ? topParsed[0].numbers.length : 0;
    if (numDigits <= 2) {
        const botParsed = parseNumberLine(finalLine, 'bottom', isLaoOrHanoi, lotteryType);
        if (botParsed) results.push(...botParsed);
    }
    return results;
}

function stripPrefixNoise(line: string): string {
    let s = line.trim();
    s = s.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '');
    s = s.replace(/^[^=\d]*(?=[=\d])/, '');
    return s.trim();
}

function isBothContext(line: string): boolean {
    const s = line.trim();
    if (/\d/.test(s)) return false;
    const thaiOnly = s.replace(/[^ก-๛]/g, '');
    if (/^(บนล่าง|ล่างบน|บล|ลบ)$/.test(thaiOnly)) return true;
    const hasTop = /(บน|บ)/.test(thaiOnly);
    const hasBottom = /(ล่าง|ล)/.test(thaiOnly);
    if (hasTop && hasBottom && thaiOnly.length <= 10) return true;
    return false;
}

function parseContextLine(line: string): string | null {
    const withPunct = line.trim();
    const bracketCleaned = withPunct.replace(/[\[\](){}]/g, '').replace(/[\s.+\-]/g, '');
    if (/^\d*ตัว(บนล่าง|ล่างบน|บล|ลบ)$/.test(bracketCleaned)) return 'both';
    if (/^\d*ตัว(ล่าง|ล)$/.test(bracketCleaned)) return 'bottom';
    if (/^\d*ตัว(บน|บ)$/.test(bracketCleaned)) return 'top';
    if (/^\d*ตัว(วิ่งล่าง|ลอยล่าง)$/.test(bracketCleaned)) return 'float_bottom';
    if (/^\d*ตัว(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|มี)$/.test(bracketCleaned)) return 'float_top';

    const cleanedFloat = withPunct.replace(/[\s.+\-]/g, '');
    if (/^(วิ่งบน|ลอยบน|วิ่งบ|ลอยบ)$/.test(cleanedFloat)) return 'float_top';
    if (/^(วิ่งล่าง|ลอยล่าง|วิ่งล|ลอยล)$/.test(cleanedFloat)) return 'float_bottom';
    if (/^(วิ่ง|ลอย|โต๊ด)$/.test(cleanedFloat)) return 'float_top';
    if (/^2ตัว(มี|วิ่ง|ลอย|โต๊ด)$/.test(cleanedFloat)) return 'float_top';

    if (isBothContext(withPunct)) return 'both';

    const cleaned = line.replace(/[^ก-๛a-zA-Z0-9]/g, '').trim();
    if (/^(บน|บ)$/.test(cleaned)) return 'top';
    if (/^(ล่าง|ล)$/.test(cleaned)) return 'bottom';

    if (/^บ\.?$/.test(withPunct)) return 'top';
    if (/^ล\.?$/.test(withPunct)) return 'bottom';
    if (/^บน$/.test(withPunct)) return 'top';
    if (/^ล่าง$/.test(withPunct)) return 'bottom';

    return null;
}

function extractTrailingContext(line: string): string | null {
    const s = line.trim();
    function stripTimestamp(str: string) {
        return str.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '').trim();
    }
    function isPureNoise(before: string) {
        if (!before) return false;
        const noTs = stripTimestamp(before);
        return !/\d/.test(noTs);
    }

    const bothMatch = s.match(/(?:^|\s)(บนล่าง|ล่างบน|บล\.?|ลบ\.?|บ[+\-]?ล\.?|ล[+\-]?บ\.?)\s*$/);
    if (bothMatch) {
        const before = s.slice(0, bothMatch.index).trim();
        if (isPureNoise(before)) return 'both';
    }

    const singleMatch = s.match(/(?:^|\s)(บน|บ\.?|ล่าง|ล\.?)\s*$/);
    if (singleMatch) {
        const before = s.slice(0, singleMatch.index).trim();
        if (isPureNoise(before)) {
            const kw = singleMatch[1].replace('.', '');
            return (kw === 'บน' || kw === 'บ') ? 'top' : 'bottom';
        }
    }
    return null;
}

interface InlineContextInfo {
    cleaned: string;
    mode: string | null;
}

function extractInlineContext(line: string): InlineContextInfo {
    let s = line.trim();

    const floatPrefixTop = s.match(/^(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\.?\s*(\d.*)$/);
    if (floatPrefixTop) {
        const kw = floatPrefixTop[1];
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        return { cleaned: floatPrefixTop[2].trim(), mode };
    }
    const floatPrefixBot = s.match(/^(วิ่งล่าง|ลอยล่าง)\.?\s*(\d.*)$/);
    if (floatPrefixBot) {
        return { cleaned: floatPrefixBot[2].trim(), mode: 'float_bottom' };
    }

    const floatSuffixBot = s.match(/^(.+?)\s+(วิ่งล่าง|ลอยล่าง)\s*$/);
    if (floatSuffixBot) {
        return { cleaned: floatSuffixBot[1].trim(), mode: 'float_bottom' };
    }
    const floatSuffix = s.match(/^(.+?)\s+(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด)\s*$/);
    if (floatSuffix) {
        return { cleaned: floatSuffix[1].trim(), mode: 'float_top' };
    }

    const floatMiddle = s.match(/^(\d+)\s+(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|มี)\s+(\d[\d*=\-+]*)$/);
    if (floatMiddle) {
        const kw = floatMiddle[2];
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        return { cleaned: `${floatMiddle[1]}=${floatMiddle[3].trim()}`, mode };
    }

    const bothPrefix = s.match(/^(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.*)$/);
    if (bothPrefix) {
        return { cleaned: bothPrefix[2].trim(), mode: 'both' };
    }

    const prefixMatch = s.match(/^(บน|บ|ล่าง|ล)\.?\s*(\d.*)$/);
    if (prefixMatch) {
        const modeStr = prefixMatch[1];
        const rest = prefixMatch[2];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: rest.trim(), mode };
    }

    const bothSuffix = s.match(/^(.+?)\s+(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล|ล[+\-]?บ|บล|ลบ)\s*$/);
    if (bothSuffix) {
        return { cleaned: bothSuffix[1].trim(), mode: 'both' };
    }

    const suffixMatch = s.match(/^(.+?)\s+(บน|บ|ล่าง|ล)\.?\s*$/);
    if (suffixMatch) {
        const rest = suffixMatch[1];
        const modeStr = suffixMatch[2].replace('.', '');
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: rest.trim(), mode };
    }

    const midBothMatch = s.match(/^(\d+)\s+(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(\d.+)$/);
    if (midBothMatch) {
        return { cleaned: `${midBothMatch[1]} ${midBothMatch[3].trim()}`, mode: 'both' };
    }
    const midSingleMatch = s.match(/^(\d+)\s+(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/);
    if (midSingleMatch) {
        const modeStr = midSingleMatch[2];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: `${midSingleMatch[1]} ${midSingleMatch[3].trim()}`, mode };
    }

    const middleMatch = s.match(/^(\d+)\s+(บน|บ|ล่าง|ล)\s+(\d[\d*=\-+]*)$/);
    if (middleMatch) {
        const num = middleMatch[1];
        const modeStr = middleMatch[2];
        const amt = middleMatch[3];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: `${num} ${amt}`, mode };
    }

    const eqInline = s.match(/^(\d+\s*=\s*)(บนล่าง|ล่างบน|บล\.?|ลบ\.?|บ[+\-]?ล\.?|ล[+\-]?บ\.?)(.+)$/);
    if (eqInline) {
        return { cleaned: `${eqInline[1]}${eqInline[3]}`.trim(), mode: 'both' };
    }
    return { cleaned: line, mode: null };
}

function parseNumberLine(line: string, contextMode: string, isLaoOrHanoi: boolean, lotteryType: string): ParsedBet[] | null {
    const preClean = normalizeUnicode(line.trim());
    if (isDateLine(preClean)) return null;
    let inlineCtx = extractInlineContext(preClean);
    let normalized: string | null = null;
    if (inlineCtx.mode) {
        normalized = stripPrefixNoise(inlineCtx.cleaned);
    } else {
        normalized = stripPrefixNoise(preClean);
        if (normalized) {
            inlineCtx = extractInlineContext(normalized);
            if (inlineCtx.mode) {
                normalized = inlineCtx.cleaned;
            }
        }
    }
    const effectiveContext = inlineCtx.mode || contextMode;
    const parseContext = (effectiveContext === 'both') ? 'top' : effectiveContext;
    if (!normalized) return null;
    if (isDateLine(normalized)) return null;

    normalized = normalized.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด');

    const dotTriple = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (dotTriple) {
        normalized = `${dotTriple[1]}=${dotTriple[2]}*${dotTriple[3]}`;
    }

    normalized = normalized.replace(/[&×]/g, '*');
    normalized = normalized.replace(/(\d)[xX](\d)/g, '$1*$2');
    normalized = normalized.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2');

    if (normalized.includes('=')) {
        const eqIdx = normalized.indexOf('=');
        let afterEq = normalized.substring(eqIdx + 1);
        afterEq = afterEq.replace(/(\d),(\d{3})/g, '$1$2');
        afterEq = afterEq.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2');
        normalized = normalized.substring(0, eqIdx + 1) + afterEq;
    }

    if (!normalized.includes('=')) {
        const sepMatch = normalized.match(/^(\d{1,5})\s*[\-*/+]\s*(\d.*)$/);
        if (sepMatch) {
            const numPart = sepMatch[1];
            let amtPart = sepMatch[2];
            amtPart = amtPart.replace(/(\d)\s*[\-/+]\s*(\d)/g, '$1*$2');
            normalized = `${numPart}=${amtPart}`;
        }
    }

    let numbers: string | null = null;
    let amount1: number | null = null;
    let amount2: number | null = null;
    let amount3: number | null = null;
    let hasChud = false;

    const eqMatch = normalized.match(/^(\d+)\s*[=]\s*(.+)$/);
    if (eqMatch) {
        numbers = eqMatch[1];
        const amountPart = eqMatch[2].trim();
        const parsed = parseAmountPart(amountPart);
        amount1 = parsed.amount1;
        amount2 = parsed.amount2;
        amount3 = parsed.amount3;
        hasChud = parsed.hasChud;
    } else {
        const spaceMatch = normalized.match(/^(\d+)\s+(.+)$/);
        if (spaceMatch) {
            numbers = spaceMatch[1];
            const amountPart = spaceMatch[2].trim();
            const parsed = parseAmountPart(amountPart);
            amount1 = parsed.amount1;
            amount2 = parsed.amount2;
            amount3 = parsed.amount3;
            hasChud = parsed.hasChud;
        } else {
            const bareMatch = normalized.match(/^(\d+)$/);
            if (bareMatch) {
                numbers = bareMatch[1];
            }
        }
    }

    if (!numbers || numbers.length < 1 || numbers.length > 5) return null;
    if (!/^\d+$/.test(numbers)) return null;

    const numLen = numbers.length;
    const permCount = numLen >= 2 ? getPermutationCount(numbers) : 1;

    return determineBetType(numbers, numLen, amount1, amount2, amount3, hasChud, permCount, parseContext, isLaoOrHanoi, lotteryType, line);
}

interface ParsedAmount {
    amount1: number | null;
    amount2: number | null;
    amount3: number | null;
    hasChud: boolean;
}

function parseAmountPart(str: string): ParsedAmount {
    let hasChud = false;
    let cleaned = normalizeUnicode(str.trim());
    cleaned = cleaned.replace(/(\d)[xX](\d)/g, '$1*$2');

    if (cleaned.includes('ชุด')) {
        hasChud = true;
        cleaned = cleaned.replace(/\*?ชุด/g, '').trim();
    }

    cleaned = cleaned.replace(/(\d),(\d{3})/g, '$1$2');
    cleaned = cleaned.replace(/(\d)\s*[/+tTต]\s*(\d)/g, '$1*$2');

    const parts = cleaned.split(/[*\-]/).map(s => s.trim()).filter(s => s);

    const amount1 = parts[0] ? parseInt(parts[0]) : null;
    const amount2 = parts[1] ? parseInt(parts[1]) : null;
    const amount3 = parts[2] ? parseInt(parts[2]) : null;

    return {
        amount1: (amount1 && amount1 > 0) ? amount1 : null,
        amount2: (amount2 && amount2 > 0) ? amount2 : null,
        amount3: (amount3 && amount3 > 0) ? amount3 : null,
        hasChud
    };
}

function isDateLine(line: string): boolean {
    if (!line) return false;
    const s = line.trim();
    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD\MM\YYYY (Day/Month/Year)
    // Supports 1-2 digits for Day/Month, and 2 or 4 digits for Year
    const dmyMatch = s.match(/^(\d{1,2})\s*[\/\-\\]\s*(\d{1,2})\s*[\/\-\\]\s*(\d{2,4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return true;
        }
    }
    // Pattern 2: YYYY/MM/DD or YYYY-MM-DD or YYYY\MM\DD (Year/Month/Day)
    const ymdMatch = s.match(/^(\d{4})\s*[\/\-\\]\s*(\d{1,2})\s*[\/\-\\]\s*(\d{1,2})$/);
    if (ymdMatch) {
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return true;
        }
    }
    return false;
}

function isValidBare4DigitLine(rawLine: string, numbers: string): boolean {
    const trimmed = (rawLine || '').trim();
    const remaining = trimmed.replace(numbers, '').trim();
    if (!remaining) return true;
    const allowedRegex = /^[=\s]*(?:ชุด|ตัวชุด|ชุดลอยแพ|บน|ล่าง|บล|ลบ|บนล่าง|ล่างบน|บ\.?|ล\.?)?$/;
    return allowedRegex.test(remaining);
}

function determineBetType(
    numbers: string,
    numLen: number,
    amount1: number | null,
    amount2: number | null,
    amount3: number | null,
    hasChud: boolean,
    permCount: number,
    contextMode: string,
    isLaoOrHanoi: boolean,
    lotteryType: string,
    rawLine: string
): ParsedBet[] | null {
    const isFloat = contextMode === 'float_top' || contextMode === 'float_bottom';
    const isTop = contextMode === 'top' || contextMode === 'float_top';
    const results: ParsedBet[] = [];

    // === 1 digit ===
    if (numLen === 1) {
        if (amount1 === null) return null;
        const betType = isTop ? 'run_top' : 'run_bottom';
        const typeLabel = isTop ? 'ลอยบน' : 'ลอยล่าง';
        results.push({
            numbers,
            amount: amount1,
            amount2: null,
            betType,
            typeLabel,
            rawLine,
            formattedLine: `${numbers}=${amount1} ${typeLabel}`
        });
        return results;
    }

    // === 2 digits ===
    if (numLen === 2) {
        if (amount1 === null) return null;

        if (isFloat) {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '2_run',
                typeLabel: 'ลอย',
                rawLine,
                formattedLine: `${numbers}=${amount1} ลอย`
            });
            return results;
        }

        if (amount2 !== null) {
            const betType = isTop ? '2_top' : '2_bottom';
            const typeLabel = isTop ? 'บนกลับ' : 'ล่างกลับ';
            results.push({
                numbers,
                amount: amount1,
                amount2,
                betType,
                specialType: 'reverse',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${amount2} ${typeLabel}`
            });
        } else {
            const betType = isTop ? '2_top' : '2_bottom';
            const typeLabel = isTop ? 'บน' : 'ล่าง';
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType,
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1} ${typeLabel}`
            });
        }
        return results;
    }

    // === 3 digits ===
    if (numLen === 3) {
        if (amount1 === null) return null;

        if (amount3 !== null && amount1 !== null && amount2 !== null) {
            const isAmt2PermMinusOne = (amount2 === permCount - 1);
            const isAmt2Perm = (amount2 === permCount);
            const isAmt3PermMinusOne = (amount3 === permCount - 1);
            const isAmt3Perm = (amount3 === permCount);

            let finalAmt1: number | null = null;
            let finalAmt2: number | null = null;
            let matched = false;

            if (isAmt2PermMinusOne) {
                finalAmt1 = amount1;
                finalAmt2 = amount3;
                matched = true;
            } else if (isAmt2Perm) {
                finalAmt1 = amount1 + amount3;
                finalAmt2 = amount3;
                matched = true;
            } else if (isAmt3PermMinusOne) {
                finalAmt1 = amount1;
                finalAmt2 = amount2;
                matched = true;
            } else if (isAmt3Perm) {
                finalAmt1 = amount1 + amount2;
                finalAmt2 = amount2;
                matched = true;
            }

            if (matched && finalAmt1 !== null && finalAmt2 !== null) {
                const typeLabel = 'กลับ';
                results.push({
                    numbers,
                    amount: finalAmt1,
                    amount2: finalAmt2,
                    betType: '3_top',
                    specialType: 'reverse',
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${finalAmt1}*${finalAmt2} ${typeLabel}`
                });
                return results;
            }
        }

        if (amount2 !== null || hasChud) {
            const effectiveAmount2 = hasChud ? permCount : amount2;

            if (effectiveAmount2 === permCount) {
                const typeLabel = 'คูณชุด';
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: effectiveAmount2,
                    betType: '3_top',
                    specialType: `set${permCount}`,
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
                });
            } else if (effectiveAmount2 !== null) {
                const typeLabel = 'เต็งโต๊ด';
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: effectiveAmount2,
                    betType: '3_top',
                    specialType: 'tengTod',
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
                });
            }
        } else {
            const betType = '3_top';
            const typeLabel = isLaoOrHanoi ? 'ตรง' : 'บน';
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType,
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1} ${typeLabel}`
            });
        }
        return results;
    }

    // === 4 digits ===
    if (numLen === 4) {
        if (amount1 === null) {
            if (isLaoOrHanoi) {
                // Verify if the raw line is actually a bare 4-digit line and not conversational text
                if (!isValidBare4DigitLine(rawLine, numbers)) {
                    return null;
                }
                results.push({
                    numbers,
                    amount: 1,
                    amount2: null,
                    betType: '4_set',
                    typeLabel: '4ตัวชุด',
                    rawLine,
                    formattedLine: `${numbers}=1 4ตัวชุด`
                });
                return results;
            }
            return null;
        }

        if (amount2 !== null || hasChud) {
            const effectiveAmount2 = hasChud ? get3DigitPermCount(numbers) : amount2;
            const typeLabel = 'คูณชุด';
            results.push({
                numbers,
                amount: amount1,
                amount2: effectiveAmount2,
                betType: '3_top',
                specialType: '3xPerm',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
            });
        } else {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '4_float',
                typeLabel: 'ลอยแพ',
                rawLine,
                formattedLine: `${numbers}=${amount1} ลอยแพ`
            });
        }
        return results;
    }

    // === 5 digits ===
    if (numLen === 5) {
        if (amount1 === null) return null;

        if (amount2 !== null || hasChud) {
            const effectiveAmount2 = hasChud ? get3DigitPermCount(numbers) : amount2;
            const typeLabel = 'คูณชุด';
            results.push({
                numbers,
                amount: amount1,
                amount2: effectiveAmount2,
                betType: '3_top',
                specialType: '3xPerm',
                typeLabel,
                rawLine,
                formattedLine: `${numbers}=${amount1}*${effectiveAmount2} ${typeLabel}`
            });
        } else {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '5_float',
                typeLabel: 'ลอยแพ',
                rawLine,
                formattedLine: `${numbers}=${amount1} ลอยแพ`
            });
        }
        return results;
    }

    return null;
}

export function extractBuyerNote(text: string, lotteryType = 'lao'): string {
    if (!text || !text.trim()) return '';
    const rawLines = text.split('\n');
    const nonEmptyLines = rawLines.map(l => l.trim()).filter(l => l.length > 0);
    if (nonEmptyLines.length === 0) return '';

    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType);

    const isNoteLine = (line: string): boolean => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (/^[\d/,\s\-+*xX×=]+$/.test(trimmed)) return false; // ignore lottery numbers and operators
        if (trimmed.startsWith('/')) return false;
        if (isDateLine(trimmed)) return false;
        if (parseContextLine(trimmed)) return false;

        const cleanLower = trimmed.toLowerCase();
        const ignoreKeywords = ['รวม', 'ยอด', 'ทั้งหมด', 'total', 'net', 'sum', 'บ.', 'บาท'];
        if (ignoreKeywords.some(kw => cleanLower.includes(kw))) {
            return false;
        }

        // If it can be parsed as a valid bet line, it is not a note
        const parsed = parseNumberLine(trimmed, 'top', isLaoOrHanoi, lotteryType);
        if (parsed && parsed.length > 0) return false;

        return true;
    };

    const first = nonEmptyLines[0];
    const last = nonEmptyLines[nonEmptyLines.length - 1];

    if (isNoteLine(first)) {
        return cleanNoteText(first);
    }
    if (isNoteLine(last)) {
        return cleanNoteText(last);
    }

    return '';
}

interface SplitResult {
    amountStr: string;
    trailingText: string;
}

function splitAmountAndTrailingText(line: string): SplitResult | null {
    let s = normalizeUnicode(line.trim());
    const pat1 = s.match(/^(\d+[*×xX\-+/](?:\d+|ชุด)(?:[*×xX\-+/]ชุด)?)(?:\s+(.+))?$/);
    if (pat1) {
        return { amountStr: pat1[1].trim(), trailingText: pat1[2] ? pat1[2].trim() : '' };
    }
    const pat2 = s.match(/^(\d+\s*[tTต]\s*\d+)(?:\s+(.+))?$/);
    if (pat2) {
        return { amountStr: pat2[1].trim(), trailingText: pat2[2] ? pat2[2].trim() : '' };
    }
    const pat3 = s.match(/^(\d+\s*ชุด)(?:\s+(.+))?$/);
    if (pat3) {
        return { amountStr: pat3[1].trim(), trailingText: pat3[2] ? pat3[2].trim() : '' };
    }
    const pat4 = s.match(/^(\d+\s*(?:บาท|บ\.?))(?:\s+(.+))?$/i);
    if (pat4) {
        return { amountStr: pat4[1].trim(), trailingText: pat4[2] ? pat4[2].trim() : '' };
    }
    const pat5 = s.match(/^(=[^=\s]+)(?:\s+(.+))?$/);
    if (pat5) {
        return { amountStr: pat5[1].trim(), trailingText: pat5[2] ? pat5[2].trim() : '' };
    }
    return null;
}

function cleanNoteText(str: string): string {
    const s = str.trim();
    const split = splitAmountAndTrailingText(s);
    if (split && split.trailingText) {
        return split.trailingText;
    }
    return s;
}
