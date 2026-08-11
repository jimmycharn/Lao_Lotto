const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 1. Add getMemberCommission helper
const helperLine = `// Helper to ensure member commission is non-zero
function getMemberCommission(amount, commission) {
    if (commission !== undefined && commission !== null && Number(commission) > 0) {
        return Number(commission)
    }
    const amt = Number(amount || 0)
    if (amt <= 0) return 0
    return Math.round(amt * 0.20)
}`;

for (let i = 0; i < 100; i++) {
    if (lines[i].includes('function calculateTransferCommission')) {
        lines.splice(i, 0, helperLine);
        console.log('Inserted getMemberCommission helper!');
        break;
    }
}

// 2. Modify userHistoriesWithProfiles (lines ~260-270)
for (let i = 240; i < 280; i++) {
    if (lines[i] && lines[i].includes('const userHistoriesWithProfiles = userHistories.map')) {
        lines.splice(i + 1, 0,
            '                total_commission: getMemberCommission(uh.total_amount, uh.total_commission),',
            '                total_winnings: Number(uh.total_winnings || 0),'
        );
        console.log('Updated userHistoriesWithProfiles mapping!');
        break;
    }
}

// 3. Update header stats card calculations (lines ~2760-2820)
for (let i = 2750; i < 2850; i++) {
    if (lines[i] && lines[i].includes('const hInAmt = history.total_amount')) {
        const newLines = [
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

        let endIdx = i;
        for (let j = i; j < i + 30; j++) {
            if (lines[j].includes('const cardProfit = hInProfit + hOutProfit')) {
                endIdx = j;
                break;
            }
        }

        lines.splice(i, endIdx - i + 1, ...newLines);
        console.log('Updated card header profit calculations!');
        break;
    }
}

// 4. Update display elements for total_commission and total_payout in card header
for (let i = 2750; i < lines.length; i++) {
    if (lines[i] && lines[i].includes('{history.total_commission?.toLocaleString()}')) {
        lines[i] = lines[i].replace('{history.total_commission?.toLocaleString()}', '{Math.round(hInComm || 0).toLocaleString()}');
    }
    if (lines[i] && lines[i].includes('{history.total_payout?.toLocaleString()}')) {
        lines[i] = lines[i].replace('{history.total_payout?.toLocaleString()}', '{Math.round(hInPay || 0).toLocaleString()}');
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Line-by-line fix executed successfully!');
