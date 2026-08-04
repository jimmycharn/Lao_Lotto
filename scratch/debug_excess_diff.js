import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugDiff() {
  try {
    // 1. Find the Thai round for 2026-08-01
    const { data: rounds, error: rErr } = await supabase
      .from('lottery_rounds')
      .select('*')
      .eq('lottery_type', 'thai')
      .order('created_at', { ascending: false })
      .limit(5)

    if (rErr) {
      console.error('Error fetching rounds:', rErr)
      return
    }

    console.log('Found Thai rounds:', rounds.map(r => ({ id: r.id, name: r.lottery_name, date: r.round_date, status: r.status })))

    const round = rounds.find(r => r.round_date === '2026-08-01' || r.round_date === '2026-08-01T00:00:00+00:00') || rounds[0]

    if (!round) {
      console.log('No round found')
      return
    }

    console.log('\n=== Testing Round ID:', round.id, 'Date:', round.round_date, '===')

    // 2. Fetch submissions
    let allSubmissions = []
    let from = 0
    const step = 1000
    while (true) {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('round_id', round.id)
        .eq('is_deleted', false)
        .range(from, from + step - 1)
      if (error) {
        console.error('Error fetching submissions:', error)
        break
      }
      if (!data || data.length === 0) break
      allSubmissions.push(...data)
      if (data.length < step) break
      from += step
    }

    console.log('Total submissions fetched:', allSubmissions.length)

    // 3. Fetch transfers
    const { data: transfers } = await supabase
      .from('bet_transfers')
      .select('*')
      .eq('round_id', round.id)

    const activeTransfers = (transfers || []).filter(t => t.status !== 'returned')
    console.log('Total active transfers:', activeTransfers.length)

    // 4. Fetch type limits
    const { data: typeLimitsData } = await supabase
      .from('type_limits')
      .select('*')
      .eq('round_id', round.id)

    const typeLimitsMap = {}
    ;(typeLimitsData || []).forEach(tl => {
      typeLimitsMap[tl.bet_type] = Number(tl.max_per_number)
    })
    console.log('Type limits:', typeLimitsMap)

    // 5. Fetch number limits
    const { data: numberLimitsData } = await supabase
      .from('number_limits')
      .select('*')
      .eq('round_id', round.id)
      .eq('is_active', true)

    console.log('Number limits count:', (numberLimitsData || []).length)
    console.log('Number limits:', numberLimitsData)

    // ─── WEB APP CALCULATION (SubmissionsModal.jsx) ───
    function calculateWebAppExcess() {
      const grouped = {}
      allSubmissions.forEach(sub => {
        let subNum = sub.numbers
        if (sub.bet_type === '3_tod' || sub.bet_type === '4_tod') {
          subNum = subNum.split('').sort().join('')
        }
        const key = `${sub.bet_type}|${subNum}`
        if (!grouped[key]) {
          grouped[key] = {
            bet_type: sub.bet_type,
            numbers: subNum,
            total: 0,
            submissions: []
          }
        }
        grouped[key].total += Number(sub.amount || 0)
        grouped[key].submissions.push(sub)
      })

      const excessItems = []
      Object.values(grouped).forEach(group => {
        const limitLookupBetType = group.bet_type === '4_set' ? '4_top' : group.bet_type
        const numberLimit = (numberLimitsData || []).find(nl => {
          const nlBetType = nl.bet_type === '4_set' ? '4_top' : nl.bet_type
          return nlBetType === limitLookupBetType && nl.numbers === group.numbers
        })
        const typeLimit = typeLimitsMap[limitLookupBetType]
        const limit = numberLimit ? Number(numberLimit.max_amount) : (typeLimit || 999999999)

        const transferredAmount = activeTransfers
          .filter(t => {
            const tBetType = t.bet_type === '4_set' ? '4_top' : t.bet_type
            let tNum = t.numbers
            if (t.bet_type === '3_tod' || t.bet_type === '4_tod') {
              tNum = tNum.split('').sort().join('')
            }
            return tBetType === limitLookupBetType && tNum === group.numbers
          })
          .reduce((sum, t) => sum + Number(t.amount || 0), 0)

        const effectiveExcess = group.total - limit - transferredAmount
        if (effectiveExcess > 0) {
          excessItems.push({
            bet_type: group.bet_type,
            numbers: group.numbers,
            total: group.total,
            limit,
            excess: effectiveExcess
          })
        }
      })
      return excessItems
    }

    // ─── LINE BOT CALCULATION (line-bot/index.ts) ───
    function calculateLineBotExcess() {
      const grouped = {}
      allSubmissions.forEach(sub => {
        let subNum = sub.numbers
        if (sub.bet_type === '3_tod' || sub.bet_type === '4_tod') {
          subNum = subNum.split('').sort().join('')
        }
        const key = `${sub.bet_type}|${subNum}`
        if (!grouped[key]) {
          grouped[key] = {
            bet_type: sub.bet_type,
            numbers: subNum,
            totalAmt: 0,
            submissions: []
          }
        }
        grouped[key].totalAmt += Number(sub.amount || 0)
        grouped[key].submissions.push(sub)
      })

      const excessItems = []
      for (const group of Object.values(grouped)) {
        const limitLookupBetType = group.bet_type
        const numberLimit = (numberLimitsData || []).find(nl => {
          const nlBetType = nl.bet_type === '4_set' ? '4_top' : nl.bet_type
          if (nlBetType === limitLookupBetType && nl.numbers === group.numbers) {
            return true
          }
          if (nl.include_reversed && nlBetType === limitLookupBetType && nl.reversed_numbers?.includes(group.numbers)) {
            return true
          }
          return false
        })

        const numLimit = numberLimit !== undefined ? Number(numberLimit.max_amount) : undefined
        const typeLimit = typeLimitsMap[limitLookupBetType]
        const limit = numLimit !== undefined ? numLimit : (typeLimit !== undefined ? typeLimit : 999999999)

        const alreadyTransferred = activeTransfers
          .filter(t => {
            let tNum = t.numbers
            if (t.bet_type === '3_tod' || t.bet_type === '4_tod') {
              tNum = tNum.split('').sort().join('')
            }
            return t.bet_type === limitLookupBetType && tNum === group.numbers
          })
          .reduce((sum, t) => sum + Number(t.amount || 0), 0)

        const currentExcess = group.totalAmt - limit - alreadyTransferred
        if (currentExcess > 0) {
          excessItems.push({
            bet_type: group.bet_type,
            numbers: group.numbers,
            total: group.totalAmt,
            limit,
            excess: currentExcess
          })
        }
      }
      return excessItems
    }

    const webAppItems = calculateWebAppExcess()
    const lineBotItems = calculateLineBotExcess()

    const webAppTotal = webAppItems.reduce((sum, i) => sum + i.excess, 0)
    const lineBotTotal = lineBotItems.reduce((sum, i) => sum + i.excess, 0)

    console.log('\n--- RESULTS ---')
    console.log(`Web App Excess Total: ฿${webAppTotal.toLocaleString()} (${webAppItems.length} items)`)
    console.log(`LINE Bot Excess Total: ฿${lineBotTotal.toLocaleString()} (${lineBotItems.length} items)`)
    console.log(`Difference: ฿${(webAppTotal - lineBotTotal).toLocaleString()}`)

    // Find differences per item
    console.log('\n--- ITEM-BY-ITEM DIFFERENCES ---')
    const webAppMap = new Map(webAppItems.map(i => [`${i.bet_type}|${i.numbers}`, i]))
    const lineBotMap = new Map(lineBotItems.map(i => [`${i.bet_type}|${i.numbers}`, i]))

    const allKeys = new Set([...webAppMap.keys(), ...lineBotMap.keys()])
    allKeys.forEach(key => {
      const webItem = webAppMap.get(key)
      const botItem = lineBotMap.get(key)
      const webExcess = webItem ? webItem.excess : 0
      const botExcess = botItem ? botItem.excess : 0
      if (webExcess !== botExcess) {
        console.log(`Key: ${key}`)
        console.log(`  Web App: excess = ${webExcess}, limit = ${webItem?.limit}, total = ${webItem?.total}`)
        console.log(`  LINE Bot: excess = ${botExcess}, limit = ${botItem?.limit}, total = ${botItem?.total}`)
      }
    })

  } catch (err) {
    console.error('Error in debugDiff:', err)
  }
}

debugDiff()
