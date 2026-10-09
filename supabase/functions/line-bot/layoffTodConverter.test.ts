import { describe, it, expect } from 'vitest';
import {
  get3DigitPermutations,
  encodeTodConversionNote,
  convertAndMergeTodItems,
  LayoffItem
} from './layoffTodConverter';

describe('layoffTodConverter (LINE Bot)', () => {
  describe('get3DigitPermutations', () => {
    it('generates 6 unique permutations for 3 distinct digits', () => {
      const perms = get3DigitPermutations('259');
      expect(perms).toHaveLength(6);
      expect(perms.sort()).toEqual(['259', '295', '529', '592', '925', '952'].sort());
    });

    it('generates 3 unique permutations for double digits', () => {
      const perms = get3DigitPermutations('995');
      expect(perms).toHaveLength(3);
      expect(perms.sort()).toEqual(['995', '959', '599'].sort());
    });

    it('generates 1 unique permutation for triple digits', () => {
      const perms = get3DigitPermutations('111');
      expect(perms).toEqual(['111']);
    });

    it('returns original input if not a 3-digit string', () => {
      expect(get3DigitPermutations('25')).toEqual(['25']);
    });
  });

  describe('convertAndMergeTodItems', () => {
    it('returns items unchanged if no 3_tod items exist', () => {
      const items: LayoffItem[] = [
        { bet_type: '2_top', numbers: '25', amount: 100 },
        { bet_type: '3_top', numbers: '123', amount: 50 }
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toEqual(items);
    });

    it('converts 3_tod into 3_top permutations using Math.ceil(amount / perms.length)', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_tod', numbers: '259', amount: 70 } // 70 / 6 = 11.67 -> 12 each
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toHaveLength(6);
      result.forEach(item => {
        expect(item.bet_type).toBe('3_top');
        expect(item.amount).toBe(12);
        expect(item.isConvertedFromTod).toBe(true);
        expect(item.notes).toContain('[TOD_CONV:');
      });
      const nums = result.map(i => i.numbers).sort();
      expect(nums).toEqual(['259', '295', '529', '592', '925', '952'].sort());
    });

    it('merges converted 3_tod into existing 3_top items by summing amounts', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_top', numbers: '259', amount: 133 },
        { bet_type: '3_top', numbers: '295', amount: 133 },
        { bet_type: '3_tod', numbers: '259', amount: 70 } // 70 / 6 = 12
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      
      // Should have 6 items in total (2 merged + 4 newly created permutations)
      expect(result).toHaveLength(6);

      const item259 = result.find(i => i.numbers === '259');
      expect(item259).toBeDefined();
      expect(item259?.amount).toBe(133 + 12); // 145
      expect(item259?.isMergedWithTod).toBe(true);
      expect(item259?.notes).toContain('"is_merged":true');

      const item295 = result.find(i => i.numbers === '295');
      expect(item295?.amount).toBe(133 + 12); // 145

      const item529 = result.find(i => i.numbers === '529');
      expect(item529?.amount).toBe(12);

      // Verify no 3_tod remains
      expect(result.some(i => i.bet_type === '3_tod')).toBe(false);
    });

    it('handles double digits (3 perms) correctly', () => {
      const items: LayoffItem[] = [
        { bet_type: '3_tod', numbers: '995', amount: 60 } // 60 / 3 = 20 each
      ];
      const result = convertAndMergeTodItems(items, 'thai');
      expect(result).toHaveLength(3);
      result.forEach(item => {
        expect(item.amount).toBe(20);
        expect(item.bet_type).toBe('3_top');
      });
    });
  });
});
