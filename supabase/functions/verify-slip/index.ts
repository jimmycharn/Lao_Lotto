import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const slipResponse = await fetch('https://api.slipok.com/api/line/apikey/59644', {
      method: 'POST',
      headers: {
        'x-authorization': 'SLIPOKQDTRH3P'
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
