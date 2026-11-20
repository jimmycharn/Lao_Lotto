/**
 * Helper to match user name against selected members filter
 *
 * @param {string} userName - The name of the member/user from submission or bill
 * @param {string[]} selectedMembers - Array of selected member names
 * @param {'include'|'exclude'} mode - 'include' to show only selected, 'exclude' to show all except selected
 * @returns {boolean} Whether the item should be included in the filtered results
 */
export function isMemberMatched(userName, selectedMembers = [], mode = 'include') {
    if (!Array.isArray(selectedMembers) || selectedMembers.length === 0) {
        return true
    }
    const safeName = String(userName ?? '').trim()
    const isSelected = selectedMembers.some(m => String(m ?? '').trim() === safeName)
    return mode === 'exclude' ? !isSelected : isSelected
}
