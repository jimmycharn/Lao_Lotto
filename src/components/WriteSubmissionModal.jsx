import { useState, useEffect, useRef, useCallback } from 'react'
import { FiX, FiTrash2, FiEdit2, FiPlus, FiCheck, FiRefreshCw } from 'react-icons/fi'
import { getPermutations } from '../constants/lotteryTypes'
import './WriteSubmissionModal.css'

// Sound effects using Web Audio API
const createAudioContext = () => {
    if (typeof window !== 'undefined' && window.AudioContext) {
        return new (window.AudioContext || window.webkitAudioContext)()
    }
    return null
}

// Play a beep sound with specified frequency and duration
const playSound = (type) => {
    try {
        const audioCtx = createAudioContext()
        if (!audioCtx) return
        
        const oscillator = audioCtx.createOscillator()
        const gainNode = audioCtx.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        
        // Different sounds for different events
        if (type === 'click') {
            // Short click sound - high pitch, very short
            oscillator.frequency.value = 800
            oscillator.type = 'sine'
            gainNode.gain.value = 0.1
            oscillator.start()
            oscillator.stop(audioCtx.currentTime + 0.05)
        } else if (type === 'success') {
            // Success sound - pleasant two-tone
            oscillator.frequency.value = 600
            oscillator.type = 'sine'
            gainNode.gain.value = 0.15
            oscillator.start()
            setTimeout(() => {
                oscillator.frequency.value = 800
            }, 100)
            oscillator.stop(audioCtx.currentTime + 0.2)
        } else if (type === 'error') {
            // Error sound - low buzz
            oscillator.frequency.value = 200
            oscillator.type = 'square'
            gainNode.gain.value = 0.1
            oscillator.start()
            oscillator.stop(audioCtx.currentTime + 0.15)
        }
        
        // Clean up
        oscillator.onended = () => {
            audioCtx.close()
        }
    } catch (e) {
        // Silently fail if audio not supported
        console.log('Audio not supported')
    }
}

// Calculate unique permutations count
const getPermutationCount = (numStr) => {
    if (!numStr || numStr.length < 2) return 0
    const perms = getPermutations(numStr)
    return perms.length
}

// Parse a single line of input
// Supports formats: "123=50 บน", "123=50*30 บนกลับ", "123 50 ล่าง" (old)
const parseLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return null

    let numbers, amount, amount2 = null, typeStr
    
    // Check if using new format with =
    if (trimmed.includes('=')) {
        const eqIndex = trimmed.indexOf('=')
        numbers = trimmed.substring(0, eqIndex).trim()
        const afterEq = trimmed.substring(eqIndex + 1).trim()
        
        // Check for * in amount (two amounts)
        if (afterEq.includes('*')) {
            const starIndex = afterEq.indexOf('*')
            amount = parseInt(afterEq.substring(0, starIndex).trim())
            const afterStar = afterEq.substring(starIndex + 1).trim()
            const parts = afterStar.split(/\s+/)
            amount2 = parseInt(parts[0])
            typeStr = parts.slice(1).join(' ').toLowerCase()
        } else {
            const parts = afterEq.split(/\s+/)
            amount = parseInt(parts[0])
            typeStr = parts.slice(1).join(' ').toLowerCase()
        }
    } else {
        // Old format with spaces
        const parts = trimmed.split(/\s+/)
        if (parts.length < 2) return { error: 'รูปแบบไม่ถูกต้อง: ต้องมีเลขและจำนวนเงิน' }
        numbers = parts[0]
        amount = parseInt(parts[1])
        typeStr = parts.slice(2).join(' ').toLowerCase()
    }

    // Validate numbers
    if (!/^\d+$/.test(numbers)) {
        return { error: 'เลขไม่ถูกต้อง: ต้องเป็นตัวเลขเท่านั้น' }
    }
    if (numbers.length < 1 || numbers.length > 5) {
        return { error: 'เลขต้องมี 1-5 หลัก' }
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        return { error: 'จำนวนเงินไม่ถูกต้อง' }
    }
    
    // Validate amount2 if present
    if (amount2 !== null && (isNaN(amount2) || amount2 <= 0)) {
        return { error: 'จำนวนเงินชุดที่ 2 ไม่ถูกต้อง' }
    }

    // Parse type and options
    let betType = null
    let reverseAmount = amount2  // Use amount2 as reverseAmount if present
    let specialType = null

    const numLen = numbers.length

    if (numLen === 1) {
        // 1 digit: ลอยบน/ล่าง, หน้าบน/ล่าง, กลางบน, หลังบน/ล่าง
        if (typeStr.includes('ลอยล่าง') || typeStr.includes('วิ่งล่าง')) {
            betType = 'run_bottom'
        } else if (typeStr.includes('ลอยบน') || typeStr.includes('วิ่งบน')) {
            betType = 'run_top'
        } else if (typeStr.includes('หน้าบน')) {
            betType = 'front_top'
        } else if (typeStr.includes('หน้าล่าง')) {
            betType = 'front_bottom'
        } else if (typeStr.includes('กลางบน')) {
            betType = 'middle_top'
        } else if (typeStr.includes('หลังบน')) {
            betType = 'back_top'
        } else if (typeStr.includes('หลังล่าง')) {
            betType = 'back_bottom'
        } else if (typeStr.includes('ล่าง')) {
            betType = 'run_bottom'
        } else {
            betType = 'run_top'
        }
    } else if (numLen === 2) {
        // 2 digits: บน/ล่าง, ลอย, หน้า, ถ่าง, กลับ
        if (typeStr.includes('ล่างกลับ')) {
            betType = '2_bottom'
            specialType = 'reverse'
        } else if (typeStr.includes('บนกลับ') || (typeStr.includes('กลับ') && !typeStr.includes('ล่าง') && !typeStr.includes('หน้า') && !typeStr.includes('ถ่าง'))) {
            betType = '2_top'
            specialType = 'reverse'
        } else if (typeStr.includes('หน้ากลับ')) {
            betType = '2_front'
            specialType = 'reverse'
        } else if (typeStr.includes('ถ่างกลับ')) {
            betType = '2_tang'
            specialType = 'reverse'
        } else if (typeStr.includes('ลอย') || typeStr.includes('2ตัวมี')) {
            betType = '2_teng'
        } else if (typeStr.includes('หน้าบน') || typeStr.includes('หน้า') || typeStr.includes('2ตัวหน้า')) {
            betType = '2_front'
        } else if (typeStr.includes('ถ่างบน') || typeStr.includes('ถ่าง') || typeStr.includes('2ตัวถ่าง')) {
            betType = '2_tang'
        } else if (typeStr.includes('ล่าง') || typeStr.includes('2ตัวล่าง')) {
            betType = '2_bottom'
        } else if (typeStr.includes('บน') || typeStr.includes('2ตัวบน')) {
            betType = '2_top'
        } else {
            betType = '2_top'
        }
    } else if (numLen === 3) {
        // 3 digits: บน/ตรง, โต๊ด, ล่าง, เต็งโต๊ด, กลับ, คูณชุด
        const permCount = getPermutationCount(numbers)
        if (typeStr.includes('คูณชุด')) {
            betType = '3_top'
            specialType = permCount === 3 ? 'set3' : (permCount === 6 ? 'set6' : 'set' + permCount)
        } else if (typeStr.includes('เต็งโต๊ด')) {
            betType = '3_top'
            specialType = 'tengTod'
        } else if (typeStr.includes('โต๊ด') || typeStr.includes('3ตัวโต๊ด')) {
            betType = '3_tod'
        } else if (typeStr.includes('กลับ')) {
            betType = '3_top'
            specialType = 'reverse'
        } else if (typeStr.includes('ล่าง') || typeStr.includes('3ตัวล่าง')) {
            betType = '3_bottom'
        } else if (typeStr.includes('ตรง') || typeStr.includes('บน') || typeStr.includes('3ตัวบน')) {
            betType = '3_top'
        } else {
            betType = '3_top'
        }
    } else if (numLen === 4) {
        // 4 digits: 4ตัวชุด, ลอยแพ, คูณชุด
        const permCount = getPermutationCount(numbers)
        if (typeStr.includes('คูณชุด')) {
            // คูณชุด ต้อง check ก่อน เพราะ 'ชุด' จะ match กับ 'คูณชุด' ด้วย
            betType = '3_top'
            specialType = '3xPerm'
        } else if (typeStr.includes('4ตัวชุด') || typeStr.includes('ชุด')) {
            betType = '4_set'
        } else if (typeStr.includes('ลอยแพ') || typeStr.includes('ลอย')) {
            betType = '4_run'
        } else {
            betType = '4_run'
        }
    } else if (numLen === 5) {
        // 5 digits: ลอยแพ, คูณชุด
        const permCount = getPermutationCount(numbers)
        if (typeStr.includes('คูณชุด')) {
            betType = '3_top'
            specialType = '3xPerm'
        } else if (typeStr.includes('ลอยแพ') || typeStr.includes('ลอย')) {
            betType = '5_run'
        } else {
            betType = '5_run'
        }
    }

    // Validate betType - ต้องไม่เป็น null
    if (!betType) {
        return { error: `ไม่สามารถระบุประเภทเลข ${numLen} หลักได้` }
    }

    return { numbers, amount, betType, specialType, reverseAmount }
}

