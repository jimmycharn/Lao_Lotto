const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nmumnletxkeflmsythsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdW1ubGV0eGtlZmxtc3l0aHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwOTEyNjAsImV4cCI6MjA4MjY2NzI2MH0.-XTumRUlwyOB51TBQtvh96XXF0rKMINsIMLq_pSAOEY';

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function testGrouping(billCode) {
  console.log(`\n--- Testing Grouping for bill_id: ${billCode} ---`);
  const { data: subs, error: fetchErr } = await supabase
    .from('submissions')
    .select('id, amount, bet_type, numbers, user_id, round_id, entry_id, display_numbers, display_amount, display_bet_type')
    .eq('bill_id', billCode)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return;
  }

  if (!subs || subs.length === 0) {
    console.log(`No submissions found for bill_id: ${billCode}`);
    return;
  }

  console.log(`Fetched ${subs.length} submissions.`);

  try {
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
          disp = `${numStr}=${first.amount}*${first.amount} ${label}`;
        } else if (len === 3 && count > 1 && betTypeStr === '3_top') {
          disp = `${numStr}=${first.amount}*${count} คูณชุด`;
        } else {
          const label = LABELS[betTypeStr] || betTypeStr;
          disp = `${numStr}=${first.amount} ${label}`;
        }
      }

      const countSuffix = count > 1 ? ` (${count})` : '';
      formattedLines.push(`${disp}${countSuffix}`);
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
          formattedLines.push(`${numStr}=${current.amount}*${count} คูณชุด (${count})`);
        } else {
          formattedLines.push(`${numStr}=${current.amount} บน`);
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
          formattedLines.push(`${numStr}=${current.amount}*${current.amount} ${label} (${group.length})`);
        } else {
          const label = betTypeStr === '2_top' ? 'บน' : 'ล่าง';
          formattedLines.push(`${numStr}=${current.amount} ${label}`);
        }
      }
      // C. Other items (singles, double 2-digits like 77, 4-digits, runners, etc.)
      else {
        visited.add(i);
        totalAmount += Number(current.amount || 0);
        const label = LABELS[betTypeStr] || betTypeStr;
        formattedLines.push(`${numStr}=${current.amount} ${label}`);
      }
    }

    console.log("FORMATTED OUTPUT:");
    formattedLines.forEach(line => console.log(line));
    console.log(`Total Amount: ${totalAmount}`);

  } catch (err) {
    console.error("ERROR DURING GROUPING:", err);
  }
}

async function run() {
  await testGrouping('765664');
  await testGrouping('824077');
}

run();
