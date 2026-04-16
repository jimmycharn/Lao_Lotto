/**
 * Scenario Calculator - Frontend utility for calculating worst/best case scenarios
 * 
 * For each possible winning number (derived from actual bets):
 *   net = total_income - total_commission - total_payout
 * 
 * Where:
 *   total_income = sum of all bet amounts (net of transfers)
 *   total_commission = sum of per-user commissions
 *   total_payout = sum of payouts for all winning bets in this scenario
 */

import {
    DEFAULT_PAYOUTS,
    DEFAULT_COMMISSIONS,
    DEFAULT_4_SET_SETTINGS,
    BET_TYPES,
    BET_TYPES_BY_LOTTERY,
    calculate4SetPrizes,
    getPermutations,
    getLotteryTypeKey,
    normalizeNumber
} from '../constants/lotteryTypes'

// ============================================================
// WINNING LOGIC: Given a hypothetical winning number, determine
// which bets would win and calculate payout
// ============================================================

/**
 * Derive winning reference numbers from a primary winning number
 * based on lottery type rules.
 * 
 * Thai: primary = 6 digits (e.g. "123456"), bottom = 2 digits (e.g. "51")
 *   w6top = "123456", w3top = "456" (last 3), w2top = "56" (last 2 of w3top)
 *   w2front = "45" (first 2 of w3top), w2center = "46" (pos 0+2 of w3top)
 *   w2bottom = from separate input
 * 
 * Lao/Hanoi: primary = 4 digits (e.g. "1234")
 *   w4set = "1234", w3top = "234" (last 3), w2top = "34" (last 2 of w3top)
 *   w2bottom = "12" (first 2) [lao only]
 * 
 * Stock: primary = 2 digits
 */
function deriveWinningNumbers(primaryNumber, lotteryType, bottomNumber = '') {
    const lt = lotteryType
    const result = {
        w6top: '',      // 6-digit (Thai first prize)
        w4set: '',      // 4-digit
        w3top: '',      // 3-digit top
        w3topSorted: '',
        w2top: '',      // 2-digit top (last 2 of w3top)
        w2front: '',    // 2-digit front (first 2 of w3top)
        w2center: '',   // 2-digit center (pos 0+2 of w3top)
        w2bottom: '',   // 2-digit bottom
    }

    if (lt === 'thai') {
        // Thai: primary is 6 digits
        if (primaryNumber.length === 6) {
            result.w6top = primaryNumber
            result.w3top = primaryNumber.slice(3) // last 3
            result.w2top = result.w3top.slice(1)  // last 2 of w3top
            result.w2front = result.w3top.slice(0, 2) // first 2 of w3top
            result.w2center = result.w3top[0] + result.w3top[2] // pos 0+2 of w3top
        } else if (primaryNumber.length === 3) {
            // If only 3-digit scenario
            result.w3top = primaryNumber
            result.w2top = primaryNumber.slice(1)
            result.w2front = primaryNumber.slice(0, 2)
            result.w2center = primaryNumber[0] + primaryNumber[2]
        }
        result.w2bottom = bottomNumber || ''
        result.w3topSorted = result.w3top.split('').sort().join('')
    } else if (lt === 'lao' || lt === 'hanoi') {
        // Lao/Hanoi: primary is 4 digits
        if (primaryNumber.length === 4) {
            result.w4set = primaryNumber
            result.w3top = primaryNumber.slice(1) // last 3
            result.w2top = result.w3top.slice(1)  // last 2 of w3top
            result.w2front = result.w3top.slice(0, 2) // first 2 of w3top
            result.w2center = result.w3top[0] + result.w3top[2]
            if (lt === 'lao') {
                result.w2bottom = primaryNumber.slice(0, 2) // first 2
            }
        }
        result.w3topSorted = result.w3top.split('').sort().join('')
    } else if (lt === 'stock') {
        // Stock: primary is 2 digits
        if (primaryNumber.length === 2) {
            result.w2top = primaryNumber
        }
    }

    return result
}

/**
 * Check if a bet wins against derived winning numbers
 * Returns { wins: boolean, payout: number }
 */
