const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../supabase/functions/line-bot/index.ts');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    const startMarker = '// ─── COMMAND 5: /โพย หรือ /bill ───';
    const endMarker = '// ─── NORMAL MESSAGE (Check if in a bound group for processing bets) ───';

    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx === -1) {
        throw new Error(`Could not find start marker: ${startMarker}`);
    }
    if (endIdx === -1) {
        throw new Error(`Could not find end marker: ${endMarker}`);
    }
    if (startIdx >= endIdx) {
        throw new Error(`Start marker is after or equal to end marker!`);
    }

    const newHandler = `${startMarker}
        if (text.startsWith('/bill') || text.startsWith('/โพย')) {
          try {
            let billCode = '';
            if (text.startsWith('/bill')) {
              billCode = text.substring('/bill'.length).trim();
            } else if (text.startsWith('/โพย')) {
              billCode = text.substring('/โพย'.length).trim();
            }

            if (!billCode) {
              await sendLineReply(replyToken, \`❌ กรุณาระบุเลขใบโพยที่ต้องการดู\\n(เช่น /โพย 824077)\`);
              continue;
            }

            // 1. Find the active submissions with this bill_id
            const { data: subs, error: fetchErr } = await supabase
              .from('submissions')
              .select('id, amount, bet_type, numbers, user_id, round_id, entry_id, display_numbers, display_amount, display_bet_type')
              .eq('bill_id', billCode)
              .eq('is_deleted', false)
              .order('created_at', { ascending: true })
              .order('id', { ascending: true });

            if (fetchErr || !subs || subs.length === 0) {
              await sendLineReply(replyToken, \`❌ ไม่พบใบโพยหมายเลข "\${billCode}" หรือใบโพยนี้ถูกยกเลิกไปแล้ว\`);
              continue;
            }

            const userIdOfBill = subs[0].user_id;
            const roundIdOfBill = subs[0].round_id;

            // 2. Fetch user profile and round details
            const [profileRes, roundRes] = await Promise.all([
              supabase.from('profiles').select('full_name').eq('id', userIdOfBill).maybeSingle(),
              supabase.from('lottery_rounds').select('lottery_type, round_date, dealer_id').eq('id', roundIdOfBill).maybeSingle()
            ]);

            const buyerName = profileRes.data?.full_name || 'Unknown User';
            const roundData = roundRes.data;

            if (!roundData) {
              await sendLineReply(replyToken, \`❌ ไม่พบข้อมูลรอบหวยที่เกี่ยวข้องกับใบโพยนี้\`);
              continue;
            }

            const targetDealerId = roundData.dealer_id;

            // 3. Verify sender authorization
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('line_user_id', userId)
              .maybeSingle();

            let isAuthorized = false;
            if (senderProfile) {
              if (senderProfile.id === targetDealerId || senderProfile.id === userIdOfBill) {
                isAuthorized = true;
              } else {
                const { data: membership } = await supabase
                  .from('user_dealer_memberships')
                  .select('id')
                  .eq('user_id', senderProfile.id)
                  .eq('dealer_id', targetDealerId)
                  .eq('status', 'active')
                  .maybeSingle();
                if (membership) {
                  isAuthorized = true;
                }
              }
            }

            if (!isAuthorized && targetDealerId) {
              const { data: manager } = await supabase
                .from('line_managers')
                .select('id')
                .eq('dealer_id', targetDealerId)
                .eq('line_user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
              if (manager) {
                isAuthorized = true;
              }
            }

            if (!isAuthorized) {
              await sendLineReply(replyToken, \`❌ คุณไม่มีสิทธิ์เข้าดูรายละเอียดใบโพยนี้\`);
              continue;
            }

            // 4. Format and reply with the list of purchases grouped by entry_id
            const LABELS = {
              '2_top': 'บน',
              '2_bottom': 'ล่าง',
              '3_top': 'บน',
              '3_tod': 'โต๊ด',
              '3_front': '3 ตัวหน้า',
              '3_back': '3 ตัวหลัง',
              '4_tod': '4 ตัวโต๊ด',
              '4_set': '4 ตัวชุด',
              '6_top': '6 ตัวบน',
              '4_float': '4 ตัวลอยแพ',
              '5_float': '5 ตัวลอยแพ',
              'run_top': 'ลอยบน',
              'run_bottom': 'ลอยล่าง'
            };

            // Grouping algorithm
            const formattedLines = [];
            let totalAmount = 0;

            // Separate items by whether they have entry_id
            const withEntryId = subs.filter(s => s.entry_id);
            const withoutEntryId = subs.filter(s => !s.entry_id);

            // Process items with entry_id
            const entryGroups = new Map();
            withEntryId.forEach(s => {
              const gid = s.entry_id;
              if (!entryGroups.has(gid)) {
                entryGroups.set(gid, []);
              }
              entryGroups.get(gid).push(s);
            });

            entryGroups.forEach((group) => {
              const first = group[0];
              const count = group.length;
              const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
              totalAmount += groupSum;

              let disp = first.display_numbers;
              if (!disp) {
                const numStr = first.numbers || '';
                const betTypeStr = first.bet_type || '';
                const len = numStr.length;
                if (len === 2 && count === 2 && betTypeStr.startsWith('2_')) {
                  const label = betTypeStr === '2_top' ? 'บนกลับ' : 'ล่างกลับ';
                  disp = \`\${numStr}=\${first.amount}*\${first.amount} \${label}\`;
                } else if (len === 3 && count > 1 && betTypeStr === '3_top') {
                  disp = \`\${numStr}=\${first.amount}*\${count} คูณชุด\`;
                } else {
                  const label = LABELS[betTypeStr] || betTypeStr;
                  disp = \`\${numStr}=\${first.amount} \${label}\`;
                }
              }

              const countSuffix = count > 1 ? \` (\${count})\` : '';
              formattedLines.push(\`\${disp}\${countSuffix}\`);
            });

            // Process items without entry_id (historical/fallback grouping)
            const visited = new Set();
            for (let i = 0; i < withoutEntryId.length; i++) {
              if (visited.has(i)) continue;
              const current = withoutEntryId[i];
              const numStr = current.numbers || '';
              const betTypeStr = current.bet_type || '';
              const len = numStr.length;

              // A. 3-digit permutation grouping
              if (len === 3 && betTypeStr === '3_top') {
                const group = [current];
                visited.add(i);
                const currentSorted = numStr.split('').sort().join('');

                for (let j = i + 1; j < withoutEntryId.length; j++) {
                  if (visited.has(j)) continue;
                  const other = withoutEntryId[j];
                  const otherNumStr = other.numbers || '';
                  if (otherNumStr.length === 3 && other.bet_type === '3_top' && other.amount === current.amount) {
                    const otherSorted = otherNumStr.split('').sort().join('');
                    if (currentSorted === otherSorted) {
                      group.push(other);
                      visited.add(j);
                    }
                  }
                }

                const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
                totalAmount += groupSum;

                if (group.length > 1) {
                  const count = group.length;
                  formattedLines.push(\`\${numStr}=\\\\\${current.amount}*\${count} คูณชุด (\${count})\`);
                } else {
                  formattedLines.push(\`\${numStr}=\${current.amount} บน\`);
                }
              }
              // B. 2-digit reverse grouping
              else if (len === 2 && (betTypeStr === '2_top' || betTypeStr === '2_bottom')) {
                const group = [current];
                visited.add(i);
                const reversed = numStr.split('').reverse().join('');

                if (reversed !== numStr) {
                  for (let j = i + 1; j < withoutEntryId.length; j++) {
                    if (visited.has(j)) continue;
                    const other = withoutEntryId[j];
                    const otherNumStr = other.numbers || '';
                    if (otherNumStr.length === 2 && other.bet_type === current.bet_type && other.amount === current.amount && otherNumStr === reversed) {
                      group.push(other);
                      visited.add(j);
                      break;
                    }
                  }
                }

                const groupSum = group.reduce((sum, s) => sum + Number(s.amount || 0), 0);
                totalAmount += groupSum;

                if (group.length > 1) {
                  const label = betTypeStr === '2_top' ? 'บนกลับ' : 'ล่างกลับ';
                  formattedLines.push(\`\${numStr}=\${current.amount}*\${current.amount} \${label} (\${group.length})\`);
                } else {
                  const label = betTypeStr === '2_top' ? 'บน' : 'ล่าง';
                  formattedLines.push(\`\${numStr}=\${current.amount} \${label}\`);
                }
              }
              // C. Other items (singles, double 2-digits like 77, 4-digits, runners, etc.)
              else {
                visited.add(i);
                totalAmount += Number(current.amount || 0);
                const label = LABELS[betTypeStr] || betTypeStr;
                formattedLines.push(\`\${numStr}=\${current.amount} \${label}\`);
              }
            }

            let summaryText = \`📄 ใบโพย: \${billCode}\\n\`;
            summaryText += \`ประเภท: \${roundData.lottery_type.toUpperCase()}\\n\`;
            summaryText += \`งวดวันที่: \${formatToThaiBudDate(roundData.round_date)}\\n\`;
            summaryText += \`ผู้ซื้อ: คุณ \${buyerName}\\n\`;
            summaryText += \`จำนวนรายการ: \${subs.length}\\n\`;
            summaryText += \`--------------------------\\n\`;

            summaryText += formattedLines.join('\\n') + '\\n';

            summaryText += \`--------------------------\\n\`;
            summaryText += \`💰 ยอดรวม: ฿\${totalAmount.toLocaleString('th-TH')}\`;

            await sendLineReply(replyToken, summaryText);
          } catch (err) {
            console.error("Error handling /โพย command:", err);
            await sendLineReply(replyToken, \`❌ เกิดข้อผิดพลาดในการดึงข้อมูลใบโพย:\\n\${err.message}\\n\${err.stack || ''}\`);
          }
          continue;
        }

`;

    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    const newContent = before + newHandler + after;

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log("Successfully patched index.ts!");

} catch (err) {
    console.error("Error patching index.ts:", err);
}
