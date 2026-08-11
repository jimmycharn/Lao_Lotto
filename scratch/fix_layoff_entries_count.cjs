const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace history.total_entries || "-" with "-" in effectiveTransfers fallback
content = content.replace('entriesCount: history.total_entries || "-",', 'entriesCount: "-",');
content = content.replace("entriesCount: history.total_entries || '-',", "entriesCount: '-',");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed entriesCount in fallback successfully!');
