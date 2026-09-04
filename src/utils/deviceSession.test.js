import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    getDeviceToken,
    getDeviceInfo,
    approveLoginRequest,
    rejectLoginRequest,
    getPendingLoginRequest,
    subscribeToLoginRequests,
    checkDeviceSession
} from './deviceSession.js'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => {
    return {
        supabase: {
            rpc: vi.fn(),
            channel: vi.fn(),
            removeChannel: vi.fn(),
            from: vi.fn()
        }
    }
})

let store = {}
globalThis.localStorage = {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, val) => { store[key] = String(val) }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
}

if (!globalThis.navigator) {
    globalThis.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
}

describe('deviceSession - Multi-Device Login Approval & PIN System', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        store = {}
    })

    it('getDeviceToken generates and persists a valid token in localStorage', () => {
        const token1 = getDeviceToken()
        expect(token1).toBeDefined()
        expect(typeof token1).toBe('string')
        expect(token1.length).toBeGreaterThan(10)

        // Second call should return the exact same persisted token
        const token2 = getDeviceToken()
        expect(token2).toBe(token1)
    })

    it('getDeviceInfo returns a formatted string containing browser and OS', () => {
        const info = getDeviceInfo()
        expect(typeof info).toBe('string')
        expect(info.length).toBeGreaterThan(3)
    })

    it('approveLoginRequest invokes approve_login_request RPC with correct params and broadcasts', async () => {
        const mockChannel = { send: vi.fn() }
        supabase.channel.mockReturnValue(mockChannel)
        supabase.rpc.mockResolvedValue({ data: { success: true, session_created: true }, error: null })

        const result = await approveLoginRequest('req-123', 'user-abc')
        expect(supabase.rpc).toHaveBeenCalledWith('approve_login_request', {
            p_request_id: 'req-123',
            p_user_id: 'user-abc'
        })
        expect(result.success).toBe(true)
        expect(supabase.channel).toHaveBeenCalledWith('user_login_sync_user-abc')
        expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'LOGIN_DECISION',
            payload: expect.objectContaining({ requestId: 'req-123', status: 'approved' })
        })
    })

    it('rejectLoginRequest invokes reject_login_request RPC with correct params and broadcasts', async () => {
        const mockChannel = { send: vi.fn() }
        supabase.channel.mockReturnValue(mockChannel)
        supabase.rpc.mockResolvedValue({ data: { success: true, rejected: true }, error: null })

        const result = await rejectLoginRequest('req-456', 'user-def')
        expect(supabase.rpc).toHaveBeenCalledWith('reject_login_request', {
            p_request_id: 'req-456',
            p_user_id: 'user-def'
        })
        expect(result.success).toBe(true)
        expect(supabase.channel).toHaveBeenCalledWith('user_login_sync_user-def')
        expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'LOGIN_DECISION',
            payload: expect.objectContaining({ requestId: 'req-456', status: 'rejected' })
        })
    })

    it('getPendingLoginRequest queries get_pending_login_request RPC', async () => {
        supabase.rpc.mockResolvedValue({
            data: {
                has_pending: true,
                request_id: 'req-789',
                device_info: 'Chrome on Windows'
            },
            error: null
        })

        const result = await getPendingLoginRequest('user-xyz')
        expect(supabase.rpc).toHaveBeenCalledWith('get_pending_login_request', {
            p_user_id: 'user-xyz'
        })
        expect(result.has_pending).toBe(true)
        expect(result.request_id).toBe('req-789')
    })

    it('subscribeToLoginRequests sets up channel and returns unsubscribe function', () => {
        const channelMock = {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis()
        }
        supabase.channel.mockReturnValue(channelMock)

        const onPending = vi.fn()
        const onStatus = vi.fn()
        const unsub = subscribeToLoginRequests('user-xyz', {
            onPendingRequest: onPending,
            onStatusChange: onStatus
        })

        expect(supabase.channel).toHaveBeenCalledWith('user_login_sync_user-xyz')
        expect(channelMock.on).toHaveBeenCalledWith(
            'postgres_changes',
            expect.objectContaining({ event: 'INSERT', table: 'login_otp_requests' }),
            expect.any(Function)
        )
        expect(channelMock.on).toHaveBeenCalledWith(
            'postgres_changes',
            expect.objectContaining({ event: 'UPDATE', table: 'login_otp_requests' }),
            expect.any(Function)
        )
        expect(channelMock.subscribe).toHaveBeenCalled()

        unsub()
        expect(supabase.removeChannel).toHaveBeenCalledWith(channelMock)
    })

    it('checkDeviceSession sends NEW_LOGIN_ATTEMPT broadcast when needs_otp is true', async () => {
        const mockChannel = { send: vi.fn() }
        supabase.channel.mockReturnValue(mockChannel)
        supabase.rpc.mockResolvedValue({
            data: {
                needs_otp: true,
                otp_request_id: 'req-999',
                otp_code: '123456',
                email: 'test@example.com'
            },
            error: null
        })

        const result = await checkDeviceSession('user-login-test')
        expect(result.needs_otp).toBe(true)
        expect(supabase.channel).toHaveBeenCalledWith('user_login_sync_user-login-test')
        expect(mockChannel.send).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'NEW_LOGIN_ATTEMPT',
            payload: expect.objectContaining({ request_id: 'req-999' })
        })
    })
})
