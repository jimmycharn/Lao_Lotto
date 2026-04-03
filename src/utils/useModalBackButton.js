import { useEffect, useRef } from 'react'

// Global flag to track programmatic history.back() calls to prevent React 18 
// Strict Mode or manual close from immediately triggering the popstate listener.
let programmaticPop = false;

/**
 * useModalBackButton
 *
 * Hook สำหรับให้ปุ่ม Back บนมือถือ (Android / browser) ปิด modal แทนการ navigate ย้อนกลับ
 */
export function useModalBackButton(isOpen, onClose) {
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return

        // Push a dummy history entry เพื่อ intercept ปุ่ม back
        window.history.pushState({ modalOpen: true }, '')

        const handlePopState = () => {
            if (programmaticPop) {
                // Event นี้มาจากการเรียก window.history.back() ของเราเอง
                programmaticPop = false;
                return;
            }
            onCloseRef.current?.()
        }

        window.addEventListener('popstate', handlePopState)

        return () => {
            window.removeEventListener('popstate', handlePopState)

            // ถ้า modal ถูกปิดโดยไม่ใช่ปุ่ม back (เช่น กด X หรือ React Strict Mode Unmount)
            if (window.history.state?.modalOpen) {
                programmaticPop = true;
                window.history.go(-1)

                // Safety reset เผื่อในกรณีที่ popstate ไม่ทำงาน
                setTimeout(() => {
                    programmaticPop = false;
                }, 100);
            }
        }
    }, [isOpen])
}
