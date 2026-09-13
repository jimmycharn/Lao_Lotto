/**
 * Appends or updates the bill note when a dealer force-submits bets for a closed/announced round.
 * 
 * Rules:
 * - If round is announced (isAnnounced === true):
 *   Suffix is '(ออกรางวัลแล้ว)'
 * - If round is closed but not yet announced:
 *   Suffix is '(ปิดรับแล้ว)'
 * - If previous note exists (e.g. 'พี่สมชาย'), append suffix: 'พี่สมชาย (ปิดรับแล้ว)' or 'พี่สมชาย (ออกรางวัลแล้ว)'
 * - If no previous note, set note to just '(ปิดรับแล้ว)' or '(ออกรางวัลแล้ว)'
 * - Clean up existing tags to avoid duplication (e.g. 'พี่สมชาย (ปิดรับแล้ว)' -> 'พี่สมชาย (ออกรางวัลแล้ว)')
 * 
 * @param {string|null|undefined} currentNote - Current note text in note input
 * @param {boolean} isAnnounced - Whether the round result has been announced
 * @returns {string} The updated note text
 */
export function getForcedBillNote(currentNote, isAnnounced) {
    const tag = isAnnounced ? '(ออกรางวัลแล้ว)' : '(ปิดรับแล้ว)'
    const cleaned = (currentNote || '')
        .replace(/\s*\((?:ปิดรับแล้ว|ออกรางวัลแล้ว)\)/g, '')
        .trim()
    return cleaned ? `${cleaned} ${tag}` : tag
}
