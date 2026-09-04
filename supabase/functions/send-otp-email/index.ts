import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, otp_code, device_info } = await req.json()

    if (!email || !otp_code) {
      return new Response(
        JSON.stringify({ error: 'Missing email or otp_code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use Resend API to send email (set RESEND_API_KEY in Supabase secrets)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const FROM_EMAIL = Deno.env.get('OTP_FROM_EMAIL') || 'noreply@yourdomain.com'
    const APP_NAME = Deno.env.get('APP_NAME') || 'Big Lotto'

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const deviceText = device_info ? `<div style="background:#f0f4ff;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#334155;">📱 <strong>อุปกรณ์ที่กำลังพยายามเข้าสู่ระบบ:</strong> ${device_info}</div>` : ''

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 24px; }
        .header h1 { color: #1a1a2e; font-size: 24px; margin: 0; }
        .otp-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: 700; color: #fff; letter-spacing: 8px; margin: 0; }
        .info { color: #475569; font-size: 14px; line-height: 1.6; }
        .highlight { background: #e0f2fe; border-left: 4px solid #0284c7; padding: 12px; border-radius: 4px; margin: 16px 0; font-size: 13px; color: #0369a1; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 13px; color: #856404; }
        .footer { text-align: center; margin-top: 24px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 ${APP_NAME}</h1>
          <p style="color: #666;">รหัส PIN ยืนยันการเข้าสู่ระบบจากอุปกรณ์ใหม่</p>
        </div>
        
        <p class="info">ตรวจพบการพยายามเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์อื่น หากเป็นคุณ กรุณายืนยันการเข้าสู่ระบบด้วยวิธีใดวิธีหนึ่งดังนี้:</p>
        
        ${deviceText}

        <div class="highlight">
          👉 <strong>วิธีที่ 1:</strong> หากหน้าจออุปกรณ์เดิมยังเปิดอยู่ คุณสามารถกดปุ่ม <strong>[อนุญาต]</strong> ที่หน้าจออุปกรณ์นั้นได้ทันทีโดยไม่ต้องใช้รหัส PIN นี้
        </div>

        <p class="info"><strong>วิธีที่ 2:</strong> หากไม่ได้อยู่อุปกรณ์เดิม ให้นำรหัส PIN 6 หลักด้านล่างนี้ไปกรอกที่หน้าจออุปกรณ์ใหม่:</p>

        <div class="otp-box">
          <p class="otp-code">${otp_code}</p>
        </div>
        
        <p class="info">
          ⏰ รหัสนี้จะหมดอายุใน <strong>5 นาที</strong><br>
          🔒 สามารถกรอกผิดได้สูงสุด <strong>3 ครั้ง</strong>
        </p>
        
        <div class="warning">
          ⚠️ หากคุณไม่ได้เป็นผู้เข้าสู่ระบบ กรุณากด <strong>[ปฏิเสธ]</strong> บนอุปกรณ์เดิม หรือเปลี่ยนรหัสผ่านทันที
        </div>
        
        <div class="footer">
          <p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบรักษาความปลอดภัย กรุณาอย่าตอบกลับ</p>
        </div>
      </div>
    </body>
    </html>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `[${APP_NAME}] รหัส PIN ยืนยันการเข้าสู่ระบบ: ${otp_code}`,
        html: htmlBody,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend API error:', result)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: result }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
