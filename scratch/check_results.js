import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanup() {
    try {
        console.log('Querying lottery rounds for 2026-07-14...')
        const { data: rounds, error: rErr } = await supabase
            .from('lottery_rounds')
            .select('id, round_date, lottery_type, status, winning_numbers')
            .eq('lottery_type', 'lao')
            .eq('round_date', '2026-07-14')
        
        if (rErr) throw rErr
        console.log('Rounds:', JSON.stringify(rounds, null, 2))

        console.log('Deleting from central_lottery_results...')
        const { data: d1, error: e1 } = await supabase
            .from('central_lottery_results')
            .delete()
            .eq('lottery_type', 'lao')
            .eq('round_date', '2026-07-14')
        if (e1) throw e1
        console.log('Deleted result row successfully.')

        console.log('Deleting from central_ai_search_jobs...')
        const { data: d2, error: e2 } = await supabase
            .from('central_ai_search_jobs')
            .delete()
            .eq('lottery_type', 'lao')
            .eq('round_date', '2026-07-14')
        if (e2) throw e2
        console.log('Deleted search job row successfully.')

        for (const round of (rounds || [])) {
            if (round.winning_numbers) {
                console.log(`Resetting winning_numbers to null for round ${round.id}...`)
                const { error: updErr } = await supabase
                    .from('lottery_rounds')
                    .update({ winning_numbers: null, status: 'closed', is_result_announced: false })
                    .eq('id', round.id)
                if (updErr) throw updErr
                console.log(`Round ${round.id} reset successfully.`)
            }
        }
    } catch (err) {
        console.error('Error during cleanup:', err)
    }
}

cleanup()
