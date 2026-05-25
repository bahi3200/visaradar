import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = req.headers.get('x-worker-token')
    if (!token) return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const hash = await sha256(token)
    const { data: tok } = await admin.from('browser_worker_tokens').select('id').eq('token_hash', hash).eq('is_active', true).maybeSingle()
    if (!tok) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: risk } = await admin.from('provider_risk_scores').select('*')
    const { data: cooldown } = await admin.from('proxy_health')
      .select('proxy_label, provider, status, cooldown_until')
      .or('status.eq.cooldown,status.eq.unhealthy')
    return new Response(JSON.stringify({
      ok: true,
      risk: risk || [],
      cooldown_proxies: cooldown || [],
      server_time: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})