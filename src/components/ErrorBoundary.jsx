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
