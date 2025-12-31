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
