import { describe, it, expect } from 'vitest';
import { convertAndMergeTodItems } from './layoffTodConverter';

describe('layoff commands logic', () => {
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
