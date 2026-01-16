// Lottery type labels
export const LOTTERY_TYPES = {
    'thai': 'หวยไทย',
    'lao': 'หวยลาว',
    'hanoi': 'หวยฮานอย',
    'stock': 'หวยหุ้น',
    'yeekee': 'หวยยี่กี',
    'other': 'อื่นๆ'
}

// Bet types by lottery type (matching user_settings structure)
export const BET_TYPES_BY_LOTTERY = {
    thai: {
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_front': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '3_top': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '3_bottom': { label: '3 ตัวล่าง', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    lao: {
        '4_top': { label: '4 ตัวตรง', defaultLimit: 200, isSet: true, defaultSetPrice: 120 },
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '2_front_single': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '3_top': { label: '3 ตัวบน', defaultLimit: 500 },
        '3_tod': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '3_front': { label: '3 ตัวหน้า', defaultLimit: 500 },
        '3_back': { label: '3 ตัวหลัง', defaultLimit: 500 },
        '3_straight': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod_single': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    hanoi: {
        '4_top': { label: '4 ตัวตรง', defaultLimit: 200, isSet: true, defaultSetPrice: 120 },
        'run_top': { label: 'ลอยบน', defaultLimit: 5000 },
        'run_bottom': { label: 'ลอยล่าง', defaultLimit: 5000 },
        'pak_top': { label: 'ปักบน (หน้า/กลาง/หลัง)', defaultLimit: 5000 },
        'pak_bottom': { label: 'ปักล่าง (หน้า/หลัง)', defaultLimit: 5000 },
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 },
        '2_front_single': { label: '2 ตัวหน้า', defaultLimit: 1000 },
        '2_center': { label: '2 ตัวถ่าง', defaultLimit: 1000 },
        '2_run': { label: '2 ตัวลอย', defaultLimit: 1000 },
        '3_top': { label: '3 ตัวบน', defaultLimit: 500 },
        '3_tod': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '3_front': { label: '3 ตัวหน้า', defaultLimit: 500 },
        '3_back': { label: '3 ตัวหลัง', defaultLimit: 500 },
        '3_straight': { label: '3 ตัวตรง', defaultLimit: 500 },
        '3_tod_single': { label: '3 ตัวโต๊ด', defaultLimit: 500 },
        '4_run': { label: '4 ตัวลอย', defaultLimit: 200 },
        '5_run': { label: '5 ตัวลอย', defaultLimit: 100 }
    },
    stock: {
        '2_top': { label: '2 ตัวบน', defaultLimit: 1000 },
        '2_bottom': { label: '2 ตัวล่าง', defaultLimit: 1000 }
    }
}

// Legacy bet type labels (for displaying results/submissions)
export const BET_TYPES = {
    // 1 Digit
    'run_top': 'วิ่งบน',
    'run_bottom': 'วิ่งล่าง',
    'front_top_1': 'หน้าบน',
    'middle_top_1': 'กลางบน',
    'back_top_1': 'หลังบน',
    'front_bottom_1': 'หน้าล่าง',
    'back_bottom_1': 'หลังล่าง',
    'pak_top': 'ปักบน',
    'pak_bottom': 'ปักล่าง',

    // 2 Digits
    '2_top': '2 ตัวบน',
    '2_bottom': '2 ตัวล่าง',
    '2_front': '2 ตัวหน้า',
    '2_front_single': '2 ตัวหน้า',
    '2_back': '2 ตัวหลัง',
    '2_center': '2 ตัวถ่าง',
    '2_spread': '2 ตัวถ่าง',
    '2_have': '2 ตัวมี',
    '2_run': '2 ตัวลอย',

    // 2 Digits Reversed (กลับ)
    '2_top_rev': '2 บนกลับ',
    '2_front_rev': '2 หน้ากลับ',
    '2_spread_rev': '2 ถ่างกลับ',
    '2_bottom_rev': '2 ล่างกลับ',

    // 3 Digits
    '3_top': '3 ตัวบน',
    '3_tod': '3 ตัวโต๊ด',
    '3_front': '3 ตัวหน้า',
    '3_back': '3 ตัวหลัง',
    '3_bottom': '3 ตัวล่าง',
    '3_straight': '3 ตัวตรง',
    '3_tod_single': '3 ตัวโต๊ด',

    // 4 Digits
    '4_top': '4 ตัวตรง',
    '4_tod': '4 ตัวโต๊ด',
    '4_set': '4 ตัวชุด',
    '4_float': '4 ตัวลอย',
    '4_run': '4 ตัวลอย',

    // 5 Digits
    '5_float': '5 ตัวลอย',
    '5_run': '5 ตัวลอย',

    // 6 Digits
    '6_top': '6 ตัว (รางวัลที่ 1)'
}

