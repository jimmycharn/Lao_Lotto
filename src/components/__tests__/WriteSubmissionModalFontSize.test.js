import { describe, it, expect, beforeEach } from 'vitest'

describe('WriteSubmissionModal - Font Size Preferences & Persistence', () => {
    const STORAGE_KEY = 'lao_lotto_modal_font_size'
    const VALID_SIZES = ['sm', 'md', 'lg']

    const getInitialFontSize = (storage) => {
        try {
            const saved = storage.getItem(STORAGE_KEY)
            if (saved && VALID_SIZES.includes(saved)) {
                return saved
            }
            return 'sm'
        } catch {
            return 'sm'
        }
    }

    const saveFontSize = (storage, size) => {
        if (VALID_SIZES.includes(size)) {
            storage.setItem(STORAGE_KEY, size)
            return true
        }
        return false
    }

    let mockStorage = {}

    beforeEach(() => {
        mockStorage = {
            data: {},
            getItem(key) { return this.data[key] || null },
            setItem(key, value) { this.data[key] = String(value) }
        }
    })

    it('defaults to "sm" when no preference is saved in storage', () => {
        expect(getInitialFontSize(mockStorage)).toBe('sm')
    })

    it('loads saved valid preference correctly ("md" and "lg")', () => {
        mockStorage.setItem(STORAGE_KEY, 'md')
        expect(getInitialFontSize(mockStorage)).toBe('md')

        mockStorage.setItem(STORAGE_KEY, 'lg')
        expect(getInitialFontSize(mockStorage)).toBe('lg')
    })

    it('falls back to "sm" when an invalid value is in storage', () => {
        mockStorage.setItem(STORAGE_KEY, 'xl')
        expect(getInitialFontSize(mockStorage)).toBe('sm')

        mockStorage.setItem(STORAGE_KEY, 'invalid')
        expect(getInitialFontSize(mockStorage)).toBe('sm')
    })

    it('saves valid font size to storage correctly', () => {
        saveFontSize(mockStorage, 'md')
        expect(mockStorage.getItem(STORAGE_KEY)).toBe('md')

        saveFontSize(mockStorage, 'lg')
        expect(mockStorage.getItem(STORAGE_KEY)).toBe('lg')
    })
})
