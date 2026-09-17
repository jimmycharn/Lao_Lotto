import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  // Find thai round on 2026-09-16
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

  console.log('Rounds found:', rounds.map(r => ({ id: r.id, round_date: r.round_date, status: r.status, winning_numbers: r.winning_numbers, is_result_announced: r.is_result_announced })))

  const round = rounds.find(r => r.round_date === '2026-09-16' || (r.winning_numbers && JSON.stringify(r.winning_numbers).includes('730640'))) || rounds[0]
  console.log('Using round:', round.id, round.round_date, round.winning_numbers)

  // Find user "พี่แพร"
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .ilike('full_name', '%แพร%')

  console.log('Profiles found:', profiles)
  const prae = profiles?.[0]
  if (!prae) {
    console.log('No profile found with name แพร')
    return
  }

  // Fetch submissions for this user in this round
  let allSubs = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data: subs, error: sErr } = await supabase
      .from('submissions')
      .select('*')
      .eq('round_id', round.id)
      .eq('user_id', prae.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (sErr) {
      console.error('Error fetching subs:', sErr)
      break
    }
    if (!subs || subs.length === 0) break
    allSubs.push(...subs)
    if (subs.length < pageSize) break
    from += pageSize
  }

  console.log(`Total active submissions for ${prae.full_name}:`, allSubs.length)

  const dbWinners = allSubs.filter(s => s.is_winner)
  console.log(`DB is_winner == true count:`, dbWinners.length)
  console.log(`DB total prize_amount:`, dbWinners.reduce((sum, s) => sum + Number(s.prize_amount || 0), 0))
  console.log('DB winners details:', dbWinners.map(s => ({ id: s.id, bet_type: s.bet_type, numbers: s.numbers, amount: s.amount, prize: s.prize_amount, is_winner: s.is_winner })))
}

run()