function checkBetWin(betType, betNumbers, winNums, payoutRate, amount, setPrice, setPrizes) {
    const bt = betType
    const num = betNumbers
    const { w6top, w4set, w3top, w3topSorted, w2top, w2front, w2center, w2bottom } = winNums

    // Helper: check if all digits of src exist in target (removing each once found)
    const floatCheck = (src, target) => {
        let temp = target
        for (const ch of src) {
            const idx = temp.indexOf(ch)
            if (idx === -1) return false
            temp = temp.slice(0, idx) + temp.slice(idx + 1)
        }
        return true
    }

    // 6-digit
    if (bt === '6_top' && num.length === 6 && w6top) {
        if (num === w6top) return { wins: true, payout: amount * payoutRate }
    }

    // 4_set (special: fixed prize per set, highest prize only)
    if (bt === '4_set' && num.length === 4 && w4set) {
        const { totalPrize } = calculate4SetPrizes(num, w4set, setPrizes || DEFAULT_4_SET_SETTINGS.prizes)
        if (totalPrize > 0) {
            const numSets = Math.floor(amount / (setPrice || 120))
            return { wins: true, payout: numSets * totalPrize }
        }
        return { wins: false, payout: 0 }
    }

    // 5_float: all 3 digits of w3top must be found in 5-digit number
    if (bt === '5_float' && num.length === 5 && w3top && w3top.length === 3) {
        if (floatCheck(w3top, num)) return { wins: true, payout: amount * payoutRate }
    }

    // 4_float: all 3 digits of w3top must be found in 4-digit number
    if (bt === '4_float' && num.length === 4 && w3top && w3top.length === 3) {
        if (floatCheck(w3top, num)) return { wins: true, payout: amount * payoutRate }
    }

    // 3_top / 3_straight
    if ((bt === '3_top' || bt === '3_straight') && num.length === 3 && w3top) {
        if (num === w3top) return { wins: true, payout: amount * payoutRate }
    }

    // 3_tod / 3_tod_single (same digits different order, NOT exact match)
    if ((bt === '3_tod' || bt === '3_tod_single') && num.length === 3 && w3top) {
        const numSorted = num.split('').sort().join('')
        if (numSorted === w3topSorted && num !== w3top) return { wins: true, payout: amount * payoutRate }
    }

    // 3_bottom (for Thai lottery - matches w2bottom area, but actually uses separate 3-digit bottom result)
    // In most implementations, 3_bottom uses the same w3top for Lao. For Thai it's different.
    // We'll skip 3_bottom scenario generation for now as it requires separate bottom numbers.

    // 2_top
    if (bt === '2_top' && num.length === 2 && w2top) {
        if (num === w2top) return { wins: true, payout: amount * payoutRate }
    }

    // 2_bottom
    if (bt === '2_bottom' && num.length === 2 && w2bottom) {
        if (num === w2bottom) return { wins: true, payout: amount * payoutRate }
    }

    // 2_front
    if (bt === '2_front' && num.length === 2 && w3top && w3top.length === 3) {
        if (num === w2front) return { wins: true, payout: amount * payoutRate }
    }

    // 2_center / 2_spread
    if ((bt === '2_center' || bt === '2_spread') && num.length === 2 && w3top && w3top.length === 3) {
        if (num === w2center) return { wins: true, payout: amount * payoutRate }
    }

    // 2_run (both digits appear in w3top)
    if (bt === '2_run' && num.length === 2 && w3top && w3top.length === 3) {
        if (w3top.includes(num[0]) && w3top.includes(num[1])) {
            return { wins: true, payout: amount * payoutRate }
        }
    }

    // run_top (single digit appears in w3top)
    if (bt === 'run_top' && num.length === 1 && w3top) {
        if (w3top.includes(num)) return { wins: true, payout: amount * payoutRate }
    }

    // run_bottom (single digit appears in w2bottom)
    if (bt === 'run_bottom' && num.length === 1 && w2bottom) {
        if (w2bottom.includes(num)) return { wins: true, payout: amount * payoutRate }
    }

    // pak_top (same as run_top)
    if (bt === 'pak_top' && num.length === 1 && w3top && w3top.length === 3) {
        if (w3top.includes(num)) return { wins: true, payout: amount * payoutRate }
    }

    // pak_bottom
    if (bt === 'pak_bottom' && num.length === 1 && w2bottom && w2bottom.length === 2) {
        if (w2bottom.includes(num)) return { wins: true, payout: amount * payoutRate }
    }

    // front_top_1
    if (bt === 'front_top_1' && num.length === 1 && w3top && w3top.length === 3) {
        if (num === w3top[0]) return { wins: true, payout: amount * payoutRate }
    }

    // middle_top_1
    if (bt === 'middle_top_1' && num.length === 1 && w3top && w3top.length === 3) {
        if (num === w3top[1]) return { wins: true, payout: amount * payoutRate }
    }

    // back_top_1
    if (bt === 'back_top_1' && num.length === 1 && w3top && w3top.length === 3) {
        if (num === w3top[2]) return { wins: true, payout: amount * payoutRate }
    }

    // front_bottom_1
    if (bt === 'front_bottom_1' && num.length === 1 && w2bottom && w2bottom.length === 2) {
        if (num === w2bottom[0]) return { wins: true, payout: amount * payoutRate }
    }

    // back_bottom_1
    if (bt === 'back_bottom_1' && num.length === 1 && w2bottom && w2bottom.length === 2) {
        if (num === w2bottom[1]) return { wins: true, payout: amount * payoutRate }
    }

    return { wins: false, payout: 0 }
}

// ============================================================
// COMMISSION CALCULATION
// ============================================================

function getCommissionRate(betType, userId, lotteryType, userSettingsMap) {
    const lotteryKey = getLotteryTypeKey(lotteryType)
    const settingsKey = getSettingsKey(betType, lotteryKey)
    const settings = userSettingsMap?.[userId]?.lottery_settings?.[lotteryKey]?.[settingsKey]
    if (settings?.commission !== undefined) return settings.commission
    return DEFAULT_COMMISSIONS[betType] || 15
}

function getPayoutRate(betType, userId, lotteryType, userSettingsMap) {
    const lotteryKey = getLotteryTypeKey(lotteryType)
    const settingsKey = getSettingsKey(betType, lotteryKey)
    const settings = userSettingsMap?.[userId]?.lottery_settings?.[lotteryKey]?.[settingsKey]
    if (settings?.payout !== undefined) return settings.payout
    return DEFAULT_PAYOUTS[betType] || 1
}

