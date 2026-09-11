// Member code & round date parsing
// ---------------------------------
// `profiles.member_code` is a globally unique code generated from a sequence
// starting at 10001 (migration 144), so it is 5 digits in practice and grows to
// 6 once the sequence passes 99999.
//
// Display names are NOT unique, so `/สรุป [ชื่อ]` is ambiguous when two members
// share a name. The member code gives admins an exact handle: `/สรุป 10048`.
//
// In addition, admins and dealers can inspect past rounds for specific members:
// `/สรุป 10039/8-9-69` or `/ยอดรวม 10039/8-9-69`.

/**
 * Does a command param look like a member code?
 *
 * Requires 5+ digits, which is what keeps it unambiguous against the other
 * `/สรุป` params:
 *   - round dates always carry a `-` or `/` separator (10-6-69)
 *   - lao/hanoi winning numbers are exactly 4 digits (1234)
 *   - thai/stock winning numbers always carry a `/` (123456/25, 25/49)
 *
 * Callers must still fall back to a name search when no member owns the code,
 * so a member literally named "10048" remains reachable.
 */
export function isMemberCodeParam(param: string): boolean {
  return /^\d{5,}$/.test(param.trim());
}

/** Find members whose member_code exactly equals the given code. */
export function matchMembersByCode<T>(
  members: T[],
  param: string,
  getCode: (m: T) => string | null | undefined
): T[] {
  const code = param.trim();
  if (!code) return [];
  return members.filter((m) => (getCode(m) || '').trim() === code);
}

/**
 * Parse a round-date param (e.g. 10-6-26, 10-6-2026, 10-6-69, 10-6-2569).
 * Accepts '-' or '/' separators. Returns Gregorian 'YYYY-MM-DD' or null.
 * Distinct from winning numbers (which never use a D-M-Y 3-part format).
 */
export function parseRoundDateParam(param: string | null | undefined): string | null {
  if (!param || typeof param !== 'string') return null;
  const clean = param.replace(/\s+/g, '');
  const match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // Year normalization (same convention as parseReportParams)
  if (year >= 2500) {
    year = year - 543;                 // 4-digit Buddhist (2569 -> 2026)
  } else if (year >= 50 && year < 100) {
    year = (2500 + year) - 543;        // 2-digit Buddhist (69 -> 2569 -> 2026)
  } else if (year < 50) {
    year = 2000 + year;                // 2-digit Gregorian (26 -> 2026)
  }
  // 4-digit Gregorian (e.g. 2026) passes through unchanged

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const yStr = year.toString();
  const mStr = month.toString().padStart(2, '0');
  const dStr = day.toString().padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

export interface ParsedMemberAndDate {
  memberParam: string | null;
  dateStr: string | null;
  rawDate: string | null;
}

/**
 * Parse compound command parameters like `/สรุป [id]/[งวดวันที่]` or `/ยอดรวม [id]/[งวดวันที่]`.
 * Examples:
 * - `10039/8-9-69`  -> { memberParam: '10039', dateStr: '2026-09-08', rawDate: '8-9-69' }
 * - `10039/8-9-26`  -> { memberParam: '10039', dateStr: '2026-09-08', rawDate: '8-9-26' }
 * - `10039/8/9/69`  -> { memberParam: '10039', dateStr: '2026-09-08', rawDate: '8/9/69' }
 * - `/10039/8-9-69` -> { memberParam: '10039', dateStr: '2026-09-08', rawDate: '8-9-69' }
 * - `สมชาย/8-9-69`  -> { memberParam: 'สมชาย', dateStr: '2026-09-08', rawDate: '8-9-69' }
 * - `8-9-69`        -> { memberParam: null, dateStr: '2026-09-08', rawDate: '8-9-69' }
 * - `10048`         -> { memberParam: '10048', dateStr: null, rawDate: null }
 * - `123456/25`     -> { memberParam: '123456/25', dateStr: null, rawDate: null } (Thai announcement)
 */
export function parseMemberAndRoundDateParam(raw: string | null | undefined): ParsedMemberAndDate | null {
  if (!raw || typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // If starts with leading slash (e.g. /10039/8-9-69 or /10048), strip it
  if (trimmed.startsWith('/')) {
    trimmed = trimmed.slice(1).trim();
  }
  if (!trimmed) return null;

  // 1. Check if the entire string is just a date (e.g. 8-9-69, 8/9/69, 8-9-26, 08-09-2569)
  const soloDate = parseRoundDateParam(trimmed);
  if (soloDate) {
    return { memberParam: null, dateStr: soloDate, rawDate: trimmed };
  }

  // 2. Check for member + date: e.g. 10039/8-9-69, 10039/8-9-26, 10039/8/9/69, 10039 8-9-69, สมชาย/8-9-69
  // The member identifier is followed by '/' or whitespace, and ends with a 3-part date (D-M-Y)
  const match = trimmed.match(/^(.+?)[\s/]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})$/);
  if (match) {
    const memberParam = match[1].trim();
    const rawDate = match[2].trim();
    const dateStr = parseRoundDateParam(rawDate);
    if (dateStr && memberParam) {
      return { memberParam, dateStr, rawDate };
    }
  }

  // 3. Otherwise, it's just a member param (or winning number, etc.)
  return { memberParam: trimmed, dateStr: null, rawDate: null };
}
