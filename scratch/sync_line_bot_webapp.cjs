const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 1. Update historyTotals calculation (lines ~325-350)
for (let i = 310; i < 350; i++) {
    if (lines[i] && lines[i].includes('const outComm = h.upstream_commission ||')) {
        lines[i] = '            const outComm = Number(h.upstream_commission || 0)';
        console.log('Updated historyTotals outComm calculation!');
    }
}

// 2. Update card header outComm fallback in filteredRoundHistory.map (lines ~2760-2810)
for (let i = 2750; i < 2820; i++) {
    if (lines[i] && lines[i].includes('hOutComm = Math.round(hOutAmt * (25 / 120))')) {
        lines[i] = '                                                             hOutComm = Number(history.upstream_commission || 0)';
        console.log('Updated card header outComm fallback!');
    }
}

// 3. Update effectiveTransfers fallback in details section (lines ~2870-2910)
for (let i = 2850; i < 2910; i++) {
    if (lines[i] && lines[i].includes('const outComm = Number(history.upstream_commission ||')) {
        lines[i] = '                                                                                 const outComm = Number(history.upstream_commission || 0)';
        console.log('Updated effectiveTransfers outComm fallback!');
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Script execution complete!');
