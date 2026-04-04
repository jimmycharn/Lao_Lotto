import { Component } from 'react'
import './ErrorBoundary.css'

class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo)

        // Prevent infinite reload loops by checking session storage
        const RELOAD_KEY = 'chunk_load_error_reloaded'
        
        // Auto-reload to fetch new chunks if the app was recently updated
        const isChunkLoadFailed = error?.message?.match(/Failed to fetch dynamically imported module/i) || 
                                 error?.name === 'ChunkLoadError' ||
                                 error?.message?.match(/Importing a module script failed/i)
                                 
        if (isChunkLoadFailed) {
            const hasReloaded = sessionStorage.getItem(RELOAD_KEY)
            if (!hasReloaded) {
                console.log('App update detected (Chunk Load Error). Automatically reloading to fetch new files...')
                sessionStorage.setItem(RELOAD_KEY, 'true')
                window.location.reload(true)
                return
            }
        } else {
            // Clear the flag to allow future reloads if a different error occurs and is dismissed
            sessionStorage.removeItem(RELOAD_KEY)
        }
    }

    handleReload = () => {
        window.location.reload()
    }

    handleGoHome = () => {
        window.location.href = '/'
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-boundary-card">
                        <div className="error-boundary-icon">⚠️</div>
                        <h1 className="error-boundary-title">เกิดข้อผิดพลาด</h1>
                        <p className="error-boundary-message">
                            ขออภัย เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง
                        </p>
                        {this.state.error && (
                            <details style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.75rem', color: '#999', maxHeight: '150px', overflow: 'auto' }}>
                                <summary>รายละเอียด Error</summary>
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {this.state.error.toString()}
                                    {this.state.error.stack && '\n\n' + this.state.error.stack}
                                </pre>
                            </details>
                        )}
                        <div className="error-boundary-actions">
                            <button className="error-boundary-btn primary" onClick={this.handleReload}>
                                🔄 ลองใหม่
                            </button>
                            <button className="error-boundary-btn secondary" onClick={this.handleGoHome}>
                                🏠 กลับหน้าหลัก
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
