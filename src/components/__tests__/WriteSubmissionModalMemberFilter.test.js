import { describe, it, expect } from 'vitest'

describe('WriteSubmissionModal - Member Combobox Filter & Navigation Logic', () => {
    const mockMembers = [
        { id: 'm1', full_name: 'น้องเจด', phone: '0812345678', email: 'jade@test.com' },
        { id: 'm2', full_name: 'สมชาย ขายดี', phone: '0898765432', email: 'somchai@test.com' },
        { id: 'm3', full_name: 'สมหญิง ร่ำรวย', phone: '0861112233', email: 'somying@test.com' },
        { id: 'm4', full_name: 'John Doe', phone: '0909998877', email: 'john.doe@example.com' }
    ]

    const filterMembers = (members, query) => {
        if (!members || members.length === 0) return []
        if (!query || !query.trim()) return members
        const q = query.toLowerCase().trim()
        return members.filter(m => {
            const name = (m.full_name || '').toLowerCase()
            const email = (m.email || '').toLowerCase()
            const phone = (m.phone || '').toLowerCase()
            const id = (m.id || '').toLowerCase()
            return name.includes(q) || email.includes(q) || phone.includes(q) || id.includes(q)
        })
    }

    it('returns all members when query is empty or whitespace', () => {
        expect(filterMembers(mockMembers, '')).toHaveLength(4)
        expect(filterMembers(mockMembers, '   ')).toHaveLength(4)
    })

    it('filters members by Thai name correctly', () => {
        const results = filterMembers(mockMembers, 'เจด')
        expect(results).toHaveLength(1)
        expect(results[0].full_name).toBe('น้องเจด')

        const somResults = filterMembers(mockMembers, 'สม')
        expect(somResults).toHaveLength(2)
        expect(somResults.map(m => m.full_name)).toEqual(['สมชาย ขายดี', 'สมหญิง ร่ำรวย'])
    })

    it('filters members by phone number correctly', () => {
        const results = filterMembers(mockMembers, '089')
        expect(results).toHaveLength(1)
        expect(results[0].full_name).toBe('สมชาย ขายดี')
    })

    it('filters members case-insensitively by English name and email', () => {
        const nameResults = filterMembers(mockMembers, 'JOHN')
        expect(nameResults).toHaveLength(1)
        expect(nameResults[0].id).toBe('m4')

        const emailResults = filterMembers(mockMembers, 'EXAMPLE.COM')
        expect(emailResults).toHaveLength(1)
        expect(emailResults[0].email).toBe('john.doe@example.com')
    })

    it('returns empty array when no members match', () => {
        const results = filterMembers(mockMembers, 'xyz999')
        expect(results).toHaveLength(0)
    })

    it('correctly handles arrow down navigation with wrap-around', () => {
        const items = filterMembers(mockMembers, '')
        let currentIndex = 0

        // Move down 1
        currentIndex = (currentIndex + 1) % items.length
        expect(currentIndex).toBe(1)

        // Move to last
        currentIndex = items.length - 1
        // Move down from last wraps to 0
        currentIndex = (currentIndex + 1) % items.length
        expect(currentIndex).toBe(0)
    })

    it('correctly handles arrow up navigation with wrap-around', () => {
        const items = filterMembers(mockMembers, '')
        let currentIndex = 0

        // Move up from 0 wraps to last item
        currentIndex = (currentIndex - 1 + items.length) % items.length
        expect(currentIndex).toBe(items.length - 1)

        // Move up from last
        currentIndex = (currentIndex - 1 + items.length) % items.length
        expect(currentIndex).toBe(items.length - 2)
    })
})
