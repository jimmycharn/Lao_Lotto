function findRoundByDate(rounds, dateStr) {
  if (!rounds || rounds.length === 0) return null;
  return rounds.find(r => {
    if (r.round_date === dateStr) return true;
    if (r.close_time) {
      try {
        const dateObj = new Date(r.close_time);
        const day = dateObj.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'Asia/Bangkok' });
        const month = dateObj.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Bangkok' });
        const year = dateObj.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' });
        const formattedCloseDate = `${year}-${month}-${day}`;
        console.log(`Checking close_time ${r.close_time} -> formattedCloseDate: ${formattedCloseDate}`);
        if (formattedCloseDate === dateStr) return true;
      } catch (e) {
        console.error('Error parsing close_time in findRoundByDate:', e);
      }
    }
    return false;
  }) || null;
}

const rounds = [
  {
    id: "927494f4-7731-4a85-b1d6-84b34204bde1",
    lottery_type: "stock",
    round_date: "2026-06-25",
    close_time: "2026-06-25T20:00:00+07:00"
  },
  {
    id: "0438ba70-2056-4c12-9866-cf1e91539ff1",
    lottery_type: "thai",
    round_date: "2026-06-29",
    close_time: "2026-07-01T14:05:00+07:00"
  }
];

// Test case 1: target user query /แจ้งผล 1-7-69 -> evaluates to '2026-07-01'
const queryDate1 = "2026-07-01";
const match1 = findRoundByDate(rounds, queryDate1);
console.log(`Query "${queryDate1}" -> Found ID: ${match1 ? match1.id : 'null'}`);

// Test case 2: query start date /แจ้งผล 29-6-69 -> evaluates to '2026-06-29'
const queryDate2 = "2026-06-29";
const match2 = findRoundByDate(rounds, queryDate2);
console.log(`Query "${queryDate2}" -> Found ID: ${match2 ? match2.id : 'null'}`);

// Test case 3: non-existent date
const queryDate3 = "2026-07-02";
const match3 = findRoundByDate(rounds, queryDate3);
console.log(`Query "${queryDate3}" -> Found ID: ${match3 ? match3.id : 'null'}`);
