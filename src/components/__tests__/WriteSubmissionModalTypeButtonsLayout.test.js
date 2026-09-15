import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('WriteSubmissionModal - Type Buttons Layout & Height Calculation', () => {
    const cssPath = path.resolve(__dirname, '../WriteSubmissionModal.css')
    const cssContent = fs.readFileSync(cssPath, 'utf8')

    it('does not have hardcoded fixed height: 140px on .type-buttons-row', () => {
        // Must not have height: 140px; max-height: 140px
        expect(cssContent).not.toMatch(/\.type-buttons-row\s*\{[^}]*height:\s*140px/i)
        expect(cssContent).not.toMatch(/\.type-buttons-row\s*\{[^}]*max-height:\s*140px/i)
    })

    it('has auto height with stable min-height for .type-buttons-row on desktop', () => {
        expect(cssContent).toContain('.type-buttons-row')
        expect(cssContent).toMatch(/min-height:\s*114px/)
        expect(cssContent).toMatch(/height:\s*auto/)
        expect(cssContent).toMatch(/max-height:\s*none/)
    })

    it('properly configures .type-btn.row-1 and .type-btn.row-2 so 7 buttons fit cleanly into 2 rows', () => {
        // row-1 should occupy ~33.33% (3 buttons in row 1)
        expect(cssContent).toMatch(/\.type-btn\.row-1\s*\{[^}]*33\.333%/i)
        // row-2 should occupy ~25% (4 buttons in row 2) to prevent wrapping into a 3rd row
        expect(cssContent).toMatch(/\.type-btn\.row-2\s*\{[^}]*25%/i)
    })

    it('calculates proportional button height across font sizes using clamp', () => {
        // Base button height should use clamp
        expect(cssContent).toMatch(/height:\s*clamp\(44px,\s*calc\(48px\s*\*\s*var\(--form-font-scale,\s*1\)\),\s*52px\)/)
        expect(cssContent).toMatch(/min-height:\s*clamp\(42px,\s*calc\(44px\s*\*\s*var\(--form-font-scale,\s*1\)\),\s*50px\)/)
    })

    it('keeps button padding compact to ensure large fonts do not overflow button boundaries', () => {
        // Ensures padding is not bloated to 1rem
        expect(cssContent).not.toMatch(/\.type-buttons-row button\s*\{[^}]*padding:\s*0\.6rem 1rem/i)
    })
})
