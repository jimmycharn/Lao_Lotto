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
    const loadingTimerRef = useRef(null)

    // Safety: ensure loading NEVER stays true longer than 10 seconds
    useEffect(() => {
        if (loading) {
            loadingTimerRef.current = setTimeout(() => {
                console.warn('Safety timeout: forcing loading=false after 10s')
                setLoading(false)
                fetchingRef.current = false
            }, 10000)
        } else {
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current)
                loadingTimerRef.current = null
            }
        }
        return () => {
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current)
            }
        }
    }, [loading])

    // Helper to clear all Supabase auth tokens from localStorage
    const clearAuthTokens = () => {
        try {
            Object.keys(localStorage).forEach(key => {
                if (
                    (key.startsWith('sb-') && key.endsWith('-auth-token')) ||
                    key.startsWith('supabase.auth.')
                ) {
                    localStorage.removeItem(key)
                }
            })
        } catch (e) {
            // Ignore
        }
    }

    // Helper to fully reset auth state
    const clearAllAuthState = () => {
        console.warn('Clearing all auth state')
        setUser(null)
        setProfile(null)
        clearProfileCache()
        clearAuthTokens()
        fetchingRef.current = false
    }

    useEffect(() => {
        if (!supabase) {
            setLoading(false)
            return
        }

        let isMounted = true

        // Helper function to handle session on mount
        const handleSession = async () => {
            try {
                const result = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Session timeout')), 5000)
                    )
                ])
                
                if (!isMounted) return
                
                const { data: { session }, error } = result
                
                if (error || !session?.user) {
                    if (error) console.error('getSession error:', error)
                    clearAllAuthState()
                    setLoading(false)
                    return
                }

                // Check if the token is expired or about to expire
                const expiresAt = session.expires_at
                const now = Math.floor(Date.now() / 1000)
                const isExpired = expiresAt && now >= expiresAt - 30
                
                if (isExpired) {
                    console.log('Session token expired, attempting refresh...')
                    try {
                        const { data: refreshData, error: refreshError } = await Promise.race([
                            supabase.auth.refreshSession(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Refresh timeout')), 5000)
                            )
                        ])
                        
                        if (!isMounted) return
                        
                        if (refreshError || !refreshData?.session) {
                            console.warn('Token refresh failed, clearing session')
                            clearAllAuthState()
                            setLoading(false)
                            return
                        }
                        
                        console.log('Token refreshed successfully')
                        setUser(refreshData.session.user)
                        
                        const cachedProfile = getCachedProfile(refreshData.session.user.id)
                        if (cachedProfile) {
                            setProfile(cachedProfile)
                            setLoading(false)
                        }
                        fetchProfile(refreshData.session.user, !!cachedProfile)
                    } catch (refreshErr) {
                        console.warn('Token refresh timed out')
                        if (isMounted) clearAllAuthState()
                        setLoading(false)
                        return
                    }
                } else {
                    // Token is still valid
                    setUser(session.user)
                    
                    const cachedProfile = getCachedProfile(session.user.id)
                    if (cachedProfile) {
                        setProfile(cachedProfile)
                        setLoading(false)
                    }
                    fetchProfile(session.user, !!cachedProfile)
                }
            } catch (err) {
                console.warn('Auth session check failed:', err.message)
                if (isMounted) {
                    clearAllAuthState()
                    setLoading(false)
                }
            }
        }
        
        handleSession()

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!isMounted) return
                console.log('Auth event:', event)
                
                if (event === 'INITIAL_SESSION') return
                
                if (event === 'SIGNED_IN') {
                    // Reset fetchingRef to ensure profile fetch is NOT blocked
                    fetchingRef.current = false
                    setUser(session?.user ?? null)
                    if (session?.user) {
                        fetchProfile(session.user, false)
                    } else {
                        setLoading(false)
                    }
                } else if (event === 'SIGNED_OUT') {
                    clearAllAuthState()
                    setLoading(false)
                } else if (event === 'TOKEN_REFRESHED') {
                    setUser(session?.user ?? null)
                }
            }
        )

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [])

    async function fetchProfile(userOrId, hasCachedProfile = false) {
        if (!supabase || !userOrId) {
            setLoading(false)
            return
        }
        
        // Prevent duplicate fetches
        if (fetchingRef.current) {
            console.log('Profile fetch already in progress, skipping')
            return
        }
        fetchingRef.current = true

        const userId = userOrId?.id || userOrId
        const userEmail = userOrId?.email

        console.log('Fetching profile for:', userId, hasCachedProfile ? '(background)' : '')

        // Safety timeout for this specific fetch - 8 seconds max
        const fetchTimeout = setTimeout(() => {
            console.warn('fetchProfile safety timeout - forcing loading=false')
            fetchingRef.current = false
            setLoading(false)
        }, 8000)

        try {
            const { data, error } = await Promise.race([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Profile fetch timeout')), 6000)
                )
            ])

            if (error) {
                console.error('Error fetching profile:', error)

                const isAuthError = error.message?.includes('JWT') ||
                    error.message?.includes('token') ||
                    error.code === 'PGRST301' ||
                    error.code === '401' ||
                    error.code === '403'
                if (isAuthError) {
                    console.warn('Auth error fetching profile, clearing session')
                    clearAllAuthState()
                    return
                }

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
                        console.error('Failed to auto-create profile:', insertError)
                    } else {
                        console.log('Profile auto-created successfully')
                        setProfile(newProfile)
                        setCachedProfile(userId, newProfile)
                    }
                }
                return
            }
            
            if (data) {
                console.log('Profile loaded:', data.role)
                setProfile(data)
                setCachedProfile(userId, data)
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error)
        } finally {
            clearTimeout(fetchTimeout)
            fetchingRef.current = false
            setLoading(false)
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

        // Reset stale state before fresh login attempt
        fetchingRef.current = false
        setProfile(null)
        clearProfileCache()

        try {
            const { data, error } = await Promise.race([
                supabase.auth.signInWithPassword({ email, password }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Login timeout')), 10000)
                )
            ])
            return { data, error }
        } catch (err) {
            return { data: null, error: { message: err.message === 'Login timeout' ? 'การเข้าสู่ระบบใช้เวลานานเกินไป กรุณาลองใหม่' : err.message } }
        }
    }

    const signOut = async () => {
        // Clear ALL local state immediately
        clearAllAuthState()
        setLoading(false)

        if (!supabase) return { error: null }

        try {
            const signOutPromise = supabase.auth.signOut({ scope: 'local' })
            const timeoutPromise = new Promise((resolve) => 
                setTimeout(() => resolve({ error: { message: 'SignOut timeout' } }), 3000)
            )
            await Promise.race([signOutPromise, timeoutPromise])
        } catch (error) {
            console.log('SignOut error (ignoring):', error?.message || error)
        }
        // Always succeed - local state is already cleared
        return { error: null }
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
