import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  try {
    let days = 60
    try {
      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}))
        if (typeof body?.days === 'number' && body.days > 0 && body.days <= 365) days = body.days
      }
    } catch { /* ignore */ }

    const { data, error } = await admin.rpc('compute_predictive_windows', { _days: days })
    if (error) throw error
    return new Response(JSON.stringify({ inserted: data, days }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('compute-predictive-windows error:', e)
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})