const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace summary box
const oldSummaryBoxStart = '{/* Aggregated Profit / Stats Summary Box */}';
const oldSummaryBoxEnd = '</div>\n                                            </div>';

const newSummaryBox = `{/* Aggregated Profit / Stats Summary Box */}
                                            <div className="history-summary-stats-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                                {/* Header Bar: Selected Count & Net Profit */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 193, 7, 0.08)', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid rgba(255, 193, 7, 0.2)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>จำนวนงวดที่เลือก:</span>
                                                        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-warning)' }}>{filteredRoundHistory.length} งวด</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>💵 กำไรสุทธิรวมทั้งหมด (ยอดรับ + ยอดส่ง):</span>
                                                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: historyTotals.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                                            {historyTotals.profit >= 0 ? '+' : ''}฿{historyTotals.profit.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Two Breakdown Cards: Incoming (ยอดรับ) & Outgoing (ยอดส่ง/ตีออก) */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                                    {/* Incoming Card (ยอดรับจากสมาชิก) */}
                                                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>🟢 ยอดรับ (จากสมาชิก)</span>
                                                            <span style={{ color: historyTotals.incoming_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                                                กำไร: {historyTotals.incoming_profit >= 0 ? '+' : ''}฿{historyTotals.incoming_profit.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.8rem' }}>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ยอดรวมส่ง</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>฿{historyTotals.total_amount.toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ค่าคอมรวม</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-warning)' }}>฿{Math.round(historyTotals.total_commission).toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>จ่ายรวม</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-danger)' }}>฿{historyTotals.total_payout.toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Outgoing Card (ยอดส่งตีออกให้เจ้ามือ) */}
                                                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>🔴 ยอดส่ง (ตีออกให้เจ้ามือ)</span>
                                                            <span style={{ color: historyTotals.outgoing_profit >= 0 ? 'var(--color-success)' : '#ef4444' }}>
                                                                กำไร: {historyTotals.outgoing_profit >= 0 ? '+' : ''}฿{historyTotals.outgoing_profit.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.8rem' }}>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ยอดตีออก</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ef4444' }}>-฿{historyTotals.transferred_amount.toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>ค่าคอมได้รับ</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-success)' }}>+฿{Math.round(historyTotals.upstream_commission).toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>รับคืนรางวัล</div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-success)' }}>+฿{historyTotals.upstream_winnings.toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>`;

const idx1 = content.indexOf(oldSummaryBoxStart);
const idx2 = content.indexOf(oldSummaryBoxEnd, idx1);

if (idx1 !== -1 && idx2 !== -1) {
    content = content.substring(0, idx1) + newSummaryBox + content.substring(idx2 + oldSummaryBoxEnd.length);
    console.log('Summary box replaced successfully!');
} else {
    console.error('Could not find summary box indexes', { idx1, idx2 });
}

// 2. Replace details section
const oldDetailsStart = '(() => {\n                                                                                const userHistories = details?.userHistories || []';
const oldDetailsEnd = '})()';

