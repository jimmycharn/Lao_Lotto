import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Payout rates per bet type (worst-case multiplier)
const DEFAULT_PAYOUTS: Record<string, number> = {
  'run_top': 3, 'run_bottom': 4,
  'pak_top': 8, 'pak_bottom': 6,
  'front_top_1': 8, 'middle_top_1': 8, 'back_top_1': 8,
  'front_bottom_1': 6, 'back_bottom_1': 6,
  '2_top': 90, '2_bottom': 90, '2_front': 90, '2_center': 90,
  '2_run': 9, '2_spread': 9,
  '3_top': 800, '3_bottom': 150, '3_tod': 120, '3_tod_single': 120,
  '3_straight': 800,
  '4_float': 4000, '5_float': 15000,
  '6_top': 600000,
  '4_set': 100000
}

const DEFAULT_COMMISSIONS: Record<string, number> = {
  'run_top': 15, 'run_bottom': 15,
  'pak_top': 15, 'pak_bottom': 15,
  'front_top_1': 15, 'middle_top_1': 15, 'back_top_1': 15,
  'front_bottom_1': 15, 'back_bottom_1': 15,
  '2_top': 15, '2_bottom': 15, '2_front': 15, '2_center': 15,
  '2_run': 15, '2_spread': 15,
  '3_top': 15, '3_bottom': 15, '3_tod': 15, '3_tod_single': 15,
  '3_straight': 15,
  '4_float': 15, '5_float': 15,
  '6_top': 0, '4_set': 25
}

// Bet type labels in Thai
const BET_TYPE_LABELS: Record<string, string> = {
  'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
  'pak_top': 'ปักบน', 'pak_bottom': 'ปักล่าง',
  'front_top_1': 'หน้าบน', 'middle_top_1': 'กลางบน', 'back_top_1': 'หลังบน',
  'front_bottom_1': 'หน้าล่าง', 'back_bottom_1': 'หลังล่าง',
  '2_top': '2 ตัวบน', '2_bottom': '2 ตัวล่าง', '2_front': '2 ตัวหน้า', '2_center': '2 ตัวถ่าง',
  '2_run': '2 ตัวลอย', '2_spread': '2 ตัวกลับ',
  '3_top': '3 ตัวบน', '3_bottom': '3 ตัวล่าง', '3_tod': '3 ตัวโต๊ด', '3_tod_single': '3 ตัวโต๊ดเดี่ยว',
  '3_straight': '3 ตัวตรง',
  '4_float': '4 ตัวลอย', '5_float': '5 ตัวลอย',
  '6_top': 'รางวัลที่ 1', '4_set': '4 ตัวชุด'
}

interface SubmissionGroup {
  bet_type: string
  numbers: string
  total_amount: number
  count: number
  payout_rate: number
  commission_rate: number
  potential_loss: number // amount * payout_rate (worst case if this number wins)
  net_exposure: number  // potential_loss - total_amount - commission
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!AI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, message: 'API Key not configured. Set OPENROUTER_API_KEY in Supabase Secrets.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const { round_id, budget, dealer_id, lottery_type, currency_symbol } = await req.json()

