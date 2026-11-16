import { execSync } from 'child_process'
import {
  calculateLayoffSummaries,
  generateLayoffSummaryFlex,
  generateTargetedLayoffSummaryFlex,
  formatLayoffWinningBetsMessage
} from '../supabase/functions/line-bot/layoffSummaryHelper.ts'

function runE2E() {
  console.log('--- Step 1: Verify DB upstream_code in dealer_upstream_connections ---')
  const query = 'SELECT id, upstream_name, upstream_code FROM public.dealer_upstream_connections WHERE upstream_name LIKE \'%จิ้ม%\';'
  const output = execSync(`npx.cmd supabase db query --linked "${query}"`, { encoding: 'utf8' })
  
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const parsed = JSON.parse(output.substring(jsonStart, jsonEnd + 1))
    const rows = parsed.rows || []
    console.log(`Found ${rows.length} rows matching พี่จิ้ม:`, rows)
    const jim = rows[0]
    if (!jim || !jim.upstream_code || jim.upstream_code.length !== 5) {
      throw new Error(`พี่จิ้ม does not have 5-digit code: ${JSON.stringify(jim)}`)
    }
    console.log(`✅ พี่จิ้ม อ้อมค่าย has valid 5-digit code: ${jim.upstream_code}`)
  }

  console.log('\n--- Step 2: Verify calculateLayoffSummaries descending sorting ---')
  const mockTransfers = [
    { target_dealer_name: 'พี่จิ้ม อ้อมค่าย', upstream_dealer_id: null, amount: 2000, bet_type: '2_top', numbers: '54' },
    { target_dealer_name: 'พี่โต นครปฐม', upstream_dealer_id: null, amount: 9000, bet_type: '3_top', numbers: '654' },
    { target_dealer_name: 'พี่เล็ก สุพรรณ', upstream_dealer_id: null, amount: 5000, bet_type: '2_bottom', numbers: '06' }
  ]
  const mockConns = [
    { upstream_name: 'พี่จิ้ม อ้อมค่าย', upstream_code: '10088', lottery_settings: { thai: { '2_top': { commission: 20, payout: 90 } } } },
    { upstream_name: 'พี่โต นครปฐม', upstream_code: '10082', lottery_settings: { thai: { '3_top': { commission: 25, payout: 900 } } } },
    { upstream_name: 'พี่เล็ก สุพรรณ', upstream_code: '10083', lottery_settings: { thai: { '2_bottom': { commission: 20, payout: 90 } } } }
  ]
  const winningNumbers = { '3_top': '654', '2_top': '54', '2_bottom': '06' }

  const { overallTotals, sortedDealers } = calculateLayoffSummaries(
    mockTransfers,
    mockConns,
    winningNumbers,
    'thai'
  )

  console.log('Sorted dealers by totalBet descending:')
  sortedDealers.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.dealerName} (${d.dealerCode}): totalBet = ฿${d.totalBet}, totalWin = ฿${d.totalWin}, net = ฿${d.net}`)
  })

  if (sortedDealers[0].dealerName !== 'พี่โต นครปฐม' || sortedDealers[1].dealerName !== 'พี่เล็ก สุพรรณ' || sortedDealers[2].dealerName !== 'พี่จิ้ม อ้อมค่าย') {
    throw new Error('Sorting order is incorrect!')
  }
  console.log('✅ Sorting verification passed!')

  console.log('\n--- Step 3: Verify Flex Message payload schema ---')
  const roundInfo = {
    lotteryName: 'หวยไทย',
    roundDate: '16-11-2569',
    winningResultStr: '645654 / 06'
  }
  const flexOverall = generateLayoffSummaryFlex(overallTotals, sortedDealers, roundInfo)
  if (!flexOverall || flexOverall.type !== 'bubble' || !flexOverall.body || !flexOverall.header) {
    throw new Error('Invalid Flex Message structure!')
  }
  console.log('✅ Flex Overall structure is valid!')

  const flexTargeted = generateTargetedLayoffSummaryFlex(sortedDealers[0], roundInfo)
  if (!flexTargeted || flexTargeted.type !== 'bubble' || !flexTargeted.body) {
    throw new Error('Invalid Targeted Flex structure!')
  }
  console.log('✅ Flex Targeted structure is valid!')

  console.log('\n--- Step 4: Verify Winning Bets Text Formatter ---')
  const winningTransfers = sortedDealers.flatMap(d => d.winningTransfers)
  const winningMsg = formatLayoffWinningBetsMessage(winningTransfers, null, roundInfo)
  console.log('Winning message sample:')
  console.log(winningMsg)
  if (!winningMsg.includes('รายการตีออกที่ถูกรางวัล') || !winningMsg.includes('พี่โต นครปฐม')) {
    throw new Error('Winning message does not contain expected data!')
  }
  console.log('✅ Winning message formatting passed!')

  console.log('\n🎉 ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉')
}

runE2E()
