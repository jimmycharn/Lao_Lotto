import { useEffect, useRef } from 'react'

/**
 * useModalBackButton
 *
 * Hook สำหรับให้ปุ่ม Back บนมือถือ (Android / browser) ปิด modal แทนการ navigate ย้อนกลับ
 *
 * วิธีใช้:
 *   useModalBackButton(isOpen, onClose)
 *
 * หลักการทำงาน:
 *   - เมื่อ modal เปิด  → push history state เข้า stack เพื่อให้มี entry ไว้รับ popstate
 *   - เมื่อกดปุ่ม back → browser fire `popstate` → เรียก onClose() ปิด modal
 *   - เมื่อ modal ปิดผ่านปุ่ม X → cleanup ลบ listener และ pop history entry
 *     เพื่อไม่ให้เหลือ entry ค้างใน stack
 */
export function useModalBackButton(isOpen, onClose) {
    // ใช้ ref เก็บ onClose เพื่อไม่ให้ต้อง re-subscribe ทุกครั้ง onClose reference เปลี่ยน
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return

        // Push a dummy history entry เพื่อ intercept ปุ่ม back
        window.history.pushState({ modalOpen: true }, '')

        const handlePopState = () => {
            onCloseRef.current?.()
        }

        window.addEventListener('popstate', handlePopState)

        return () => {
            window.removeEventListener('popstate', handlePopState)

            // ถ้า modal ถูกปิดโดยไม่ใช่ปุ่ม back (เช่น กด X)
            // history stack ยังมี entry ที่เราเพิ่มอยู่ → ลบออก
            // ตรวจสอบว่า entry บน stack ยังเป็น modal entry อยู่ไหม
            if (window.history.state?.modalOpen) {
                // go(-1) จะ fire popstate แต่ listener ถูก remove แล้ว → ปลอดภัย
                window.history.go(-1)
            }
        }
    }, [isOpen])
}
