const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 1. Fix historyTotals outComm estimation (lines ~325-345)
for (let i = 300; i < 350; i++) {
    if (lines[i] && lines[i].includes('const outComm = h.upstream_commission ||')) {
        lines[i] = '            const outComm = h.upstream_commission || (outAmt > 0 ? Math.round(outAmt * (25 / 120)) : 0)';
    }
}

// 2. Fix cardProfit calculation inside filteredRoundHistory.map (lines ~2750-2775)
let mapStart = -1;
for (let i = 2700; i < lines.length; i++) {
    if (lines[i].includes('{filteredRoundHistory.map(history => {')) {
        mapStart = i;
        break;
    }
}

if (mapStart !== -1) {
    // Find where hInAmt was inserted and replace the calculation block
    let calcStart = -1;
    for (let i = mapStart; i < mapStart + 20; i++) {
        if (lines[i].includes('const hInAmt = history.total_amount')) {
            calcStart = i;
            break;
        }
    }

    if (calcStart !== -1) {
        const newCalcLines = [
'                                                         const hInAmt = history.total_amount || 0',
'                                                         const hInComm = history.total_commission || 0',
'                                                         const hInPay = history.total_payout || 0',
'                                                         const hInProfit = hInAmt - hInComm - hInPay',
'',
'                                                         const rawTransfers = details?.transfers || []',
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

        // Find end of previous calc block (const cardProfit = hInProfit + hOutProfit)
        let calcEnd = calcStart;
        for (let i = calcStart; i < calcStart + 25; i++) {
            if (lines[i].includes('const cardProfit = hInProfit + hOutProfit')) {
                calcEnd = i;
                break;
            }
        }

        lines.splice(calcStart, calcEnd - calcStart + 1, ...newCalcLines);
        console.log('Card profit calculation synced successfully!');
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Script execution complete!');
