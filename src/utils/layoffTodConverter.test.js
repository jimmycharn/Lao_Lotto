import { describe, it, expect } from 'vitest'
import {
    get3DigitPermutations,
    convertTodItemToTopItems,
    mergeTodToTopExcessItems,
    encodeTodConversionNote,
    parseTodConversionNote,
    calculateTransferDeduction,
    calculateRemainingLayoff,
    getRemainingBetTypeDisplay
} from './layoffTodConverter'

describe('layoffTodConverter', () => {
    describe('get3DigitPermutations', () => {
        it('should return 6 permutations for unique 3 digits', () => {
            const perms = get3DigitPermutations('123')
            expect(perms).toHaveLength(6)
            expect(perms.sort()).toEqual(['123', '132', '213', '231', '312', '321'].sort())
        })

        it('should return 3 permutations for double digits', () => {
            const perms = get3DigitPermutations('122')
            expect(perms).toHaveLength(3)
            expect(perms.sort()).toEqual(['122', '212', '221'].sort())
        })

        it('should return 1 permutation for triple digits', () => {
            const perms = get3DigitPermutations('111')
            expect(perms).toHaveLength(1)
            expect(perms).toEqual(['111'])
        })

        it('should fallback to original string if not 3 digits', () => {
            expect(get3DigitPermutations('25')).toEqual(['25'])
        })
    })

    describe('convertTodItemToTopItems', () => {
        it('should divide excess amount and ceil correctly (exact division)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 6
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.bet_type).toBe('3_top')
                expect(item.excess).toBe(1)
                expect(item.isConvertedFromTod).toBe(true)
                expect(item.originalTodNumbers).toBe('123')
                expect(item.originalTodExcess).toBe(6)
            })
        })

        it('should apply Math.ceil when excess is not evenly divisible (123=5 -> 1 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 5
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(1) // Math.ceil(5/6) = 1
            })
        })

        it('should apply Math.ceil for double digits (122=25 -> 9 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '122',
                excess: 25
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(3)
            converted.forEach(item => {
                expect(item.excess).toBe(9) // Math.ceil(25/3) = 9
            })
        })

        it('should calculate for screenshot example (123=200 -> 34 each)', () => {
            const todItem = {
                bet_type: '3_tod',
                numbers: '123',
                excess: 200
            }
            const converted = convertTodItemToTopItems(todItem)
            expect(converted).toHaveLength(6)
            converted.forEach(item => {
                expect(item.excess).toBe(34) // Math.ceil(200/6) = 34
            })
        })
    })

    describe('mergeTodToTopExcessItems (Approach A)', () => {
        it('should merge converted item with existing 3_top item of same number', () => {
            const excessItems = [
                { bet_type: '2_top', numbers: '25', excess: 1000 },
                { bet_type: '3_tod', numbers: '123', excess: 200 },
                { bet_type: '3_top', numbers: '123', excess: 380 }
            ]
            const merged = mergeTodToTopExcessItems(excessItems)
            
            // 2_top stays untouched
            expect(merged.find(i => i.bet_type === '2_top' && i.numbers === '25')).toBeDefined()
            // 3_tod is removed/converted
            expect(merged.find(i => i.bet_type === '3_tod')).toBeUndefined()
            
            // 123 3_top is merged
            const item123 = merged.find(i => i.bet_type === '3_top' && i.numbers === '123')
            expect(item123).toBeDefined()
            expect(item123.excess).toBe(414) // 380 + 34
            expect(item123.isMergedWithTod).toBe(true)
            expect(item123.originalTopExcess).toBe(380)
            expect(item123.convertedTodExcess).toBe(34)
            expect(item123.originalTodNumbers).toBe('123')
            expect(item123.originalTodFullExcess).toBe(200)

            // other permutations are separate standalone 3_top items
            const item132 = merged.find(i => i.bet_type === '3_top' && i.numbers === '132')
            expect(item132).toBeDefined()
            expect(item132.excess).toBe(34)
            expect(item132.isConvertedFromTod).toBe(true)
        })

        it('should assign display_bet_type based on lotteryType (บน for thai, ตรง for lao)', () => {
            const excessItems = [
                { bet_type: '3_tod', numbers: '123', excess: 60 }
            ]
            const mergedThai = mergeTodToTopExcessItems(excessItems, 'thai')
            expect(mergedThai).toHaveLength(6)
            mergedThai.forEach(i => {
                expect(i.bet_type).toBe('3_top')
                expect(i.display_bet_type).toBe('บน')
            })

            const mergedLao = mergeTodToTopExcessItems(excessItems, 'lao')
            expect(mergedLao).toHaveLength(6)
            mergedLao.forEach(i => {
                expect(i.bet_type).toBe('3_top')
                expect(i.display_bet_type).toBe('ตรง')
            })
        })
    })

    describe('encodeTodConversionNote & parseTodConversionNote', () => {
        it('should encode and decode metadata correctly', () => {
            const item = {
                isConvertedFromTod: true,
                originalTodNumbers: '123',
                originalTodExcess: 200,
                convertedTodExcess: 34,
                isMergedWithTod: true,
                originalTopExcess: 380
            }
            const note = encodeTodConversionNote(item, 'ส่งเจ้ามือใหญ่')
            expect(note).toContain('[TOD_CONV:')
            expect(note).toContain('ส่งเจ้ามือใหญ่')

            const parsed = parseTodConversionNote(note)
            expect(parsed).toBeDefined()
            expect(parsed.originalTodNumbers).toBe('123')
            expect(parsed.originalTodExcess).toBe(200)
            expect(parsed.isMergedWithTod).toBe(true)
            expect(parsed.userNote).toBe('ส่งเจ้ามือใหญ่')
        })
    })

    describe('calculateTransferDeduction', () => {
        it('should correctly allocate merged transfer between 3_tod and 3_top', () => {
            const transfers = [
                {
                    bet_type: '3_top',
                    numbers: '123',
                    amount: 414,
                    notes: '[TOD_CONV:{"orig_num":"123","orig_excess":200,"allocated":34,"is_merged":true,"top_excess":380}] โต๊ดแปลง'
                },
                {
                    bet_type: '3_top',
                    numbers: '132',
                    amount: 34,
                    notes: '[TOD_CONV:{"orig_num":"123","orig_excess":200,"allocated":34,"is_merged":false,"top_excess":0}]'
                }
            ]

            // 3_top 123 should deduct only its top_excess (380)
            const topDeduction = calculateTransferDeduction(transfers, '3_top', '123')
            expect(topDeduction).toBe(380)

            // 3_tod 123 should deduct allocated amounts from both 123 and 132 (34 + 34 = 68)
            const todDeduction = calculateTransferDeduction(transfers, '3_tod', '123')
            expect(todDeduction).toBe(68)
        })

        it('should deduct standard non-converted transfers normally', () => {
            const transfers = [
                { bet_type: '2_top', numbers: '25', amount: 500 }
            ]
            expect(calculateTransferDeduction(transfers, '2_top', '25')).toBe(500)
            expect(calculateTransferDeduction(transfers, '2_top', '26')).toBe(0)
        })
    })

    describe('Remaining tab layoff calculations workflow', () => {
        const calculateRemainingLayoff = ({ baseItems, selectedMap, retainByType, convertTodToTop }) => {
            const rawSelected = baseItems.filter(item => selectedMap[`${item.bet_type}|${item.numbers}`])
            if (rawSelected.length === 0) return []

            const itemsWithExcess = rawSelected.map(item => {
                const retainVal = retainByType[item.bet_type]
                const hasRetain = retainVal !== undefined && retainVal !== null && retainVal !== '' && !isNaN(Number(retainVal)) && Number(retainVal) >= 0
                const retain = hasRetain ? Number(retainVal) : 0
                const transferAmt = hasRetain ? Math.max(0, item.remainingAmount - retain) : item.remainingAmount

                return {
                    ...item,
                    excess: transferAmt,
                    originalRemaining: item.remainingAmount,
                    retainAmount: hasRetain ? retain : 0
                }
            }).filter(item => item.excess > 0)

            if (itemsWithExcess.length === 0) return []

            if (convertTodToTop) {
                return mergeTodToTopExcessItems(itemsWithExcess)
            }
            return itemsWithExcess
        }

        it('should transfer 100% when no retain amount is specified for a bet type', () => {
            const baseItems = [
                { bet_type: '3_top', numbers: '000', remainingAmount: 50 },
                { bet_type: '3_tod', numbers: '002', remainingAmount: 20 }
            ]
            const selectedMap = { '3_top|000': true, '3_tod|002': true }
            const retainByType = {} // none specified

            const result = calculateRemainingLayoff({
                baseItems,
                selectedMap,
                retainByType,
                convertTodToTop: false
            })

            expect(result).toHaveLength(2)
            expect(result.find(i => i.numbers === '000').excess).toBe(50)
            expect(result.find(i => i.numbers === '002').excess).toBe(20)
        })

        it('should keep what it has when remaining is less than or equal to retain (excess = 0)', () => {
            const baseItems = [
                { bet_type: '3_top', numbers: '000', remainingAmount: 15 },
                { bet_type: '3_top', numbers: '111', remainingAmount: 50 }
            ]
            const selectedMap = { '3_top|000': true, '3_top|111': true }
            const retainByType = { '3_top': 20 } // retain 20

            const result = calculateRemainingLayoff({
                baseItems,
                selectedMap,
                retainByType,
                convertTodToTop: false
            })

            // 000 has 15 <= 20 -> excess = 0, excluded from transfer!
            // 111 has 50 > 20 -> excess = 30
            expect(result).toHaveLength(1)
            expect(result[0].numbers).toBe('111')
            expect(result[0].excess).toBe(30)
            expect(result[0].retainAmount).toBe(20)
        })

        it('should convert ONLY selected 3_tod items to 3_top when convertTodToTop is enabled', () => {
            const baseItems = [
                { bet_type: '3_top', numbers: '000', remainingAmount: 50 },
                { bet_type: '3_tod', numbers: '002', remainingAmount: 60 },
                { bet_type: '3_tod', numbers: '123', remainingAmount: 100 } // unselected
            ]
            const selectedMap = { '3_top|000': true, '3_tod|002': true } // only 000 and 002 selected
            const retainByType = { '3_top': 20, '3_tod': 30 } // 000 -> 30, 002 -> 30

            const result = calculateRemainingLayoff({
                baseItems,
                selectedMap,
                retainByType,
                convertTodToTop: true
            })

            // 000 (3_top) retains excess 30
            const top000 = result.find(i => i.bet_type === '3_top' && i.numbers === '000')
            expect(top000).toBeDefined()
            expect(top000.excess).toBe(30)

            // 002 (3_tod) excess 30 converted into 3 permutations of 3_top: 002, 020, 200 (ceil(30/3) = 10 each)
            const convertedPerms = result.filter(i => i.isConvertedFromTod && i.originalTodNumbers === '002')
            expect(convertedPerms).toHaveLength(3)
            convertedPerms.forEach(perm => {
                expect(perm.bet_type).toBe('3_top')
                expect(perm.excess).toBe(10)
            })

            // 123 (unselected 3_tod) should NOT be in result at all
            expect(result.some(i => i.numbers === '123' || i.originalTodNumbers === '123')).toBe(false)
        })
    })

    describe('getRemainingBetTypeDisplay', () => {
        it('should return โต๊ด for 3_tod across different lottery types', () => {
            expect(getRemainingBetTypeDisplay('3_tod', 'lao')).toBe('โต๊ด')
            expect(getRemainingBetTypeDisplay('3_tod', 'hanoi')).toBe('โต๊ด')
            expect(getRemainingBetTypeDisplay('3_tod', 'thai')).toBe('โต๊ด')
        })

        it('should return บน for 3_top in thai lottery, and ตรง for other lotteries', () => {
            expect(getRemainingBetTypeDisplay('3_top', 'thai')).toBe('บน')
            expect(getRemainingBetTypeDisplay('3_top', 'lao')).toBe('ตรง')
            expect(getRemainingBetTypeDisplay('3_top', 'hanoi')).toBe('ตรง')
            expect(getRemainingBetTypeDisplay('3_top', 'stock')).toBe('ตรง')
        })

        it('should return default lottery label for other bet types', () => {
            expect(getRemainingBetTypeDisplay('2_top', 'lao')).toBe('2 ตัวบน')
            expect(getRemainingBetTypeDisplay('2_bottom', 'lao')).toBe('2 ตัวล่าง')
            expect(getRemainingBetTypeDisplay('run_top', 'lao')).toBe('ลอยบน')
            expect(getRemainingBetTypeDisplay('4_set', 'lao')).toBe('4 ตัวชุด')
        })
    })

    describe('display_bet_type preservation during conversion', () => {
        it('should set display_bet_type to บน for thai and ตรง for others when 3_tod is converted to 3_top permutations', () => {
            const todItem = {
                bet_type: '3_tod',
                display_bet_type: 'เต็ง-โต๊ด',
                numbers: '023',
                excess: 5
            }
            const convertedLao = convertTodItemToTopItems(todItem, 'lao')
            expect(convertedLao).toHaveLength(6)
            convertedLao.forEach(item => {
                expect(item.bet_type).toBe('3_top')
                expect(item.display_bet_type).toBe('ตรง')
            })

            const convertedThai = convertTodItemToTopItems(todItem, 'thai')
            expect(convertedThai).toHaveLength(6)
            convertedThai.forEach(item => {
                expect(item.bet_type).toBe('3_top')
                expect(item.display_bet_type).toBe('บน')
            })
        })
    })
})