    if (!round_id || !budget || !dealer_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: round_id, budget, dealer_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Fetch all submissions for this round
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select('id, bet_type, numbers, amount, user_id')
      .eq('round_id', round_id)
      .eq('is_deleted', false)

    if (subError) throw subError

    // 2. Fetch existing transfers for this round
    const { data: transfers, error: trError } = await supabase
      .from('bet_transfers')
      .select('bet_type, numbers, amount')
      .eq('round_id', round_id)

    if (trError) throw trError

    // 3. Fetch type_limits for this round
    const { data: typeLimits, error: tlError } = await supabase
      .from('type_limits')
      .select('bet_type, max_per_number')
      .eq('round_id', round_id)

    if (tlError) throw tlError

    // 4. Fetch dealer's user_settings for payout rates
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('lottery_settings')
      .eq('user_id', dealer_id)
      .limit(1)

    // Build limits map
    const limitsMap: Record<string, number> = {}
    typeLimits?.forEach((tl: any) => {
      limitsMap[tl.bet_type] = tl.max_per_number
    })

    // Build transferred amounts map
    const transferredMap: Record<string, number> = {}
    transfers?.forEach((t: any) => {
      const key = `${t.bet_type}|${t.numbers}`
      transferredMap[key] = (transferredMap[key] || 0) + (t.amount || 0)
    })

    // Group submissions by bet_type + numbers and calculate exposure
    const groups: Record<string, SubmissionGroup> = {}
    submissions?.forEach((s: any) => {
      const key = `${s.bet_type}|${s.numbers}`
      if (!groups[key]) {
        const payoutRate = DEFAULT_PAYOUTS[s.bet_type] || 1
        const commissionRate = DEFAULT_COMMISSIONS[s.bet_type] || 15
        groups[key] = {
          bet_type: s.bet_type,
          numbers: s.numbers,
          total_amount: 0,
          count: 0,
          payout_rate: payoutRate,
          commission_rate: commissionRate,
          potential_loss: 0,
          net_exposure: 0
        }
      }
      groups[key].total_amount += s.amount || 0
      groups[key].count++
    })

    // Calculate exposure for each group
    const groupList = Object.values(groups).map(g => {
      const transferred = transferredMap[`${g.bet_type}|${g.numbers}`] || 0
      const netAmount = g.total_amount - transferred
      g.potential_loss = netAmount * g.payout_rate
      const commissionEarned = g.total_amount * (g.commission_rate / 100)
      g.net_exposure = g.potential_loss - netAmount + commissionEarned
      return { ...g, transferred_amount: transferred, net_amount: netAmount }
    }).filter(g => g.net_amount > 0)

    // Sort by potential_loss descending (highest risk first)
    groupList.sort((a, b) => b.potential_loss - a.potential_loss)

    // Calculate totals
    const totalBetAmount = groupList.reduce((sum, g) => sum + g.total_amount, 0)
    const totalTransferred = groupList.reduce((sum, g) => sum + g.transferred_amount, 0)
    const totalNetAmount = groupList.reduce((sum, g) => sum + g.net_amount, 0)
    const maxSingleLoss = groupList.length > 0 ? groupList[0].potential_loss : 0
    const totalCommissionEarned = groupList.reduce((sum, g) => sum + g.total_amount * (g.commission_rate / 100), 0)

    // Prepare top risk items for AI (top 50 by exposure)
    const topRiskItems = groupList.slice(0, 50).map(g => ({
      bet_type: g.bet_type,
      bet_type_label: BET_TYPE_LABELS[g.bet_type] || g.bet_type,
      numbers: g.numbers,
      total_amount: g.total_amount,
      transferred: g.transferred_amount,
      net_amount: g.net_amount,
      payout_rate: g.payout_rate,
      potential_loss: g.potential_loss,
      limit: limitsMap[g.bet_type] || null
    }))

    // Build the prompt
    const systemPrompt = `คุณเป็น AI ผู้เชี่ยวชาญวิเคราะห์ความเสี่ยงหวยสำหรับเจ้ามือ (dealer)
คุณจะได้รับข้อมูลยอดรับ (submissions) ของงวดหวย และวงเงินสู้ (budget) ของเจ้ามือ

หน้าที่ของคุณ:
1. วิเคราะห์ความเสี่ยงของแต่ละเลข โดยดูจาก potential_loss (ยอดเงิน × อัตราจ่าย)
2. แนะนำว่าเลขไหนควร "ตีออก" (transfer ไปเจ้ามือคนอื่น) และควรตีออกเท่าไร
3. เป้าหมาย: ทำให้ worst-case loss ของเจ้ามือไม่เกินวงเงินสู้ (budget)

กฎสำคัญ:
- ถ้ายอดรวมของเลขใดเลขหนึ่ง × อัตราจ่าย > budget → ต้องตีออกบางส่วน
- เลขที่มี potential_loss สูงสุดควรถูกตีออกก่อน
- ตีออกแค่พอให้ potential_loss ลดลงอยู่ในระดับที่ budget รับไหว
- transfer_amount ต้องเป็นจำนวนเต็ม (ปัดขึ้น)
- ถ้าเลขไม่มีความเสี่ยงสูง ไม่ต้องตีออก
- ให้เหตุผลสั้นๆ เป็นภาษาไทยสำหรับแต่ละรายการ

หน่วยเงิน: ${currency_symbol || '฿'}
ประเภทหวย: ${lottery_type || 'lao'}

ตอบเป็น JSON เท่านั้น ตามรูปแบบนี้:
{
  "analysis": {
    "total_exposure": <number - ยอดรวม potential_loss ทั้งหมด>,
    "max_single_loss": <number - potential_loss สูงสุดของเลขเดียว>,
    "budget": <number>,
    "risk_level": "low" | "medium" | "high" | "critical",
    "summary": "<string - สรุปสั้นๆ เป็นภาษาไทย>"
  },
  "recommendations": [
    {
      "bet_type": "<string>",
      "numbers": "<string>",
      "current_amount": <number - ยอดปัจจุบันหลังหักที่ตีออกแล้ว>,
      "keep_amount": <number - ยอดที่ควรเก็บไว้>,
      "transfer_amount": <number - ยอดที่ควรตีออก>,
      "potential_loss_before": <number>,
      "potential_loss_after": <number>,
      "reason": "<string - เหตุผลสั้นๆ ภาษาไทย>"
    }
  ]
}`

    const userPrompt = `วงเงินสู้ (budget): ${currency_symbol || '฿'}${budget.toLocaleString()}

สรุปภาพรวม:
- ยอดรับรวม: ${currency_symbol || '฿'}${totalBetAmount.toLocaleString()}
- ยอดตีออกแล้ว: ${currency_symbol || '฿'}${totalTransferred.toLocaleString()}
- ยอดสุทธิ: ${currency_symbol || '฿'}${totalNetAmount.toLocaleString()}
- ค่าคอมรวม: ${currency_symbol || '฿'}${Math.round(totalCommissionEarned).toLocaleString()}
- ความเสี่ยงสูงสุด (เลขเดียว): ${currency_symbol || '฿'}${maxSingleLoss.toLocaleString()}
- จำนวนเลขทั้งหมด: ${groupList.length} รายการ

รายการเลขเรียงตามความเสี่ยง (สูงสุดก่อน):
${JSON.stringify(topRiskItems, null, 2)}`

    // Call OpenRouter API (compatible with OpenAI format)
    const openaiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': SUPABASE_URL,
        'X-Title': 'LaoLotto AI Analysis'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      console.error('OpenAI API error:', errText)
      return new Response(
        JSON.stringify({ success: false, message: `AI API error: ${openaiResponse.status} - ${errText.substring(0, 200)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const openaiResult = await openaiResponse.json()
    const aiContent = openaiResult.choices?.[0]?.message?.content

    let aiAnalysis
    try {
      aiAnalysis = JSON.parse(aiContent)
    } catch (e) {
      console.error('Failed to parse AI response:', aiContent)
      return new Response(
        JSON.stringify({ success: false, message: 'AI returned invalid JSON', raw: aiContent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Log the analysis
    try {
      await supabase.from('ai_analysis_logs').insert({
        round_id,
        dealer_id,
        budget,
        input_summary: {
          total_bet: totalBetAmount,
          total_transferred: totalTransferred,
          total_net: totalNetAmount,
          max_single_loss: maxSingleLoss,
          item_count: groupList.length
        },
        ai_response: aiAnalysis,
        model: 'gpt-4o-mini',
        tokens_used: openaiResult.usage?.total_tokens || 0
      })
    } catch (logError) {
      // Non-critical, don't fail the request
      console.error('Failed to log AI analysis:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: aiAnalysis,
        meta: {
          total_bet: totalBetAmount,
          total_transferred: totalTransferred,
          total_net: totalNetAmount,
          total_commission: Math.round(totalCommissionEarned),
          max_single_loss: maxSingleLoss,
          item_count: groupList.length,
          tokens_used: openaiResult.usage?.total_tokens || 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    return new Response(
      JSON.stringify({ success: false, message: error.message || 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
