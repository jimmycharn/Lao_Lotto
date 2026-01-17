import { createContext, useContext, useState, useCallback } from 'react'
import '../components/Toast.css'

const ToastContext = createContext({})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, message, type }])
        
        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id))
            }, duration)
        }
        
        return id
    }, [])

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const toast = {
        success: (message, duration) => addToast(message, 'success', duration),
        error: (message, duration) => addToast(message, 'error', duration ?? 5000),
        warning: (message, duration) => addToast(message, 'warning', duration),
        info: (message, duration) => addToast(message, 'info', duration),
    }

    return (
        <ToastContext.Provider value={{ toast, removeToast }}>
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
                </div>
            ))}
        </div>
    )
}
