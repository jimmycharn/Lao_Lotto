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

    // ---- Mouse / HTML5 Drag ----
    const handleDragStart = useCallback((index) => {
        setDragState({ dragging: true, fromIndex: index, overIndex: index })
    }, [])

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault()
        setDragState(prev => ({ ...prev, overIndex: index }))
    }, [])

    const handleDragEnd = useCallback(() => {
        setDragState(prev => {
            if (prev.fromIndex !== null && prev.overIndex !== null && prev.fromIndex !== prev.overIndex) {
                setItems(prevItems => {
                    const newItems = [...prevItems]
                    const [moved] = newItems.splice(prev.fromIndex, 1)
                    newItems.splice(prev.overIndex, 0, moved)
                    return newItems
                })
            }
            return { dragging: false, fromIndex: null, overIndex: null }
        })
    }, [setItems])

    // ---- Touch (mobile) ----
    const handleTouchStart = useCallback((e, index) => {
        touchStartY.current = e.touches[0].clientY
        touchStartIndex.current = index
        isDraggingTouch.current = false

        // Long press to start drag (300ms)
        longPressTimer.current = setTimeout(() => {
            isDraggingTouch.current = true
            setDragState({ dragging: true, fromIndex: index, overIndex: index })
            // Prevent scrolling
            if (e.cancelable) e.preventDefault()
        }, 300)
    }, [])

    const handleTouchMove = useCallback((e) => {
        if (!isDraggingTouch.current) {
            // If moved too much before long press fires, cancel
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
                setDragState(prev => ({ ...prev, overIndex: i }))
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
                if (prev.fromIndex !== null && prev.overIndex !== null && prev.fromIndex !== prev.overIndex) {
                    setItems(prevItems => {
                        const newItems = [...prevItems]
                        const [moved] = newItems.splice(prev.fromIndex, 1)
                        newItems.splice(prev.overIndex, 0, moved)
                        return newItems
                    })
                }
                return { dragging: false, fromIndex: null, overIndex: null }
            })
        }

        isDraggingTouch.current = false
        touchStartY.current = null
        touchStartIndex.current = null
    }, [setItems])

    // Set ref for a row element
    const setRowRef = useCallback((index, el) => {
        rowRefs.current[index] = el
    }, [])

    return {
        dragState,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        setRowRef,
    }
}
