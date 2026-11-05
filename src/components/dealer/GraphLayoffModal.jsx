import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
    FiX,
    FiPlus,
    FiTrash2,
    FiEdit2,
    FiScissors,
    FiSend,
    FiBarChart2,
    FiCheck,
    FiRotateCcw,
    FiChevronUp,
    FiChevronDown
} from 'react-icons/fi'
import {
    getNumberDomainForCategory,
    mapBetTypeToCategory,
    groupItemsByNumber,
    evaluateLineCut,
    calculateGraphCuts,
    aggregateStagedLayoffItems,
    getAvailableItemsAfterStaging,
    getGraphBetTypesByCategory,
    isBetTypeMatchingFilter,
    sortBasketItems
} from '../../utils/graphLayoffCalculator'
import './GraphLayoffModal.css'

const BET_TYPE_DISPLAY_MAP = {
    '3_top': '3 ตัวบน',
    '3_straight': '3 ตัวตรง',
    '3_tod': '3 ตัวโต๊ด',
    '3_bottom': '3 ตัวล่าง',
    '3_front': '3 ตัวหน้า',
    '2_top': '2 ตัวบน',
    '2_bottom': '2 ตัวล่าง',
    '2_front': '2 ตัวหน้า',
    '2_center': '2 ตัวถ่าง',
    '2_spread': '2 ตัวถ่าง',
    '2_run': '2 ตัวลอย',
    'run_top': 'ลอยบน',
    'run_bottom': 'ลอยล่าง',
    'front_top_1': 'ปักหน้าบน',
    'middle_top_1': 'ปักกลางบน',
    'back_top_1': 'ปักหลังบน',
    'front_bottom_1': 'ปักหน้าล่าง',
    'back_bottom_1': 'ปักหลังล่าง',
    'pak_top': 'ปักบน',
    'pak_bottom': 'ปักล่าง'
}

