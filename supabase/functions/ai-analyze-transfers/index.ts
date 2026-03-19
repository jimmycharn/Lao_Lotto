import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Default payout rates per bet type (multiplier: amount × rate)
const DEFAULT_PAYOUTS: Record<string, number> = {
  'run_top': 3, 'run_bottom': 4,
  'pak_top': 8, 'pak_bottom': 6,
  'front_top_1': 8, 'middle_top_1': 8, 'back_top_1': 8,
  'front_bottom_1': 6, 'back_bottom_1': 6,
  '2_top': 65, '2_bottom': 65, '2_front': 65, '2_center': 65,
  '2_run': 10, '2_spread': 10,
  '3_top': 550, '3_bottom': 135, '3_tod': 100, '3_tod_single': 100,
  '3_straight': 550, '3_front': 100, '3_back': 135,
  '4_float': 20, '4_tod': 100, '5_float': 10,
  '6_top': 1000000,
  '4_set': 0
}

const DEFAULT_SET_PRICE = 120
const DEFAULT_SET_WORST_CASE = 100000

const DEFAULT_COMMISSIONS: Record<string, number> = {
  'run_top': 15, 'run_bottom': 15,
  'pak_top': 15, 'pak_bottom': 15,
  'front_top_1': 15, 'middle_top_1': 15, 'back_top_1': 15,
  'front_bottom_1': 15, 'back_bottom_1': 15,
  '2_top': 15, '2_bottom': 15, '2_front': 15, '2_center': 15,
  '2_run': 15, '2_spread': 15,
  '3_top': 30, '3_bottom': 15, '3_tod': 15, '3_tod_single': 15,
  '3_straight': 30, '3_front': 15, '3_back': 15,
  '4_float': 15, '4_tod': 15, '5_float': 15,
  '6_top': 0, '4_set': 25
}

const BET_TYPE_LABELS: Record<string, string> = {
  'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
  'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
  'front_top_1': 'หน้าบน', 'middle_top_1': 'กลางบน', 'back_top_1': 'หลังบน',
  'front_bottom_1': 'หน้าล่าง', 'back_bottom_1': 'หลังล่าง',
  '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง',
  '2_run': '2 ตัวลอย', '2_spread': '2 ตัวกลับ',
  '3_top': '3 ตัวบน', '3_bottom': '3 ตัวล่าง', '3_tod': '3 ตัวโต๊ด', '3_tod_single': '3 ตัวโต๊ดเดี่ยว',
  '3_straight': '3 ตัวตรง',
  '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย',
  '6_top': 'รางวัลที่ 1', '4_set': '4 ตัวชุด'
}

function getSettingsKey(betType: string, lotteryKey: string): string {
  if (betType === '4_set') return '4_set'
  if (lotteryKey === 'lao' || lotteryKey === 'hanoi') {
    const LAO_MAP: Record<string, string> = { '3_top': '3_straight', '3_tod': '3_tod_single' }
    return LAO_MAP[betType] || betType
  }
  return betType
}

function getLotteryKey(lotteryType: string): string {
  if (lotteryType === 'lao' || lotteryType === 'hanoi') return lotteryType
  if (lotteryType === 'stock') return 'stock'
  return 'thai'
}

// ============================================================
// SCENARIO-BASED MATCHING: Given a hypothetical winning 4-digit
// number, determine which bets would win and how much payout
// ============================================================

// For Lao/Hanoi: winning number = 4 digits (e.g. "1234")
// Derived: w4set = "1234", w3top = "234" (last 3), w2top = "34" (last 2 of w3top), w2bottom = "12" (first 2)
// For each bet, check if it matches and calculate payout

interface BetItem {
  bet_type: string
  numbers: string
  net_amount: number  // after deducting already-transferred
  total_amount: number
  transferred: number
  payout_rate: number // multiplier or fixed prize for 4_set
  payout_if_win: number // actual payout amount if this bet wins
  set_price?: number
  num_sets?: number
}

