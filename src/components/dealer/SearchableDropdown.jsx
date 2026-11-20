import React, { useState, useEffect, useRef } from 'react'
import { FiChevronDown, FiSearch, FiX, FiCheck } from 'react-icons/fi'

export default function SearchableDropdown({ 
    value, 
    onChange, 
    options, 
    placeholder = "ค้นหาชื่อ...", 
    emptyMessage = "ไม่พบข้อมูล",
    displayLabel = null
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const dropdownRef = useRef(null)

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
        }
    }, [isOpen])

    const selectedOption = options.find(opt => opt.value === value) || { label: displayLabel || "ทุกคน", value: value || "all" }

    const filteredOptions = options.filter(opt =>
        (opt.label || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

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
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={placeholder}
                            className="searchable-dropdown-search-input"
                            autoFocus
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="searchable-dropdown-clear-btn"
                            >
                                <FiX size={12} />
                            </button>
                        )}
                    </div>
                    <div className="searchable-dropdown-list">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => {
                                const isSelected = opt.value === value
                                return (
                                    <div
                                        key={opt.value}
                                        onClick={() => {
                                            onChange(opt.value)
                                            setIsOpen(false)
                                        }}
                                        className={`searchable-dropdown-option ${isSelected ? 'active' : ''}`}
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
