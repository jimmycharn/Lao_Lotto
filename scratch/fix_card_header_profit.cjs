const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

let mapStart = -1;
for (let i = 2700; i < lines.length; i++) {
    if (lines[i].includes('{filteredRoundHistory.map(history => {')) {
        mapStart = i;
        break;
    }
}

if (mapStart !== -1) {
    // Insert cardProfit calculation right after const details = historyDetails[history.id]
    const calcLines = [
'                                                         const hInAmt = history.total_amount || 0',
'                                                         const hInComm = history.total_commission || 0',
'                                                         const hInPay = history.total_payout || 0',
'                                                         const hInProfit = hInAmt - hInComm - hInPay',
'',
'                                                         const hOutAmt = history.transferred_amount || 0',
'                                                         const hOutComm = history.upstream_commission || (hOutAmt > 0 ? Math.round(hOutAmt * 0.25) : 0)',
'                                                         const hOutWin = history.upstream_winnings || 0',
'                                                         const hOutProfit = -hOutAmt + hOutComm + hOutWin',
'',
'                                                         const cardProfit = hInProfit + hOutProfit'
    ];

    lines.splice(mapStart + 3, 0, ...calcLines);

    // Now find lines with history.profit display and replace with cardProfit
    for (let i = mapStart + 3; i < mapStart + 80; i++) {
        if (lines[i].includes('color: history.profit >= 0')) {
            lines[i] = lines[i].replace('history.profit >= 0', 'cardProfit >= 0');
        }
        if (lines[i].includes('{history.profit >= 0 ?')) {
            lines[i] = lines[i].replace('{history.profit >= 0 ? \'+\' : \'\'}฿{history.profit?.toLocaleString()}', '{cardProfit >= 0 ? \'+\' : \'\'}฿{cardProfit.toLocaleString()}');
        }
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('Card header profit updated successfully!');
} else {
    console.error('Could not find mapStart!');
}
