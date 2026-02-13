import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get SlipOK credentials from environment variables
const SLIPOK_URL = Deno.env.get('SLIPOK_URL') || ''
const SLIPOK_API_KEY = Deno.env.get('SLIPOK_API_KEY') || ''

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('files') as File
    const amount = formData.get('amount')

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, message: 'No file provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Forward request to SlipOK API
    const slipFormData = new FormData()
    slipFormData.append('files', file)
    if (amount) {
      slipFormData.append('amount', amount.toString())
    }
    slipFormData.append('log', 'true')

    // Validate environment variables
    if (!SLIPOK_URL || !SLIPOK_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, message: 'SlipOK credentials not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const slipResponse = await fetch(SLIPOK_URL, {
      method: 'POST',
      headers: {
        'x-authorization': SLIPOK_API_KEY
      },
      body: slipFormData
    })

    const slipResult = await slipResponse.json()

    return new Response(
      JSON.stringify(slipResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
