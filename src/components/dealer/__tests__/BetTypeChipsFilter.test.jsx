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
        expect(html).toContain('เลือกทั้งหมด')
        expect(html).toContain('(17)')
        expect(html).toContain('1 ตัวทุกประเภท')
        expect(html).toContain('2 ตัวทุกประเภท')
        expect(html).toContain('3 ตัวทุกประเภท')
        expect(html).toContain('4 ตัวทุกประเภท')
        expect(html).toContain('5 ตัวทุกประเภท')
        expect(html).toContain('⚡ ทางลัดเลือกตามจำนวนหลัก')
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

    it('renders stock lottery with 2 types and 2-digit group shortcut', () => {
        const html = renderToString(
            <BetTypeChipsFilter
                lotteryType="stock"
                selectedTypes={['2_top']}
                onChange={() => {}}
            />
        )
        expect(html).toContain('2 ตัวบน')
        expect(html).toContain('ประเภทเลขที่เลือก (1/2)')
        expect(html).toContain('เลือกทั้งหมด')
        expect(html).toContain('(2)')
        expect(html).toContain('2 ตัวทุกประเภท')
    })

    it('shows checkmark when all 2-digit bet types are selected', () => {
        const html = renderToString(
            <BetTypeChipsFilter
                lotteryType="thai"
                selectedTypes={['2_top', '2_front', '2_center', '2_bottom', '2_run']}
                onChange={() => {}}
            />
        )
        expect(html).toContain('✓')
        expect(html).toContain('2 ตัวทุกประเภท')
        expect(html).toContain('2 ตัวบน')
        expect(html).toContain('2 ตัวหน้า')
        expect(html).toContain('2 ตัวถ่าง')
        expect(html).toContain('2 ตัวล่าง')
        expect(html).toContain('2 ตัวลอย')
    })
})

