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
    const authHeader = req.headers.get('x-worker-token')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing x-worker-token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const tokenHash = await sha256(authHeader)

    const { data: tokenRow } = await admin
      .from('browser_worker_tokens')
      .select('id, worker_name, is_active')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: 'Invalid worker token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const {
      country_code, provider, url, status,
      booking_buttons_count = 0,
      calendar_detected = false,
      available_dates_count = 0,
      no_appointments_text_found = false,
      page_text_snippet = null,
      detection_details = {},
      xhr_requests = [],
      screenshot_base64 = null,
      load_time_ms = null,
      user_agent = null,
      error_message = null,
    } = body

    if (!country_code || !provider || !url || !status) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Upload screenshot if provided
    let screenshot_path: string | null = null
    if (screenshot_base64 && typeof screenshot_base64 === 'string') {
      try {
        const bytes = Uint8Array.from(atob(screenshot_base64), c => c.charCodeAt(0))
        const path = `${country_code}/${provider}/${Date.now()}.png`
        const { error: upErr } = await admin.storage
          .from('browser-screenshots')
          .upload(path, bytes, { contentType: 'image/png', upsert: false })
        if (!upErr) screenshot_path = path
      } catch (e) {
        console.error('Screenshot upload failed:', e)
      }
    }

    const { data: inserted, error: insErr } = await admin
      .from('browser_verifications')
      .insert({
        country_code, provider, url, status,
        booking_buttons_count, calendar_detected, available_dates_count,
        no_appointments_text_found, page_text_snippet, detection_details,
        xhr_requests, screenshot_path, load_time_ms, user_agent,
        worker_id: tokenRow.worker_name, error_message,
      })
      .select('id')
      .single()

    if (insErr) throw insErr

    // Update worker stats
    await admin
      .from('browser_worker_tokens')
      .update({ last_used_at: new Date().toISOString(), total_requests: (tokenRow as any).total_requests ? undefined : undefined })
      .eq('id', tokenRow.id)

    return new Response(JSON.stringify({ success: true, id: inserted.id, screenshot_path }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e: any) {
    console.error('ingest error:', e)
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})