const newDetails = `(() => {
                                                                                const userHistories = details?.userHistories || []
                                                                                const rawTransfers = details?.transfers || []
                                                                                
                                                                                const groupedMap = {}
                                                                                if (rawTransfers.length > 0) {
                                                                                    rawTransfers.forEach(t => {
                                                                                        const dName = t.upstream_dealer?.full_name || t.target_dealer_name || 'เจ้ามือ'
                                                                                        if (!groupedMap[dName]) {
                                                                                            groupedMap[dName] = {
                                                                                                id: t.id,
                                                                                                dealerName: dName,
                                                                                                entriesCount: 0,
                                                                                                amount: 0,
                                                                                                commission_earned: 0,
                                                                                                winnings: 0
                                                                                            }
                                                                                        }
                                                                                        const amt = t.amount || 0
                                                                                        const commRate = t.bet_type === '3_top' || t.bet_type === '3_tod' ? 0.30 :
                                                                                                         t.bet_type === '2_top' || t.bet_type === '2_bottom' ? 0.28 : 0.25
                                                                                        const comm = t.commission_earned !== undefined ? t.commission_earned : Math.round(amt * commRate)
                                                                                        const win = t.winnings || 0

                                                                                        groupedMap[dName].entriesCount += 1
                                                                                        groupedMap[dName].amount += amt
                                                                                        groupedMap[dName].commission_earned += comm
                                                                                        groupedMap[dName].winnings += win
                                                                                    })
                                                                                }

                                                                                const effectiveTransfers = Object.values(groupedMap).length > 0 
                                                                                    ? Object.values(groupedMap) 
                                                                                    : ((history.transferred_amount || 0) > 0 ? [{
                                                                                        id: 'archived_transfer_' + history.id,
                                                                                        dealerName: 'เจ้ามือ (สรุปในประวัติ)',
                                                                                        entriesCount: '-',
                                                                                        amount: history.transferred_amount,
                                                                                        commission_earned: history.upstream_commission,
                                                                                        winnings: history.upstream_winnings
                                                                                    }] : [])
                                                                                
                                                                                return (
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                                                        {/* Member Submissions Table */}
                                                                                        <div>
                                                                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-warning)' }}>
                                                                                                📊 รายละเอียดการส่งเลขของสมาชิกในงวดนี้
                                                                                            </h4>
                                                                                            {userHistories.length === 0 ? (
                                                                                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: '0.5rem' }}>ไม่มีรายละเอียดสมาชิกบันทึกไว้สำหรับงวดนี้</div>
                                                                                            ) : (
                                                                                                <div className="history-members-breakdown" style={{ overflowX: 'auto' }}>
                                                                                                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                                                                                        <thead>
                                                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem' }}>สมาชิก</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>จำนวนรายการ</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ยอดส่ง</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ค่าคอม</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ถูกรางวัล</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>กำไรเจ้ามือ</th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody>
                                                                                                            {userHistories.map(uh => {
                                                                                                                const memberName = uh.profiles?.full_name || uh.profiles?.line_display_name || uh.profiles?.email || 'ไม่ระบุ'
                                                                                                                const dealerProfit = (uh.total_amount || 0) - (uh.total_commission || 0) - (uh.total_winnings || 0)
                                                                                                                return (
                                                                                                                    <tr key={uh.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                                                                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{memberName}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{uh.total_entries}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>฿{(uh.total_amount || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-warning)' }}>฿{Math.round(uh.total_commission || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-danger)' }}>฿{(uh.total_winnings || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: dealerProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                                                                                                            {dealerProfit >= 0 ? '+' : ''}฿{dealerProfit.toLocaleString()}
                                                                                                                        </td>
                                                                                                                    </tr>
                                                                                                                )
                                                                                                            })}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>

                                                                                        {/* Outgoing Layoff Bet Transfers Table */}
                                                                                        {effectiveTransfers.length > 0 && (
                                                                                            <div>
                                                                                                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: '#ef4444' }}>
                                                                                                    🚀 รายละเอียดการตีออกให้เจ้ามือในงวดนี้
                                                                                                </h4>
                                                                                                <div className="history-transfers-breakdown" style={{ overflowX: 'auto' }}>
                                                                                                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                                                                                        <thead>
                                                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem' }}>เจ้ามือรับตีออก</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>จำนวนรายการ</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ยอดตีออก</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ค่าคอมได้รับ</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>รับคืนรางวัล</th>
                                                                                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>กำไรจากการตีออก</th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody>
                                                                                                            {effectiveTransfers.map(t => {
                                                                                                                const upstreamName = t.dealerName || 'เจ้ามือ'
                                                                                                                const entriesCount = t.entriesCount !== undefined ? t.entriesCount : '-'
                                                                                                                const tProfit = -(t.amount || 0) + (t.commission_earned || 0) + (t.winnings || 0)
                                                                                                                return (
                                                                                                                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                                                                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{upstreamName}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{entriesCount}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>-฿{(t.amount || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-success)' }}>+฿{Math.round(t.commission_earned || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-success)' }}>+฿{(t.winnings || 0).toLocaleString()}</td>
                                                                                                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: tProfit >= 0 ? 'var(--color-success)' : '#ef4444' }}>
                                                                                                                            {tProfit >= 0 ? '+' : ''}฿{tProfit.toLocaleString()}
                                                                                                                        </td>
                                                                                                                    </tr>
                                                                                                                )
                                                                                                            })}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )
                                                                            })()`;

const dIdx1 = content.indexOf(oldDetailsStart);
const dIdx2 = content.indexOf(oldDetailsEnd, dIdx1);

if (dIdx1 !== -1 && dIdx2 !== -1) {
    content = content.substring(0, dIdx1) + newDetails + content.substring(dIdx2 + oldDetailsEnd.length);
    console.log('Details section replaced successfully!');
} else {
    console.error('Could not find details section indexes', { dIdx1, dIdx2 });
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