// Helper: Get all 3-digit combinations from 4 or 5 digit number
const get3DigitCombinations = (numbers) => {
    const digits = numbers.split('')
    const combinations = new Set()
    
    for (let i = 0; i < digits.length; i++) {
        for (let j = 0; j < digits.length; j++) {
            if (j === i) continue
            for (let k = 0; k < digits.length; k++) {
                if (k === i || k === j) continue
                combinations.add(digits[i] + digits[j] + digits[k])
            }
        }
    }
    
    return Array.from(combinations)
}

// Generate entries from parsed line with display info for grouped view
// options: { setPrice, lotteryType } for 4ตัวชุด handling
const generateEntries = (parsed, entryId, rawLine, options = {}) => {
    if (!parsed || parsed.error) return []

    const { numbers, amount, betType, specialType, reverseAmount } = parsed
    
    // Validate betType - ต้องไม่เป็น null หรือ undefined
    if (!betType) {
        console.error('generateEntries: betType is null or undefined', { parsed, rawLine })
        return []
    }
    
    const { setPrice = 120, lotteryType = 'thai' } = options
    const entries = []
    
    // Calculate total amount and count for display
    let totalAmount = amount
    let entryCount = 1
    
    // Build display text from raw line (the original input)
    const displayText = rawLine || `${numbers}=${amount}`
    
    // Special handling for 4ตัวชุด (Lao/Hanoi only)
    const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
    if (betType === '4_set' && isLaoOrHanoi) {
        // amount = จำนวนชุด, setPrice = ราคาต่อชุด
        const setCount = amount || 1
        const calculatedAmount = setCount * setPrice
        entries.push({ 
            numbers, 
            amount: calculatedAmount, 
            betType, 
            entryId, 
            displayText: `${numbers}=${setCount} 4ตัวชุด(${setCount})`, 
            displayAmount: calculatedAmount,
            setCount  // เก็บจำนวนชุดไว้ด้วย
        })
        return entries
    }

    if (specialType === '3xPerm') {
        // 4 or 5 digit number -> generate all 3-digit combinations
        const combos = get3DigitCombinations(numbers)
        entryCount = combos.length
        totalAmount = amount * combos.length
        
        combos.forEach(combo => {
            entries.push({ numbers: combo, amount, betType: '3_top', entryId, displayText, displayAmount: totalAmount })
        })
    } else if (specialType === 'reverse') {
        // 2 or 3 digits reverse
        const perms = getPermutations(numbers)
        entryCount = perms.length
        totalAmount = amount + (reverseAmount || amount) * (perms.length - 1)
        
        entries.push({ numbers, amount, betType, entryId, displayText, displayAmount: totalAmount })
        perms.filter(p => p !== numbers).forEach(p => {
            entries.push({ numbers: p, amount: reverseAmount || amount, betType, entryId, displayText, displayAmount: totalAmount })
        })
    } else if (specialType === 'set3' || specialType === 'set6') {
        const perms = getPermutations(numbers)
        entryCount = perms.length
        totalAmount = amount * perms.length
        
        perms.forEach((p, i) => {
            entries.push({ numbers: p, amount, betType, entryId, displayText, displayAmount: totalAmount })
        })
    } else if (specialType === 'tengTod') {
        // เต็งโต๊ด: ถ้าไม่มี reverseAmount ใช้จำนวนเงินเดียวกันสำหรับทั้ง 3ตัวบน/ตรง และ โต๊ด
        // ถ้ามี reverseAmount ใช้ amount สำหรับ 3ตัวบน/ตรง และ reverseAmount สำหรับ โต๊ด
        const straightAmt = amount
        const todAmt = reverseAmount || amount  // ถ้าไม่ระบุ reverseAmount ใช้ amount เดียวกัน
        entryCount = 2  // เสมอ 2 รายการ
        totalAmount = straightAmt + todAmt
        
        // 3ตัวบน/ตรง - เลขตามที่ป้อน
        entries.push({ numbers, amount: straightAmt, betType: '3_top', entryId, displayText, displayAmount: totalAmount })
        // โต๊ด - เลขเรียงลำดับ
        const sortedNumbers = numbers.split('').sort().join('')
        entries.push({ numbers: sortedNumbers, amount: todAmt, betType: '3_tod', entryId, displayText, displayAmount: totalAmount })
    } else if (betType === '4_run' || betType === '5_run') {
        // ลอยแพ 4-5 ตัว: สร้าง entries สำหรับแต่ละหลัก
        const digits = numbers.split('')
        entryCount = digits.length
        totalAmount = amount * digits.length
        
        digits.forEach((digit, idx) => {
            // สร้าง entry สำหรับแต่ละหลัก (วิ่งบน)
            entries.push({ 
                numbers: digit, 
                amount, 
                betType: 'run_top', 
                entryId, 
                displayText, 
                displayAmount: totalAmount,
                position: idx + 1  // ตำแหน่งหลัก
            })
        })
    } else {
        entries.push({ numbers, amount, betType, entryId, displayText, displayAmount: amount })
    }

    return entries
}

// Get bet type label
const getBetTypeLabel = (betType) => {
    const labels = {
        'run_top': 'วิ่งบน',
        'run_bottom': 'วิ่งล่าง',
        'front_top': 'หน้าบน',
        'front_bottom': 'หน้าล่าง',
        'middle_top': 'กลางบน',
        'back_top': 'หลังบน',
        'back_bottom': 'หลังล่าง',
        '2_top': '2 ตัวบน',
        '2_bottom': '2 ตัวล่าง',
        '2_teng': '2 ตัวมี',
        '2_front': '2 ตัวหน้า',
        '2_tang': '2 ตัวถ่าง',
        '3_top': '3 ตัวบน',
        '3_tod': '3 ตัวโต๊ด',
        '3_bottom': '3 ตัวล่าง',
        '4_set': '4 ตัวชุด',
        '4_run': 'ลอยแพ',
        '5_run': 'ลอยแพ'
    }
    return labels[betType] || betType
}

