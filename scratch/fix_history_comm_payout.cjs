const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add getMemberCommission helper if not present
if (!content.includes('function getMemberCommission')) {
    const helperCode = `
// Helper to ensure member commission is non-zero (default 20% fallback if missing in archived history)
function getMemberCommission(amount, commission) {
    if (commission !== undefined && commission !== null && Number(commission) > 0) {
        return Number(commission)
    }
    const amt = Number(amount || 0)
    if (amt <= 0) return 0
    return Math.round(amt * 0.20)
}
`;
    content = content.replace('function calculateTransferCommission', helperCode + '\nfunction calculateTransferCommission');
}

// 2. Update fetchHistoryDetails to format userHistories with getMemberCommission
content = content.replace(
    'userHistories = userHistories.map(uh => ({ ...uh, profiles: profilesMap[uh.user_id] }))',
    `userHistories = userHistories.map(uh => ({
                ...uh,
                total_commission: getMemberCommission(uh.total_amount, uh.total_commission),
                total_winnings: Number(uh.total_winnings || 0),
                profiles: profilesMap[uh.user_id]
            }))`
);

// 3. Update history card header calculation block in filteredRoundHistory.map
const lines = content.split('\n');
let mapStart = -1;
for (let i = 2700; i < lines.length; i++) {
    if (lines[i].includes('{filteredRoundHistory.map(history => {')) {
        mapStart = i;
        break;
    }
}

if (mapStart !== -1) {
    let calcStart = -1;
    for (let i = mapStart; i < mapStart + 20; i++) {
        if (lines[i].includes('const hInAmt = history.total_amount')) {
            calcStart = i;
            break;
        }
    }

    if (calcStart !== -1) {
        const newCalcLines = [
'                                                         const userHistories = details?.userHistories || []',
'                                                         const rawTransfers = details?.transfers || []',
'',
'                                                         const hInAmt = history.total_amount || 0',
'                                                         let hInComm = history.total_commission || 0',
'                                                         let hInPay = history.total_payout || 0',
'',
'                                                         if (userHistories.length > 0) {',
'                                                             hInComm = userHistories.reduce((sum, u) => sum + (u.total_commission || 0), 0)',
'                                                             hInPay = userHistories.reduce((sum, u) => sum + (u.total_winnings || 0), 0)',
'                                                         } else if (!hInComm && hInAmt > 0) {',
'                                                             hInComm = Math.round(hInAmt * 0.20)',
'                                                         }',
'',
'                                                         const hInProfit = hInAmt - hInComm - hInPay',
'',
'                                                         let hOutAmt = history.transferred_amount || 0',
'                                                         let hOutComm = history.upstream_commission || 0',
'                                                         let hOutWin = history.upstream_winnings || 0',
'',
'                                                         if (rawTransfers.length > 0) {',
'                                                             hOutAmt = rawTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)',
'                                                             hOutComm = rawTransfers.reduce((sum, t) => sum + calculateTransferCommission(t), 0)',
'                                                             hOutWin = rawTransfers.reduce((sum, t) => sum + (t.winnings || 0), 0)',
'                                                         } else if (!hOutComm && hOutAmt > 0) {',
'                                                             hOutComm = Math.round(hOutAmt * (25 / 120))',
'                                                         }',
'',
'                                                         const hOutProfit = -hOutAmt + hOutComm + hOutWin',
'                                                         const cardProfit = hInProfit + hOutProfit'
        ];

        let calcEnd = calcStart;
        for (let i = calcStart; i < calcStart + 30; i++) {
            if (lines[i].includes('const cardProfit = hInProfit + hOutProfit')) {
                calcEnd = i;
                break;
            }
        }

        lines.splice(calcStart, calcEnd - calcStart + 1, ...newCalcLines);
    }
}

// 4. Update header display for history card to use hInComm and hInPay
content = lines.join('\n');

content = content.replace(
    '<div style={{ fontWeight: \'600\' }}>฿{history.total_commission?.toLocaleString()}</div>',
    '<div style={{ fontWeight: \'600\' }}>฿{Math.round(hInComm || 0).toLocaleString()}</div>'
);

content = content.replace(
    '<div style={{ fontWeight: \'600\', color: \'var(--color-danger)\' }}>฿{history.total_payout?.toLocaleString()}</div>',
    '<div style={{ fontWeight: \'600\', color: \'var(--color-danger)\' }}>฿{Math.round(hInPay || 0).toLocaleString()}</div>'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed history commission & payout calculations successfully!');
