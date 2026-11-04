import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import RoundAccordionItem from '../RoundAccordionItem'
import GraphLayoffModal from '../GraphLayoffModal'

describe('GraphLayoff Integration Smoke Tests', () => {
    it('should import RoundAccordionItem and GraphLayoffModal cleanly', () => {
        expect(RoundAccordionItem).toBeDefined()
        expect(GraphLayoffModal).toBeDefined()
        expect(typeof GraphLayoffModal).toBe('function')
    })

    it('contains graph layoff buttons in both remaining and excess tabs of RoundAccordionItem', () => {
        const fileContent = fs.readFileSync(path.resolve('src/components/dealer/RoundAccordionItem.jsx'), 'utf8')
        
        // Verifies button in remaining tab
        expect(fileContent).toContain('setGraphLayoffSource(\'remaining\')')
        expect(fileContent).toContain('ตัดจากกราฟ')

        // Verifies button in excess tab
        expect(fileContent).toContain('setGraphLayoffSource(\'excess\')')

        // Verifies handler bridging staged items into transfer flow
        expect(fileContent).toContain('handleOpenTransferFromGraph')
        expect(fileContent).toContain('setGraphTransferItems(stagedItems)')
        expect(fileContent).toContain('<GraphLayoffModal')
    })
})
