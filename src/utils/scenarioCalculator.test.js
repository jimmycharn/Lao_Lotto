import { describe, it, expect } from 'vitest'
import { checkBetWin } from './scenarioCalculator.js'

describe('checkBetWin - 3_tod and 3_tod_single', () => {
    it('should return wins = true when 3_tod bet numbers match w3top in exact order (e.g. 479 vs 479)', () => {
        const winNums = {
            w3top: '479',
            w3topSorted: '479'
        }
        const result = checkBetWin('3_tod', '479', winNums, 100, 50)
        expect(result).toEqual({ wins: true, payout: 5000 })
    })

    it('should return wins = true when 3_tod bet numbers match w3top in permuted order (e.g. 974 vs 479)', () => {
        const winNums = {
            w3top: '479',
            w3topSorted: '479'
        }
        const result = checkBetWin('3_tod', '974', winNums, 100, 50)
        expect(result).toEqual({ wins: true, payout: 5000 })
    })

    it('should return wins = true when 3_tod_single bet numbers match w3top in exact order', () => {
        const winNums = {
            w3top: '479',
            w3topSorted: '479'
        }
        const result = checkBetWin('3_tod_single', '479', winNums, 100, 50)
        expect(result).toEqual({ wins: true, payout: 5000 })
    })

    it('should return wins = false when 3_tod bet numbers do not match w3top digits', () => {
        const winNums = {
            w3top: '479',
            w3topSorted: '479'
        }
        const result = checkBetWin('3_tod', '123', winNums, 100, 50)
        expect(result?.wins).toBeFalsy()
    })
})
