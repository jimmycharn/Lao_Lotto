import { describe, it, expect } from 'vitest';

// Helper function to test accumulator logic for targeted submissions
export function accumulateSubmissionsTotals(
  rows: { id?: string; bet_type: string; numbers: string; amount: number }[],
  isSetBasedLottery: boolean,
  setPrice: number = 120
) {
  const currentTotals = new Map<string, number>();
  const currentExactSetsMap = new Map<string, number>();
  const current3SetTotalMap = new Map<string, number>();
  const seenIds = new Set<string>();

  for (const s of rows) {
    if (s.id && seenIds.has(s.id)) continue;
    if (s.id) seenIds.add(s.id);

    const key = `${s.bet_type}|${s.numbers}`;
    const amt = Number(s.amount || 0);
    currentTotals.set(key, (currentTotals.get(key) || 0) + amt);

    if (isSetBasedLottery && (s.bet_type === '4_set' || s.bet_type === '4_top') && s.numbers?.length === 4) {
      const sets = Math.ceil(amt / setPrice);
      currentExactSetsMap.set(s.numbers, (currentExactSetsMap.get(s.numbers) || 0) + sets);
      const last3 = s.numbers.slice(-3);
      current3SetTotalMap.set(last3, (current3SetTotalMap.get(last3) || 0) + sets);
    }
  }

  return { currentTotals, currentExactSetsMap, current3SetTotalMap };
}

// Helper to detect if an incoming LINE webhook event qualifies for fast-path
export function isFastPathEvent(event: any): boolean {
  if (!event || event.type !== 'message') return false;
  if (event.message?.type === 'image') return true;
  if (event.message?.type === 'text') {
    const text = (event.message.text || '').trim();
    return text.startsWith('/') || text.startsWith('#') || /\d/.test(text);
  }
  return false;
}

// Fast evaluation of dealer credit using preloaded records (0ms network round-trip)
export function evaluateDealerCreditFast(
  newBetAmount: number,
  subscription: any,
  creditData: any
): { allowed: boolean; message: string } {
  if (!subscription) {
    return { allowed: true, message: 'No active subscription' };
  }

  const pkg = subscription.subscription_packages;
  const billingModel = subscription.billing_model || pkg?.billing_model;

  if (billingModel !== 'percentage' && billingModel !== 'profit_percentage') {
    return { allowed: true, message: 'Not percentage billing' };
  }

  const percentageRate = pkg?.percentage_rate || 0;
  const currentBalance = creditData?.balance || 0;
  const currentPendingDeduction = creditData?.pending_deduction || 0;

  const newPendingFee = newBetAmount * (percentageRate / 100);
  const availableCredit = currentBalance - currentPendingDeduction;
  const hasEnoughCredit = availableCredit >= newPendingFee;

  return {
    allowed: hasEnoughCredit,
    message: hasEnoughCredit
      ? 'เครดิตเพียงพอ'
      : `เครดิตไม่เพียงพอ ต้องการ ฿${newPendingFee.toFixed(2)} แต่มีเครดิตคงเหลือ ฿${availableCredit.toFixed(2)}`
  };
}

describe('Targeted Submissions and Fast-Path Optimization Helpers', () => {
  describe('accumulateSubmissionsTotals', () => {
    it('correctly tallies 2-digit and 3-digit submissions for normal lotteries', () => {
      const rows = [
        { id: '1', bet_type: '2_top', numbers: '24', amount: 50 },
        { id: '2', bet_type: '2_top', numbers: '24', amount: 30 },
        { id: '3', bet_type: '2_bottom', numbers: '24', amount: 20 },
        { id: '4', bet_type: '3_top', numbers: '872', amount: 100 },
        { id: '1', bet_type: '2_top', numbers: '24', amount: 50 } // duplicate id should be skipped
      ];

      const { currentTotals } = accumulateSubmissionsTotals(rows, false);
      expect(currentTotals.get('2_top|24')).toBe(80);
      expect(currentTotals.get('2_bottom|24')).toBe(20);
      expect(currentTotals.get('3_top|872')).toBe(100);
      expect(currentTotals.get('2_top|99')).toBeUndefined();
    });

    it('correctly populates exactSets and 3SetTotal for set-based lotteries (4_set, 4_top)', () => {
      const rows = [
        { id: '1', bet_type: '4_set', numbers: '1234', amount: 120 }, // 1 set
        { id: '2', bet_type: '4_top', numbers: '5234', amount: 240 }  // 2 sets, last3: 234
      ];

      const { currentExactSetsMap, current3SetTotalMap } = accumulateSubmissionsTotals(rows, true, 120);
      expect(currentExactSetsMap.get('1234')).toBe(1);
      expect(currentExactSetsMap.get('5234')).toBe(2);
      expect(current3SetTotalMap.get('234')).toBe(3); // 1 + 2 = 3 sets sharing '234'
    });
  });

  describe('isFastPathEvent', () => {
    it('returns true for bank slip image messages', () => {
      expect(isFastPathEvent({ type: 'message', message: { type: 'image' } })).toBe(true);
    });

    it('returns true for bet text messages containing digits and separators', () => {
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '872=15*6' } })).toBe(true);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: 'กีต้า\n872=15*6' } })).toBe(true);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '12-50' } })).toBe(true);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '99 บน 50' } })).toBe(true);
    });

    it('returns true for bot commands', () => {
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '/สรุป' } })).toBe(true);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '/ยกเลิก ABCDEF' } })).toBe(true);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: '#เช็ค' } })).toBe(true);
    });

    it('returns false for plain non-bet chatter', () => {
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: 'สวัสดีตอนเช้าครับ' } })).toBe(false);
      expect(isFastPathEvent({ type: 'message', message: { type: 'text', text: 'กินข้าวหรือยัง' } })).toBe(false);
      expect(isFastPathEvent({ type: 'follow' })).toBe(false);
    });
  });

  describe('evaluateDealerCreditFast', () => {
    it('allows when no percentage subscription is active', () => {
      const res = evaluateDealerCreditFast(100, null, null);
      expect(res.allowed).toBe(true);
    });

    it('checks available credit correctly when percentage billing is active', () => {
      const sub = {
        billing_model: 'percentage',
        subscription_packages: { percentage_rate: 5 } // 5% fee
      };
      // 5% of 1,000 = 50 fee.
      // Balance 100, pending 20 -> available 80 >= 50 -> OK
      const credit1 = { balance: 100, pending_deduction: 20 };
      expect(evaluateDealerCreditFast(1000, sub, credit1).allowed).toBe(true);

      // Balance 50, pending 10 -> available 40 < 50 -> NOT ALLOWED
      const credit2 = { balance: 50, pending_deduction: 10 };
      const failedRes = evaluateDealerCreditFast(1000, sub, credit2);
      expect(failedRes.allowed).toBe(false);
      expect(failedRes.message).toContain('เครดิตไม่เพียงพอ');
    });
  });
});

