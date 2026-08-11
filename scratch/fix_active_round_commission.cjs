const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace (t.commission_earned || 0) in fetchRoundHistory with calculateTransferCommission(t)
const oldLine = 'const upstreamCommission = transfers?.reduce((sum, t) => sum + (t.commission_earned || 0), 0) || 0';
const newLine = 'const upstreamCommission = transfers?.reduce((sum, t) => sum + calculateTransferCommission(t), 0) || 0';

if (content.includes(oldLine)) {
    content = content.replace(oldLine, newLine);
    console.log('Successfully updated upstreamCommission calculation in fetchRoundHistory!');
} else {
    console.error('Could not find oldLine target in Dealer.jsx!');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script execution complete!');
