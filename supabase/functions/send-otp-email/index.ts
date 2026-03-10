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

    const deviceText = device_info ? `<p style="color: #666; font-size: 13px;">อุปกรณ์ที่พยายามเข้าสู่ระบบ: ${device_info}</p>` : ''

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
        .info { color: #555; font-size: 14px; line-height: 1.6; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 13px; color: #856404; }
        .footer { text-align: center; margin-top: 24px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 ${APP_NAME}</h1>
          <p style="color: #666;">รหัสยืนยันการเข้าสู่ระบบ</p>
        </div>
        
        <p class="info">มีการพยายามเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์ใหม่ กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยัน:</p>
        
        <div class="otp-box">
          <p class="otp-code">${otp_code}</p>
        </div>
        
        <p class="info">
          ⏰ รหัสนี้จะหมดอายุใน <strong>5 นาที</strong><br>
          🔒 สามารถกรอกผิดได้สูงสุด <strong>3 ครั้ง</strong>
        </p>
        
        ${deviceText}
        
        <div class="warning">
          ⚠️ หากคุณไม่ได้เป็นคนเข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที
        </div>
        
        <div class="footer">
          <p>อีเมลนี้ถูกส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ</p>
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
        subject: `[${APP_NAME}] รหัสยืนยัน OTP: ${otp_code}`,
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
