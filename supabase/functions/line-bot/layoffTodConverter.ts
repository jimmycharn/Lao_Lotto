export interface LayoffItem {
  bet_type: string;
  numbers: string;
  amount: number;
  notes?: string;
  isConvertedFromTod?: boolean;
  isMergedWithTod?: boolean;
  originalTodNumbers?: string;
  originalTodAmount?: number;
  convertedTodAmount?: number;
  originalTopAmount?: number;
  [key: string]: any;
}

const METADATA_PREFIX = '[TOD_CONV:';
const METADATA_SUFFIX = ']';

/**
 * Returns all unique permutations of a 3-digit number string.
 */
export function get3DigitPermutations(numbers: string): string[] {
  if (!numbers || typeof numbers !== 'string' || numbers.length !== 3) {
    return [numbers || ''];
  }
  const chars = numbers.split('');
  const permutations = new Set<string>();

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (j === i) continue;
      for (let k = 0; k < 3; k++) {
        if (k === i || k === j) continue;
        permutations.add(chars[i] + chars[j] + chars[k]);
      }
    }
  }
  return Array.from(permutations);
}

/**
 * Encodes tod conversion metadata into transfer note string.
 */
export function encodeTodConversionNote(item: LayoffItem, userNote = ''): string {
  if (!item.isConvertedFromTod) return userNote || '';
  const meta = {
    orig_num: item.originalTodNumbers,
    orig_excess: item.originalTodAmount,
    allocated: item.convertedTodAmount,
    is_merged: !!item.isMergedWithTod,
    top_excess: item.originalTopAmount || 0
  };
  const metaStr = `${METADATA_PREFIX}${JSON.stringify(meta)}${METADATA_SUFFIX}`;
  return userNote ? `${metaStr} ${userNote}` : metaStr;
}

/**
 * Converts 3_tod excess items into 3_top permutations and merges with existing 3_top items.
 */
export function convertAndMergeTodItems<T extends LayoffItem>(items: T[], _lotteryType?: string): T[] {
  const nonTodItems: T[] = [];
  const todItems: T[] = [];

  for (const item of items) {
    if (item.bet_type === '3_tod') {
      todItems.push(item);
    } else {
      nonTodItems.push({ ...item });
    }
  }

  if (todItems.length === 0) {
    return nonTodItems;
  }

  // Generate converted items
  const convertedItems: T[] = [];
  for (const tod of todItems) {
    const perms = get3DigitPermutations(tod.numbers);
    const perPermAmount = Math.ceil(tod.amount / perms.length);

    for (const p of perms) {
      const conv = {
        ...tod,
        bet_type: '3_top',
        numbers: p,
        amount: perPermAmount,
        isConvertedFromTod: true,
        isMergedWithTod: false,
        originalTodNumbers: tod.numbers,
        originalTodAmount: tod.amount,
        convertedTodAmount: perPermAmount
      } as T;
      convertedItems.push(conv);
    }
  }

  // Index non-tod items
  const resultMap = new Map<string, T>();
  for (const item of nonTodItems) {
    resultMap.set(`${item.bet_type}|${item.numbers}`, item);
  }

  // Merge converted items
  for (const conv of convertedItems) {
    const key = `3_top|${conv.numbers}`;
    if (resultMap.has(key)) {
      const existing = resultMap.get(key)!;
      const originalTopAmount = existing.amount || 0;
      const newAmount = originalTopAmount + conv.amount;
      const mergedItem = {
        ...existing,
        amount: newAmount,
        isConvertedFromTod: true,
        isMergedWithTod: true,
        originalTopAmount,
        convertedTodAmount: conv.convertedTodAmount,
        originalTodNumbers: conv.originalTodNumbers,
        originalTodAmount: conv.originalTodAmount
      } as T;
      mergedItem.notes = encodeTodConversionNote(mergedItem, existing.notes || '');
      resultMap.set(key, mergedItem);
    } else {
      const newItem = { ...conv };
      newItem.notes = encodeTodConversionNote(newItem, conv.notes || '');
      resultMap.set(key, newItem);
    }
  }

  return Array.from(resultMap.values());
}
