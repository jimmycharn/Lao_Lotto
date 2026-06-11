import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkRounds() {
    try {
        console.log(`Checking lottery rounds...`)
        const { data: rounds, error } = await supabase
            .from('lottery_rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10)
        
        if (error) throw error
        console.log('Rounds:', JSON.stringify(rounds, null, 2))
    } catch (err) {
        console.error('Error:', err)
    }
}

checkRounds()
