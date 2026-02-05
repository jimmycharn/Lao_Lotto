import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase, ROLES } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

// Cache keys for localStorage
const PROFILE_CACHE_KEY = 'lao_lotto_profile_cache'
const PROFILE_CACHE_EXPIRY = 5 * 60 * 1000 // 5 minutes

// Get cached profile from localStorage
function getCachedProfile(userId) {
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_KEY)
        if (cached) {
            const { profile, timestamp, uid } = JSON.parse(cached)
            if (uid === userId && Date.now() - timestamp < PROFILE_CACHE_EXPIRY) {
                return profile
            }
        }
    } catch (e) {
        // Ignore cache errors
    }
    return null
}

// Save profile to localStorage cache
function setCachedProfile(userId, profile) {
    try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
            profile,
            timestamp: Date.now(),
            uid: userId
        }))
    } catch (e) {
        // Ignore cache errors
    }
}

// Clear profile cache
function clearProfileCache() {
    try {
        localStorage.removeItem(PROFILE_CACHE_KEY)
    } catch (e) {
        // Ignore
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const fetchingRef = useRef(false)

    useEffect(() => {
        if (!supabase) {
            setLoading(false)
            return
        }

        let isMounted = true
        let profileFetched = false
        
        // Timeout to prevent infinite loading - just stop loading, don't clear session
        const loadingTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn('Auth loading timeout - stopping loading spinner')
                setLoading(false)
                fetchingRef.current = false // Reset fetching ref to prevent stuck state
                // Don't clear auth tokens - just stop the loading state
                // User can still use the app, auth will retry on next action
            }
        }, 5000) // 5 second timeout - reduced for better UX

        // Get initial session with error handling
        supabase.auth.getSession()
            .then(async ({ data: { session }, error }) => {
                clearTimeout(loadingTimeout)
                if (!isMounted) return
                
                if (error) {
                    console.error('getSession error:', error)
                    setLoading(false)
                    return
                }
                
                if (session?.user) {
                    setUser(session.user)
                    
                    // Try to use cached profile first for instant UI
                    const cachedProfile = getCachedProfile(session.user.id)
                    if (cachedProfile) {
                        setProfile(cachedProfile)
                        setLoading(false) // Show UI immediately with cached data
                    }
                    
                    profileFetched = true
                    // Fetch fresh profile in background (will update if different)
                    await fetchProfile(session.user, !!cachedProfile)
                } else {
                    setLoading(false)
                }
            })
            .catch((err) => {
                clearTimeout(loadingTimeout)
                console.error('getSession failed:', err)
                if (isMounted) {
                    setLoading(false)
                    // Don't clear auth - just stop loading
                    // Network errors shouldn't logout the user
                }
            })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!isMounted) return
                console.log('Auth event:', event)
                
                // Skip initial session - already handled above
                if (event === 'INITIAL_SESSION') return
                
                if (event === 'SIGNED_IN' && !profileFetched) {
                    setUser(session?.user ?? null)
                    setLoading(true)
                    await fetchProfile(session.user)
                    profileFetched = true
                } else if (event === 'SIGNED_OUT') {
                    setUser(null)
                    setProfile(null)
                    setLoading(false)
                    profileFetched = false
                } else if (event === 'TOKEN_REFRESHED') {
                    setUser(session?.user ?? null)
                }
            }
        )

        return () => {
            isMounted = false
            clearTimeout(loadingTimeout)
            subscription.unsubscribe()
        }
    }, [])

    async function fetchProfile(userOrId, hasCachedProfile = false) {
        if (!supabase || !userOrId) {
            setLoading(false)
            return
        }
        
        // Prevent duplicate fetches - but still set loading false if needed
        if (fetchingRef.current) {
            console.log('Profile fetch already in progress, skipping')
            // Still need to set loading false if we're waiting
            if (!hasCachedProfile) {
                setTimeout(() => setLoading(false), 100)
            }
            return
        }
        fetchingRef.current = true

        // Handle both user object and userId string
        const userId = userOrId?.id || userOrId
        const userEmail = userOrId?.email

        console.log('Fetching profile for:', userId, hasCachedProfile ? '(background refresh)' : '')

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (error) {
                console.error('Error fetching profile:', error)

                // If profile doesn't exist (PGRST116) and we have email, try to create it
                if (error.code === 'PGRST116' && userEmail) {
                    console.log('Profile not found, attempting to auto-create...')
                    const newProfile = {
                        id: userId,
                        email: userEmail,
                        full_name: userOrId.user_metadata?.full_name || userEmail.split('@')[0],
                        role: userOrId.user_metadata?.role || 'user',
                        balance: 0,
                        dealer_id: userOrId.user_metadata?.dealer_id || null
                    }

                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert([newProfile])

                    if (insertError) {
                        console.error("Failed to auto-create profile:", insertError)
                    } else {
                        console.log('Profile auto-created successfully')
                        setProfile(newProfile)
                    }
                }
                // setLoading(false) is handled in finally block
                return
            }
            
            if (data) {
                console.log('Profile loaded:', data.role)
                setProfile(data)
                // Cache the profile for faster refresh
                setCachedProfile(userId, data)
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error)
        } finally {
            fetchingRef.current = false
            // Only set loading false if we didn't already have cached data
            if (!hasCachedProfile) {
                setLoading(false)
            }
        }
    }

    const signUp = async (email, password, fullName, dealerId = null, role = 'user') => {
        if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    dealer_id: dealerId || null,
                    role: role // Pass role to be used in profile creation
                }
            }
        })
        return { data, error }
    }

    const signIn = async (email, password) => {
        if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })
        return { data, error }
    }

    const signOut = async () => {
        // Force clear local state immediately to ensure UI updates
        setUser(null)
        setProfile(null)
        
        // Clear profile cache
        clearProfileCache()

        // Manually clear Supabase tokens from localStorage to prevent auto-login on refresh
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key)
            }
        })

        if (!supabase) return { error: null }

        try {
            const { error } = await supabase.auth.signOut()
            return { error }
        } catch (error) {
            console.error("Error signing out:", error)
            return { error }
        }
    }

    const value = {
        user,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        isAuthenticated: !!user,
        isSuperAdmin: profile?.role === ROLES.SUPERADMIN,
        isDealer: profile?.role === ROLES.DEALER,
        isUser: profile?.role === ROLES.USER,
        isConfigured: !!supabase,
        isDealerActive: profile?.role === ROLES.DEALER ? profile?.is_active !== false : true,
        isAccountSuspended: profile?.is_active === false
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
