import { supabase } from '../lib/supabase'

/**
 * Create a new bill with multiple submissions
 * @param {Array} submissions - Array of submission objects to insert
 * @returns {Promise<{ data: any, error: any }>}
 */
export const createBill = async (submissions) => {
    try {
        if (!submissions || submissions.length === 0) {
            throw new Error('No submissions provided')
        }

        const { data, error } = await supabase
            .from('submissions')
            .insert(submissions)
            .select()

        if (error) throw error

        return { data, error: null }
    } catch (error) {
        console.error('Error in createBill:', error)
        return { data: null, error }
    }
}

/**
 * Fetch submissions for a specific round and user
 * @param {string} roundId 
 * @param {string} userId 
 * @returns {Promise<{ data: any, error: any }>}
 */
export const fetchSubmissions = async (roundId, userId) => {
    try {
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .eq('round_id', roundId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) throw error

        return { data, error: null }
    } catch (error) {
        console.error('Error in fetchSubmissions:', error)
        return { data: null, error }
    }
}