export default function WriteSubmissionModal({ 
    isOpen, 
    onClose, 
    onSubmit, 
    roundInfo,
    currencySymbol = '฿',
    editingData = null,
    onEditSubmit = null,
    lotteryType = 'thai',
    setPrice = 120,  // ราคาต่อชุดสำหรับ 4ตัวชุด
    priceLocked = false  // ล็อคราคา
}) {
    const [lines, setLines] = useState([])
    const [currentInput, setCurrentInput] = useState('')
    const [editingIndex, setEditingIndex] = useState(null)
    const [billNote, setBillNote] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [topBottomToggle, setTopBottomToggle] = useState('top') // 'top' = บน, 'bottom' = ล่าง
    const [isLocked, setIsLocked] = useState(false) // ล็อคราคา/รูปแบบ
    const [lockedAmount, setLockedAmount] = useState('') // จำนวนเงินที่ล็อคไว้
    const [showCloseConfirm, setShowCloseConfirm] = useState(false)
    const [focusedTypeIndex, setFocusedTypeIndex] = useState(-1) // -1 = not focused on type buttons
    const [isCtrlPressed, setIsCtrlPressed] = useState(false) // Virtual Ctrl key state for mobile
    const [defaultTypes, setDefaultTypes] = useState(() => {
        // Load default types from localStorage
        try {
            const saved = localStorage.getItem('lao_lotto_default_types')
            return saved ? JSON.parse(saved) : {}
        } catch {
            return {}
        }
    })
    const linesContainerRef = useRef(null)
    const noteInputRef = useRef(null)
    const modalRef = useRef(null)
    const typeButtonsRef = useRef([])
    const longPressTimerRef = useRef(null)
    const isEditMode = !!editingData

    // Save default types to localStorage when changed
    useEffect(() => {
        try {
            localStorage.setItem('lao_lotto_default_types', JSON.stringify(defaultTypes))
        } catch {
            // Ignore localStorage errors
        }
    }, [defaultTypes])

    // Get current digit count from input
    const getCurrentDigitCount = useCallback(() => {
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        if (eqIndex === -1) return 0
        const numbers = input.substring(0, eqIndex)
        if (/^\d+$/.test(numbers)) {
            return numbers.length
        }
        return 0
    }, [currentInput])

    // Get default button index for current digit count
    const getDefaultButtonIndex = useCallback((typeButtons) => {
        const digitCount = getCurrentDigitCount()
        if (digitCount === 0 || typeButtons.length === 0) return 0
        
        const defaultType = defaultTypes[digitCount]
        if (!defaultType) return 0
        
        const index = typeButtons.findIndex(btn => btn.value === defaultType)
        return index >= 0 ? index : 0
    }, [defaultTypes, getCurrentDigitCount])

    // Handle long press to set default type
    const handleTypeButtonMouseDown = useCallback((btn, digitCount) => {
        longPressTimerRef.current = setTimeout(() => {
            // Set this button as default for current digit count
            setDefaultTypes(prev => ({
                ...prev,
                [digitCount]: btn.value
            }))
            playSound('success')
            // Show feedback
            setError(`ตั้ง "${btn.label}" เป็นค่าเริ่มต้นสำหรับเลข ${digitCount} หลัก`)
            setTimeout(() => setError(''), 2000)
        }, 800) // 800ms long press
    }, [])

    const handleTypeButtonMouseUp = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    const handleTypeButtonMouseLeave = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    // Handle keyboard input for desktop
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e) => {
            // Ctrl+S - Save draft (must be first to prevent browser save dialog)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                e.stopPropagation()
                if (lines.length > 0 && !submitting) {
                    handleSubmit()
                }
                return
            }
            
            // Ignore if typing in note input
            if (document.activeElement === noteInputRef.current) return
            
            // Get current type buttons
            const currentTypeButtons = getAvailableTypeButtons()
            const hasTypeButtons = currentTypeButtons.length > 0
            
            // Arrow keys for type button navigation (desktop only)
            // Type buttons are displayed in rows of 5 on desktop
            const BUTTONS_PER_ROW = 5
            
            // Arrow Left - go to previous button (wrap to last if at first)
            if (e.key === 'ArrowLeft' && hasTypeButtons) {
                e.preventDefault()
                let newIndex
                if (focusedTypeIndex === -1) {
                    // Not focused yet - go to last button
                    newIndex = currentTypeButtons.length - 1
                } else if (focusedTypeIndex === 0) {
                    // At first button - wrap to last
                    newIndex = currentTypeButtons.length - 1
                } else {
                    newIndex = focusedTypeIndex - 1
                }
                setFocusedTypeIndex(newIndex)
                typeButtonsRef.current[newIndex]?.focus()
                return
            }
            
            // Arrow Right - go to next button (wrap to first if at last)
            if (e.key === 'ArrowRight' && hasTypeButtons) {
                e.preventDefault()
                let newIndex
                if (focusedTypeIndex === -1) {
                    // Not focused yet - go to second button (assume first is default)
                    newIndex = currentTypeButtons.length > 1 ? 1 : 0
                } else if (focusedTypeIndex >= currentTypeButtons.length - 1) {
                    // At last button - wrap to first
                    newIndex = 0
                } else {
                    newIndex = focusedTypeIndex + 1
                }
                setFocusedTypeIndex(newIndex)
                typeButtonsRef.current[newIndex]?.focus()
                return
            }
            
            // Arrow Down - go to first button of second row (or first button if single row)
            if ((e.key === 'ArrowDown' || e.key === 'Tab') && hasTypeButtons) {
                e.preventDefault()
                let newIndex
                if (focusedTypeIndex === -1) {
                    // Not focused yet
                    if (currentTypeButtons.length > BUTTONS_PER_ROW) {
                        // Has 2 rows - go to first button of second row
                        newIndex = BUTTONS_PER_ROW
                    } else {
                        // Single row - go to first button
                        newIndex = 0
                    }
                } else {
                    // Already focused - move down a row
                    const currentRow = Math.floor(focusedTypeIndex / BUTTONS_PER_ROW)
                    const currentCol = focusedTypeIndex % BUTTONS_PER_ROW
                    const totalRows = Math.ceil(currentTypeButtons.length / BUTTONS_PER_ROW)
                    
                    if (currentRow < totalRows - 1) {
                        // Can go down
                        const targetIndex = (currentRow + 1) * BUTTONS_PER_ROW + currentCol
                        newIndex = Math.min(targetIndex, currentTypeButtons.length - 1)
                    } else {
                        // At bottom row - wrap to top
                        newIndex = Math.min(currentCol, currentTypeButtons.length - 1)
                    }
                }
                setFocusedTypeIndex(newIndex)
                typeButtonsRef.current[newIndex]?.focus()
                return
            }
            
            // Arrow Up - move up a row or exit focus
            if (e.key === 'ArrowUp' && hasTypeButtons) {
                e.preventDefault()
                if (focusedTypeIndex === -1) {
                    return // Not focused, do nothing
                }
                const currentRow = Math.floor(focusedTypeIndex / BUTTONS_PER_ROW)
                const currentCol = focusedTypeIndex % BUTTONS_PER_ROW
                
                if (currentRow > 0) {
                    // Can go up
                    const newIndex = (currentRow - 1) * BUTTONS_PER_ROW + currentCol
                    setFocusedTypeIndex(newIndex)
                    typeButtonsRef.current[newIndex]?.focus()
                } else {
                    // At top row - exit focus
                    setFocusedTypeIndex(-1)
                }
                return
            }
            
            // Enter when focused on type button - click that button
            if (e.key === 'Enter' && focusedTypeIndex >= 0 && currentTypeButtons[focusedTypeIndex]) {
                e.preventDefault()
                const btn = currentTypeButtons[focusedTypeIndex]
                handleTypeClick(btn.value, btn.autoSubmit)
                setFocusedTypeIndex(-1)
                return
            }
            
            // If focused on type buttons, ignore other keys except Escape
            if (focusedTypeIndex >= 0 && e.key !== 'Escape') {
                return
            }
            
            // Number keys 0-9
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault()
                handleNumberClick(e.key)
            }
            // Backspace
            else if (e.key === 'Backspace') {
                e.preventDefault()
                handleBackspace()
            }
            // Enter key handling
            // Ctrl+Enter (real keyboard) OR Enter with on-screen Ctrl pressed
            // Both trigger save draft with default type when input is "number=amount"
            else if (e.key === 'Enter') {
                e.preventDefault()
                const input = currentInput.trim()
                // Pattern: digits=digits (no * and no type)
                const ctrlEnterPattern = /^\d+=\d+$/
                
                // Check if Ctrl is active (real keyboard OR on-screen button)
                const isCtrlActive = e.ctrlKey || e.metaKey || isCtrlPressed
                
                if (isCtrlActive && ctrlEnterPattern.test(input)) {
                    // Ctrl+Enter with "number=amount" - save draft with default type button
                    const currentTypeButtons = getAvailableTypeButtons()
                    if (currentTypeButtons.length > 0) {
                        const defaultIndex = getDefaultButtonIndex(currentTypeButtons)
                        handleTypeClick(currentTypeButtons[defaultIndex].value, currentTypeButtons[defaultIndex].autoSubmit)
                    }
                } else {
                    // Normal Enter behavior
                    handleEnter()
                }
            }
            // = key - มีได้ 1 อันเท่านั้น และต้องอยู่หลังเลขชุดแรก
            else if (e.key === '=') {
                e.preventDefault()
                const input = currentInput.trim()
                // ไม่อนุญาตถ้ามี = อยู่แล้ว
                if (input.includes('=')) {
                    playSound('error')
                    return
                }
                // ต้องมีตัวเลขก่อน =
                if (!/^\d+$/.test(input)) {
                    playSound('error')
                    return
                }
                playSound('click')
                if (isLocked && lockedAmount) {
                    setCurrentInput(prev => prev + '=' + lockedAmount)
                } else {
                    setCurrentInput(prev => prev + '=')
                }
            }
            // * key - มีได้ 1 อันเท่านั้น และต้องอยู่หลังเลขชุดที่ 2 (จำนวนเงินแรก)
            else if (e.key === '*') {
                e.preventDefault()
                const input = currentInput.trim()
                // ไม่อนุญาตถ้ามี * อยู่แล้ว
                if (input.includes('*')) {
                    playSound('error')
                    return
                }
                const eqIndex = input.indexOf('=')
                // ต้องมี = ก่อน
                if (eqIndex === -1) {
                    playSound('error')
                    return
                }
                const afterEq = input.substring(eqIndex + 1).trim()
                // ต้องมีตัวเลข (จำนวนเงินแรก) หลัง =
                if (!/^\d+$/.test(afterEq) || afterEq.length === 0) {
                    playSound('error')
                    return
                }
                playSound('click')
                setCurrentInput(prev => prev + '*')
            }
            // Escape - clear current input and exit type button focus
            else if (e.key === 'Escape') {
                e.preventDefault()
                setFocusedTypeIndex(-1)
                handleClear()
            }
            // Delete key - clear current input (same as C button)
            else if (e.key === 'Delete') {
                e.preventDefault()
                handleClear()
            }
            // Spacebar - toggle บน/ล่าง (only on desktop with real keyboard)
            else if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault()
                playSound('click')
                setTopBottomToggle(prev => prev === 'top' ? 'bottom' : 'top')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, currentInput, isLocked, lockedAmount, focusedTypeIndex, topBottomToggle])

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            // Save current scroll position and prevent scrolling
            const scrollY = window.scrollY
            document.body.style.position = 'fixed'
            document.body.style.top = `-${scrollY}px`
            document.body.style.left = '0'
            document.body.style.right = '0'
            document.body.style.overflow = 'hidden'
            
            return () => {
                // Restore scroll position when modal closes
                document.body.style.position = ''
                document.body.style.top = ''
                document.body.style.left = ''
                document.body.style.right = ''
                document.body.style.overflow = ''
                window.scrollTo(0, scrollY)
            }
        }
    }, [isOpen])

    // Reset state when modal opens or load editing data
    useEffect(() => {
        if (isOpen) {
            if (editingData) {
                // Load existing data for editing
                setLines(editingData.originalLines || [])
                setBillNote(editingData.billNote || '')
            } else {
                // New submission
                setLines([])
                setBillNote('')
            }
            setCurrentInput('')
            setEditingIndex(null)
            setError('')
            setSuccess(false)
            setFocusedTypeIndex(-1)
            
            // Focus note input when modal opens
            setTimeout(() => {
                if (noteInputRef.current) {
                    noteInputRef.current.focus()
                }
            }, 100)
        }
    }, [isOpen, editingData])

    // Scroll to bottom when new line added or when typing new input
    useEffect(() => {
        if (linesContainerRef.current) {
            linesContainerRef.current.scrollTop = linesContainerRef.current.scrollHeight
        }
    }, [lines, currentInput])

    // Calculate total
    const calculateTotal = () => {
        let total = 0
        lines.forEach(line => {
            const parsed = parseLine(line)
            if (parsed && !parsed.error) {
                const entries = generateEntries(parsed, null, line, { setPrice, lotteryType })
                entries.forEach(e => total += e.amount)
            }
        })
        return total
    }

    // Handle number pad click
    const handleNumberClick = (num) => {
        const input = currentInput.trim()
        
        // ป้องกันไม่ให้ป้อนอะไรหลังข้อความประเภท
        const typeSuffixes = ['เต็งโต๊ด', 'บนกลับ', 'ล่างกลับ', 'หน้ากลับ', 'ถ่างกลับ', 'คูณชุด', 'ตรง', 'โต๊ด', 'บน', 'ล่าง', 'กลับ']
        for (const suffix of typeSuffixes) {
            if (input.endsWith(' ' + suffix)) {
                playSound('error')
                setError('ไม่สามารถป้อนข้อมูลหลังประเภทได้')
                return
            }
        }
        
        // ป้องกันไม่ให้ป้อน 0 เป็นตัวแรกหลัง = (ในส่วนจำนวนเงิน)
        if (num === '0') {
            const eqIndex = input.indexOf('=')
            if (eqIndex !== -1) {
                // มี = แล้ว ตรวจสอบว่าหลัง = มีอะไรบ้าง
                const afterEq = input.substring(eqIndex + 1)
                // ถ้าหลัง = ว่างเปล่า หรือมีแค่ space ห้ามป้อน 0
                if (afterEq.trim() === '') {
                    playSound('error')
                    setError('จำนวนเงินต้องไม่ขึ้นต้นด้วย 0')
                    return
                }
            }
        }
        
        playSound('click')
        setCurrentInput(prev => prev + num)
        setError('')
    }

    // Handle backspace
    const handleBackspace = () => {
        playSound('click')
        setCurrentInput(prev => {
            // Check if input ends with a type suffix (after space)
            // Type suffixes: ตรง, โต๊ด, เต็งโต๊ด, บน, ล่าง, กลับ, บนกลับ, ล่างกลับ, หน้ากลับ, ถ่างกลับ, คูณชุด
            const typeSuffixes = ['เต็งโต๊ด', 'บนกลับ', 'ล่างกลับ', 'หน้ากลับ', 'ถ่างกลับ', 'คูณชุด', 'ตรง', 'โต๊ด', 'บน', 'ล่าง', 'กลับ']
            
            for (const suffix of typeSuffixes) {
                // Check if ends with " suffix" (space + suffix)
                if (prev.endsWith(' ' + suffix)) {
                    // Remove the entire suffix including the space
                    return prev.slice(0, -(suffix.length + 1))
                }
            }
            
            // Normal backspace - remove last character
            return prev.slice(0, -1)
        })
        setError('')
    }

    // Handle clear - clears input AND exits editing mode
    const handleClear = () => {
        playSound('click')
        setCurrentInput('')
        setError('')
        setEditingIndex(null) // Exit editing mode
    }
    
    // Handle clear input only - clears input but stays in editing mode
    const handleClearInputOnly = () => {
        playSound('click')
        setCurrentInput('')
        setError('')
        // Keep editingIndex unchanged - stay in editing mode
    }

    // Handle amount shortcut
    const handleAmountClick = (amount) => {
        const parts = currentInput.trim().split(/\s+/)
        if (parts.length === 1 && /^\d+$/.test(parts[0])) {
            setCurrentInput(prev => prev.trim() + ' ' + amount)
        } else if (parts.length >= 2) {
            parts[1] = amount.toString()
            setCurrentInput(parts.join(' '))
        } else {
            setCurrentInput(prev => prev + amount)
        }
        setError('')
    }

    // Handle type button click - format: 123=50 ล่าง or 123=50*30 บนกลับ
    const handleTypeClick = (type, autoSubmit = false) => {
        let input = currentInput.trim()
        let eqIndex = input.indexOf('=')
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
        
        // Special case: 4ตัวชุด without = (Lao/Hanoi only)
        if (eqIndex === -1 && type === '4ตัวชุด' && isLaoOrHanoi && /^\d{4}$/.test(input)) {
            // Format: 1234=1 4ตัวชุด (1 set by default)
            const displayLine = `${input}=1 4ตัวชุด`
            
            if (autoSubmit) {
                const parsed = parseLine(displayLine.trim())
                if (parsed && parsed.error) {
                    playSound('error')
                    setError(parsed.error)
                    return
                }
                
                playSound('success')
                
                if (editingIndex !== null) {
                    const newLines = [...lines]
                    newLines[editingIndex] = displayLine.trim()
                    setLines(newLines)
                    setEditingIndex(null)
                } else {
                    setLines(prev => [...prev, displayLine.trim()])
                }
                setCurrentInput('')
                setError('')
            } else {
                setCurrentInput(displayLine)
            }
            return
        }
        
        // Special case: Locked amount and input is only numbers (no =)
        // Combine with locked amount and submit directly
        if (eqIndex === -1 && isLocked && lockedAmount && /^\d+$/.test(input) && input.length >= 1 && input.length <= 5) {
            // Combine input with locked amount: 123 + lockedAmount(100*20) = 123=100*20
            input = `${input}=${lockedAmount}`
            eqIndex = input.indexOf('=')
            // Continue to process with the combined input below
        }
        
        if (eqIndex !== -1) {
            const numbers = input.substring(0, eqIndex)
            const afterEq = input.substring(eqIndex + 1).trim()
            const numLen = numbers.length
            const hasSecondAmount = afterEq.includes('*')
            
            let amount1 = ''
            let amount2 = ''
            let displayLine = ''
            
            if (hasSecondAmount) {
                const amountParts = afterEq.split('*')
                amount1 = amountParts[0].trim()
                amount2 = amountParts[1] ? amountParts[1].split(/\s+/)[0].trim() : ''
                displayLine = `${numbers}=${amount1}*${amount2} ${type}`
            } else {
                const parts = afterEq.split(/\s+/)
                amount1 = parts[0] || ''
                
                // Special handling for different types
                if (type === 'บนกลับ' || type === 'ล่างกลับ' || type === 'หน้ากลับ' || type === 'ถ่างกลับ') {
                    // กลับ without * means same amount for both
                    displayLine = `${numbers}=${amount1}*${amount1} ${type}`
                } else if (type === 'เต็งโต๊ด' && numLen === 3) {
                    // เต็งโต๊ด without * means same amount for both
                    displayLine = `${numbers}=${amount1}*${amount1} ${type}`
                } else if (type === 'คูณชุด') {
                    // คูณชุด - calculate permutation count
                    const permCount = getPermutationCount(numbers)
                    displayLine = `${numbers}=${amount1}*${permCount} ${type}`
                } else {
                    displayLine = `${numbers}=${amount1} ${type}`
                }
            }
            
            if (autoSubmit) {
                // Auto submit - add line directly without pressing enter
                const parsed = parseLine(displayLine.trim())
                if (parsed && parsed.error) {
                    playSound('error')
                    setError(parsed.error)
                    return
                }
                
                // Success - play success sound
                playSound('success')
                
                if (editingIndex !== null) {
                    const newLines = [...lines]
                    newLines[editingIndex] = displayLine.trim()
                    setLines(newLines)
                    setEditingIndex(null)
                } else {
                    setLines(prev => [...prev, displayLine.trim()])
                }
                setCurrentInput('')
                setError('')
            } else {
                // Not auto submit - just click sound
                playSound('click')
                setCurrentInput(displayLine + ' ')
            }
        } else {
            playSound('click')
            setCurrentInput(prev => prev.trim() + ' ' + type + ' ')
        }
        setError('')
    }

    // Get default bet type based on digit count, toggle state, and amount format
    // Uses user-selected default from defaultTypes if available
    const getDefaultBetType = (numbers, hasSecondAmount) => {
        const numLen = numbers.length
        const isTop = topBottomToggle === 'top'
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
        
        // Check if user has set a custom default for this digit count
        const userDefault = defaultTypes[numLen]
        if (userDefault) {
            // Map bet type value to label for the line
            const typeLabels = {
                // 1 digit
                'run_top': 'ลอยบน', 'run_bottom': 'ลอยล่าง',
                'front_top_1': 'หน้าบน', 'middle_top_1': 'กลางบน', 'back_top_1': 'หลังบน',
                'front_bottom_1': 'หน้าล่าง', 'back_bottom_1': 'หลังล่าง',
                // 2 digit
                '2_top': 'บน', '2_bottom': 'ล่าง', '2_have': 'มี', '2_front': 'หน้า', '2_spread': 'ถ่าง',
                '2_top_rev': 'บนกลับ', '2_bottom_rev': 'ล่างกลับ', '2_front_rev': 'หน้ากลับ', '2_spread_rev': 'ถ่างกลับ',
                // 3 digit
                '3_top': isLaoOrHanoi ? 'ตรง' : 'บน', '3_tod': 'โต๊ด', '3_bottom': 'ล่าง',
                '3_straight_tod': 'เต็งโต๊ด', '3_perm_from_3': 'กลับ',
                // 4 digit
                '4_set': 'ชุด', '4_float': 'ลอยแพ',
                // 5 digit
                '5_float': 'ลอยแพ'
            }
            const label = typeLabels[userDefault]
            if (label) {
                return { type: label }
            }
        }
        
        // Fallback to original logic if no user default
        if (numLen === 1) {
            // 1 digit - ไม่รองรับ *
            if (hasSecondAmount) return { error: 'เลข 1 ตัวไม่รองรับจำนวนเงิน 2 ชุด' }
            return { type: isTop ? 'ลอยบน' : 'ลอยล่าง' }
        } else if (numLen === 2) {
            if (hasSecondAmount) {
                // มี * - default เป็นกลับ
                return { type: isTop ? 'บนกลับ' : 'ล่างกลับ' }
            } else {
                return { type: isTop ? 'บน' : 'ล่าง' }
            }
        } else if (numLen === 3) {
            if (hasSecondAmount) {
                // มี * - default เป็นเต็งโต๊ด
                if (isTop) {
                    return { type: 'เต็งโต๊ด' }
                } else {
                    // หวยไทย 3ตัวล่าง ไม่รองรับ *, ลาว/ฮานอย ไม่มี 3ตัวล่าง
                    if (isLaoOrHanoi) {
                        return { type: 'เต็งโต๊ด' } // fallback to บน
                    } else {
                        return { error: 'เลข 3 ตัวล่างไม่รองรับจำนวนเงิน 2 ชุด' }
                    }
                }
            } else {
                if (isTop) {
                    return { type: isLaoOrHanoi ? 'ตรง' : 'บน' }
                } else {
                    if (isLaoOrHanoi) {
                        return { type: 'ตรง' } // fallback to ตรง
                    } else {
                        return { type: 'ล่าง' }
                    }
                }
            }
        } else if (numLen === 4) {
            // 4 digit - ไม่รองรับ *
            if (hasSecondAmount) return { error: 'เลข 4 ตัวไม่รองรับจำนวนเงิน 2 ชุด' }
            return { type: 'ลอยแพ' }
        } else if (numLen === 5) {
            // 5 digit - ไม่รองรับ *
            if (hasSecondAmount) return { error: 'เลข 5 ตัวไม่รองรับจำนวนเงิน 2 ชุด' }
            return { type: 'ลอยแพ' }
        }
        
        return { error: 'จำนวนหลักไม่ถูกต้อง' }
    }

    // Handle enter - add line
    const handleEnter = () => {
        let trimmed = currentInput.trim()
        
        // Special case: กด Enter เมื่อ input ว่าง และมี draft อยู่แล้ว
        // ให้ดึงรายการล่าสุดมาเป็นรายการใหม่ (เลข=จำนวนเงิน) เพื่อรอเลือก type
        if (!trimmed && lines.length > 0) {
            const lastLine = lines[lines.length - 1]
            const eqIndex = lastLine.indexOf('=')
            if (eqIndex !== -1) {
                const numbers = lastLine.substring(0, eqIndex)
                const afterEq = lastLine.substring(eqIndex + 1).trim()
                
                // แยกเอาเฉพาะจำนวนเงิน (และ * ถ้ามี) ไม่รวม type
                let amountPart = ''
                if (afterEq.includes('*')) {
                    // มี * - เก็บ amount1*amount2
                    const match = afterEq.match(/^(\d+\*\d+)/)
                    if (match) {
                        amountPart = match[1]
                    }
                } else {
                    // ไม่มี * - เก็บเฉพาะจำนวนเงินแรก
                    const match = afterEq.match(/^(\d+)/)
                    if (match) {
                        amountPart = match[1]
                    }
                }
                
                if (amountPart) {
                    playSound('click')
                    setCurrentInput(`${numbers}=${amountPart}`)
                    setError('')
                    return
                }
            }
            return
        }
        
        if (!trimmed) return

        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)

        // Case 1: ถ้าไม่ล็อค และป้อนแค่ตัวเลข (ไม่มี =) ให้เติม = ต่อท้าย
        if (!isLocked && !trimmed.includes('=')) {
            if (/^\d+$/.test(trimmed)) {
                playSound('click')
                setCurrentInput(trimmed + '=')
                return  // ไม่บันทึก รอให้ป้อนจำนวนเงินต่อ
            }
        }

        // Case 2: ถ้ามี "เลข=จำนวนเงิน" (ไม่มี *) กด Enter ให้เติม * ต่อท้าย
        if (trimmed.includes('=') && !trimmed.includes('*')) {
            const eqIndex = trimmed.indexOf('=')
            const numbers = trimmed.substring(0, eqIndex)
            const afterEq = trimmed.substring(eqIndex + 1).trim()
            
            // ตรวจสอบว่า afterEq เป็นตัวเลขล้วนๆ (ยังไม่มี type)
            if (/^\d+$/.test(numbers) && /^\d+$/.test(afterEq) && afterEq.length > 0) {
                playSound('click')
                setCurrentInput(trimmed + '*')
                return  // ไม่บันทึก รอให้ป้อนจำนวนเงินชุดที่ 2 หรือเลือก type
            }
        }

        // Case 2.5: ถ้ามี "เลข=จำนวนเงิน*" (ลงท้ายด้วย *) กด Enter ให้ duplicate จำนวนเงินที่ 1 เป็นจำนวนเงินที่ 2
        // ใช้ได้กับเลข 2 หลัก และ 3 หลักเท่านั้น
        if (trimmed.includes('=') && trimmed.endsWith('*')) {
            const eqIndex = trimmed.indexOf('=')
            const numbers = trimmed.substring(0, eqIndex)
            const numLen = numbers.length
            
            // ใช้ได้กับ 2-3 หลักเท่านั้น
            if ((numLen === 2 || numLen === 3) && /^\d+$/.test(numbers)) {
                const afterEq = trimmed.substring(eqIndex + 1, trimmed.length - 1) // ตัด * ออก
                if (/^\d+$/.test(afterEq) && afterEq.length > 0) {
                    playSound('click')
                    setCurrentInput(`${numbers}=${afterEq}*${afterEq}`)
                    return
                }
            }
        }

        // ถ้าล็อคราคาอยู่ และป้อนแค่ตัวเลข (ไม่มี =) ให้เติมราคาที่ล็อคไว้อัตโนมัติ
        if (isLocked && lockedAmount && !trimmed.includes('=')) {
            // ตรวจสอบว่าเป็นตัวเลขล้วนๆ
            if (/^\d+$/.test(trimmed)) {
                const numLen = trimmed.length
                
                // ตรวจสอบว่า lockedAmount มี * หรือไม่
                const lockedHasSecondAmount = lockedAmount.includes('*')
                
                // ตรวจสอบ error cases
                if (lockedHasSecondAmount) {
                    if (numLen === 1) {
                        playSound('error')
                        setError('เลข 1 ตัวไม่รองรับจำนวนเงิน 2 ชุด')
                        return
                    }
                    if (numLen === 4) {
                        playSound('error')
                        setError('เลข 4 ตัวไม่รองรับจำนวนเงิน 2 ชุด')
                        return
                    }
                    if (numLen === 5) {
                        playSound('error')
                        setError('เลข 5 ตัวไม่รองรับจำนวนเงิน 2 ชุด')
                        return
                    }
                }
                
                // Get default type
                const defaultResult = getDefaultBetType(trimmed, lockedHasSecondAmount)
                if (defaultResult.error) {
                    playSound('error')
                    setError(defaultResult.error)
                    return
                }
                
                // Build the line with locked amount and default type
                trimmed = `${trimmed}=${lockedAmount} ${defaultResult.type}`
                setCurrentInput(trimmed)
            }
        }

        // ถ้ามี = แต่ไม่มีประเภท ให้เติม default type
        if (trimmed.includes('=')) {
            const eqIndex = trimmed.indexOf('=')
            const numbers = trimmed.substring(0, eqIndex)
            const afterEq = trimmed.substring(eqIndex + 1).trim()
            
            // Check if there's already a type specified (non-numeric text after amount)
            const hasSecondAmount = afterEq.includes('*')
            let hasType = false
            
            if (hasSecondAmount) {
                const parts = afterEq.split('*')
                const afterSecondAmount = parts[1] ? parts[1].trim() : ''
                const typePart = afterSecondAmount.split(/\s+/).slice(1).join(' ')
                hasType = typePart.length > 0 && !/^\d+$/.test(typePart)
            } else {
                const parts = afterEq.split(/\s+/)
                hasType = parts.length > 1 && !/^\d+$/.test(parts.slice(1).join(' '))
            }
            
            if (!hasType && /^\d+$/.test(numbers)) {
                // No type specified, add default
                const defaultResult = getDefaultBetType(numbers, hasSecondAmount)
                if (defaultResult.error) {
                    playSound('error')
                    setError(defaultResult.error)
                    return
                }
                trimmed = `${trimmed} ${defaultResult.type}`
            }
        }

        const parsed = parseLine(trimmed)
        if (parsed && parsed.error) {
            playSound('error')
            setError(parsed.error)
            return
        }

        // Success - play success sound
        playSound('success')

        if (editingIndex !== null) {
            const newLines = [...lines]
            newLines[editingIndex] = trimmed
            setLines(newLines)
            setEditingIndex(null)
        } else {
            setLines(prev => [...prev, trimmed])
        }

        setCurrentInput('')
        setError('')
    }

    // Handle delete line
    const handleDeleteLine = (index) => {
        const newLines = lines.filter((_, i) => i !== index)
        setLines(newLines)
        if (editingIndex === index) {
            setEditingIndex(null)
            setCurrentInput('')
        }
        // ถ้าไม่มีรายการเหลือ ให้ปลดล็อคทันที
        if (newLines.length === 0) {
            setIsLocked(false)
            setLockedAmount('')
        }
    }

    // Handle edit line
    const handleEditLine = (index) => {
        setEditingIndex(index)
        setCurrentInput(lines[index])
    }

    // Handle insert line
    const handleInsertLine = (index) => {
        if (!currentInput.trim()) return
        const parsed = parseLine(currentInput.trim())
        if (parsed && parsed.error) {
            setError(parsed.error)
            return
        }
        const newLines = [...lines]
        newLines.splice(index + 1, 0, currentInput.trim())
        setLines(newLines)
        setCurrentInput('')
        setError('')
    }

    // Handle submit
    const handleSubmit = async () => {
        if (lines.length === 0) {
            setError('กรุณาป้อนข้อมูลอย่างน้อย 1 รายการ')
            return
        }

        setSubmitting(true)
        setError('')

        try {
            const allEntries = []
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                const parsed = parseLine(line)
                if (parsed && !parsed.error) {
                    // Generate unique entryId for each line (group of entries)
                    const entryId = 'E-' + Math.random().toString(36).substring(2, 10).toUpperCase()
                    const entries = generateEntries(parsed, entryId, line, { setPrice, lotteryType })
                    allEntries.push(...entries)
                }
            }

            if (isEditMode && onEditSubmit) {
                // Edit mode - call onEditSubmit with original bill data
                await onEditSubmit({
                    entries: allEntries,
                    billNote,
                    rawLines: lines,
                    originalBillId: editingData.billId,
                    originalItems: editingData.originalItems
                })
            } else {
                // New submission
                await onSubmit({
                    entries: allEntries,
                    billNote,
                    rawLines: lines
                })
            }

            // เคลียร์ข้อมูลทั้งหมดและเตรียมรับข้อมูลใหม่ทันที (ไม่ปิด modal)
            setLines([])
            setCurrentInput('')
            setEditingIndex(null)
            setBillNote('')
            setError('')
            setIsLocked(false)
            setLockedAmount('')
            // Focus note input after clearing
            if (noteInputRef.current) {
                noteInputRef.current.focus()
            }
        } catch (err) {
            setError(err.message || 'เกิดข้อผิดพลาด')
        } finally {
            setSubmitting(false)
        }
    }

    // Handle new bill
    const handleNewBill = () => {
        setLines([])
        setCurrentInput('')
        setEditingIndex(null)
        setBillNote('')
        setError('')
    }

    // Handle close modal with confirmation
    const handleClose = () => {
        // ถ้ามีข้อมูลอยู่ ให้ถามก่อน
        if (lines.length > 0 || currentInput.trim() || billNote.trim()) {
            setShowCloseConfirm(true)
        } else {
            // ไม่มีข้อมูล ปิดได้เลย
            onClose()
        }
    }

    // Confirm close modal
    const confirmClose = () => {
        setShowCloseConfirm(false)
        onClose()
    }

    // Cancel close modal
    const cancelClose = () => {
        setShowCloseConfirm(false)
    }

    // Get available type buttons based on current input and toggle state
    const getAvailableTypeButtons = () => {
        // Parse input: format is "123=50" or "123=50*30" or "123=50 ล่าง"
        let input = currentInput.trim()
        let eqIndex = input.indexOf('=')
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
        
        // Special case: 4 digits in Lao/Hanoi without = shows 4ตัวชุด button
        if (eqIndex === -1) {
            // Check if input is exactly 4 digits for Lao/Hanoi
            if (isLaoOrHanoi && /^\d{4}$/.test(input)) {
                return [{ label: '4ตัวชุด', value: '4ตัวชุด', autoSubmit: true }]
            }
            
            // If locked and input is only numbers, simulate with locked amount
            if (isLocked && lockedAmount && /^\d+$/.test(input) && input.length >= 1 && input.length <= 5) {
                // Simulate input with locked amount to show appropriate buttons
                input = `${input}=${lockedAmount}`
                eqIndex = input.indexOf('=')
            } else {
                return []
            }
        }
        
        const numbers = input.substring(0, eqIndex)
        const afterEq = input.substring(eqIndex + 1).trim()
        
        // Check if amount has * (two amounts)
        const hasSecondAmount = afterEq.includes('*')
        let amount1 = ''
        let amount2 = ''
        
        if (hasSecondAmount) {
            const amountParts = afterEq.split('*')
            amount1 = amountParts[0].trim()
            amount2 = amountParts[1] ? amountParts[1].split(/\s+/)[0].trim() : ''
        } else {
            const parts = afterEq.split(/\s+/)
            amount1 = parts[0] || ''
        }
        
        // Must have first amount entered after =
        if (!amount1 || !/^\d+$/.test(amount1)) return []
        // If has *, must have second amount too
        if (hasSecondAmount && (!amount2 || !/^\d+$/.test(amount2))) return []
        
        const numLen = numbers.length
        if (!/^\d+$/.test(numbers)) return []

        const buttons = []
        const isTop = topBottomToggle === 'top'

        if (numLen === 1) {
            // 1 digit: ลอย, หน้า, กลาง(บนเท่านั้น), หลัง
            // ไม่รองรับ * ในจำนวนเงิน
            if (hasSecondAmount) return []
            
            if (isTop) {
                buttons.push({ label: 'ลอยบน', value: 'ลอยบน', autoSubmit: true })
                buttons.push({ label: 'หน้าบน', value: 'หน้าบน', autoSubmit: true })
                buttons.push({ label: 'กลางบน', value: 'กลางบน', autoSubmit: true })
                buttons.push({ label: 'หลังบน', value: 'หลังบน', autoSubmit: true })
            } else {
                buttons.push({ label: 'ลอยล่าง', value: 'ลอยล่าง', autoSubmit: true })
                buttons.push({ label: 'หน้าล่าง', value: 'หน้าล่าง', autoSubmit: true })
                buttons.push({ label: 'หลังล่าง', value: 'หลังล่าง', autoSubmit: true })
            }
        } else if (numLen === 2) {
            // 2 digits
            if (hasSecondAmount) {
                // มี * ในจำนวนเงิน - แสดงเฉพาะปุ่มกลับ
                if (isTop) {
                    buttons.push({ label: 'บนกลับ', value: 'บนกลับ', autoSubmit: true })
                    buttons.push({ label: 'หน้ากลับ', value: 'หน้ากลับ', autoSubmit: true })
                    buttons.push({ label: 'ถ่างกลับ', value: 'ถ่างกลับ', autoSubmit: true })
                } else {
                    buttons.push({ label: 'ล่างกลับ', value: 'ล่างกลับ', autoSubmit: true })
                }
            } else {
                // ไม่มี * ในจำนวนเงิน
                if (isTop) {
                    buttons.push({ label: 'บน', value: 'บน', autoSubmit: true })
                    buttons.push({ label: 'บนกลับ', value: 'บนกลับ', autoSubmit: true })
                    buttons.push({ label: 'ลอย', value: 'ลอย', autoSubmit: true })
                    buttons.push({ label: 'หน้าบน', value: 'หน้าบน', autoSubmit: true })
                    buttons.push({ label: 'หน้ากลับ', value: 'หน้ากลับ', autoSubmit: true })
                    buttons.push({ label: 'ถ่างบน', value: 'ถ่างบน', autoSubmit: true })
                    buttons.push({ label: 'ถ่างกลับ', value: 'ถ่างกลับ', autoSubmit: true })
                } else {
                    buttons.push({ label: 'ล่าง', value: 'ล่าง', autoSubmit: true })
                    buttons.push({ label: 'ล่างกลับ', value: 'ล่างกลับ', autoSubmit: true })
                }
            }
        } else if (numLen === 3) {
            // 3 digits
            const permCount = getPermutationCount(numbers)
            
            if (hasSecondAmount) {
                // มี * ในจำนวนเงิน - แสดงเฉพาะ เต็งโต๊ด และ กลับ
                if (isTop) {
                    buttons.push({ label: 'เต็งโต๊ด', value: 'เต็งโต๊ด', autoSubmit: true })
                    if (permCount > 1) {
                        buttons.push({ label: 'กลับ', value: 'กลับ', autoSubmit: true })
                    }
                } else {
                    // หวยไทยมี 3ตัวล่าง, ลาว/ฮานอยไม่มี
                    if (!isLaoOrHanoi) {
                        // สำหรับหวยไทย - ไม่มีปุ่มเพราะ 3ตัวล่าง ไม่รองรับ *
                    }
                    // ถ้าเป็นลาว/ฮานอย ไม่แสดงปุ่มเพราะไม่มี 3ตัวล่าง
                }
            } else {
                // ไม่มี * ในจำนวนเงิน
                if (isTop) {
                    if (isLaoOrHanoi) {
                        buttons.push({ label: 'ตรง', value: 'ตรง', autoSubmit: true })
                    } else {
                        buttons.push({ label: 'บน', value: 'บน', autoSubmit: true })
                    }
                    buttons.push({ label: 'เต็งโต๊ด', value: 'เต็งโต๊ด', autoSubmit: true })
                    buttons.push({ label: 'โต๊ด', value: 'โต๊ด', autoSubmit: true })
                    if (permCount > 1) {
                        buttons.push({ label: 'คูณชุด', value: `คูณชุด`, autoSubmit: true })
                    }
                } else {
                    if (!isLaoOrHanoi) {
                        // หวยไทยมี 3ตัวล่าง
                        buttons.push({ label: 'ล่าง', value: 'ล่าง', autoSubmit: true })
                    }
                    // ลาว/ฮานอย ไม่มี 3ตัวล่าง - ไม่แสดงปุ่ม
                }
            }
        } else if (numLen === 4) {
            // 4 digits - ไม่รองรับ * ในจำนวนเงิน
            if (hasSecondAmount) return []
            
            const permCount = getPermutationCount(numbers)
            
            if (isLaoOrHanoi) {
                // ลาว/ฮานอย: 4ตัวชุด, ลอยแพ, คูณชุด
                // ถ้าจำนวนเงินน้อย (<=99) อาจเป็นจำนวนชุด
                const amountNum = parseInt(amount1)
                if (amountNum <= 99) {
                    buttons.push({ label: '4ตัวชุด', value: '4ตัวชุด', autoSubmit: true })
                }
                buttons.push({ label: 'ลอยแพ', value: 'ลอยแพ', autoSubmit: true })
                if (permCount > 1) {
                    buttons.push({ label: 'คูณชุด', value: 'คูณชุด', autoSubmit: true })
                }
            } else {
                // หวยไทย: ลอยแพ, คูณชุด
                buttons.push({ label: 'ลอยแพ', value: 'ลอยแพ', autoSubmit: true })
                if (permCount > 1) {
                    buttons.push({ label: 'คูณชุด', value: 'คูณชุด', autoSubmit: true })
                }
            }
        } else if (numLen === 5) {
            // 5 digits - ไม่รองรับ * ในจำนวนเงิน
            if (hasSecondAmount) return []
            
            const permCount = getPermutationCount(numbers)
            
            buttons.push({ label: 'ลอยแพ', value: 'ลอยแพ', autoSubmit: true })
            if (permCount > 1) {
                buttons.push({ label: 'คูณชุด', value: 'คูณชุด', autoSubmit: true })
            }
        }

        return buttons
    }

    if (!isOpen) return null

    const total = calculateTotal()
    const typeButtons = getAvailableTypeButtons()

    return (
        <div className="write-modal-overlay" onClick={handleClose}>
            <div className="write-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="write-modal-header">
                    <h3>{isEditMode ? '✏️ แก้ไขโพย' : '🖊️ เขียนโพย'}</h3>
                    {roundInfo && (
                        <span className="round-badge">{roundInfo.name}</span>
                    )}
                    {isEditMode && editingData?.billId && (
                        <span className="bill-badge">{editingData.billId}</span>
                    )}
                    <button className="close-btn" onClick={handleClose}>
                        <FiX />
                    </button>
                </div>

                {/* Bill Note + Save Button Row */}
                <div className="write-modal-note-row">
                    <input
                        ref={noteInputRef}
                        type="text"
                        placeholder="ชื่อผู้ซื้อ / บันทึกช่วยจำ (ไม่บังคับ)"
                        value={billNote}
                        onChange={e => setBillNote(e.target.value)}
                        className="note-input"
                    />
                    {!success && (
                        <button 
                            className="save-btn-inline"
                            onClick={handleSubmit}
                            disabled={lines.length === 0 || submitting}
                        >
                            {submitting ? '...' : 'บันทึก'}
                        </button>
                    )}
                </div>

                {/* Lines Display */}
                <div className="write-modal-lines" ref={linesContainerRef}>
                    {lines.length === 0 && !currentInput && (
                        <div className="empty-lines">
                            <p>ยังไม่มีรายการ</p>
                            <p className="hint">กดปุ่มตัวเลขด้านล่างเพื่อเริ่มป้อนข้อมูล</p>
                        </div>
                    )}
                    
                    {lines.map((line, index) => {
                        const parsed = parseLine(line)
                        const hasError = parsed && parsed.error
                        const entries = !hasError ? generateEntries(parsed, null, line, { setPrice, lotteryType }) : []
                        const lineTotal = entries.reduce((sum, e) => sum + e.amount, 0)

                        return (
                            <div 
                                key={index} 
                                className={`line-item ${editingIndex === index ? 'editing' : ''} ${hasError ? 'has-error' : ''}`}
                                onClick={() => handleEditLine(index)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="line-content">
                                    <span className="line-number">{index + 1}.</span>
                                    <span className="line-text">
                                        {(() => {
                                            // Split line into number part and type part
                                            const typeSuffixes = ['เต็งโต๊ด', 'บนกลับ', 'ล่างกลับ', 'หน้ากลับ', 'ถ่างกลับ', 'คูณชุด', '4ตัวชุด', 'ตรง', 'โต๊ด', 'บน', 'ล่าง', 'กลับ', 'ลอย', 'ลอยบน', 'ลอยล่าง', 'ลอยแพ', 'หน้าบน', 'หน้าล่าง', 'ถ่างบน', 'ถ่างล่าง', 'กลางบน', 'หลังบน', 'หลังล่าง']
                                            for (const suffix of typeSuffixes) {
                                                if (line.endsWith(' ' + suffix)) {
                                                    const numPart = line.slice(0, -(suffix.length + 1))
                                                    return <>{numPart} <span className="type-suffix">{suffix}</span></>
                                                }
                                            }
                                            return line
                                        })()}
                                    </span>
                                    {!hasError && entries.length > 1 && (
                                        <span className="line-expand">({entries.length})</span>
                                    )}
                                    {!hasError && (
                                        <span className="line-total">{currencySymbol}{lineTotal.toLocaleString()}</span>
                                    )}
                                    {hasError && (
                                        <span className="line-error">{parsed.error}</span>
                                    )}
                                </div>
                                <div className="line-actions">
                                    <button 
                                        className="action-btn delete"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteLine(index)
                                        }}
                                        title="ลบ"
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                            </div>
                        )
                    })}

                    {/* Current Input Preview */}
                    {(currentInput || editingIndex !== null) && (
                        <div className="line-item current">
                            <div className="line-content">
                                <span className="line-number">▶</span>
                                <span className="line-text">{currentInput}<span className="cursor">|</span></span>
                            </div>
                            <div className="line-actions">
                                <button 
                                    className="action-btn clear"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleClearInputOnly() // Clear input but stay in editing mode
                                    }}
                                    title="เคลียร์ข้อความ"
                                >
                                    <FiX />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Total */}
                <div className="write-modal-total">
                    <span className="line-count">{lines.length} รายการ</span>
                    <span className="total-amount">ยอดรวม: {currencySymbol}{total.toLocaleString()}</span>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="write-modal-error">
                        {error}
                    </div>
                )}

                {/* Success Message */}
                {success && (
                    <div className="write-modal-success">
                        <FiCheck /> บันทึกสำเร็จ!
                        <button className="new-bill-btn" onClick={handleNewBill}>
                            <FiRefreshCw /> เปิดบิลใหม่
                        </button>
                    </div>
                )}

                {/* Type Buttons Row - moved above number pad */}
                {!success && (
                    <div className="type-buttons-row">
                        {typeButtons.length > 0 ? (
                            (() => {
                                const defaultIndex = getDefaultButtonIndex(typeButtons)
                                const digitCount = getCurrentDigitCount()
                                return typeButtons.map((btn, index) => (
                                    <button 
                                        key={btn.value}
                                        ref={el => typeButtonsRef.current[index] = el}
                                        onClick={() => {
                                            handleTypeClick(btn.value, btn.autoSubmit)
                                            setFocusedTypeIndex(-1)
                                        }}
                                        onMouseDown={() => handleTypeButtonMouseDown(btn, digitCount)}
                                        onMouseUp={handleTypeButtonMouseUp}
                                        onMouseLeave={handleTypeButtonMouseLeave}
                                        onTouchStart={() => handleTypeButtonMouseDown(btn, digitCount)}
                                        onTouchEnd={handleTypeButtonMouseUp}
                                        onFocus={() => setFocusedTypeIndex(index)}
                                        onBlur={() => setFocusedTypeIndex(-1)}
                                        className={`type-btn ${btn.autoSubmit ? 'auto' : 'manual'} ${focusedTypeIndex === index ? 'focused' : ''} ${index === defaultIndex ? 'default-btn' : ''}`}
                                        data-type={btn.label}
                                    >
                                        {btn.label}
                                    </button>
                                ))
                            })()
                        ) : (
                            <span className="type-placeholder">ป้อนเลขเพื่อเลือกประเภท</span>
                        )}
                    </div>
                )}

                {/* Input Pad */}
                {!success && (
                    <div className="write-modal-pad">
                        {/* Number Pad - 4 columns */}
                        <div className="number-pad-4col">
                            {/* Row 1: 7, 8, 9, ⌫ */}
                            <button type="button" onClick={() => handleNumberClick('7')}>7</button>
                            <button type="button" onClick={() => handleNumberClick('8')}>8</button>
                            <button type="button" onClick={() => handleNumberClick('9')}>9</button>
                            <button type="button" onClick={handleBackspace} className="backspace">⌫</button>
                            
                            {/* Row 2: 4, 5, 6, C */}
                            <button type="button" onClick={() => handleNumberClick('4')}>4</button>
                            <button type="button" onClick={() => handleNumberClick('5')}>5</button>
                            <button type="button" onClick={() => handleNumberClick('6')}>6</button>
                            <button type="button" onClick={handleClear} className="clear">C</button>
                            
                            {/* Row 3: 1, 2, 3, Toggle บน/ล่าง */}
                            <button type="button" onClick={() => handleNumberClick('1')}>1</button>
                            <button type="button" onClick={() => handleNumberClick('2')}>2</button>
                            <button type="button" onClick={() => handleNumberClick('3')}>3</button>
                            <button 
                                onClick={() => {
                                    playSound('click')
                                    setTopBottomToggle(prev => prev === 'top' ? 'bottom' : 'top')
                                }}
                                className={`toggle-btn ${topBottomToggle}`}
                            >
                                {topBottomToggle === 'top' ? 'บน' : 'ล่าง'}
                            </button>
                            
                            {/* Row 4: 0, Ctrl, ล็อค, Enter */}
                            <button type="button" onClick={() => handleNumberClick('0')}>0</button>
                            <button 
                                onClick={() => {
                                    // Toggle Ctrl state on click (both desktop and mobile)
                                    playSound('click')
                                    setIsCtrlPressed(prev => !prev)
                                }}
                                className={`ctrl-btn ${isCtrlPressed ? 'pressed' : ''}`}
                            >
                                Ctrl
                            </button>
                            <button 
                                onClick={() => {
                                    if (!isLocked) {
                                        // เปิดล็อค - เก็บจำนวนเงินจากรายการล่าสุดที่ป้อนเสร็จ
                                        if (lines.length > 0) {
                                            const lastLine = lines[lines.length - 1]
                                            const eqIndex = lastLine.indexOf('=')
                                            if (eqIndex !== -1) {
                                                const afterEq = lastLine.substring(eqIndex + 1).trim()
                                                const typeStr = afterEq.toLowerCase()
                                                
                                                // ตรวจสอบว่าเป็น คูณชุด หรือไม่ - ถ้าใช่ให้เอาเฉพาะ amount1
                                                const isKoonChud = typeStr.includes('คูณชุด')
                                                
                                                let amountToLock = ''
                                                if (afterEq.includes('*') && !isKoonChud) {
                                                    // มี * และไม่ใช่คูณชุด - เก็บ amount1*amount2
                                                    const match = afterEq.match(/^(\d+\*\d+)/)
                                                    if (match) {
                                                        amountToLock = match[1]
                                                    }
                                                } else {
                                                    // ไม่มี * หรือเป็นคูณชุด - เก็บเฉพาะจำนวนเงินแรก
                                                    const match = afterEq.match(/^(\d+)/)
                                                    if (match) {
                                                        amountToLock = match[1]
                                                    }
                                                }
                                                if (amountToLock) {
                                                    setLockedAmount(amountToLock)
                                                    setIsLocked(true)
                                                    playSound('click')
                                                }
                                            }
                                        } else {
                                            // ไม่มีรายการ - แจ้งเตือน
                                            playSound('error')
                                            setError('กรุณาป้อนอย่างน้อย 1 รายการก่อนล็อค')
                                        }
                                    } else {
                                        // ปิดล็อค
                                        setIsLocked(false)
                                        setLockedAmount('')
                                        playSound('click')
                                    }
                                }}
                                className={`lock-btn ${isLocked ? 'locked' : 'unlocked'}`}
                                title={isLocked ? `ล็อค: ${lockedAmount}` : 'คลิกเพื่อล็อคจำนวนเงิน'}
                            >
                                {isLocked ? `🔒${lockedAmount}` : '🔓'}
                            </button>
                            <button 
                                className="enter-inline"
                                onClick={() => {
                                    // Check if Ctrl is pressed AND input matches "number=amount" format
                                    // (no * yet, no type specified)
                                    if (isCtrlPressed) {
                                        const input = currentInput.trim()
                                        // Pattern: digits=digits (no * and no type)
                                        const ctrlEnterPattern = /^\d+=\d+$/
                                        if (ctrlEnterPattern.test(input)) {
                                            // Ctrl+Enter with "number=amount" - save draft with default type button
                                            const currentTypeButtons = getAvailableTypeButtons()
                                            if (currentTypeButtons.length > 0) {
                                                const defaultIndex = getDefaultButtonIndex(currentTypeButtons)
                                                handleTypeClick(currentTypeButtons[defaultIndex].value, currentTypeButtons[defaultIndex].autoSubmit)
                                            }
                                            return
                                        }
                                    }
                                    // Normal Enter behavior
                                    handleEnter()
                                }}
                                disabled={!currentInput.trim() && lines.length === 0}
                            >
                                ↵
                            </button>
                        </div>
                    </div>
                )}

                {/* Success Footer - only show close button after success */}
                {success && (
                    <div className="write-modal-footer">
                        <button className="close-btn-footer" onClick={onClose}>
                            ปิด
                        </button>
                    </div>
                )}
                
                {/* Close Confirmation Dialog */}
                {showCloseConfirm && (
                    <div className="confirm-dialog-overlay">
                        <div className="confirm-dialog">
                            <h3>ยืนยันการปิด</h3>
                            <p>คุณมีข้อมูลที่ยังไม่ได้บันทึก</p>
                            <p>ต้องการปิดหน้าต่างนี้หรือไม่?</p>
                            <div className="confirm-dialog-buttons">
                                <button className="confirm-btn cancel" onClick={cancelClose}>
                                    ยกเลิก
                                </button>
                                <button className="confirm-btn ok" onClick={confirmClose}>
                                    ปิดเลย
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
