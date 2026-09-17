import { formatThaiDate, getRoundCloseDate } from './crossRoundOffsetCalculator'

/**
 * Calculates payment notice summary according to selected mode
 * @param {Object} params
 * @param {'current_debt' | 'offset_prize_past_debt' | 'combine_all'} params.mode
 * @param {number} params.currentBalance - Current round net balance (+ member owes dealer, - dealer owes member)
 * @param {number} params.currentWinnings - Total winning prize in current round
 * @param {Array<Object>} params.selectedPastRounds - Array of selected past unpaid round objects
 * @param {boolean} params.isUpstream - Whether this is for an upstream layoff dealer
 * @returns {Object} Calculated summary
 */
export function calculatePaymentNoticeSummary({
    mode = 'offset_prize_past_debt',
    currentBalance = 0,
    currentWinnings = 0,
    selectedPastRounds = [],
    isUpstream = false
}) {
    const curBal = Number(currentBalance || 0)
    const prize = Math.max(0, Number(currentWinnings || 0))

    const pastDebtTotal = selectedPastRounds
        .filter(r => Number(r.debt || 0) > 0)
        .reduce((sum, r) => sum + Number(r.debt || 0), 0)

    const pastPrizeTotal = selectedPastRounds
        .filter(r => Number(r.debt || 0) < 0)
        .reduce((sum, r) => sum + Math.abs(Number(r.debt || 0)), 0)

    const pastNetTotal = selectedPastRounds.reduce((sum, r) => sum + Number(r.debt || 0), 0)

    if (mode === 'current_debt') {
        const net = Math.abs(curBal)
        let direction = 'even'
        if (isUpstream) {
            if (curBal > 0) direction = 'dealer_to_upstream'
            else if (curBal < 0) direction = 'upstream_to_dealer'
        } else {
            if (curBal > 0) direction = 'member_to_dealer'
            else if (curBal < 0) direction = 'dealer_to_member'
        }

        return {
            mode,
            modeLabel: isUpstream ? 'ยอดงวดนี้' : 'หนี้งวดนี้',
            netAmount: net,
            direction,
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
            selectedPastDebt: 0,
            selectedPastPrize: 0
        }
    }

    if (mode === 'offset_prize_past_debt') {
        // Offset current prize against past net debt
        const diff = pastNetTotal - prize
        let direction = 'even'
        if (isUpstream) {
            if (diff > 0) direction = 'dealer_to_upstream'
            else if (diff < 0) direction = 'upstream_to_dealer'
        } else {
            if (diff > 0) direction = 'member_to_dealer'
            else if (diff < 0) direction = 'dealer_to_member'
        }

        return {
            mode,
            modeLabel: isUpstream ? 'หักลบรางวัลกับยอดเก่า' : 'หักลบรางวัลกับหนี้เก่า',
            netAmount: Math.abs(diff),
            direction,
            currentRoundDebt: curBal > 0 ? curBal : 0,
            currentRoundPrize: prize,
            selectedPastDebt: pastDebtTotal,
            selectedPastPrize: pastPrizeTotal
        }
    }

    // combine_all: Current balance + all selected past debts
    const totalCombined = curBal + pastNetTotal
    let direction = 'even'
    if (isUpstream) {
        if (totalCombined > 0) direction = 'dealer_to_upstream'
        else if (totalCombined < 0) direction = 'upstream_to_dealer'
    } else {
        if (totalCombined > 0) direction = 'member_to_dealer'
        else if (totalCombined < 0) direction = 'dealer_to_member'
    }

    return {
        mode,
        modeLabel: 'หักลบทั้งหมด',
        netAmount: Math.abs(totalCombined),
        direction,
        currentRoundDebt: curBal > 0 ? curBal : 0,
        currentRoundPrize: curBal < 0 ? Math.abs(curBal) : 0,
        selectedPastDebt: pastDebtTotal,
        selectedPastPrize: pastPrizeTotal
    }
}

export { THAI_BANKS, matchBankOption } from '../constants/bankConstants'

/**
 * Builds the default note string for settlement payments based on resolved bank account
 * Shows only [clean bank name (without 'ธนาคาร'), bank account, and account name].
 * @param {Object|null} bank
 * @returns {string}
 */
