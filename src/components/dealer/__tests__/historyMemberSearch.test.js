import { describe, it, expect, vi } from 'vitest'
import {
    calculateMemberInitialBalance,
    calculateMemberCurrentBalance,
    calculateUpstreamInitialBalance,
    calculateUpstreamCurrentBalance
} from '../../../utils/memberSettlementCalculator'

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

describe('History tab settlement status filter (all, settled, pending)', () => {
    // 1. Round filtering test
    const mockRoundsWithStatus = [
        { id: 'round-settled', lottery_type: 'thai', total_entries: 50, total_amount: 10000 },
        { id: 'round-pending', lottery_type: 'lao', total_entries: 30, total_amount: 5000 },
        { id: 'round-no-activity', lottery_type: 'hanoi', total_entries: 0, total_amount: 0, transferred_amount: 0 }
    ]

    const mockSettlementDetailsMap = {
        'round-settled': { isSettled: true, hasActivity: true },
        'round-pending': { isSettled: false, hasActivity: true },
        'round-no-activity': { isSettled: false, hasActivity: false }
    }

    const filterRoundsBySettlement = (rounds, filter) => {
        return rounds.filter(h => {
            if (filter === 'settled') {
                const sDetails = mockSettlementDetailsMap[h.id]
                if (!sDetails?.isSettled) return false
            } else if (filter === 'pending') {
                const sDetails = mockSettlementDetailsMap[h.id]
                const hasActivity = sDetails?.hasActivity ||
                    (Number(h.total_entries || 0) > 0) ||
                    (Number(h.total_amount || 0) > 0) ||
                    (Number(h.transferred_amount || 0) > 0)
                if (sDetails?.isSettled || !hasActivity) return false
            }
            return true
        })
    }

    it('returns all rounds when filter is "all"', () => {
        const res = filterRoundsBySettlement(mockRoundsWithStatus, 'all')
        expect(res).toHaveLength(3)
    })

    it('returns only settled rounds when filter is "settled"', () => {
        const res = filterRoundsBySettlement(mockRoundsWithStatus, 'settled')
        expect(res).toHaveLength(1)
        expect(res[0].id).toBe('round-settled')
    })

    it('returns only pending rounds with activity when filter is "pending"', () => {
        const res = filterRoundsBySettlement(mockRoundsWithStatus, 'pending')
        expect(res).toHaveLength(1)
        expect(res[0].id).toBe('round-pending')
    })

    it('defaults top-bar round settlement filter to "pending" to show only rounds with unsettled balances', () => {
        const defaultFilter = 'pending'
        const res = filterRoundsBySettlement(mockRoundsWithStatus, defaultFilter)
        expect(res).toHaveLength(1)
        expect(res[0].id).toBe('round-pending')
    })

    // 2. Member filtering within a round test
    const mockUserHistoriesForRound = [
        {
            user_id: 'user-settled-1',
            total_amount: 1000,
            total_commission: 100,
            total_winnings: 0,
            profiles: { full_name: 'สมาชิก จ่ายครบแล้ว' }
        },
        {
            user_id: 'user-pending-2',
            total_amount: 2000,
            total_commission: 200,
            total_winnings: 0,
            profiles: { full_name: 'สมาชิก ยังค้างจ่าย' }
        },
        {
            user_id: 'user-settled-win-3',
            total_amount: 500,
            total_commission: 50,
            total_winnings: 1000,
            profiles: { full_name: 'สมาชิก ถูกรางวัลเคลียร์แล้ว' }
        }
    ]

    // Payments:
    // user-settled-1 owes 900, paid 900 -> currBal = 0
    // user-pending-2 owes 1800, paid 1000 -> currBal = 800 (pending)
    // user-settled-win-3: dealer owes 550, dealer paid 550 -> currBal = 0
    const mockPayments = [
        { user_id: 'user-settled-1', amount: 900, direction: 'member_to_dealer', status: 'completed' },
        { user_id: 'user-pending-2', amount: 1000, direction: 'member_to_dealer', status: 'completed' },
        { user_id: 'user-settled-win-3', amount: 550, direction: 'dealer_to_member', status: 'completed' }
    ]

    const filterMembersBySettlement = (users, payments, filter, query = '') => {
        let filtered = users
        if (query) {
            filtered = filtered.filter(u => u.profiles.full_name.includes(query))
        }

        if (filter !== 'all') {
            filtered = filtered.filter(uh => {
                const memberPayments = payments.filter(p => p.user_id === uh.user_id)
                const initBal = calculateMemberInitialBalance(uh)
                const currBal = calculateMemberCurrentBalance(initBal, memberPayments)
                const isMemberSettled = currBal === 0

                if (filter === 'settled') {
                    return isMemberSettled
                } else if (filter === 'pending') {
                    return !isMemberSettled
                }
                return true
            })
        }

        return filtered
    }

    it('returns all members when member filter is "all"', () => {
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'all')
        expect(res).toHaveLength(3)
    })

    it('filters members to only those fully settled (currBal === 0)', () => {
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'settled')
        expect(res).toHaveLength(2)
        expect(res.map(u => u.user_id)).toEqual(['user-settled-1', 'user-settled-win-3'])
    })

    it('filters members to only those with pending balance (currBal !== 0)', () => {
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'pending')
        expect(res).toHaveLength(1)
        expect(res[0].user_id).toBe('user-pending-2')
    })

    it('correctly combines text search with settlement status filter', () => {
        // Search "จ่ายครบแล้ว" + filter "settled" -> matches 1
        const resSettled = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'settled', 'จ่ายครบแล้ว')
        expect(resSettled).toHaveLength(1)
        expect(resSettled[0].user_id).toBe('user-settled-1')

        // Search "จ่ายครบแล้ว" + filter "pending" -> matches 0
        const resPending = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'pending', 'จ่ายครบแล้ว')
        expect(resPending).toHaveLength(0)

        // Search "ค้าง" + filter "pending" -> matches 1
        const resPendingSearch = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'pending', 'ค้าง')
        expect(resPendingSearch).toHaveLength(1)
        expect(resPendingSearch[0].user_id).toBe('user-pending-2')
    })

    it('defaults member settlement filter to "pending" to show only members with outstanding balance', () => {
        // When round card opens, default filter is 'pending'
        const defaultMemberFilter = 'pending'
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, defaultMemberFilter)
        expect(res).toHaveLength(1)
        expect(res[0].user_id).toBe('user-pending-2')
    })

    it('allows changing round member filter to "all" to reveal all members in that round', () => {
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'all')
        expect(res).toHaveLength(3)
    })

    it('allows changing round member filter to "settled" to reveal only cleared members', () => {
        const res = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'settled')
        expect(res).toHaveLength(2)
        expect(res.map(u => u.user_id)).toEqual(['user-settled-1', 'user-settled-win-3'])
    })

    it('top-bar filter only filters round list and does not filter persons directly', () => {
        // Top bar filter is 'pending' -> selects 'round-pending'
        const filteredRounds = filterRoundsBySettlement(mockRoundsWithStatus, 'pending')
        expect(filteredRounds.map(r => r.id)).toEqual(['round-pending'])

        // Inside round-pending, members are controlled by their own dropdown (default 'pending')
        const membersInsideRound = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'pending')
        expect(membersInsideRound).toHaveLength(1)

        // Inside round-pending, if member dropdown is switched to 'all', all members are visible regardless of top bar
        const allMembersInsideRound = filterMembersBySettlement(mockUserHistoriesForRound, mockPayments, 'all')
        expect(allMembersInsideRound).toHaveLength(3)
    })
})