function checkBetWins(bet: BetItem, w4set: string, lotteryType: string): boolean {
  const bt = bet.bet_type
  const num = bet.numbers
  const w3top = w4set.slice(1) // last 3 digits
  const w2top = w3top.slice(1) // last 2 of w3top
  const w2bottom = (lotteryType === 'lao') ? w4set.slice(0, 2) : ''
  const w3topSorted = w3top.split('').sort().join('')

  const floatCheck = (src: string, target: string): boolean => {
    let temp = target
    for (const ch of src) {
      const idx = temp.indexOf(ch)
      if (idx === -1) return false
      temp = temp.slice(0, idx) + temp.slice(idx + 1)
    }
    return true
  }

  if (bt === 'run_top' && num.length === 1) return w3top.includes(num)
  if (bt === 'run_bottom' && num.length === 1 && w2bottom) return w2bottom.includes(num)
  if (bt === 'front_top_1' && num.length === 1 && w3top.length === 3) return num === w3top[0]
  if (bt === 'middle_top_1' && num.length === 1 && w3top.length === 3) return num === w3top[1]
  if (bt === 'back_top_1' && num.length === 1 && w3top.length === 3) return num === w3top[2]
  if (bt === 'front_bottom_1' && num.length === 1 && w2bottom.length === 2) return num === w2bottom[0]
  if (bt === 'back_bottom_1' && num.length === 1 && w2bottom.length === 2) return num === w2bottom[1]
  if (bt === 'pak_top' && num.length === 1 && w3top.length === 3) return w3top.includes(num)
  if (bt === 'pak_bottom' && num.length === 1 && w2bottom.length === 2) return w2bottom.includes(num)
  if (bt === '2_top' && num.length === 2) return num === w2top
  if (bt === '2_bottom' && num.length === 2 && w2bottom) return num === w2bottom
  if (bt === '2_front' && num.length === 2 && w3top.length === 3) return num === w3top.slice(0, 2)
  if ((bt === '2_center' || bt === '2_spread') && num.length === 2 && w3top.length === 3) return num === (w3top[0] + w3top[2])
  if (bt === '2_run' && num.length === 2 && w3top.length === 3) return w3top.includes(num[0]) && w3top.includes(num[1])
  if ((bt === '3_top' || bt === '3_straight') && num.length === 3) return num === w3top
  if ((bt === '3_tod' || bt === '3_tod_single') && num.length === 3) return num.split('').sort().join('') === w3topSorted && num !== w3top
  if (bt === '4_float' && num.length === 4 && w3top.length === 3) return floatCheck(w3top, num)
  if (bt === '5_float' && num.length === 5 && w3top.length === 3) return floatCheck(w3top, num)
  if (bt === '6_top' && num.length === 6) return false // 6-digit needs 6-digit result, skip for 4-digit scenarios
  if (bt === '4_set' && num.length === 4) {
    // 4_set wins if any sub-prize matches (4ตรง, 4โต๊ด, 3ตรง, 3โต๊ด, 2หน้า, 2หลัง)
    if (num === w4set) return true // 4 ตัวตรงชุด
    if (num.split('').sort().join('') === w4set.split('').sort().join('')) return true // 4 ตัวโต๊ดชุด
    if (num.slice(1) === w4set.slice(1)) return true // 3 ตัวตรงชุด
    if (num.slice(1).split('').sort().join('') === w4set.slice(1).split('').sort().join('') && num.slice(1) !== w4set.slice(1)) return true // 3 ตัวโต๊ดชุด
    if (num.slice(0, 2) === w4set.slice(0, 2)) return true // 2 ตัวหน้าชุด
    if (num.slice(2) === w4set.slice(2)) return true // 2 ตัวหลังชุด
    return false
  }

  return false
}

