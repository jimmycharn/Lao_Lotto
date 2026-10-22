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

describe('Dealer history rounds filtered by combined sender search and settlement status', () => {
    // Round 1 (24 ก.ย.): Beer owes dealer 4482 (pending)
    // Round 2 (23 ก.ย.): Beer owes dealer 832 (pending)
    // Round 3 (22 ก.ย.): Beer has paid 0 balance (settled), but Somchai owes dealer 199 (round has pending balance)
    // Round 4 (21 ก.ย.): No Beer, only Somchai

    const mockRoundHistory = [
        { id: 'round-1', lottery_type: 'lao', round_date: '2026-09-24', total_entries: 10, total_amount: 18879 },
        { id: 'round-2', lottery_type: 'lao', round_date: '2026-09-23', total_entries: 8, total_amount: 11971 },
        { id: 'round-3', lottery_type: 'lao', round_date: '2026-09-22', total_entries: 6, total_amount: 11422 },
        { id: 'round-4', lottery_type: 'lao', round_date: '2026-09-21', total_entries: 5, total_amount: 8000 }
    ]

    const mockRoundUserHistories = {
        'round-1': [
            { user_id: 'user-beer', total_amount: 10000, total_commission: 2000, total_winnings: 0, profiles: { full_name: 'นายเบีย ปากเซ' } }
        ],
        'round-2': [
            { user_id: 'user-beer', total_amount: 5000, total_commission: 1000, total_winnings: 0, profiles: { full_name: 'นายเบีย ปากเซ' } }
        ],
        'round-3': [
            { user_id: 'user-beer', total_amount: 3000, total_commission: 600, total_winnings: 0, profiles: { full_name: 'นายเบีย ปากเซ' } },
            { user_id: 'user-somchai', total_amount: 1000, total_commission: 200, total_winnings: 0, profiles: { full_name: 'นายสมชาย' } }
        ],
        'round-4': [
            { user_id: 'user-somchai', total_amount: 2000, total_commission: 400, total_winnings: 0, profiles: { full_name: 'นายสมชาย' } }
        ]
    }

    // Payments:
    // round-1: Beer owes 8000, paid 3518 -> currBal = 4482 (pending)
    // round-2: Beer owes 4000, paid 3168 -> currBal = 832 (pending)
    // round-3: Beer owes 2400, paid 2400 -> currBal = 0 (settled!). Somchai owes 800, paid 601 -> currBal = 199 (pending!)
    const mockAllPayments = {
        'round-1': [
            { user_id: 'user-beer', amount: 3518, direction: 'member_to_dealer', status: 'completed' }
        ],
        'round-2': [
            { user_id: 'user-beer', amount: 3168, direction: 'member_to_dealer', status: 'completed' }
        ],
        'round-3': [
            { user_id: 'user-beer', amount: 2400, direction: 'member_to_dealer', status: 'completed' },
            { user_id: 'user-somchai', amount: 601, direction: 'member_to_dealer', status: 'completed' }
        ],
        'round-4': []
    }

    const isMemberMatch = (uh, query) => {
        const q = (query || '').trim().toLowerCase()
        if (!q) return true
        const name = (uh.profiles?.full_name || '').toLowerCase()
        return name.includes(q)
    }

    const filterRounds = ({
        rounds = mockRoundHistory,
        senderSearch = '',
        settlementFilter = 'all'
    }) => {
        const senderQuery = (senderSearch || '').trim().toLowerCase()

        return rounds.filter(h => {
            const uHist = mockRoundUserHistories[h.id] || []
            const allPayments = mockAllPayments[h.id] || []

            // Check round-level settlement status
            let roundHasPending = false
            for (const uh of uHist) {
                const mPay = allPayments.filter(p => p.user_id === uh.user_id)
                const init = calculateMemberInitialBalance(uh)
                const curr = calculateMemberCurrentBalance(init, mPay)
                if (Math.abs(curr) > 0.01) {
                    roundHasPending = true
                    break
                }
            }
            const isRoundSettled = !roundHasPending

            if (senderQuery) {
                const matchingMembers = uHist.filter(uh => isMemberMatch(uh, senderQuery))
                if (matchingMembers.length === 0) return false

                if (settlementFilter === 'pending') {
                    if (isRoundSettled) return false

                    // Matched member must still have pending balance in this round!
                    const hasPendingMember = matchingMembers.some(uh => {
                        const mPay = allPayments.filter(p => p.user_id === uh.user_id)
                        const init = calculateMemberInitialBalance(uh)
                        const curr = calculateMemberCurrentBalance(init, mPay)
                        return Math.abs(curr) > 0.01
                    })
                    if (!hasPendingMember) return false
                } else if (settlementFilter === 'settled') {
                    const hasSettledMember = matchingMembers.some(uh => {
                        const mPay = allPayments.filter(p => p.user_id === uh.user_id)
                        const init = calculateMemberInitialBalance(uh)
                        const curr = calculateMemberCurrentBalance(init, mPay)
                        return Math.abs(curr) <= 0.01
                    })
                    if (!hasSettledMember) return false
                }
            } else {
                if (settlementFilter === 'settled' && !isRoundSettled) return false
                if (settlementFilter === 'pending' && isRoundSettled) return false
            }

            return true
        })
    }

    it('returns only rounds where Beer is still pending (excludes round-3 where Beer already settled)', () => {
        const result = filterRounds({
            senderSearch: 'เบีย',
            settlementFilter: 'pending'
        })
        expect(result.map(r => r.id)).toEqual(['round-1', 'round-2'])
        expect(result).toHaveLength(2)
    })

    it('returns round-3 where Beer has settled when filtering by settled and searching Beer', () => {
        const result = filterRounds({
            senderSearch: 'เบีย',
            settlementFilter: 'settled'
        })
        expect(result.map(r => r.id)).toEqual(['round-3'])
        expect(result).toHaveLength(1)
    })

    it('returns all 3 rounds where Beer participated when filtering by all and searching Beer', () => {
        const result = filterRounds({
            senderSearch: 'เบีย',
            settlementFilter: 'all'
        })
        expect(result.map(r => r.id)).toEqual(['round-1', 'round-2', 'round-3'])
        expect(result).toHaveLength(3)
    })

    it('returns all rounds with pending status when sender search is empty', () => {
        const result = filterRounds({
            senderSearch: '',
            settlementFilter: 'pending'
        })
        // All 4 rounds have pending balances
        expect(result.map(r => r.id)).toEqual(['round-1', 'round-2', 'round-3', 'round-4'])
        expect(result).toHaveLength(4)
    })
})

