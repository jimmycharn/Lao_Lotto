import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

describe('Global Modal Back Button Manager', () => {
    let mockHistoryState = null
    let popstateListeners = []
    let useModalBackButtonModule

    beforeEach(async () => {
        vi.useFakeTimers()
        popstateListeners = []
        mockHistoryState = {}

        // Mock window and document for node environment
        globalThis.window = {
            location: {
                hash: '',
                href: 'http://localhost/dealer'
            },
            addEventListener: vi.fn((event, cb) => {
                if (event === 'popstate') popstateListeners.push(cb)
            }),
            removeEventListener: vi.fn((event, cb) => {
                if (event === 'popstate') {
                    popstateListeners = popstateListeners.filter(fn => fn !== cb)
                }
            }),
            dispatchEvent: vi.fn((event) => {
                if (event.type === 'popstate') {
                    popstateListeners.forEach(fn => fn(event))
                }
            }),
            history: {
                pushState: vi.fn((state, title, url) => {
                    mockHistoryState = state
                    if (url) globalThis.window.location.hash = url
                }),
                back: vi.fn(() => {
                    globalThis.window.location.hash = ''
                    // Trigger popstate as a real browser would
                    const event = { type: 'popstate', state: mockHistoryState }
                    popstateListeners.forEach(fn => fn(event))
                })
            }
        }

        globalThis.document = {
            body: {
                appendChild: vi.fn(),
                removeChild: vi.fn()
            },
            querySelectorAll: vi.fn(() => [])
        }

        // Fresh import
        vi.resetModules()
        useModalBackButtonModule = await import('../useModalBackButton')
        useModalBackButtonModule.resetModalStackForTesting()
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
        vi.restoreAllMocks()
        delete globalThis.window
        delete globalThis.document
    })

    it('pushes a dummy history state with URL hash when a modal is registered', () => {
        const { registerModal, getModalStackCount } = useModalBackButtonModule
        const closeFn = vi.fn()
        const entry = registerModal(closeFn)

        expect(getModalStackCount()).toBe(1)
        expect(globalThis.window.history.pushState).toHaveBeenCalledWith(
            expect.objectContaining({ modalId: entry.id, appModal: true }),
            '',
            `#modal-${entry.id}`
        )
        expect(globalThis.window.location.hash).toBe(`#modal-${entry.id}`)
    })

    it('closes the top modal when Android back button (popstate) is triggered', () => {
        const { registerModal, getModalStackCount } = useModalBackButtonModule
        const closeFn = vi.fn()
        registerModal(closeFn)

        expect(getModalStackCount()).toBe(1)

        // User presses Android Back button -> browser dispatches popstate
        globalThis.window.dispatchEvent({ type: 'popstate' })

        expect(closeFn).toHaveBeenCalledTimes(1)
        expect(getModalStackCount()).toBe(0)
    })

    it('handles nested / stacked modals in LIFO order (last in, first out)', () => {
        const { registerModal, getModalStackCount } = useModalBackButtonModule
        const closeModal1 = vi.fn()
        const closeModal2 = vi.fn()

        registerModal(closeModal1) // Modal 1 (e.g. SubmissionsModal)
        registerModal(closeModal2) // Modal 2 (e.g. nested ConfirmDialog)

        expect(getModalStackCount()).toBe(2)

        // First Android Back press -> closes Modal 2
        globalThis.window.dispatchEvent({ type: 'popstate' })
        expect(closeModal2).toHaveBeenCalledTimes(1)
        expect(closeModal1).not.toHaveBeenCalled()
        expect(getModalStackCount()).toBe(1)

        // Second Android Back press -> closes Modal 1
        globalThis.window.dispatchEvent({ type: 'popstate' })
        expect(closeModal1).toHaveBeenCalledTimes(1)
        expect(getModalStackCount()).toBe(0)
    })

    it('rewinds history programmatically after delay when modal is closed via UI ([X] button)', () => {
        const { registerModal, unregisterModal, getModalStackCount } = useModalBackButtonModule
        const closeFn = vi.fn()
        const entry = registerModal(closeFn)

        expect(getModalStackCount()).toBe(1)

        // User clicks [X] button -> component unmounts -> calls unregisterModal
        unregisterModal(entry)

        expect(getModalStackCount()).toBe(0)
        // Before delay, history.back should not have been called yet (protecting against StrictMode remount)
        expect(globalThis.window.history.back).not.toHaveBeenCalled()

        // Advance timer by 60ms
        vi.advanceTimersByTime(60)

        expect(globalThis.window.history.back).toHaveBeenCalledTimes(1)
        // Ensure closeFn was NOT called again because it was closed by UI
        expect(closeFn).not.toHaveBeenCalled()
    })

    it('protects against React Strict Mode double invocation without popping history prematurely', () => {
        const { registerModal, unregisterModal, getModalStackCount } = useModalBackButtonModule
        const closeFn1 = vi.fn()
        const closeFn2 = vi.fn()

        // 1. Initial mount (StrictMode)
        const entry1 = registerModal(closeFn1)
        expect(getModalStackCount()).toBe(1)
        expect(globalThis.window.history.pushState).toHaveBeenCalledTimes(1)

        // 2. StrictMode immediate unmount (effect cleanup)
        unregisterModal(entry1)
        expect(getModalStackCount()).toBe(0)
        // History.back not called immediately
        expect(globalThis.window.history.back).not.toHaveBeenCalled()

        // 3. StrictMode immediate remount (< 1ms later)
        const entry2 = registerModal(closeFn2)
        expect(getModalStackCount()).toBe(1)
        // Should reuse the existing history entry, NOT push again
        expect(globalThis.window.history.pushState).toHaveBeenCalledTimes(1)

        // Even after time passes, history.back should NEVER have been called!
        vi.advanceTimersByTime(100)
        expect(globalThis.window.history.back).not.toHaveBeenCalled()

        // 4. Now user presses Back button -> should close entry2 smoothly
        globalThis.window.dispatchEvent({ type: 'popstate' })
        expect(closeFn2).toHaveBeenCalledTimes(1)
        expect(getModalStackCount()).toBe(0)
    })

    it('does NOT call history.back() if modal was already closed by popstate (prevents double-pop/exiting app)', () => {
        const { registerModal, unregisterModal } = useModalBackButtonModule
        const closeFn = vi.fn()
        const entry = registerModal(closeFn)

        // 1. User presses Android Back
        globalThis.window.dispatchEvent({ type: 'popstate' })
        expect(closeFn).toHaveBeenCalledTimes(1)

        // 2. Component unmounts in React and calls unregisterModal in cleanup
        unregisterModal(entry)

        // Advance timer
        vi.advanceTimersByTime(100)

        // history.back should NOT have been called programmatically
        expect(globalThis.window.history.back).not.toHaveBeenCalled()
    })

    it('triggers close action for DOM modal overlay on Back press', () => {
        const { registerModal, getModalStackCount } = useModalBackButtonModule

        const closeBtnSpy = vi.fn()
        const mockOverlay = {
            nodeType: 1,
            classList: { contains: (cls) => cls === 'modal-overlay' },
            querySelector: vi.fn((sel) => {
                if (sel.includes('modal-close')) {
                    return { click: closeBtnSpy }
                }
                return null
            }),
            querySelectorAll: vi.fn(() => []),
            isConnected: true
        }

        // Simulate registering a DOM overlay
        registerModal(() => {
            const closeBtn = mockOverlay.querySelector('.modal-close')
            if (closeBtn) closeBtn.click()
        }, mockOverlay, false)

        expect(getModalStackCount()).toBe(1)

        // User presses Android Back
        globalThis.window.dispatchEvent({ type: 'popstate' })

        expect(closeBtnSpy).toHaveBeenCalledTimes(1)
        expect(getModalStackCount()).toBe(0)
    })
})