describe('History tab upstream layoff transfers filtered by round card settlement status', () => {
    const mockTransfers = [
        {
            id: 'trf-settled',
            dealerName: 'เจ้ามือเคลียร์แล้ว',
            entriesCount: 52,
            amount: 10000,
            commission_earned: 2500,
            winnings: 0
        },
        {
            id: 'trf-pending',
            dealerName: 'เจ้ามือค้างชำระ',
            entriesCount: 80,
            amount: 15000,
            commission_earned: 3000,
            winnings: 0
        }
    ]

    // Payments:
    // trf-settled: net = 10000 - 2500 - 0 = 7500 (dealer owes upstream 7500). Paid 7500 -> currBal = 0 (settled)
    // trf-pending: net = 15000 - 3000 - 0 = 12000. Paid 5000 -> currBal = 7000 (pending)
    const mockUpstreamPayments = [
        { upstream_dealer_name: 'เจ้ามือเคลียร์แล้ว', amount: 7500, direction: 'dealer_to_upstream', status: 'completed' },
        { upstream_dealer_name: 'เจ้ามือค้างชำระ', amount: 5000, direction: 'dealer_to_upstream', status: 'completed' }
    ]

    const filterTransfersBySettlement = (transfers, payments, filter) => {
        if (filter === 'all') return transfers
        return transfers.filter(t => {
            const upPayments = payments.filter(p => p.upstream_dealer_name === t.dealerName)
            const initBal = calculateUpstreamInitialBalance(t)
            const currBal = calculateUpstreamCurrentBalance(initBal, upPayments)
            const isSettled = currBal === 0

            if (filter === 'settled') return isSettled
            if (filter === 'pending') return !isSettled
            return true
        })
    }

    it('filters upstream transfers by round settlement status: pending (default)', () => {
        const res = filterTransfersBySettlement(mockTransfers, mockUpstreamPayments, 'pending')
        expect(res).toHaveLength(1)
        expect(res[0].id).toBe('trf-pending')
    })

    it('filters upstream transfers by round settlement status: settled', () => {
        const res = filterTransfersBySettlement(mockTransfers, mockUpstreamPayments, 'settled')
        expect(res).toHaveLength(1)
        expect(res[0].id).toBe('trf-settled')
    })

    it('returns all upstream transfers when round filter is all', () => {
        const res = filterTransfersBySettlement(mockTransfers, mockUpstreamPayments, 'all')
        expect(res).toHaveLength(2)
    })
})




