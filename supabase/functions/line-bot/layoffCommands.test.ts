import { describe, it, expect } from 'vitest';
import { convertAndMergeTodItems } from './layoffTodConverter';
import { parseLayoffCommand, checkLayoffAuthorization } from './layoffSummaryHelper';

describe('layoff commands logic', () => {
  describe('parseLayoffCommand', () => {
    it('matches /สรุปตีออก without parameter', () => {
      const res = parseLayoffCommand('/สรุปตีออก');
      expect(res).toEqual({ type: 'summary', targetId: '' });
    });

    it('matches /สรุปตีออก with space separated id', () => {
      const res = parseLayoffCommand('/สรุปตีออก 10001');
      expect(res).toEqual({ type: 'summary', targetId: '10001' });
    });

    it('matches /สรุปตีออก with bracketed id', () => {
      const res = parseLayoffCommand('/สรุปตีออก [10001]');
      expect(res).toEqual({ type: 'summary', targetId: '10001' });
    });

    it('matches /สรุปตีออก with slash separated id', () => {
      const res1 = parseLayoffCommand('/สรุปตีออก/10001');
      expect(res1).toEqual({ type: 'summary', targetId: '10001' });

      const res2 = parseLayoffCommand('/สรุปตีออก/[10001]');
      expect(res2).toEqual({ type: 'summary', targetId: '10001' });
    });

    it('matches /สรุปตีออก with dealer name', () => {
      const res = parseLayoffCommand('/สรุปตีออก พี่จิ้ม');
      expect(res).toEqual({ type: 'summary', targetId: 'พี่จิ้ม' });
    });

    it('matches /โพยตีออกถูก without parameter', () => {
      const res = parseLayoffCommand('/โพยตีออกถูก');
      expect(res).toEqual({ type: 'winning', targetId: '' });
    });

    it('matches /โพยตีออก ถูก without parameter', () => {
      const res = parseLayoffCommand('/โพยตีออก ถูก');
      expect(res).toEqual({ type: 'winning', targetId: '' });
    });

    it('matches /โพยตีออก without parameter', () => {
      const res = parseLayoffCommand('/โพยตีออก');
      expect(res).toEqual({ type: 'winning', targetId: '' });
    });

    it('matches /โพยตีออกถูก with id variations', () => {
      expect(parseLayoffCommand('/โพยตีออกถูก 10001')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออกถูก [10001]')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออกถูก/10001')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออกถูก/[10001]')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออก ถูก 10001')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออก ถูก [10001]')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออก ถูก/10001')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออก/10001')).toEqual({ type: 'winning', targetId: '10001' });
      expect(parseLayoffCommand('/โพยตีออก [10001]')).toEqual({ type: 'winning', targetId: '10001' });
    });

    it('returns null for regular non-layoff commands', () => {
      expect(parseLayoffCommand('/สรุป')).toBeNull();
      expect(parseLayoffCommand('/สรุป 10001')).toBeNull();
      expect(parseLayoffCommand('/โพย')).toBeNull();
      expect(parseLayoffCommand('/โพยถูก')).toBeNull();
      expect(parseLayoffCommand('/โพยถูก 10001')).toBeNull();
      expect(parseLayoffCommand('/ตีออก 500')).toBeNull();
    });
  });

  describe('checkLayoffAuthorization', () => {
    const targetDealerId = 'dealer-uuid-123';

    it('authorizes dealer when id matches targetDealerId', () => {
      const profile = { id: 'dealer-uuid-123', role: 'user' };
      expect(checkLayoffAuthorization(profile, targetDealerId, false)).toBe(true);
    });

    it('authorizes dealer when role is dealer', () => {
      const profile = { id: 'other-id', role: 'dealer' };
      expect(checkLayoffAuthorization(profile, targetDealerId, false)).toBe(true);
    });

    it('authorizes superadmin and admin', () => {
      expect(checkLayoffAuthorization({ id: 'sa-id', role: 'superadmin' }, targetDealerId, false)).toBe(true);
      expect(checkLayoffAuthorization({ id: 'ad-id', role: 'admin' }, targetDealerId, false)).toBe(true);
    });

    it('authorizes manager in line_managers', () => {
      const profile = { id: 'member-id', role: 'user' };
      expect(checkLayoffAuthorization(profile, targetDealerId, true)).toBe(true);
    });

    it('denies regular member who is not manager', () => {
      const profile = { id: 'member-id', role: 'user' };
      expect(checkLayoffAuthorization(profile, targetDealerId, false)).toBe(false);
    });

    it('denies unlinked or null sender', () => {
      expect(checkLayoffAuthorization(null, targetDealerId, false)).toBe(false);
    });
  });

  it('detects /ตีออกแปลง and /ตีออกแปลงเลข prefixes correctly', () => {
    const texts = [
      '/ตีออกแปลง 123 100 บตก ตกลง',
      '/ตีออกแปลงเลข 123 100 บตก ตกลง',
      '/ตีออกเฉพาะ 123 100 บตก ตกลง',
      '/ตีออกเฉพาะเลข 123 100 บตก ตกลง'
    ];

    texts.forEach(text => {
      const isLayoffSpecific = text.startsWith('/ตีออกเฉพาะ') || text.startsWith('/ตีออกเฉพาะเลข');
      const isLayoffConverted = text.startsWith('/ตีออกแปลง') || text.startsWith('/ตีออกแปลงเลข');
      expect(isLayoffSpecific || isLayoffConverted).toBe(true);
    });
  });

  it('correctly transforms excess items for /ตีออกแปลง with real-life scenario', () => {
    // Simulated excess items from user screenshot:
    // บน: 259=133, 295=133, 529=100, 592=100, 925=111, 952=100
    // โต๊ด: 259=70
    const rawExcess = [
      { bet_type: '3_top', numbers: '259', amount: 133 },
      { bet_type: '3_top', numbers: '295', amount: 133 },
      { bet_type: '3_top', numbers: '529', amount: 100 },
      { bet_type: '3_top', numbers: '592', amount: 100 },
      { bet_type: '3_top', numbers: '925', amount: 111 },
      { bet_type: '3_top', numbers: '952', amount: 100 },
      { bet_type: '3_tod', numbers: '259', amount: 70 }
    ];

    const converted = convertAndMergeTodItems(rawExcess, 'thai');

    // All 6 items should have 12 added to their top amount
    expect(converted.find(i => i.numbers === '259')?.amount).toBe(133 + 12);
    expect(converted.find(i => i.numbers === '295')?.amount).toBe(133 + 12);
    expect(converted.find(i => i.numbers === '529')?.amount).toBe(100 + 12);
    expect(converted.find(i => i.numbers === '592')?.amount).toBe(100 + 12);
    expect(converted.find(i => i.numbers === '925')?.amount).toBe(111 + 12);
    expect(converted.find(i => i.numbers === '952')?.amount).toBe(100 + 12);

    // No tod remaining
    expect(converted.filter(i => i.bet_type === '3_tod')).toHaveLength(0);
  });
});
