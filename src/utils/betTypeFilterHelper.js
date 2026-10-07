/**
 * Bet Type Filter Helper
 * Provides lottery-type-specific bet type lists and matching logic for multi-select filtering
 */

// 1. Thai Lottery Bet Types (17 Types)
export const THAI_FILTER_BET_TYPES = [
    { id: 'run_top', label: 'ลอยบน' },
    { id: 'run_bottom', label: 'ลอยล่าง' },
    { id: 'front_top_1', label: 'ปักหน้าบน' },
    { id: 'middle_top_1', label: 'ปักกลางบน' },
    { id: 'back_top_1', label: 'ปักหลังบน' },
    { id: 'front_bottom_1', label: 'ปักหน้าล่าง' },
    { id: 'back_bottom_1', label: 'ปักหลังล่าง' },
    { id: '2_top', label: '2 ตัวบน' },
    { id: '2_front', label: '2 ตัวหน้า' },
    { id: '2_center', label: '2 ตัวถ่าง' },
    { id: '2_bottom', label: '2 ตัวล่าง' },
    { id: '2_run', label: '2 ตัวลอย' },
    { id: '3_top', label: '3 ตัวบน' },
    { id: '3_tod', label: '3 ตัวโต๊ด' },
    { id: '3_bottom', label: '3 ตัวล่าง' },
    { id: '4_float', label: '4 ตัวลอย' },
    { id: '5_float', label: '5 ตัวลอย' }
]

// 2. Lao / Hanoi Lottery Bet Types (18 Types)
export const LAO_HANOI_FILTER_BET_TYPES = [
    { id: '4_set', label: 'เลข 4ตัวชุด' },
    { id: 'run_top', label: 'ลอยบน' },
    { id: 'run_bottom', label: 'ลอยล่าง' },
    { id: 'front_top_1', label: 'ปักหน้าบน' },
    { id: 'middle_top_1', label: 'ปักกลางบน' },
    { id: 'back_top_1', label: 'ปักหลังบน' },
    { id: 'front_bottom_1', label: 'ปักหน้าล่าง' },
    { id: 'back_bottom_1', label: 'ปักหลังล่าง' },
    { id: '2_top', label: '2 ตัวบน' },
    { id: '2_front', label: '2 ตัวหน้า' },
    { id: '2_center', label: '2 ตัวถ่าง' },
    { id: '2_bottom', label: '2 ตัวล่าง' },
    { id: '2_run', label: '2 ตัวลอย' },
    { id: '3_top', label: '3 ตัวบน' },
    { id: '3_tod', label: '3 ตัวโต๊ด' },
    { id: '3_bottom', label: '3 ตัวล่าง' },
    { id: '4_float', label: '4 ตัวลอย' },
    { id: '5_float', label: '5 ตัวลอย' }
]

// 3. Stock Lottery Bet Types (2 Types)
export const STOCK_FILTER_BET_TYPES = [
    { id: '2_top', label: '2 ตัวบน' },
    { id: '2_bottom', label: '2 ตัวล่าง' }
]

export const FILTER_BET_TYPES_BY_LOTTERY = {
    thai: THAI_FILTER_BET_TYPES,
    lao: LAO_HANOI_FILTER_BET_TYPES,
    hanoi: LAO_HANOI_FILTER_BET_TYPES,
    stock: STOCK_FILTER_BET_TYPES
}