function getSetPrizes(userId, lotteryType, userSettingsMap) {
    const lotteryKey = getLotteryTypeKey(lotteryType)
    const settings = userSettingsMap?.[userId]?.lottery_settings?.[lotteryKey]?.['4_set']
    if (settings?.prizes) return settings.prizes
    return DEFAULT_4_SET_SETTINGS.prizes
}

function getSettingsKey(betType, lotteryKey) {
    if (betType === '4_set') return '4_set'
    if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
        const LAO_MAP = { '3_top': '3_straight', '3_tod': '3_tod_single' }
        return LAO_MAP[betType] || betType
    }
    return betType
}

// ============================================================
// MAIN: Build bet items from submissions and calculate scenarios
// ============================================================

/**
 * Build grouped bet items from raw submissions and transfers
 * Each bet item = unique (bet_type, numbers) combination
 * 
 * @param {Array} submissions - raw submissions from DB
 * @param {Array} transfers - existing bet_transfers from DB
 * @param {Object} userSettingsMap - { userId: { lottery_settings: {...} } }
 * @param {string} lotteryType - 'thai', 'lao', 'hanoi', 'stock'
 * @param {number} setPrice - set price for 4_set (default 120)
 * @returns {Array} betItems
 */
export function buildBetItems(submissions, transfers, userSettingsMap, lotteryType, setPrice = 120) {
    // Build transferred amounts map
    const transferredMap = {}
    ;(transfers || []).forEach(t => {
        const key = `${t.bet_type}|${t.numbers}`
        transferredMap[key] = (transferredMap[key] || 0) + (t.amount || 0)
    })

    // Group submissions by bet_type + numbers
    const groups = {} // key -> { details: [{user_id, amount}], total_amount }
    ;(submissions || []).forEach(s => {
        const key = `${s.bet_type}|${s.numbers}`
        if (!groups[key]) {
            groups[key] = {
                bet_type: s.bet_type,
                numbers: s.numbers,
                total_amount: 0,
                details: [] // per-user amounts for commission/payout calc
            }
        }
        groups[key].total_amount += s.amount || 0
        groups[key].details.push({ user_id: s.user_id, amount: s.amount || 0 })
    })

    // Build bet items with net amounts and payout/commission info
    const betItems = Object.entries(groups).map(([key, g]) => {
        const transferred = transferredMap[key] || 0
        const netAmount = Math.max(0, g.total_amount - transferred)

        // Calculate commission for this bet (sum across all users)
        let totalCommission = 0
        g.details.forEach(d => {
            if (g.bet_type === '4_set') {
                const commRate = getCommissionRate('4_set', d.user_id, lotteryType, userSettingsMap)
                const numSets = Math.floor(d.amount / setPrice)
                totalCommission += numSets * commRate // fixed per set
            } else {
                const commRate = getCommissionRate(g.bet_type, d.user_id, lotteryType, userSettingsMap)
                totalCommission += (d.amount || 0) * (commRate / 100)
            }
        })

        // Get payout rate (use max across users for worst-case)
        let payoutRate = DEFAULT_PAYOUTS[g.bet_type] || 1
        let setPrizes = DEFAULT_4_SET_SETTINGS.prizes
        if (g.bet_type === '4_set') {
            // For 4_set, get worst-case prize settings
            g.details.forEach(d => {
                const userPrizes = getSetPrizes(d.user_id, lotteryType, userSettingsMap)
                const maxPrize = Math.max(...Object.values(userPrizes).map(v => Number(v) || 0))
                const defaultMax = Math.max(...Object.values(setPrizes).map(v => Number(v) || 0))
                if (maxPrize > defaultMax) setPrizes = userPrizes
            })
            payoutRate = 0 // 4_set uses fixed prizes, not multiplier
        } else {
            g.details.forEach(d => {
                const p = getPayoutRate(g.bet_type, d.user_id, lotteryType, userSettingsMap)
                if (p > payoutRate) payoutRate = p
            })
        }

        return {
            bet_type: g.bet_type,
            numbers: g.numbers,
            total_amount: g.total_amount,
            transferred,
            net_amount: netAmount,
            payout_rate: payoutRate,
            set_prizes: setPrizes,
            set_price: g.bet_type === '4_set' ? setPrice : undefined,
            num_sets: g.bet_type === '4_set' ? Math.floor(netAmount / setPrice) : undefined,
            total_commission: totalCommission,
            // Commission proportional to net amount
            net_commission: transferred > 0
                ? totalCommission * (netAmount / g.total_amount)
                : totalCommission,
            details: g.details
        }
    }).filter(b => b.net_amount > 0)

    return betItems
}

// ============================================================
// SCENARIO GENERATION: Generate candidate winning numbers
// ============================================================

/**
 * Generate candidate winning numbers from actual bets
 * For Lao/Hanoi: 4-digit candidates
 * For Thai: 3-digit candidates (since 6-digit is too many)
 * For Stock: 2-digit candidates
 */
