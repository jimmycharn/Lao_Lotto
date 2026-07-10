function isCommonAmount(num) {
    if (num <= 0) return false;
    return num % 5 === 0;
}

function normalizeThreeGroupShorthand(line) {
    const clean = line.trim();
    const match = clean.match(/^(?<prefix>.*?)\b(?<g1>\d{2,3})\s*[\s+\-*xX×/.:'‘]\s*(?<g2>\d+)\s*[\s+\-*xX×/.:'‘]\s*(?<g3>\d+)\b(?<suffix>.*)$/);
    if (!match) return line;

    const { prefix, g1, g2, g3, suffix } = match.groups;
    
    if (/\d/.test(prefix) || /\d/.test(suffix)) return line;

    const numLen = g1.length;
    const amt1 = parseInt(g2, 10);
    const amt2 = parseInt(g3, 10);

    if (!isCommonAmount(amt1)) return line;

    if (numLen === 3) {
        const perm = getPermutationCount(g1);
        if (amt2 === perm) {
            return `${prefix.trim()} ${g1}=${g2}*${g3} ${suffix.trim()}`.trim();
        } else {
            return `${prefix.trim()} ${g1}=${g2}*${g3} ${suffix.trim()}`.trim();
        }
    } else if (numLen === 2) {
        if (g2 === g3) {
            return `${prefix.trim()} ${g1}=${g2}*${g3} ${suffix.trim()}`.trim();
        }
    }
    return line;
}

function preprocessShorthands(line) {
    let s = line.trim();
    s = s.replace(/\/+=?(\d+)\*([ชุดช])$/i, '=$1*$2');
    s = s.replace(/\/+([*xX\u00D7])\s*(\d+)$/i, '$1$2');
    s = s.replace(/\/+=(\d+)$/i, '=$1');
    return s;
}

