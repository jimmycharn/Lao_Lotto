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
        if (typeStr.includes('4ตัวชุด') || typeStr.includes('ชุด')) {
            betType = '4_set'
        } else if (typeStr.includes('คูณชุด')) {
            betType = '3_top'
            specialType = '3xPerm'
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
    const linesContainerRef = useRef(null)
    const noteInputRef = useRef(null)
    const modalRef = useRef(null)
    const isEditMode = !!editingData

    // Handle keyboard input for desktop
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e) => {
            // Ignore if typing in note input
            if (document.activeElement === noteInputRef.current) return
            
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
            // Enter
            else if (e.key === 'Enter') {
                e.preventDefault()
                handleEnter()
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
            // Escape - clear current input
            else if (e.key === 'Escape') {
                e.preventDefault()
                handleClear()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, currentInput, isLocked, lockedAmount])

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
        // ป้องกันไม่ให้ป้อน 0 เป็นตัวแรกหลัง = (ในส่วนจำนวนเงิน)
        if (num === '0') {
            const input = currentInput.trim()
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
        setCurrentInput(prev => prev.slice(0, -1))
        setError('')
    }

    // Handle clear
    const handleClear = () => {
        playSound('click')
        setCurrentInput('')
        setError('')
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
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        
        if (eqIndex !== -1) {
            const numbers = input.substring(0, eqIndex)
            const afterEq = input.substring(eqIndex + 1).trim()
            const numLen = numbers.length
            const hasSecondAmount = afterEq.includes('*')
            const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
            
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
    const getDefaultBetType = (numbers, hasSecondAmount) => {
        const numLen = numbers.length
        const isTop = topBottomToggle === 'top'
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)
        
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

            setSuccess(true)
            // เคลียร์ข้อมูลทั้งหมดและเตรียมรับข้อมูลใหม่ทันที
            setTimeout(() => {
                setLines([])
                setCurrentInput('')
                setEditingIndex(null)
                setBillNote('')
                setError('')
                setSuccess(false)
                setIsLocked(false)
                setLockedAmount('')
                // Focus note input after clearing
                if (noteInputRef.current) {
                    noteInputRef.current.focus()
                }
            }, 1500) // แสดง success 1.5 วินาที แล้วเคลียร์
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
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        
        // Only show type buttons after entering amount (after =)
        if (eqIndex === -1) return []
        
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
        const isLaoOrHanoi = ['lao', 'hanoi'].includes(lotteryType)

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
                                    <span className="line-text">{line}</span>
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
                    {currentInput && (
                        <div className="line-item current">
                            <div className="line-content">
                                <span className="line-number">▶</span>
                                <span className="line-text">{currentInput}<span className="cursor">|</span></span>
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
                            typeButtons.map(btn => (
                                <button 
                                    key={btn.value}
                                    onClick={() => handleTypeClick(btn.value, btn.autoSubmit)}
                                    className={`type-btn ${btn.autoSubmit ? 'auto' : 'manual'}`}
                                    data-type={btn.label}
                                >
                                    {btn.label}
                                </button>
                            ))
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
                                    if (!isLocked) {
                                        setTopBottomToggle(prev => prev === 'top' ? 'bottom' : 'top')
                                    }
                                }}
                                className={`toggle-btn ${topBottomToggle} ${isLocked ? 'disabled' : ''}`}
                                disabled={isLocked}
                            >
                                {topBottomToggle === 'top' ? 'บน' : 'ล่าง'}
                            </button>
                            
                            {/* Row 4: 0, =, ล็อค, Enter */}
                            <button type="button" onClick={() => handleNumberClick('0')}>0</button>
                            <button 
                                onClick={() => {
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
                                    // ถ้าล็อคอยู่ ให้เติม = และจำนวนเงินที่ล็อคไว้
                                    if (isLocked && lockedAmount) {
                                        setCurrentInput(prev => prev + '=' + lockedAmount)
                                    } else {
                                        setCurrentInput(prev => prev + '=')
                                    }
                                }} 
                                className="eq-btn"
                            >
                                =
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
                                                // แยกเอาเฉพาะจำนวนเงิน (และ * ถ้ามี) ไม่รวม type
                                                let amountToLock = ''
                                                if (afterEq.includes('*')) {
                                                    // มี * - เก็บ amount1*amount2
                                                    const match = afterEq.match(/^(\d+\*\d+)/)
                                                    if (match) {
                                                        amountToLock = match[1]
                                                    }
                                                } else {
                                                    // ไม่มี * - เก็บเฉพาะจำนวนเงินแรก
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
                                onClick={handleEnter}
                                disabled={!currentInput.trim()}
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
