import { describe, it, expect } from 'vitest';
import {
  calculateLayoffSummaries,
  calculateTransferCommission,
  calculateTransferWinning,
  generateLayoffSummaryFlex,
  generateTargetedLayoffSummaryFlex,
  formatLayoffWinningBetsMessage,
  getBetTypeShortLabel
} from './layoffSummaryHelper';

describe('layoffSummaryHelper', () => {
  describe('calculateTransferCommission', () => {
    it('calculates custom commission rate configured for upstream connection', () => {
      const transfer = { amount: 1000, bet_type: '2_top' };
      const connection = {
        lottery_settings: {
          thai: {
            '2_top': { commission: 20 }
          }
        }
      };
      const comm = calculateTransferCommission(transfer, connection, 'thai');
      expect(comm).toBe(200); // 20% of 1000
    });

    it('falls back to standard commission rates when connection has no custom settings', () => {
      expect(calculateTransferCommission({ amount: 1000, bet_type: '3_top' }, null, 'thai')).toBe(300); // 30%
      expect(calculateTransferCommission({ amount: 1000, bet_type: '2_top' }, null, 'thai')).toBe(280); // 28%
      expect(calculateTransferCommission({ amount: 1000, bet_type: 'run_top' }, null, 'thai')).toBe(120); // 12%
    });

    it('calculates commission for 4_set per set', () => {
      const transfer = { amount: 240, bet_type: '4_set' };
      const connection = {
        lottery_settings: {
          lao: {
            '4_set': { setPrice: 120, commission: 30 }
          }
        }
      };
      // 240 / 120 = 2 sets * 30 = 60
      const comm = calculateTransferCommission(transfer, connection, 'lao');
      expect(comm).toBe(60);
    });

    it('preserves pre-computed commission_earned if present', () => {
      const transfer = { amount: 1000, bet_type: '2_top', commission_earned: 250 };
      expect(calculateTransferCommission(transfer, null, 'thai')).toBe(250);
    });
  });

  describe('calculateTransferWinning', () => {
    const winningNumbersThai = {
      '6_top': '645654',
      '3_top': '654',
      '2_top': '54',
      '2_bottom': '06'
    };

    it('calculates 3_top winning with custom payout', () => {
      const transfer = { amount: 100, bet_type: '3_top', numbers: '654' };
      const connection = {
        lottery_settings: {
          thai: {
            '3_top': { payout: 900 }
          }
        }
      };
      const win = calculateTransferWinning(transfer, winningNumbersThai, 'thai', 120, null, connection);
      expect(win).toBe(100 * 900); // 90,000
    });

    it('calculates 3_tod winning with default payout', () => {
      const transfer = { amount: 50, bet_type: '3_tod', numbers: '456' }; // Permutation of 654
      const win = calculateTransferWinning(transfer, winningNumbersThai, 'thai');
      expect(win).toBe(50 * 100); // 5,000
    });

    it('calculates 2_top and 2_bottom winning', () => {
      const transferTop = { amount: 100, bet_type: '2_top', numbers: '54' };
      expect(calculateTransferWinning(transferTop, winningNumbersThai, 'thai')).toBe(100 * 65);

      const transferBottom = { amount: 50, bet_type: '2_bottom', numbers: '06' };
      expect(calculateTransferWinning(transferBottom, winningNumbersThai, 'thai')).toBe(50 * 65);
    });

    it('calculates run_top and run_bottom', () => {
      const runTop = { amount: 100, bet_type: 'run_top', numbers: '6' };
      expect(calculateTransferWinning(runTop, winningNumbersThai, 'thai')).toBe(100 * 3);

      const runBottom = { amount: 100, bet_type: 'run_bottom', numbers: '0' };
      expect(calculateTransferWinning(runBottom, winningNumbersThai, 'thai')).toBe(100 * 4);
    });

    it('calculates 4_set winning in Lao lottery', () => {
      const winningNumbersLao = { '4_set': '1234' };
      const transferStraight = { amount: 120, bet_type: '4_set', numbers: '1234' };
      expect(calculateTransferWinning(transferStraight, winningNumbersLao, 'lao')).toBe(100000);

      const transferBack2 = { amount: 120, bet_type: '4_set', numbers: '9934' };
      expect(calculateTransferWinning(transferBack2, winningNumbersLao, 'lao')).toBe(1000);
    });

    it('returns 0 for non-winning transfer', () => {
      const transfer = { amount: 100, bet_type: '2_top', numbers: '99' };
      expect(calculateTransferWinning(transfer, winningNumbersThai, 'thai')).toBe(0);
    });
  });

  describe('calculateLayoffSummaries', () => {
    it('calculates totals, aggregates per dealer, and sorts dealers descending by totalBet', () => {
      const mockTransfers = [
        { target_dealer_name: 'พี่จิ้ม', upstream_dealer_id: null, amount: 5000, bet_type: '2_top', numbers: '54' },
        { target_dealer_name: 'พี่โต', upstream_dealer_id: null, amount: 8000, bet_type: '3_top', numbers: '654' },
        { target_dealer_name: 'พี่จิ้ม', upstream_dealer_id: null, amount: 2000, bet_type: '2_bottom', numbers: '06' }
      ];
      const mockConnections = [
        {
          id: 'conn-1',
          upstream_name: 'พี่จิ้ม',
          upstream_code: '10001',
          lottery_settings: {
            thai: {
              '2_top': { commission: 20, payout: 90 },
              '2_bottom': { commission: 20, payout: 90 }
            }
          }
        },
        {
          id: 'conn-2',
          upstream_name: 'พี่โต',
          upstream_code: '10002',
          lottery_settings: {
            thai: {
              '3_top': { commission: 25, payout: 900 }
            }
          }
        }
      ];
      const winningNumbers = { '3_top': '654', '2_top': '54', '2_bottom': '06' };

      const { overallTotals, sortedDealers } = calculateLayoffSummaries(
        mockTransfers,
        mockConnections,
        winningNumbers,
        'thai'
      );

      // Sorting check: พี่โต (8,000) > พี่จิ้ม (7,000)
      expect(sortedDealers.length).toBe(2);
      expect(sortedDealers[0].dealerName).toBe('พี่โต');
      expect(sortedDealers[0].totalBet).toBe(8000);
      expect(sortedDealers[0].dealerCode).toBe('10002');
      expect(sortedDealers[0].totalCommission).toBe(2000);
      expect(sortedDealers[0].totalWin).toBe(7200000); // 8000 * 900
      expect(sortedDealers[0].winCount).toBe(1);
      expect(sortedDealers[0].net).toBe(7200000 + 2000 - 8000); // 7,194,000

      expect(sortedDealers[1].dealerName).toBe('พี่จิ้ม');
      expect(sortedDealers[1].totalBet).toBe(7000);
      expect(sortedDealers[1].dealerCode).toBe('10001');
      expect(sortedDealers[1].totalCommission).toBe(1400); // (5000*0.2) + (2000*0.2)
      expect(sortedDealers[1].totalWin).toBe(630000); // (5000*90) + (2000*90)
      expect(sortedDealers[1].winCount).toBe(2);
      expect(sortedDealers[1].ticketCount).toBe(2);
      expect(sortedDealers[1].net).toBe(630000 + 1400 - 7000); // 624,400

      // Overall totals check
      expect(overallTotals.totalBet).toBe(15000);
      expect(overallTotals.totalCommission).toBe(3400);
      expect(overallTotals.totalWin).toBe(7830000);
      expect(overallTotals.ticketCount).toBe(3);
      expect(overallTotals.winCount).toBe(3);
      expect(overallTotals.net).toBe(7830000 + 3400 - 15000);
    });

    it('resolves dealerCode from upstream_profile.member_code when linked', () => {
      const mockTransfers = [
        { upstream_dealer_id: 'user-linked-9', amount: 3000, bet_type: '2_top', numbers: '11' }
      ];
      const mockConnections = [
        {
          id: 'conn-linked',
          upstream_dealer_id: 'user-linked-9',
          upstream_name: 'ดีลเลอร์ลิงก์',
          is_linked: true,
          upstream_profile: {
            id: 'user-linked-9',
            member_code: '10088'
          }
        }
      ];

      const { sortedDealers } = calculateLayoffSummaries(mockTransfers, mockConnections, {}, 'thai');
      expect(sortedDealers[0].dealerName).toBe('ดีลเลอร์ลิงก์');
      expect(sortedDealers[0].dealerCode).toBe('10088');
    });

    it('handles empty transfers gracefully', () => {
      const { overallTotals, sortedDealers } = calculateLayoffSummaries([], [], {}, 'thai');
      expect(overallTotals.totalBet).toBe(0);
      expect(overallTotals.ticketCount).toBe(0);
      expect(sortedDealers.length).toBe(0);
    });
  });

  describe('generateLayoffSummaryFlex', () => {
    it('builds a valid LINE Flex Message bubble JSON', () => {
      const mockDealers = [
        {
          dealerKey: '10001',
          dealerName: 'พี่จิ้ม อ้อมค่าย',
          dealerCode: '10001',
          totalBet: 10000,
          totalCommission: 2000,
          totalWin: 15000,
          winCount: 1,
          ticketCount: 3,
          net: 7000,
          winningTransfers: []
        },
        {
          dealerKey: '10002',
          dealerName: 'พี่โต บางแค',
          dealerCode: '10002',
          totalBet: 5000,
          totalCommission: 1000,
          totalWin: 0,
          winCount: 0,
          ticketCount: 2,
          net: -4000,
          winningTransfers: []
        }
      ];
      const mockTotals = {
        totalBet: 15000,
        totalCommission: 3000,
        totalWin: 15000,
        net: 3000,
        ticketCount: 5,
        winCount: 1,
        winningTransfers: []
      };
      const roundInfo = {
        lotteryName: 'หวยไทย',
        roundDate: '16 พ.ย. 2569',
        winningResultStr: '645654 / 06'
      };

      const bubble = generateLayoffSummaryFlex(mockTotals, mockDealers, roundInfo);

      expect(bubble.type).toBe('bubble');
      expect(bubble.header).toBeDefined();
      expect(bubble.body).toBeDefined();

      const headerText = JSON.stringify(bubble.header);
      expect(headerText).toContain('สรุปตีออก (หวยไทย)');
      expect(headerText).toContain('16 พ.ย. 2569');
      expect(headerText).toContain('645654 / 06');

      const bodyText = JSON.stringify(bubble.body);
      expect(bodyText).toContain('1. ภาพรวมการตีออก');
      expect(bodyText).toContain('2. รายละเอียดเจ้ามือตีออก');
      expect(bodyText).toContain('พี่จิ้ม อ้อมค่าย (10001)');
      expect(bodyText).toContain('ต้องเก็บ ฿7,000');
      expect(bodyText).toContain('พี่โต บางแค (10002)');
      expect(bodyText).toContain('ต้องจ่าย ฿4,000');
    });

    it('renders empty list message when no dealers present', () => {
      const mockTotals = {
        totalBet: 0,
        totalCommission: 0,
        totalWin: 0,
        net: 0,
        ticketCount: 0,
        winCount: 0,
        winningTransfers: []
      };
      const bubble = generateLayoffSummaryFlex(mockTotals, [], { lotteryName: 'หวยลาว' });
      const bodyText = JSON.stringify(bubble.body);
      expect(bodyText).toContain('ไม่มีรายการตีออกในงวดนี้ค่ะ');
    });
  });

  describe('generateTargetedLayoffSummaryFlex', () => {
    it('builds a targeted single-dealer LINE Flex bubble JSON', () => {
      const targetDealer = {
        dealerKey: '10001',
        dealerName: 'พี่จิ้ม อ้อมค่าย',
        dealerCode: '10001',
        totalBet: 10000,
        totalCommission: 2000,
        totalWin: 15000,
        winCount: 1,
        ticketCount: 3,
        net: 7000,
        winningTransfers: [
          { numbers: '54', bet_type: '2_top', amount: 100, winAmount: 9000 }
        ]
      };
      const roundInfo = {
        lotteryName: 'หวยไทย',
        roundDate: '16 พ.ย. 2569',
        winningResultStr: '645654 / 06'
      };

      const bubble = generateTargetedLayoffSummaryFlex(targetDealer, roundInfo);

      expect(bubble.type).toBe('bubble');
      const bodyText = JSON.stringify(bubble.body);
      expect(bodyText).toContain('พี่จิ้ม อ้อมค่าย');
      expect(bodyText).toContain('ID: 10001');
      expect(bodyText).toContain('ต้องเก็บ ฿7,000');
      expect(bodyText).toContain('54=100');
    });
  });

  describe('formatLayoffWinningBetsMessage', () => {
    it('formats winning text correctly for all dealers', () => {
      const winningTransfers = [
        { dealerName: 'พี่จิ้ม', dealerCode: '10001', bet_type: '2_top', numbers: '54', amount: 100, winAmount: 9000 },
        { dealerName: 'พี่จิ้ม', dealerCode: '10001', bet_type: '2_bottom', numbers: '06', amount: 50, winAmount: 4500 },
        { dealerName: 'พี่โต', dealerCode: '10002', bet_type: '3_top', numbers: '654', amount: 30, winAmount: 27000 }
      ];
      const roundInfo = { lotteryName: 'หวยไทย', roundDate: '16-11-2569', winningResultStr: '645654 / 06' };

      const text = formatLayoffWinningBetsMessage(winningTransfers, null, roundInfo);
      expect(text).toContain('🏆 รายการตีออกที่ถูกรางวัล');
      expect(text).toContain('พี่จิ้ม (10001)');
      expect(text).toContain('54=100 (บน) [ถูกรางวัล: ฿9,000]');
      expect(text).toContain('06=50 (ล่าง) [ถูกรางวัล: ฿4,500]');
      expect(text).toContain('พี่โต (10002)');
      expect(text).toContain('654=30 (ตรง) [ถูกรางวัล: ฿27,000]');
      expect(text).toContain('รวมถูกรางวัลทั้งหมด: 3 รายการ');
      expect(text).toContain('40,500'); // 9000 + 4500 + 27000
    });

    it('filters by target dealer when specified', () => {
      const winningTransfers = [
        { dealerName: 'พี่จิ้ม', dealerCode: '10001', bet_type: '2_top', numbers: '54', amount: 100, winAmount: 9000 },
        { dealerName: 'พี่จิ้ม', dealerCode: '10001', bet_type: '2_bottom', numbers: '06', amount: 50, winAmount: 4500 },
        { dealerName: 'พี่โต', dealerCode: '10002', bet_type: '3_top', numbers: '654', amount: 30, winAmount: 27000 }
      ];
      const roundInfo = { lotteryName: 'หวยไทย', roundDate: '16-11-2569', winningResultStr: '645654 / 06' };
      const targetDealer = { dealerName: 'พี่จิ้ม', dealerCode: '10001' };

      const text = formatLayoffWinningBetsMessage(winningTransfers, targetDealer, roundInfo);
      expect(text).toContain('รายการตีออกที่ถูกรางวัล');
      expect(text).toContain('พี่จิ้ม (10001)');
      expect(text).not.toContain('พี่โต');
      expect(text).toContain('รวมถูกรางวัลทั้งหมด: 2 รายการ');
      expect(text).toContain('13,500');
    });

    it('returns friendly message when no winning transfers found', () => {
      const text = formatLayoffWinningBetsMessage([], null, { lotteryName: 'หวยไทย' });
      expect(text).toBe('🎉 ไม่มีรายการตีออกที่ถูกรางวัลในงวดนี้ค่ะ');
    });
  });

  describe('getBetTypeShortLabel', () => {
    it('returns expected Thai short labels for common bet types', () => {
      expect(getBetTypeShortLabel('3_top')).toBe('ตรง');
      expect(getBetTypeShortLabel('3_tod')).toBe('โต๊ด');
      expect(getBetTypeShortLabel('2_top')).toBe('บน');
      expect(getBetTypeShortLabel('2_bottom')).toBe('ล่าง');
      expect(getBetTypeShortLabel('run_top')).toBe('วิ่งบน');
      expect(getBetTypeShortLabel('run_bottom')).toBe('วิ่งล่าง');
      expect(getBetTypeShortLabel('4_set')).toBe('4 ตัวชุด');
    });
  });
});
