const fs = require('fs');
const path = require('path');

// 1. Update Dealer.jsx
const dealerPath = path.join(__dirname, '../src/pages/Dealer.jsx');
let dealerLines = fs.readFileSync(dealerPath, 'utf8').split('\n');

for (let i = 310; i < 360; i++) {
    if (dealerLines[i] && dealerLines[i].includes('const outComm = Number(h.upstream_commission || 0)')) {
        dealerLines[i] = '            const outComm = Number(h.upstream_commission || 0) > 0 ? Number(h.upstream_commission) : Math.round(outAmt * (25 / 120))';
        console.log('Updated Dealer.jsx historyTotals outComm!');
    }
}

for (let i = 2760; i < 2830; i++) {
    if (dealerLines[i] && dealerLines[i].includes('hOutComm = Number(history.upstream_commission || 0)')) {
        dealerLines[i] = '                                                             hOutComm = Number(history.upstream_commission || 0) > 0 ? Number(history.upstream_commission) : Math.round(hOutAmt * (25 / 120))';
        console.log('Updated Dealer.jsx card header outComm!');
    }
}

for (let i = 2860; i < 2910; i++) {
    if (dealerLines[i] && dealerLines[i].includes('const outComm = Number(history.upstream_commission || 0)')) {
        dealerLines[i] = '                                                                                 const outComm = Number(history.upstream_commission || 0) > 0 ? Number(history.upstream_commission) : Math.round(outAmt * (25 / 120))';
        console.log('Updated Dealer.jsx effectiveTransfers outComm!');
    }
}

fs.writeFileSync(dealerPath, dealerLines.join('\n'), 'utf8');

// 2. Update LINE Bot index.ts
const lineBotPath = path.join(__dirname, '../supabase/functions/line-bot/index.ts');
let lineBotContent = fs.readFileSync(lineBotPath, 'utf8');

const oldLineBotBlock = `                totalTransferredEntries += (h.transferred_entries || 0);
                totalTransferred += parseFloat(h.transferred_amount || 0);
                totalUpstreamComm += parseFloat(h.upstream_commission || 0);
                totalUpstreamWin += parseFloat(h.upstream_winnings || 0);`;

const newLineBotBlock = `                const hTransferred = parseFloat(h.transferred_amount || 0);
                const hUpstreamComm = parseFloat(h.upstream_commission || 0) > 0 
                  ? parseFloat(h.upstream_commission) 
                  : Math.round(hTransferred * (25 / 120));

                totalTransferredEntries += (h.transferred_entries || 0);
                totalTransferred += hTransferred;
                totalUpstreamComm += hUpstreamComm;
                totalUpstreamWin += parseFloat(h.upstream_winnings || 0);`;

if (lineBotContent.includes(oldLineBotBlock)) {
    lineBotContent = lineBotContent.replace(oldLineBotBlock, newLineBotBlock);
    console.log('Updated LINE Bot index.ts profit accumulation!');
} else {
    console.error('Could not find oldLineBotBlock target in index.ts');
}

fs.writeFileSync(lineBotPath, lineBotContent, 'utf8');
console.log('Script execution finished!');
