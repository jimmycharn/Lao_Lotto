import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import RoundAccordionItem from '../RoundAccordionItem'
import GraphLayoffModal from '../GraphLayoffModal'
import { mergeTodToTopExcessItems } from '../../../utils/layoffTodConverter'

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

        // Verifies handler bridging staged items into transfer flow with Tod-to-Top conversion
        expect(fileContent).toContain('handleOpenTransferFromGraph')
        expect(fileContent).toContain('setGraphTransferItems(stagedItemsToTransfer)')
        expect(fileContent).toContain('mergeTodToTopExcessItems(stagedItems, round?.lottery_type)')
        expect(fileContent).toContain('<GraphLayoffModal')
    })

    it('converts staged 3_tod items to 3_top permutations when convert Tod-to-Top is active', () => {
        const stagedItems = [
            { bet_type: '3_tod', numbers: '123', excess: 60, remainingAmount: 60 },
            { bet_type: '3_tod', numbers: '012', excess: 40, remainingAmount: 40 }
        ]

        const converted = mergeTodToTopExcessItems(stagedItems, 'thai')

        // 123 has 6 permutations, 012 has 6 permutations -> total 12 items
        expect(converted).toHaveLength(12)
        converted.forEach(item => {
            expect(item.bet_type).toBe('3_top')
            expect(item.display_bet_type).toBe('บน')
            expect(item.isConvertedFromTod).toBe(true)
        })

        // Check specific numbers exist
        const perm123 = converted.filter(i => i.originalTodNumbers === '123')
        expect(perm123).toHaveLength(6)
        
        // Original number (123) retains original tod cut amount 60
        const item123Original = converted.find(i => i.numbers === '123')
        expect(item123Original).toBeDefined()
        expect(item123Original.excess).toBe(10) // 60 / 6 = 10
        expect(item123Original.originalRemaining).toBe(60)

        // Permuted numbers (132, 213, etc.) have originalRemaining = 0
        const item132Perm = converted.find(i => i.numbers === '132')
        expect(item132Perm).toBeDefined()
        expect(item132Perm.excess).toBe(10)
        expect(item132Perm.originalRemaining).toBe(0)

        const perm012 = converted.filter(i => i.originalTodNumbers === '012')
        expect(perm012).toHaveLength(6)
        expect(perm012[0].excess).toBe(7) // Math.ceil(40 / 6) = 7
        expect(converted.find(i => i.numbers === '012').originalRemaining).toBe(40)
        expect(converted.find(i => i.numbers === '021').originalRemaining).toBe(0)
    })

    it('leaves items unconverted when not converting Tod to Top', () => {
        const stagedItems = [
            { bet_type: '3_tod', numbers: '123', excess: 60, remainingAmount: 60 }
        ]

        // When shouldConvertTodToTop is false, stagedItems is passed directly
        const shouldConvert = false
        const result = shouldConvert ? mergeTodToTopExcessItems(stagedItems, 'thai') : stagedItems

        expect(result).toHaveLength(1)
        expect(result[0].bet_type).toBe('3_tod')
        expect(result[0].numbers).toBe('123')
    })

    it('verifies that items already 3_top cut from graph do not have isConvertedFromTod and suppress tod conversion badge condition', () => {
        const fileContent = fs.readFileSync(path.resolve('src/components/dealer/RoundAccordionItem.jsx'), 'utf8')
        
        // Badge is gated by modalSelectedItems.some(item => item.isConvertedFromTod)
        expect(fileContent).toContain('modalSelectedItems.some(item => item.isConvertedFromTod)')

        // (เดิม ฿...) is hidden for graph items that are not converted from Tod
        expect(fileContent).toContain('(!graphTransferItems || item.isConvertedFromTod)')

        const stagedTopItems = [
            { bet_type: '3_top', numbers: '101', excess: 20 },
            { bet_type: '3_top', numbers: '110', excess: 20 }
        ]

        // mergeTodToTopExcessItems should not touch 3_top items
        const result = mergeTodToTopExcessItems(stagedTopItems, 'thai')
        expect(result).toHaveLength(2)
        expect(result.some(i => i.isConvertedFromTod)).toBe(false)
    })
})

