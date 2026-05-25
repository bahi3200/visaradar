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
    const tokenHash = await sha256(token)
    const { data: tokenRow } = await admin
      .from('browser_worker_tokens')
      .select('id, worker_name, is_active')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()
    if (!tokenRow) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const body = await req.json()
    const {
      country_code, provider, url,
      detection_type, severity = 2,
      blocked_reason = null,
      http_status = null,
      proxy_used = null,
      fingerprint_used = {},
      response_headers = {},
      page_title = null,
      page_text_snippet = null,
      screenshot_base64 = null,
      html_snapshot = null,
    } = body
    if (!country_code || !provider || !url || !detection_type) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let screenshot_path: string | null = null
    let html_snapshot_path: string | null = null
    const stamp = Date.now()

    if (screenshot_base64 && typeof screenshot_base64 === 'string') {
      try {
        const bytes = Uint8Array.from(atob(screenshot_base64), c => c.charCodeAt(0))
        const path = `${provider}/${country_code}/${stamp}.png`
        const { error } = await admin.storage.from('bot-evidence').upload(path, bytes, { contentType: 'image/png', upsert: false })
        if (!error) screenshot_path = path
      } catch (e) { console.error('screenshot upload failed', e) }
    }
    if (html_snapshot && typeof html_snapshot === 'string') {
      try {
        const path = `${provider}/${country_code}/${stamp}.html`
        const { error } = await admin.storage.from('bot-evidence').upload(path, new Blob([html_snapshot], { type: 'text/html' }), { contentType: 'text/html', upsert: false })
        if (!error) html_snapshot_path = path
      } catch (e) { console.error('html upload failed', e) }
    }

    const { data: inserted, error: insErr } = await admin
      .from('bot_detection_events')
      .insert({
        country_code, provider, url, detection_type, severity,
        blocked_reason, http_status, proxy_used, fingerprint_used,
        response_headers, page_title, page_text_snippet,
        screenshot_path, html_snapshot_path,
        worker_id: tokenRow.worker_name,
      })
      .select('id')
      .single()
    if (insErr) throw insErr

    // Update proxy_health (captcha or block bumps cooldown)
    if (proxy_used) {
      const cooldownMin = ['captcha','recaptcha','hcaptcha'].includes(detection_type) ? 30
        : ['block','cloudflare','rate_limit'].includes(detection_type) ? 60 : 10
      const cooldownUntil = new Date(Date.now() + cooldownMin * 60_000).toISOString()
      // upsert
      const { data: existing } = await admin.from('proxy_health')
        .select('id, failure_count, captcha_count')
        .eq('proxy_label', proxy_used).eq('provider', provider).maybeSingle()
      if (existing) {
        await admin.from('proxy_health').update({
          status: 'cooldown',
          cooldown_until: cooldownUntil,
          failure_count: (existing.failure_count || 0) + 1,
          captcha_count: (existing.captcha_count || 0) + (detection_type.includes('captcha') ? 1 : 0),
          last_error: blocked_reason || detection_type,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await admin.from('proxy_health').insert({
          proxy_label: proxy_used, provider, status: 'cooldown', cooldown_until: cooldownUntil,
          failure_count: 1, captcha_count: detection_type.includes('captcha') ? 1 : 0,
          last_error: blocked_reason || detection_type,
        })
      }
    }

    // Recompute risk score
    await admin.rpc('recompute_provider_risk' as any, { _provider: provider })

    return new Response(JSON.stringify({ ok: true, id: inserted.id, screenshot_path, html_snapshot_path }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('ingest-bot-detection error', e)
    return new Response(JSON.stringify({ error: e.message || 'Internal' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})