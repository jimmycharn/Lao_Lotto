const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add calculateTransferCommission helper function if not present
if (!content.includes('function calculateTransferCommission')) {
    const helperCode = `
// Helper function to calculate layoff transfer commission (4_set is fixed Baht per set, others are %)
function calculateTransferCommission(t, setPrice = 120) {
    if (t.commission_earned !== undefined && t.commission_earned !== null && Number(t.commission_earned) > 0) {
        return Number(t.commission_earned)
    }
    const amt = Number(t.amount || 0)
    if (amt <= 0) return 0

    if (t.bet_type === '4_set') {
        // 4_set (หวยชุด 4 ตัว) commission is FIXED BAHT PER SET (25 Baht / set of 120 Baht)
        const numSets = Math.max(1, Math.floor(amt / setPrice))
        const commPerSet = 25
        return numSets * commPerSet
    } else if (t.bet_type === '3_top' || t.bet_type === '3_tod' || t.bet_type === '3_front' || t.bet_type === '3_straight') {
        return Math.round(amt * 0.30)
    } else if (t.bet_type === '2_top' || t.bet_type === '2_bottom' || t.bet_type === '2_front' || t.bet_type === '2_spread') {
        return Math.round(amt * 0.28)
    } else if (t.bet_type === '1_top' || t.bet_type === '1_bottom' || t.bet_type === 'run_top') {
        return Math.round(amt * 0.12)
    } else {
        return Math.round(amt * 0.25)
    }
}
`;
    // Insert helper function before Dealer component export
    content = content.replace('export default function Dealer() {', helperCode + '\nexport default function Dealer() {');
}

// 2. Update historyTotals calculation
const oldTotalsStart = 'const historyTotals = useMemo(() => {';
const oldTotalsEnd = '}, [filteredRoundHistory])';

const newTotalsCode = `const historyTotals = useMemo(() => {
        return filteredRoundHistory.reduce((acc, h) => {
            const inAmt = h.total_amount || 0
            const inComm = h.total_commission || 0
            const inPay = h.total_payout || 0
            const inProfit = inAmt - inComm - inPay

            const outAmt = h.transferred_amount || 0
            const outComm = h.upstream_commission || (outAmt > 0 ? Math.round(outAmt * 0.25) : 0)
            const outWin = h.upstream_winnings || 0
            const outProfit = -outAmt + outComm + outWin

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
    }, [filteredRoundHistory])`;

const tIdx1 = content.indexOf(oldTotalsStart);
const tIdx2 = content.indexOf(oldTotalsEnd, tIdx1);
if (tIdx1 !== -1 && tIdx2 !== -1) {
    content = content.substring(0, tIdx1) + newTotalsCode + content.substring(tIdx2 + oldTotalsEnd.length);
    console.log('historyTotals updated successfully!');
} else {
    console.error('Failed to locate historyTotals block', { tIdx1, tIdx2 });
}

// 3. Update fetchHistoryDetails transfer fetching to use calculateTransferCommission
const oldTransFetch = `if (historyItem.round_id) {\n                const { data: transData } = await supabase\n                    .from('bet_transfers')\n                    .select('*, upstream_dealer:upstream_dealer_id(full_name, email, phone)')\n                    .eq('round_id', historyItem.round_id)\n                if (transData) transfers = transData\n            }`;

const newTransFetch = `if (historyItem.round_id) {
                const { data: transData } = await supabase
                    .from('bet_transfers')
                    .select('*, upstream_dealer:upstream_dealer_id(full_name, email, phone)')
                    .eq('round_id', historyItem.round_id)
                if (transData) {
                    transfers = transData.map(t => ({
                        ...t,
                        commission_earned: calculateTransferCommission(t),
                        winnings: t.winnings || 0
                    }))
                }
            }`;

if (content.includes(oldTransFetch)) {
    content = content.replace(oldTransFetch, newTransFetch);
    console.log('fetchHistoryDetails transfer query updated!');
} else {
    console.log('oldTransFetch not matched exactly, checking regex fallback...');
}

// 4. Update expanded history details logic
const lines = content.split('\n');
let detailsStart = -1;
let detailsEnd = -1;

for (let i = 2700; i < lines.length; i++) {
    if (lines[i].includes('(() => {') && lines[i+1]?.includes('const userHistories = details')) {
        detailsStart = i;
    }
    if (detailsStart !== -1 && lines[i].trim() === '})()') {
        detailsEnd = i;
        break;
    }
}

