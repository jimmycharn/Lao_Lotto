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
// Supports both formats: "123 50 ล่าง" (old) and "123=50 ล่าง" (new)
const parseLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return null

    let numbers, amount, typeStr
    
    // Check if using new format with =
    if (trimmed.includes('=')) {
        const eqIndex = trimmed.indexOf('=')
        numbers = trimmed.substring(0, eqIndex).trim()
        const afterEq = trimmed.substring(eqIndex + 1).trim()
        const parts = afterEq.split(/\s+/)
        amount = parseInt(parts[0])
        typeStr = parts.slice(1).join(' ').toLowerCase()
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

    // Parse type and options
    let betType = null
    let reverseAmount = null
    let specialType = null

    const numLen = numbers.length

    if (numLen === 1) {
        // 1 digit: วิ่งบน/ล่าง, หน้าบน/ล่าง, กลางบน, หลังบน/ล่าง
        if (typeStr.includes('วิ่งล่าง')) {
            betType = 'run_bottom'
        } else if (typeStr.includes('วิ่งบน')) {
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
        // 2 digits: 2ตัวบน/ล่าง, 2ตัวมี, 2ตัวหน้า, 2ตัวถ่าง, กลับ
        if (typeStr.includes('2ตัวล่างกลับ') || typeStr.includes('ล่างกลับ')) {
            betType = '2_bottom'
            specialType = 'reverse'
            const match = typeStr.match(/(?:2ตัว)?ล่างกลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('2ตัวบนกลับ') || typeStr.includes('บนกลับ') || (typeStr.includes('กลับ') && !typeStr.includes('ล่าง'))) {
            betType = '2_top'
            specialType = 'reverse'
            const match = typeStr.match(/(?:2ตัว)?(?:บน)?กลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('2ตัวมี')) {
            betType = '2_teng'
        } else if (typeStr.includes('2ตัวหน้า')) {
            betType = '2_front'
            // Check for reverse amount
            const match = typeStr.match(/2ตัวหน้า\s*(\d+)?/)
            if (match && match[1]) {
                reverseAmount = parseInt(match[1])
                specialType = 'reverse'
            }
        } else if (typeStr.includes('2ตัวถ่าง')) {
            betType = '2_tang'
            // Check for reverse amount
            const match = typeStr.match(/2ตัวถ่าง\s*(\d+)?/)
            if (match && match[1]) {
                reverseAmount = parseInt(match[1])
                specialType = 'reverse'
            }
        } else if (typeStr.includes('2ตัวล่าง') || typeStr.includes('ล่าง')) {
            betType = '2_bottom'
        } else if (typeStr.includes('2ตัวบน')) {
            betType = '2_top'
        } else {
            betType = '2_top'
        }
    } else if (numLen === 3) {
        // 3 digits: 3ตัวบน/ตรง, 3ตัวโต๊ด, 3ตัวล่าง, เต็งโต๊ด, กลับ, คูณชุด
        const permCount = getPermutationCount(numbers)
        if (typeStr.includes('คูณชุด')) {
            betType = '3_top'
            specialType = permCount === 3 ? 'set3' : 'set6'
        } else if (typeStr.includes('เต็งโต๊ด')) {
            betType = '3_top'
            specialType = 'tengTod'
            const match = typeStr.match(/เต็งโต๊ด\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('3ตัวโต๊ด') || typeStr.includes('โต๊ด')) {
            betType = '3_tod'
        } else if (typeStr.includes('กลับ')) {
            betType = '3_top'
            specialType = 'reverse'
            const match = typeStr.match(/กลับ\s*\d*\s*(\d+)?$/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('3ตัวล่าง') || typeStr.includes('ล่าง')) {
            betType = '3_bottom'
        } else {
            betType = '3_top'
        }
    } else if (numLen === 4) {
        // 4 digits: 4ตัวชุด, ลอยแพ, 3xPerm
        if (typeStr.includes('4ตัวชุด') || typeStr.includes('ชุด')) {
            betType = '4_set'
        } else if (typeStr.includes('ลอยแพ') || typeStr.includes('ลอย')) {
            betType = '4_run'
        } else if (typeStr.includes('3xPerm') || typeStr.includes('3x')) {
            betType = '3_top'
            specialType = '3xPerm'
        } else {
            betType = '4_run'
        }
    } else if (numLen === 5) {
        // 5 digits: ลอยแพ, 3xPerm
        if (typeStr.includes('ลอยแพ') || typeStr.includes('ลอย')) {
            betType = '5_run'
        } else if (typeStr.includes('3xPerm') || typeStr.includes('3x')) {
            betType = '3_top'
            specialType = '3xPerm'
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
    const isEditMode = !!editingData

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

    // Handle type button click - format: 123=50 ล่าง
    const handleTypeClick = (type, autoSubmit = false) => {
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        
        if (eqIndex !== -1) {
            const beforeEq = input.substring(0, eqIndex + 1)
            const afterEq = input.substring(eqIndex + 1).trim()
            const parts = afterEq.split(/\s+/)
            const amount = parts[0] || ''
            
            // Format: 123=50 ล่าง
            const newLine = beforeEq + amount + ' ' + type
            
            if (autoSubmit) {
                // Auto submit - add line directly without pressing enter
                const parsed = parseLine(newLine.trim())
                if (parsed && parsed.error) {
                    playSound('error')
                    setError(parsed.error)
                    return
                }
                
                // Success - play success sound
                playSound('success')
                
                if (editingIndex !== null) {
                    const newLines = [...lines]
                    newLines[editingIndex] = newLine.trim()
                    setLines(newLines)
                    setEditingIndex(null)
                } else {
                    setLines(prev => [...prev, newLine.trim()])
                }
                setCurrentInput('')
                setError('')
            } else {
                // Not auto submit - just click sound
                playSound('click')
                setCurrentInput(newLine + ' ')
            }
        } else {
            playSound('click')
            setCurrentInput(prev => prev.trim() + ' ' + type + ' ')
        }
        setError('')
    }

    // Handle enter - add line
    const handleEnter = () => {
        let trimmed = currentInput.trim()
        if (!trimmed) return

        // ถ้าล็อคราคาอยู่ และป้อนแค่ตัวเลข (ไม่มี =) ให้เติมราคาที่ล็อคไว้อัตโนมัติ
        if (isLocked && lockedAmount && !trimmed.includes('=')) {
            // ตรวจสอบว่าเป็นตัวเลขล้วนๆ
            if (/^\d+$/.test(trimmed)) {
                // ตรวจสอบว่า lockedAmount เป็นตัวเลขล้วนๆ หรือมีข้อความประเภทตามหลัง
                const isAmountOnly = /^\d+$/.test(lockedAmount.trim())
                
                // หาจำนวนหลักของรายการล่าสุด
                let lastDigitCount = 0
                if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1]
                    const lastNumbers = lastLine.split('=')[0].trim()
                    lastDigitCount = lastNumbers.length
                }
                
                // ถ้าจำนวนหลักเปลี่ยนไป และ lockedAmount มีข้อความประเภท (เช่น คูณชุด) ให้ปลดล็อคและแจ้งเตือน
                // แต่ถ้า lockedAmount เป็นตัวเลขล้วนๆ ให้บันทึกได้เลย
                if (lastDigitCount > 0 && trimmed.length !== lastDigitCount && !isAmountOnly) {
                    playSound('error')
                    setIsLocked(false)
                    setLockedAmount('')
                    setError(`จำนวนหลักไม่ตรงกัน (${lastDigitCount} หลัก → ${trimmed.length} หลัก) กรุณาป้อนให้ครบ`)
                    return
                }
                
                // ปรับ multiplier ตามจำนวน permutation ของเลขปัจจุบัน
                let adjustedAmount = lockedAmount
                
                // ถ้าเลขเป็น 3 หลัก และ lockedAmount มีคำว่า คูณชุด หรือ กลับ
                if (trimmed.length === 3 && (lockedAmount.includes('คูณชุด') || lockedAmount.includes('กลับ'))) {
                    const currentPermCount = getPermutationCount(trimmed)
                    // แยกจำนวนเงินหลักออกจาก multiplier
                    const amountMatch = lockedAmount.match(/^(\d+)/)
                    const baseAmount = amountMatch ? amountMatch[1] : lockedAmount
                    
                    if (lockedAmount.includes('คูณชุด')) {
                        // ปรับ คูณชุด
                        if (currentPermCount === 6) {
                            adjustedAmount = baseAmount + ' คูณชุด6'
                        } else if (currentPermCount === 3) {
                            adjustedAmount = baseAmount + ' คูณชุด3'
                        } else if (currentPermCount === 1) {
                            // เลขซ้ำทั้งหมด เช่น 111 - ไม่ต้องใส่ คูณชุด
                            adjustedAmount = baseAmount
                        } else {
                            adjustedAmount = baseAmount + ' คูณชุด' + currentPermCount
                        }
                    } else if (lockedAmount.includes('กลับ')) {
                        // ปรับ กลับ
                        if (currentPermCount === 6) {
                            adjustedAmount = baseAmount + ' กลับ5'
                        } else if (currentPermCount === 3) {
                            adjustedAmount = baseAmount + ' กลับ2'
                        } else if (currentPermCount === 1) {
                            // เลขซ้ำทั้งหมด เช่น 111 - ไม่ต้องใส่ กลับ
                            adjustedAmount = baseAmount
                        } else {
                            adjustedAmount = baseAmount + ' กลับ' + (currentPermCount - 1)
                        }
                    }
                }
                
                trimmed = trimmed + '=' + adjustedAmount
                setCurrentInput(trimmed)
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
        // Parse input: format is "123=50" or "123=50 ล่าง"
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        
        // Only show type buttons after entering amount (after =)
        if (eqIndex === -1) return []
        
        const numbers = input.substring(0, eqIndex)
        const afterEq = input.substring(eqIndex + 1).trim()
        const parts = afterEq.split(/\s+/)
        const amount = parts[0] || ''
        
        // Must have amount entered after =
        if (!amount || !/^\d+$/.test(amount)) return []
        
        const numLen = numbers.length

        if (!/^\d+$/.test(numbers)) return []

        const buttons = []
        const isTop = topBottomToggle === 'top'

        if (numLen === 1) {
            // 1 digit: วิ่ง, หน้า, กลาง(บนเท่านั้น), หลัง
            if (isTop) {
                buttons.push({ label: 'วิ่งบน', value: 'วิ่งบน', autoSubmit: true })
                buttons.push({ label: 'หน้าบน', value: 'หน้าบน', autoSubmit: true })
                buttons.push({ label: 'กลางบน', value: 'กลางบน', autoSubmit: true })
                buttons.push({ label: 'หลังบน', value: 'หลังบน', autoSubmit: true })
            } else {
                buttons.push({ label: 'วิ่งล่าง', value: 'วิ่งล่าง', autoSubmit: true })
                buttons.push({ label: 'หน้าล่าง', value: 'หน้าล่าง', autoSubmit: true })
                buttons.push({ label: 'หลังล่าง', value: 'หลังล่าง', autoSubmit: true })
            }
        } else if (numLen === 2) {
            // 2 digits
            if (isTop) {
                buttons.push({ label: '2ตัวบน', value: '2ตัวบน', autoSubmit: true })
                buttons.push({ label: '2ตัวมี', value: '2ตัวมี', autoSubmit: true })
                buttons.push({ label: '2ตัวหน้า', value: '2ตัวหน้า', autoSubmit: false })
                buttons.push({ label: '2ตัวถ่าง', value: '2ตัวถ่าง', autoSubmit: false })
                buttons.push({ label: '2ตัวบนกลับ', value: '2ตัวบนกลับ', autoSubmit: false })
            } else {
                buttons.push({ label: '2ตัวล่าง', value: '2ตัวล่าง', autoSubmit: true })
                buttons.push({ label: '2ตัวล่างกลับ', value: '2ตัวล่างกลับ', autoSubmit: false })
            }
        } else if (numLen === 3) {
            // 3 digits
            if (isTop) {
                buttons.push({ label: '3ตัวโต๊ด', value: '3ตัวโต๊ด', autoSubmit: true })
                buttons.push({ label: 'เต็งโต๊ด', value: 'เต็งโต๊ด', autoSubmit: false })
                
                const permCount = getPermutationCount(numbers)
                if (permCount > 1) {
                    buttons.push({ label: `กลับ${permCount - 1}`, value: `กลับ${permCount - 1}`, autoSubmit: false })
                    buttons.push({ label: `คูณชุด${permCount}`, value: `คูณชุด${permCount}`, autoSubmit: true })
                }
            } else {
                buttons.push({ label: '3ตัวล่าง', value: '3ตัวล่าง', autoSubmit: true })
            }
        } else if (numLen === 4) {
            // 4 digits - no top/bottom distinction
            buttons.push({ label: '4ตัวชุด', value: '4ตัวชุด', autoSubmit: true })
            buttons.push({ label: 'ลอยแพ', value: 'ลอยแพ', autoSubmit: true })
            buttons.push({ label: '3xPerm', value: '3xPerm', autoSubmit: true })
        } else if (numLen === 5) {
            // 5 digits - no top/bottom distinction
            buttons.push({ label: 'ลอยแพ', value: 'ลอยแพ', autoSubmit: true })
            buttons.push({ label: '3xPerm', value: '3xPerm', autoSubmit: true })
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
                                                // แยกเอาเฉพาะจำนวนเงินหลัก (ตัวเลขแรก)
                                                const amountMatch = afterEq.match(/^(\d+)/)
                                                if (amountMatch) {
                                                    // เก็บทั้งหมดหลัง = (รวม คูณชุด ถ้ามี)
                                                    setLockedAmount(afterEq)
                                                    setIsLocked(true)
                                                }
                                            }
                                        }
                                    } else {
                                        // ปิดล็อค
                                        setIsLocked(false)
                                        setLockedAmount('')
                                    }
                                }}
                                className={`lock-btn ${isLocked ? 'locked' : 'unlocked'}`}
                            >
                                {isLocked ? 'ล็อค' : 'ไม่ล็อค'}
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
