import { useEffect, useRef } from 'react'

/**
 * Global Modal Back Button Manager
 *
 * จัดการประวัติ (History Stack) และปุ่ม Back บนมือถือ (เช่น Android Gesture / Hardware Back)
 * เพื่อให้การกด Back บนมือถือหรือเบราว์เซอร์เป็นการปิด Modal หน้าต่างบนสุดเสมอ
 * แทนการปิดแอปพลิเคชันหรือเปลี่ยนหน้าเว็บโดยไม่ตั้งใจ
 */

// Stack เก็บรายการ Modal ที่เปิดอยู่ เรียงลำดับจากเก่าไปใหม่ (LIFO: ตัวบนสุดปิดก่อน)
// แต่ละรายการ: { id, close: Function, element: HTMLElement | null, closedByPopState: boolean, isHook: boolean, hash: string }
export const modalStack = []

// ตัวนับการเรียก history.back() ทางโปรแกรม (เมื่อปิดด้วยปุ่ม X หรือ backdrop)
// เพื่อไม่ให้ popstate listener เข้าใจผิดว่าผู้ใช้กดปุ่ม Back
let programmaticPopCount = 0

// Counter สำหรับสร้าง unique id
let idCounter = 0

let isObserverInitialized = false
let popstateListenerAttached = false

// เก็บ timer สำหรับ programmatic history.back() เพื่อรองรับ React Strict Mode / Rapid Remount
let pendingBackTimer = null
let pendingBackEntry = null

/**
 * จัดการเหตุการณ์ popstate เมื่อผู้ใช้กดปุ่ม Back บนมือถือ / Browser
 */
function handlePopState(e) {
    // ล้าง pending back timer ถ้ามี
    if (pendingBackTimer) {
        clearTimeout(pendingBackTimer)
        pendingBackTimer = null
        pendingBackEntry = null
    }

    if (programmaticPopCount > 0) {
        programmaticPopCount--
        return
    }

    if (modalStack.length > 0) {
        // ดึง Modal ตัวบนสุดออกมาปิด
        const topModal = modalStack.pop()
        topModal.closedByPopState = true

        try {
            topModal.close()
        } catch (err) {
            console.error('[ModalBackButton] Error closing modal:', err)
        }
    }
}

/**
 * ตรวจสอบและผูก listener popstate บน window (ผูกครั้งเดียว)
 */
function ensurePopstateListener() {
    if (typeof window === 'undefined' || popstateListenerAttached) return
    window.addEventListener('popstate', handlePopState)
    popstateListenerAttached = true
}

/**
 * ลงทะเบียน Modal เข้าสู่ Stack พร้อม push URL hash (#modal-...)
 * การใช้ hash (#modal-...) มีความสำคัญมากสำหรับ Android Chrome / PWA
 * เพราะ Android จะไม่ปิดแอปเมื่อ URL มี hash แต่จะถอย hash กลับมาก่อนเสมอ
 */
export function registerModal(closeFn, element = null, isHook = false) {
    if (typeof window === 'undefined') return null

    ensurePopstateListener()

    // หากมี pending back timer (เช่น จาก React Strict Mode unmount ชั่วคราว)
    // ให้ยกเลิก timer ทันที และนำประวัติเดิมกลับมาใช้ต่อ โดยไม่ต้อง push ซ้ำ
    if (pendingBackTimer) {
        clearTimeout(pendingBackTimer)
        pendingBackTimer = null
        const reusedEntry = pendingBackEntry
        pendingBackEntry = null

        if (reusedEntry) {
            const entry = {
                id: reusedEntry.id,
                close: closeFn,
                element,
                closedByPopState: false,
                isHook,
                hash: reusedEntry.hash
            }
            modalStack.push(entry)
            return entry
        }
    }

    const id = `modal_${++idCounter}_${Date.now()}`
    const targetHash = `#modal-${id}`

    // Push dummy history entry with hash เพื่อ intercept ปุ่ม back บน Android PWA และ Browser
    try {
        window.history.pushState({ modalId: id, appModal: true }, '', targetHash)
    } catch (err) {
        console.warn('[ModalBackButton] pushState failed:', err)
    }

    const entry = {
        id,
        close: closeFn,
        element,
        closedByPopState: false,
        isHook,
        hash: targetHash
    }

    modalStack.push(entry)
    return entry
}

