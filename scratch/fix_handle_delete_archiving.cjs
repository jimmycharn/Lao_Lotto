const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const oldLine = 'const upstreamCommission = transfers?.reduce((sum, t) => sum + (t.commission_earned || 0), 0) || 0';
const newLine = 'const upstreamCommission = transfers?.reduce((sum, t) => sum + calculateTransferCommission(t), 0) || 0';

if (content.includes(oldLine)) {
    content = content.replace(oldLine, newLine);
    console.log('Updated line 2065 in handleDeleteRound!');
} else {
    console.log('oldLine not found directly, checking occurrences...');
    const occurrences = content.split('(t.commission_earned || 0)').length - 1;
    console.log(`Found ${occurrences} occurrences of (t.commission_earned || 0)`);
    content = content.replaceAll('(t.commission_earned || 0)', 'calculateTransferCommission(t)');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script finished successfully!');