export function buildSettlementDefaultNote(bank, fallbackAccountName = '') {
    if (!bank) return ''
    const cleanBankName = bank.bank_name
        ? String(bank.bank_name).replace(/^ธนาคาร\s*/, '').trim()
        : ''
    const accNum = bank.bank_account || bank.bank_account_number || bank.account_number || ''
    const accName = bank.account_name || bank.bank_account_name || fallbackAccountName || ''
    const parts = [
        cleanBankName,
        accNum ? String(accNum).trim() : '',
        accName ? `(${String(accName).trim()})` : ''
    ].filter(Boolean)

    if (parts.length === 0) return ''
    return `โอนไป ${parts.join(' ')}`
}

/**
 * Resolves bank account for the payment notice or settlement payment modal.
 * - Dealer pays member: Resolves member's assigned/default bank account or profile.
 * - Dealer pays upstream (dealer_to_upstream): Resolves upstream dealer's bank account (linked or external connection).
 * - Member pays dealer (member_to_dealer): Resolves dealer's assigned or default bank account.
 * - Upstream pays dealer (upstream_to_dealer): Resolves dealer's own bank account (connection.my_bank_account_id or dealer default).
 */
export async function resolvePaymentNoticeBankAccount({
    direction = 'member_to_dealer',
    dealerId,
    memberUserId,
    supabase,
    cachedDealerBanks = [],
    assignedBankAccountId = null,
    memberBankAccountId = null,
    isUpstream = false,
    upstreamDealerId = null,
    upstreamDealerName = null,
    connectionId = null
}) {
    if (!supabase) return null

    const isDealerPaying = direction === 'dealer_to_member' || direction === 'dealer_to_upstream'
    const isTargetPaying = direction === 'member_to_dealer' || direction === 'upstream_to_dealer'

    if (direction === 'even' || (!isDealerPaying && !isTargetPaying)) {
        return null
    }

    let effDealerId = dealerId
    if (!effDealerId && supabase) {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            effDealerId = user?.id
        } catch (e) {
            // ignore
        }
    }

    if (isDealerPaying) {
        // Upstream layoff: Dealer pays upstream dealer -> Resolve Upstream Dealer's bank account
        if (isUpstream) {
            try {
                let conn = null

                // 1. Try finding connection by connectionId
                if (connectionId) {
                    const { data } = await supabase
                        .from('dealer_upstream_connections')
                        .select('*')
                        .eq('id', connectionId)
                        .maybeSingle()
                    conn = data
                }

                // 2. Try finding connection by upstreamDealerId / memberUserId
                if (!conn && effDealerId && (upstreamDealerId || memberUserId)) {
                    const targetUid = upstreamDealerId || memberUserId
                    const { data } = await supabase
                        .from('dealer_upstream_connections')
                        .select('*')
                        .eq('dealer_id', effDealerId)
                        .eq('upstream_dealer_id', targetUid)
                        .maybeSingle()
                    conn = data
                }

                // 3. Query all connections for this dealer to match by name or fuzzy
                let userConns = []
                if (effDealerId) {
                    const { data: connsData } = await supabase
                        .from('dealer_upstream_connections')
                        .select('*')
                        .eq('dealer_id', effDealerId)
                    userConns = connsData || []
                }

                if (!conn && userConns.length > 0) {
                    if (upstreamDealerName) {
                        const cleanTarget = String(upstreamDealerName).trim().toLowerCase()
                        const noSpaceTarget = cleanTarget.replace(/\s+/g, '')

                        // a. Exact match on upstream_name
                        conn = userConns.find(c => String(c.upstream_name || '').trim().toLowerCase() === cleanTarget)

                        // b. Space-insensitive match
                        if (!conn) {
                            conn = userConns.find(c => String(c.upstream_name || '').replace(/\s+/g, '').toLowerCase() === noSpaceTarget)
                        }

                        // c. Substring match
                        if (!conn) {
                            conn = userConns.find(c => {
                                const cName = String(c.upstream_name || '').trim().toLowerCase()
                                return cName && (cleanTarget.includes(cName) || cName.includes(cleanTarget))
                            })
                        }

                        // d. Keyword matching (words >= 3 chars, e.g. "อ้อมค่าย")
                        if (!conn) {
                            const keywords = cleanTarget.split(/\s+/).filter(w => w.length >= 3)
                            for (const kw of keywords) {
                                conn = userConns.find(c => String(c.upstream_name || '').includes(kw))
                                if (conn) break
                            }
                        }
                    }

                    // e. If only 1 connection exists for dealer, fallback to it
                    if (!conn && userConns.length === 1) {
                        conn = userConns[0]
                    }
                }

                // 4. Linked upstream connection
                if (conn?.is_linked && conn?.upstream_dealer_id) {
                    let assignedId = conn.assigned_bank_account_id
                    if (!assignedId && effDealerId) {
                        const { data: membership } = await supabase
                            .from('user_dealer_memberships')
                            .select('assigned_bank_account_id')
                            .eq('user_id', effDealerId)
                            .eq('dealer_id', conn.upstream_dealer_id)
                            .eq('status', 'active')
                            .maybeSingle()
                        if (membership?.assigned_bank_account_id) {
                            assignedId = membership.assigned_bank_account_id
                        }
                    }

                    const { data: dealerBanks } = await supabase
                        .from('dealer_bank_accounts')
                        .select('*')
                        .eq('dealer_id', conn.upstream_dealer_id)
                        .order('is_default', { ascending: false })

                    if (dealerBanks && dealerBanks.length > 0) {
                        const b = assignedId
                            ? dealerBanks.find(item => item.id === assignedId) || dealerBanks[0]
                            : (dealerBanks.find(item => item.is_default) || dealerBanks[0])
                        return {
                            bank_name: b.bank_name || '',
                            bank_account: b.bank_account || '',
                            account_name: b.account_name || '',
                            source: 'upstream_dealer_bank'
                        }
                    }

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('bank_name, bank_account, bank_account_number, bank_account_name')
                        .eq('id', conn.upstream_dealer_id)
                        .maybeSingle()

                    if (profile?.bank_account || profile?.bank_account_number) {
                        return {
                            bank_name: profile.bank_name || '',
                            bank_account: profile.bank_account || profile.bank_account_number || '',
                            account_name: profile.bank_account_name || '',
                            source: 'upstream_profile'
                        }
                    }
                }

                // 5. External upstream connection with bank accounts
                if (conn && !conn.is_linked) {
                    const { data: extBanks } = await supabase
                        .from('upstream_dealer_bank_accounts')
                        .select('*')
                        .eq('connection_id', conn.id)
                        .order('is_default', { ascending: false })
                        .order('created_at', { ascending: false })

                    if (extBanks && extBanks.length > 0) {
                        const b = extBanks.find(item => item.is_default) || extBanks[0]
                        return {
                            bank_name: b.bank_name || '',
                            bank_account: b.bank_account || '',
                            account_name: b.account_name || '',
                            source: 'upstream_dealer_bank_accounts'
                        }
                    }
                }

                // 6. Direct query in upstream_dealer_bank_accounts for this dealer
                if (effDealerId) {
                    const { data: allExtBanks } = await supabase
                        .from('upstream_dealer_bank_accounts')
                        .select('*')
                        .eq('dealer_id', effDealerId)
                        .order('is_default', { ascending: false })
                        .order('created_at', { ascending: false })

                    if (allExtBanks && allExtBanks.length > 0) {
                        let matchedBank = null
                        if (conn) {
                            matchedBank = allExtBanks.find(b => b.connection_id === conn.id)
                        }
                        if (!matchedBank && upstreamDealerName) {
                            const cleanTarget = String(upstreamDealerName).trim().toLowerCase()
                            matchedBank = allExtBanks.find(b => String(b.account_name || '').trim().toLowerCase() === cleanTarget)
                            if (!matchedBank) {
                                matchedBank = allExtBanks.find(b => {
                                    const acc = String(b.account_name || '').trim().toLowerCase()
                                    return acc && (cleanTarget.includes(acc) || acc.includes(cleanTarget))
                                })
                            }
                        }
                        if (!matchedBank && allExtBanks.length === 1) {
                            matchedBank = allExtBanks[0]
                        }
                        if (matchedBank) {
                            return {
                                bank_name: matchedBank.bank_name || '',
                                bank_account: matchedBank.bank_account || '',
                                account_name: matchedBank.account_name || '',
                                source: 'upstream_dealer_bank_accounts'
                            }
                        }
                    }
                }

                // 7. Fallback using upstreamDealerId
                const targetUpstreamId = upstreamDealerId || memberUserId
                if (targetUpstreamId) {
                    const { data: dealerBanks } = await supabase
                        .from('dealer_bank_accounts')
                        .select('*')
                        .eq('dealer_id', targetUpstreamId)
                        .order('is_default', { ascending: false })

                    if (dealerBanks && dealerBanks.length > 0) {
                        const b = dealerBanks[0]
                        return {
                            bank_name: b.bank_name || '',
                            bank_account: b.bank_account || '',
                            account_name: b.account_name || '',
                            source: 'upstream_dealer_bank'
                        }
                    }

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('bank_name, bank_account, bank_account_number, bank_account_name')
                        .eq('id', targetUpstreamId)
                        .maybeSingle()

                    if (profile?.bank_account || profile?.bank_account_number) {
                        return {
                            bank_name: profile.bank_name || '',
                            bank_account: profile.bank_account || profile.bank_account_number || '',
                            account_name: profile.bank_account_name || '',
                            source: 'upstream_profile'
                        }
                    }
                }
            } catch (err) {
                console.error('Error resolving upstream bank account:', err)
            }
            return null
        }

        // Dealer pays member -> fetch member's bank account
        try {
            let targetMemberBankId = memberBankAccountId
            if (!targetMemberBankId && effDealerId && memberUserId) {
                const { data: membership } = await supabase
                    .from('user_dealer_memberships')
                    .select('member_bank_account_id')
                    .eq('dealer_id', effDealerId)
                    .eq('user_id', memberUserId)
                    .maybeSingle()
                if (membership?.member_bank_account_id) {
                    targetMemberBankId = membership.member_bank_account_id
                }
            }

            if (targetMemberBankId) {
                const { data: specificBank } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .eq('id', targetMemberBankId)
                    .maybeSingle()

                if (specificBank) {
                    return {
                        bank_name: specificBank.bank_name || 'ไม่ระบุธนาคาร',
                        bank_account: specificBank.bank_account || specificBank.bank_account_number || '',
                        account_name: specificBank.account_name || specificBank.bank_account_name || '',
                        source: 'member_assigned'
                    }
                }
            }

            const { data: userBanks } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', memberUserId)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (userBanks && userBanks.length > 0) {
                const b = userBanks[0]
                return {
                    bank_name: b.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: b.bank_account || b.bank_account_number || '',
                    account_name: b.account_name || b.bank_account_name || '',
                    source: 'member_bank_accounts'
                }
            }

            // Also check dealer_bank_accounts in case member is registered as a dealer
            const { data: dealerBanks } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', memberUserId)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true })

            if (dealerBanks && dealerBanks.length > 0) {
                const b = dealerBanks[0]
                return {
                    bank_name: b.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: b.bank_account || b.bank_account_number || '',
                    account_name: b.account_name || b.bank_account_name || '',
                    source: 'member_dealer_bank'
                }
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('bank_name, bank_account, bank_account_number, bank_account_name, full_name')
                .eq('id', memberUserId)
                .maybeSingle()

            if (profile?.bank_account || profile?.bank_account_number || profile?.bank_name) {
                return {
                    bank_name: profile.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: profile.bank_account || profile.bank_account_number || '',
                    account_name: profile.bank_account_name || profile.full_name || '',
                    source: 'member_profile'
                }
            }
        } catch (err) {
            console.error('Error resolving member bank account:', err)
        }
        return null
    }

    // Member or upstream pays dealer -> fetch dealer's assigned, my_bank_account, or default bank account
    try {
        if (isUpstream) {
            // Upstream pays dealer -> We need OUR bank account to give to the upstream dealer
            let myBankId = null
            let effDealerId = dealerId
            if (!effDealerId) {
                try {
                    const { data: { user } } = await supabase.auth.getUser()
                    effDealerId = user?.id
                } catch (e) {
                    // ignore
                }
            }

            if (connectionId) {
                const { data: conn } = await supabase
                    .from('dealer_upstream_connections')
                    .select('my_bank_account_id')
                    .eq('id', connectionId)
                    .maybeSingle()
                myBankId = conn?.my_bank_account_id
            } else if (effDealerId && (upstreamDealerId || memberUserId)) {
                const targetUid = upstreamDealerId || memberUserId
                const { data: conn } = await supabase
                    .from('dealer_upstream_connections')
                    .select('my_bank_account_id')
                    .eq('dealer_id', effDealerId)
                    .eq('upstream_dealer_id', targetUid)
                    .maybeSingle()
                myBankId = conn?.my_bank_account_id
            }

            if (!myBankId && effDealerId && upstreamDealerName) {
                const { data: userConns } = await supabase
                    .from('dealer_upstream_connections')
                    .select('id, upstream_name, my_bank_account_id')
                    .eq('dealer_id', effDealerId)

                if (userConns && userConns.length > 0) {
                    const cleanTarget = String(upstreamDealerName).trim().toLowerCase()
                    const matched = userConns.find(c => String(c.upstream_name || '').trim().toLowerCase() === cleanTarget)
                        || userConns.find(c => {
                            const cn = String(c.upstream_name || '').trim().toLowerCase()
                            return cn && (cleanTarget.includes(cn) || cn.includes(cleanTarget))
                        })
                        || (userConns.length === 1 ? userConns[0] : null)
                    myBankId = matched?.my_bank_account_id
                }
            }

            if (myBankId) {
                const cachedMy = cachedDealerBanks.find(b => b.id === myBankId)
                if (cachedMy) {
                    return {
                        bank_name: cachedMy.bank_name || '',
                        bank_account: cachedMy.bank_account || '',
                        account_name: cachedMy.account_name || '',
                        source: 'dealer_my_bank_account'
                    }
                }

                const { data: myBank } = await supabase
                    .from('dealer_bank_accounts')
                    .select('*')
                    .eq('id', myBankId)
                    .maybeSingle()

                if (myBank) {
                    return {
                        bank_name: myBank.bank_name || '',
                        bank_account: myBank.bank_account || '',
                        account_name: myBank.account_name || '',
                        source: 'dealer_my_bank_account'
                    }
                }

                const { data: myUserBank } = await supabase
                    .from('user_bank_accounts')
                    .select('*')
                    .eq('id', myBankId)
                    .maybeSingle()

                if (myUserBank) {
                    return {
                        bank_name: myUserBank.bank_name || '',
                        bank_account: myUserBank.bank_account || '',
                        account_name: myUserBank.account_name || '',
                        source: 'dealer_my_bank_account'
                    }
                }
            }

            // Fallback: Dealer default bank
            if (cachedDealerBanks && cachedDealerBanks.length > 0) {
                const def = cachedDealerBanks.find(b => b.is_default) || cachedDealerBanks[0]
                return {
                    bank_name: def.bank_name || '',
                    bank_account: def.bank_account || '',
                    account_name: def.account_name || '',
                    source: 'dealer_cached'
                }
            }

            if (effDealerId) {
                const { data: dealerBanks } = await supabase
                    .from('dealer_bank_accounts')
                    .select('*')
                    .eq('dealer_id', effDealerId)
                    .order('is_default', { ascending: false })

                if (dealerBanks && dealerBanks.length > 0) {
                    const b = dealerBanks.find(item => item.is_default) || dealerBanks[0]
                    return {
                        bank_name: b.bank_name || '',
                        bank_account: b.bank_account || '',
                        account_name: b.account_name || '',
                        source: 'dealer_default'
                    }
                }
            }
        }

        // Member pays dealer: Check assigned_bank_account_id in user_dealer_memberships
        let targetDealerBankId = assignedBankAccountId
        if (!targetDealerBankId && effDealerId && memberUserId && !isUpstream) {
            const { data: membership } = await supabase
                .from('user_dealer_memberships')
                .select('assigned_bank_account_id')
                .eq('dealer_id', effDealerId)
                .eq('user_id', memberUserId)
                .maybeSingle()
            if (membership?.assigned_bank_account_id) {
                targetDealerBankId = membership.assigned_bank_account_id
            }
        }

        if (targetDealerBankId) {
            const cachedMatch = cachedDealerBanks.find(b => b.id === targetDealerBankId)
            if (cachedMatch) {
                return {
                    bank_name: cachedMatch.bank_name || '',
                    bank_account: cachedMatch.bank_account || cachedMatch.bank_account_number || '',
                    account_name: cachedMatch.account_name || cachedMatch.bank_account_name || '',
                    source: 'dealer_assigned'
                }
            }

            const { data: specificBank } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('id', targetDealerBankId)
                .maybeSingle()

            if (specificBank) {
                return {
                    bank_name: specificBank.bank_name || '',
                    bank_account: specificBank.bank_account || specificBank.bank_account_number || '',
                    account_name: specificBank.account_name || specificBank.bank_account_name || '',
                    source: 'dealer_assigned'
                }
            }
        }

        // Fallback: Cached dealer bank
        if (cachedDealerBanks && cachedDealerBanks.length > 0) {
            const def = cachedDealerBanks.find(b => b.is_default) || cachedDealerBanks[0]
            return {
                bank_name: def.bank_name || '',
                bank_account: def.bank_account || def.bank_account_number || '',
                account_name: def.account_name || def.bank_account_name || '',
                source: 'dealer_cached'
            }
        }

        // Fallback: Query dealer_bank_accounts
        if (effDealerId) {
            const { data: dealerBanks } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', effDealerId)
                .order('is_default', { ascending: false })

            if (dealerBanks && dealerBanks.length > 0) {
                const b = dealerBanks.find(item => item.is_default) || dealerBanks[0]
                return {
                    bank_name: b.bank_name || '',
                    bank_account: b.bank_account || b.bank_account_number || '',
                    account_name: b.account_name || b.bank_account_name || '',
                    source: 'dealer_bank_accounts'
                }
            }

            // Fallback: Dealer user_bank_accounts
            const { data: userBanks } = await supabase
                .from('user_bank_accounts')
                .select('*')
                .eq('user_id', effDealerId)
                .order('is_default', { ascending: false })

            if (userBanks && userBanks.length > 0) {
                const b = userBanks[0]
                return {
                    bank_name: b.bank_name || '',
                    bank_account: b.bank_account || b.bank_account_number || '',
                    account_name: b.account_name || b.bank_account_name || '',
                    source: 'dealer_user_bank'
                }
            }

            // Fallback: Dealer profile
            const { data: dealerProf } = await supabase
                .from('profiles')
                .select('bank_name, bank_account, bank_account_number, bank_account_name, full_name')
                .eq('id', effDealerId)
                .maybeSingle()

            if (dealerProf?.bank_account || dealerProf?.bank_account_number || dealerProf?.bank_name) {
                return {
                    bank_name: dealerProf.bank_name || '',
                    bank_account: dealerProf.bank_account || dealerProf.bank_account_number || '',
                    account_name: dealerProf.bank_account_name || dealerProf.full_name || '',
                    source: 'dealer_profile'
                }
            }
        }
    } catch (err) {
        console.error('Error resolving dealer bank account:', err)
    }

    return null
}

