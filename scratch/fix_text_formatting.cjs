const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Change text "💵 กำไรสุทธิรวมทั้งหมด (ยอดรับ + ยอดส่ง):" to "💵 กำไรสุทธิ:"
content = content.replace(
    '💵 กำไรสุทธิรวมทั้งหมด (ยอดรับ + ยอดส่ง):',
    '💵 กำไรสุทธิ:'
);

// 2. Fix top header net profit format
content = content.replace(
    '{historyTotals.profit >= 0 ? "+" : ""}฿{Math.round(historyTotals.profit).toLocaleString()}',
    '{historyTotals.profit >= 0 ? "+฿" : "-฿"}{Math.abs(Math.round(historyTotals.profit)).toLocaleString()}'
);

// 3. Fix Incoming Card profit format
content = content.replace(
    'กำไร: {historyTotals.incoming_profit >= 0 ? "+" : ""}฿{Math.round(historyTotals.incoming_profit).toLocaleString()}',
    'กำไร: {historyTotals.incoming_profit >= 0 ? "+฿" : "-฿"}{Math.abs(Math.round(historyTotals.incoming_profit)).toLocaleString()}'
);

// 4. Fix Outgoing Card profit format (กำไร: ฿-641 -> กำไร: -฿641)
content = content.replace(
    'กำไร: {historyTotals.outgoing_profit >= 0 ? "+" : ""}฿{Math.round(historyTotals.outgoing_profit).toLocaleString()}',
    'กำไร: {historyTotals.outgoing_profit >= 0 ? "+฿" : "-฿"}{Math.abs(Math.round(historyTotals.outgoing_profit)).toLocaleString()}'
);

// 5. Fix Member Submissions table "กำไรเจ้ามือ" column (฿-1,462 -> -฿1,462)
content = content.replace(
    '{dealerProfit >= 0 ? "+" : ""}฿{Math.round(dealerProfit).toLocaleString()}',
    '{dealerProfit >= 0 ? "+฿" : "-฿"}{Math.abs(Math.round(dealerProfit)).toLocaleString()}'
);

// 6. Fix Outgoing Layoff table "กำไรจากการตีออก" column
content = content.replace(
    '{tProfit >= 0 ? "+" : ""}฿{Math.round(tProfit).toLocaleString()}',
    '{tProfit >= 0 ? "+฿" : "-฿"}{Math.abs(Math.round(tProfit)).toLocaleString()}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated text and currency formatting in Dealer.jsx!');
