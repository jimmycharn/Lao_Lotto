// Member short ID
// ---------------
// Display names are not unique, so `/สรุป [ชื่อ]` is ambiguous when two members
// share a name. The short ID is the first 5 hex chars of the member's profile
// UUID — short enough to type in LINE, and unique in practice.

export const MEMBER_SHORT_ID_LENGTH = 5;

export function getMemberShortId(userId: string | null | undefined): string {
  if (!userId) return '';
  return userId.replace(/-/g, '').slice(0, MEMBER_SHORT_ID_LENGTH).toLowerCase();
}

/**
 * Does a command param look like a member short ID?
 *
 * Accepts 5-8 hex chars so a rare short-ID collision can be resolved by typing
 * a few more characters. A purely numeric param such as `12345` also qualifies,
 * so callers MUST fall back to a name search when no member matches the prefix.
 *
 * Safe against the other `/สรุป` params: `parseRoundDateParam` requires a `-`
 * or `/` separator, and `parseWinningNumbers` requires exactly 4 digits
 * (lao/hanoi) or a `/` separator (thai/stock).
 */
export function isMemberShortIdParam(param: string): boolean {
  return new RegExp(`^[0-9a-f]{${MEMBER_SHORT_ID_LENGTH},8}$`, 'i').test(param.trim());
}

/** Match members whose profile UUID starts with the given short ID prefix. */
export function matchMembersByShortId<T>(
  members: T[],
  param: string,
  getId: (m: T) => string | null | undefined
): T[] {
  const prefix = param.trim().toLowerCase();
  if (!prefix) return [];
  return members.filter((m) => {
    const id = getId(m);
    if (!id) return false;
    return id.replace(/-/g, '').toLowerCase().startsWith(prefix);
  });
}
