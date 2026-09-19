import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import DealerBottomNav from '../DealerBottomNav'
import DealerSubTabsNav from '../DealerSubTabsNav'

describe('DealerBottomNav', () => {
    it('renders all 5 main navigation items', () => {
        const html = renderToString(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('งวดหวย')
        expect(html).toContain('บุคลากร')
        expect(html).toContain('ตั้งค่า')
        expect(html).toContain('แนะนำ')
        expect(html).toContain('โปรไฟล์')
    })

    it('highlights active item when activeTab matches', () => {
        const html = renderToString(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('dealer-bottom-nav-item active')
        expect(html).toContain('งวดหวย')
    })

    it('highlights บุคลากร when activeTab is upstreamDealers', () => {
        const html = renderToString(
            <DealerBottomNav
                activeTab="upstreamDealers"
                onSelectTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('dealer-bottom-nav-item active')
        expect(html).toContain('บุคลากร')
    })

    it('displays total members badge count on บุคลากร item', () => {
        const html = renderToString(
            <DealerBottomNav
                activeTab="rounds"
                onSelectTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('dealer-bottom-nav-badge')
        expect(html).toContain('18') // 17 + 1
    })
})

describe('DealerSubTabsNav', () => {
    it('renders members and upstream sub-tabs when currentGroup is members', () => {
        const html = renderToString(
            <DealerSubTabsNav
                currentGroup="members"
                activeTab="members"
                onSelectSubTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('สมาชิก (17)')
        expect(html).toContain('เจ้ามือตีออก (1)')
    })

    it('renders lineBot and automation sub-tabs when currentGroup is lineBot', () => {
        const html = renderToString(
            <DealerSubTabsNav
                currentGroup="lineBot"
                activeTab="lineBot"
                onSelectSubTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toContain('จัดการ LINE Bot')
        expect(html).toContain('ตั้งค่าออโตเมชัน')
    })

    it('returns null when currentGroup is not members or lineBot', () => {
        const html = renderToString(
            <DealerSubTabsNav
                currentGroup="rounds"
                activeTab="rounds"
                onSelectSubTab={() => {}}
                membersCount={17}
                upstreamCount={1}
            />
        )
        expect(html).toBe('')
    })
})
