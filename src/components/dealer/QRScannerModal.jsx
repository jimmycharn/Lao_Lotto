import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import {
    FiRotateCcw,
    FiImage,
    FiX
} from 'react-icons/fi'
import '../../pages/Dealer.css'
import '../../pages/SettingsTabs.css'

// QR Scanner Modal Component
export default function QRScannerModal({ onClose, onScanSuccess }) {
    const [error, setError] = useState(null)
    const [scanner, setScanner] = useState(null)
    const [useFrontCamera, setUseFrontCamera] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const fileInputRef = useRef(null)

    const startScanner = async (facingMode = 'environment') => {
        try {
            // Clear existing scanner if any
            const existingElement = document.getElementById('qr-reader')
            if (existingElement) {
                existingElement.innerHTML = ''
            }

            const html5QrCode = new Html5Qrcode('qr-reader')
            setScanner(html5QrCode)
            setIsScanning(true)

            await html5QrCode.start(
                { facingMode },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                (decodedText) => {
                    html5QrCode.stop().catch(() => { })
                    onScanSuccess(decodedText)
                },
                (errorMessage) => {
                    // Ignore scan errors
                }
            )
        } catch (err) {
            console.error('Scanner error:', err)
            setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้อง')
            setIsScanning(false)
        }
    }

    const stopScanner = async () => {
        if (scanner && isScanning) {
            try {
                await scanner.stop()
                setIsScanning(false)
            } catch (err) {
                console.error('Stop scanner error:', err)
            }
        }
    }

    const toggleCamera = async () => {
        await stopScanner()
        const newFacingMode = !useFrontCamera
        setUseFrontCamera(newFacingMode)
        setTimeout(() => {
            startScanner(newFacingMode ? 'user' : 'environment')
        }, 300)
    }

    const handleFileSelect = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        try {
            await stopScanner()
            const html5QrCode = new Html5Qrcode('qr-reader')
            const result = await html5QrCode.scanFile(file, true)
            onScanSuccess(result)
        } catch (err) {
            console.error('File scan error:', err)
            setError('ไม่พบ QR Code ในรูปภาพ')
            // Restart scanner after failed file scan
            setTimeout(() => {
                startScanner(useFrontCamera ? 'user' : 'environment')
            }, 500)
        }
    }

    useEffect(() => {
        // Start with back camera by default
        startScanner('environment')

        return () => {
            stopScanner()
        }
    }, [])

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            padding: 0
        }}>
            {/* Close Button - Top Right Corner */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001
                }}
            >
                <FiX size={24} />
            </button>

            <div onClick={e => e.stopPropagation()} style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem'
            }}>
                <p style={{
                    marginBottom: '1.5rem',
                    color: '#fff',
                    fontSize: '1.1rem',
                    textAlign: 'center',
                    fontWeight: '500'
                }}>
                    สแกน QR Code ของเจ้ามือที่ต้องการเชื่อมต่อ
                </p>

                {/* Scanner Container */}
                <div style={{
                    width: '100%',
                    maxWidth: '350px',
                    position: 'relative'
                }}>
                    <div id="qr-reader" style={{
                        width: '100%',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        background: '#000'
                    }}></div>
                </div>

                {/* Camera Controls */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '1rem',
                    marginTop: '1.5rem'
                }}>
                    {/* Switch Camera Button */}
                    <button
                        onClick={toggleCamera}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.875rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '12px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                        title={useFrontCamera ? 'สลับเป็นกล้องหลัง' : 'สลับเป็นกล้องหน้า'}
                    >
                        <FiRotateCcw size={20} />
                        {useFrontCamera ? 'กล้องหลัง' : 'กล้องหน้า'}
                    </button>

                    {/* Select Image Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.875rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '12px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                        title="เลือกรูป QR Code"
                    >
                        <FiImage size={20} />
                        เลือกรูป
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                </div>

                {error && (
                    <p style={{ color: '#ef4444', marginTop: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
                        {error}
                    </p>
                )}
            </div>
        </div>
    )
}
