import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import '../components/Toast.css'

const ToastContext = createContext({})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((message, type = 'info', durationOrOptions = 3000) => {
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, message, type }])
        
        let duration = typeof durationOrOptions === 'object' && durationOrOptions !== null
            ? durationOrOptions.duration
            : durationOrOptions

        if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) {
            duration = type === 'error' ? 5000 : 3500
        }
        
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
        
        return id
    }, [])

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const toast = useMemo(() => ({
        success: (message, duration) => addToast(message, 'success', duration),
        error: (message, duration) => addToast(message, 'error', duration ?? 5000),
        warning: (message, duration) => addToast(message, 'warning', duration),
        info: (message, duration) => addToast(message, 'info', duration),
        loading: (message) => addToast(message, 'info', 60000),
        dismiss: (id) => { if (id) removeToast(id) },
    }), [addToast, removeToast])

    const value = useMemo(() => ({ toast, removeToast }), [toast, removeToast])

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    )
}

function ToastContainer({ toasts, removeToast }) {
    if (toasts.length === 0) return null

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
                    <span className="toast-icon">
                        {t.type === 'success' && '✓'}
                        {t.type === 'error' && '✕'}
                        {t.type === 'warning' && '⚠'}
                        {t.type === 'info' && 'ℹ'}
                    </span>
                    <span className="toast-message">{t.message}</span>
                    <button
                        type="button"
                        className="toast-close"
                        onClick={(e) => {
                            e.stopPropagation()
                            removeToast(t.id)
                        }}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    )
}