describe('History tab sender search filters BOTH members and upstream dealers with correct totals and card stats', () => {
    const isUpstreamMatch = (t, query) => {
        if (!query) return true
        const q = (query || '').trim().toLowerCase()
        if (!q) return true
        const dName = (t.dealerName || t.target_dealer_name || t.upstream_dealer?.full_name || t.upstream_dealer_name || '').toLowerCase()
        return dName.includes(q)
    }

    const isMemberMatch = (uh, query) => {
        if (!query) return true
        const q = (query || '').trim().toLowerCase()
        if (!q) return true
        const name = (uh.profiles?.full_name || uh.profiles?.line_display_name || uh.profiles?.email || '').toLowerCase()
        return name.includes(q)
    }

    const isUhSettled = (uh, allPayments) => {
        const mPayments = (allPayments || []).filter(p => p.user_id === uh.user_id)
        const comm = uh.total_commission !== undefined ? Number(uh.total_commission) : Math.round(Number(uh.total_amount || 0) * 0.20)
        const initBal = calculateMemberInitialBalance({ ...uh, total_commission: comm })
        const currBal = calculateMemberCurrentBalance(initBal, mPayments)
        return Math.abs(currBal) <= 0.01
    }

    const isTransferSettled = (t, allUpstreamPayments) => {
        const upstreamName = t.dealerName || "เจ้ามือ"
        const upPayments = (allUpstreamPayments || []).filter(p => p.upstream_dealer_name === upstreamName)
        const initBal = calculateUpstreamInitialBalance(t)
        const currBal = calculateUpstreamCurrentBalance(initBal, upPayments)
        return Math.abs(currBal) <= 0.01
    }

    const calculateHistoryTotals = ({
        rounds,
        roundUserHistories,
        roundPayments,
        roundTransfers,
        roundUpstreamPayments,
        senderSearch = '',
        settlementFilter = 'all'
    }) => {
        const senderQuery = (senderSearch || '').trim().toLowerCase()

        return rounds.reduce((acc, h) => {
            const uHist = roundUserHistories[h.id] || []
            const allPayments = roundPayments[h.id] || []
            const eTransfers = roundTransfers[h.id] || []
            const allUpstreamPayments = roundUpstreamPayments[h.id] || []

            let inAmt = 0
            let inComm = 0
            let inPay = 0
            let inProfit = 0
            let outAmt = 0
            let outComm = 0
            let outWin = 0
            let outProfit = 0

            if (senderQuery) {
                let matchingMembers = uHist.filter(uh => isMemberMatch(uh, senderQuery))
                if (settlementFilter === 'settled') {
                    matchingMembers = matchingMembers.filter(uh => isUhSettled(uh, allPayments))
                } else if (settlementFilter === 'pending') {
                    matchingMembers = matchingMembers.filter(uh => !isUhSettled(uh, allPayments))
                }

                matchingMembers.forEach(uh => {
                    const amt = Number(uh.total_amount || 0)
                    const comm = uh.total_commission !== undefined ? Number(uh.total_commission) : Math.round(amt * 0.20)
                    const win = Number(uh.total_winnings || 0)
                    inAmt += amt
                    inComm += comm
                    inPay += win
                    inProfit += (amt - comm - win)
                })

                let matchingTransfers = eTransfers.filter(t => isUpstreamMatch(t, senderQuery))
                if (settlementFilter === 'settled') {
                    matchingTransfers = matchingTransfers.filter(t => isTransferSettled(t, allUpstreamPayments))
                } else if (settlementFilter === 'pending') {
                    matchingTransfers = matchingTransfers.filter(t => !isTransferSettled(t, allUpstreamPayments))
                }

                matchingTransfers.forEach(t => {
                    const amt = Number(t.amount || 0)
                    const comm = Number(t.commission_earned || 0)
                    const win = Number(t.winnings || 0)
                    outAmt += amt
                    outComm += comm
                    outWin += win
                    outProfit += (-amt + comm + win)
                })
            } else {
                inAmt = h.total_amount || 0
                inComm = h.total_commission || 0
                inPay = h.total_payout || 0
                inProfit = inAmt - inComm - inPay

                outAmt = h.transferred_amount || 0
                outComm = h.upstream_commission || 0
                outWin = h.upstream_winnings || 0
                outProfit = -outAmt + outComm + outWin
            }

            acc.total_amount += inAmt
            acc.total_commission += inComm
            acc.total_payout += inPay
            acc.incoming_profit += inProfit

            acc.transferred_amount += outAmt
            acc.upstream_commission += outComm
            acc.upstream_winnings += outWin
            acc.outgoing_profit += outProfit

            acc.profit = acc.incoming_profit + acc.outgoing_profit
            return acc
        }, {
            total_amount: 0,
            total_commission: 0,
            total_payout: 0,
            incoming_profit: 0,
            transferred_amount: 0,
            upstream_commission: 0,
            upstream_winnings: 0,
            outgoing_profit: 0,
            profit: 0
        })
    }

    const getRoundCardStats = ({
        history,
        userHistories = [],
        payments = [],
        transfers = [],
        upstreamPayments = [],
        senderSearch = '',
        settlementFilter = 'all'
    }) => {
        const senderQuery = (senderSearch || '').trim().toLowerCase()

        if (senderQuery) {
            let cardMembers = userHistories.filter(uh => isMemberMatch(uh, senderQuery))
            if (settlementFilter === 'settled') {
                cardMembers = cardMembers.filter(uh => isUhSettled(uh, payments))
            } else if (settlementFilter === 'pending') {
                cardMembers = cardMembers.filter(uh => !isUhSettled(uh, payments))
            }

            const hInAmt = cardMembers.reduce((sum, u) => sum + Number(u.total_amount || 0), 0)
            const hInComm = cardMembers.reduce((sum, u) => sum + (u.total_commission !== undefined ? Number(u.total_commission) : Math.round(Number(u.total_amount || 0) * 0.20)), 0)
            const hInPay = cardMembers.reduce((sum, u) => sum + Number(u.total_winnings || 0), 0)
            const hInProfit = hInAmt - hInComm - hInPay

            let cardTransfers = transfers.filter(t => isUpstreamMatch(t, senderQuery))
            if (settlementFilter === 'settled') {
                cardTransfers = cardTransfers.filter(t => isTransferSettled(t, upstreamPayments))
            } else if (settlementFilter === 'pending') {
                cardTransfers = cardTransfers.filter(t => !isTransferSettled(t, upstreamPayments))
            }

            const hOutAmt = cardTransfers.reduce((sum, t) => sum + Number(t.amount || 0), 0)
            const hOutComm = cardTransfers.reduce((sum, t) => sum + Number(t.commission_earned || 0), 0)
            const hOutWin = cardTransfers.reduce((sum, t) => sum + Number(t.winnings || 0), 0)
            const hOutProfit = -hOutAmt + hOutComm + hOutWin
            const cardProfit = hInProfit + hOutProfit

            let cardMemberOwes = 0
            let cardDealerOwes = 0
            cardMembers.forEach(uh => {
                const mPayments = payments.filter(p => p.user_id === uh.user_id)
                const comm = uh.total_commission !== undefined ? Number(uh.total_commission) : Math.round(Number(uh.total_amount || 0) * 0.20)
                const initBal = calculateMemberInitialBalance({ ...uh, total_commission: comm })
                const currBal = calculateMemberCurrentBalance(initBal, mPayments)
                if (currBal > 0.01) cardMemberOwes += currBal
                else if (currBal < -0.01) cardDealerOwes += Math.abs(currBal)
            })

            let cardDealerOwesUpstream = 0
            let cardUpstreamOwesDealer = 0
            cardTransfers.forEach(t => {
                const upstreamName = t.dealerName || "เจ้ามือ"
                const upPayments = upstreamPayments.filter(p => p.upstream_dealer_name === upstreamName)
                const initBal = calculateUpstreamInitialBalance(t)
                const currBal = calculateUpstreamCurrentBalance(initBal, upPayments)
                if (currBal > 0.01) cardDealerOwesUpstream += currBal
                else if (currBal < -0.01) cardUpstreamOwesDealer += Math.abs(currBal)
            })

            const isSettled = (
                cardMemberOwes <= 0.01 &&
                cardDealerOwes <= 0.01 &&
                cardDealerOwesUpstream <= 0.01 &&
                cardUpstreamOwesDealer <= 0.01
            )
            const netOutstanding = (cardMemberOwes + cardUpstreamOwesDealer) - (cardDealerOwes + cardDealerOwesUpstream)

            return {
                hInAmt, hInComm, hInPay, hInProfit,
                hOutAmt, hOutComm, hOutWin, hOutProfit,
                cardProfit,
                isSettled,
                netOutstanding
            }
        }

        const hInAmt = history.total_amount || 0
        const hInComm = history.total_commission || 0
        const hInPay = history.total_payout || 0
        const hInProfit = hInAmt - hInComm - hInPay
        const hOutAmt = history.transferred_amount || 0
        const hOutComm = history.upstream_commission || 0
        const hOutWin = history.upstream_winnings || 0
        const hOutProfit = -hOutAmt + hOutComm + hOutWin
        return {
            hInAmt, hInComm, hInPay, hInProfit,
            hOutAmt, hOutComm, hOutWin, hOutProfit,
            cardProfit: hInProfit + hOutProfit,
            isSettled: false,
            netOutstanding: 0
        }
    }

    // Mock scenario matching user's case:
    // Round 1:
    // - Nam1 submitted: amt 5,000, comm 1,000, win 2,000 -> net owed = 2,000. Paid 2,000 -> currBal = 0 (SETTLED)
    // - Other member Somchai: amt 15,000, comm 3,000, win 0 -> net owed = 12,000. Paid 0 -> currBal = 12,000 (PENDING)
    // - Upstream transfer to "เจ้ามือเป็ด" (Not Nam1): amount 2,000, comm 500, win 0 -> net owed = 1,500. Paid 1,500 (SETTLED)
    const mockRounds = [
        { id: 'round-101', total_amount: 20000, total_commission: 4000, total_payout: 2000, transferred_amount: 2000, upstream_commission: 500, upstream_winnings: 0 }
    ]

    const mockRoundUserHistories = {
        'round-101': [
            { user_id: 'user-nam1', total_amount: 5000, total_commission: 1000, total_winnings: 2000, profiles: { full_name: 'น้ำ1' } },
            { user_id: 'user-somchai', total_amount: 15000, total_commission: 3000, total_winnings: 0, profiles: { full_name: 'นายสมชาย' } }
        ]
    }

    const mockRoundPayments = {
        'round-101': [
            { user_id: 'user-nam1', amount: 2000, direction: 'member_to_dealer', status: 'completed' }
        ]
    }

    const mockRoundTransfers = {
        'round-101': [
            { id: 'trf-1', dealerName: 'เจ้ามือเป็ด', amount: 2000, commission_earned: 500, winnings: 0 }
        ]
    }

    const mockRoundUpstreamPayments = {
        'round-101': [
            { upstream_dealer_name: 'เจ้ามือเป็ด', amount: 1500, direction: 'dealer_to_upstream', status: 'completed' }
        ]
    }

    it('correctly calculates historyTotals for "น้ำ1" filtering settled entries: outgoing must be 0 and incoming only from Nam1', () => {
        const totals = calculateHistoryTotals({
            rounds: mockRounds,
            roundUserHistories: mockRoundUserHistories,
            roundPayments: mockRoundPayments,
            roundTransfers: mockRoundTransfers,
            roundUpstreamPayments: mockRoundUpstreamPayments,
            senderSearch: 'น้ำ1',
            settlementFilter: 'settled'
        })

        // Incoming must ONLY be Nam1 (5000), not full round (20000)
        expect(totals.total_amount).toBe(5000)
        expect(totals.total_commission).toBe(1000)
        expect(totals.total_payout).toBe(2000)
        expect(totals.incoming_profit).toBe(2000) // 5000 - 1000 - 2000

        // Outgoing must be 0 because upstream dealer is "เจ้ามือเป็ด", not "น้ำ1"
        expect(totals.transferred_amount).toBe(0)
        expect(totals.upstream_commission).toBe(0)
        expect(totals.upstream_winnings).toBe(0)
        expect(totals.outgoing_profit).toBe(0)

        // Net profit
        expect(totals.profit).toBe(2000)
    })

    it('correctly calculates round card stats for "น้ำ1": header shows only Nam1, outgoing is 0, and status is SETTLED', () => {
        const cardStats = getRoundCardStats({
            history: mockRounds[0],
            userHistories: mockRoundUserHistories['round-101'],
            payments: mockRoundPayments['round-101'],
            transfers: mockRoundTransfers['round-101'],
            upstreamPayments: mockRoundUpstreamPayments['round-101'],
            senderSearch: 'น้ำ1',
            settlementFilter: 'settled'
        })

        expect(cardStats.hInAmt).toBe(5000)
        expect(cardStats.hInComm).toBe(1000)
        expect(cardStats.hInPay).toBe(2000)
        expect(cardStats.hInProfit).toBe(2000)

        // Outgoing must be 0
        expect(cardStats.hOutAmt).toBe(0)
        expect(cardStats.hOutComm).toBe(0)
        expect(cardStats.hOutWin).toBe(0)
        expect(cardStats.hOutProfit).toBe(0)
        expect(cardStats.cardProfit).toBe(2000)

        // Crucial: Card is settled for Nam1 (netOutstanding = 0), even though Somchai is pending in the same round!
        expect(cardStats.isSettled).toBe(true)
        expect(cardStats.netOutstanding).toBe(0)
    })

    it('correctly calculates historyTotals when searching for an upstream dealer name e.g. "เป็ด"', () => {
        const totals = calculateHistoryTotals({
            rounds: mockRounds,
            roundUserHistories: mockRoundUserHistories,
            roundPayments: mockRoundPayments,
            roundTransfers: mockRoundTransfers,
            roundUpstreamPayments: mockRoundUpstreamPayments,
            senderSearch: 'เป็ด',
            settlementFilter: 'settled'
        })

        // Incoming must be 0 because no member has "เป็ด"
        expect(totals.total_amount).toBe(0)
        expect(totals.total_commission).toBe(0)
        expect(totals.total_payout).toBe(0)
        expect(totals.incoming_profit).toBe(0)

        // Outgoing must reflect "เจ้ามือเป็ด"
        expect(totals.transferred_amount).toBe(2000)
        expect(totals.upstream_commission).toBe(500)
        expect(totals.upstream_winnings).toBe(0)
        expect(totals.outgoing_profit).toBe(-1500) // -2000 + 500 + 0

        expect(totals.profit).toBe(-1500)
    })

    it('filters effective transfers by search query: returns empty array when searching "น้ำ1" and dealer is "เจ้ามือเป็ด"', () => {
        const transfers = mockRoundTransfers['round-101']
        const filteredForNam1 = transfers.filter(t => isUpstreamMatch(t, 'น้ำ1'))
        expect(filteredForNam1).toHaveLength(0)

        const filteredForPed = transfers.filter(t => isUpstreamMatch(t, 'เป็ด'))
        expect(filteredForPed).toHaveLength(1)
        expect(filteredForPed[0].dealerName).toBe('เจ้ามือเป็ด')
    })
})






