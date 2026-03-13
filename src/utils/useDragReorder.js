import { useRef, useState, useCallback } from 'react'

/**
 * Hook for drag-and-drop reordering of a list.
 * Supports both mouse (desktop) and touch (mobile).
 *
 * Usage:
 *   const { dragState, handleDragStart, handleDragOver, handleDragEnd, handleTouchStart, handleTouchMove, handleTouchEnd } = useDragReorder(items, setItems)
 *
 * Attach to each draggable row:
 *   draggable
 *   onDragStart={() => handleDragStart(index)}
 *   onDragOver={(e) => handleDragOver(e, index)}
 *   onDragEnd={handleDragEnd}
 *   onTouchStart={(e) => handleTouchStart(e, index)}
 *   onTouchMove={handleTouchMove}
 *   onTouchEnd={handleTouchEnd}
 */
export function useDragReorder(items, setItems) {
    const [dragState, setDragState] = useState({ dragging: false, fromIndex: null, overIndex: null })
    const touchStartY = useRef(null)
    const touchStartIndex = useRef(null)
    const rowRefs = useRef([])
    const longPressTimer = useRef(null)
    const isDraggingTouch = useRef(false)
    const wasDraggedRef = useRef(false)
    const didReorderRef = useRef(false)
    const fromIndexRef = useRef(null)

    // Reorder: remove item at fromIdx, insert at toIdx (others shift down)
    const doReorder = useCallback((fromIdx, toIdx) => {
        if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
        if (didReorderRef.current) return
        didReorderRef.current = true
        wasDraggedRef.current = true
        setItems(prevItems => {
            const newArr = [...prevItems]
            const [moved] = newArr.splice(fromIdx, 1)
            newArr.splice(toIdx, 0, moved)
            return newArr
        })
    }, [setItems])

    // ---- Mouse / HTML5 Drag ----
    const handleDragStart = useCallback((e, index) => {
        wasDraggedRef.current = false
        didReorderRef.current = false
        fromIndexRef.current = index
        setDragState({ dragging: true, fromIndex: index, overIndex: index })
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move'
        }
    }, [])

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        setDragState(prev => {
            if (prev.overIndex === index) return prev
            return { ...prev, overIndex: index }
        })
    }, [])

    const handleDrop = useCallback((e, index) => {
        e.preventDefault()
        doReorder(fromIndexRef.current, index)
        setDragState({ dragging: false, fromIndex: null, overIndex: null })
    }, [doReorder])

    const handleDragEnd = useCallback(() => {
        // Fallback: if onDrop didn't fire (dropped outside valid target)
        if (!didReorderRef.current) {
            // No reorder happened, just reset
        }
        setDragState({ dragging: false, fromIndex: null, overIndex: null })
        fromIndexRef.current = null
    }, [])

    // Prevent onClick from firing after a drag
    const shouldAllowClick = useCallback(() => {
        if (wasDraggedRef.current) {
            wasDraggedRef.current = false
            return false
        }
        return true
    }, [])

    // ---- Touch (mobile) ----
    const handleTouchStart = useCallback((e, index) => {
        touchStartY.current = e.touches[0].clientY
        touchStartIndex.current = index
        isDraggingTouch.current = false
        wasDraggedRef.current = false
        didReorderRef.current = false
        fromIndexRef.current = index

        // Long press to start drag (300ms)
        longPressTimer.current = setTimeout(() => {
            isDraggingTouch.current = true
            setDragState({ dragging: true, fromIndex: index, overIndex: index })
        }, 300)
    }, [])

    const handleTouchMove = useCallback((e) => {
        if (!isDraggingTouch.current) {
            if (longPressTimer.current) {
                const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
                if (dy > 10) {
                    clearTimeout(longPressTimer.current)
                    longPressTimer.current = null
                }
            }
            return
        }

        if (e.cancelable) e.preventDefault()

        const touch = e.touches[0]
        const elements = rowRefs.current
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i]
            if (!el) continue
            const rect = el.getBoundingClientRect()
            if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                setDragState(prev => {
                    if (prev.overIndex === i) return prev
                    return { ...prev, overIndex: i }
                })
                break
            }
        }
    }, [])

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }

        if (isDraggingTouch.current) {
            setDragState(prev => {
                doReorder(prev.fromIndex, prev.overIndex)
                return { dragging: false, fromIndex: null, overIndex: null }
            })
        }

        isDraggingTouch.current = false
        touchStartY.current = null
        touchStartIndex.current = null
        fromIndexRef.current = null
    }, [doReorder])

    // Set ref for a row element
    const setRowRef = useCallback((index, el) => {
        rowRefs.current[index] = el
    }, [])

    return {
        dragState,
        handleDragStart,
        handleDragOver,
        handleDrop,
        handleDragEnd,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        setRowRef,
        shouldAllowClick,
    }
}