const newDetailsLines = [
'                                                                            (() => {',
'                                                                                const userHistories = details?.userHistories || []',
'                                                                                const rawTransfers = details?.transfers || []',
'                                                                                ',
'                                                                                const groupedMap = {}',
'                                                                                if (rawTransfers.length > 0) {',
'                                                                                    rawTransfers.forEach(t => {',
'                                                                                        const dName = t.upstream_dealer?.full_name || t.target_dealer_name || "เจ้ามือ"',
'                                                                                        if (!groupedMap[dName]) {',
'                                                                                            groupedMap[dName] = {',
'                                                                                                id: t.id || dName,',
'                                                                                                dealerName: dName,',
'                                                                                                entriesCount: 0,',
'                                                                                                amount: 0,',
'                                                                                                commission_earned: 0,',
'                                                                                                winnings: 0',
'                                                                                            }',
'                                                                                        }',
'                                                                                        const amt = Number(t.amount || 0)',
'                                                                                        const comm = calculateTransferCommission(t)',
'                                                                                        const win = Number(t.winnings || 0)',
'',
'                                                                                        groupedMap[dName].entriesCount += 1',
'                                                                                        groupedMap[dName].amount += amt',
'                                                                                        groupedMap[dName].commission_earned += comm',
'                                                                                        groupedMap[dName].winnings += win',
'                                                                                    })',
'                                                                                }',
'',
'                                                                                const outAmt = Number(history.transferred_amount || 0)',
'                                                                                const outComm = Number(history.upstream_commission || (outAmt > 0 ? Math.round(outAmt * 0.25) : 0))',
'                                                                                const outWin = Number(history.upstream_winnings || 0)',
'',
'                                                                                const effectiveTransfers = Object.values(groupedMap).length > 0 ',
'                                                                                    ? Object.values(groupedMap) ',
'                                                                                    : (outAmt > 0 ? [{',
'                                                                                        id: "archived_transfer_" + history.id,',
'                                                                                        dealerName: "เจ้ามือ (สรุปในประวัติ)",',
'                                                                                        entriesCount: history.total_entries || "-",',
'                                                                                        amount: outAmt,',
'                                                                                        commission_earned: outComm,',
'                                                                                        winnings: outWin',
'                                                                                    }] : [])',
'                                                                                ',
'                                                                                return (',
'                                                                                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>',
'                                                                                        {/* Member Submissions Table */}',
'                                                                                        <div>',
'                                                                                            <h4 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--color-warning)" }}>',
'                                                                                                📊 รายละเอียดการส่งเลขของสมาชิกในงวดนี้',
'                                                                                            </h4>',
'                                                                                            {userHistories.length === 0 ? (',
'                                                                                                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", padding: "0.5rem" }}>ไม่มีรายละเอียดสมาชิกบันทึกไว้สำหรับงวดนี้</div>',
'                                                                                            ) : (',
'                                                                                                <div className="history-members-breakdown" style={{ overflowX: "auto" }}>',
'                                                                                                    <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>',
'                                                                                                        <thead>',
'                                                                                                            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", textAlign: "left" }}>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem" }}>สมาชิก</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>จำนวนรายการ</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>ยอดส่ง</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>ค่าคอม</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>ถูกรางวัล</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>กำไรเจ้ามือ</th>',
'                                                                                                            </tr>',
'                                                                                                        </thead>',
'                                                                                                        <tbody>',
'                                                                                                            {userHistories.map(uh => {',
'                                                                                                                const memberName = uh.profiles?.full_name || uh.profiles?.line_display_name || uh.profiles?.email || "ไม่ระบุ"',
'                                                                                                                const dealerProfit = (uh.total_amount || 0) - (uh.total_commission || 0) - (uh.total_winnings || 0)',
'                                                                                                                return (',
'                                                                                                                    <tr key={uh.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>',
'                                                                                                                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>{memberName}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "center" }}>{uh.total_entries}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600 }}>฿{(uh.total_amount || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--color-warning)" }}>฿{Math.round(uh.total_commission || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--color-danger)" }}>฿{(uh.total_winnings || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600, color: dealerProfit >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>',
'                                                                                                                            {dealerProfit >= 0 ? "+" : ""}฿{dealerProfit.toLocaleString()}',
'                                                                                                                        </td>',
'                                                                                                                    </tr>',
'                                                                                                                )',
'                                                                                                            })}',
'                                                                                                        </tbody>',
'                                                                                                    </table>',
'                                                                                                </div>',
'                                                                                            )}',
'                                                                                        </div>',
'',
'                                                                                        {/* Outgoing Layoff Bet Transfers Table */}',
'                                                                                        {effectiveTransfers.length > 0 && (',
'                                                                                            <div>',
'                                                                                                <h4 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "#ef4444" }}>',
'                                                                                                    🚀 รายละเอียดการตีออกให้เจ้ามือในงวดนี้',
'                                                                                                </h4>',
'                                                                                                <div className="history-transfers-breakdown" style={{ overflowX: "auto" }}>',
'                                                                                                    <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>',
'                                                                                                        <thead>',
'                                                                                                            <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", textAlign: "left" }}>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem" }}>เจ้ามือรับตีออก</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>จำนวนรายการ</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>ยอดตีออก</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>ค่าคอมได้รับ</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>รับคืนรางวัล</th>',
'                                                                                                                <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>กำไรจากการตีออก</th>',
'                                                                                                            </tr>',
'                                                                                                        </thead>',
'                                                                                                        <tbody>',
'                                                                                                            {effectiveTransfers.map(t => {',
'                                                                                                                const upstreamName = t.dealerName || "เจ้ามือ"',
'                                                                                                                const entriesCount = t.entriesCount !== undefined ? t.entriesCount : "-"',
'                                                                                                                const tProfit = -(t.amount || 0) + (t.commission_earned || 0) + (t.winnings || 0)',
'                                                                                                                return (',
'                                                                                                                    <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>',
'                                                                                                                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>{upstreamName}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "center" }}>{entriesCount}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600, color: "#ef4444" }}>-฿{(t.amount || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--color-success)" }}>+฿{Math.round(t.commission_earned || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--color-success)" }}>+฿{(t.winnings || 0).toLocaleString()}</td>',
'                                                                                                                        <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600, color: tProfit >= 0 ? "var(--color-success)" : "#ef4444" }}>',
'                                                                                                                            {tProfit >= 0 ? "+" : ""}฿{tProfit.toLocaleString()}',
'                                                                                                                        </td>',
'                                                                                                                    </tr>',
'                                                                                                                )',
'                                                                                                            })}',
'                                                                                                        </tbody>',
'                                                                                                    </table>',
'                                                                                                </div>',
'                                                                                            </div>',
'                                                                                        )}',
'                                                                                    </div>',
'                                                                                )',
'                                                                            })()'
];

if (detailsStart !== -1 && detailsEnd !== -1) {
    lines.splice(detailsStart, detailsEnd - detailsStart + 1, ...newDetailsLines);
    console.log('Details section updated successfully!');
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Script finished execution!');
