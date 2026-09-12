import { describe, it, expect } from 'vitest'
import CrossRoundOffsetModal from '../CrossRoundOffsetModal'
import MemberSettlementInline from '../MemberSettlementInline'
import UpstreamSettlementInline from '../UpstreamSettlementInline'
import Dealer from '../../../pages/Dealer'

describe('Smoke test component imports', () => {
    it('should import all modified components without reference errors', () => {
        expect(CrossRoundOffsetModal).toBeDefined()
        expect(MemberSettlementInline).toBeDefined()
        expect(UpstreamSettlementInline).toBeDefined()
        expect(Dealer).toBeDefined()
    })
})