/**
 * ดำเนินการย้อนประวัติกลับจริงเพื่อลบ hash ออก
 */
function executeHistoryBack() {
    pendingBackTimer = null
    pendingBackEntry = null

    if (typeof window === 'undefined') return

    try {
        // ตรวจสอบว่ายังมี hash #modal ค้างอยู่หรือไม่
        const currentHash = window.location?.hash || ''
        if (currentHash.startsWith('#modal')) {
            programmaticPopCount++
            window.history.back()

            // Safety reset เผื่อในกรณีที่ popstate ไม่ยิงกลับมา
            setTimeout(() => {
                if (programmaticPopCount > 0) {
                    programmaticPopCount--
                }
            }, 300)
        }
    } catch (err) {
        console.warn('[ModalBackButton] history.back failed:', err)
        if (programmaticPopCount > 0) programmaticPopCount--
    }
}

/**
 * ปลดการลงทะเบียน Modal เมื่อถูกปิดหรือ unmount
 */
export function unregisterModal(entryOrId) {
    if (!entryOrId || typeof window === 'undefined') return

    const id = typeof entryOrId === 'string' ? entryOrId : entryOrId.id
    const index = modalStack.findIndex(item => item.id === id)

    let removed = null
    if (index !== -1) {
        [removed] = modalStack.splice(index, 1)
    } else if (typeof entryOrId === 'object' && entryOrId) {
        removed = entryOrId
    }

    if (!removed) return

    // ถ้า Modal นี้ถูกปิดผ่านการกดปุ่ม Back (popstate)
    // ตัว Browser ได้ถอยประวัติกลับเองแล้ว ไม่ต้องเรียก history.back() ซ้ำ
    if (removed.closedByPopState) {
        return
    }

    // ถ้า Modal ปิดผ่าน UI (เช่น กด X, backdrop, cancel)
    // จำเป็นต้องลบ dummy hash entry ที่เคย push ไว้ออก
    // หน่วงเวลาเล็กน้อย (50ms) เผื่อกรณี React Strict Mode unmount/remount ทันที
    if (pendingBackTimer) {
        clearTimeout(pendingBackTimer)
        executeHistoryBack()
    }

    pendingBackEntry = removed
    pendingBackTimer = setTimeout(() => {
        executeHistoryBack()
    }, 50)
}

/**
 * useModalBackButton: React Hook สำหรับ Component Modal ที่ต้องการผูกกับปุ่ม Back แบบเจาะจง
 *
 * @param {boolean} isOpen - สถานะการเปิดของ modal
 * @param {Function} onClose - ฟังก์ชันสำหรับสั่งปิด modal
 */
export function useModalBackButton(isOpen, onClose) {
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    const entryRef = useRef(null)

    useEffect(() => {
        if (!isOpen) {
            if (entryRef.current) {
                unregisterModal(entryRef.current)
                entryRef.current = null
            }
            return
        }

        const handleClose = () => {
            onCloseRef.current?.()
        }

        entryRef.current = registerModal(handleClose, null, true)

        return () => {
            if (entryRef.current) {
                unregisterModal(entryRef.current)
                entryRef.current = null
            }
        }
    }, [isOpen])
}

/**
 * ตรวจสอบว่า element เป็น Modal Overlay หรือไม่
 */
function isModalOverlayElement(el) {
    if (!el || el.nodeType !== (typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1)) return false
    const classList = el.classList
    if (!classList) return false

    return (
        classList.contains('modal-overlay') ||
        classList.contains('write-modal-overlay') ||
        classList.contains('confirm-dialog-overlay') ||
        classList.contains('swal2-container') ||
        el.getAttribute?.('role') === 'dialog'
    )
}

/**
 * พยายามปิด Modal Overlay ในระดับ DOM
 */