export function generateCandidateNumbers(betItems, lotteryType) {
    const candidates = new Set()

    if (lotteryType === 'stock') {
        // Stock: only 2-digit, enumerate all 00-99
        for (let i = 0; i < 100; i++) {
            candidates.add(i.toString().padStart(2, '0'))
        }
        return [...candidates]
    }

    if (lotteryType === 'thai') {
        // Thai: We can't enumerate all 6-digit numbers (1M).
        // Strategy: derive 3-digit top scenarios from bets, then check all bets against each.
        // Also generate 2-digit bottom scenarios separately.
        
        // 3-digit candidates for top
        const top3Candidates = new Set()
        betItems.forEach(b => {
            if ((b.bet_type === '3_top' || b.bet_type === '3_straight') && b.numbers.length === 3) {
                top3Candidates.add(b.numbers)
            }
            if ((b.bet_type === '3_tod' || b.bet_type === '3_tod_single') && b.numbers.length === 3) {
                const perms = getPermutations(b.numbers)
                perms.forEach(p => top3Candidates.add(p))
            }
            if (b.bet_type === '2_top' && b.numbers.length === 2) {
                // 2_top = last 2 of w3top, so w3top = X + num
                for (let d = 0; d <= 9; d++) {
                    top3Candidates.add(d.toString() + b.numbers)
                }
            }
            if (b.bet_type === '2_front' && b.numbers.length === 2) {
                // 2_front = first 2 of w3top
                for (let d = 0; d <= 9; d++) {
                    top3Candidates.add(b.numbers + d.toString())
                }
            }
            if ((b.bet_type === '2_center' || b.bet_type === '2_spread') && b.numbers.length === 2) {
                // 2_center = pos 0+2 of w3top, so w3top = num[0] + X + num[1]
                for (let d = 0; d <= 9; d++) {
                    top3Candidates.add(b.numbers[0] + d.toString() + b.numbers[1])
                }
            }
            if (b.bet_type === 'run_top' && b.numbers.length === 1) {
                // digit appears in w3top - too many combos, skip (covered by other bets)
            }
            if (b.bet_type === '4_float' && b.numbers.length === 4) {
                // 4_float: w3top digits must all appear in 4-digit number
                // Generate 3-digit combos from the 4 digits
                for (let i = 0; i < 4; i++) {
                    const combo = b.numbers.slice(0, i) + b.numbers.slice(i + 1)
                    const perms = getPermutations(combo)
                    perms.forEach(p => top3Candidates.add(p))
                }
            }
            if (b.bet_type === '5_float' && b.numbers.length === 5) {
                // 5_float: w3top digits must all appear in 5-digit number
                const chars = b.numbers.split('')
                for (let i = 0; i < 5; i++) {
                    for (let j = i + 1; j < 5; j++) {
                        for (let k = j + 1; k < 5; k++) {
                            const combo = chars[i] + chars[j] + chars[k]
                            const perms = getPermutations(combo)
                            perms.forEach(p => top3Candidates.add(p))
                        }
                    }
                }
            }
        })

        // 2-digit candidates for bottom
        const bottom2Candidates = new Set()
        betItems.forEach(b => {
            if (b.bet_type === '2_bottom' && b.numbers.length === 2) {
                bottom2Candidates.add(b.numbers)
            }
            if (b.bet_type === 'run_bottom' && b.numbers.length === 1) {
                for (let d = 0; d <= 9; d++) {
                    bottom2Candidates.add(b.numbers + d.toString())
                    bottom2Candidates.add(d.toString() + b.numbers)
                }
            }
            if ((b.bet_type === 'pak_bottom' || b.bet_type === 'front_bottom_1' || b.bet_type === 'back_bottom_1') && b.numbers.length === 1) {
                for (let d = 0; d <= 9; d++) {
                    bottom2Candidates.add(b.numbers + d.toString())
                    bottom2Candidates.add(d.toString() + b.numbers)
                }
            }
        })

        return {
            type: 'thai',
            top3: [...top3Candidates],
            bottom2: [...bottom2Candidates]
        }
    }

    // Lao/Hanoi: 4-digit candidates
    betItems.forEach(b => {
        if (b.bet_type === '4_set' && b.numbers.length === 4) {
            candidates.add(b.numbers)
        }
    })

    betItems.forEach(b => {
        if ((b.bet_type === '3_top' || b.bet_type === '3_straight' || b.bet_type === '3_tod' || b.bet_type === '3_tod_single') && b.numbers.length === 3) {
            if (b.bet_type === '3_tod' || b.bet_type === '3_tod_single') {
                const perms = getPermutations(b.numbers)
                for (const p of perms) {
                    for (let d = 0; d <= 9; d++) {
                        candidates.add(d.toString() + p)
                    }
                }
            } else {
                for (let d = 0; d <= 9; d++) {
                    candidates.add(d.toString() + b.numbers)
                }
            }
        }
    })

    betItems.forEach(b => {
        if (b.bet_type === '2_top' && b.numbers.length === 2) {
            for (let a = 0; a <= 9; a++) {
                for (let c = 0; c <= 9; c++) {
                    candidates.add(a.toString() + c.toString() + b.numbers)
                }
            }
        }
        if (b.bet_type === '2_bottom' && b.numbers.length === 2) {
            for (let c = 0; c <= 9; c++) {
                for (let d = 0; d <= 9; d++) {
                    candidates.add(b.numbers + c.toString() + d.toString())
                }
            }
        }
    })

    // Cap at 5000
    let result = [...candidates]
    if (result.length > 5000) {
        result = result.filter(c =>
            betItems.some(b =>
                (b.bet_type === '4_set' && b.numbers === c) ||
                ((b.bet_type === '3_top' || b.bet_type === '3_straight') && c.slice(1) === b.numbers)
            )
        )
    }

    return result
}

