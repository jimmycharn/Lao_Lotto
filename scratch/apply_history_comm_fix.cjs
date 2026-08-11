const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Insert getMemberCommission helper function
const helperCode = `
// Helper to ensure member commission is non-zero (default 20% fallback if missing in archived history)
function getMemberCommission(amount, commission) {
    if (commission !== undefined && commission !== null && Number(commission) > 0) {
        return Number(commission)
    }
    const amt = Number(amount || 0)
    if (amt <= 0) return 0
    return Math.round(amt * 0.20)
}
`;

content = content.replace('function calculateTransferCommission', helperCode + '\nfunction calculateTransferCommission');

// 2. Update userHistoriesWithProfiles inside fetchHistoryDetails
const oldProfileMap = `            const userHistoriesWithProfiles = userHistories.map(uh => ({\n                ...uh,\n                profiles: profilesMap[uh.user_id] || null\n            }))`;
const newProfileMap = `            const userHistoriesWithProfiles = userHistories.map(uh => ({\n                ...uh,\n                total_commission: getMemberCommission(uh.total_amount, uh.total_commission),\n                total_winnings: Number(uh.total_winnings || 0),\n                profiles: profilesMap[uh.user_id] || null\n            }))`;

content = content.replace(oldProfileMap, newProfileMap);

// 3. Update history card header calculation in filteredRoundHistory.map
const oldHeaderCalc = `                                                         const hInAmt = history.total_amount || 0\n                                                         const hInComm = history.total_commission || 0\n                                                         const hInPay = history.total_payout || 0\n                                                         const hInProfit = hInAmt - hInComm - hInPay\n\n                                                         const rawTransfers = details?.transfers || []\n                                                         let hOutAmt = history.transferred_amount || 0\n                                                         let hOutComm = history.upstream_commission || 0\n                                                         let hOutWin = history.upstream_winnings || 0\n\n                                                         if (rawTransfers.length > 0) {\n                                                             hOutAmt = rawTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)\n                                                             hOutComm = rawTransfers.reduce((sum, t) => sum + calculateTransferCommission(t), 0)\n                                                             hOutWin = rawTransfers.reduce((sum, t) => sum + (t.winnings || 0), 0)\n                                                         } else if (!hOutComm && hOutAmt > 0) {\n                                                             hOutComm = Math.round(hOutAmt * (25 / 120))\n                                                         }\n\n                                                         const hOutProfit = -hOutAmt + hOutComm + hOutWin\n                                                         const cardProfit = hInProfit + hOutProfit`;

const newHeaderCalc = `                                                         const userHistories = details?.userHistories || []\n                                                         const rawTransfers = details?.transfers || []\n\n                                                         const hInAmt = history.total_amount || 0\n                                                         let hInComm = history.total_commission || 0\n                                                         let hInPay = history.total_payout || 0\n\n                                                         if (userHistories.length > 0) {\n                                                             hInComm = userHistories.reduce((sum, u) => sum + (u.total_commission || 0), 0)\n                                                             hInPay = userHistories.reduce((sum, u) => sum + (u.total_winnings || 0), 0)\n                                                         } else if (!hInComm && hInAmt > 0) {\n                                                             hInComm = Math.round(hInAmt * 0.20)\n                                                         }\n\n                                                         const hInProfit = hInAmt - hInComm - hInPay\n\n                                                         let hOutAmt = history.transferred_amount || 0\n                                                         let hOutComm = history.upstream_commission || 0\n                                                         let hOutWin = history.upstream_winnings || 0\n\n                                                         if (rawTransfers.length > 0) {\n                                                             hOutAmt = rawTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)\n                                                             hOutComm = rawTransfers.reduce((sum, t) => sum + calculateTransferCommission(t), 0)\n                                                             hOutWin = rawTransfers.reduce((sum, t) => sum + (t.winnings || 0), 0)\n                                                         } else if (!hOutComm && hOutAmt > 0) {\n                                                             hOutComm = Math.round(hOutAmt * (25 / 120))\n                                                         }\n\n                                                         const hOutProfit = -hOutAmt + hOutComm + hOutWin\n                                                         const cardProfit = hInProfit + hOutProfit`;

content = content.replace(oldHeaderCalc, newHeaderCalc);

// 4. Update header stats display to use hInComm and hInPay
content = content.replace(
    `<div style={{ fontWeight: '600' }}>฿{history.total_commission?.toLocaleString()}</div>`,
    `<div style={{ fontWeight: '600' }}>฿{Math.round(hInComm || 0).toLocaleString()}</div>`
);

content = content.replace(
    `<div style={{ fontWeight: '600', color: 'var(--color-danger)' }}>฿{history.total_payout?.toLocaleString()}</div>`,
    `<div style={{ fontWeight: '600', color: 'var(--color-danger)' }}>฿{Math.round(hInPay || 0).toLocaleString()}</div>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Applied history comm & payout fix successfully!');
