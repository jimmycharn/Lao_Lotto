/**
 * Calculates payment notice summary according to selected mode
 * @param {Object} params
 * @param {'current_debt' | 'offset_prize_past_debt' | 'combine_all'} params.mode
 * @param {number} params.currentBalance - Current round net balance (+ member owes dealer, - dealer owes member)
 * @param {number} params.currentWinnings - Total winning prize in current round
 * @param {Array<Object>} params.selectedPastRounds - Array of selected past unpaid round objects
 * @returns {Object} Calculated summary
 */
export function calculatePaymentNoticeSummary({
    mode = 'offset_prize_past_debt',
    currentBalance = 0,
    currentWinnings = 0,
    selectedPastRounds = []
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
        if (curBal > 0) direction = 'member_to_dealer'
        else if (curBal < 0) direction = 'dealer_to_member'

        return {
            mode,
            modeLabel: 'หนี้งวดนี้',
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
        if (diff > 0) direction = 'member_to_dealer'
        else if (diff < 0) direction = 'dealer_to_member'

        return {
            mode,
            modeLabel: 'หักลบรางวัลกับหนี้เก่า',
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
    if (totalCombined > 0) direction = 'member_to_dealer'
    else if (totalCombined < 0) direction = 'dealer_to_member'

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

/**
 * Builds the default note string for settlement payments based on resolved bank account
 * Shows only [clean bank name (without 'ธนาคาร'), bank account, and account name].
 * @param {Object|null} bank
 * @returns {string}
 */
export function buildSettlementDefaultNote(bank) {
    if (!bank) return ''
    const cleanBankName = bank.bank_name
        ? String(bank.bank_name).replace(/^ธนาคาร\s*/, '').trim()
        : ''
    const parts = [
        cleanBankName,
        bank.bank_account ? String(bank.bank_account).trim() : '',
        bank.account_name ? `(${String(bank.account_name).trim()})` : ''
    ].filter(Boolean)

    return parts.join(' ')
}

/**
 * Resolves bank account for the payment notice or settlement payment modal.
 * - Dealer pays member/upstream: Resolves the member's assigned bank account for this dealer,
 *   or member's default bank account, or member profile.
 * - Member/upstream pays dealer: Resolves the dealer's assigned bank account for this member,
 *   or dealer's default bank account, or dealer profile.
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
    upstreamDealerId = null
}) {
    if (!supabase) return null

    const isDealerPaying = direction === 'dealer_to_member' || direction === 'dealer_to_upstream'
    const isTargetPaying = direction === 'member_to_dealer' || direction === 'upstream_to_dealer'

    if (direction === 'even' || (!isDealerPaying && !isTargetPaying)) {
        return null
    }

    if (isDealerPaying) {
        // Upstream layoff: Dealer pays upstream dealer
        if (isUpstream) {
            const targetUpstreamId = upstreamDealerId || memberUserId
            if (targetUpstreamId) {
                try {
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
                } catch (err) {
                    console.error('Error resolving upstream bank account:', err)
                }
            }
            return null
        }

        // Dealer pays member -> fetch member's bank account
        try {
            let targetMemberBankId = memberBankAccountId
            if (!targetMemberBankId && dealerId && memberUserId) {
                const { data: membership } = await supabase
                    .from('user_dealer_memberships')
                    .select('member_bank_account_id')
                    .eq('dealer_id', dealerId)
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
                        bank_account: specificBank.bank_account || '',
                        account_name: specificBank.account_name || '',
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
                    bank_account: b.bank_account || '',
                    account_name: b.account_name || '',
                    source: 'member_bank_accounts'
                }
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('bank_name, bank_account, bank_account_number, bank_account_name')
                .eq('id', memberUserId)
                .maybeSingle()

            if (profile?.bank_account || profile?.bank_account_number) {
                return {
                    bank_name: profile.bank_name || 'ไม่ระบุธนาคาร',
                    bank_account: profile.bank_account || profile.bank_account_number || '',
                    account_name: profile.bank_account_name || '',
                    source: 'member_profile'
                }
            }
        } catch (err) {
            console.error('Error resolving member bank account:', err)
        }
        return null
    }

    // Member or upstream pays dealer -> fetch dealer's assigned or default bank account
    try {
        let assignedId = assignedBankAccountId
        if (!assignedId && dealerId && memberUserId && !isUpstream) {
            const { data: membership } = await supabase
                .from('user_dealer_memberships')
                .select('assigned_bank_account_id')
                .eq('dealer_id', dealerId)
                .eq('user_id', memberUserId)
                .maybeSingle()
            if (membership?.assigned_bank_account_id) {
                assignedId = membership.assigned_bank_account_id
            }
        }

        if (assignedId) {
            const cachedAssigned = cachedDealerBanks.find(b => b.id === assignedId)
            if (cachedAssigned) {
                return {
                    bank_name: cachedAssigned.bank_name || '',
                    bank_account: cachedAssigned.bank_account || '',
                    account_name: cachedAssigned.account_name || '',
                    source: 'dealer_assigned'
                }
            }

            const { data: assignedBank } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('id', assignedId)
                .maybeSingle()

            if (assignedBank) {
                return {
                    bank_name: assignedBank.bank_name || '',
                    bank_account: assignedBank.bank_account || '',
                    account_name: assignedBank.account_name || '',
                    source: 'dealer_assigned'
                }
            }
        }

        // Fallback: Dealer's default account
        if (cachedDealerBanks.length > 0) {
            const def = cachedDealerBanks.find(b => b.is_default) || cachedDealerBanks[0]
            if (def) {
                return {
                    bank_name: def.bank_name || '',
                    bank_account: def.bank_account || '',
                    account_name: def.account_name || '',
                    source: 'dealer_default'
                }
            }
        }

        if (dealerId) {
            const { data: dealerBanks } = await supabase
                .from('dealer_bank_accounts')
                .select('*')
                .eq('dealer_id', dealerId)
                .order('is_default', { ascending: false })

            if (dealerBanks && dealerBanks.length > 0) {
                const b = dealerBanks[0]
                return {
                    bank_name: b.bank_name || '',
                    bank_account: b.bank_account || '',
                    account_name: b.account_name || '',
                    source: 'dealer_default'
                }
            }

            // Fallback: Dealer profile
            const { data: dealerProf } = await supabase
                .from('profiles')
                .select('bank_name, bank_account, bank_account_number, bank_account_name')
                .eq('id', dealerId)
                .maybeSingle()

            if (dealerProf?.bank_account || dealerProf?.bank_account_number) {
                return {
                    bank_name: dealerProf.bank_name || '',
                    bank_account: dealerProf.bank_account || dealerProf.bank_account_number || '',
                    account_name: dealerProf.bank_account_name || '',
                    source: 'dealer_profile'
                }
            }
        }
    } catch (err) {
        console.error('Error resolving dealer bank account:', err)
    }

    return null
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
    bankAccount,
    customNotes = ''
}) {
    const lines = []
    lines.push('📋 ใบแจ้งชำระเงิน')
    lines.push(`👤 สมาชิก: ${memberName}`)
    if (roundDate) {
        lines.push(`🎲 งวดวันที่: ${roundDate} (${lotteryTypeName})`)
    }
    lines.push(`📌 รูปแบบ: ${summary?.modeLabel || 'แจ้งชำระ'}`)
    lines.push('----------------------------')

    const currentRoundDateText = roundDate ? `งวด ${roundDate.trim()}` : 'งวดปัจจุบัน'

    if (mode === 'current_debt') {
        lines.push(`- ยอดค้าง${currentRoundDateText}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
    } else if (mode === 'offset_prize_past_debt') {
        lines.push(`- รวมหนี้งวดค้างเก่า: ฿${Number(summary?.selectedPastDebt || 0).toLocaleString()}`)
        lines.push(`- รางวัลงวดนี้ที่นำมาหักล้าง: ฿${Number(summary?.currentRoundPrize || 0).toLocaleString()}`)
    } else if (mode === 'combine_all') {
        lines.push(`- ยอดค้าง${currentRoundDateText}: ฿${Number(summary?.currentRoundDebt || 0).toLocaleString()}`)
        lines.push(`- รวมหนี้งวดค้างเก่า: ฿${Number(summary?.selectedPastDebt || 0).toLocaleString()}`)
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

    if (customNotes && customNotes.trim()) {
        lines.push('')
        lines.push(`📝 หมายเหตุ: ${customNotes.trim()}`)
    }

    return lines.join('\n')
}
