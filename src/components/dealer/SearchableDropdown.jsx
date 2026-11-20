import React, { useState, useEffect, useRef } from 'react'
import { FiChevronDown, FiSearch, FiX, FiCheck } from 'react-icons/fi'

export default function SearchableDropdown({ 
    value, 
    onChange, 
    options = [], 
    placeholder = "ค้นหาชื่อ...", 
    emptyMessage = "ไม่พบข้อมูล",
    displayLabel = null
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const dropdownRef = useRef(null)
    const listRef = useRef(null)
    const searchInputRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm("")
            setHighlightedIndex(0)
        } else {
            setHighlightedIndex(0)
            setTimeout(() => {
                if (searchInputRef.current) {
                    searchInputRef.current.focus()
                }
            }, 30)
        }
    }, [isOpen])

    const selectedOption = options.find(opt => opt.value === value) || { label: displayLabel || "ทุกคน", value: value || "all" }

    const filteredOptions = options.filter(opt =>
        (opt.label || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Reset highlighted index when searchTerm changes
    useEffect(() => {
        setHighlightedIndex(0)
    }, [searchTerm])

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current && highlightedIndex >= 0) {
            const activeEl = listRef.current.children[highlightedIndex]
            if (activeEl && typeof activeEl.scrollIntoView === 'function') {
                activeEl.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [highlightedIndex, isOpen])

    const handleSelectOption = (opt) => {
        if (!opt) return
        onChange(opt.value)
        setIsOpen(false)
        setSearchTerm("")
    }

    const handleKeyDown = (e) => {
        // Isolate keydown from bubbling up to parent keyboard listeners
        e.stopPropagation()

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (filteredOptions.length > 0) {
                setHighlightedIndex(prev => (prev + 1) % filteredOptions.length)
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (filteredOptions.length > 0) {
                setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length)
            }
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                handleSelectOption(filteredOptions[highlightedIndex])
            }
        } else if (e.key === 'Tab') {
            if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                e.preventDefault()
                handleSelectOption(filteredOptions[highlightedIndex])
            } else {
                setIsOpen(false)
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            setIsOpen(false)
            setSearchTerm("")
        }
    }

    return (
        <div className="searchable-dropdown" ref={dropdownRef}>
            <div
                className="searchable-dropdown-trigger"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    color: (value === 'all' || !value) && !displayLabel ? 'var(--color-text-muted)' : 'var(--color-text)'
                }}>
                    {displayLabel || selectedOption.label}
                </span>
                <FiChevronDown style={{ 
                    marginLeft: '0.5rem', 
                    flexShrink: 0,
                    transition: 'transform 0.2s ease',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)'
                }} />
            </div>

            {isOpen && (
                <div className="searchable-dropdown-menu">
                    <div className="searchable-dropdown-search-wrapper">
                        <FiSearch className="search-icon" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            className="searchable-dropdown-search-input"
                            autoFocus
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchTerm("")
                                    setHighlightedIndex(0)
                                    searchInputRef.current?.focus()
                                }}
                                className="searchable-dropdown-clear-btn"
                            >
                                <FiX size={12} />
                            </button>
                        )}
                    </div>
                    <div className="searchable-dropdown-list" ref={listRef}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = opt.value === value
                                const isHighlighted = idx === highlightedIndex
                                return (
                                    <div
                                        key={opt.value}
                                        onClick={() => handleSelectOption(opt)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`searchable-dropdown-option ${isHighlighted ? 'highlighted' : ''} ${isSelected ? 'selected active' : ''}`}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {opt.label}
                                        </span>
                                        {isSelected && <FiCheck size={14} style={{ marginLeft: '0.5rem', flexShrink: 0 }} />}
                                    </div>
                                )
                            })
                        ) : (
                            <div
                                style={{
                                    padding: '0.75rem',
                                    fontSize: '0.8rem',
                                    color: 'var(--color-text-muted)',
                                    textAlign: 'center'
                                }}
                            >
                                {emptyMessage}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