export default function GraphLayoffModal({
    isOpen = false,
    onClose = () => {},
    round = {},
    sourceTab = 'excess', // 'excess' | 'remaining'
    items = [],
    initialBasket = [],
    initialLines = null,
    initialCategory = '3_digit',
    onProceedToTransfer = () => {}
}) {

    // 1. Number Category Tab ('3_digit' | '2_digit' | 'run') and Specific Bet Type
    const [activeCategory, setActiveCategory] = useState(initialCategory || '3_digit')
    const [selectedBetTypeByCategory, setSelectedBetTypeByCategory] = useState({
        '3_digit': '3_top',
        '2_digit': '2_top',
        'run': 'run_top'
    })
    const [openDropdownCategory, setOpenDropdownCategory] = useState(null)
    const dropdownContainerRef = useRef(null)

    // Bet type options for each category
    const betTypeOptionsByCategory = useMemo(() => {
        return {
            '3_digit': getGraphBetTypesByCategory('3_digit', round?.lottery_type, items),
            '2_digit': getGraphBetTypesByCategory('2_digit', round?.lottery_type, items),
            'run': getGraphBetTypesByCategory('run', round?.lottery_type, items)
        }
    }, [round?.lottery_type, items])

    const activeBetType = selectedBetTypeByCategory[activeCategory] || '3_top'

    // Close dropdown on outside click or escape
    useEffect(() => {
        if (!openDropdownCategory) return
        function handleOutsideClick(e) {
            if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target)) {
                setOpenDropdownCategory(null)
            }
        }
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                setOpenDropdownCategory(null)
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        document.addEventListener('touchstart', handleOutsideClick)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick)
            document.removeEventListener('touchstart', handleOutsideClick)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [openDropdownCategory])

    // 2. Lines State (Up to 2 lines)
    // Default initial line: 1 line at 500
    const [lines, setLines] = useState(initialLines || [
        { id: 1, value: 500, color: '#ef4444' }
    ])
    const [selectedLineId, setSelectedLineId] = useState(1)
    const [draggingLineId, setDraggingLineId] = useState(null)
    const [editingLineModal, setEditingLineModal] = useState(null) // { lineId, value }

    // 3. Cut Conditions
    // When 1 line: 'above' | 'below'
    // When 2 lines: 'between' | 'outside'
    const [cutMode, setCutMode] = useState('above')
    // Amount mode: 'difference' (ส่วนต่าง) | 'full' (เต็มจำนวน)
    const [amountMode, setAmountMode] = useState('difference')

    // 4. Staging Basket
    const [stagedBasket, setStagedBasket] = useState(initialBasket || [])
    const [isBasketExpanded, setIsBasketExpanded] = useState((initialBasket && initialBasket.length > 0) ? true : false)
    const [basketSortBy, setBasketSortBy] = useState('number') // 'number' | 'amount'
    const [basketSortOrder, setBasketSortOrder] = useState('asc') // 'asc' | 'desc'

    // 5. Tooltip & Cursor tracking
    const [hoveredNumberInfo, setHoveredNumberInfo] = useState(null)
    const [canvasCursor, setCanvasCursor] = useState('default')

    // 6. Window resize tracking for responsive canvas redraw
    const [, setResizeTick] = useState(0)
    useEffect(() => {
        if (!isOpen) return
        const handleResize = () => setResizeTick(t => t + 1)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [isOpen])

    // Canvas references
    const canvasRef = useRef(null)
    const containerRef = useRef(null)

    const currencySymbol = round?.currency_symbol || '฿'

    // 1. Original buckets and max original amount for stable Y-axis scaling
    const originalBuckets = useMemo(() => {
        return groupItemsByNumber(items, activeCategory, activeBetType)
    }, [items, activeCategory, activeBetType])

    const maxOriginalAmount = useMemo(() => {
        let max = 0
        Object.values(originalBuckets).forEach(b => {
            if (b.totalAmount > max) max = b.totalAmount
        })
        return max
    }, [originalBuckets])

    // 2. Available items deducting already staged basket items
    const availableItems = useMemo(() => {
        return getAvailableItemsAfterStaging(items, stagedBasket)
    }, [items, stagedBasket])

    // Fast lookup for amount per bet type to display in dropdown options
    const amountByBetType = useMemo(() => {
        const map = {}
        if (!Array.isArray(availableItems)) return map
        availableItems.forEach(item => {
            if (!item || !item.bet_type) return
            const amt = Number(item.excess ?? item.remainingAmount ?? item.totalAmount ?? 0)
            if (amt <= 0) return

            const itemCategory = mapBetTypeToCategory(item.bet_type)
            if (!itemCategory) return

            const opts = betTypeOptionsByCategory[itemCategory] || []
            opts.forEach(opt => {
                if (isBetTypeMatchingFilter(item.bet_type, opt.id)) {
                    map[opt.id] = (map[opt.id] || 0) + amt
                }
            })
        })
        return map
    }, [availableItems, betTypeOptionsByCategory])

    // 3. Domain & Active Buckets after staging deduction
    const domain = useMemo(() => getNumberDomainForCategory(activeCategory), [activeCategory])
    const buckets = useMemo(() => {
        return groupItemsByNumber(availableItems, activeCategory, activeBetType)
    }, [availableItems, activeCategory, activeBetType])

    // Determine upper/lower/single lines
    const sortedLines = useMemo(() => {
        return [...lines].sort((a, b) => b.value - a.value)
    }, [lines])

    const singleLineVal = lines.length === 1 ? lines[0].value : 0
    const upperLineVal = lines.length >= 2 ? sortedLines[0].value : 0
    const lowerLineVal = lines.length >= 2 ? sortedLines[1].value : 0

    // Derive effective cutMode based on current line count
    const effectiveCutMode = useMemo(() => {
        if (lines.length === 1) {
            return (cutMode === 'above' || cutMode === 'below') ? cutMode : 'above'
        }
        if (lines.length === 2) {
            return (cutMode === 'between' || cutMode === 'outside') ? cutMode : 'between'
        }
        return cutMode
    }, [lines.length, cutMode])

    // Live preview calculation of cuts
    const cutSummary = useMemo(() => {
        return calculateGraphCuts({
            buckets,
            lineCount: lines.length,
            singleLine: singleLineVal,
            upperLine: upperLineVal,
            lowerLine: lowerLineVal,
            cutMode: effectiveCutMode,
            amountMode
        })
    }, [buckets, lines.length, singleLineVal, upperLineVal, lowerLineVal, effectiveCutMode, amountMode])

    // Basket Grand Total
    const totalStagedAmount = useMemo(() => {
        return stagedBasket.reduce((sum, item) => sum + (Number(item.excess) || 0), 0)
    }, [stagedBasket])

    // Add a second line
    const handleAddLine = useCallback(() => {
        if (lines.length >= 2) return
        const existingIds = lines.map(l => l.id)
        const newId = existingIds.includes(1) ? 2 : 1
        const newColor = newId === 1 ? '#ef4444' : '#3b82f6'

        let defaultVal = 200
        if (lines.length === 1) {
            const firstVal = lines[0].value
            defaultVal = firstVal > 200 ? Math.round(firstVal * 0.5) : firstVal + 200
        } else if (maxOriginalAmount > 0) {
            defaultVal = Math.round(maxOriginalAmount * 0.5)
        }

        setLines(prev => [...prev, { id: newId, value: Math.max(10, defaultVal), color: newColor }])
        setSelectedLineId(newId)
    }, [lines, maxOriginalAmount])

    // Remove a line
    const handleRemoveLine = useCallback((lineId) => {
        setLines(prev => prev.filter(l => l.id !== lineId))
        if (selectedLineId === lineId) {
            setSelectedLineId(null)
        }
    }, [selectedLineId])

    // Update exact price from modal
    const handleSaveExactLineValue = useCallback(() => {
        if (!editingLineModal) return
        const numVal = Math.max(1, Math.round(Number(editingLineModal.value) || 0))
        setLines(prev => prev.map(l => l.id === editingLineModal.lineId ? { ...l, value: numVal } : l))
        setEditingLineModal(null)
    }, [editingLineModal])

    // Add current cuts into Staging Basket
    const handleAddToBasket = useCallback(() => {
        if (!cutSummary.cutItems || cutSummary.cutItems.length === 0) return
        setStagedBasket(prev => aggregateStagedLayoffItems(prev, cutSummary.cutItems))
        setIsBasketExpanded(true)
    }, [cutSummary])

    // Sort items in Staging Basket
    const sortedBasketItems = useMemo(() => {
        return sortBasketItems(stagedBasket, basketSortBy, basketSortOrder)
    }, [stagedBasket, basketSortBy, basketSortOrder])

    // Toggle sorting column or direction
    const handleToggleBasketSort = useCallback((colKey) => {
        if (basketSortBy === colKey) {
            setBasketSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setBasketSortBy(colKey)
            setBasketSortOrder(colKey === 'number' ? 'asc' : 'desc')
        }
    }, [basketSortBy])

    // Remove single item from basket by identity
    const handleRemoveBasketItem = useCallback((itemToRemove) => {
        if (!itemToRemove) return
        setStagedBasket(prev => prev.filter(item => {
            return !(item.bet_type === itemToRemove.bet_type && item.numbers === itemToRemove.numbers)
        }))
    }, [])

    // Clear entire basket
    const handleClearBasket = useCallback(() => {
        if (stagedBasket.length === 0) return
        setStagedBasket([])
    }, [stagedBasket.length])

    // Keyboard listener for Delete / Backspace to remove selected line
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                return
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLineId !== null) {
                if (lines.length > 0) {
                    handleRemoveLine(selectedLineId)
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedLineId, lines.length, handleRemoveLine])

    // Canvas Plot Geometry Helpers
    const getPlotGeometry = useCallback((canvas) => {
        const padding = { top: 30, right: 40, bottom: 40, left: 65 }
        const w = canvas.clientWidth || 800
        const h = canvas.clientHeight || 420
        const plotW = Math.max(10, w - padding.left - padding.right)
        const plotH = Math.max(10, h - padding.top - padding.bottom)

        const lineValues = lines.map(l => l.value)
        const yMax = Math.max(maxOriginalAmount, ...lineValues, 100) * 1.15

        const getY = (amount) => padding.top + plotH - (amount / yMax) * plotH
        const getAmountFromY = (y) => {
            const clampedY = Math.max(padding.top, Math.min(padding.top + plotH, y))
            const ratio = (padding.top + plotH - clampedY) / plotH
            return Math.max(0, Math.round(ratio * yMax))
        }
        const slotW = plotW / domain.length

        return { padding, w, h, plotW, plotH, yMax, getY, getAmountFromY, slotW }
    }, [lines, maxOriginalAmount, domain.length])

    // Draw Canvas Chart
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext?.('2d')
        if (!ctx) return

        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
        const { padding, w, h, plotW, plotH, yMax, getY, slotW } = getPlotGeometry(canvas)

        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr)
            canvas.height = Math.round(h * dpr)
        }

        ctx.save()
        ctx.scale(dpr, dpr)

        // 1. Background
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, w, h)

        // 2. Y-Axis Grid Lines & Labels
        const ySteps = 5
        ctx.lineWidth = 1
        ctx.strokeStyle = '#1e293b'
        ctx.fillStyle = '#94a3b8'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'

        for (let i = 0; i <= ySteps; i++) {
            const stepVal = Math.round((yMax / ySteps) * i)
            const yPos = getY(stepVal)

            ctx.beginPath()
            ctx.moveTo(padding.left, yPos)
            ctx.lineTo(padding.left + plotW, yPos)
            ctx.stroke()

            ctx.fillText(
                `${currencySymbol}${stepVal >= 1000 ? (stepVal / 1000).toFixed(1) + 'k' : stepVal}`,
                padding.left - 8,
                yPos
            )
        }

        // 3. X-Axis Baseline & Ticks
        ctx.strokeStyle = '#475569'
        ctx.beginPath()
        ctx.moveTo(padding.left, padding.top + plotH)
        ctx.lineTo(padding.left + plotW, padding.top + plotH)
        ctx.stroke()

        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        let tickInterval = 100
        if (activeCategory === '2_digit') tickInterval = 10
        if (activeCategory === 'run') tickInterval = 1

        for (let i = 0; i < domain.length; i++) {
            const numStr = domain[i]
            const shouldLabel = (i % tickInterval === 0) || (i === domain.length - 1)
            if (shouldLabel) {
                const xPos = padding.left + i * slotW + slotW / 2
                ctx.fillText(numStr, xPos, padding.top + plotH + 8)

                ctx.beginPath()
                ctx.moveTo(xPos, padding.top + plotH)
                ctx.lineTo(xPos, padding.top + plotH + 4)
                ctx.stroke()
            }
        }

        // 4. Bars (Data)
        domain.forEach((numStr, i) => {
            const bucket = buckets[numStr]
            const amt = bucket?.totalAmount || 0
            if (amt <= 0) return

            const origAmt = originalBuckets[numStr]?.totalAmount ?? amt
            const stagedAmt = Math.max(0, origAmt - amt)

            const evalRes = evaluateLineCut({
                amount: amt,
                originalAmount: origAmt,
                stagedAmount: stagedAmt,
                lineCount: lines.length,
                singleLine: singleLineVal,
                upperLine: upperLineVal,
                lowerLine: lowerLineVal,
                cutMode: effectiveCutMode,
                amountMode
            })

            const isMatched = evalRes.isMatched && evalRes.cutAmount > 0
            ctx.fillStyle = isMatched ? '#f59e0b' : '#334155'

            const barH = (amt / yMax) * plotH
            const barY = padding.top + plotH - barH
            const barX = padding.left + i * slotW
            const barW = Math.max(1, slotW - (activeCategory === '3_digit' ? 0.2 : 1))

            ctx.fillRect(barX, barY, barW, barH)
        })

        // 5. Horizontal Threshold Lines
        lines.forEach(line => {
            const lineY = getY(line.value)
            const isSelected = selectedLineId === line.id || draggingLineId === line.id

            ctx.save()
            ctx.strokeStyle = line.color
            ctx.lineWidth = isSelected ? 3 : 2
            ctx.setLineDash([6, 4])

            ctx.beginPath()
            ctx.moveTo(padding.left, lineY)
            ctx.lineTo(padding.left + plotW, lineY)
            ctx.stroke()

            // Line Pill Badge at right edge
            ctx.setLineDash([])
            ctx.fillStyle = line.color
            const pillW = 60
            const pillH = 20
            const pillX = padding.left + plotW - 5
            const pillY = lineY - pillH / 2

            ctx.beginPath()
            ctx.roundRect ? ctx.roundRect(pillX, pillY, pillW, pillH, 4) : ctx.rect(pillX, pillY, pillW, pillH)
            ctx.fill()

            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 11px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`${currencySymbol}${line.value}`, pillX + pillW / 2, lineY)

            // Drag handle at left side of badge
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(pillX - 6, lineY, 5, 0, Math.PI * 2)
            ctx.fill()

            ctx.restore()
        })

        ctx.restore()
    }, [
        domain,
        buckets,
        originalBuckets,
        lines,
        selectedLineId,
        draggingLineId,
        activeCategory,
        singleLineVal,
        upperLineVal,
        lowerLineVal,
        effectiveCutMode,
        amountMode,
        currencySymbol,
        getPlotGeometry
    ])

    // Pointer Event Handlers for Dragging Lines and Tooltip
    const handlePointerDown = useCallback((e) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const relY = e.clientY - rect.top
        const { getY } = getPlotGeometry(canvas)

        // Find if near any line (24px threshold for touch, 15px for mouse)
        const isTouch = e.pointerType === 'touch' || (typeof window !== 'undefined' && 'ontouchstart' in window)
        const hitDistance = isTouch ? 24 : 15
        const hitLine = lines.find(line => {
            const lineY = getY(line.value)
            return Math.abs(relY - lineY) <= hitDistance
        })

        if (hitLine) {
            setDraggingLineId(hitLine.id)
            setSelectedLineId(hitLine.id)
            if (e.target && e.target.setPointerCapture) {
                try {
                    e.target.setPointerCapture(e.pointerId)
                } catch {
                    // Ignore pointer capture errors in testing/virtual environments
                }
            }
        } else {
            setSelectedLineId(null)
        }
    }, [lines, getPlotGeometry])

    const handlePointerMove = useCallback((e) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const relX = e.clientX - rect.left
        const relY = e.clientY - rect.top
        const { padding, plotW, getY, getAmountFromY, slotW } = getPlotGeometry(canvas)

        // If currently dragging a line, update its threshold value
        if (draggingLineId !== null) {
            const rawAmt = getAmountFromY(relY)
            const maxCeiling = Math.round(Math.max(maxOriginalAmount, 100) * 1.15)
            const clampedAmt = Math.min(maxCeiling, rawAmt)
            const snappedAmt = Math.max(1, Math.round(clampedAmt / 10) * 10)
            setLines(prev => prev.map(l => l.id === draggingLineId ? { ...l, value: snappedAmt } : l))
            setCanvasCursor('ns-resize')
            return
        }

        // Check if cursor is hovering near a line
        const isTouch = e.pointerType === 'touch' || (typeof window !== 'undefined' && 'ontouchstart' in window)
        const hoverDistance = isTouch ? 24 : 12
        const nearLine = lines.some(line => {
            const lineY = getY(line.value)
            return Math.abs(relY - lineY) <= hoverDistance
        })

        if (nearLine) {
            setCanvasCursor('ns-resize')
        } else {
            setCanvasCursor('crosshair')
        }

        // Tooltip tracking: calculate which number slot is hovered
        if (relX >= padding.left && relX <= padding.left + plotW) {
            const slotIdx = Math.floor((relX - padding.left) / slotW)
            if (slotIdx >= 0 && slotIdx < domain.length) {
                const numStr = domain[slotIdx]
                const bucket = buckets[numStr]
                const amt = bucket?.totalAmount || 0
                const origAmt = originalBuckets[numStr]?.totalAmount || 0
                const stagedAmt = Math.max(0, origAmt - amt)

                const evalRes = evaluateLineCut({
                    amount: amt,
                    originalAmount: origAmt,
                    stagedAmount: stagedAmt,
                    lineCount: lines.length,
                    singleLine: singleLineVal,
                    upperLine: upperLineVal,
                    lowerLine: lowerLineVal,
                    cutMode: effectiveCutMode,
                    amountMode
                })

                setHoveredNumberInfo({
                    number: numStr,
                    totalAmount: amt,
                    originalAmount: origAmt,
                    stagedAmount: stagedAmt,
                    isMatched: evalRes.isMatched,
                    cutAmount: evalRes.cutAmount,
                    retainedAmount: evalRes.retainedAmount,
                    x: relX,
                    y: relY,
                    canvasW: canvas.clientWidth || 800,
                    canvasH: canvas.clientHeight || 420
                })
                return
            }
        }

        setHoveredNumberInfo(null)
    }, [
        draggingLineId,
        lines,
        domain,
        buckets,
        originalBuckets,
        singleLineVal,
        upperLineVal,
        lowerLineVal,
        effectiveCutMode,
        amountMode,
        maxOriginalAmount,
        getPlotGeometry
    ])

    const handlePointerUp = useCallback((e) => {
        if (draggingLineId !== null) {
            setDraggingLineId(null)
            if (e.target && e.target.releasePointerCapture) {
                try {
                    e.target.releasePointerCapture(e.pointerId)
                } catch {
                    // Ignore
                }
            }
        }
    }, [draggingLineId])

    const handleDoubleClick = useCallback((e) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const relY = e.clientY - rect.top
        const { getY } = getPlotGeometry(canvas)

        const hitLine = lines.find(line => {
            const lineY = getY(line.value)
            return Math.abs(relY - lineY) <= 16
        })

        if (hitLine) {
            setEditingLineModal({ lineId: hitLine.id, value: String(hitLine.value) })
        }
    }, [lines, getPlotGeometry])

    if (!isOpen) return null

    return (
        <div
            className="modal-overlay graph-layoff-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                className="modal-content graph-layoff-modal"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--color-bg-primary, #0f172a)',
                    color: 'var(--color-text-main, #f8fafc)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Header */}
                <div
                    className="graph-modal-header"
                    style={{
                        borderBottom: '1px solid #334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#1e293b',
                        gap: '0.75rem'
                    }}
                >
                    <div className="graph-modal-title-row" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                            <h3 className="graph-modal-title" style={{
                                margin: 0,
                                fontSize: '1.15rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                whiteSpace: 'nowrap'
                            }}>
                                <FiBarChart2 style={{ color: '#f59e0b', flexShrink: 0 }} />
                                <span>ตัดยอดจากกราฟ</span>
                            </h3>
                            <span
                                style={{
                                    fontSize: '0.75rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '4px',
                                    backgroundColor: sourceTab === 'remaining' ? '#0284c7' : '#e11d48',
                                    color: '#ffffff',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                }}
                            >
                                {sourceTab === 'remaining' ? 'แท็บ: ยอดเหลือ' : 'แท็บ: ยอดเกิน'}
                            </span>
                        </div>
                    </div>

                    {/* Category Dropdowns: 3 ตัว / 2 ตัว / 1 ตัว (Permanently right-anchored) */}
                    <div className="graph-category-tabs-row" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                        <div
                            ref={dropdownContainerRef}
                            className="graph-category-tabs-container"
                            style={{
                                display: 'flex',
                                backgroundColor: '#0f172a',
                                padding: '2px',
                                borderRadius: '6px',
                                border: '1px solid #334155',
                                gap: '2px'
                            }}
                        >
                            {[
                                { key: '3_digit', label: '3 ตัว', range: '(000-999)' },
                                { key: '2_digit', label: '2 ตัว', range: '(00-99)' },
                                { key: 'run', label: '1 ตัว', range: '(0-9)' }
                            ].map(cat => {
                                const isActiveCategory = activeCategory === cat.key
                                const isOpen = openDropdownCategory === cat.key
                                const selectedId = selectedBetTypeByCategory[cat.key]
                                const selectedOpt = betTypeOptionsByCategory[cat.key]?.find(o => o.id === selectedId) || betTypeOptionsByCategory[cat.key]?.[0]
                                const displayLabel = selectedOpt?.shortLabel || selectedOpt?.label || cat.label

                                return (
                                    <div key={cat.key} className="graph-category-tab-wrapper" style={{ position: 'relative' }}>
                                        <button
                                            type="button"
                                            className={`btn btn-sm ${isActiveCategory ? 'active' : ''}`}
                                            onClick={() => {
                                                setActiveCategory(cat.key)
                                                setOpenDropdownCategory(prev => prev === cat.key ? null : cat.key)
                                            }}
                                            style={{
                                                backgroundColor: isActiveCategory ? '#3b82f6' : 'transparent',
                                                color: isActiveCategory ? '#ffffff' : '#94a3b8',
                                                border: 'none',
                                                padding: '0.3rem 0.65rem',
                                                borderRadius: '4px',
                                                fontSize: '0.825rem',
                                                fontWeight: isActiveCategory ? 600 : 400,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title={`คลิกเพื่อเลือกประเภท ${cat.label}`}
                                        >
                                            <span>
                                                {isActiveCategory ? '🎯 ' : ''}{cat.label}: {displayLabel}
                                            </span>
                                            {isOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                                        </button>

                                        {isOpen && (
                                            <div
                                                className="graph-category-dropdown"
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 6px)',
                                                    right: cat.key === 'run' ? 0 : 'auto',
                                                    left: cat.key === 'run' ? 'auto' : 0,
                                                    minWidth: '230px',
                                                    backgroundColor: '#1e293b',
                                                    border: '1px solid #475569',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                                                    zIndex: 10005,
                                                    padding: '0.35rem 0',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        padding: '0.35rem 0.75rem',
                                                        fontSize: '0.72rem',
                                                        color: '#94a3b8',
                                                        borderBottom: '1px solid #334155',
                                                        fontWeight: 600,
                                                        letterSpacing: '0.02em',
                                                        backgroundColor: '#0f172a'
                                                    }}
                                                >
                                                    ประเภท{cat.label} {cat.range}
                                                </div>
                                                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                                    {betTypeOptionsByCategory[cat.key]?.map(opt => {
                                                        const isSelected = selectedId === opt.id
                                                        const amt = amountByBetType[opt.id] || 0
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setSelectedBetTypeByCategory(prev => ({ ...prev, [cat.key]: opt.id }))
                                                                    setActiveCategory(cat.key)
                                                                    setOpenDropdownCategory(null)
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    padding: '0.45rem 0.75rem',
                                                                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                                                    color: isSelected ? '#60a5fa' : '#f8fafc',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    fontSize: '0.825rem',
                                                                    transition: 'background-color 0.12s ease'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    if (!isSelected) e.currentTarget.style.backgroundColor = '#334155'
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                    <span style={{
                                                                        width: '14px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        color: isSelected ? '#3b82f6' : 'transparent',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '0.85rem'
                                                                    }}>
                                                                        ✓
                                                                    </span>
                                                                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                                                                        {opt.label}
                                                                    </span>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '0.75rem',
                                                                    color: amt > 0 ? '#10b981' : '#64748b',
                                                                    fontWeight: amt > 0 ? 600 : 400,
                                                                    marginLeft: '0.65rem'
                                                                }}>
                                                                    {amt > 0 ? `${currencySymbol}${amt.toLocaleString()}` : `${currencySymbol}0`}
                                                                </span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Modal Close Button (Positioned at far right corner) */}
                    <button
                        type="button"
                        className="modal-close graph-modal-close-btn graph-desktop-close graph-mobile-close"
                        onClick={onClose}
                        title="ปิด"
                    >
                        <FiX />
                    </button>
                </div>

                {/* Control Toolbar */}
                <div
                    className="graph-toolbar"
                    style={{
                        backgroundColor: '#1e293b',
                        borderBottom: '1px solid #334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}
                >
                    {/* Left Group: Line Controls & Line Badges */}
                    <div className="graph-toolbar-lines" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={handleAddLine}
                            disabled={lines.length >= 2}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.825rem',
                                backgroundColor: lines.length >= 2 ? '#334155' : '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                cursor: lines.length >= 2 ? 'not-allowed' : 'pointer'
                            }}
                            title={lines.length >= 2 ? 'จำกัดสูงสุด 2 เส้น' : 'เพิ่มเส้นราคาตัดยอด'}
                        >
                            <FiPlus /> เพิ่มเส้นราคา
                        </button>

                        {/* Line Pills */}
                        {lines.map((line, idx) => {
                            const label = lines.length === 2
                                ? (line.value === upperLineVal ? 'เส้นบน' : 'เส้นล่าง')
                                : `เส้น ${idx + 1}`
                            return (
                                <div
                                    key={line.id}
                                    className="line-pill"
                                    onClick={() => setSelectedLineId(line.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        backgroundColor: selectedLineId === line.id ? '#334155' : '#0f172a',
                                        border: `1.5px solid ${line.color}`,
                                        borderRadius: '20px',
                                        padding: '0.2rem 0.55rem',
                                        fontSize: '0.825rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span
                                        style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: line.color
                                        }}
                                    />
                                    <span>
                                        {label}: <strong>{currencySymbol}{line.value.toLocaleString()}</strong>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingLineModal({ lineId: line.id, value: String(line.value) })
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            padding: '0 2px',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        title="แก้ไขราคาตัวเลข"
                                    >
                                        <FiEdit2 size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleRemoveLine(line.id)
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#ef4444',
                                            cursor: 'pointer',
                                            padding: '0 2px',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                        title="ลบเส้นนี้"
                                    >
                                        <FiX size={13} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {/* Middle Group: Cut Mode & Amount Mode Selector */}
                    <div className="graph-toolbar-modes" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Cut Mode */}
                        <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
                            {lines.length === 0 ? (
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '0.25rem 0.6rem' }}>
                                    กด &quot;+ เพิ่มเส้นราคา&quot; เพื่อกำหนดจุดตัด
                                </span>
                            ) : lines.length === 1 ? (
                                <>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${effectiveCutMode === 'above' ? 'active' : ''}`}
                                        onClick={() => setCutMode('above')}
                                        style={{
                                            backgroundColor: effectiveCutMode === 'above' ? '#ef4444' : 'transparent',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🔴 ตัดบนเส้น (ยอดเกิน)
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${effectiveCutMode === 'below' ? 'active' : ''}`}
                                        onClick={() => setCutMode('below')}
                                        style={{
                                            backgroundColor: effectiveCutMode === 'below' ? '#3b82f6' : 'transparent',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🔵 ตัดล่างเส้น (ยอดต่ำกว่า)
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${effectiveCutMode === 'between' ? 'active' : ''}`}
                                        onClick={() => setCutMode('between')}
                                        style={{
                                            backgroundColor: effectiveCutMode === 'between' ? '#f59e0b' : 'transparent',
                                            color: effectiveCutMode === 'between' ? '#000000' : '#ffffff',
                                            fontWeight: effectiveCutMode === 'between' ? 600 : 400,
                                            border: 'none',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🟡 ตัดระหว่างเส้น
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${effectiveCutMode === 'outside' ? 'active' : ''}`}
                                        onClick={() => setCutMode('outside')}
                                        style={{
                                            backgroundColor: effectiveCutMode === 'outside' ? '#8b5cf6' : 'transparent',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🟣 ตัดนอกเส้น
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Amount Mode: Difference vs Full */}
                        <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
                            <button
                                type="button"
                                className={`btn btn-sm ${amountMode === 'difference' ? 'active' : ''}`}
                                onClick={() => setAmountMode('difference')}
                                style={{
                                    backgroundColor: amountMode === 'difference' ? '#10b981' : 'transparent',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '0.25rem 0.55rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ตัดเฉพาะส่วนต่าง
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${amountMode === 'full' ? 'active' : ''}`}
                                onClick={() => setAmountMode('full')}
                                style={{
                                    backgroundColor: amountMode === 'full' ? '#10b981' : 'transparent',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '0.25rem 0.55rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ตัดเต็มจำนวน
                            </button>
                        </div>
                    </div>

                    {/* Right Group: Impact Summary & Stage Button */}
                    <div className="graph-toolbar-action" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div className="impact-text" style={{ fontSize: '0.85rem', textAlign: 'right' }}>
                            <strong style={{ color: '#f59e0b' }}>{cutSummary.matchedNumbersCount}</strong> เลข
                            <span style={{ margin: '0 0.35rem', color: '#475569' }}>|</span>
                            <span style={{ color: '#94a3b8' }}>ยอดรวม: </span>
                            <strong style={{ color: '#10b981' }}>{currencySymbol}{cutSummary.totalCutAmount.toLocaleString()}</strong>
                        </div>

                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={handleAddToBasket}
                            disabled={cutSummary.cutItems.length === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '6px',
                                backgroundColor: cutSummary.cutItems.length > 0 ? '#10b981' : '#334155',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: cutSummary.cutItems.length > 0 ? 'pointer' : 'not-allowed'
                            }}
                            title="เพิ่มยอดที่เข้าเงื่อนไขเข้าสู่ตะกร้าพักยอด"
                        >
                            <FiScissors /> ตัดยอดเข้าตะกร้า
                        </button>
                    </div>
                </div>

                {/* Canvas Chart Area */}
                <div
                    ref={containerRef}
                    className="graph-chart-container"
                    style={{
                        position: 'relative',
                        backgroundColor: '#0f172a',
                        overflow: 'hidden',
                        touchAction: 'none'
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            cursor: canvasCursor
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onPointerLeave={() => setHoveredNumberInfo(null)}
                        onDoubleClick={handleDoubleClick}
                    />

                    {/* Floating Tooltip (Confined strictly inside chart area) */}
                    {hoveredNumberInfo && (
                        <div
                            style={{
                                position: 'absolute',
                                left: Math.max(
                                    10,
                                    (hoveredNumberInfo.x > (hoveredNumberInfo.canvasW || 800) - 200)
                                        ? hoveredNumberInfo.x - 195
                                        : hoveredNumberInfo.x + 14
                                ),
                                top: Math.max(
                                    8,
                                    Math.min(
                                        (hoveredNumberInfo.canvasH || 420) - 95,
                                        hoveredNumberInfo.y < 100
                                            ? hoveredNumberInfo.y + 18
                                            : hoveredNumberInfo.y - 88
                                    )
                                ),
                                backgroundColor: '#1e293b',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                padding: '0.4rem 0.65rem',
                                fontSize: '0.75rem',
                                pointerEvents: 'none',
                                zIndex: 100,
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '2px' }}>
                                เลข: <span style={{ color: '#f59e0b', fontSize: '0.9rem' }}>{hoveredNumberInfo.number}</span>
                            </div>
                            <div style={{ color: '#94a3b8' }}>
                                ยอดคงเหลือ: <strong style={{ color: '#ffffff' }}>{currencySymbol}{hoveredNumberInfo.totalAmount.toLocaleString()}</strong>
                                {hoveredNumberInfo.stagedAmount > 0 && (
                                    <span style={{ color: '#10b981', marginLeft: '0.4rem', fontSize: '0.72rem' }}>
                                        (ตัดเข้าตะกร้าแล้ว: {currencySymbol}{hoveredNumberInfo.stagedAmount.toLocaleString()})
                                    </span>
                                )}
                            </div>
                            {hoveredNumberInfo.isMatched && (
                                <>
                                    <div style={{ color: '#10b981', fontWeight: 600 }}>
                                        ✂️ ตัดออก: {currencySymbol}{hoveredNumberInfo.cutAmount.toLocaleString()}
                                    </div>
                                    <div style={{ color: '#0284c7' }}>
                                        คงเหลือ: {currencySymbol}{hoveredNumberInfo.retainedAmount.toLocaleString()}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Staging Basket Drawer (ตะกร้าพักยอดตีออก) */}
                <div
                    className={`graph-basket-drawer ${isBasketExpanded ? 'expanded' : 'collapsed'}`}
                    style={{
                        backgroundColor: '#1e293b',
                        borderTop: '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'max-height 0.2s ease-in-out'
                    }}
                >
                    {/* Drawer Header Bar */}
                    <div
                        className="graph-basket-header"
                        style={{
                            borderBottom: isBasketExpanded ? '1px solid #334155' : 'none',
                            cursor: 'pointer'
                        }}
                        onClick={() => setIsBasketExpanded(prev => !prev)}
                    >
                        <div className="graph-basket-header-top">
                            <div className="graph-basket-header-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1rem' }}>🛒</span>
                                <strong style={{ fontSize: '0.9rem' }}>
                                    ตะกร้าพักยอดตีออก ({stagedBasket.length} รายการ)
                                </strong>
                                <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                                    รวม: {currencySymbol}{totalStagedAmount.toLocaleString()}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="graph-basket-toggle-btn"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsBasketExpanded(prev => !prev)
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '1.15rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0.2rem'
                                }}
                                title={isBasketExpanded ? 'ย่อตะกร้า' : 'ขยายตะกร้า'}
                            >
                                {isBasketExpanded ? <FiChevronDown /> : <FiChevronUp />}
                            </button>
                        </div>

                        <div className="graph-basket-header-actions" onClick={e => e.stopPropagation()}>
                            {stagedBasket.length > 0 && (
                                <button
                                    type="button"
                                    className="btn-clear-basket"
                                    onClick={handleClearBasket}
                                    style={{
                                        background: 'none',
                                        border: '1px solid #475569',
                                        color: '#ef4444',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.55rem',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        whiteSpace: 'nowrap'
                                    }}
                                    title="ล้างรายการทั้งหมดในตะกร้า"
                                >
                                    <FiTrash2 size={12} /> ล้างตะกร้า
                                </button>
                            )}

                            <button
                                type="button"
                                className="btn btn-sm btn-transfer"
                                onClick={() => onProceedToTransfer(stagedBasket)}
                                disabled={stagedBasket.length === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    backgroundColor: stagedBasket.length > 0 ? '#3b82f6' : '#334155',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: stagedBasket.length > 0 ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <FiSend /> ดำเนินการส่งตีออก ({stagedBasket.length} รายการ)
                            </button>
                        </div>
                    </div>

                    {/* Staged Items List Table */}
                    {isBasketExpanded && (
                        <div className="graph-basket-table-wrapper">
                            {stagedBasket.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                                    ยังไม่มีรายการในตะกร้า (ปรับเส้นราคาแล้วกด &quot;ตัดยอดเข้าตะกร้า&quot;)
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                                    <thead>
                                        <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                                            <th
                                                onClick={() => handleToggleBasketSort('number')}
                                                style={{ padding: '0.35rem 0.5rem', cursor: 'pointer', userSelect: 'none' }}
                                                title="คลิกเพื่อเรียงตามเลข (น้อยไปมาก / มากไปน้อย)"
                                            >
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    color: basketSortBy === 'number' ? '#f59e0b' : 'inherit'
                                                }}>
                                                    เลข {basketSortBy === 'number' ? (basketSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                                                </span>
                                            </th>
                                            <th style={{ padding: '0.35rem 0.5rem' }}>ประเภท</th>
                                            <th
                                                onClick={() => handleToggleBasketSort('amount')}
                                                style={{ padding: '0.35rem 0.5rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                                                title="คลิกเพื่อเรียงตามยอดตัดออก (มากไปน้อย / น้อยไปมาก)"
                                            >
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end',
                                                    gap: '0.25rem',
                                                    color: basketSortBy === 'amount' ? '#f59e0b' : 'inherit'
                                                }}>
                                                    ยอดตัดออก {basketSortBy === 'amount' ? (basketSortOrder === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                                                </span>
                                            </th>
                                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center', width: '50px' }}>จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedBasketItems.map((item, idx) => (
                                            <tr key={`${item.bet_type}-${item.numbers}-${idx}`} style={{ borderBottom: '1px solid #243247' }}>
                                                <td style={{ padding: '0.35rem 0.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                                    {item.numbers}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: '#94a3b8' }}>
                                                    {item.display_bet_type || BET_TYPE_DISPLAY_MAP[item.bet_type] || item.bet_type}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                                    {currencySymbol}{(Number(item.excess) || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveBasketItem(item)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                            padding: '0 4px'
                                                        }}
                                                        title="ลบรายการนี้"
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>

                {/* Exact Line Value Edit Modal */}
                {editingLineModal && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 10002,
                            backgroundColor: 'rgba(0, 0, 0, 0.65)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        onClick={() => setEditingLineModal(null)}
                    >
                        <div
                            style={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #475569',
                                borderRadius: '8px',
                                padding: '1.25rem',
                                width: '320px',
                                maxWidth: '90vw',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#f8fafc' }}>
                                กำหนดราคาเส้น {editingLineModal.lineId} ({currencySymbol})
                            </h4>
                            <input
                                type="number"
                                autoFocus
                                min="1"
                                className="form-input"
                                value={editingLineModal.value}
                                onChange={e => setEditingLineModal({ ...editingLineModal, value: e.target.value })}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveExactLineValue()
                                    if (e.key === 'Escape') setEditingLineModal(null)
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid #475569',
                                    backgroundColor: '#0f172a',
                                    color: '#ffffff',
                                    fontSize: '1rem',
                                    marginBottom: '1rem'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => setEditingLineModal(null)}
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: '#94a3b8',
                                        border: '1px solid #475569',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={handleSaveExactLineValue}
                                    style={{
                                        backgroundColor: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    บันทึก
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
