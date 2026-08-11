const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Top summary banner profit: historyTotals.profit.toLocaleString()
content = content.replace(
    '฿{historyTotals.profit.toLocaleString()}',
    '฿{Math.round(historyTotals.profit).toLocaleString()}'
);

// 2. Incoming card profit: historyTotals.incoming_profit.toLocaleString()
content = content.replace(
    '฿{historyTotals.incoming_profit.toLocaleString()}',
    '฿{Math.round(historyTotals.incoming_profit).toLocaleString()}'
);

// 3. Outgoing card profit: historyTotals.outgoing_profit.toLocaleString()
content = content.replace(
    '฿{historyTotals.outgoing_profit.toLocaleString()}',
    '฿{Math.round(historyTotals.outgoing_profit).toLocaleString()}'
);

// 4. Card header profit: cardProfit.toLocaleString()
content = content.replace(
    '฿{cardProfit.toLocaleString()}',
    '฿{Math.round(cardProfit).toLocaleString()}'
);

// 5. Member breakdown dealer profit: dealerProfit.toLocaleString()
content = content.replace(
    '฿{dealerProfit.toLocaleString()}',
    '฿{Math.round(dealerProfit).toLocaleString()}'
);

// 6. Layoff transfer profit: tProfit.toLocaleString()
content = content.replace(
    '฿{tProfit.toLocaleString()}',
    '฿{Math.round(tProfit).toLocaleString()}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Formatted all profit displays to integers with Math.round() successfully!');