// Quick Digit Groups per Lottery Type
export const DIGIT_GROUPS_BY_LOTTERY = {
    thai: [
        { id: '1_digit', label: '1 ตัวทุกประเภท', shortLabel: '1 ตัว', types: ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1'] },
        { id: '2_digit', label: '2 ตัวทุกประเภท', shortLabel: '2 ตัว', types: ['2_top', '2_front', '2_center', '2_bottom', '2_run'] },
        { id: '3_digit', label: '3 ตัวทุกประเภท', shortLabel: '3 ตัว', types: ['3_top', '3_tod', '3_bottom'] },
        { id: '4_digit', label: '4 ตัวทุกประเภท', shortLabel: '4 ตัว', types: ['4_float'] },
        { id: '5_digit', label: '5 ตัวทุกประเภท', shortLabel: '5 ตัว', types: ['5_float'] }
    ],
    lao: [
        { id: '1_digit', label: '1 ตัวทุกประเภท', shortLabel: '1 ตัว', types: ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1'] },
        { id: '2_digit', label: '2 ตัวทุกประเภท', shortLabel: '2 ตัว', types: ['2_top', '2_front', '2_center', '2_bottom', '2_run'] },
        { id: '3_digit', label: '3 ตัวทุกประเภท', shortLabel: '3 ตัว', types: ['3_top', '3_tod', '3_bottom'] },
        { id: '4_digit', label: '4 ตัวทุกประเภท', shortLabel: '4 ตัว', types: ['4_set', '4_float'] },
        { id: '5_digit', label: '5 ตัวทุกประเภท', shortLabel: '5 ตัว', types: ['5_float'] }
    ],
    hanoi: [
        { id: '1_digit', label: '1 ตัวทุกประเภท', shortLabel: '1 ตัว', types: ['run_top', 'run_bottom', 'front_top_1', 'middle_top_1', 'back_top_1', 'front_bottom_1', 'back_bottom_1'] },
        { id: '2_digit', label: '2 ตัวทุกประเภท', shortLabel: '2 ตัว', types: ['2_top', '2_front', '2_center', '2_bottom', '2_run'] },
        { id: '3_digit', label: '3 ตัวทุกประเภท', shortLabel: '3 ตัว', types: ['3_top', '3_tod', '3_bottom'] },
        { id: '4_digit', label: '4 ตัวทุกประเภท', shortLabel: '4 ตัว', types: ['4_set', '4_float'] },
        { id: '5_digit', label: '5 ตัวทุกประเภท', shortLabel: '5 ตัว', types: ['5_float'] }
    ],
    stock: [
        { id: '2_digit', label: '2 ตัวทุกประเภท', shortLabel: '2 ตัว', types: ['2_top', '2_bottom'] }
    ]
}

/**
 * Returns digit shortcut groups based on lottery type
 * @param {string} lotteryType 
 * @returns {Array<{ id: string, label: string, shortLabel: string, types: string[] }>}
 */
export function getDigitGroups(lotteryType) {
    if (!lotteryType) return DIGIT_GROUPS_BY_LOTTERY.thai
    return DIGIT_GROUPS_BY_LOTTERY[lotteryType] || DIGIT_GROUPS_BY_LOTTERY.thai
}

/**
 * Returns available bet types for filter based on lottery type
 * @param {string} lotteryType 
 * @returns {Array<{ id: string, label: string }>}
 */
export function getFilterBetTypes(lotteryType) {
    if (!lotteryType) return THAI_FILTER_BET_TYPES
    return FILTER_BET_TYPES_BY_LOTTERY[lotteryType] || THAI_FILTER_BET_TYPES
}

/**
 * Mapping of canonical filter ID to aliases found in submissions / history
 */
const FILTER_ALIAS_MAP = {
    '2_top': ['2_top', '2_top_rev', '2_back'],
    '2_front': ['2_front', '2_front_rev', '2_front_single'],
    '2_center': ['2_center', '2_spread', '2_tang', '2_spread_rev', '2_center_rev'],
    '2_bottom': ['2_bottom', '2_bottom_rev'],
    '2_run': ['2_run', '2_have', '2_teng', '2_run_rev'],
    '3_top': ['3_top', '3_straight'],
    '3_tod': ['3_tod', '3_tod_single'],
    '3_bottom': ['3_bottom'],
    '4_set': ['4_set', '4_straight_set', '3_set', '3_straight_set', '3_tod_set', '2_front_set', '2_back_set'],
    'front_top_1': ['front_top_1', 'pak_top'],
    'middle_top_1': ['middle_top_1', 'pak_top'],
    'back_top_1': ['back_top_1', 'pak_top'],
    'front_bottom_1': ['front_bottom_1', 'pak_bottom'],
    'back_bottom_1': ['back_bottom_1', 'pak_bottom']
}

/**
 * Checks if a submission betType matches any of the selected filter types
 * @param {string} betType - The bet_type from submission
 * @param {string[]|null|undefined} selectedTypes - Array of selected filter bet type IDs
 * @returns {boolean}
 */
export function isBetTypeMatched(betType, selectedTypes) {
    // If no filter selected or empty array, match everything (no filter applied)
    if (!selectedTypes || !Array.isArray(selectedTypes) || selectedTypes.length === 0) {
        return true
    }

    // Direct match
    if (selectedTypes.includes(betType)) {
        return true
    }

    // Check alias matching
    for (const filterId of selectedTypes) {
        const aliases = FILTER_ALIAS_MAP[filterId]
        if (aliases && aliases.includes(betType)) {
            return true
        }
    }

    return false
}

/**
 * Checks if numberStr contains all digits present in searchStr (multiset match)
 * e.g. searchStr='123', matches '123', '321', '1243', '2513', '132', '213', etc.
 * @param {string|number} numberStr 
 * @param {string} searchStr 
 * @returns {boolean}
 */
export function matchesCompositeDigits(numberStr, searchStr) {
    if (!numberStr || !searchStr) return false
    const searchDigits = String(searchStr).replace(/\D/g, '')
    if (!searchDigits) {
        return String(numberStr).toLowerCase().includes(String(searchStr).toLowerCase())
    }
    const numDigits = String(numberStr).replace(/\D/g, '')
    const searchCounts = {}
    for (const d of searchDigits) {
        searchCounts[d] = (searchCounts[d] || 0) + 1
    }
    const numCounts = {}
    for (const d of numDigits) {
        numCounts[d] = (numCounts[d] || 0) + 1
    }
    for (const d in searchCounts) {
        if ((numCounts[d] || 0) < searchCounts[d]) {
            return false
        }
    }
    return true
}

/**
 * Checks if numberStr matches searchStr given the composite search option
 * @param {string|number} numberStr 
 * @param {string} searchStr 
 * @param {boolean} isComposite 
 * @returns {boolean}
 */
export function isSearchNumberMatched(numberStr, searchStr, isComposite = false) {
    if (!searchStr) return true
    if (!numberStr) return false
    if (isComposite) {
        return matchesCompositeDigits(numberStr, searchStr)
    }
    return String(numberStr).includes(String(searchStr))
}

