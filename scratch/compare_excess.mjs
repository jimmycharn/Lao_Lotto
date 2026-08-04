// compare_excess.mjs
// Run: node scratch/compare_excess.mjs
// Compare excess calculation between web app and line bot

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Read .env
const env = readFileSync('f:/Web App/Lao_Lotto/.env', 'utf-8')
const envVars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) envVars[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
})

// Use anon key (enough for reading data)
const supabase = createClient(
  'https://nmumnletxkeflmsythsn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'
)

// === CONFIG ===
// Change this to the round you want to compare
let ROUND_ID = null  // will auto-pick latest open round

function getLimitLookupBetType(betType) {
  const ALIAS_MAP = {
    'front_top_1': 'pak_top',
    'middle_top_1': 'pak_top',
    'back_top_1': 'pak_top',
    'front_bottom_1': 'pak_bottom',
    'back_bottom_1': 'pak_bottom',
    '2_spread': '2_center',
    '2_tang': '2_center',
    '2_teng': '2_run',
    '2_have': '2_run',
    '2_back': '2_top',
    '2_front_single': '2_front',
    '4_set': '4_top'
  }
  return ALIAS_MAP[betType] || betType
}

async function main() {
  // Get round
  if (!ROUND_ID) {
    const { data: rounds } = await supabase
      .from('lottery_rounds')
      .select('id, lottery_name, lottery_type, status, draw_date')
      .in('status', ['open', 'closed'])
      .order('created_at', { ascending: false })
      .limit(5)
    console.log('Recent rounds:')
    rounds?.forEach(r => console.log(`  ${r.id} | ${r.lottery_name} | ${r.lottery_type} | ${r.status} | ${r.draw_date}`))
    ROUND_ID = rounds?.[0]?.id
    console.log(`\nUsing round: ${ROUND_ID}\n`)
  }

  const { data: roundData } = await supabase
    .from('lottery_rounds')
    .select('set_prices, lottery_type')
    .eq('id', ROUND_ID)
    .maybeSingle()

  const setPrice = Number(roundData?.set_prices?.['4_top'] || 120)
  const lotteryType = roundData?.lottery_type || ''
  const isSetBased = ['lao', 'hanoi'].includes(lotteryType)
  console.log(`setPrice: ${setPrice}, lotteryType: ${lotteryType}, isSetBased: ${isSetBased}`)

  // Fetch data
  let page = 0, subs = []
  while (true) {
    const { data } = await supabase
      .from('submissions')
      .select('bet_type, numbers, amount, created_at')
      .eq('round_id', ROUND_ID)
      .eq('is_deleted', false)
      .range(page * 1000, (page + 1) * 1000 - 1)
    if (!data || data.length === 0) break
    subs.push(...data)
    if (data.length < 1000) break
    page++
  }
  console.log(`Submissions: ${subs.length}`)

  const { data: typeLimitsData } = await supabase
    .from('type_limits')
    .select('bet_type, max_per_number')
    .eq('round_id', ROUND_ID)

  const typeLimitsMap = {}
  ;(typeLimitsData || []).forEach(tl => {
    typeLimitsMap[tl.bet_type] = Number(tl.max_per_number)
  })
  console.log('Type limits:', typeLimitsMap)

  const { data: numberLimitsData } = await supabase
    .from('number_limits')
    .select('bet_type, numbers, max_amount, include_reversed, reversed_numbers')
    .eq('round_id', ROUND_ID)

  const { data: allTransfers } = await supabase
    .from('bet_transfers')
    .select('bet_type, numbers, amount, status')
    .eq('round_id', ROUND_ID)

  console.log(`All transfers: ${allTransfers?.length || 0}`)
  const returnedTransfers = allTransfers?.filter(t => t.status === 'returned') || []
  console.log(`Returned transfers: ${returnedTransfers.length}`)
  if (returnedTransfers.length > 0) {
    console.log('  Returned:', returnedTransfers.map(t => `${t.bet_type}|${t.numbers}|${t.amount}`))
  }

  // LINE-BOT: excludes returned
  const lineBotTransfers = (allTransfers || []).filter(t => t.status !== 'returned')
  // WEB APP: includes all (does NOT filter status at 4_set level)
  const webAppTransfers_4set = allTransfers || []  // no filter on 4_set transfers
  const webAppTransfers_normal = (allTransfers || []).filter(t => t.status !== 'returned')  // has filter on normal bets

  console.log(`Line-bot transfers (non-returned): ${lineBotTransfers.length}`)

  // === GROUP SUBMISSIONS ===
  const grouped = {}
  subs.forEach(sub => {
    let subNum = sub.numbers
    if (sub.bet_type === '3_tod' || sub.bet_type === '4_tod') {
      subNum = subNum.split('').sort().join('')
    }
    const lookupBetType = getLimitLookupBetType(sub.bet_type)
    const key = `${lookupBetType}|${subNum}`
    if (!grouped[key]) {
      grouped[key] = { bet_type: lookupBetType, numbers: subNum, totalAmt: 0, setCount: 0, submissions: [] }
    }
    grouped[key].totalAmt += Number(sub.amount || 0)
    grouped[key].submissions.push(sub)
    if (isSetBased && (sub.bet_type === '4_set' || sub.bet_type === '4_top')) {
      grouped[key].setCount += Math.ceil(Number(sub.amount || 0) / setPrice)
    }
  })

  // === CALC EXCESS: LINE BOT STYLE ===
  function calcExcessLineBot(transfers) {
    const excessItems = []
    const limit3Set = typeLimitsMap['3_set'] !== undefined ? typeLimitsMap['3_set'] : 999999999
    const limit4Set = typeLimitsMap['4_set'] !== undefined ? typeLimitsMap['4_set'] : (typeLimitsMap['4_top'] !== undefined ? typeLimitsMap['4_top'] : 999999999)

    if (isSetBased) {
      const groupedByLast3 = {}
      Object.values(grouped).forEach(group => {
        if ((group.bet_type === '4_set' || group.bet_type === '4_top') && group.numbers?.length === 4) {
          const last3 = group.numbers.slice(-3)
          if (!groupedByLast3[last3]) {
            groupedByLast3[last3] = { last3Digits: last3, exactMatches: {}, totalSets: 0 }
          }
          if (!groupedByLast3[last3].exactMatches[group.numbers]) {
            groupedByLast3[last3].exactMatches[group.numbers] = { numbers: group.numbers, setCount: 0, submissions: [] }
          }
          groupedByLast3[last3].exactMatches[group.numbers].setCount += group.setCount
          groupedByLast3[last3].exactMatches[group.numbers].submissions.push(...group.submissions)
          groupedByLast3[last3].totalSets += group.setCount
        }
      })

      const exactExcessSetsMap = {}

      Object.values(groupedByLast3).forEach(group3 => {
        const exactMatchGroups = Object.values(group3.exactMatches)
        exactMatchGroups.sort((a, b) => {
          const aTime = Math.min(...a.submissions.map(s => new Date(s.created_at).getTime()))
          const bTime = Math.min(...b.submissions.map(s => new Date(s.created_at).getTime()))
          return aTime - bTime
        })

        // 1. 4_set exact limit
        exactMatchGroups.forEach(exactGroup => {
          const exactTransferred = transfers
            .filter(t => (t.bet_type === '4_set' || t.bet_type === '4_top') && t.numbers === exactGroup.numbers)
            .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0)
          const effectiveLimit = limit4Set + exactTransferred
          if (exactGroup.setCount > effectiveLimit) {
            const excess4 = exactGroup.setCount - effectiveLimit
            exactExcessSetsMap[exactGroup.numbers] = excess4
          }
        })

        // 2. 3_digit_match
        const uniqueNumbers = Object.keys(group3.exactMatches)
        const sortedNumbers = uniqueNumbers.sort((a, b) => {
          const aTime = Math.min(...group3.exactMatches[a].submissions.map(s => new Date(s.created_at).getTime()))
          const bTime = Math.min(...group3.exactMatches[b].submissions.map(s => new Date(s.created_at).getTime()))
          return aTime - bTime
        })

        const totalTransferred3Set = transfers
          .filter(t => (t.bet_type === '4_set' || t.bet_type === '3_set') && t.numbers?.slice(-3) === group3.last3Digits)
          .reduce((sum, t) => sum + Math.floor((Number(t.amount) || 0) / setPrice), 0)

        let remaining3SetLimit = limit3Set + totalTransferred3Set

        sortedNumbers.forEach(num => {
          const exactGroup = group3.exactMatches[num]
          const setsToKeep = Math.min(exactGroup.setCount, remaining3SetLimit)
          remaining3SetLimit -= setsToKeep
          const excessSets3 = exactGroup.setCount - setsToKeep
          if (excessSets3 > 0) {
            const prevExcess = exactExcessSetsMap[num] || 0
            exactExcessSetsMap[num] = Math.max(prevExcess, excessSets3)
          }
        })

        sortedNumbers.forEach(num => {
          const excessSets = exactExcessSetsMap[num] || 0
          if (excessSets > 0) {
            excessItems.push({ bet_type: '4_set', numbers: num, amount: excessSets * setPrice })
          }
        })
      })
    }

    // Normal bets
    for (const group of Object.values(grouped)) {
      if (isSetBased && (group.bet_type === '4_set' || group.bet_type === '4_top')) continue

      const limitLookupBetType = getLimitLookupBetType(group.bet_type)
      const numberLimit = (numberLimitsData || []).find(nl => {
        const nlBetType = getLimitLookupBetType(nl.bet_type)
        if (nlBetType === limitLookupBetType && nl.numbers === group.numbers) return true
        if (nl.include_reversed && nlBetType === limitLookupBetType && nl.reversed_numbers?.includes(group.numbers)) return true
        return false
      })
      const numLimit = numberLimit !== undefined ? Number(numberLimit.max_amount) : undefined
      const typeLimit = typeLimitsMap[limitLookupBetType]
      const limit = numLimit !== undefined ? numLimit : (typeLimit !== undefined ? typeLimit : 999999999)

      const alreadyTransferred = transfers
        .filter(t => {
          let tNum = t.numbers
          if (t.bet_type === '3_tod' || t.bet_type === '4_tod') tNum = tNum.split('').sort().join('')
          const tBetType = getLimitLookupBetType(t.bet_type)
          return tBetType === limitLookupBetType && tNum === group.numbers
        })
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)

      const currentExcess = group.totalAmt - limit - alreadyTransferred
      if (currentExcess > 0) {
        excessItems.push({ bet_type: group.bet_type, numbers: group.numbers, amount: currentExcess })
      }
    }

    return excessItems
  }

  const lineBotItems = calcExcessLineBot(lineBotTransfers)
  const webAppItems_noReturnedFilter = calcExcessLineBot(webAppTransfers_4set)  // simulates web app (4_set no filter)

  const lineBotTotal = lineBotItems.reduce((s, i) => s + i.amount, 0)
  const webAppTotal = webAppItems_noReturnedFilter.reduce((s, i) => s + i.amount, 0)

  console.log('\n=== RESULTS ===')
  console.log(`Line bot total: ${lineBotTotal} (${lineBotItems.length} items)`)
  console.log(`Web app total:  ${webAppTotal} (${webAppItems_noReturnedFilter.length} items)`)
  console.log(`Difference: ${lineBotTotal - webAppTotal}`)

  if (lineBotTotal !== webAppTotal) {
    console.log('\n=== Items only in Line bot ===')
    lineBotItems.forEach(lb => {
      const wa = webAppItems_noReturnedFilter.find(w => w.bet_type === lb.bet_type && w.numbers === lb.numbers)
      if (!wa) {
        console.log(`  MISSING: ${lb.bet_type}|${lb.numbers}|${lb.amount}`)
      } else if (wa.amount !== lb.amount) {
        console.log(`  DIFF: ${lb.bet_type}|${lb.numbers} - LB:${lb.amount} vs WA:${wa.amount} (diff:${lb.amount - wa.amount})`)
      }
    })
    console.log('\n=== Items only in Web app ===')
    webAppItems_noReturnedFilter.forEach(wa => {
      const lb = lineBotItems.find(l => l.bet_type === wa.bet_type && l.numbers === wa.numbers)
      if (!lb) {
        console.log(`  EXTRA: ${wa.bet_type}|${wa.numbers}|${wa.amount}`)
      }
    })
  }
}

main().catch(console.error)
