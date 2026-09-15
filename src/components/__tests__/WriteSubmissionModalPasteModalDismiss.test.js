import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('WriteSubmissionModal - Paste Modal Dismiss & Resize Safety', () => {
    const componentPath = path.resolve(__dirname, '../WriteSubmissionModal.jsx')
    const fileContent = fs.readFileSync(componentPath, 'utf8')

    it('does NOT have an onClick handler on confirm-dialog-overlay for showPasteModal', () => {
        // Find the block rendering showPasteModal
        const pasteModalMatch = fileContent.match(/\{showPasteModal\s*&&[\s\S]*?<div className="confirm-dialog-overlay"([^>]*)>/)
        expect(pasteModalMatch).toBeTruthy()
        
        const overlayProps = pasteModalMatch[1]
        // Overlay should not have onClick that sets setShowPasteModal(false)
        expect(overlayProps).not.toContain('onClick')
    })

    it('has explicit close button (X) with close handler in header', () => {
        const headerBlockMatch = fileContent.match(/<div className="paste-modal-header">[\s\S]*?<\/div>/)
        expect(headerBlockMatch).toBeTruthy()
        const headerBlock = headerBlockMatch[0]

        expect(headerBlock).toContain('setShowPasteModal(false)')
        expect(headerBlock).toContain('setPasteText(\'\')')
        expect(headerBlock).toContain('setIsManualPasteInput(false)')
    })

    it('has cancel button ("ยกเลิก") in footer that closes the modal and resets state', () => {
        const footerBlockMatch = fileContent.match(/<div className="paste-modal-footer">[\s\S]*?<\/div>/)
        expect(footerBlockMatch).toBeTruthy()
        const footerBlock = footerBlockMatch[0]

        expect(footerBlock).toContain('paste-btn-cancel')
        expect(footerBlock).toContain('ยกเลิก')
        expect(footerBlock).toContain('setShowPasteModal(false)')
        expect(footerBlock).toContain('setPasteText(\'\')')
        expect(footerBlock).toContain('setIsManualPasteInput(false)')
    })

    it('has submit button ("ตกลง") with disabled state when pasteText is empty', () => {
        const footerBlockMatch = fileContent.match(/<div className="paste-modal-footer">[\s\S]*?<\/div>/)
        expect(footerBlockMatch).toBeTruthy()
        const footerBlock = footerBlockMatch[0]

        expect(footerBlock).toContain('paste-btn-submit')
        expect(footerBlock).toContain('ตกลง')
        expect(footerBlock).toContain('handlePasteNumbers()')
        expect(footerBlock).toContain('disabled={!pasteText.trim()}')
    })

    it('verifies that footer is always rendered so Cancel is always accessible', () => {
        // Previously footer was wrapped in `{pasteText.trim().length > 0 && (...) }`
        // Ensure that paste-modal-footer is NOT conditionally rendered inside showPasteModal
        const pasteModalMatch = fileContent.match(/\{showPasteModal\s*&&[\s\S]*?(\n\s*\{pasteText\.trim\(\)\.length\s*>\s*0\s*&&\s*<div className="paste-modal-footer">)/)
        expect(pasteModalMatch).toBeNull()
    })
})