export function getPermutations(str) {
    if (str.length <= 1)
        return [str];
    const perms = [];
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const remainingChars = str.slice(0, i) + str.slice(i + 1);
        for (const subPerm of getPermutations(remainingChars)) {
            perms.push(char + subPerm);
        }
    }
    return [...new Set(perms)];
}
export function getUnique3DigitPermsFrom4(str) {
    if (str.length !== 4)
        return [];
    const results = new Set();
    for (let i = 0; i < 4; i++) {
        const combination = str.slice(0, i) + str.slice(i + 1);
        const perms = getPermutations(combination);
        perms.forEach(p => results.add(p));
    }
    return Array.from(results);
}
export function getUnique3DigitPermsFrom5(str) {
    if (str.length !== 5)
        return [];
    const results = new Set();
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
export function get3DigitPermCount(numbers) {
    const digits = numbers.split('');
    const combinations = new Set();
    for (let i = 0; i < digits.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            if (j === i)
                continue;
            for (let k = 0; k < digits.length; k++) {
                if (k === i || k === j)
                    continue;
                combinations.add(digits[i] + digits[j] + digits[k]);
            }
        }
    }
    return combinations.size;
}
function get2DigitPermutations(numberStr) {
    const digits = numberStr.split('');
    const combinations = new Set([
        numberStr,
        digits[1] + digits[0]
    ]);
    return [...combinations];
}
function get3DigitPermutations(numberStr) {
    const digits = numberStr.split('');
    const combinations = new Set();
    for (let i = 0; i < digits.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            if (j === i)
                continue;
            for (let k = 0; k < digits.length; k++) {
                if (k === i || k === j)
                    continue;
                combinations.add(digits[i] + digits[j] + digits[k]);
            }
        }
    }
    return [...combinations];
}
export function getPermutationCount(numStr) {
    if (!numStr || numStr.length < 2)
        return 1;
    const perms = getPermutations(numStr);
    return perms.length;
}
function cleanPrefixNoiseButKeepContext(line) {
    if (!line)
        return '';
    let s = line.trim();
    s = s.replace(/^(?:\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*)?([^=\d]*?)(?=(?:หน้าบน|กลางบน|หลังบน|หน้าล่าง|หลังล่าง|วิ่งบน|วิ่งล่าง|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล|พี่น้อง|พน|คู่คี่|คู่คี|คู่คู่|คู่คู|คี่คี่|คี่คี|วินกลับ|วินเบิ้ล|วิน|หาง|เบิ้ล|คู่|หน้าหลัง|น้าหลัง|นห|รูดหน้า|หน้า|น้า|น|รูดหลัง|หลัง|ลัง|ห|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต|มี)(?![ก-๛a-zA-Z])|\d)/i, '');
    return s.trim();
}
export function normalizeUnicode(str) {
    if (!str)
        return '';
    let s = str
        .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u200E\u200F\uFE00-\uFE0F]/g, '')
        .replace(/\u00D7/g, 'x')
        .replace(/\u2795/g, '+')
        .replace(/\u2796/g, '-')
        .replace(/\u2797/g, '/')
        .replace(/[\u2013\u2014\u2212\u2012\u2015]/g, '-')
        .replace(/[\u2715\u2716\u2A09\uFE61\u30FB\u2217\u204E\u2731\u2732\u2733\u066D\uFF0A\u22C6\u274C]/g, '*')
        .replace(/[\u2215\u2044]/g, '/')
        .replace(/\\/g, '/')
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
        .replace(/[\u2018\u2019\u201A]/g, "'")
        .replace(/@/g, '=')
        .replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
    s = s.replace(/ทุกประตู|ทุกประตุ|ทุกตู|ทุกตุ/g, '*ชุด');
    s = s.replace(/กลับ(?:ตู|ตัว|ประตู)\s*ละ/g, 'กลับชุด=');
    s = s.replace(/กลับ(?:ตู|ตัว|ประตู)(?!\s*ละ)/g, 'กลับชุด');
    s = s.replace(/(\d+)\s*[*×xX\-+]?\s*[ชซ](?![ก-๛a-zA-Z0-9])/g, '$1*ชุด');
    s = s.replace(/ตัว\s*ละ|ตู\s*ละ/g, '=');
    s = s.replace(/(\d)\s*[xXzZ]\s*(\d)/g, (match, d1, d2, offset, wholeStr) => {
        const beforeMatch = wholeStr.substring(0, offset);
        const afterMatch = wholeStr.substring(offset + match.length);
        const isPrevDigit = /\d$/.test(beforeMatch);
        const isNextDigit = /^\d/.test(afterMatch);
        if (isPrevDigit || isNextDigit) {
            return `${d1}*${d2}`;
        }
        if (afterMatch.trim().startsWith('=')) {
            return match;
        }
        return `${d1}*${d2}`;
    });
    s = s.replace(/(\d)\s*([*\-+/\/,'])\s*(\d)/g, '$1$2$3');
    s = s.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2');
    s = s.replace(/(\d)\s*-\s*(?=[ก-๛])/g, '$1 ');
    s = s.replace(/([ก-๛])\s*-\s*(?=\d)/g, '$1 ');
    s = s.replace(/(\d)(?=[ก-๛])/g, '$1 ');
    s = s.replace(/([ก-๛])(?=\d)/g, '$1 ');
    s = s.replace(/(บน|ล่าง|บ\.?|ล\.?|บล|ลบ|วิ่ง|ลอย|โต๊ด|โต้ด|โตด)\s*มี\s*(\d+)/g, '$1=$2');
    s = s.replace(/(\b\d{3,5})\s*:\s*(\d+)/g, '$1=$2');
    s = s.replace(/(\b\d{1,5})\s*:\s*(\d+(?:\s*[*×xX\-+/]|\s*ชุด|\s*บาท|\s*บ\.?|\s*[ชซ](?![ก-๛a-zA-Z0-9])))/g, '$1=$2');
    s = s.replace(/(\b\d{1,5})\s*\.\s*(\d+)\s*\.\s*(\d+)(?!\s*\.)/g, (match, p1, p2, p3) => {
        const num1 = parseInt(p1, 10);
        const num2 = parseInt(p2, 10);
        if (p1.length <= 2 && p2.length <= 2 && num1 >= 1 && num1 <= 31 && num2 >= 1 && num2 <= 12) {
            return match;
        }
        return `${p1}=${p2}*${p3}`;
    });
    s = s.replace(/(\b\d{1,5})\s*\.\s*(\d+)(?!\s*\.)/g, (match, p1, p2, offset, string) => {
        const num1 = parseInt(p1, 10);
        const num2 = parseInt(p2, 10);
        const rest = string.substring(offset + match.length).trim();
        const hasBetSuffix = /^[*×xX\-+/=ชุดบาทบ]/.test(rest);
        if (p1.length <= 2 && p2.length === 2 && num1 >= 0 && num1 <= 23 && num2 >= 0 && num2 <= 59 && !hasBetSuffix) {
            return match;
        }
        return `${p1}=${p2}`;
    });
    s = s.replace(/(\d+)\s*\(\s*(\d+)\s*[*×xX\-+/tTต\s]\s*(\d+)\s*\)/g, '$1*$2 กลับ');
    s = s.replace(/\s*-+\s*=/g, '=').replace(/=\s*-+\s*/g, '=');
    s = s.replace(/\s*\.+\s*=/g, '=').replace(/=\s*\.+\s*/g, '=');
    s = s.replace(/\b\d+\s*ตัว\s*/g, '');
    s = s.replace(/^([ทฮห]\.?(?![ก-๛])\s*(?!\s*\d(?!\d))|ล\.?(?=ลอย|วิ่ง|โต๊ด|ล่าง|บนล่าง|บล|ลบ))/i, '');
    s = s.replace(/(?<![ก-๛a-zA-Z0-9])บน[\s./+\-]?ล่าง(?![ก-๛a-zA-Z0-9])/g, 'บนล่าง');
    s = s.replace(/(?<![ก-๛a-zA-Z0-9])ล่าง[\s./+\-]?บน(?![ก-๛a-zA-Z0-9])/g, 'ล่างบน');
    s = s.replace(/(?<![ก-๛a-zA-Z0-9])บ[\s./+\-]?ล\.?(?![ก-๛a-zA-Z0-9])/g, 'บล');
    s = s.replace(/(?<![ก-๛a-zA-Z0-9])ล[\s./+\-]?บ\.?(?![ก-๛a-zA-Z0-9])/g, 'ลบ');
    return s;
}
function findAmountIndex(tokens) {
    let rightmostCandidateIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        const tok = tokens[i].trim();
        if (isAmountPattern(tok) || /^\d+$/.test(tok)) {
            rightmostCandidateIdx = i;
            break;
        }
    }
    if (rightmostCandidateIdx === -1)
        return -1;
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
function expandLines(rawLines, lotteryType = 'lao', settings) {
    rawLines = rawLines.map(line => {
        let s = preprocessShorthands(line);
        s = normalizeThreeGroupShorthand(s);
        return s;
    });
    const expanded = [];
    const hyphenBehavior = settings?.hyphen_separator_behavior || 'separator';
    
    // Parse sequential list prefixes once
    const listIndices = new Set();
    const listPrefixRegex = /^\s*(\d{1,2})([\.)\uFF0E\uFF09])\s+/;
    const parsedLines = rawLines.map(line => {
        const match = line.match(listPrefixRegex);
        if (match) {
            return {
                num: parseInt(match[1], 10),
                sep: match[2]
            };
        }
        return null;
    });
    for (let i = 0; i < rawLines.length; i++) {
        if (!parsedLines[i]) continue;
        const current = parsedLines[i];
        let isSequence = false;
        if (i > 0 && parsedLines[i - 1]) {
            if (parsedLines[i - 1].num === current.num - 1) isSequence = true;
        }
        if (i < rawLines.length - 1 && parsedLines[i + 1]) {
            if (parsedLines[i + 1].num === current.num + 1) isSequence = true;
        }
        if (isSequence) listIndices.add(i);
    }

    for (let idx = 0; idx < rawLines.length; idx++) {
        const rawLine = rawLines[idx];
        let line = rawLine.trim();
        line = line.replace(/[\/,']\s*([*×\u00D7xX=])/g, '$1');
        
        // Conditional list prefix stripping
        const match = line.match(listPrefixRegex);
        if (match) {
            const num = parseInt(match[1], 10);
            const remaining = line.substring(match[0].length).trim();
            const hasLeadingZero = match[1].length > 1 && match[1].startsWith('0');
            
            if (!hasLeadingZero) {
                const isSequential = listIndices.has(idx);
                const hasMoreNumbers = /^\s*\d{1,5}(?:\s*[*×\u00D7xX=:,\-\s+]\s*\d+)+/.test(remaining);
                const isSmallNumWithDigits = num <= 15 && hasMoreNumbers;
                
                if (isSequential || isSmallNumWithDigits) {
                    line = remaining;
                }
            }
        }
        const trimmed = normalizeUnicode(line);
        if (!trimmed) {
            expanded.push(trimmed);
            continue;
        }
        if (isConversationalSingleNumberLine(trimmed))
            continue;
        if (isDateLine(trimmed))
            continue;
        const cleaned = cleanPrefixNoiseButKeepContext(trimmed);
        line = cleaned || trimmed;
        if (isDateLine(line))
            continue;
        const hyphenMatch = line.match(/^(?<prefix>(?:(?:บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล|วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โตด|ต)\.?\s*)?)(?<num1>\d{1,5})[-]+(?<num2>\d{1,5})[*×\u00D7xX](?<rest>.*)$/i);
        if (hyphenMatch) {
            const { prefix, num1, num2, rest } = hyphenMatch.groups;
            if (hyphenBehavior === 'separator') {
                const cleanRest = rest.trim();
                const hasOperators = /[-*×\u00D7xX\-+/]/.test(cleanRest);
                if (hasOperators) {
                    line = `${prefix}${num1}/${num2}=${cleanRest}`;
                }
                else {
                    line = `${prefix}${num1}/${num2}=${cleanRest}*${cleanRest}`;
                }
            }
            else {
                line = `${prefix}${num1}=${num2}*${rest.trim()}`;
            }
        }
        if (!line.includes('=')) {
            const hyphenStarMatch = line.match(/^(\d{2,4})\s*-+\s*(\d+(?:\s*[*×xX\-]\s*\d+)+)$/);
            if (hyphenStarMatch) {
                line = `${hyphenStarMatch[1]}=${hyphenStarMatch[2]}`;
            }
        }
        const hasPending = hasPendingBareNumbersBefore(rawLines, idx);
        if (hasPending && isPureAmountLine(line)) {
            expanded.push(line);
            continue;
        }
        const sumRegex = /^(.*?\b\d+\s*[*=]\s*\d+)\s*=\s*\d+(?:\.\d+)?(?:\s*บาท|\s*บ|\s*.-|\s*฿)?(?:\s*(.*))?$/i;
        const sumMatch = line.match(sumRegex);
        if (sumMatch) {
            const base = sumMatch[1].trim();
            const suffix = sumMatch[2] ? sumMatch[2].trim() : '';
            line = suffix ? `${base} ${suffix}` : base;
        }
        if (line.includes('/') || line.includes(',') || line.includes("'")) {
            const tokens = line.split(/[\/,'']/).map(t => t.trim()).filter(t => t);
            const hasSeparator = tokens.some(t => {
                const normalizedToken = normalizeUnicode(t);
                return /[*×xX=]/.test(normalizedToken);
            });
            if (tokens.length >= 2 && hasSeparator) {
                let activeAmount = null;
                let activeContext = null;
                let activeSeparator = '*';
                const subLines = [];
                for (let j = tokens.length - 1; j >= 0; j--) {
                    const token = tokens[j];
                    const parsed = extractTokenAmountAndContext(token);
                    if (parsed) {
                        activeAmount = parsed.amount;
                        activeContext = parsed.context;
                        activeSeparator = parsed.separator || '*';
                        subLines.unshift(token);
                    }
                    else {
                        if (activeAmount) {
                            const ctxStr = activeContext ? ` ${activeContext}` : '';
                            subLines.unshift(`${token}${activeSeparator}${activeAmount}${ctxStr}`);
                        }
                        else {
                            subLines.unshift(token);
                        }
                    }
                }
                const subExpanded = expandLines(subLines, lotteryType, settings);
                expanded.push(...subExpanded);
                continue;
            }
        }
        const xMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(\d{2,3})\s*([*×xX])\s*(\d+)\s*(.*)$/i);
        if (xMatch) {
            const prefixCtx = xMatch[1] ? xMatch[1] + ' ' : '';
            const numberStr = xMatch[2];
            const amount = xMatch[4];
            const suffix = xMatch[5] || '';
            const hasOtherParts = /[\d*×xX=:\-]/.test(suffix);
            const behavior = settings?.x_separator_behavior || 'auto';
            const shouldRevert = behavior === 'revert' ||
                (behavior === 'auto' && lotteryType === 'stock');
            if (!hasOtherParts && shouldRevert) {
                const perms = numberStr.length === 2
                    ? get2DigitPermutations(numberStr)
                    : get3DigitPermutations(numberStr);
                for (const num of perms) {
                    expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
                }
                continue;
            }
        }
        const siblingMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(พี่น้อง|พน)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (siblingMatch) {
            const prefixCtx = siblingMatch[1] ? siblingMatch[1] + ' ' : '';
            const amount = siblingMatch[3];
            const suffix = siblingMatch[4] || '';
            const siblingNumbers = [
                '01', '12', '23', '34', '45', '56', '67', '78', '89', '90',
                '10', '21', '32', '43', '54', '65', '76', '87', '98', '09'
            ];
            for (const num of siblingNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const evenOddMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(คู่คี่|คู่คี)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (evenOddMatch) {
            const prefixCtx = evenOddMatch[1] ? evenOddMatch[1] + ' ' : '';
            const amount = evenOddMatch[3];
            const suffix = evenOddMatch[4] || '';
            const evenOddNumbers = [
                '98', '96', '94', '92', '90',
                '89', '87', '85', '83', '81',
                '78', '76', '74', '72', '70',
                '69', '67', '65', '63', '61',
                '58', '56', '54', '52', '50',
                '49', '47', '45', '43', '41',
                '38', '36', '34', '32', '30',
                '29', '27', '25', '23', '21',
                '18', '16', '14', '12', '10',
                '09', '07', '05', '03', '01'
            ];
            for (const num of evenOddNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const evenEvenMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(คู่คู่|คู่คู)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (evenEvenMatch) {
            const prefixCtx = evenEvenMatch[1] ? evenEvenMatch[1] + ' ' : '';
            const amount = evenEvenMatch[3];
            const suffix = evenEvenMatch[4] || '';
            const evenEvenNumbers = [
                '88', '86', '84', '82', '80',
                '68', '66', '64', '62', '60',
                '48', '46', '44', '42', '40',
                '28', '26', '24', '22', '20',
                '08', '06', '04', '02', '00'
            ];
            for (const num of evenEvenNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const oddOddMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(คี่คี่|คี่คี)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (oddOddMatch) {
            const prefixCtx = oddOddMatch[1] ? oddOddMatch[1] + ' ' : '';
            const amount = oddOddMatch[3];
            const suffix = oddOddMatch[4] || '';
            const oddOddNumbers = [
                '99', '97', '95', '93', '91',
                '79', '77', '75', '73', '71',
                '59', '57', '55', '53', '51',
                '39', '37', '35', '33', '31',
                '19', '17', '15', '13', '11'
            ];
            for (const num of oddOddNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const winMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(วินกลับ|วินเบิ้ล|วิน)\s*(\d{2,10})\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (winMatch) {
            const prefixCtx = winMatch[1] ? winMatch[1] + ' ' : '';
            const winType = winMatch[2].toLowerCase();
            const digitStr = winMatch[3];
            const amount = winMatch[4];
            const suffix = winMatch[5] || '';
            const digits = [...new Set(digitStr.split(''))];
            const winNumbers = [];
            if (winType === 'วิน') {
                for (let i = 0; i < digits.length; i++) {
                    for (let j = i + 1; j < digits.length; j++) {
                        winNumbers.push(digits[i] + digits[j]);
                    }
                }
            }
            else {
                for (let i = 0; i < digits.length; i++) {
                    for (let j = i + 1; j < digits.length; j++) {
                        winNumbers.push(digits[i] + digits[j]);
                        winNumbers.push(digits[j] + digits[i]);
                    }
                }
            }
            for (const num of winNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const hangMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(19\s*หาง|หาง)\s*(\d)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (hangMatch) {
            const prefixCtx = hangMatch[1] ? hangMatch[1] + ' ' : '';
            const fixedDigit = hangMatch[3];
            const amount = hangMatch[4];
            const suffix = hangMatch[5] || '';
            const hangNumbers = [];
            for (let d = 0; d <= 9; d++) {
                hangNumbers.push(`${fixedDigit}${d}`);
            }
            for (let d = 0; d <= 9; d++) {
                if (String(d) !== fixedDigit) {
                    hangNumbers.push(`${d}${fixedDigit}`);
                }
            }
            for (const num of hangNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const doubleMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(เลขคู่|คู่|เลขเบิ้ล|เบิ้ล)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (doubleMatch) {
            const prefixCtx = doubleMatch[1] ? doubleMatch[1] + ' ' : '';
            const amount = doubleMatch[3];
            const suffix = doubleMatch[4] || '';
            const doubleNumbers = [
                '00', '11', '22', '33', '44', '55', '66', '77', '88', '99'
            ];
            for (const num of doubleNumbers) {
                expanded.push(`${prefixCtx}${num}=${amount}${suffix}`);
            }
            continue;
        }
        const rudBothMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(หน้าหลัง|น้าหลัง|นห)\s*(\d)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (rudBothMatch) {
            const prefixCtx = rudBothMatch[1] ? rudBothMatch[1] + ' ' : '';
            const fixedDigit = rudBothMatch[3];
            const amount = rudBothMatch[4];
            const suffix = rudBothMatch[5] || '';
            for (let d = 0; d <= 9; d++) {
                expanded.push(`${prefixCtx}${fixedDigit}${d}=${amount}${suffix}`);
            }
            for (let d = 0; d <= 9; d++) {
                expanded.push(`${prefixCtx}${d}${fixedDigit}=${amount}${suffix}`);
            }
            continue;
        }
        const rudNaMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(รูดหน้า|หน้า|น้า|(?<!บ)น)\s*(\d)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (rudNaMatch) {
            const prefixCtx = rudNaMatch[1] ? rudNaMatch[1] + ' ' : '';
            const fixedDigit = rudNaMatch[3];
            const amount = rudNaMatch[4];
            const suffix = rudNaMatch[5] || '';
            for (let d = 0; d <= 9; d++) {
                expanded.push(`${prefixCtx}${fixedDigit}${d}=${amount}${suffix}`);
            }
            continue;
        }
        const rudLangMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บน|บ|ล่าง|ล)\.?\s*)?(รูดหลัง|หลัง|ลัง|ห)\s*(\d)\s*[=\s]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?)(.*)$/i);
        if (rudLangMatch) {
            const prefixCtx = rudLangMatch[1] ? rudLangMatch[1] + ' ' : '';
            const fixedDigit = rudLangMatch[3];
            const amount = rudLangMatch[4];
            const suffix = rudLangMatch[5] || '';
            for (let d = 0; d <= 9; d++) {
                expanded.push(`${prefixCtx}${d}${fixedDigit}=${amount}${suffix}`);
            }
            continue;
        }
        const eqCount = (trimmed.match(/[=:]/g) || []).length;
        if (eqCount >= 2) {
            const subLines = trimmed.split(/\s+(?=[ก-๛a-zA-Z0-9]*\d+\s*[=:])/);
            if (subLines.length > 1) {
                for (const subLine of subLines) {
                    const subTrimmed = subLine.trim();
                    if (subTrimmed) {
                        const subExpanded = expandLines([subTrimmed]);
                        expanded.push(...subExpanded);
                    }
                }
                continue;
            }
        }
        line = line.replace(/(\d)\s*[tTตt]\s*(\d)/g, '$1*$2');
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
        if (!line.includes('=')) {
            const starBetMatch = line.match(/^(?:(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*)?([\d,/\-')]+)\s*[*×xX]\s*(\d+(?:\s*[*×xX\-+/tTต]\s*\d+)?(?:\s*ชุด)?)(.*)$/i);
            if (starBetMatch) {
                const prefixCtx = starBetMatch[1] ? starBetMatch[1] + ' ' : '';
                let numsPart = starBetMatch[2].trim();
                numsPart = numsPart.replace(/[,/\-')]+$/, '');
                const amt = starBetMatch[3].trim();
                const suffix = starBetMatch[4] || '';
                if (/[,/\-')]/.test(numsPart)) {
                    const numTokens = numsPart.split(/[,/\-')]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                    if (numTokens.length >= 2) {
                        const subLines = numTokens.map(num => `${prefixCtx}${num}*${amt}${suffix}`);
                        const subExpanded = expandLines(subLines, lotteryType, settings);
                        expanded.push(...subExpanded);
                        continue;
                    }
                }
                if (numsPart !== starBetMatch[2].trim()) {
                    const subExpanded = expandLines([`${prefixCtx}${numsPart}*${amt}${suffix}`], lotteryType, settings);
                    expanded.push(...subExpanded);
                    continue;
                }
                let finalAmt = amt;
                if (!amt.includes('*') && !amt.includes('-') && !amt.includes('ชุด') && !amt.includes('ช')) {
                    finalAmt = `${amt}*${amt}`;
                }
                line = `${prefixCtx}${numsPart}=${finalAmt}${suffix}`;
            }
        }
        if (!line.includes('=')) {
            const prefixMatch = line.match(/^(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|ลอยทั่วไป|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*/i);
            const prefix = prefixMatch ? prefixMatch[0] : '';
            const rest = prefixMatch ? line.substring(prefix.length) : line;
            if (/^[\d,\s\-')]+$/.test(rest)) {
                const hasComma = rest.includes(',');
                const hasParen = rest.includes(')');
                const hasQuote = rest.includes("'");
                const hyphenCount = (rest.match(/-/g) || []).length;
                if (hyphenCount === 1 && !hasComma && !hasParen && !hasQuote) {
                    expanded.push(line);
                    continue;
                }
                const numTokens = rest.split(/[,\-')]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                if (numTokens.length >= 2) {
                    const firstLen = numTokens[0].length;
                    const allSameLen = numTokens.every(tok => tok.length === firstLen);
                    if (allSameLen) {
                        for (const num of numTokens) {
                            expanded.push(`${prefix}${num}`);
                        }
                        continue;
                    }
                }
            }
        }
        let didExpand = false;
        if (line.includes('=')) {
            const eqIdx = line.indexOf('=');
            const numsPart = line.substring(0, eqIdx).trim();
            const amtPart = line.substring(eqIdx + 1).trim();
            const prefixMatch = numsPart.match(/^(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|ลอยทั่วไป|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*/i);
            const prefix = prefixMatch ? prefixMatch[0] : '';
            const cleanNumsPart = prefixMatch ? numsPart.substring(prefix.length) : numsPart;
            if (/[,/\-')]/.test(cleanNumsPart)) {
                const numTokens = cleanNumsPart.split(/[,/\-')]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                if (numTokens.length >= 2) {
                    for (const num of numTokens) {
                        expanded.push(`${prefix}${num}=${amtPart}`);
                    }
                    didExpand = true;
                }
            }
        }
        else {
            const spaceAmtMatch = line.match(/^((?:[ก-๛a-zA-Z.]+\s*)?[\d,/\-\s')]+?)\s+(\d+[*]\d+.*)$/);
            if (spaceAmtMatch) {
                const numsPart = spaceAmtMatch[1].trim();
                const amtPart = spaceAmtMatch[2].trim();
                const prefixMatch = numsPart.match(/^(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|ลอยทั่วไป|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*/i);
                const prefix = prefixMatch ? prefixMatch[0] : '';
                const cleanNumsPart = prefixMatch ? numsPart.substring(prefix.length) : numsPart;
                if (/[,/\-')]/.test(cleanNumsPart)) {
                    const numTokens = cleanNumsPart.split(/[,/\-')]/).map(s => s.trim()).filter(s => /^\d{1,5}$/.test(s));
                    if (numTokens.length >= 2) {
                        for (const num of numTokens) {
                            expanded.push(`${prefix}${num}=${amtPart}`);
                        }
                        didExpand = true;
                    }
                }
            }
        }
        if (didExpand)
            continue;
        if (!line.includes('=')) {
            line = line.replace(/^(\d{1,5})\.\s/, '$1 ');
            const slashTriple = line.match(/^(\d{1,5})\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
            if (slashTriple) {
                line = `${slashTriple[1]}=${slashTriple[2]}*${slashTriple[3]}`;
            }
            else {
                line = line.replace(/^(\d{1,5}\.?\s+\d+)\s*[\-/+:]\s*(\d+)/, '$1*$2');
            }
        }
        expanded.push(line);
    }
    return expanded;
}
export function parseMultiLinePaste(text, lotteryType = 'lao', settings) {
    if (!text || !text.trim())
        return [];
    const filteredText = text.replace(/(?<!\d)5{3,}\+*(?!\d)(?!\s*([=\*xX×tTต\-/]|\d|\+\s*\d))/g, '');
    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType);
    const rawLines = filteredText.split('\n');
    const lines = expandLines(rawLines, lotteryType, settings);
    const results = [];
    let contextMode = 'top';
    let bareNumberBuffer = [];
    let lastProcessedNumLen = null;
    function flushBareBuffer() {
        for (const bareNum of bareNumberBuffer) {
            const parsed = parseNumberLine(bareNum, contextMode, isLaoOrHanoi, lotteryType, settings);
            if (parsed) {
                if (contextMode === 'both') {
                    results.push(...emitBoth(bareNum, isLaoOrHanoi, lotteryType, settings));
                }
                else {
                    results.push(...parsed);
                }
            }
        }
        bareNumberBuffer = [];
    }
    function applyAmountToBuffer(amountStr, mode) {
        const ctx = mode || contextMode;
        for (const bareNum of bareNumberBuffer) {
            const synthLine = `${bareNum}=${amountStr}`;
            if (ctx === 'both') {
                const bothEntries = emitBoth(synthLine, isLaoOrHanoi, lotteryType, settings);
                results.push(...bothEntries);
            }
            else {
                const parsed = parseNumberLine(synthLine, ctx, isLaoOrHanoi, lotteryType, settings);
                if (parsed)
                    results.push(...parsed);
            }
        }
        bareNumberBuffer = [];
    }
    for (let i = 0; i < lines.length; i++) {
        const trimmed = normalizeUnicode(lines[i].trim());
        if (!trimmed)
            continue;
        const modeResult = parseContextLine(trimmed, contextMode);
        if (modeResult !== null) {
            if (bareNumberBuffer.length > 0)
                flushBareBuffer();
            contextMode = modeResult;
            continue;
        }
        if (isBareNumberLine(trimmed)) {
            const currentNumLen = trimmed.length;
            if (currentNumLen === 3 && lastProcessedNumLen !== null && lastProcessedNumLen !== 3) {
                if (['float_top', 'float_bottom'].includes(contextMode)) {
                    contextMode = 'top';
                }
            }
            lastProcessedNumLen = currentNumLen;
            bareNumberBuffer.push(trimmed);
            continue;
        }
        const stripped = stripPrefixNoise(trimmed);
        let lineToProcess = stripped || trimmed;
        const digitMatches = lineToProcess.match(/\d+/g) || [];
        if (digitMatches.length === 1 && /^\d+/.test(lineToProcess)) {
            const hasEquals = lineToProcess.includes('=') || lineToProcess.includes(':');
            const hasBetKeywords = /ตัวละ|ตูละ|ประตูละ|ชุดละ|ตัวตรง|ตรง|กลับ|คูณชุด|คูณ|ชุด|บาท|บน|ล่าง|วิ่ง|ลอย|โต๊ด|มี|ตัว|พี่น้อง|พน|เลขคู่|คู่|เลขเบิ้ล|เบิ้ล|คู่คี่|คู่คี|คู่คู่|คู่คู|คี่คี่|คี่คี|วินกลับ|วินเบิ้ล|วิน|19\s*หาง|หาง/.test(lineToProcess) ||
                /(?<![ก-๛a-zA-Z])[บลชซ]\.?(?![ก-๛a-zA-Z])/.test(lineToProcess);
            if (!hasEquals && !hasBetKeywords) {
                if (/[ก-๛a-zA-Z]/.test(lineToProcess)) {
                    continue;
                }
                lineToProcess = digitMatches[0];
            }
        }
        const strippedMode = parseContextLine(stripped, contextMode);
        if (strippedMode !== null) {
            if (bareNumberBuffer.length > 0)
                flushBareBuffer();
            contextMode = strippedMode;
            continue;
        }
        const trailingCtx = extractTrailingContext(trimmed);
        if (trailingCtx !== null) {
            if (bareNumberBuffer.length > 0)
                flushBareBuffer();
            contextMode = trailingCtx;
            continue;
        }
        if (lineToProcess && isBareNumberLine(lineToProcess)) {
            const currentNumLen = lineToProcess.length;
            if (currentNumLen === 3 && lastProcessedNumLen !== null && lastProcessedNumLen !== 3) {
                if (['float_top', 'float_bottom'].includes(contextMode)) {
                    contextMode = 'top';
                }
            }
            lastProcessedNumLen = currentNumLen;
            bareNumberBuffer.push(lineToProcess);
            continue;
        }
        if (bareNumberBuffer.length > 0) {
            const amountInfo = extractAmountFromLine(trimmed) || extractAmountFromLine(lineToProcess);
            if (amountInfo) {
                if (amountInfo.number) {
                    const currentNumLen = amountInfo.number.length;
                    if (currentNumLen === 3 && lastProcessedNumLen !== null && lastProcessedNumLen !== 3) {
                        if (['float_top', 'float_bottom'].includes(contextMode)) {
                            contextMode = 'top';
                        }
                    }
                    lastProcessedNumLen = currentNumLen;
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
        const numMatch = (processLine || '').match(/^(\d+)/);
        if (numMatch) {
            const currentNumLen = numMatch[1].length;
            if (currentNumLen === 3 && lastProcessedNumLen !== null && lastProcessedNumLen !== 3) {
                if (['float_top', 'float_bottom'].includes(contextMode)) {
                    contextMode = 'top';
                }
            }
            lastProcessedNumLen = currentNumLen;
        }
        let lineCtx = getLineEffectiveContext(processLine, contextMode);
        if (lineCtx === contextMode && stripped && stripped !== trimmed) {
            const origCtx = getLineEffectiveContext(trimmed, contextMode);
            if (origCtx !== contextMode) {
                lineCtx = origCtx;
                const origInline = extractInlineContext(trimmed, contextMode);
                if (origInline.mode) {
                    processLine = origInline.cleaned;
                }
            }
        }
        if (lineCtx !== contextMode) {
            contextMode = lineCtx;
        }
        if (lineCtx === 'both') {
            const bothResults = emitBoth(processLine, isLaoOrHanoi, lotteryType, settings);
            results.push(...bothResults);
        }
        else {
            const parsed = parseNumberLine(processLine, lineCtx, isLaoOrHanoi, lotteryType, settings);
            if (parsed)
                results.push(...parsed);
        }
    }
    if (bareNumberBuffer.length > 0)
        flushBareBuffer();
    return results;
}
function isConversationalSingleNumberLine(line) {
    const trimmed = line.trim();
    const digitMatches = trimmed.match(/\d+/g) || [];
    if (digitMatches.length !== 1) {
        return false;
    }
    const hasLetters = /[ก-๛a-zA-Z]/.test(trimmed);
    if (hasLetters) {
        const hasEquals = trimmed.includes('=') || trimmed.includes(':');
        const hasBetKeywords = /ตัวละ|ตูละ|ประตูละ|ชุดละ|ตัวตรง|ตรง|กลับ|คูณชุด|คูณ|ชุด|บาท|บน|ล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|มี|ตัว|พี่น้อง|พน|เลขคู่|คู่|เลขเบิ้ล|เบิ้ล|คู่คี่|คู่คี|คู่คู่|คู่คู|คี่คี่|คี่คี|วินกลับ|วินเบิ้ล|วิน|19\s*หาง|หาง/.test(trimmed) ||
            /(?<![ก-๛a-zA-Z])[บลชซ]\.?(?![ก-๛a-zA-Z])/.test(trimmed);
        if (!hasEquals && !hasBetKeywords) {
            return true;
        }
    }
    const numStr = digitMatches[0];
    const textOnly = trimmed.replace(numStr, '').trim();
    if (textOnly.length === 0) {
        return false;
    }
    let cleaned = textOnly.toLowerCase();
    cleaned = cleaned.replace(/[\s.+\-*×xX\/=\(\)\[\]{}]/g, '');
    cleaned = cleaned.replace(/ตัวละ|ตูละ|ประตูละ|ชุดละ|ตัวตรง|ตรง|กลับ|คูณชุด|คูณ|ชุด|บาท|บ\.?|ล\.?|บน|ล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|มี|ตัว|ช|ซ|พี่น้อง|พน|เลขคู่|คู่|เลขเบิ้ล|เบิ้ล|คู่คี่|คู่คี|คู่คู่|คู่คู|คี่คี่|คี่คี|วินกลับ|วินเบิ้ล|วิน|19หาง|หาง/g, '');
    if (cleaned.length === 0) {
        return false;
    }
    const textFirstMatch = trimmed.match(/^([ก-๛a-zA-Z\s\(\)\[\]{}#.]+?)\s*(\d+)$/);
    if (textFirstMatch) {
        const hasEquals = trimmed.includes('=') || trimmed.includes(':');
        const hasBetKeywords = /ตัวละ|ตูละ|ประตูละ|ชุดละ|ตัวตรง|ตรง|กลับ|คูณชุด|คูณ|ชุด|บาท|บน|ล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|มี|ตัว|พี่น้อง|พน|เลขคู่|คู่|เลขเบิ้ล|เบิ้ล|คู่คี่|คู่คี|คู่คู่|คู่คู|คี่คี่|คี่คี|วินกลับ|วินเบิ้ล|วิน|19\s*หาง|หาง/.test(trimmed) ||
            /(?<![ก-๛a-zA-Z])[บลชซ]\.?(?![ก-๛a-zA-Z])/.test(trimmed);
        if (!hasEquals && !hasBetKeywords) {
            return true;
        }
    }
    const conversationalKeywords = [
        'โอน', 'จ่าย', 'ส่ง', 'เงิน', 'สลิป', 'แจ้ง', 'กิน', 'กาแฟ',
        'รวม', 'ยอด', 'คะ', 'ค่ะ', 'ครับ', 'จ้า', 'ลูกค้า', 'ขอบคุณ',
        'ทะลุ', 'ออก', 'นั้น', 'นี้', 'แล้ว', 'ได้', 'มี', 'ไป', 'มา'
    ];
    const hasConversationalKeyword = conversationalKeywords.some(kw => cleaned.includes(kw));
    if (hasConversationalKeyword || cleaned.length > 10) {
        return true;
    }
    return false;
}
function isBareNumberLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 4 && /^\d{4}$/.test(trimmed)) {
        return false;
    }
    return /^\d{1,5}$/.test(trimmed);
}
function extractAmountFromLine(line) {
    let s = normalizeUnicode(line.trim());
    s = s.replace(/\s*(กลับ|กลับตัว|กลับด้วย)\s*$/, '').trim();
    s = s.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด');
    s = s.replace(/(\d)\s*[tTต]\s*(\d)/g, '$1*$2');
    s = s.replace(/(\d)\s*[/+]\s*(\d)/g, '$1*$2');
    s = s.replace(/(\d),(\d{3})/g, '$1$2');
    let mode = null;
    const floatBotSuffix = s.match(/\s*(วิ่งล่าง|ลอยล่าง)\s*$/);
    if (floatBotSuffix) {
        mode = 'float_bottom';
        s = s.slice(0, floatBotSuffix.index).trim();
    }
    if (!mode) {
        const floatTopSuffix = s.match(/\s*(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|โตด|ต\.?)\s*$/);
        if (floatTopSuffix) {
            mode = 'float_top';
            s = s.slice(0, floatTopSuffix.index).trim();
        }
    }
    if (!mode) {
        const bothSuffix = s.match(/\s*(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล\.?|ล[+\-]?บ\.?|บล\.?|ลบ\.?)\s*$/);
        if (bothSuffix) {
            mode = 'both';
            s = s.slice(0, bothSuffix.index).trim();
        }
        else {
            const singleCtx = s.match(/\s*(บน|บ\.?|ล่าง|ล\.?)\s*$/);
            if (singleCtx) {
                const modeStr = singleCtx[1].replace('.', '');
                mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
                s = s.slice(0, singleCtx.index).trim();
            }
        }
    }
    const split = splitAmountAndTrailingText(s);
    if (split) {
        s = split.amountStr;
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
            if (/^(บน|บ)$/.test(ctxStr))
                mode = 'top';
            else if (/^(ล่าง|ล)$/.test(ctxStr))
                mode = 'bottom';
            return { amountStr: amt, mode, number: null };
        }
    }
    const floatPrefixRe = /^(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โตด|ต\.?|ลอยทั่วไป)\.?\s*(\d.+)$/;
    const floatPrefixMatch = s.match(floatPrefixRe);
    if (floatPrefixMatch) {
        const kw = floatPrefixMatch[1];
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        const amt = floatPrefixMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt)) {
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
            if (isAmountPattern(amt))
                return { amountStr: amt, mode: 'both', number: numCtxMatch[1] };
        }
        const singleM = ctxPart.match(singlePrefixRe);
        if (singleM) {
            const amt = singleM[2].trim();
            const mStr = singleM[1];
            const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom';
            if (isAmountPattern(amt))
                return { amountStr: amt, mode: m, number: numCtxMatch[1] };
        }
    }
    const pureBothM = s.match(bothPrefixRe);
    if (pureBothM) {
        const amt = pureBothM[2].trim();
        if (isAmountPattern(amt))
            return { amountStr: amt, mode: 'both', number: null };
    }
    const pureSingleM = s.match(singlePrefixRe);
    if (pureSingleM) {
        const amt = pureSingleM[2].trim();
        const mStr = pureSingleM[1];
        const m = (mStr === 'บน' || mStr === 'บ') ? 'top' : 'bottom';
        if (isAmountPattern(amt))
            return { amountStr: amt, mode: m, number: null };
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
        if (isAmountPattern(amt) || /^\d+$/.test(amt))
            return { amountStr: amt, mode, number: null };
        return null;
    }
    const eqMatch = s.match(/^(\d{1,5})\s*=\s*(.+)$/);
    if (eqMatch) {
        const amt = eqMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt))
            return { amountStr: amt, mode, number: eqMatch[1] };
        return null;
    }
    const spaceMatch = s.match(/^(\d{1,5})\s+(.+)$/);
    if (spaceMatch) {
        const amt = spaceMatch[2].trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt))
            return { amountStr: amt, mode, number: spaceMatch[1] };
        return null;
    }
    if (isAmountPattern(s))
        return { amountStr: s, mode, number: null };
    return null;
}
function hasPendingBareNumbersBefore(rawLines, currentIndex) {
    for (let j = currentIndex - 1; j >= 0; j--) {
        const raw = rawLines[j];
        if (!raw)
            continue;
        const trimmed = normalizeUnicode(raw.trim());
        if (!trimmed)
            continue;
        if (isConversationalSingleNumberLine(trimmed))
            continue;
        if (isDateLine(trimmed))
            continue;
        const cleaned = cleanPrefixNoiseButKeepContext(trimmed);
        const line = cleaned || trimmed;
        if (parseContextLine(line) !== null) {
            continue;
        }
        if (isBareNumberLine(line)) {
            return true;
        }
        if (line.includes('=') || isAmountPattern(line) || isPureAmountLine(line)) {
            return false;
        }
        if (/^\d{1,5}\s*[*×xX\-+/tTต]\s*\d+/.test(line)) {
            return false;
        }
    }
    return false;
}
function isPureAmountLine(line) {
    if (!line)
        return false;
    let s = normalizeUnicode(line.trim());
    if (s.startsWith('=')) {
        const amt = s.substring(1).trim();
        if (isAmountPattern(amt) || /^\d+$/.test(amt))
            return true;
    }
    s = s.replace(/^(กลับ|กลับตัว|กลับด้วย)\s*/, '');
    s = s.replace(/\s*(กลับ|กลับตัว|กลับด้วย)$/, '');
    s = s.replace(/^(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*/i, '');
    s = s.replace(/\s*(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?$/i, '');
    return isAmountPattern(s);
}
function extractTokenAmountAndContext(token) {
    const s = normalizeUnicode(token.trim());
    if (/ชุด|บาท/i.test(s))
        return null;
    const symMatch = s.match(/^(\d+)\s*[*×xX\-+/]\s*(\d+)$/);
    if (symMatch && symMatch[1] === symMatch[2])
        return null;
    const match = s.match(/^(\d{1,5})\s*([*×xX=])\s*(.+)$/);
    if (match) {
        const num = match[1];
        const sep = match[2] === '=' ? '=' : '*';
        const rest = match[3].trim();
        const ctxMatch = rest.match(/^(.*?)\s*(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี|บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล)\.?\s*$/i);
        if (ctxMatch) {
            return {
                number: num,
                amount: ctxMatch[1].trim(),
                context: ctxMatch[2].trim(),
                separator: sep
            };
        }
        return {
            number: num,
            amount: rest,
            context: null,
            separator: sep
        };
    }
    return null;
}
function isAmountPattern(s) {
    if (!s || !s.trim())
        return false;
    const t = s.trim();
    if (/^\d+$/.test(t))
        return false;
    const hyphenMatch = t.match(/^(\d+)-(\d+)$/);
    if (hyphenMatch) {
        const len1 = hyphenMatch[1].length;
        const len2 = hyphenMatch[2].length;
        const val1 = hyphenMatch[1];
        const val2 = hyphenMatch[2];
        if (len1 !== len2 || len1 === 1 || len1 === 3 || (len1 === 2 && val1 !== val2)) {
            return false;
        }
    }
    return /^\d+[*×xX\-+/](\d+|ชุด)$/.test(t) ||
        /^\d+[*×xX\-+/]\d+[*×xX\-+/]\d+$/.test(t) ||
        /^\d+[*×xX\-+/]\d+[*×xX\-+/]ชุด$/.test(t) ||
        /^\d+\s*[tTต]\s*\d+$/.test(t) ||
        /^\d+\s*ชุด$/.test(t) ||
        /^\d+\s*(?:บาท|บ\.?)$/i.test(t);
}
function getLineEffectiveContext(line, contextMode) {
    const preClean = line.trim();
    let inlineCtx = extractInlineContext(preClean, contextMode);
    if (inlineCtx.mode)
        return inlineCtx.mode;
    const normalized = stripPrefixNoise(preClean);
    if (normalized) {
        inlineCtx = extractInlineContext(normalized, contextMode);
        if (inlineCtx.mode)
            return inlineCtx.mode;
    }
    return contextMode;
}
function emitBoth(rawLine, isLaoOrHanoi, lotteryType, settings) {
    const results = [];
    const inlineCtx = extractInlineContext(rawLine.trim(), 'both');
    const cleanLine = inlineCtx.mode ? inlineCtx.cleaned : rawLine;
    const eqCtx = cleanLine.match(/^(\d{1,5}\s*=\s*)(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*(.+)$/);
    const finalLine = eqCtx ? `${eqCtx[1]}${eqCtx[3]}` : cleanLine;
    const topParsed = parseNumberLine(finalLine, 'top', isLaoOrHanoi, lotteryType, settings);
    if (topParsed)
        results.push(...topParsed);
    const numDigits = topParsed && topParsed.length > 0 ? topParsed[0].numbers.length : 0;
    if (numDigits <= 2) {
        const botParsed = parseNumberLine(finalLine, 'bottom', isLaoOrHanoi, lotteryType, settings);
        if (botParsed)
            results.push(...botParsed);
    }
    return results;
}
function stripPrefixNoise(line) {
    let s = line.trim();
    s = s.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '');
    s = s.replace(/^[^=\d]*(?=[=\d])/, '');
    return s.trim();
}
function isBothContext(line) {
    const s = line.trim().replace(/(?:กลับ|กลับตัว|กลับด้วย)\s*$/, '').trim();
    if (/\d/.test(s))
        return false;
    let thaiOnly = s.replace(/[^ก-๛]/g, '');
    thaiOnly = thaiOnly.replace(/ลอย|เล่น|เลข|ลูกค้า|แล้ว|ละ|สลิป/g, '');
    if (/^(บนล่าง|ล่างบน|บล|ลบ)$/.test(thaiOnly))
        return true;
    const hasTop = /(บน|บ)/.test(thaiOnly);
    const hasBottom = /(ล่าง|ล)/.test(thaiOnly);
    if (hasTop && hasBottom && thaiOnly.length <= 10)
        return true;
    return false;
}
function parseContextLine(line, contextMode) {
    const withPunct = line.trim().replace(/(?:กลับ|กลับตัว|กลับด้วย)\s*$/, '').trim();
    const bracketCleaned = withPunct.replace(/[\[\](){}]/g, '').replace(/[\s.+\-]/g, '');
    const isBottom = (contextMode === 'bottom' || contextMode === 'float_bottom' || contextMode === 'front_bottom_1' || contextMode === 'back_bottom_1');
    if (/^2ตัว(หน้า|หน้ากลับ|2หน้า|2หน้ากลับ)$/.test(bracketCleaned) || /^(2ตัวหน้า|2ตัวหน้ากลับ|2หน้า|2หน้ากลับ)$/.test(bracketCleaned))
        return 'front';
    if (/^2ตัว(ถ่าง|ถ่างกลับ|2ถ่าง|2ถ่างกลับ|กลาง|กลางกลับ|2กลาง|2กลางกลับ)$/.test(bracketCleaned) || /^(2ตัวถ่าง|2ตัวถ่างกลับ|2ถ่าง|2ถ่างกลับ|2ตัวกลาง|2ตัวกลางกลับ|2กลาง|2กลางกลับ)$/.test(bracketCleaned))
        return 'center';
    if (/^\d*ตัว(หน้าล่าง|ปักหน้าล่าง)$/.test(bracketCleaned) || /^(หน้าล่าง|ปักหน้าล่าง)$/.test(bracketCleaned))
        return 'front_bottom_1';
    if (/^\d*ตัว(หลังล่าง|ปักหลังล่าง)$/.test(bracketCleaned) || /^(หลังล่าง|ปักหลังล่าง)$/.test(bracketCleaned))
        return 'back_bottom_1';
    if (/^\d*ตัว(หน้าบน|ปักหน้าบน)$/.test(bracketCleaned) || /^(หน้าบน|ปักหน้าบน)$/.test(bracketCleaned))
        return 'front_top_1';
    if (/^\d*ตัว(กลางบน|ปักกลางบน)$/.test(bracketCleaned) || /^(กลางบน|ปักกลางบน)$/.test(bracketCleaned))
        return 'middle_top_1';
    if (/^\d*ตัว(หลังบน|ปักหลังบน)$/.test(bracketCleaned) || /^(หลังบน|ปักหลังบน)$/.test(bracketCleaned))
        return 'back_top_1';
    if (/^\d*ตัว(ปักหน้า|หน้า)$/.test(bracketCleaned) || /^(ปักหน้า|หน้า)$/.test(bracketCleaned))
        return isBottom ? 'front_bottom_1' : 'front_top_1';
    if (/^\d*ตัว(ปักกลาง|กลาง)$/.test(bracketCleaned) || /^(ปักกลาง|กลาง)$/.test(bracketCleaned))
        return 'middle_top_1';
    if (/^\d*ตัว(ปักหลัง|หลัง)$/.test(bracketCleaned) || /^(ปักหลัง|หลัง)$/.test(bracketCleaned))
        return isBottom ? 'back_bottom_1' : 'back_top_1';
    if (/^\d*ตัว(บนล่าง|ล่างบน|บล|ลบ)$/.test(bracketCleaned))
        return 'both';
    if (/^\d*ตัว(ล่าง|ล)$/.test(bracketCleaned))
        return 'bottom';
    if (/^\d*ตัว(บน|บ)$/.test(bracketCleaned))
        return 'top';
    if (/^\d*ตัว(วิ่งล่าง|ลอยล่าง)$/.test(bracketCleaned))
        return 'float_bottom';
    if (/^\d*ตัว(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|มี)$/.test(bracketCleaned))
        return 'float_top';
    const cleanedFloat = withPunct.replace(/[\s.+\-]/g, '');
    if (/^(วิ่งบน|ลอยบน|วิ่งบ|ลอยบ|ลอยทั่วไป)$/.test(cleanedFloat))
        return 'float_top';
    if (/^(วิ่งล่าง|ลอยล่าง|วิ่งล|ลอยล)$/.test(cleanedFloat))
        return 'float_bottom';
    if (/^(วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|มี)$/.test(cleanedFloat))
        return 'float_top';
    if (/^2ตัว(มี|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?)$/.test(cleanedFloat))
        return 'float_top';
    if (isBothContext(withPunct))
        return 'both';
    const cleaned = withPunct.replace(/[^ก-๛a-zA-Z0-9]/g, '').trim();
    if (/^(บน|บ)(?:นะ|คะ|ค่ะ|ครับ|จ้า|กลุ่ม|จ๊ะ|คับ|จร้า|ก๊าบ|คะะ|ค่ะะ|ครับบ|จ้าา|นะจ๊ะ|นะคะ|นะค่ะ|นะคับ|นะจร้า|นะเว้ย|นะเออ)*$/.test(cleaned))
        return 'top';
    if (/^(ล่าง|ล)(?:นะ|คะ|ค่ะ|ครับ|จ้า|กลุ่ม|จ๊ะ|คับ|จร้า|ก๊าบ|คะะ|ค่ะะ|ครับบ|จ้าา|นะจ๊ะ|นะคะ|นะค่ะ|นะคับ|นะจร้า|นะเว้ย|นะเออ)*$/.test(cleaned))
        return 'bottom';
    const testStr = cleaned.replace(/^\d+ตัว/, '');
    if (/^(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|มี)(?:นะ|คะ|ค่ะ|ครับ|จ้า|กลุ่ม|จ๊ะ|คับ|จร้า|ก๊าบ|คะะ|ค่ะะ|ครับบ|จ้าา|นะจ๊ะ|นะคะ|นะค่ะ|นะคับ|นะจร้า|นะเว้ย|นะเออ)*$/.test(testStr))
        return 'float_top';
    if (/^(วิ่งล่าง|ลอยล่าง)(?:นะ|คะ|ค่ะ|ครับ|จ้า|กลุ่ม|จ๊ะ|คับ|จร้า|ก๊าบ|คะะ|ค่ะะ|ครับบ|จ้าา|นะจ๊ะ|นะคะ|นะค่ะ|นะคับ|นะจร้า|นะเว้ย|นะเออ)*$/.test(testStr))
        return 'float_bottom';
    if (/^บ\.?$/.test(withPunct))
        return 'top';
    if (/^ล\.?$/.test(withPunct))
        return 'bottom';
    if (/^บน$/.test(withPunct))
        return 'top';
    if (/^ล่าง$/.test(withPunct))
        return 'bottom';
    return null;
}
function extractTrailingContext(line) {
    const s = line.trim();
    function stripTimestamp(str) {
        return str.replace(/^\d{1,2}[:.:]\d{2}([:.:]\d{2})?\s*/, '').trim();
    }
    function isPureNoise(before) {
        if (!before)
            return false;
        const noTs = stripTimestamp(before);
        return !/\d/.test(noTs);
    }
    const bothMatch = s.match(/(?:^|\s)(บนล่าง|ล่างบน|บล\.?|ลบ\.?|บ[+\-]?ล\.?|ล[+\-]?บ\.?)\s*$/);
    if (bothMatch) {
        const before = s.slice(0, bothMatch.index).trim();
        if (isPureNoise(before))
            return 'both';
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
function refineFloatMode(mode, text) {
    const lower = text.toLowerCase();
    if (/บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ/.test(lower)) {
        return 'both';
    }
    if (/ล่าง|ล\.?(?![ก-๛a-zA-Z])/.test(lower)) {
        return 'float_bottom';
    }
    if (/บน|บ\.?(?![ก-๛a-zA-Z])/.test(lower)) {
        return 'float_top';
    }
    return mode;
}
function refinePositionMode(mode, text, contextMode) {
    const lower = text.toLowerCase();
    const isBottom = /ล่าง|ล\.?(?![ก-๛a-zA-Z])/.test(lower) ||
                     ((contextMode === 'bottom' || contextMode === 'float_bottom' || contextMode === 'front_bottom_1' || contextMode === 'back_bottom_1') && !/บน|บ\.?(?![ก-๛a-zA-Z])/.test(lower));
    if (isBottom) {
        if (mode === 'front_top_1') return 'front_bottom_1';
        if (mode === 'back_top_1') return 'back_bottom_1';
    }
    return mode;
}
export function extractInlineContext(line, contextMode) {
    let s = line.trim();
    const positionCtxSuffix = s.match(/^(.+?)(?<=\d|\s|=)(หน้า|ถ่าง)\.?\s*(?:กลับ|กลับตัว|กลับด้วย)?\s*$/);
    if (positionCtxSuffix) {
        const rest = positionCtxSuffix[1];
        const mode = positionCtxSuffix[2] === 'หน้า' ? 'front' : 'center';
        return { cleaned: rest.trim(), mode };
    }
    const positionCtxPrefix = s.match(/^(หน้า|ถ่าง)\.?\s*(\d.*)$/);
    if (positionCtxPrefix) {
        const rest = positionCtxPrefix[2];
        const mode = positionCtxPrefix[1] === 'หน้า' ? 'front' : 'center';
        return { cleaned: rest.trim(), mode };
    }
    // Position bets (หน้า, กลาง, หลัง)
    const posPrefix = s.match(/^(หน้าบน|ปักหน้าบน|กลางบน|ปักกลางบน|หลังบน|ปักหลังบน|หน้าล่าง|ปักหน้าล่าง|หลังล่าง|ปักหลังล่าง|ปักหน้า|ปักกลาง|ปักหลัง|หน้า|กลาง|หลัง)\s*(บน|ล่าง|บ|ล)?\.?\s*(\d.*)$/i);
    if (posPrefix) {
        const kw = posPrefix[1];
        let mode = 'front_top_1';
        if (kw.includes('กลาง')) mode = 'middle_top_1';
        if (kw.includes('หลัง')) mode = 'back_top_1';
        mode = refinePositionMode(mode, s, contextMode);
        return { cleaned: posPrefix[3].trim(), mode };
    }
    const posSuffix = s.match(/^(.+?)\s*(หน้าบน|ปักหน้าบน|กลางบน|ปักกลางบน|หลังบน|ปักหลังบน|หน้าล่าง|ปักหน้าล่าง|หลังล่าง|ปักหลังล่าง|ปักหน้า|ปักกลาง|ปักหลัง|หน้า|กลาง|หลัง)\s*(บน|ล่าง|บ|ล)?\s*$/i);
    if (posSuffix) {
        const kw = posSuffix[2];
        let mode = 'front_top_1';
        if (kw.includes('กลาง')) mode = 'middle_top_1';
        if (kw.includes('หลัง')) mode = 'back_top_1';
        mode = refinePositionMode(mode, s, contextMode);
        return { cleaned: posSuffix[1].trim(), mode };
    }
    const posMiddle = s.match(/^(\d+)\s*(หน้าบน|ปักหน้าบน|กลางบน|ปักกลางบน|หลังบน|ปักหลังบน|หน้าล่าง|ปักหน้าล่าง|หลังล่าง|ปักหลังล่าง|ปักหน้า|ปักกลาง|ปักหลัง|หน้า|กลาง|หลัง)\s*(บน|ล่าง|บ|ล)?\s*[=\s]\s*(\d[\d*=\-+]*)$/i);
    if (posMiddle) {
        const kw = posMiddle[2];
        let mode = 'front_top_1';
        if (kw.includes('กลาง')) mode = 'middle_top_1';
        if (kw.includes('หลัง')) mode = 'back_top_1';
        mode = refinePositionMode(mode, s, contextMode);
        return { cleaned: `${posMiddle[1]}=${posMiddle[4].trim()}`, mode };
    }
    const floatPrefixTop = s.match(/^(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี)\.?\s*(\d.*)$/);
    if (floatPrefixTop) {
        const kw = floatPrefixTop[1];
        let mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        mode = refineFloatMode(mode, s);
        return { cleaned: floatPrefixTop[2].trim(), mode };
    }
    const floatPrefixBot = s.match(/^(วิ่งล่าง|ลอยล่าง)\.?\s*(\d.*)$/);
    if (floatPrefixBot) {
        let mode = 'float_bottom';
        mode = refineFloatMode(mode, s);
        return { cleaned: floatPrefixBot[2].trim(), mode };
    }
    const floatSuffixBot = s.match(/^(.+?)\s*(วิ่งล่าง|ลอยล่าง)\s*$/);
    if (floatSuffixBot) {
        let mode = 'float_bottom';
        mode = refineFloatMode(mode, s);
        return { cleaned: floatSuffixBot[1].trim(), mode };
    }
    const floatSuffix = s.match(/^(.+?)\s*(วิ่งบน|ลอยบน|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี)\s*$/);
    if (floatSuffix) {
        const kw = floatSuffix[2];
        const beforeKw = floatSuffix[1].trim();
        if ((kw === 'โต๊ด' || kw === 'โต้ด' || kw === 'โตด') && (beforeKw.endsWith('เต็ง') || beforeKw.endsWith('เต็ง-') || beforeKw.endsWith('เต็ง/'))) {
            // Rejection: it's part of a compound keyword "เต็งโต๊ด", not a float suffix
        } else {
            let mode = 'float_top';
            mode = refineFloatMode(mode, s);
            return { cleaned: floatSuffix[1].trim(), mode };
        }
    }
    const floatMiddle = s.match(/^(\d+)\s*(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี)\s+(\d[\d*=\-+]*)$/);
    if (floatMiddle) {
        const kw = floatMiddle[2];
        let mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        mode = refineFloatMode(mode, s);
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
    const bothSuffix = s.match(/^(.+?)\s*(บนล่าง|ล่างบน|บน[\s\-]?ล่าง|ล่าง[\s\-]?บน|บ[+\-]?ล|ล[+\-]?บ|บล|ลบ)\.?\s*(?:กลับ|กลับตัว|กลับด้วย)?\s*$/);
    if (bothSuffix) {
        return { cleaned: bothSuffix[1].trim(), mode: 'both' };
    }
    const suffixMatch = s.match(/^(.+?)(?<=\d|\s|=)(บน|บ|ล่าง|ล)\.?\s*(?:กลับ|กลับตัว|กลับด้วย)?\s*$/);
    if (suffixMatch) {
        const rest = suffixMatch[1];
        const modeStr = suffixMatch[2].replace('.', '');
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: rest.trim(), mode };
    }
    // Handle กลับ suffix for 3-digit reverse bets (only when not preceded by บน/ล่าง)
    const reverseSuffix = s.match(/^(.+?)\s*กลับ\s*$/);
    if (reverseSuffix) {
        return { cleaned: reverseSuffix[1].trim(), mode: 'reverse' };
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
    const eqBothSpace = s.match(/^(\d+)\s*=\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s+(\d.+)$/);
    if (eqBothSpace) {
        return { cleaned: `${eqBothSpace[1]}=${eqBothSpace[3].trim()}`, mode: 'both' };
    }
    const eqSingleInline = s.match(/^(\d+)\s*=\s*(บน|บ|ล่าง|ล)\.?\s*(\d.+)$/);
    if (eqSingleInline) {
        const modeStr = eqSingleInline[2];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: `${eqSingleInline[1]}=${eqSingleInline[3].trim()}`, mode };
    }
    const eqFloatInline = s.match(/^(\d+)\s*=\s*(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี)\.?\s*(\d.+)$/);
    if (eqFloatInline) {
        const kw = eqFloatInline[2];
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        return { cleaned: `${eqFloatInline[1]}=${eqFloatInline[3].trim()}`, mode };
    }
    const numCtxEqBoth = s.match(/^(\d+)\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?\s*=\s*(.+)$/);
    if (numCtxEqBoth) {
        return { cleaned: `${numCtxEqBoth[1]}=${numCtxEqBoth[3].trim()}`, mode: 'both' };
    }
    const numCtxEqSingle = s.match(/^(\d+)\s*(บน|บ|ล่าง|ล)\.?\s*=\s*(.+)$/);
    if (numCtxEqSingle) {
        const modeStr = numCtxEqSingle[2];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: `${numCtxEqSingle[1]}=${numCtxEqSingle[3].trim()}`, mode };
    }
    const noSpaceBoth = s.match(/^(\d+)(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ)\.?([=\d].*)$/);
    if (noSpaceBoth) {
        return { cleaned: `${noSpaceBoth[1]} ${noSpaceBoth[3].trim()}`, mode: 'both' };
    }
    const noSpaceSingle = s.match(/^(\d+)(บน|บ|ล่าง|ล)\.?([=\d].*)$/);
    if (noSpaceSingle) {
        const modeStr = noSpaceSingle[2];
        const mode = (modeStr === 'บน' || modeStr === 'บ') ? 'top' : 'bottom';
        return { cleaned: `${noSpaceSingle[1]} ${noSpaceSingle[3].trim()}`, mode };
    }
    const noSpaceFloat = s.match(/^(\d+)(วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|ต\.?|ลอยทั่วไป|มี)\.?([=\d].*)$/);
    if (noSpaceFloat) {
        const kw = noSpaceFloat[2];
        const mode = /ล่าง/.test(kw) ? 'float_bottom' : 'float_top';
        return { cleaned: `${noSpaceFloat[1]}=${noSpaceFloat[3].trim()}`, mode };
    }
    return { cleaned: line, mode: null };
}
function parseNumberLine(line, contextMode, isLaoOrHanoi, lotteryType, settings) {
    const preClean = normalizeUnicode(line.trim());
    if (isDateLine(preClean))
        return null;
    let inlineCtx = extractInlineContext(preClean, contextMode);
    let normalized = null;
    if (inlineCtx.mode) {
        normalized = stripPrefixNoise(inlineCtx.cleaned);
    }
    else {
        normalized = stripPrefixNoise(preClean);
        if (normalized) {
            inlineCtx = extractInlineContext(normalized, contextMode);
            if (inlineCtx.mode) {
                normalized = inlineCtx.cleaned;
            }
        }
    }
    if (!normalized)
        return null;
    let effectiveContext = inlineCtx.mode || contextMode;
    let normalizedMode = null;
    // 1. [xX-] at start followed by 2 digits: e.g. x25=20 -> 25=20, and context is top
    const p1 = normalized.match(/^(?<op>[xX-])(?<num>\d{2})(?<rest>[=*xX×:\s]+.*)?$/);
    if (p1) {
        const { num, rest } = p1.groups;
        normalized = `${num}${rest || ''}`.trim();
        normalizedMode = 'top';
    } else {
        // 2. 1 digit, then [xX-], then 1 digit: e.g. 2x5=20 -> 25=20, and context is center
        const p2 = normalized.match(/^(?<num1>\d)(?<op>[xX-])(?<num2>\d)(?<rest>[=*xX×:\s]+.*)?$/);
        if (p2) {
            const { num1, num2, rest } = p2.groups;
            normalized = `${num1}${num2}${rest || ''}`.trim();
            normalizedMode = 'center';
        } else {
            // 3. 2 digits followed by [xX-]: e.g. 25x=20 -> 25=20, and context is front
            const p3 = normalized.match(/^(?<num>\d{2})(?<op>[xX-])(?<rest>[=*xX×:\s]+.*)?$/);
            if (p3) {
                const { num, rest } = p3.groups;
                normalized = `${num}${rest || ''}`.trim();
                normalizedMode = 'front';
            }
        }
    }
    if (normalizedMode) {
        effectiveContext = normalizedMode;
    }
    const isReverseBet = effectiveContext === 'reverse';
    const parseContext = (effectiveContext === 'both') ? 'top' : (isReverseBet ? 'top' : effectiveContext);
    if (isDateLine(normalized))
        return null;
    const numMatch = normalized.match(/^(\d+)/);
    const preNumLen = numMatch ? numMatch[1].length : 0;
    if (preNumLen < 4) {
        normalized = normalized.replace(/(\d+)\s*[*×xX\-+]?\s*ชุด/g, '$1*ชุด');
    }
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
    let numbers = null;
    let amount1 = null;
    let amount2 = null;
    let amount3 = null;
    let hasChud = false;
    let hasMultiplierChud = false;
    const eqMatch = normalized.match(/^(\d+)\s*[=]\s*(.+)$/);
    if (eqMatch) {
        numbers = eqMatch[1];
        const amountPart = eqMatch[2].trim();
        const parsed = parseAmountPart(amountPart);
        amount1 = parsed.amount1;
        amount2 = parsed.amount2;
        amount3 = parsed.amount3;
        hasChud = parsed.hasChud;
        hasMultiplierChud = parsed.hasMultiplierChud;
    }
    else {
        const spaceMatch = normalized.match(/^(\d+)\s+(.+)$/);
        if (spaceMatch) {
            numbers = spaceMatch[1];
            const amountPart = spaceMatch[2].trim();
            const parsed = parseAmountPart(amountPart);
            amount1 = parsed.amount1;
            amount2 = parsed.amount2;
            amount3 = parsed.amount3;
            hasChud = parsed.hasChud;
            hasMultiplierChud = parsed.hasMultiplierChud;
        }
        else {
            const bareMatch = normalized.match(/^(\d+)$/);
            if (bareMatch) {
                numbers = bareMatch[1];
            }
        }
    }
    if (!numbers || numbers.length < 1 || numbers.length > 5)
        return null;
    if (!/^\d+$/.test(numbers))
        return null;
    const numLen = numbers.length;
    const permCount = numLen >= 2 ? getPermutationCount(numbers) : 1;
    return determineBetType(numbers, numLen, amount1, amount2, amount3, hasChud, permCount, parseContext, isLaoOrHanoi, lotteryType, line, settings, isReverseBet, hasMultiplierChud);
}
function parseAmountPart(str) {
    let hasChud = false;
    let hasMultiplierChud = false;
    let cleaned = normalizeUnicode(str.trim());
    if (/[*×xX\-\/]\s*ชุด|ทุกประตู|ทุกประตุ|ทุกตู|ทุกตุ/i.test(cleaned)) {
        hasMultiplierChud = true;
    }
    cleaned = cleaned.replace(/(\d)[xX](\d)/g, '$1*$2');
    if (cleaned.includes('ชุด')) {
        hasChud = true;
        cleaned = cleaned.replace(/\*?ชุด/g, '').trim();
    }
    cleaned = cleaned.replace(/^[^0-9]+/, '').trim();
    cleaned = cleaned.replace(/(\d),(\d{3})/g, '$1$2');
    cleaned = cleaned.replace(/(\d)\s*[/+:tTต]\s*(\d)/g, '$1*$2');
    const parts = cleaned.split(/[*\-]/).map(s => s.trim()).filter(s => s);
    const amount1 = parts[0] ? parseInt(parts[0]) : null;
    const amount2 = parts[1] ? parseInt(parts[1]) : null;
    const amount3 = parts[2] ? parseInt(parts[2]) : null;
    return {
        amount1: (amount1 && amount1 > 0) ? amount1 : null,
        amount2: (amount2 && amount2 > 0) ? amount2 : null,
        amount3: (amount3 && amount3 > 0) ? amount3 : null,
        hasChud,
        hasMultiplierChud
    };
}
function isDateLine(line) {
    if (!line)
        return false;
    const s = line.trim();
    const dmyMatch = s.match(/^(\d{1,2})\s*[\/\-\\]\s*(\d{1,2})\s*[\/\-\\]\s*(\d{2,4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return true;
        }
    }
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
function isValidBare4DigitLine(rawLine, numbers) {
    const trimmed = (rawLine || '').trim();
    const remaining = trimmed.replace(numbers, '').trim();
    if (!remaining)
        return true;
    const allowedRegex = /^[=\s]*(?:ชุด|ตัวชุด|ชุดลอยแพ|บน|ล่าง|บล|ลบ|บนล่าง|ล่างบน|บ\.?|ล\.?)?$/;
    return allowedRegex.test(remaining);
}
function determineBetType(numbers, numLen, amount1, amount2, amount3, hasChud, permCount, contextMode, isLaoOrHanoi, lotteryType, rawLine, settings, isReverseBet = false, hasMultiplierChud = false) {
    const isFloat = contextMode === 'float_top' || contextMode === 'float_bottom';
    const isTop = contextMode === 'top' || contextMode === 'float_top';
    const results = [];
    const behavior = settings?.x_separator_behavior || 'auto';
    const shouldStraightOnly = behavior === 'straight';
    if (numLen === 1) {
        if (amount1 === null)
            return null;
        const positionBetTypes = ['front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1'];
        if (positionBetTypes.includes(contextMode)) {
            const labels = {
                'front_top_1': 'หน้าบน',
                'middle_top_1': 'กลางบน',
                'back_top_1': 'หลังบน',
                'front_bottom_1': 'หน้าล่าง',
                'back_bottom_1': 'หลังล่าง'
            };
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: contextMode,
                typeLabel: labels[contextMode],
                rawLine,
                formattedLine: `${numbers}=${amount1} ${labels[contextMode]}`
            });
            return results;
        }
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
    if (numLen === 2) {
        if (amount1 === null)
            return null;
        if (contextMode === 'front' || contextMode === 'center') {
            const betType = contextMode === 'front' ? '2_front' : '2_center';
            const baseLabel = contextMode === 'front' ? 'หน้า' : 'ถ่าง';
            if (amount2 !== null && !shouldStraightOnly) {
                const isDouble = numbers[0] === numbers[1];
                if (isDouble) {
                    const totalAmount = amount1 + amount2;
                    results.push({
                        numbers,
                        amount: totalAmount,
                        amount2: null,
                        betType,
                        typeLabel: baseLabel,
                        rawLine,
                        formattedLine: `${numbers}=${totalAmount} ${baseLabel}`
                    });
                } else {
                    const typeLabel = `${baseLabel}กลับ`;
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
                }
            } else {
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: null,
                    betType,
                    typeLabel: baseLabel,
                    rawLine,
                    formattedLine: `${numbers}=${amount1} ${baseLabel}`
                });
            }
            return results;
        }
        if (isFloat) {
            if (contextMode === 'float_bottom') {
                results.push({
                    numbers,
                    amount: amount1,
                    amount2: null,
                    betType: '2_bottom',
                    typeLabel: 'ล่าง',
                    rawLine,
                    formattedLine: `${numbers}=${amount1} ล่าง`
                });
                return results;
            }
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
        if (amount2 !== null && !shouldStraightOnly) {
            const isDouble = numbers[0] === numbers[1];
            if (isDouble) {
                const betType = isTop ? '2_top' : '2_bottom';
                const typeLabel = isTop ? 'บน' : 'ล่าง';
                const totalAmount = amount1 + amount2;
                results.push({
                    numbers,
                    amount: totalAmount,
                    amount2: null,
                    betType,
                    typeLabel,
                    rawLine,
                    formattedLine: `${numbers}=${totalAmount} ${typeLabel}`
                });
            }
            else {
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
            }
        }
        else {
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
    if (numLen === 3) {
        if (amount1 === null)
            return null;
        if (isFloat) {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '3_tod',
                typeLabel: 'โต๊ด',
                rawLine,
                formattedLine: `${numbers}=${amount1} โต๊ด`
            });
            return results;
        }
        if (amount3 !== null && amount1 !== null && amount2 !== null && !shouldStraightOnly) {
            const isAmt2PermMinusOne = (amount2 === permCount - 1);
            const isAmt2Perm = (amount2 === permCount);
            const isAmt3PermMinusOne = (amount3 === permCount - 1);
            const isAmt3Perm = (amount3 === permCount);
            let finalAmt1 = null;
            let finalAmt2 = null;
            let matched = false;
            if (isAmt2PermMinusOne) {
                finalAmt1 = amount1;
                finalAmt2 = amount3;
                matched = true;
            }
            else if (isAmt2Perm) {
                finalAmt1 = amount1 + amount3;
                finalAmt2 = amount3;
                matched = true;
            }
            else if (isAmt3PermMinusOne) {
                finalAmt1 = amount1;
                finalAmt2 = amount2;
                matched = true;
            }
            else if (isAmt3Perm) {
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
        // Handle explicit กลับ keyword (from parenthetical NxM format or direct keyword)
        if (isReverseBet && amount2 !== null && amount1 !== null && !shouldStraightOnly) {
            const finalAmt1 = amount1 + amount2 * (permCount - 1);
            const finalAmt2 = amount2;
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
        if (amount2 !== null || hasChud) {
            const effectiveAmount2 = hasChud ? permCount : amount2;
            if (effectiveAmount2 === permCount && !shouldStraightOnly) {
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
            }
            else if (effectiveAmount2 !== null) {
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
        }
        else {
            const betType = isLaoOrHanoi ? '3_top' : (isTop ? '3_top' : '3_bottom');
            const typeLabel = isLaoOrHanoi ? 'ตรง' : (isTop ? 'บน' : 'ล่าง');
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
    if (numLen === 4) {
        if (amount1 === null) {
            if (isLaoOrHanoi) {
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
        const isKunChud = (amount2 !== null) || hasMultiplierChud || (hasChud && !isLaoOrHanoi);
        if (isKunChud) {
            const effectiveAmount2 = (hasChud || hasMultiplierChud) ? get3DigitPermCount(numbers) : amount2;
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
        }
        else if (hasChud && isLaoOrHanoi) {
            results.push({
                numbers,
                amount: amount1,
                amount2: null,
                betType: '4_set',
                typeLabel: '4ตัวชุด',
                rawLine,
                formattedLine: `${numbers}=${amount1} 4ตัวชุด`
            });
        }
        else {
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
    if (numLen === 5) {
        if (amount1 === null)
            return null;
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
        }
        else {
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
export function extractBuyerNote(text, lotteryType = 'lao') {
    if (!text || !text.trim())
        return '';
    const rawLines = text.split('\n');
    const nonEmptyLines = rawLines.map(l => l.trim()).filter(l => l.length > 0 && !isConversationalSingleNumberLine(l));
    if (nonEmptyLines.length === 0)
        return '';
    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType);
    function getTrailingNote(line) {
        const cleaned = cleanNoteText(line);
        if (cleaned && cleaned !== line) {
            if (!isAmountPattern(cleaned) && !/^[\d/,\s\-+*xX×=\(\)]+$/.test(cleaned)) {
                const cleanLower = cleaned.toLowerCase();
                const ignoreKeywords = ['รวม', 'ยอด', 'ทั้งหมด', 'total', 'net', 'sum', 'บ.', 'บาท'];
                if (!ignoreKeywords.some(kw => cleanLower.includes(kw))) {
                    return cleaned;
                }
            }
        }
        return null;
    }
    const isNoteLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed)
            return false;
        if (/^[\d/,\s\-+*xX×=\(\)]+$/.test(trimmed))
            return false;
        if (trimmed.startsWith('/'))
            return false;
        if (isDateLine(trimmed))
            return false;
        if (parseContextLine(trimmed))
            return false;
        const cleaned = cleanNoteText(trimmed);
        if (!cleaned)
            return false;
        if (isAmountPattern(cleaned) || /^[\d/,\s\-+*xX×=\(\)]+$/.test(cleaned))
            return false;
        const cleanLower = trimmed.toLowerCase();
        const ignoreKeywords = ['รวม', 'ยอด', 'ทั้งหมด', 'total', 'net', 'sum', 'บ.', 'บาท'];
        if (ignoreKeywords.some(kw => cleanLower.includes(kw))) {
            return false;
        }
        const parsed = parseNumberLine(trimmed, 'top', isLaoOrHanoi, lotteryType);
        if (parsed && parsed.length > 0)
            return false;
        return true;
    };
    const first = nonEmptyLines[0];
    const last = nonEmptyLines[nonEmptyLines.length - 1];
    const lastTrailing = getTrailingNote(last);
    if (lastTrailing) {
        return lastTrailing;
    }
    const firstTrailing = getTrailingNote(first);
    if (firstTrailing) {
        return firstTrailing;
    }
    if (isNoteLine(last)) {
        return cleanNoteText(last);
    }
    if (isNoteLine(first)) {
        return cleanNoteText(first);
    }
    return '';
}
function splitAmountAndTrailingText(line) {
    let s = normalizeUnicode(line.trim());
    const pat0 = s.match(/^(\d+[*×xX\-+/]\d+[*×xX\-+/]\d+)(?:\s+(.+))?$/);
    if (pat0) {
        return { amountStr: pat0[1].trim(), trailingText: pat0[2] ? pat0[2].trim() : '' };
    }
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
function cleanNoteText(str) {
    let s = normalizeUnicode(str.trim());
    const startCtxMatch = s.match(/^(\d{1,5})\s*[-/]?\s*(บนล่าง|ล่างบน|บล|ลบ|บ[+\-]?ล|ล[+\-]?บ|บน|บ|ล่าง|ล|วิ่งบน|ลอยบน|วิ่งล่าง|ลอยล่าง|วิ่ง|ลอย|โต๊ด|โต้ด|โตด|มี)\.?\s*(?:=|\s+)?\s*(\d.+)$/i);
    if (startCtxMatch) {
        s = startCtxMatch[3].trim();
    }
    else {
        const prefixMatch = s.match(/^([\d,/\s)]+?)\s*(?:=|\s)\s*(\d.+)$/);
        if (prefixMatch) {
            s = prefixMatch[2].trim();
        }
    }
    const split = splitAmountAndTrailingText(s);
    if (split && split.trailingText) {
        return split.trailingText;
    }
    const spaceMatch = s.match(/^(\d+)(?:\s+(.+))?$/);
    if (spaceMatch && spaceMatch[2]) {
        return spaceMatch[2].trim();
    }
    return s;
}