function triggerDomModalClose(overlay) {
    if (!overlay || (typeof overlay.isConnected === 'boolean' && !overlay.isConnected)) return

    // 1. ค้นหาปุ่มปิดมาตรฐาน
    const closeBtn = overlay.querySelector(
        '.modal-close, .close-btn, .write-modal-close, button[aria-label="close"], button[aria-label="Close"], button[title*="ปิด"], button[title*="Close"]'
    )
    if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click()
        return
    }

    // 2. ค้นหาปุ่ม "ยกเลิก" / "Cancel"
    const buttons = Array.from(overlay.querySelectorAll('button, .btn'))
    const cancelBtn = buttons.find(b => {
        const text = (b.textContent || '').trim().toLowerCase()
        return text === 'ยกเลิก' || text === 'cancel' || text === 'ปิด' || text === 'close'
    })
    if (cancelBtn && typeof cancelBtn.click === 'function') {
        cancelBtn.click()
        return
    }

    // 3. Fallback: คลิกที่ overlay (backdrop click)
    if (typeof overlay.click === 'function') {
        overlay.click()
    }
}

// แผนที่เก็บ element -> modalEntry สำหรับ DOM observer
const domModalMap = new WeakMap()

/**
 * initGlobalModalBackButton: เปิดใช้งานตัวตรวจจับ Modal Overlay ใน DOM อัตโนมัติ
 * ทำให้ Modal ทุกหน้าต่างในแอป (แม้จะไม่ได้เรียก useModalBackButton โดยตรง)
 * รองรับการกดปุ่ม Back บนมือถือทันที
 */
export function initGlobalModalBackButton() {
    if (typeof window === 'undefined' || typeof document === 'undefined' || isObserverInitialized) {
        return
    }

    ensurePopstateListener()
    isObserverInitialized = true

    // สแกน element ที่อาจมีอยู่แล้วหรือเพิ่มเข้ามาใหม่
    const checkAndRegisterElement = (el) => {
        if (!isModalOverlayElement(el)) return
        // ถ้า Modal นี้ถูกผูกผ่าน hook แล้ว (data-modal-managed="hook") หรือลงทะเบียนแล้ว ให้ข้าม
        const managed = el.getAttribute?.('data-modal-managed')
        if (managed || domModalMap.has(el)) return

        el.setAttribute('data-modal-managed', 'dom')

        const entry = registerModal(
            () => triggerDomModalClose(el),
            el,
            false
        )

        if (entry) {
            domModalMap.set(el, entry)
        }
    }

    const checkAndUnregisterElement = (el) => {
        if (!isModalOverlayElement(el)) return
        const entry = domModalMap.get(el)
        if (entry) {
            domModalMap.delete(el)
            unregisterModal(entry)
        }
    }

    // MutationObserver ตรวจจับการเพิ่ม/ลบ Modal Overlay ใน body
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // โหนดที่ถูกเพิ่มเข้ามา
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    checkAndRegisterElement(node)
                    // ตรวจสอบภายใน subtree เผื่อ overlay ถูกหุ้มอยู่ข้างใน
                    const innerOverlays = node.querySelectorAll?.(
                        '.modal-overlay, .write-modal-overlay, [role="dialog"]'
                    )
                    if (innerOverlays) {
                        innerOverlays.forEach(checkAndRegisterElement)
                    }
                }
            }

            // โหนดที่ถูกลบออกไป
            for (const node of mutation.removedNodes) {
                if (node.nodeType === 1) {
                    checkAndUnregisterElement(node)
                    const innerOverlays = node.querySelectorAll?.(
                        '.modal-overlay, .write-modal-overlay, [role="dialog"]'
                    )
                    if (innerOverlays) {
                        innerOverlays.forEach(checkAndUnregisterElement)
                    }
                }
            }
        }
    })

    observer.observe(document.body, {
        childList: true,
        subtree: true
    })

    // ตรวจสอบ overlay ที่อาจเปิดอยู่ตั้งแต่เริ่มต้น
    const existing = document.querySelectorAll(
        '.modal-overlay, .write-modal-overlay, .confirm-dialog-overlay, [role="dialog"]'
    )
    existing.forEach(checkAndRegisterElement)

    return observer
}

/**
 * สำหรับทดสอบ Unit Test
 */
export function getModalStackCount() {
    return modalStack.length
}

export function resetModalStackForTesting() {
    modalStack.length = 0
    programmaticPopCount = 0
    idCounter = 0
    if (pendingBackTimer) {
        clearTimeout(pendingBackTimer)
        pendingBackTimer = null
        pendingBackEntry = null
    }
}
