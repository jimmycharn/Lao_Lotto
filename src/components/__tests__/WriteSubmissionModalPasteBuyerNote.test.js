import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { extractBuyerNote, parseMultiLinePaste } from '../../utils/pasteParser'

describe('WriteSubmissionModal - Paste Buyer Note to BillNote Feature', () => {
    const componentPath = path.resolve(__dirname, '../WriteSubmissionModal.jsx')
    const fileContent = fs.readFileSync(componentPath, 'utf8')

    it('imports extractBuyerNote from pasteParser', () => {
        expect(fileContent).toMatch(/import\s*\{[^}]*extractBuyerNote[^}]*\}\s*from\s*['"]\.\.\/utils\/pasteParser['"]/)
    })

    it('calls extractBuyerNote and updates billNote in handlePasteNumbers', () => {
        const handlePasteMatch = fileContent.match(/const handlePasteNumbers\s*=\s*async[\s\S]*?setShowPasteModal\(false\)/)
        expect(handlePasteMatch).toBeTruthy()
        const handlePasteCode = handlePasteMatch[0]

        expect(handlePasteCode).toContain('extractBuyerNote(textToProcess, lotteryType)')
        expect(handlePasteCode).toContain('setBillNote(buyerNote)')
    })

    it('extracts buyer note from user exact paste text and matches expected lines', () => {
        const userText = `795=22*20
476=22*20
157=22*20
บน  ล่าง
46=10*10
76=10*10
72=10*10
23=10*10
74=10*10
42=10*10
พี่จิต`
        const note = extractBuyerNote(userText, 'lao')
        expect(note).toBe('พี่จิต')

        const parsed = parseMultiLinePaste(userText, 'lao')
        // 3 3-digit bets (795, 476, 157) + 6 2-digit bets on บน and ล่าง (46, 76, 72, 23, 74, 42) x 2 = 12 -> total 15 bets
        expect(parsed.length).toBe(15)
        expect(parsed.some(p => p.numbers === '795')).toBe(true)
        expect(parsed.some(p => p.numbers === '42')).toBe(true)
    })

    it('prioritizes header buyer name over footer buyer name when both exist', () => {
        const textWithBoth = `พี่จิต
795=22*20
476=22*20
157=22*20
บน  ล่าง
46=10*10
น้องออย`
        const note = extractBuyerNote(textWithBoth, 'lao')
        expect(note).toBe('พี่จิต')
    })

    it('falls back to footer buyer note if header contains purchase numbers', () => {
        const text = `.
14:08 Nadear 544=700x3
647=500
14:11 Nadear บ.ล 93=20*20
ป้าจัด
ล.50 100*100
พี่อร`
        const note = extractBuyerNote(text, 'lao')
        expect(note).toBe('พี่อร')
    })

    it('leaves buyer note empty if both header and footer contain purchase numbers', () => {
        const text = `.
14:08 Nadear 544=700x3
647=500
14:12 Nadear 490=33*6
ล.50 100*100`
        const note = extractBuyerNote(text, 'lao')
        expect(note).toBe('')
    })

    it('has note-clear-btn in WriteSubmissionModal to clear billNote', () => {
        expect(fileContent).toContain('className="note-clear-btn"')
        expect(fileContent).toContain("setBillNote('')")
        expect(fileContent).toContain('noteInputRef.current?.focus()')
    })
})
