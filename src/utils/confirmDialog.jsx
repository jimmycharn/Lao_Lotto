import { useEffect, useState, useRef } from 'react'
import './confirmDialog.css'

// Module-level bridge between imperative API and React host
let setHostState = null
let pendingResolve = null

/**
 * Show a styled confirm dialog.
 * Usage:
 *   const ok = await confirmDialog('ต้องการลบ?')
 *   const ok = await confirmDialog({ title, message, confirmText, cancelText, variant })
 *
 * variant: 'danger' (default, red) | 'primary' (green) | 'warning' (amber)
 */
export function confirmDialog(input) {
    const options = typeof input === 'string' ? { message: input } : (input || {})

    return new Promise((resolve) => {
        // If host isn't mounted yet, fall back to native confirm so we never block silently
        if (!setHostState) {
            try {
                // eslint-disable-next-line no-alert
                resolve(window.confirm(options.message || ''))
            } catch {
                resolve(false)
            }
            return
        }

        // If a previous promise is still open, resolve it as false first
        if (pendingResolve) {
            try { pendingResolve(false) } catch { /* ignore */ }
            pendingResolve = null
        }

        pendingResolve = resolve
        setHostState({
            open: true,
            title: options.title || 'ยืนยันการดำเนินการ',
            message: options.message || '',
            confirmText: options.confirmText || 'ยืนยัน',
            cancelText: options.cancelText || 'ยกเลิก',
            variant: options.variant || 'danger',
        })
    })
}

const INITIAL_STATE = {
    open: false,
    title: '',
    message: '',
    confirmText: 'ยืนยัน',
    cancelText: 'ยกเลิก',
    variant: 'danger',
}

export function ConfirmDialogHost() {
    const [state, setState] = useState(INITIAL_STATE)
    const confirmBtnRef = useRef(null)

    useEffect(() => {
        setHostState = setState
        return () => {
            if (setHostState === setState) setHostState = null
        }
    }, [])

    const close = (result) => {
        if (pendingResolve) {
            const r = pendingResolve
            pendingResolve = null
            try { r(result) } catch { /* ignore */ }
        }
        setState((s) => ({ ...s, open: false }))
    }

    // Keyboard: Esc = cancel, Enter = confirm
    useEffect(() => {
        if (!state.open) return
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                close(false)
            } else if (e.key === 'Enter') {
                e.preventDefault()
                close(true)
            }
        }
        window.addEventListener('keydown', onKey)
        // Autofocus confirm button
        const t = setTimeout(() => confirmBtnRef.current?.focus(), 50)
        return () => {
            window.removeEventListener('keydown', onKey)
            clearTimeout(t)
        }
    }, [state.open])

    if (!state.open) return null

    const lines = String(state.message).split('\n').filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''))

    return (
        <div className="cdlg-overlay" onClick={() => close(false)} role="dialog" aria-modal="true">
            <div className="cdlg-card" onClick={(e) => e.stopPropagation()}>
                {state.title && <h3 className="cdlg-title">{state.title}</h3>}
                <div className="cdlg-message">
                    {lines.length === 0 ? (
                        <p>&nbsp;</p>
                    ) : (
                        lines.map((line, i) => <p key={i}>{line || '\u00A0'}</p>)
                    )}
                </div>
                <div className="cdlg-buttons">
                    <button
                        type="button"
                        className="cdlg-btn cdlg-btn-cancel"
                        onClick={() => close(false)}
                    >
                        {state.cancelText}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        type="button"
                        className={`cdlg-btn cdlg-btn-confirm cdlg-${state.variant}`}
                        onClick={() => close(true)}
                    >
                        {state.confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default confirmDialog