// Bet types with digits info (for UserDashboard)
export const BET_TYPES_WITH_DIGITS = {
    // 1 Digit
    'run_top': { label: 'วิ่งบน', digits: 1 },
    'run_bottom': { label: 'วิ่งล่าง', digits: 1 },
    'front_top_1': { label: 'หน้าบน', digits: 1 },
    'middle_top_1': { label: 'กลางบน', digits: 1 },
    'back_top_1': { label: 'หลังบน', digits: 1 },
    'front_bottom_1': { label: 'หน้าล่าง', digits: 1 },
    'back_bottom_1': { label: 'หลังล่าง', digits: 1 },

    // 2 Digits
    '2_top': { label: '2 ตัวบน', digits: 2 },
    '2_front': { label: '2 ตัวหน้า', digits: 2 },
    '2_spread': { label: '2 ตัวถ่าง', digits: 2 },
    '2_have': { label: '2 ตัวมี', digits: 2 },
    '2_bottom': { label: '2 ตัวล่าง', digits: 2 },
    // 2 Digits Reversed (กลับ)
    '2_top_rev': { label: '2 ตัวบนกลับ', digits: 2 },
    '2_front_rev': { label: '2 ตัวหน้ากลับ', digits: 2 },
    '2_spread_rev': { label: '2 ตัวถ่างกลับ', digits: 2 },
    '2_bottom_rev': { label: '2 ตัวล่างกลับ', digits: 2 },

    // 3 Digits
    '3_top': { label: '3 ตัวตรง', digits: 3 },
    '3_tod': { label: '3 ตัวโต๊ด', digits: 3 },
    '3_bottom': { label: '3 ตัวล่าง', digits: 3 },

    // 4 Digits
    '4_set': { label: '4 ตัวชุด', digits: 4 },
    '4_float': { label: '4 ตัวลอย', digits: 4 },

    // 5 Digits
    '5_float': { label: '5 ตัวลอย', digits: 5 }
}

// Bet types that should normalize numbers (order doesn't matter)
export const PERMUTATION_BET_TYPES = ['2_run', '2_spread', '3_tod', '3_tod_single', '4_run', '4_tod', '4_float', '5_run', '5_float']

// Default commission rates per bet type (percentage)
export const DEFAULT_COMMISSIONS = {
    'run_top': 15, 'run_bottom': 15,
    'pak_top': 15, 'pak_bottom': 15,
    '2_top': 15, '2_front': 15, '2_center': 15, '2_spread': 15, '2_run': 15, '2_bottom': 15,
    '3_top': 15, '3_tod': 15, '3_bottom': 15, '3_front': 15, '3_back': 15,
    '4_run': 15, '4_tod': 15, '4_set': 15, '4_float': 15, '5_run': 15, '5_float': 15, '6_top': 15
}

// Default payout rates per bet type
export const DEFAULT_PAYOUTS = {
    'run_top': 3, 'run_bottom': 4,
    'pak_top': 8, 'pak_bottom': 6,
    '2_top': 65, '2_front': 65, '2_center': 65, '2_run': 10, '2_bottom': 65,
    '3_top': 550, '3_tod': 100, '3_bottom': 135, '3_front': 100, '3_back': 135,
    '4_run': 20, '4_tod': 100, '5_run': 10, '6_top': 1000000
}

// Helper to get default limits for a lottery type
export function getDefaultLimitsForType(lotteryType) {
    const betTypes = BET_TYPES_BY_LOTTERY[lotteryType] || {}
    const limits = {}
    Object.entries(betTypes).forEach(([key, config]) => {
        limits[key] = config.defaultLimit
    })
    return limits
}

// Helper to get default set prices for a lottery type
export function getDefaultSetPricesForType(lotteryType) {
    const betTypes = BET_TYPES_BY_LOTTERY[lotteryType] || {}
    const setPrices = {}
    Object.entries(betTypes).forEach(([key, config]) => {
        if (config.isSet) {
            setPrices[key] = config.defaultSetPrice || 120
        }
    })
    return setPrices
}

// Normalize number by sorting digits (for permutation bet types)
export function normalizeNumber(numbers, betType) {
    if (PERMUTATION_BET_TYPES.includes(betType)) {
        return numbers.split('').sort().join('')
    }
    return numbers
}

// Helper function to generate batch ID (UUID v4 format - works in all browsers)
export const generateBatchId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

// Helper to generate UUID (compatible with older browsers)
export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return generateBatchId()
}

// Helper to get all permutations
export const getPermutations = (str) => {
    if (str.length <= 1) return [str]
    const perms = []
    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        const remainingChars = str.slice(0, i) + str.slice(i + 1)
        for (const subPerm of getPermutations(remainingChars)) {
            perms.push(char + subPerm)
        }
    }
    return [...new Set(perms)]
}

// Helper to get unique 3-digit permutations from 4 digits
export const getUnique3DigitPermsFrom4 = (str) => {
    if (str.length !== 4) return []
    const results = new Set()
    for (let i = 0; i < 4; i++) {
        const combination = str.slice(0, i) + str.slice(i + 1)
        const perms = getPermutations(combination)
        perms.forEach(p => results.add(p))
    }
    return Array.from(results)
}

// Helper to get unique 3-digit permutations from 5 digits
export const getUnique3DigitPermsFrom5 = (str) => {
    if (str.length !== 5) return []
    const results = new Set()
    const chars = str.split('')
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
                const combination = chars[i] + chars[j] + chars[k]
                const perms = getPermutations(combination)
                perms.forEach(p => results.add(p))
            }
        }
    }
    return Array.from(results)
}

// Get lottery type key for settings lookup
export function getLotteryTypeKey(lotteryType) {
    if (lotteryType === 'thai') return 'thai'
    if (lotteryType === 'lao' || lotteryType === 'hanoi') return 'lao'
    if (lotteryType === 'stock') return 'stock'
    return 'thai'
}
