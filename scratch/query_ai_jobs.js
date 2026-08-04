import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkJobs() {
    try {
        console.log(`Checking central_ai_search_jobs...`)
        const { data: jobs, error: err1 } = await supabase
            .from('central_ai_search_jobs')
            .select('*')
            .eq('lottery_type', 'thai')
        
        if (err1) throw err1
        console.log('Jobs in DB:', JSON.stringify(jobs, null, 2))

        console.log(`Checking lottery_rounds...`)
        const { data: results, error: err2 } = await supabase
            .from('lottery_rounds')
            .select('*')
            .eq('lottery_type', 'thai')
        
        if (err2) throw err2
        console.log('Results in DB:', JSON.stringify(results, null, 2))
    } catch (err) {
        console.error('Error:', err)
    }
}

checkJobs()