// Calculate 4_set prize for a specific bet number vs winning number (return highest prize only)
function calc4SetPrize(betNum: string, winNum: string, prizes: Record<string, number>): number {
  if (betNum.length !== 4 || winNum.length !== 4) return 0
  const matched: number[] = []
  if (betNum === winNum) matched.push(prizes['4_straight_set'] || 100000)
  const bSorted = betNum.split('').sort().join('')
  const wSorted = winNum.split('').sort().join('')
  if (bSorted === wSorted && betNum !== winNum) matched.push(prizes['4_tod_set'] || 4000)
  if (betNum.slice(1) === winNum.slice(1)) matched.push(prizes['3_straight_set'] || 30000)
  const bL3S = betNum.slice(1).split('').sort().join('')
  const wL3S = winNum.slice(1).split('').sort().join('')
  if (bL3S === wL3S && betNum.slice(1) !== winNum.slice(1)) matched.push(prizes['3_tod_set'] || 3000)
  if (betNum.slice(0, 2) === winNum.slice(0, 2)) matched.push(prizes['2_front_set'] || 1000)
  if (betNum.slice(2) === winNum.slice(2)) matched.push(prizes['2_back_set'] || 1000)
  return matched.length > 0 ? Math.max(...matched) : 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!AI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, message: 'API Key not configured. Set OPENROUTER_API_KEY in Supabase Secrets.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const { round_id, budget, dealer_id, lottery_type, currency_symbol } = await req.json()

    if (!round_id || !budget || !dealer_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: round_id, budget, dealer_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch round data
    const { data: roundData } = await supabase
      .from('lottery_rounds')
      .select('set_prices, lottery_type')
      .eq('id', round_id)
      .single()

    const setPrice = roundData?.set_prices?.['4_top'] || DEFAULT_SET_PRICE
    const lotteryKey = getLotteryKey(roundData?.lottery_type || lottery_type || 'lao')

    // Fetch submissions
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select('id, bet_type, numbers, amount, user_id, prize_amount')
      .eq('round_id', round_id)
      .eq('is_deleted', false)

    if (subError) throw subError

    // Fetch existing transfers
    const { data: transfers, error: trError } = await supabase
      .from('bet_transfers')
      .select('bet_type, numbers, amount')
      .eq('round_id', round_id)

    if (trError) throw trError

    // Fetch user_settings for all users
    const uniqueUserIds = [...new Set((submissions || []).map((s: any) => s.user_id))]
    const userSettingsMap: Record<string, any> = {}
    if (uniqueUserIds.length > 0) {
      const { data: allUserSettings } = await supabase
        .from('user_settings')
        .select('user_id, lottery_settings')
        .eq('dealer_id', dealer_id)
        .in('user_id', uniqueUserIds)

      for (const us of (allUserSettings || [])) {
        userSettingsMap[us.user_id] = us.lottery_settings
      }
    }

    // Helper: get payout rate
    function getPayoutForSub(betType: string, userId: string): number {
      const settingsKey = getSettingsKey(betType, lotteryKey)
      const settings = userSettingsMap[userId]?.[lotteryKey]?.[settingsKey]
      if (settings?.payout !== undefined) return settings.payout
      return DEFAULT_PAYOUTS[betType] || 1
    }

    // Helper: get 4_set prizes for a user
    function getSetPrizes(userId: string): Record<string, number> {
      const settings = userSettingsMap[userId]?.[lotteryKey]?.['4_set']
      if (settings?.prizes) return settings.prizes
      return {
        '4_straight_set': 100000, '4_tod_set': 4000,
        '3_straight_set': 30000, '3_tod_set': 3000,
        '2_front_set': 1000, '2_back_set': 1000
      }
    }

    // Helper: get worst-case prize for 4_set
    function getSetWorstCasePrize(userId: string): number {
      const prizes = getSetPrizes(userId)
      return Math.max(...Object.values(prizes).map(v => Number(v) || 0))
    }

    // Build transferred amounts map
    const transferredMap: Record<string, number> = {}
    transfers?.forEach((t: any) => {
      const key = `${t.bet_type}|${t.numbers}`
      transferredMap[key] = (transferredMap[key] || 0) + (t.amount || 0)
    })

    // ============================================================
    // Step 1: Build bet items (grouped by bet_type + numbers)
    // ============================================================
    interface SubDetail { user_id: string; amount: number }
    const groupDetails: Record<string, SubDetail[]> = {}
    const betItems: Record<string, BetItem> = {}

    submissions?.forEach((s: any) => {
      const key = `${s.bet_type}|${s.numbers}`
      if (!betItems[key]) {
        betItems[key] = {
          bet_type: s.bet_type,
          numbers: s.numbers,
          net_amount: 0,
          total_amount: 0,
          transferred: 0,
          payout_rate: 0,
          payout_if_win: 0
        }
        groupDetails[key] = []
      }
      betItems[key].total_amount += s.amount || 0
      groupDetails[key].push({ user_id: s.user_id, amount: s.amount || 0 })
    })

    // Calculate net amounts and payout rates
    const betList: BetItem[] = Object.entries(betItems).map(([key, b]) => {
      const transferred = transferredMap[key] || 0
      b.transferred = transferred
      b.net_amount = Math.max(0, b.total_amount - transferred)
      const details = groupDetails[key] || []

      if (b.bet_type === '4_set') {
        const worstCasePrize = details.length > 0 ? getSetWorstCasePrize(details[0].user_id) : DEFAULT_SET_WORST_CASE
        const numSets = Math.floor(b.net_amount / setPrice)
        b.payout_rate = worstCasePrize
        b.payout_if_win = numSets * worstCasePrize
        b.set_price = setPrice
        b.num_sets = numSets
      } else {
        let maxPayout = DEFAULT_PAYOUTS[b.bet_type] || 1
        for (const d of details) {
          const p = getPayoutForSub(b.bet_type, d.user_id)
          if (p > maxPayout) maxPayout = p
        }
        b.payout_rate = maxPayout
        b.payout_if_win = b.net_amount * maxPayout
      }
      return b
    }).filter(b => b.net_amount > 0)

    // ============================================================
    // Step 2: Generate worst-case scenarios
    // For each possible winning number (derived from actual bets),
    // calculate total payout across ALL bet types
    // ============================================================

    // Collect all unique candidate winning numbers (4-digit)
    // From: 4_set numbers directly, and from other bets by padding/deriving
    const candidateWinNumbers = new Set<string>()

    // All 4-digit numbers from 4_set bets are direct candidates
    betList.forEach(b => {
      if (b.bet_type === '4_set' && b.numbers.length === 4) {
        candidateWinNumbers.add(b.numbers)
        // Also add permutations for tod matching? No - too many.
        // We only test exact 4-digit as winning scenario
      }
    })

    // For 3-digit bets, we need to test all possible 4-digit winning numbers
    // where last 3 digits = this number. We just test 0XXX through 9XXX
    betList.forEach(b => {
      if ((b.bet_type === '3_top' || b.bet_type === '3_straight' || b.bet_type === '3_tod' || b.bet_type === '3_tod_single') && b.numbers.length === 3) {
        // For 3_top/3_straight: last 3 digits match exactly
        for (let d = 0; d <= 9; d++) {
          candidateWinNumbers.add(d.toString() + b.numbers)
        }
        // For 3_tod: last 3 digits are permutation
        if (b.bet_type === '3_tod' || b.bet_type === '3_tod_single') {
          // Generate all permutations of the 3 digits as last 3
          const perms = getPermutations(b.numbers)
          for (const p of perms) {
            for (let d = 0; d <= 9; d++) {
              candidateWinNumbers.add(d.toString() + p)
            }
          }
        }
      }
    })

    // For 2-digit bets, generate possible 4-digit scenarios
    betList.forEach(b => {
      if (b.bet_type === '2_top' && b.numbers.length === 2) {
        // 2_top matches last 2 of w3top = positions 2,3 of 4-digit
        // w4set = ABCD, w3top = BCD, w2top = CD
        // So winning numbers ?X[num] where X is anything
        for (let a = 0; a <= 9; a++) {
          for (let c = 0; c <= 9; c++) {
            candidateWinNumbers.add(a.toString() + c.toString() + b.numbers)
          }
        }
      }
      if (b.bet_type === '2_bottom' && b.numbers.length === 2) {
        // 2_bottom = first 2 of w4set
        for (let c = 0; c <= 9; c++) {
          for (let d = 0; d <= 9; d++) {
            candidateWinNumbers.add(b.numbers + c.toString() + d.toString())
          }
        }
      }
    })

    // Cap candidates to avoid explosion - prioritize 4-digit bets first
    // If too many candidates, only use 4_set numbers + 3-digit derived
    let candidates = [...candidateWinNumbers]
    if (candidates.length > 5000) {
      // Trim 2-digit derived, keep only 4_set and 3-digit derived
      candidates = candidates.filter(c => {
        return betList.some(b => 
          (b.bet_type === '4_set' && b.numbers === c) ||
          ((b.bet_type === '3_top' || b.bet_type === '3_straight') && c.slice(1) === b.numbers)
        )
      })
    }

    // Helper: get all permutations of a string
    function getPermutations(str: string): string[] {
      if (str.length <= 1) return [str]
      const result: string[] = []
      for (let i = 0; i < str.length; i++) {
        const rest = str.slice(0, i) + str.slice(i + 1)
        for (const perm of getPermutations(rest)) {
          result.push(str[i] + perm)
        }
      }
      return [...new Set(result)]
    }

    // ============================================================
    // Step 3: For each candidate winning number, calculate total payout
    // ============================================================

    interface Scenario {
      winning_number: string
      total_payout: number
      affected_bets: {
        bet_type: string
        bet_type_label: string
        numbers: string
        net_amount: number
        payout: number
        set_price?: number
        num_sets?: number
      }[]
    }

    const scenarios: Scenario[] = []

    for (const winNum of candidates) {
      if (winNum.length !== 4) continue
      let totalPayout = 0
      const affected: Scenario['affected_bets'] = []

      for (const bet of betList) {
        if (bet.net_amount <= 0) continue
        const wins = checkBetWins(bet, winNum, lotteryKey)
        if (!wins) continue

        let payout = 0
        if (bet.bet_type === '4_set') {
          // Calculate specific 4_set prize for this winning number
          const details = groupDetails[`${bet.bet_type}|${bet.numbers}`] || []
          const prizes = details.length > 0 ? getSetPrizes(details[0].user_id) : {
            '4_straight_set': 100000, '4_tod_set': 4000,
            '3_straight_set': 30000, '3_tod_set': 3000,
            '2_front_set': 1000, '2_back_set': 1000
          }
          const prizePerSet = calc4SetPrize(bet.numbers, winNum, prizes)
          const numSets = Math.floor(bet.net_amount / setPrice)
          payout = numSets * prizePerSet
        } else {
          payout = bet.net_amount * bet.payout_rate
        }

        if (payout > 0) {
          totalPayout += payout
          const affItem: any = {
            bet_type: bet.bet_type,
            bet_type_label: BET_TYPE_LABELS[bet.bet_type] || bet.bet_type,
            numbers: bet.numbers,
            net_amount: bet.net_amount,
            payout
          }
          if (bet.bet_type === '4_set') {
            affItem.set_price = setPrice
            affItem.num_sets = Math.floor(bet.net_amount / setPrice)
          }
          affected.push(affItem)
        }
      }

      if (totalPayout > 0 && affected.length > 0) {
        scenarios.push({ winning_number: winNum, total_payout: totalPayout, affected_bets: affected })
      }
    }

    // Sort by total_payout descending
    scenarios.sort((a, b) => b.total_payout - a.total_payout)

    // Deduplicate: keep only unique total_payout+affected combo (some scenarios are identical)
    const seenPayouts = new Set<string>()
    const uniqueScenarios = scenarios.filter(s => {
      const key = s.total_payout + '|' + s.affected_bets.map(a => `${a.bet_type}:${a.numbers}:${a.payout}`).join(',')
      if (seenPayouts.has(key)) return false
      seenPayouts.add(key)
      return true
    })

    // Take top 30 worst scenarios
    const topScenarios = uniqueScenarios.slice(0, 30)

    // ============================================================
    // Step 4: Build all bet items for AI reference
    // ============================================================
    const allBetItems = betList.map(b => {
      const item: any = {
        bet_type: b.bet_type,
        bet_type_label: BET_TYPE_LABELS[b.bet_type] || b.bet_type,
        numbers: b.numbers,
        total_amount: b.total_amount,
        transferred: b.transferred,
        net_amount: b.net_amount,
        payout_rate: b.payout_rate,
        payout_if_win: b.payout_if_win
      }
      if (b.bet_type === '4_set') {
        item.set_price = setPrice
        item.num_sets = b.num_sets
        item.note = `ขายเป็นชุด ชุดละ ${setPrice} บาท ตีออกต้องเป็นทวีคูณของ ${setPrice}`
      }
      return item
    })

    // Sort by payout_if_win descending
    allBetItems.sort((a: any, b: any) => b.payout_if_win - a.payout_if_win)

    // Calculate totals
    const totalBetAmount = betList.reduce((sum, b) => sum + b.total_amount, 0)
    const totalTransferred = betList.reduce((sum, b) => sum + b.transferred, 0)
    const totalNetAmount = betList.reduce((sum, b) => sum + b.net_amount, 0)
    const worstScenarioPayout = topScenarios.length > 0 ? topScenarios[0].total_payout : 0

    // ============================================================
    // Step 5: Build prompt for AI
    // ============================================================
    const systemPrompt = `คุณเป็น AI ผู้เชี่ยวชาญวิเคราะห์ความเสี่ยงหวยสำหรับเจ้ามือ (dealer)

หลักการสำคัญ: "Scenario-Based Analysis"
- เมื่อผลออกเลขใดเลขหนึ่ง จะกระทบหลายรายการพร้อมกัน เช่น ถ้าออก 1234:
  * 4 ตัวชุด 1234 = จ่ายรางวัลชุด
  * 3 ตัวตรง 234 = จ่าย amount × อัตราจ่าย
  * 2 ตัวบน 34 = จ่าย amount × อัตราจ่าย
  * 2 ตัวล่าง 12 = จ่าย amount × อัตราจ่าย
  * วิ่งบน 2,3,4 = จ่าย amount × อัตราจ่าย
  รวมทั้งหมดคือยอดจ่ายจริงถ้าเลขนั้นออก
- คุณจะได้รับ "worst_case_scenarios" ที่คำนวณไว้แล้วว่าถ้าเลขไหนออก ต้องจ่ายรวมเท่าไหร่

หน้าที่ของคุณ:
1. ดู worst_case_scenarios แต่ละ scenario ถ้า total_payout > budget → ต้องตีออกบางรายการ
2. เลือกว่าจะตีออกรายการไหนจาก affected_bets ของ scenario นั้น เพื่อลด total_payout ให้ไม่เกิน budget
3. คำนึงว่าการตีออก 1 รายการอาจลดความเสี่ยงของหลาย scenarios พร้อมกัน
4. เป้าหมาย: ทุก scenario ต้องมี total_payout ≤ budget

กฎสำคัญ:
- แนะนำเฉพาะรายการที่ต้องตีออก ถ้า scenario ไม่เกิน budget ไม่ต้องแนะนำ
- transfer_amount ต้องเป็นจำนวนเต็ม
- ให้เหตุผลสั้นๆ เป็นภาษาไทย

กฎพิเศษ 4 ตัวชุด (4_set):
- ขายเป็นชุดๆ ไม่แบ่งได้
- transfer_amount ต้องเป็นทวีคูณของ set_price เท่านั้น (เช่น ${setPrice}, ${setPrice * 2}, ${setPrice * 3}...)
- keep_amount ก็ต้องเป็นทวีคูณของ set_price

หน่วยเงิน: ${currency_symbol || '฿'}
ประเภทหวย: ${lottery_type || 'lao'}

ตอบเป็น JSON เท่านั้น ห้ามใส่ markdown, code block, หรือข้อความอื่นนอกจาก JSON
รูปแบบ JSON:
{
  "analysis": {
    "worst_case_payout": <number - ยอดจ่ายสูงสุดจาก scenario ที่แย่ที่สุด>,
    "worst_case_number": "<string - เลขที่ถ้าออกจะเสียมากที่สุด>",
    "budget": <number>,
    "risk_level": "low" | "medium" | "high" | "critical",
    "summary": "<string - สรุปสั้นๆ ภาษาไทย>"
  },
  "recommendations": [
    {
      "bet_type": "<string>",
      "numbers": "<string>",
      "current_amount": <number - ยอดปัจจุบัน (net_amount)>,
      "transfer_amount": <number - ยอดที่ควรตีออก>,
      "keep_amount": <number - ยอดที่เก็บไว้>,
      "reason": "<string - เหตุผลสั้นๆ ภาษาไทย อ้างอิง scenario>"
    }
  ]
}`

    const userPrompt = `วงเงินสู้ (budget): ${currency_symbol || '฿'}${budget.toLocaleString()}

สรุปภาพรวม:
- ยอดรับรวม: ${currency_symbol || '฿'}${totalBetAmount.toLocaleString()}
- ยอดตีออกแล้ว: ${currency_symbol || '฿'}${totalTransferred.toLocaleString()}  
- ยอดสุทธิ: ${currency_symbol || '฿'}${totalNetAmount.toLocaleString()}
- ยอดจ่ายสูงสุด (worst case): ${currency_symbol || '฿'}${worstScenarioPayout.toLocaleString()}
- จำนวนรายการ: ${betList.length} รายการ

=== WORST CASE SCENARIOS (ถ้าเลขนี้ออก ต้องจ่ายเท่าไหร่) ===
${JSON.stringify(topScenarios.map(s => ({
  winning_number: s.winning_number,
  total_payout: s.total_payout,
  over_budget: s.total_payout > budget,
  over_budget_by: Math.max(0, s.total_payout - budget),
  affected_bets: s.affected_bets
})), null, 2)}

=== รายการเลขทั้งหมด (เรียงตามยอดจ่ายสูงสุด) ===
${JSON.stringify(allBetItems.slice(0, 80), null, 2)}`

    // Call OpenRouter API
    const openaiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': SUPABASE_URL,
        'X-Title': 'LaoLotto AI Analysis'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt + '\n\nRespond with ONLY the JSON object. No markdown, no explanations, no extra text.' }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      console.error('AI API error:', errText)
      return new Response(
        JSON.stringify({ success: false, message: `AI API error: ${openaiResponse.status} - ${errText.substring(0, 200)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const openaiResult = await openaiResponse.json()
    const aiContent = openaiResult.choices?.[0]?.message?.content

    let aiAnalysis: any
    try {
      aiAnalysis = JSON.parse(aiContent)
    } catch (e) {
      try {
        const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[1].trim())
        } else {
          const braceMatch = aiContent.match(/\{[\s\S]*\}/)
          if (braceMatch) {
            aiAnalysis = JSON.parse(braceMatch[0])
          } else {
            throw new Error('No JSON found')
          }
        }
      } catch (e2) {
        console.error('Failed to parse AI response:', aiContent)
        return new Response(
          JSON.stringify({ success: false, message: 'AI returned invalid JSON', raw: aiContent?.substring(0, 500) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
    }

    // Post-AI validation: fix 4_set transfer_amount
    if (aiAnalysis?.recommendations) {
      for (const rec of aiAnalysis.recommendations) {
        if (rec.bet_type === '4_set' && rec.transfer_amount) {
          const sets = Math.ceil(rec.transfer_amount / setPrice)
          rec.transfer_amount = sets * setPrice
          rec.keep_amount = Math.max(0, (rec.current_amount || 0) - rec.transfer_amount)
          rec.keep_amount = Math.floor(rec.keep_amount / setPrice) * setPrice
        }
      }
    }

    // Log the analysis
    try {
      await supabase.from('ai_analysis_logs').insert({
        round_id,
        dealer_id,
        budget,
        input_summary: {
          total_bet: totalBetAmount,
          total_transferred: totalTransferred,
          total_net: totalNetAmount,
          worst_case_payout: worstScenarioPayout,
          worst_case_number: topScenarios[0]?.winning_number || '',
          scenario_count: topScenarios.length,
          item_count: betList.length
        },
        ai_response: aiAnalysis,
        model: 'anthropic/claude-3.5-sonnet',
        tokens_used: openaiResult.usage?.total_tokens || 0
      })
    } catch (logError) {
      console.error('Failed to log AI analysis:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: aiAnalysis,
        meta: {
          total_bet: totalBetAmount,
          total_transferred: totalTransferred,
          total_net: totalNetAmount,
          worst_case_payout: worstScenarioPayout,
          worst_case_number: topScenarios[0]?.winning_number || '',
          scenario_count: uniqueScenarios.length,
          scenarios_over_budget: topScenarios.filter(s => s.total_payout > budget).length,
          item_count: betList.length,
          tokens_used: openaiResult.usage?.total_tokens || 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
