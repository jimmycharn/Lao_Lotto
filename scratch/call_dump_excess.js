import fetch from 'node-fetch'

async function callDump() {
  try {
    const roundId = '0c8ef6d1-e763-49d8-b15a-6160e847842e'
    const res = await fetch('https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dump_round_excess', round_id: roundId })
    })

    const result = await res.json()
    console.log('=== SUMMARY ===')
    console.log('Round:', result.roundName)
    console.log('Line Bot Total:', result.lineBotTotal, '| Count:', result.lineBotCount)
    console.log('Web App Total (server sim):', result.webAppTotal, '| Count:', result.webAppCount)
    console.log('Server Diff:', result.lineBotTotal - result.webAppTotal)
    console.log('\n[NOTE] Actual web app shows 83,242 | Line bot shows 83,042')
    console.log('[NOTE] So web app FRONTEND is +200 vs what server expects')

    // Look for 2_run, 4_float, 5_float items specifically
    const botItems = result.lineBotItems || []
    const webItems = result.webAppItems || []

    console.log('\n=== 2_run items (Line Bot) ===')
    botItems.filter(i => i.bet_type === '2_run').forEach(i => console.log(`  ${i.numbers}: ${i.amount}`))
    
    console.log('\n=== 2_run items (Web App Server Sim) ===')
    webItems.filter(i => i.bet_type === '2_run').forEach(i => console.log(`  ${i.numbers}: ${i.amount}`))

    console.log('\n=== 4_float items (Line Bot) ===')
    botItems.filter(i => i.bet_type === '4_float').forEach(i => console.log(`  ${i.numbers}: ${i.amount}`))
    
    console.log('\n=== 5_float items (Line Bot) ===')
    botItems.filter(i => i.bet_type === '5_float').forEach(i => console.log(`  ${i.numbers}: ${i.amount}`))

    // Check if there are any items where normalizing numbers would change them
    // 2_run: sort digits (e.g. "31" -> "13")  
    // 4_float: sort digits (e.g. "4731" -> "1347")
    // 5_float: sort digits (e.g. "76908" -> "06789")

    console.log('\n=== All line bot items NOT in web app server sim (or with diff amount) ===')
    botItems.forEach(lb => {
      const wa = webItems.find(w => w.bet_type === lb.bet_type && w.numbers === lb.numbers)
      if (!wa || wa.amount !== lb.amount) {
        const sortedNum = lb.numbers.split('').sort().join('')
        const waWithSorted = webItems.find(w => w.bet_type === lb.bet_type && w.numbers === sortedNum)
        console.log(`  LB: ${lb.bet_type}|${lb.numbers}|${lb.amount} | sorted: ${sortedNum} | WA(sorted): ${waWithSorted ? waWithSorted.amount : 'MISSING'}`)
      }
    })

    console.log('\n=== All web app server sim items NOT in line bot (or with diff amount) ===')
    webItems.forEach(wa => {
      const lb = botItems.find(l => l.bet_type === wa.bet_type && l.numbers === wa.numbers)
      if (!lb || lb.amount !== wa.amount) {
        const sortedNum = wa.numbers.split('').sort().join('')
        const lbWithSorted = botItems.find(l => l.bet_type === wa.bet_type && l.numbers === sortedNum)
        console.log(`  WA: ${wa.bet_type}|${wa.numbers}|${wa.amount} | sorted: ${sortedNum} | LB(sorted): ${lbWithSorted ? lbWithSorted.amount : 'MISSING'}`)
      }
    })

  } catch (err) {
    console.error('Error:', err)
  }
}

callDump()
