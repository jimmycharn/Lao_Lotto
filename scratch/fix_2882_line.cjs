const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

let count = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Math.round(outAmt * 0.25)')) {
        lines[i] = lines[i].replace('Math.round(outAmt * 0.25)', 'Math.round(outAmt * (25 / 120))');
        count++;
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log(`Replaced ${count} occurrences of Math.round(outAmt * 0.25) with Math.round(outAmt * (25 / 120))`);
