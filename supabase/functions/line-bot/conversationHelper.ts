/**
 * Checks if an incoming LINE text message is meant for human conversation
 * that the LINE bot should completely ignore (mute / stay silent).
 *
 * Requirements:
 * - Prefix ".." followed by any text or line breaks
 * - Works for all users (dealers, members, buyers)
 * - Also handles common keyboard variants (ellipsis "…", full-width "．．", two-dot "‥")
 */
export function isConversationMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return (
    trimmed.startsWith('..') ||
    trimmed.startsWith('‥') ||
    trimmed.startsWith('…') ||
    trimmed.startsWith('．．')
  );
}
