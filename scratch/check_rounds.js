import fetch from 'node-fetch'

async function checkRounds() {
  try {
    // Get all recent rounds
    const res = await fetch('https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_rounds' })
    })
    const result = await res.json()
    
    if (result.error) {
      console.log('Error:', result.error)
      console.log('\n--- Trying dump_round_excess with hardcoded round ---')
    } else {
      console.log('Rounds found:')
      ;(result.rounds || []).forEach(r => {
        console.log(`  ${r.id} | ${r.lottery_name} | ${r.lottery_type} | ${r.status} | ${r.round_date || r.draw_date}`)
      })
    }

    // Check the specific round the user is seeing
    // Try the round from previous call
    const roundId = '0c8ef6d1-e763-49d8-b15a-6160e847842e'
    const res2 = await fetch('https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dump_round_excess', round_id: roundId })
    })
    const result2 = await res2.json()
    console.log('\n=== Round Details ===')
    console.log('Round:', result2.roundName, '| ID:', roundId)
    console.log('Line Bot Total:', result2.lineBotTotal, '| Count:', result2.lineBotCount)
    console.log('Web App Total:', result2.webAppTotal, '| Count:', result2.webAppCount)
    console.log('Diff:', (result2.lineBotTotal || 0) - (result2.webAppTotal || 0))

  } catch (err) {
    console.error('Error:', err)
  }
}

checkRounds()
