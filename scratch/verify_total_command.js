// Test script to verify /ยอดรวม formatting before and after result announcement

const BET_TYPE_ORDER = {
  'run_top': 10,
  'run_bottom': 20,
  'pak_top': 30,
  'front_top_1': 31,
  'middle_top_1': 32,
  'back_top_1': 33,
  'pak_bottom': 40,
  'front_bottom_1': 41,
  'back_bottom_1': 42,
  '2_top': 50,
  '2_back': 51,
  '2_front': 60,
  '2_front_single': 61,
  '2_center': 70,
  '2_spread': 71,
  '2_tang': 72,
  '2_run': 80,
  '2_teng': 81,
  '2_have': 82,
  '2_bottom': 90,
  '3_top': 100,
  '3_straight': 101,
  '6_top': 102,
  '3_tod': 110,
  '3_tod_single': 111,
  '3_bottom': 120,
  '3_front': 121,
  '3_back': 122,
  '4_float': 130,
  '5_float': 140,
  '4_set': 150,
  '4_top': 151,
  '4_tod': 152
};

const LABELS = {
  'run_top': 'ลอยบน',
  'run_bottom': 'ลอยล่าง',
  'pak_top': 'ปักบน',
  'pak_bottom': 'ปักล่าง',
  '2_top': '2 ตัวบน',
  '2_front': '2 ตัวหน้า',
  '2_center': '2 ตัวถ่าง',
  '2_run': '2 ตัวลอย',
  '2_bottom': '2 ตัวล่าง',
  '3_top': '3 ตัวบน',
  '3_tod': '3 ตัวโต๊ด',
  '3_bottom': '3 ตัวล่าง',
  '4_float': '4 ตัวลอย',
  '5_float': '5 ตัวลอย'
};

const mockBetSummaries = {
  '3_top': { amount: 22400, commission: 6720, rates: new Set([30]), winBetAmount: 10, winPrizeAmount: 5500 },
  '3_tod': { amount: 5000, commission: 1250, rates: new Set([25]), winBetAmount: 0, winPrizeAmount: 0 },
  'run_top': { amount: 1000, commission: 100, rates: new Set([10]), winBetAmount: 0, winPrizeAmount: 0 },
  '2_bottom': { amount: 8000, commission: 1400, rates: new Set(), winBetAmount: 0, winPrizeAmount: 0 },
  '2_top': { amount: 5000, commission: 1000, rates: new Set([20]), winBetAmount: 0, winPrizeAmount: 0 }
};

const sortedEntries = Object.entries(mockBetSummaries).sort(([typeA], [typeB]) => {
  const orderA = BET_TYPE_ORDER[typeA] ?? 999;
  const orderB = BET_TYPE_ORDER[typeB] ?? 999;
  return orderA - orderB;
});

console.log('Sorted keys:', sortedEntries.map(([k]) => `${k} (${LABELS[k]})`));

// Check output for isAnnounced = false
console.log('\n--- BEFORE ANNOUNCED (isSingleMember = true) ---');
sortedEntries.forEach(([type, s]) => {
  const r = Array.from(s.rates)[0];
  const commText = r !== undefined ? `คอม ${r}% : ฿${s.commission.toLocaleString('th-TH')}` : `ค่าคอม: ฿${s.commission.toLocaleString('th-TH')}`;
  console.log(`${LABELS[type] || type} | ฿${s.amount.toLocaleString('th-TH')}`);
  console.log(`${commText}`);
});

console.log('\n--- AFTER ANNOUNCED (isSingleMember = true) ---');
sortedEntries.forEach(([type, s]) => {
  const r = Array.from(s.rates)[0];
  const commText = r !== undefined ? `คอม ${r}% : ฿${s.commission.toLocaleString('th-TH')}` : `ค่าคอม: ฿${s.commission.toLocaleString('th-TH')}`;
  const winText = `ถูก ฿${s.winBetAmount.toLocaleString('th-TH')}/฿${s.winPrizeAmount.toLocaleString('th-TH')}`;
  console.log(`${LABELS[type] || type} | แทง ฿${s.amount.toLocaleString('th-TH')}`);
  console.log(`${commText} | ${winText}`);
});

console.log('\n--- ADMIN VIEW (isSingleMember = false, AFTER ANNOUNCED) ---');
sortedEntries.forEach(([type, s]) => {
  const commText = `ค่าคอม: ฿${s.commission.toLocaleString('th-TH')}`;
  const winText = `ถูก ฿${s.winBetAmount.toLocaleString('th-TH')}/฿${s.winPrizeAmount.toLocaleString('th-TH')}`;
  console.log(`${LABELS[type] || type} | แทง ฿${s.amount.toLocaleString('th-TH')}`);
  console.log(`${commText} | ${winText}`);
});