function resolveLotteryName(type, fallback = 'หวย') {
    if (!type) return fallback
    const t = String(type).trim().toLowerCase()
    if (t === 'thai' || t.includes('ไทย')) return 'หวยไทย'
    if (t === 'lao' || t.includes('ลาว')) return 'หวยลาว'
    if (t === 'hanoi' || t.includes('ฮานอย')) return 'หวยฮานอย'
    if (t === 'malay' || t.includes('มาเลย์')) return 'หวยมาเลย์'
    return type
}

function resolveDisplayRoundDate(dateVal) {
    if (!dateVal) return ''
    if (typeof dateVal === 'string') {
        const trimmed = dateVal.trim()
        if (/[ก-๙]/.test(trimmed)) {
            return trimmed
        }
    }
    const formatted = formatThaiDate(dateVal)
    return (formatted && formatted !== '-') ? formatted : String(dateVal || '').trim()
}

/**
 * Formats LINE text message for payment notice
 */
export function formatPaymentNoticeMessage({
    memberName = 'สมาชิก',
    roundDate = '',
    lotteryTypeName = 'หวย',
    mode = 'offset_prize_past_debt',
    summary,
    selectedPastRounds = [],
    bankAccount,
    customNotes = '',
    isUpstream = false
}) {
    const lines = []
    lines.push(isUpstream ? `🏢 เจ้ามือรับตีออก: ${memberName}` : `👤 สมาชิก: ${memberName}`)
    lines.push(`📌 รูปแบบ: ${summary?.modeLabel || 'แจ้งชำระ'}`)

    const curLottery = resolveLotteryName(lotteryTypeName)
    if (isUpstream) {
        lines.push(`🎯 ประเภทหวย: ${curLottery}`)
    }

    lines.push('----------------------------')

    const curDate = resolveDisplayRoundDate(roundDate)
    const curDateFormatted = curDate ? ` ${curDate}` : ' ปัจจุบัน'

    const sortedPast = [...(selectedPastRounds || [])].sort((a, b) => {
        const dateA = a.roundDate || getRoundCloseDate(a) || a.round_date || ''
        const dateB = b.roundDate || getRoundCloseDate(b) || b.round_date || ''
        return String(dateB).localeCompare(String(dateA))
    })

    if (isUpstream) {
        // UPSTREAM LAYOFF MESSAGE FORMAT
        if (mode === 'current_debt') {
            if (summary?.currentRoundPrize > 0 && !summary?.currentRoundDebt) {
                lines.push(`- ยอดถูกรางวัล งวด${curDateFormatted}: ฿${Number(summary.currentRoundPrize).toLocaleString()}`)
            } else {
                lines.push(`- ยอดตีออก งวด${curDateFormatted}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
            }
        } else if (mode === 'offset_prize_past_debt') {
            if (sortedPast.length > 0) {
                for (const r of sortedPast) {
                    const pastDate = resolveDisplayRoundDate(r.roundDate || r.round_date || getRoundCloseDate(r))
                    const pastDebt = Number(r.debt || 0)
                    if (pastDebt > 0) {
                        lines.push(`- ยอดตีออก งวด ${pastDate}: ฿${pastDebt.toLocaleString()}`)
                    } else if (pastDebt < 0) {
                        lines.push(`- ยอดถูกรางวัลค้างรับ งวด ${pastDate}: -฿${Math.abs(pastDebt).toLocaleString()}`)
                    }
                }
            } else if (summary?.selectedPastDebt) {
                lines.push(`- รวมยอดค้างเก่า: ฿${Number(summary.selectedPastDebt).toLocaleString()}`)
            }
            if (summary?.currentRoundPrize > 0) {
                lines.push(`- ยอดถูกรางวัลคืนงวดนี้: ฿${Number(summary.currentRoundPrize).toLocaleString()}`)
            }
        } else if (mode === 'combine_all') {
            if (Number(summary?.currentRoundDebt || 0) > 0) {
                lines.push(`- ยอดตีออก งวด${curDateFormatted}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
            }
            if (sortedPast.length > 0) {
                for (const r of sortedPast) {
                    const pastDate = resolveDisplayRoundDate(r.roundDate || r.round_date || getRoundCloseDate(r))
                    const pastDebt = Number(r.debt || 0)
                    if (pastDebt > 0) {
                        lines.push(`- ยอดตีออก งวด ${pastDate}: ฿${pastDebt.toLocaleString()}`)
                    } else if (pastDebt < 0) {
                        lines.push(`- ยอดถูกรางวัลค้างรับ งวด ${pastDate}: -฿${Math.abs(pastDebt).toLocaleString()}`)
                    }
                }
            } else if (summary?.selectedPastDebt) {
                lines.push(`- รวมยอดค้างเก่า: ฿${Number(summary.selectedPastDebt).toLocaleString()}`)
            }
            if (Number(summary?.currentRoundPrize || 0) > 0) {
                lines.push(`- ยอดถูกรางวัลคืนงวดนี้: ฿${Number(summary.currentRoundPrize).toLocaleString()}`)
            }
        }

        lines.push('----------------------------')

        const netAmt = Number(summary?.netAmount || 0).toLocaleString()
        if (summary?.direction === 'dealer_to_upstream') {
            lines.push(`💰 รวมยอดที่ต้องโอน: ฿${netAmt}`)
            lines.push(`🔴 ต้องโอนชำระให้กับ:  ${memberName}`)
        } else if (summary?.direction === 'upstream_to_dealer') {
            lines.push(`💰 รวมยอดที่เจ้ามือต้องโอน: ฿${netAmt}`)
            lines.push('🟢 เจ้ามือโอนชำระให้กับเรา')
        } else {
            lines.push(`💰 ยอดหักล้างพอดี: ฿0`)
            lines.push('⚪ ไม่มียอดต้องโอน')
        }

        if (bankAccount && (bankAccount.bank_account || bankAccount.bank_name)) {
            lines.push('')
            if (summary?.direction === 'dealer_to_upstream') {
                lines.push('💳 บัญชีโอนเงิน:')
            } else if (summary?.direction === 'upstream_to_dealer') {
                lines.push('💳 บัญชีรับเงิน (บัญชีของเรา):')
            } else {
                lines.push('💳 บัญชี:')
            }
            if (bankAccount.bank_account) {
                const parts = [
                    bankAccount.bank_name,
                    bankAccount.bank_account,
                    bankAccount.account_name ? `(${bankAccount.account_name})` : ''
                ].filter(Boolean)
                lines.push(parts.join(' '))
            } else if (bankAccount.bank_name) {
                lines.push(bankAccount.bank_name)
            }
        }
    } else {
        // MEMBER MESSAGE FORMAT (Unchanged)
        if (mode === 'current_debt') {
            if (summary?.currentRoundPrize > 0 && !summary?.currentRoundDebt) {
                const prizeLabel = '- เงินรางวัลงวดนี้'
                lines.push(`${prizeLabel}(${curLottery})${curDateFormatted}: ฿${Number(summary.currentRoundPrize).toLocaleString()}`)
            } else {
                const debtLabel = '- ยอดค้างงวด'
                lines.push(`${debtLabel}(${curLottery})${curDateFormatted}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
            }
        } else if (mode === 'offset_prize_past_debt') {
            if (sortedPast.length > 0) {
                for (const r of sortedPast) {
                    const pastLottery = resolveLotteryName(r.lotteryType || r.lottery_type, curLottery)
                    const pastDate = resolveDisplayRoundDate(r.roundDate || r.round_date || getRoundCloseDate(r))
                    const pastDebt = Number(r.debt || 0)
                    const prefix = pastDebt < 0 ? '- ยอดค้างจ่ายงวด' : '- ยอดค้างงวด'
                    lines.push(`${prefix}(${pastLottery}) ${pastDate}: ${pastDebt < 0 ? '-' : ''}฿${Math.abs(pastDebt).toLocaleString()}`)
                }
            } else if (summary?.selectedPastDebt) {
                lines.push(`- รวมหนี้งวดค้างเก่า: ฿${Number(summary.selectedPastDebt).toLocaleString()}`)
            }
            if (summary?.currentRoundPrize > 0) {
                lines.push(`- รางวัลงวดนี้ที่นำมาหักล้าง: ฿${Number(summary.currentRoundPrize).toLocaleString()}`)
            }
        } else if (mode === 'combine_all') {
            if (Number(summary?.currentRoundDebt || 0) > 0 || sortedPast.length === 0) {
                const debtLabel = '- ยอดค้างงวด'
                lines.push(`${debtLabel}(${curLottery})${curDateFormatted}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
            }
            if (sortedPast.length > 0) {
                for (const r of sortedPast) {
                    const pastLottery = resolveLotteryName(r.lotteryType || r.lottery_type, curLottery)
                    const pastDate = resolveDisplayRoundDate(r.roundDate || r.round_date || getRoundCloseDate(r))
                    const pastDebt = Number(r.debt || 0)
                    const prefix = pastDebt < 0 ? '- ยอดค้างจ่ายงวด' : '- ยอดค้างงวด'
                    lines.push(`${prefix}(${pastLottery}) ${pastDate}: ${pastDebt < 0 ? '-' : ''}฿${Math.abs(pastDebt).toLocaleString()}`)
                }
            } else if (summary?.selectedPastDebt) {
                lines.push(`- รวมหนี้งวดค้างเก่า: ฿${Number(summary.selectedPastDebt).toLocaleString()}`)
            }
        }

        lines.push('----------------------------')

        const netAmt = Number(summary?.netAmount || 0).toLocaleString()
        if (summary?.direction === 'member_to_dealer') {
            const title = (mode === 'combine_all' || mode === 'offset_prize_past_debt') ? '💰 รวมยอดที่ต้องโอน/ชำระ' : '💰 ยอดที่ต้องโอน/ชำระ'
            lines.push(`${title}: ฿${netAmt}`)
            lines.push('🟢 สมาชิกโอนชำระให้เจ้ามือ')
        } else if (summary?.direction === 'dealer_to_member') {
            const title = (mode === 'combine_all' || mode === 'offset_prize_past_debt') ? '💰 รวมยอดที่เจ้ามือต้องโอน' : '💰 ยอดที่เจ้ามือต้องโอน'
            lines.push(`${title}: ฿${netAmt}`)
            lines.push('🔴 เจ้ามือโอนคืนให้สมาชิก')
        } else {
            lines.push(`💰 ยอดหักล้างพอดี: ฿0`)
            lines.push('⚪ ไม่มียอดต้องโอน')
        }

        if (bankAccount && (bankAccount.bank_account || bankAccount.bank_name)) {
            lines.push('')
            lines.push('💳 บัญชีโอนเงิน:')
            if (bankAccount.bank_account) {
                const parts = [
                    bankAccount.bank_name,
                    bankAccount.bank_account,
                    bankAccount.account_name ? `(${bankAccount.account_name})` : ''
                ].filter(Boolean)
                lines.push(parts.join(' '))
            } else if (bankAccount.bank_name) {
                lines.push(bankAccount.bank_name)
            }
        }
    }

    if (customNotes && customNotes.trim()) {
        lines.push('')
        lines.push(`📝 หมายเหตุ: ${customNotes.trim()}`)
    }

    return lines.join('\n')
}
