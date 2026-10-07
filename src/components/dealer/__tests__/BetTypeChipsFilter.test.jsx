import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import BetTypeChipsFilter from '../BetTypeChipsFilter'

describe('BetTypeChipsFilter', () => {
    it('renders empty hint and total count when no bet types selected', () => {
        const html = renderToString(
            <BetTypeChipsFilter
                lotteryType="thai"
                selectedTypes={[]}
                onChange={() => {}}
            />
        )
        expect(html).toContain('แสดงทุกประเภทเลข')
        expect(html).toContain('ประเภทเลขที่เลือก (ทั้งหมด)')
        expect(html).toContain('เลือกทั้งหมด (17)')
    })

    it('renders selected chips correctly for Lao lottery', () => {
        const html = renderToString(
            <BetTypeChipsFilter
                lotteryType="lao"
                selectedTypes={['4_set', '2_top', '3_tod']}
                onChange={() => {}}
            />
        )
        expect(html).toContain('เลข 4ตัวชุด')
        expect(html).toContain('2 ตัวบน')
        expect(html).toContain('3 ตัวโต๊ด')
        expect(html).toContain('ประเภทเลขที่เลือก (3/18)')
        expect(html).toContain('ล้าง')
    })

    it('renders stock lottery with 2 types', () => {
        const html = renderToString(
            <BetTypeChipsFilter
                lotteryType="stock"
                selectedTypes={['2_top']}
                onChange={() => {}}
            />
        )
        expect(html).toContain('2 ตัวบน')
        expect(html).toContain('ประเภทเลขที่เลือก (1/2)')
        expect(html).toContain('เลือกทั้งหมด (2)')
    })
})
