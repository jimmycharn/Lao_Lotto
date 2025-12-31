import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, ROLES } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!supabase) {
            setLoading(false)
            return
        }

        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            if (session?.user) {
                fetchProfile(session.user)
            } else {
                setLoading(false)
            }
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setUser(session?.user ?? null)
                if (session?.user) {
                    await fetchProfile(session.user)
                } else {
                    setProfile(null)
                    setLoading(false)
                }
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    async function fetchProfile(userOrId) {
        if (!supabase || !userOrId) {
            setLoading(false)
            return
        }

        // Handle both user object and userId string
        const userId = userOrId?.id || userOrId
        const userEmail = userOrId?.email

        console.log('Fetching profile for:', userId)

        try {
            // Add a timeout to the profile fetch to prevent hanging
            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
            )

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise])

            if (error) {
                console.error('Error fetching profile:', error)

                // If profile doesn't exist (PGRST116) and we have email, try to create it
                if (error.code === 'PGRST116' && userEmail) {
                    console.log('Profile not found, attempting to auto-create...')
                    const newProfile = {
                        id: userId,
                        email: userEmail,
                        full_name: userOrId.user_metadata?.full_name || userEmail.split('@')[0],
                        role: 'user',
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
                        return
                    }
                }
            } else if (data) {
                console.log('Profile loaded:', data.role)
                setProfile(data)
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error)
        } finally {
            setLoading(false)
        }
    }

    const signUp = async (email, password, fullName, dealerId = null) => {
        if (!supabase) return { data: null, error: { message: 'Supabase not configured' } }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    dealer_id: dealerId || null
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
        isConfigured: !!supabase
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
