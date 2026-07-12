import { describe, it, expect } from 'vitest';
import { parseMultiLinePaste } from '../src/utils/pasteParser.js';

describe('4-digit parsing improvements', () => {
  describe('Lao/Hanoi lotteries (isLaoOrHanoi = true)', () => {
    it('should parse 1234 as 4ตัวชุด', () => {
      const res = parseMultiLinePaste('1234', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 1,
        betType: '4_set',
        typeLabel: '4ตัวชุด',
        formattedLine: '1234=1 4ตัวชุด'
      });
    });

    it('should parse 1234=2 ชุด as 4ตัวชุด with amount 2', () => {
      const res = parseMultiLinePaste('1234=2 ชุด', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 2,
        betType: '4_set',
        typeLabel: '4ตัวชุด',
        formattedLine: '1234=2 4ตัวชุด'
      });
    });

    it('should parse 2541=1ชุด as 4ตัวชุด with amount 1', () => {
      const res = parseMultiLinePaste('2541=1ชุด', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '2541',
        amount: 1,
        betType: '4_set',
        typeLabel: '4ตัวชุด',
        formattedLine: '2541=1 4ตัวชุด'
      });
    });

    it('should parse 1234=100ชุด as 4ตัวชุด with amount 100', () => {
      const res = parseMultiLinePaste('1234=100ชุด', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        betType: '4_set',
        typeLabel: '4ตัวชุด',
        formattedLine: '1234=100 4ตัวชุด'
      });
    });

    it('should parse 1234=100 as ลอยแพ with amount 100', () => {
      const res = parseMultiLinePaste('1234=100', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        betType: '4_float',
        typeLabel: 'ลอยแพ',
        formattedLine: '1234=100 ลอยแพ'
      });
    });

    it('should parse 1234=100*24 as คูณชุด', () => {
      const res = parseMultiLinePaste('1234=100*24', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        amount2: 24,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด',
        formattedLine: '1234=100*24 คูณชุด'
      });
    });

    it('should parse 1234=100*ชุด as คูณชุด (24)', () => {
      const res = parseMultiLinePaste('1234=100*ชุด', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        amount2: 24,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด',
        formattedLine: '1234=100*24 คูณชุด'
      });
    });

    it('should parse 1234=100xชุด as คูณชุด (24)', () => {
      const res = parseMultiLinePaste('1234=100xชุด', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        amount2: 24,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด',
        formattedLine: '1234=100*24 คูณชุด'
      });
    });
  });

  describe('Thai lottery (isLaoOrHanoi = false)', () => {
    it('should ignore bare 1234', () => {
      const res = parseMultiLinePaste('1234', 'thai');
      expect(res.length).toBe(0);
    });

    it('should parse 1234=100ชุด as คูณชุด (24) on Thai lottery', () => {
      const res = parseMultiLinePaste('1234=100ชุด', 'thai');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '1234',
        amount: 100,
        amount2: 24,
        betType: '3_top',
        specialType: '3xPerm',
        typeLabel: 'คูณชุด',
        formattedLine: '1234=100*24 คูณชุด'
      });
    });
  });

  describe('position shorthands with Unicode multiplication sign ×', () => {
    it('should parse 18x=50×50 as 2_front with reverse', () => {
      const res = parseMultiLinePaste('18x=50×50', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '18',
        amount: 50,
        amount2: 50,
        betType: '2_front',
        specialType: 'reverse',
        typeLabel: 'หน้ากลับ',
        formattedLine: '18=50*50 หน้ากลับ'
      });
    });

    it('should parse 1×8=50×50 as 2_center with reverse', () => {
      const res = parseMultiLinePaste('1×8=50×50', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '18',
        amount: 50,
        amount2: 50,
        betType: '2_center',
        specialType: 'reverse',
        typeLabel: 'ถ่างกลับ',
        formattedLine: '18=50*50 ถ่างกลับ'
      });
    });

    it('should parse ×18=100×100 as 2_top with reverse', () => {
      const res = parseMultiLinePaste('×18=100×100', 'lao');
      expect(res.length).toBe(1);
      expect(res[0]).toMatchObject({
        numbers: '18',
        amount: 100,
        amount2: 100,
        betType: '2_top',
        specialType: 'reverse',
        typeLabel: 'บนกลับ',
        formattedLine: '18=100*100 บนกลับ'
      });
    });
  });

});
