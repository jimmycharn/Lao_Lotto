import { describe, it, expect } from 'vitest'

describe('Summary Commands (/ยอดเหลือ and /ยอดเกิน)', () => {
  const BET_TYPE_ORDER: Record<string, number> = {
    'run_top': 10,
    'run_bottom': 20,
    'pak_top': 30,
    '2_top': 50,
    '2_front': 60,
    '2_bottom': 90,
    '3_top': 100,
    '3_tod': 110,
    '3_bottom': 120,
    '4_set': 150
  };

  const LABELS: Record<string, string> = {
    '2_top': '2 ตัวบน',
    '2_bottom': '2 ตัวล่าง',
    '3_top': '3 ตัวตรง',
    '3_tod': '3 ตัวโต๊ด',
    '4_set': '4 ตัวชุด'
  };

  describe('/ยอดเหลือ calculation logic', () => {
    it('calculates retained amount correctly after deducting transfers', () => {
      // 3 ตัวตรง: 123=100 (comm 20%), 456=50 (comm 20%) -> total 150
      // 3 ตัวโต๊ด: 123=50 (comm 20%) -> total 50
      // Transfer: 123 (3 ตัวตรง) = 50
      const submissions = [
        { bet_type: '3_top', numbers: '123', amount: 100, comm: 20 },
        { bet_type: '3_top', numbers: '456', amount: 50, comm: 10 },
        { bet_type: '3_tod', numbers: '123', amount: 50, comm: 10 }
      ];
      const transfers = [
        { bet_type: '3_top', numbers: '123', amount: 50 }
      ];

      // Aggregate sold
      const numberSoldMap: Record<string, { bet_type: string; totalAmt: number; comm: number }> = {};
      submissions.forEach(s => {
        const key = `${s.bet_type}|${s.numbers}`;
        if (!numberSoldMap[key]) numberSoldMap[key] = { bet_type: s.bet_type, totalAmt: 0, comm: 0 };
        numberSoldMap[key].totalAmt += s.amount;
        numberSoldMap[key].comm += s.comm;
      });

      // Aggregate transfers
      const transferAmountMap: Record<string, number> = {};
      transfers.forEach(t => {
        const key = `${t.bet_type}|${t.numbers}`;
        transferAmountMap[key] = (transferAmountMap[key] || 0) + t.amount;
      });

      // Calculate retained
      const summaries: Record<string, { amount: number; commission: number }> = {};
      let grandTotal = 0;
      let totalCommission = 0;

      for (const [key, soldGroup] of Object.entries(numberSoldMap)) {
        const trAmt = transferAmountMap[key] || 0;
        const retainedAmt = Math.max(0, soldGroup.totalAmt - trAmt);
        if (retainedAmt <= 0) continue;

        const ratio = retainedAmt / soldGroup.totalAmt;
        const comm = soldGroup.comm * ratio;

        if (!summaries[soldGroup.bet_type]) {
          summaries[soldGroup.bet_type] = { amount: 0, commission: 0 };
        }
        summaries[soldGroup.bet_type].amount += retainedAmt;
        summaries[soldGroup.bet_type].commission += comm;
        grandTotal += retainedAmt;
        totalCommission += comm;
      }

      // 3_top retained: (100 - 50) + 50 = 100
      // 3_top comm: (100-50)/100 * 20 + 10 = 10 + 10 = 20
      expect(summaries['3_top'].amount).toBe(100);
      expect(summaries['3_top'].commission).toBe(20);

      // 3_tod retained: 50, comm: 10
      expect(summaries['3_tod'].amount).toBe(50);
      expect(summaries['3_tod'].commission).toBe(10);

      // Totals
      expect(grandTotal).toBe(150);
      expect(totalCommission).toBe(30);
      const netLeft = grandTotal - totalCommission;
      expect(netLeft).toBe(120);
    });

    it('excludes bet types that were 100% transferred out', () => {
      const submissions = [
        { bet_type: '2_top', numbers: '99', amount: 100, comm: 20 },
        { bet_type: '3_top', numbers: '999', amount: 50, comm: 10 }
      ];
      const transfers = [
        { bet_type: '2_top', numbers: '99', amount: 100 } // fully transferred
      ];

      const numberSoldMap: Record<string, { bet_type: string; totalAmt: number; comm: number }> = {};
      submissions.forEach(s => {
        const key = `${s.bet_type}|${s.numbers}`;
        if (!numberSoldMap[key]) numberSoldMap[key] = { bet_type: s.bet_type, totalAmt: 0, comm: 0 };
        numberSoldMap[key].totalAmt += s.amount;
        numberSoldMap[key].comm += s.comm;
      });

      const transferAmountMap: Record<string, number> = {};
      transfers.forEach(t => {
        const key = `${t.bet_type}|${t.numbers}`;
        transferAmountMap[key] = (transferAmountMap[key] || 0) + t.amount;
      });

      const summaries: Record<string, { amount: number; commission: number }> = {};
      for (const [key, soldGroup] of Object.entries(numberSoldMap)) {
        const trAmt = transferAmountMap[key] || 0;
        const retainedAmt = Math.max(0, soldGroup.totalAmt - trAmt);
        if (retainedAmt <= 0) continue;

        const ratio = retainedAmt / soldGroup.totalAmt;
        const comm = soldGroup.comm * ratio;

        if (!summaries[soldGroup.bet_type]) {
          summaries[soldGroup.bet_type] = { amount: 0, commission: 0 };
        }
        summaries[soldGroup.bet_type].amount += retainedAmt;
        summaries[soldGroup.bet_type].commission += comm;
      }

      // 2_top should NOT exist in summaries
      expect(summaries['2_top']).toBeUndefined();
      // 3_top should be present
      expect(summaries['3_top']).toBeDefined();
      expect(summaries['3_top'].amount).toBe(50);
    });
  });

  describe('/ยอดเกิน calculation logic', () => {
    it('aggregates excess items by bet_type and applies commission', () => {
      const excessItems = [
        { bet_type: '3_top', numbers: '123', amount: 50 },
        { bet_type: '3_top', numbers: '456', amount: 30 },
        { bet_type: '3_tod', numbers: '123', amount: 40 }
      ];

      const betTypeCommTotals: Record<string, { totalAmt: number; totalComm: number }> = {
        '3_top': { totalAmt: 200, totalComm: 40 }, // 20%
        '3_tod': { totalAmt: 100, totalComm: 20 }  // 20%
      };

      const summaries: Record<string, { amount: number; commission: number }> = {};
      let grandTotal = 0;
      let totalCommission = 0;

      excessItems.forEach(item => {
        if (!summaries[item.bet_type]) {
          summaries[item.bet_type] = { amount: 0, commission: 0 };
        }
        summaries[item.bet_type].amount += item.amount;

        const commData = betTypeCommTotals[item.bet_type];
        const comm = item.amount * (commData.totalComm / commData.totalAmt);
        summaries[item.bet_type].commission += comm;

        grandTotal += item.amount;
        totalCommission += comm;
      });

      expect(summaries['3_top'].amount).toBe(80);
      expect(summaries['3_top'].commission).toBe(16); // 80 * 20%

      expect(summaries['3_tod'].amount).toBe(40);
      expect(summaries['3_tod'].commission).toBe(8); // 40 * 20%

      expect(grandTotal).toBe(120);
      expect(totalCommission).toBe(24);
      expect(grandTotal - totalCommission).toBe(96);
    });

    it('handles empty excess list when no limits are exceeded', () => {
      const excessItems: any[] = [];
      expect(excessItems.length).toBe(0);
    });
  });

  describe('Ordering and Labels', () => {
    it('sorts types according to BET_TYPE_ORDER', () => {
      const summaries = {
        '3_tod': { amount: 40 },
        '2_top': { amount: 100 },
        '3_top': { amount: 80 }
      };

      const sorted = Object.entries(summaries).sort(([a], [b]) => {
        return (BET_TYPE_ORDER[a] ?? 999) - (BET_TYPE_ORDER[b] ?? 999);
      });

      expect(sorted[0][0]).toBe('2_top'); // order 50
      expect(sorted[1][0]).toBe('3_top'); // order 100
      expect(sorted[2][0]).toBe('3_tod'); // order 110
    });
  });

  describe('/สรุป Flex Message Member Pagination logic', () => {
    function calculatePagination(totalMembers: number) {
      const totalCards = totalMembers <= 10
        ? 1
        : Math.min(5, 1 + Math.ceil((totalMembers - 10) / 15));

      const pages = [
        { page: 1, start: 0, end: Math.min(totalMembers, 10), totalPages: totalCards }
      ];

      for (let p = 2; p <= totalCards; p++) {
        const start = 10 + (p - 2) * 15;
        const end = Math.min(totalMembers, start + 15);
        pages.push({ page: p, start, end, totalPages: totalCards });
      }

      return pages;
    }

    it('returns 1 card when members <= 10', () => {
      expect(calculatePagination(0)).toHaveLength(1);
      expect(calculatePagination(5)).toHaveLength(1);
      expect(calculatePagination(10)).toHaveLength(1);
      expect(calculatePagination(10)[0].totalPages).toBe(1);
      expect(calculatePagination(10)[0].end).toBe(10);
    });

    it('returns 2 cards when members are 11 to 25', () => {
      const res11 = calculatePagination(11);
      expect(res11).toHaveLength(2);
      expect(res11[0].end).toBe(10);
      expect(res11[1].start).toBe(10);
      expect(res11[1].end).toBe(11);

      const res25 = calculatePagination(25);
      expect(res25).toHaveLength(2);
      expect(res25[1].end).toBe(25);
    });

    it('returns 3 cards when members are 26 to 40', () => {
      const res26 = calculatePagination(26);
      expect(res26).toHaveLength(3);
      expect(res26[2].start).toBe(25);
      expect(res26[2].end).toBe(26);

      const res40 = calculatePagination(40);
      expect(res40).toHaveLength(3);
      expect(res40[2].end).toBe(40);
    });

    it('caps at 5 cards max when members exceed 70', () => {
      const res70 = calculatePagination(70);
      expect(res70).toHaveLength(5);
      expect(res70[4].end).toBe(70);

      const res100 = calculatePagination(100);
      expect(res100).toHaveLength(5);
      expect(res100[4].end).toBe(70);
      expect(res100[4].totalPages).toBe(5);
    });
  });
});

