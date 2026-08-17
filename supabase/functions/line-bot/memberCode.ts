// Member code
// -----------
// `profiles.member_code` is a globally unique code generated from a sequence
// starting at 10001 (migration 144), so it is 5 digits in practice and grows to
// 6 once the sequence passes 99999.
//
// Display names are NOT unique, so `/สรุป [ชื่อ]` is ambiguous when two members
// share a name. The member code gives admins an exact handle: `/สรุป 10048`.

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
