import { useState, useEffect, useRef } from 'react'
import { FiX, FiTrash2, FiEdit2, FiPlus, FiCheck, FiRefreshCw } from 'react-icons/fi'
import { getPermutations } from '../constants/lotteryTypes'
import './WriteSubmissionModal.css'

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
        if (typeStr.includes('ล่าง')) {
            betType = 'run_bottom'
        } else {
            betType = 'run_top'
        }
    } else if (numLen === 2) {
        if (typeStr.includes('ล่างกลับ')) {
            betType = '2_bottom'
            specialType = 'reverse'
            const match = typeStr.match(/ล่างกลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('บนกลับ') || (typeStr.includes('กลับ') && !typeStr.includes('ล่าง'))) {
            betType = '2_top'
            specialType = 'reverse'
            const match = typeStr.match(/(?:บน)?กลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('ล่าง')) {
            betType = '2_bottom'
        } else {
            betType = '2_top'
        }
    } else if (numLen === 3) {
        if (typeStr.includes('คูณชุด6') || typeStr.includes('ชุด6')) {
            betType = '3_top'
            specialType = 'set6'
        } else if (typeStr.includes('คูณชุด3') || typeStr.includes('ชุด3')) {
            betType = '3_top'
            specialType = 'set3'
        } else if (typeStr.includes('เต็งโต๊ด')) {
            betType = '3_top'
            specialType = 'tengTod'
            const match = typeStr.match(/เต็งโต๊ด\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('โต๊ด')) {
            betType = '3_tod'
        } else if (typeStr.includes('กลับ')) {
            betType = '3_top'
            specialType = 'reverse'
            const match = typeStr.match(/กลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('ล่าง')) {
            betType = '3_bottom'
        } else {
            betType = '3_top'
        }
    } else if (numLen === 4) {
        const permCount = getPermutationCount(numbers)
        if (typeStr.includes('ลอย')) {
            betType = '4_run'
        } else if (typeStr.includes('กลับ24') || typeStr.includes('กลับ 24')) {
            betType = '4_run'
            specialType = 'reverse24'
            const match = typeStr.match(/กลับ\s*24\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('กลับ12') || typeStr.includes('กลับ 12')) {
            betType = '4_run'
            specialType = 'reverse12'
            const match = typeStr.match(/กลับ\s*12\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('กลับ6') || typeStr.includes('กลับ 6')) {
            betType = '4_run'
            specialType = 'reverse6'
            const match = typeStr.match(/กลับ\s*6\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('กลับ4') || typeStr.includes('กลับ 4')) {
            betType = '4_run'
            specialType = 'reverse4'
            const match = typeStr.match(/กลับ\s*4\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else if (typeStr.includes('กลับ')) {
            betType = '4_run'
            specialType = `reverse${permCount}`
            const match = typeStr.match(/กลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        } else {
            betType = '4_run'
        }
    } else if (numLen === 5) {
        betType = '5_run'
        if (typeStr.includes('กลับ')) {
            const permCount = getPermutationCount(numbers)
            specialType = `reverse${permCount}`
            const match = typeStr.match(/กลับ\s*(\d+)?/)
            if (match && match[1]) reverseAmount = parseInt(match[1])
        }
    }

    return {
        numbers,
        amount,
        betType,
        specialType,
        reverseAmount,
        raw: trimmed
    }
}

// Generate entries from parsed line with display info for grouped view
const generateEntries = (parsed, entryId, rawLine) => {
    if (!parsed || parsed.error) return []

    const { numbers, amount, betType, specialType, reverseAmount } = parsed
    const entries = []
    
    // Calculate total amount and count for display
    let totalAmount = amount
    let entryCount = 1
    
    // Build display text from raw line (the original input)
    const displayText = rawLine || `${numbers}=${amount}`

    if (specialType === 'reverse') {
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
        entryCount = reverseAmount ? 2 : 1
        totalAmount = amount + (reverseAmount || 0)
        
        entries.push({ numbers, amount, betType: '3_top', entryId, displayText, displayAmount: totalAmount })
        if (reverseAmount) {
            entries.push({ numbers, amount: reverseAmount, betType: '3_tod', entryId, displayText, displayAmount: totalAmount })
        }
    } else if (specialType && specialType.startsWith('reverse')) {
        // 4 or 5 digits reverse
        const perms = getPermutations(numbers)
        entryCount = perms.length
        totalAmount = amount + (reverseAmount || amount) * (perms.length - 1)
        
        entries.push({ numbers, amount, betType, entryId, displayText, displayAmount: totalAmount })
        perms.filter(p => p !== numbers).forEach(p => {
            entries.push({ numbers: p, amount: reverseAmount || amount, betType, entryId, displayText, displayAmount: totalAmount })
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
        '2_top': '2 ตัวบน',
        '2_bottom': '2 ตัวล่าง',
        '3_top': '3 ตัวบน',
        '3_tod': '3 ตัวโต๊ด',
        '3_bottom': '3 ตัวล่าง',
        '4_run': '4 ตัวลอย',
        '5_run': '5 ตัวลอย'
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
    onEditSubmit = null
}) {
    const [lines, setLines] = useState([])
    const [currentInput, setCurrentInput] = useState('')
    const [editingIndex, setEditingIndex] = useState(null)
    const [billNote, setBillNote] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [submitting, setSubmitting] = useState(false)
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
                const entries = generateEntries(parsed)
                entries.forEach(e => total += e.amount)
            }
        })
        return total
    }

    // Handle number pad click
    const handleNumberClick = (num) => {
        setCurrentInput(prev => prev + num)
        setError('')
    }

    // Handle backspace
    const handleBackspace = () => {
        setCurrentInput(prev => prev.slice(0, -1))
        setError('')
    }

    // Handle clear
    const handleClear = () => {
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
    const handleTypeClick = (type) => {
        const input = currentInput.trim()
        const eqIndex = input.indexOf('=')
        
        if (eqIndex !== -1) {
            const beforeEq = input.substring(0, eqIndex + 1)
            const afterEq = input.substring(eqIndex + 1).trim()
            const parts = afterEq.split(/\s+/)
            const amount = parts[0] || ''
            
            // Format: 123=50 ล่าง (with space for next amount)
            setCurrentInput(beforeEq + amount + ' ' + type + ' ')
        } else {
            setCurrentInput(prev => prev.trim() + ' ' + type + ' ')
        }
        setError('')
    }

    // Handle enter - add line
    const handleEnter = () => {
        const trimmed = currentInput.trim()
        if (!trimmed) return

        const parsed = parseLine(trimmed)
        if (parsed && parsed.error) {
            setError(parsed.error)
            return
        }

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
        setLines(prev => prev.filter((_, i) => i !== index))
        if (editingIndex === index) {
            setEditingIndex(null)
            setCurrentInput('')
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
                    const entries = generateEntries(parsed, entryId, line)
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
        setSuccess(false)
    }

    // Get available type buttons based on current input
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

        if (numLen === 1) {
            // 1 digit: ล่าง only (บน is default, no need to show)
            buttons.push({ label: 'ล่าง', value: 'ล่าง' })
        } else if (numLen === 2) {
            // 2 digits: ล่าง, ลอย, บนกลับ, ล่างกลับ (บน is default)
            buttons.push({ label: 'ล่าง', value: 'ล่าง' })
            buttons.push({ label: 'ลอย', value: 'ลอย' })
            buttons.push({ label: 'บนกลับ', value: 'บนกลับ' })
            buttons.push({ label: 'ล่างกลับ', value: 'ล่างกลับ' })
        } else if (numLen === 3) {
            // 3 digits: ล่าง, โต๊ด, เต็งโต๊ด, กลับ, คูณชุด (บน is default)
            buttons.push({ label: 'ล่าง', value: 'ล่าง' })
            buttons.push({ label: 'โต๊ด', value: 'โต๊ด' })
            buttons.push({ label: 'เต็งโต๊ด', value: 'เต็งโต๊ด' })
            buttons.push({ label: 'กลับ', value: 'กลับ' })
            
            const permCount = getPermutationCount(numbers)
            if (permCount === 3) {
                buttons.push({ label: 'คูณชุด3', value: 'คูณชุด3' })
            } else if (permCount === 6) {
                buttons.push({ label: 'คูณชุด6', value: 'คูณชุด6' })
            }
        } else if (numLen === 4) {
            buttons.push({ label: 'ลอย', value: 'ลอย' })
            
            const permCount = getPermutationCount(numbers)
            if (permCount === 24) {
                buttons.push({ label: 'กลับ24', value: 'กลับ24' })
            } else if (permCount === 12) {
                buttons.push({ label: 'กลับ12', value: 'กลับ12' })
            } else if (permCount === 6) {
                buttons.push({ label: 'กลับ6', value: 'กลับ6' })
            } else if (permCount === 4) {
                buttons.push({ label: 'กลับ4', value: 'กลับ4' })
            }
        } else if (numLen === 5) {
            buttons.push({ label: 'ลอย', value: 'ลอย' })
            const permCount = getPermutationCount(numbers)
            if (permCount > 1) {
                buttons.push({ label: `กลับ${permCount}`, value: `กลับ${permCount}` })
            }
        }

        return buttons
    }

    if (!isOpen) return null

    const total = calculateTotal()
    const typeButtons = getAvailableTypeButtons()

    return (
        <div className="write-modal-overlay" onClick={onClose}>
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
                    <button className="close-btn" onClick={onClose}>
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
                        const entries = !hasError ? generateEntries(parsed) : []
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

                {/* Input Pad */}
                {!success && (
                    <div className="write-modal-pad">
                        {/* Number Pad - 4 columns */}
                        <div className="number-pad-4col">
                            {/* Row 1: 7, 8, 9, ⌫ */}
                            <button onClick={() => handleNumberClick('7')}>7</button>
                            <button onClick={() => handleNumberClick('8')}>8</button>
                            <button onClick={() => handleNumberClick('9')}>9</button>
                            <button onClick={handleBackspace} className="backspace">⌫</button>
                            
                            {/* Row 2: 4, 5, 6, C */}
                            <button onClick={() => handleNumberClick('4')}>4</button>
                            <button onClick={() => handleNumberClick('5')}>5</button>
                            <button onClick={() => handleNumberClick('6')}>6</button>
                            <button onClick={handleClear} className="clear">C</button>
                            
                            {/* Row 3: 1, 2, 3, Type Button */}
                            <button onClick={() => handleNumberClick('1')}>1</button>
                            <button onClick={() => handleNumberClick('2')}>2</button>
                            <button onClick={() => handleNumberClick('3')}>3</button>
                            {typeButtons.length > 0 ? (
                                <button 
                                    onClick={() => handleTypeClick(typeButtons[0].value)}
                                    className="type-inline"
                                >
                                    {typeButtons[0].label}
                                </button>
                            ) : (
                                <button disabled className="type-inline disabled">-</button>
                            )}
                            
                            {/* Row 4: 0, Space (wide), Enter */}
                            <button onClick={() => handleNumberClick('0')}>0</button>
                            <button 
                                onClick={() => setCurrentInput(prev => prev + '=')} 
                                className="space-btn"
                            >
                                =
                            </button>
                            <button 
                                className="enter-inline"
                                onClick={handleEnter}
                                disabled={!currentInput.trim()}
                            >
                                ↵
                            </button>
                        </div>

                        {/* Type Buttons Row - always show container for fixed height */}
                        <div className="type-buttons-row">
                            {typeButtons.length > 0 ? (
                                typeButtons.map(btn => (
                                    <button 
                                        key={btn.value}
                                        onClick={() => handleTypeClick(btn.value)}
                                        className="type-btn"
                                    >
                                        {btn.label}
                                    </button>
                                ))
                            ) : (
                                <span className="type-placeholder">ป้อนเลขเพื่อเลือกประเภท</span>
                            )}
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
            </div>
        </div>
    )
}
