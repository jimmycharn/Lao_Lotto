import { supabase } from '../lib/supabase'

const DEVICE_TOKEN_KEY = 'lao_lotto_device_token'
const SESSION_CHECK_INTERVAL = 30000 // Check every 30 seconds

/**
 * Get or create a unique device token for this browser
 */
export function getDeviceToken() {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY)
    if (!token) {
        token = crypto.randomUUID ? crypto.randomUUID() : generateUUID()
        localStorage.setItem(DEVICE_TOKEN_KEY, token)
    }
    return token
}

/**
 * Get device info string from user agent
 */
export function getDeviceInfo() {
    const ua = navigator.userAgent
    let device = 'Unknown'

    if (/iPhone|iPad|iPod/.test(ua)) {
        device = 'iOS'
    } else if (/Android/.test(ua)) {
        device = 'Android'
    } else if (/Windows/.test(ua)) {
        device = 'Windows'
    } else if (/Mac/.test(ua)) {
        device = 'macOS'
    } else if (/Linux/.test(ua)) {
        device = 'Linux'
    }

    let browser = 'Unknown'
    if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = 'Chrome'
    else if (/Firefox/.test(ua)) browser = 'Firefox'
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
    else if (/Edge/.test(ua)) browser = 'Edge'

    return `${browser} on ${device}`
}

/**
 * Check if the current device has an active session, or if OTP is needed
 * Returns: { needs_otp, otp_request_id, blocked, blocked_until, session_created }
 */
export async function checkDeviceSession(userId) {
    if (!supabase || !userId) return { needs_otp: false, session_created: false }

    const sessionToken = getDeviceToken()
    const deviceInfo = getDeviceInfo()

    const { data, error } = await supabase.rpc('check_and_create_device_session', {
        p_user_id: userId,
        p_session_token: sessionToken,
        p_device_info: deviceInfo,
        p_ip_address: null // IP is not easily accessible from client
    })

    if (error) {
        console.error('checkDeviceSession error:', error)
        // If error, allow login (don't block user due to session check failure)
        return { needs_otp: false, session_created: false, error: error.message }
    }

    return data
}

/**
 * Send OTP email via Edge Function
 */
export async function sendOtpEmail(email, otpCode, deviceInfo) {
    if (!supabase) return { success: false, error: 'Supabase not configured' }

    try {
        const { data, error } = await supabase.functions.invoke('send-otp-email', {
            body: {
                email,
                otp_code: otpCode,
                device_info: deviceInfo || getDeviceInfo()
            }
        })

        if (error) {
            console.error('sendOtpEmail error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, ...data }
    } catch (err) {
        console.error('sendOtpEmail exception:', err)
        return { success: false, error: err.message }
    }
}

/**
 * Verify OTP code
 */
export async function verifyDeviceOtp(otpRequestId, otpCode, userId) {
    if (!supabase) return { success: false, error: 'Supabase not configured' }

    const { data, error } = await supabase.rpc('verify_device_otp', {
        p_otp_request_id: otpRequestId,
        p_otp_code: otpCode,
        p_user_id: userId
    })

    if (error) {
        console.error('verifyDeviceOtp error:', error)
        return { success: false, error: error.message }
    }

    return data
}

/**
 * Invalidate current device session (on logout)
 */
export async function invalidateSession(userId) {
    if (!supabase || !userId) return

    const sessionToken = getDeviceToken()

    try {
        await supabase.rpc('invalidate_device_session', {
            p_user_id: userId,
            p_session_token: sessionToken
        })
    } catch (err) {
        console.error('invalidateSession error:', err)
    }
}

/**
 * Subscribe to session invalidation via Supabase Realtime
 * Returns unsubscribe function
 */
export function subscribeToSessionChanges(userId, onInvalidated) {
    if (!supabase || !userId) return () => {}

    const sessionToken = getDeviceToken()

    const channel = supabase
        .channel(`device_session_${userId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'device_sessions',
                filter: `user_id=eq.${userId}`
            },
            (payload) => {
                const newRecord = payload.new
                // If our session was invalidated
                if (newRecord.session_token === sessionToken && !newRecord.is_active) {
                    console.log('Session invalidated:', newRecord.invalidated_reason)
                    onInvalidated(newRecord.invalidated_reason)
                }
            }
        )
        .subscribe()

    return () => {
        supabase.removeChannel(channel)
    }
}

/**
 * Start periodic session validity check
 * Returns cleanup function
 */
export function startSessionCheck(userId, onInvalid) {
    if (!supabase || !userId) return () => {}

    const sessionToken = getDeviceToken()
    let intervalId = null

    const check = async () => {
        try {
            const { data, error } = await supabase.rpc('check_session_valid', {
                p_user_id: userId,
                p_session_token: sessionToken
            })

            if (error || !data?.valid) {
                console.log('Session no longer valid')
                onInvalid(data?.reason || 'unknown')
                if (intervalId) clearInterval(intervalId)
            }
        } catch (err) {
            console.error('Session check error:', err)
        }
    }

    intervalId = setInterval(check, SESSION_CHECK_INTERVAL)

    return () => {
        if (intervalId) clearInterval(intervalId)
    }
}

// Fallback UUID generator
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}
