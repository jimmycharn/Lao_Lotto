import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Create client only if credentials are available
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Check if Supabase is configured
export const isSupabaseConfigured = () => !!supabase

// Role constants
export const ROLES = {
  SUPERADMIN: 'superadmin',
  DEALER: 'dealer', // เจ้ามือ
  USER: 'user' // ผู้ใช้/คนส่งโพย
}

// Helper function to get user role
export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error) return null
  return data?.role
}

// Check if user has specific role
export function hasRole(userRole, requiredRole) {
  const roleHierarchy = {
    [ROLES.SUPERADMIN]: 3,
    [ROLES.DEALER]: 2,
    [ROLES.USER]: 1
  }
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

/**
 * Fetch all rows from a Supabase query using pagination to overcome the 1000 row limit.
 * @param {Function} queryBuilder - A function that receives (from, to) range params and returns a Supabase query.
 *   Example: (from, to) => supabase.from('submissions').select('*').eq('round_id', id).range(from, to)
 * @param {number} pageSize - Number of rows per page (default 1000, max allowed by Supabase)
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function fetchAllRows(queryBuilder, pageSize = 1000) {
  let allData = []
  let from = 0
  let hasMore = true

  while (hasMore) {
    const to = from + pageSize - 1
    const { data, error } = await queryBuilder(from, to)

    if (error) {
      return { data: allData.length > 0 ? allData : null, error }
    }

    if (data && data.length > 0) {
      allData = allData.concat(data)
      if (data.length < pageSize) {
        hasMore = false
      } else {
        from += pageSize
      }
    } else {
      hasMore = false
    }
  }

  return { data: allData, error: null }
}
