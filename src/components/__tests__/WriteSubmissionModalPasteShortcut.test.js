import { describe, it, expect, vi } from 'vitest'

describe('WriteSubmissionModal - Paste Modal Keyboard Shortcut & Logic', () => {
    // Key shortcut detection logic
    const isCtrlEnterEvent = (e) => {
        const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13
        return Boolean((e.ctrlKey || e.metaKey) && isEnter)
    }

    // Paste flow decision logic
    const resolvePasteAction = ({ clipboardText, currentPasteText, isManualPasteInput }) => {
        const cleanText = (clipboardText || '').trim()
        if (!cleanText) return { action: 'none' }

        // Condition 1: ถ้ายังไม่มีการป้อนข้อมูลด้วยมือ ให้ประมวลผลเลยทันที และบันทึก draft ในฟอร์มป้อนข้อมูล
        if (!currentPasteText.trim() && !isManualPasteInput) {
            return {
                action: 'auto_submit',
                textToProcess: cleanText
            }
        }

        // Condition 2: ถ้ามีการป้อนข้อมูลอยู่แล้ว ให้วางต่อลงใน textarea ต่อจากข้อมูลเดิมในบรรทัดถัดไป และรอการกดปุ่มตกลง หรือ Ctrl+Enter
        const trimmedPrev = currentPasteText.replace(/\s+$/, '')
        const newText = trimmedPrev ? `${trimmedPrev}\n${cleanText}` : cleanText
        return {
            action: 'append',
            newText
        }
    }

    describe('Keyboard Shortcut Detection (Ctrl+Enter / Meta+Enter / NumpadEnter)', () => {
        it('detects standard Ctrl+Enter', () => {
            const event = { ctrlKey: true, metaKey: false, key: 'Enter', code: 'Enter', keyCode: 13 }
            expect(isCtrlEnterEvent(event)).toBe(true)
        })

        it('detects Ctrl + NumpadEnter on numeric keypad', () => {
            const event = { ctrlKey: true, metaKey: false, key: 'Enter', code: 'NumpadEnter', keyCode: 13 }
            expect(isCtrlEnterEvent(event)).toBe(true)
        })

        it('detects Cmd+Enter (metaKey) on macOS', () => {
            const event = { ctrlKey: false, metaKey: true, key: 'Enter', code: 'Enter', keyCode: 13 }
            expect(isCtrlEnterEvent(event)).toBe(true)
        })

        it('does not trigger on plain Enter without Ctrl/Meta (so user can type multiple lines)', () => {
            const plainEnter = { ctrlKey: false, metaKey: false, key: 'Enter', code: 'Enter', keyCode: 13 }
            expect(isCtrlEnterEvent(plainEnter)).toBe(false)

            const numpadEnter = { ctrlKey: false, metaKey: false, key: 'Enter', code: 'NumpadEnter', keyCode: 13 }
            expect(isCtrlEnterEvent(numpadEnter)).toBe(false)
        })

        it('does not trigger on other Ctrl keys (e.g. Ctrl+C, Ctrl+V)', () => {
            const ctrlC = { ctrlKey: true, metaKey: false, key: 'c', code: 'KeyC', keyCode: 67 }
            expect(isCtrlEnterEvent(ctrlC)).toBe(false)
        })
    })

    describe('Paste Flow Conditions', () => {
        it('Condition 1: empty textarea and no manual input auto-submits directly', () => {
            const res = resolvePasteAction({
                clipboardText: '123=50 235=50',
                currentPasteText: '',
                isManualPasteInput: false
            })

            expect(res.action).toBe('auto_submit')
            expect(res.textToProcess).toBe('123=50 235=50')
        })

        it('Condition 2: existing text appends clipboard to next line and waits for submit', () => {
            const res = resolvePasteAction({
                clipboardText: '978=20',
                currentPasteText: '123\n235\n257',
                isManualPasteInput: true
            })

            expect(res.action).toBe('append')
            expect(res.newText).toBe('123\n235\n257\n978=20')
        })

        it('Condition 2: handles trailing whitespace/newlines cleanly when appending', () => {
            const res = resolvePasteAction({
                clipboardText: '456=30\n',
                currentPasteText: '123=50\n\n',
                isManualPasteInput: true
            })

            expect(res.action).toBe('append')
            expect(res.newText).toBe('123=50\n456=30')
        })

        it('ignores blank clipboard content', () => {
            const res = resolvePasteAction({
                clipboardText: '   \n  ',
                currentPasteText: '123',
                isManualPasteInput: true
            })

            expect(res.action).toBe('none')
        })
    })

    describe('Ctrl+Enter submission validation', () => {
        it('triggers submission handler when pasteText has valid content', () => {
            const submitHandler = vi.fn()
            const pasteText = '123=50\n456=50'

            const handleKeyDown = (e) => {
                if (isCtrlEnterEvent(e) && pasteText.trim()) {
                    e.preventDefault?.()
                    submitHandler()
                }
            }

            const mockEvent = {
                ctrlKey: true,
                metaKey: false,
                key: 'Enter',
                code: 'Enter',
                preventDefault: vi.fn()
            }

            handleKeyDown(mockEvent)
            expect(mockEvent.preventDefault).toHaveBeenCalled()
            expect(submitHandler).toHaveBeenCalledTimes(1)
        })

        it('does not trigger submission if pasteText is empty', () => {
            const submitHandler = vi.fn()
            const pasteText = '   '

            const handleKeyDown = (e) => {
                if (isCtrlEnterEvent(e) && pasteText.trim()) {
                    submitHandler()
                }
            }

            handleKeyDown({ ctrlKey: true, key: 'Enter', code: 'Enter' })
            expect(submitHandler).not.toHaveBeenCalled()
        })
    })
})
