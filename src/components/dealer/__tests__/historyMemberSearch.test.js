import { describe, it, expect, vi } from 'vitest'

describe('History tab round member submissions search filter logic', () => {
    const mockUserHistories = [
        {
            id: 'uh-1',
            user_id: 'user-1',
            total_entries: 890,
            total_amount: 43500,
            total_commission: 7786,
            total_winnings: 49950,
            profiles: {
                full_name: 'พี่แนน',
                line_display_name: 'Nan_LINE',
                email: 'nan@example.com'
            }
        },
        {
            id: 'uh-2',
            user_id: 'user-2',
            total_entries: 2072,
            total_amount: 74881,
            total_commission: 16643,
            total_winnings: 15750,
            profiles: {
                full_name: 'พี่น้ำ',
                line_display_name: 'Nam_Water',
                email: 'nam@example.com'
            }
        },
        {
            id: 'uh-3',
            user_id: 'user-3',
            total_entries: 375,
            total_amount: 12313,
            total_commission: 2929,
            total_winnings: 3250,
            profiles: {
                full_name: 'พี่แตง',
                line_display_name: 'Tang_Melon',
                email: 'tang@example.com'
            }
        }
    ]

    const mockMembers = [
        { id: 'user-1', full_name: 'พี่แนน', phone: '0812345678' },
        { id: 'user-2', full_name: 'พี่น้ำ', phone: '0898765432' },
        { id: 'user-3', full_name: 'พี่แตง', phone: '0861112233' }
    ]

    const filterMembers = (userHistories, rawQuery, members = mockMembers) => {
        const roundSearchQuery = (rawQuery || '').trim().toLowerCase()
        return userHistories.filter(uh => {
            if (!roundSearchQuery) return true
            const memberName = (uh.profiles?.full_name || uh.profiles?.line_display_name || uh.profiles?.email || '').toLowerCase()
            const lineName = (uh.profiles?.line_display_name || '').toLowerCase()
            const email = (uh.profiles?.email || '').toLowerCase()
            const memberInfo = members.find(m => (m.id || m.user_id) === uh.user_id)
            const extraName = (memberInfo?.full_name || memberInfo?.name || '').toLowerCase()
            const extraLine = (memberInfo?.line_display_name || '').toLowerCase()
            const phone = (memberInfo?.phone || memberInfo?.phone_number || uh.profiles?.phone || '').toLowerCase()

            return memberName.includes(roundSearchQuery) ||
                lineName.includes(roundSearchQuery) ||
                email.includes(roundSearchQuery) ||
                extraName.includes(roundSearchQuery) ||
                extraLine.includes(roundSearchQuery) ||
                phone.includes(roundSearchQuery)
        })
    }

    it('returns all members when search query is empty or only whitespace', () => {
        expect(filterMembers(mockUserHistories, '')).toHaveLength(3)
        expect(filterMembers(mockUserHistories, '   ')).toHaveLength(3)
    })

    it('filters correctly by Thai full_name', () => {
        const results = filterMembers(mockUserHistories, 'แนน')
        expect(results).toHaveLength(1)
        expect(results[0].profiles.full_name).toBe('พี่แนน')
    })

    it('filters correctly by LINE display name', () => {
        const results = filterMembers(mockUserHistories, 'Nam_Water')
        expect(results).toHaveLength(1)
        expect(results[0].profiles.full_name).toBe('พี่น้ำ')
    })

    it('filters case-insensitively', () => {
        const results = filterMembers(mockUserHistories, 'tang_melon')
        expect(results).toHaveLength(1)
        expect(results[0].profiles.full_name).toBe('พี่แตง')
    })

    it('filters correctly by phone number from members profile', () => {
        const results = filterMembers(mockUserHistories, '0898765432')
        expect(results).toHaveLength(1)
        expect(results[0].profiles.full_name).toBe('พี่น้ำ')
    })

    it('returns empty array when no member matches search query', () => {
        const results = filterMembers(mockUserHistories, 'ไม่มีชื่อนี้')
        expect(results).toHaveLength(0)
    })

    it('correctly maps rowIndex to the filtered member when search is active', () => {
        const roundId = 'round-101'
        const filteredUsers = filterMembers(mockUserHistories, 'แตง')
        expect(filteredUsers).toHaveLength(1)

        // When user searches "แตง", rowIndex is 0 for the single result
        const rowIndex = 0
        const selectedMember = filteredUsers[rowIndex]
        expect(selectedMember.user_id).toBe('user-3')
        expect(selectedMember.profiles.full_name).toBe('พี่แตง')

        // settlementKey must match the filtered user ("user-3", NOT unfiltered "user-1")
        const settlementKey = `${roundId}_${selectedMember.user_id}`
        expect(settlementKey).toBe('round-101_user-3')
    })

    it('triggers payment button click when already expanded rather than collapsing', () => {
        const roundId = 'round-101'
        const filteredUsers = filterMembers(mockUserHistories, 'แตง')
        const uh = filteredUsers[0]
        const settlementKey = `${roundId}_${uh.user_id}`

        let expandedMemberSettlementId = settlementKey
        const mockPaymentBtn = { click: vi.fn() }
        let paymentOpened = false

        // Simulate handleKeyDown Enter logic on member row
        if (expandedMemberSettlementId === settlementKey) {
            mockPaymentBtn.click()
            paymentOpened = true
        } else {
            expandedMemberSettlementId = settlementKey
        }

        expect(mockPaymentBtn.click).toHaveBeenCalledTimes(1)
        expect(paymentOpened).toBe(true)
        // Ensure expanded state was NOT collapsed to null or another user
        expect(expandedMemberSettlementId).toBe('round-101_user-3')
    })
})