// ============================================================
// SCENARIO CALCULATION: Calculate net profit/loss per scenario
// ============================================================

/**
 * Calculate all scenarios with net profit/loss
 * 
 * @param {Array} betItems - from buildBetItems()
 * @param {string} lotteryType
 * @param {number} setPrice
 * @returns {Array} scenarios sorted by net (worst first = most negative)
 */
export function calculateScenarios(betItems, lotteryType, setPrice = 120) {
    const candidateData = generateCandidateNumbers(betItems, lotteryType)

    // Total income and commission (constant across all scenarios)
    const totalIncome = betItems.reduce((sum, b) => sum + b.net_amount, 0)
    const totalCommission = betItems.reduce((sum, b) => sum + b.net_commission, 0)
    const baseProfit = totalIncome - totalCommission // profit if nobody wins

    const scenarios = []

    if (lotteryType === 'thai' && candidateData?.type === 'thai') {
        // Thai: scenarios are combinations of top3 + bottom2
        // But that's too many combos. Instead, calculate top scenarios and bottom scenarios separately,
        // then combine worst cases.
        
        // Top scenarios (affects: 3_top, 3_tod, 2_top, 2_front, 2_center, 2_run, run_top, pak_top, 4_float, 5_float, front/middle/back_top_1)
        const topScenarios = []
        for (const w3 of candidateData.top3) {
            const winNums = deriveWinningNumbers(w3, 'thai_3digit')
            // Override: for 3-digit scenarios, manually set
            winNums.w3top = w3
            winNums.w3topSorted = w3.split('').sort().join('')
            winNums.w2top = w3.slice(1)
            winNums.w2front = w3.slice(0, 2)
            winNums.w2center = w3[0] + w3[2]

            let totalPayout = 0
            const affected = []

            for (const bet of betItems) {
                if (bet.net_amount <= 0) continue
                // Skip bottom-only bets
                if (['2_bottom', 'run_bottom', 'pak_bottom', 'front_bottom_1', 'back_bottom_1'].includes(bet.bet_type)) continue

                const result = checkBetWin(
                    bet.bet_type, bet.numbers, winNums,
                    bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
                )
                if (result.wins && result.payout > 0) {
                    totalPayout += result.payout
                    affected.push({
                        bet_type: bet.bet_type,
                        numbers: bet.numbers,
                        net_amount: bet.net_amount,
                        payout: result.payout
                    })
                }
            }

            if (affected.length > 0) {
                topScenarios.push({
                    winning_number: w3,
                    label: `3 ตัวบน: ${w3}`,
                    total_payout: totalPayout,
                    net: baseProfit - totalPayout,
                    affected_bets: affected
                })
            }
        }

        // Bottom scenarios (affects: 2_bottom, run_bottom, pak_bottom, front/back_bottom_1)
        const bottomScenarios = []
        for (const w2b of candidateData.bottom2) {
            const winNums = {
                w6top: '', w4set: '', w3top: '', w3topSorted: '',
                w2top: '', w2front: '', w2center: '',
                w2bottom: w2b
            }

            let totalPayout = 0
            const affected = []

            for (const bet of betItems) {
                if (bet.net_amount <= 0) continue
                if (!['2_bottom', 'run_bottom', 'pak_bottom', 'front_bottom_1', 'back_bottom_1'].includes(bet.bet_type)) continue

                const result = checkBetWin(
                    bet.bet_type, bet.numbers, winNums,
                    bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
                )
                if (result.wins && result.payout > 0) {
                    totalPayout += result.payout
                    affected.push({
                        bet_type: bet.bet_type,
                        numbers: bet.numbers,
                        net_amount: bet.net_amount,
                        payout: result.payout
                    })
                }
            }

            if (affected.length > 0) {
                bottomScenarios.push({
                    winning_number: w2b,
                    label: `2 ตัวล่าง: ${w2b}`,
                    total_payout: totalPayout,
                    affected_bets: affected
                })
            }
        }

        // Combine: worst case = worst top + worst bottom
        topScenarios.sort((a, b) => b.total_payout - a.total_payout)
        bottomScenarios.sort((a, b) => b.total_payout - a.total_payout)

        const worstBottom = bottomScenarios[0]?.total_payout || 0
        const bestBottomProfit = bottomScenarios.length > 0 
            ? bottomScenarios[bottomScenarios.length - 1].total_payout 
            : 0

        // Each scenario = top scenario + worst-case bottom
        for (const ts of topScenarios) {
            const combinedPayout = ts.total_payout + worstBottom
            const combinedAffected = [...ts.affected_bets]
            if (worstBottom > 0 && bottomScenarios[0]) {
                combinedAffected.push(...bottomScenarios[0].affected_bets)
            }
            scenarios.push({
                winning_number: ts.winning_number,
                label: ts.label + (worstBottom > 0 ? ` + ล่าง ${bottomScenarios[0].winning_number}` : ''),
                total_payout: combinedPayout,
                net: baseProfit - combinedPayout,
                affected_bets: combinedAffected
            })
        }

        // Also add bottom-only scenarios
        for (const bs of bottomScenarios) {
            scenarios.push({
                winning_number: bs.winning_number,
                label: bs.label,
                total_payout: bs.total_payout,
                net: baseProfit - bs.total_payout,
                affected_bets: bs.affected_bets
            })
        }
    } else {
        // Lao/Hanoi/Stock: straightforward
        const candidates = Array.isArray(candidateData) ? candidateData : []
        
        for (const winNum of candidates) {
            const winNums = deriveWinningNumbers(winNum, lotteryType)
            let totalPayout = 0
            const affected = []

            for (const bet of betItems) {
                if (bet.net_amount <= 0) continue

                const result = checkBetWin(
                    bet.bet_type, bet.numbers, winNums,
                    bet.payout_rate, bet.net_amount, setPrice, bet.set_prizes
                )
                if (result.wins && result.payout > 0) {
                    totalPayout += result.payout
                    affected.push({
                        bet_type: bet.bet_type,
                        numbers: bet.numbers,
                        net_amount: bet.net_amount,
                        payout: result.payout
                    })
                }
            }

            if (affected.length > 0) {
                scenarios.push({
                    winning_number: winNum,
                    label: winNum,
                    total_payout: totalPayout,
                    net: baseProfit - totalPayout,
                    affected_bets: affected
                })
            }
        }
    }

    // Add the "no-win" scenario: a winning number that doesn't match any bet
    // This is the true best case — payout = 0, profit = baseProfit
    scenarios.push({
        winning_number: '-',
        label: 'ไม่มีใครถูก',
        total_payout: 0,
        net: baseProfit,
        affected_bets: []
    })

    // Deduplicate
    const seen = new Set()
    const unique = scenarios.filter(s => {
        const key = s.total_payout + '|' + s.affected_bets.map(a => `${a.bet_type}:${a.numbers}:${a.payout}`).join(',')
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    // Sort by net ascending (worst = most loss first)
    unique.sort((a, b) => a.net - b.net)

    return unique
}

// ============================================================
// CONTRIBUTION-BASED ALGORITHM: Smart transfer recommendations
// ============================================================
//
// Improvements over the old greedy approach:
//   1. Pre-computed payout index → no redundant recalc every iteration
//   2. Marginal cost-effectiveness scoring → risk_reduction / transfer_amount
//   3. Partial transfers → transfer only what's needed, not the full amount
//   4. Merged recommendations → same bet across rounds combined
// ============================================================

/**
 * Build a payout-per-unit index for fast scenario recalculation.
 *
 * Returns Map<betKey, Map<scenarioIdx, payoutPerUnit>>
 * where payoutPerUnit = original_payout / original_net_amount
 * so current_payout = payoutPerUnit × remaining_amount
 *
 * For 4_set: payoutPerUnit = original_payout / num_sets (per set)
 */
function buildPayoutIndex(scenarios, setPrice) {
    // betKey → [ { scenarioIdx, payoutPerUnit, is4set } ]
    const index = {}
    scenarios.forEach((s, si) => {
        for (const ab of s.affected_bets) {
            const key = `${ab.bet_type}|${ab.numbers}`
            if (!index[key]) index[key] = []
            let ppu
            if (ab.bet_type === '4_set') {
                const numSets = Math.floor(ab.net_amount / setPrice)
                ppu = numSets > 0 ? ab.payout / numSets : 0 // payout per set
            } else {
                ppu = ab.net_amount > 0 ? ab.payout / ab.net_amount : 0 // payout per unit
            }
            index[key].push({ si, ppu, is4set: ab.bet_type === '4_set' })
        }
    })
    return index
}

/**
 * Fast scenario payout recalculation using the pre-built index.
 * Returns array of { scenarioIdx, totalPayout } sorted descending.
 */
function fastRecalcPayouts(scenarios, payoutIndex, remaining, setPrice) {
    // Start with zero payouts
    const payouts = new Float64Array(scenarios.length) // fast typed array

    for (const betKey in payoutIndex) {
        const rem = remaining[betKey] || 0
        if (rem <= 0) continue
        for (const entry of payoutIndex[betKey]) {
            if (entry.is4set) {
                const numSets = Math.floor(rem / setPrice)
                payouts[entry.si] += entry.ppu * numSets
            } else {
                payouts[entry.si] += entry.ppu * rem
            }
        }
    }

    return payouts
}

/**
 * Contribution-based algorithm to determine which bets to transfer.
 *
 * Strategy:
 *   1. Find worst scenario (highest payout)
 *   2. For each bet in that scenario, calculate:
 *      score = marginal_payout_reduction / cost_to_transfer
 *      (how much risk drops per baht transferred)
 *   3. Pick highest-scoring bet
 *   4. Calculate minimum partial transfer to bring worst scenario ≤ budget
 *   5. If partial isn't enough (bet appears in multiple scenarios), transfer all
 *   6. Repeat until all scenarios ≤ budget
 */
export function greedyRecommendations(scenarios, betItems, budget, setPrice = 120, lotteryType = 'lao') {
    if (scenarios.length === 0) {
        return { recommendations: [], summary: buildEmptySummary(betItems, budget) }
    }

    // Pre-compute
    const payoutIndex = buildPayoutIndex(scenarios, setPrice)
    const remaining = {}
    const betItemMap = {}
    betItems.forEach(b => {
        const key = `${b.bet_type}|${b.numbers}`
        remaining[key] = b.net_amount
        betItemMap[key] = b
    })

    // Budget means max net LOSS the dealer can absorb.
    // net = baseProfit - payout, so max acceptable payout = baseProfit + budget
    // (baseProfit absorbs some payout before it becomes a loss)
    const baseProfit = betItems.reduce((s, b) => s + b.net_amount, 0)
        - betItems.reduce((s, b) => s + b.net_commission, 0)
    const payoutThreshold = baseProfit + budget

    const recMap = {} // betKey → { ...recommendation }  (for merging)
    const maxIterations = 1000
    let iterCount = 0

    while (iterCount++ < maxIterations) {
        // Fast recalc all scenario payouts
        const payouts = fastRecalcPayouts(scenarios, payoutIndex, remaining, setPrice)

        // Find worst scenario
        let worstIdx = 0
        let worstPayout = payouts[0]
        for (let i = 1; i < payouts.length; i++) {
            if (payouts[i] > worstPayout) { worstPayout = payouts[i]; worstIdx = i }
        }

        if (worstPayout <= payoutThreshold) break // All within budget (net loss ≤ budget)

        const excess = worstPayout - payoutThreshold // how much payout we need to reduce

        // Score every bet that contributes to the worst scenario
        // Weight by how much each scenario exceeds the budget, so massive
        // over-budget scenarios get priority over barely-over ones.
        const worstScenario = scenarios[worstIdx]
        let bestKey = null
        let bestScore = -1
        let bestPPU = 0 // payout-per-unit of best bet in worst scenario

        for (const ab of worstScenario.affected_bets) {
            const key = `${ab.bet_type}|${ab.numbers}`
            const rem = remaining[key] || 0
            if (rem <= 0) continue

            const entries = payoutIndex[key]
            if (!entries) continue

            // Weighted marginal reduction: ppu × excess for each over-budget scenario
            // This ensures a bet that reduces a 575k-over scenario by 550/unit scores
            // far higher than a bet that reduces 200 scenarios by 3/unit each
            let weightedReduction = 0
            for (const entry of entries) {
                const scenarioExcess = payouts[entry.si] - payoutThreshold
                if (scenarioExcess > 0) {
                    weightedReduction += entry.ppu * scenarioExcess
                }
            }

            // Score = weighted risk reduction per unit of transfer
            const score = weightedReduction
            if (score > bestScore) {
                bestScore = score
                bestKey = key
                // PPU in worst scenario specifically
                const worstEntry = entries.find(e => e.si === worstIdx)
                bestPPU = worstEntry ? worstEntry.ppu : entries[0]?.ppu || 1
            }
        }

        if (!bestKey || bestScore <= 0) break // Can't reduce further

        const currentRem = remaining[bestKey] || 0
        const betItem = betItemMap[bestKey]
        const is4set = betItem?.bet_type === '4_set'

        // Calculate minimum transfer to bring worst scenario within budget
        let minTransfer
        if (is4set) {
            // Each set removed reduces payout by bestPPU
            const setsNeeded = Math.ceil(excess / bestPPU)
            minTransfer = setsNeeded * setPrice
        } else {
            // payout_reduction = bestPPU × transfer_amount → need ≥ excess
            minTransfer = Math.ceil(excess / bestPPU)
        }

        // Clamp to available amount
        let transferAmount = Math.min(minTransfer, currentRem)

        // For 4_set: round up to set multiples
        if (is4set) {
            transferAmount = Math.ceil(transferAmount / setPrice) * setPrice
            transferAmount = Math.min(transferAmount, currentRem)
        }

        // Ensure at least 1 unit transferred to make progress
        if (transferAmount <= 0) transferAmount = is4set ? setPrice : 1

        transferAmount = Math.min(transferAmount, currentRem)
        if (transferAmount <= 0) break // nothing left

        // Apply transfer
        remaining[bestKey] = Math.max(0, currentRem - transferAmount)

        // Merge into recommendations
        if (recMap[bestKey]) {
            recMap[bestKey].transfer_amount += transferAmount
            recMap[bestKey].keep_amount = remaining[bestKey]
        } else {
            // Count how many over-budget scenarios this bet appears in
            const entries = payoutIndex[bestKey] || []
            const overBudgetCount = entries.filter(e => payouts[e.si] > payoutThreshold).length

            recMap[bestKey] = {
                bet_type: betItem?.bet_type || bestKey.split('|')[0],
                numbers: betItem?.numbers || bestKey.split('|')[1],
                current_amount: betItem?.net_amount || currentRem,
                transfer_amount: transferAmount,
                keep_amount: remaining[bestKey],
                reason: `ลด ${overBudgetCount} scenarios (${Math.round(bestScore).toLocaleString()}/หน่วย)`,
                set_price: betItem?.set_price,
                num_sets: betItem?.num_sets
            }
        }
    }

    const recommendations = Object.values(recMap)

    // Final summary — pass original totals because income & commission don't change when we transfer
    const originalIncome = betItems.reduce((s, b) => s + b.net_amount, 0)
    const originalCommission = betItems.reduce((s, b) => s + b.net_commission, 0)
    const summary = buildPostSummary(scenarios, payoutIndex, betItems, remaining, payoutThreshold, setPrice, originalIncome, originalCommission)

    return { recommendations, summary }
}

/**
 * Build post-transfer summary using fast recalc
 * 
 * IMPORTANT: originalIncome and originalCommission are the ORIGINAL totals
 * before any transfers. These don't change when we transfer bets because:
 *   - Income = money received from customers (already collected, doesn't change)
 *   - Commission = money paid to customers (already owed, doesn't change)
 * Only the payout liability changes (we no longer pay out on transferred bets).
 * 
 * Formula: net = originalIncome - originalCommission - worstCasePayout(remaining)
 */
function buildPostSummary(scenarios, payoutIndex, betItems, remaining, budget, setPrice, originalIncome, originalCommission) {
    const payouts = fastRecalcPayouts(scenarios, payoutIndex, remaining, setPrice)

    // Calculate remaining amounts for display purposes
    let postRetained = 0
    betItems.forEach(b => {
        const key = `${b.bet_type}|${b.numbers}`
        postRetained += remaining[key] || 0
    })

    let worstIdx = 0, bestIdx = 0
    for (let i = 1; i < payouts.length; i++) {
        if (payouts[i] > payouts[worstIdx]) worstIdx = i
        if (payouts[i] < payouts[bestIdx]) bestIdx = i
    }

    const worstPayout = payouts.length > 0 ? payouts[worstIdx] : 0
    const bestPayout = payouts.length > 0 ? payouts[bestIdx] : 0
    const worstNumber = scenarios[worstIdx]?.winning_number || '-'
    const bestNumber = scenarios[bestIdx]?.winning_number || '-'

    let overBudgetCount = 0
    for (let i = 0; i < payouts.length; i++) {
        if (payouts[i] > budget) overBudgetCount++
    }

    // Net profit formula after transfers:
    //   net = originalIncome - originalCommission - transferredOut - payout(remaining)
    // where transferredOut = originalIncome - postRetained
    // simplifies to: net = postRetained - originalCommission - payout(remaining)
    //
    // Explanation:
    //   - originalIncome: total received from customers (doesn't change)
    //   - originalCommission: total commission owed to customers (doesn't change)
    //   - transferredOut: money we physically send to upstream dealer
    //   - payout(remaining): what we must pay if someone wins (only on bets we still hold)
    const transferredOut = originalIncome - postRetained

    return {
        post_income: originalIncome,
        post_commission: originalCommission,
        post_retained: postRetained,
        transferred_out: transferredOut,
        worst_case_payout: worstPayout,
        worst_case_number: worstNumber,
        worst_case_net: postRetained - originalCommission - worstPayout,
        best_case_payout: bestPayout,
        best_case_number: bestNumber,
        best_case_net: postRetained - originalCommission - bestPayout,
        scenarios_over_budget: overBudgetCount,
        total_scenarios: payouts.length
    }
}

/**
 * Empty summary when no scenarios exist
 */
function buildEmptySummary(betItems, budget) {
    const totalIncome = betItems.reduce((s, b) => s + b.net_amount, 0)
    const totalComm = betItems.reduce((s, b) => s + b.net_commission, 0)
    return {
        post_income: totalIncome,
        post_commission: totalComm,
        worst_case_payout: 0, worst_case_number: '-',
        worst_case_net: totalIncome - totalComm,
        best_case_payout: 0, best_case_number: '-',
        best_case_net: totalIncome - totalComm,
        scenarios_over_budget: 0, total_scenarios: 0
    }
}

/**
 * Main entry point: Run the full scenario analysis
 * 
 * @param {Object} params
 * @param {Array} params.submissions - raw submissions
 * @param {Array} params.transfers - existing transfers
 * @param {Object} params.userSettingsMap - { userId: settings }
 * @param {string} params.lotteryType
 * @param {number} params.budget
 * @param {number} params.setPrice
 * @returns {Object} Full analysis result
 */
export function runScenarioAnalysis({ submissions, transfers, userSettingsMap, lotteryType, budget, setPrice = 120 }) {
    const betItems = buildBetItems(submissions, transfers, userSettingsMap, lotteryType, setPrice)
    const scenarios = calculateScenarios(betItems, lotteryType, setPrice)
    const { recommendations, summary } = greedyRecommendations(scenarios, betItems, budget, setPrice, lotteryType)

    const totalIncome = betItems.reduce((sum, b) => sum + b.net_amount, 0)
    const totalCommission = betItems.reduce((sum, b) => sum + b.net_commission, 0)
    const baseProfit = totalIncome - totalCommission

    // Pre-transfer worst/best
    const preWorst = scenarios[0] || { total_payout: 0, winning_number: '-' }
    const preBest = scenarios[scenarios.length - 1] || { total_payout: 0, winning_number: '-' }

    return {
        betItems,
        scenarios: scenarios.slice(0, 50), // top 50 for display
        recommendations,
        pre_transfer: {
            total_income: totalIncome,
            total_commission: totalCommission,
            base_profit: baseProfit,
            worst_case_payout: preWorst.total_payout,
            worst_case_number: preWorst.winning_number,
            worst_case_net: baseProfit - preWorst.total_payout,
            best_case_payout: preBest.total_payout,
            best_case_number: preBest.winning_number,
            best_case_net: baseProfit - preBest.total_payout,
            scenarios_over_budget: scenarios.filter(s => s.total_payout > baseProfit + budget).length,
            total_scenarios: scenarios.length
        },
        post_transfer: summary,
        budget
    }
}
