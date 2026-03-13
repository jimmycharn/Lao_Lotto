import { supabase } from '../lib/supabase'

const DEVICE_TOKEN_KEY = 'lao_lotto_device_token'
const SESSION_CHECK_INTERVAL = 60000 // Check every 60 seconds

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
 * Send OTP email
 * Note: Email is now sent automatically from the database function (pg_net + Resend).
 * This client-side function is kept as a fallback via Edge Function if needed.
 * If neither works, OTP is still generated and can be verified - email just won't arrive.
 */
export async function sendOtpEmail(email, otpCode, deviceInfo) {
    // Email is sent from database via pg_net in check_and_create_device_session.
    // No client-side action needed. Return success.
    console.log('OTP email sending handled by database function (pg_net)')
    return { success: true, sent_from: 'database' }
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
 * 
 * IMPORTANT: Network/RPC errors are NOT treated as "session invalid".
 * Only an explicit { valid: false } response from the DB function counts.
 * This prevents false positives when mobile browser is backgrounded,
 * network drops temporarily, or Supabase auth token is being refreshed.
 */
export function startSessionCheck(userId, onInvalid) {
    if (!supabase || !userId) return () => {}

    const sessionToken = getDeviceToken()
    let intervalId = null
    let consecutiveInvalid = 0

    const check = async () => {
        try {
            const { data, error } = await supabase.rpc('check_session_valid', {
                p_user_id: userId,
                p_session_token: sessionToken
            })

            if (error) {
                // RPC error (network issue, auth token refresh, timeout, etc.)
                // Do NOT treat as invalid — just log and skip
                console.log('Session check RPC error (ignoring):', error.message)
                consecutiveInvalid = 0 // reset — errors are not invalid responses
                return
            }

            if (data?.valid) {
                // Session is still valid — reset counter
                consecutiveInvalid = 0
                return
            }

            // Explicit invalid response from DB
            consecutiveInvalid++
            console.log(`Session check: invalid response #${consecutiveInvalid}`, data?.reason)

            // Require 2 consecutive explicit "invalid" responses to confirm
            // (guards against a single transient DB glitch)
            if (consecutiveInvalid >= 2) {
                console.warn('Session confirmed invalid after multiple checks')
                onInvalid(data?.reason || 'session_invalidated')
                if (intervalId) clearInterval(intervalId)
            }
        } catch (err) {
            // Network-level exception — ignore, don't invalidate
            console.log('Session check network error (ignoring):', err.message)
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