describe('History tab round cards filtered by sender/member search', () => {
    const mockRounds = [
        { id: 'round-1', round_date: '2026-09-16', lottery_type: 'thai' },
        { id: 'round-2', round_date: '2026-09-17', lottery_type: 'lao' },
        { id: 'round-3', round_date: '2026-09-18', lottery_type: 'hanoi' }
    ]

    const mockUserHistories = [
        { round_id: 'round-1', user_id: 'u-1', profiles: { full_name: 'พี่แพร', member_code: '10048', line_display_name: 'Prae_LINE' } },
        { round_id: 'round-2', user_id: 'u-2', profiles: { full_name: 'พี่น้ำ', member_code: '10039', line_display_name: 'Nam_LINE' } },
        { round_id: 'round-3', user_id: 'u-1', profiles: { full_name: 'พี่แพร', member_code: '10048', line_display_name: 'Prae_LINE' } }
    ]

    const mockMembers = [
        { id: 'u-1', full_name: 'พี่แพร', member_code: '10048', line_display_name: 'Prae_LINE' },
        { id: 'u-2', full_name: 'พี่น้ำ', member_code: '10039', line_display_name: 'Nam_LINE' }
    ]

    const filterRoundsBySender = (rounds, userHistories, senderQueryRaw, members = mockMembers) => {
        const senderQuery = (senderQueryRaw || '').trim().toLowerCase()
        if (!senderQuery) return rounds

        const memberMap = new Map()
        members.forEach(m => memberMap.set(m.id || m.user_id, m))

        const isMemberMatch = (uh) => {
            const memberInfo = memberMap.get(uh.user_id)
            const memberName = (uh.profiles?.full_name || uh.profiles?.line_display_name || uh.profiles?.email || '').toLowerCase()
            const lineName = (uh.profiles?.line_display_name || '').toLowerCase()
            const email = (uh.profiles?.email || '').toLowerCase()
            const extraName = (memberInfo?.full_name || memberInfo?.name || '').toLowerCase()
            const extraLine = (memberInfo?.line_display_name || '').toLowerCase()
            const memberCode = String(memberInfo?.member_code || uh.profiles?.member_code || '').toLowerCase()
            const phone = (memberInfo?.phone || memberInfo?.phone_number || uh.profiles?.phone || '').toLowerCase()

            return memberName.includes(senderQuery) ||
                lineName.includes(senderQuery) ||
                memberCode.includes(senderQuery) ||
                email.includes(senderQuery) ||
                extraName.includes(senderQuery) ||
                extraLine.includes(senderQuery) ||
                phone.includes(senderQuery)
        }

        const matchingRoundIds = new Set()
        userHistories.forEach(uh => {
            if (isMemberMatch(uh)) {
                if (uh.round_id) matchingRoundIds.add(String(uh.round_id))
            }
        })

        return rounds.filter(r => matchingRoundIds.has(String(r.id)))
    }

    it('returns all rounds when sender search query is empty or spaces', () => {
        expect(filterRoundsBySender(mockRounds, mockUserHistories, '')).toHaveLength(3)
        expect(filterRoundsBySender(mockRounds, mockUserHistories, '   ')).toHaveLength(3)
    })

    it('filters round cards to only those where the member submitted bets by full_name', () => {
        const roundsPrae = filterRoundsBySender(mockRounds, mockUserHistories, 'แพร')
        expect(roundsPrae).toHaveLength(2)
        expect(roundsPrae.map(r => r.id)).toEqual(['round-1', 'round-3'])

        const roundsNam = filterRoundsBySender(mockRounds, mockUserHistories, 'น้ำ')
        expect(roundsNam).toHaveLength(1)
        expect(roundsNam[0].id).toBe('round-2')
    })

    it('filters round cards by 5-digit member_code', () => {
        const rounds = filterRoundsBySender(mockRounds, mockUserHistories, '10048')
        expect(rounds).toHaveLength(2)
        expect(rounds.map(r => r.id)).toEqual(['round-1', 'round-3'])
    })

    it('filters round cards by LINE display name', () => {
        const rounds = filterRoundsBySender(mockRounds, mockUserHistories, 'nam_line')
        expect(rounds).toHaveLength(1)
        expect(rounds[0].id).toBe('round-2')
    })

    it('returns empty array when member has no submissions in any round', () => {
        const rounds = filterRoundsBySender(mockRounds, mockUserHistories, 'น้องสมชาย')
        expect(rounds).toHaveLength(0)
    })
})

