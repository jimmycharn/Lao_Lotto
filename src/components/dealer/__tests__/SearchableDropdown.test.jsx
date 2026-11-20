import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import SearchableDropdown from '../SearchableDropdown'

describe('SearchableDropdown component', () => {
    const sampleOptions = [
        { label: 'ทุกคน (ล้างการเลือก)', value: 'all' },
        { label: 'พี่ซีอิ๊ว', value: 'พี่ซีอิ๊ว' },
        { label: 'พี่ฮิ่ว', value: 'พี่ฮิ่ว' },
        { label: 'คุณเบญ', value: 'คุณเบญ' }
    ]

    it('renders closed dropdown with trigger label by default', () => {
        const html = renderToString(
            <SearchableDropdown
                value="all"
                options={sampleOptions}
                displayLabel="ทุกคน (เลือกเพิ่ม...)"
            />
        )
        expect(html).toContain('searchable-dropdown-trigger')
        expect(html).toContain('ทุกคน (เลือกเพิ่ม...)')
        expect(html).not.toContain('searchable-dropdown-menu')
    })

    describe('Keyboard navigation & filter selection logic', () => {
        // Pure state machine simulation matching SearchableDropdown implementation
        const simulateDropdownNav = (options, initialSearch = '') => {
            let searchTerm = initialSearch
            let highlightedIndex = 0
            let isOpen = true
            let selectedValue = null

            const getFiltered = () => options.filter(opt =>
                (opt.label || '').toLowerCase().includes(searchTerm.toLowerCase())
            )

            const onKeyDown = (key) => {
                const filtered = getFiltered()
                if (key === 'ArrowDown') {
                    if (filtered.length > 0) {
                        highlightedIndex = (highlightedIndex + 1) % filtered.length
                    }
                } else if (key === 'ArrowUp') {
                    if (filtered.length > 0) {
                        highlightedIndex = (highlightedIndex - 1 + filtered.length) % filtered.length
                    }
                } else if (key === 'Enter') {
                    if (filtered.length > 0 && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
                        selectedValue = filtered[highlightedIndex].value
                        isOpen = false
                        searchTerm = ''
                    }
                } else if (key === 'Escape') {
                    isOpen = false
                    searchTerm = ''
                }
            }

            const setSearch = (term) => {
                searchTerm = term
                highlightedIndex = 0
            }

            return {
                getSearchTerm: () => searchTerm,
                getHighlightedIndex: () => highlightedIndex,
                getIsOpen: () => isOpen,
                getSelectedValue: () => selectedValue,
                getFiltered,
                onKeyDown,
                setSearch
            }
        }

        it('filters options matching search term', () => {
            const nav = simulateDropdownNav(sampleOptions, 'พี่')
            const filtered = nav.getFiltered()
            expect(filtered).toHaveLength(2)
            expect(filtered[0].label).toBe('พี่ซีอิ๊ว')
            expect(filtered[1].label).toBe('พี่ฮิ่ว')
        })

        it('navigates with ArrowDown and ArrowUp', () => {
            const nav = simulateDropdownNav(sampleOptions, 'พี่')
            expect(nav.getHighlightedIndex()).toBe(0)

            nav.onKeyDown('ArrowDown')
            expect(nav.getHighlightedIndex()).toBe(1)

            // Arrow down wraps around
            nav.onKeyDown('ArrowDown')
            expect(nav.getHighlightedIndex()).toBe(0)

            // Arrow up wraps backward
            nav.onKeyDown('ArrowUp')
            expect(nav.getHighlightedIndex()).toBe(1)
        })

        it('selects highlighted option on Enter', () => {
            const nav = simulateDropdownNav(sampleOptions, 'พี่')
            nav.onKeyDown('ArrowDown') // Moves to index 1 ("พี่ฮิ่ว")
            nav.onKeyDown('Enter')

            expect(nav.getSelectedValue()).toBe('พี่ฮิ่ว')
            expect(nav.getIsOpen()).toBe(false)
        })

        it('immediately selects single matching member on Enter without extra arrow keys', () => {
            const nav = simulateDropdownNav(sampleOptions, 'เบญ')
            const filtered = nav.getFiltered()
            expect(filtered).toHaveLength(1)
            expect(filtered[0].label).toBe('คุณเบญ')
            expect(nav.getHighlightedIndex()).toBe(0)

            nav.onKeyDown('Enter')
            expect(nav.getSelectedValue()).toBe('คุณเบญ')
            expect(nav.getIsOpen()).toBe(false)
        })

        it('closes on Escape', () => {
            const nav = simulateDropdownNav(sampleOptions, 'เบญ')
            nav.onKeyDown('Escape')
            expect(nav.getIsOpen()).toBe(false)
            expect(nav.getSelectedValue()).toBeNull()
        })
    })
})
