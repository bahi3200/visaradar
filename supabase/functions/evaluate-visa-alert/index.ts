/**
 * Anti-False-Positive gateway.
 * 
 * Call this BEFORE sending any "visa open" alert. It checks 4 layers,
 * computes a weighted confidence score, and either:
 *  - invokes `send-visa-notification` (if score >= threshold and no cooldown)
 *  - blocks and logs the decision
 *
 * POST body: { country_code, provider, category?, title?, message?, source_url? }
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/internalAuth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Settings = {
  enabled: boolean
  threshold: number
  cooldown_minutes: number
  weights: { api: number; dom: number; calendar: number; playwright: number }
  fresh_minutes: number
}

async function loadSettings(admin: any): Promise<Settings> {
  const { data } = await admin
    .from('site_settings')
    .select('key, value')
    .in('key', [
      'antifp_enabled', 'antifp_threshold', 'antifp_cooldown_minutes',
      'antifp_weight_api', 'antifp_weight_dom', 'antifp_weight_calendar',
      'antifp_weight_playwright', 'antifp_fresh_minutes',
    ])
  const map: Record<string, string> = {}
  for (const r of data || []) map[r.key] = r.value
  return {
    enabled: (map.antifp_enabled ?? 'true') === 'true',
    threshold: parseInt(map.antifp_threshold ?? '70', 10),
    cooldown_minutes: parseInt(map.antifp_cooldown_minutes ?? '30', 10),
    fresh_minutes: parseInt(map.antifp_fresh_minutes ?? '15', 10),
    weights: {
      api: parseInt(map.antifp_weight_api ?? '25', 10),
      dom: parseInt(map.antifp_weight_dom ?? '25', 10),
      calendar: parseInt(map.antifp_weight_calendar ?? '25', 10),
      playwright: parseInt(map.antifp_weight_playwright ?? '25', 10),
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const body = await req.json()
    const {
      country_code, provider, category = null,
      title, message, source_url,
      check_only = false,
    } = body
    if (!country_code || !provider) {
      return new Response(JSON.stringify({ error: 'country_code and provider required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const settings = await loadSettings(admin)
    const layerDetails: any = {}

    // Disabled → bypass scoring and just send
    if (!settings.enabled) {
      const { data: alert } = await admin.functions.invoke('send-visa-notification', {
        body: { country_code, provider, category, title, message, source_url }
      })
      await admin.from('alert_decisions').insert({
        country_code, provider, category,
        api_score: 0, dom_score: 0, calendar_score: 0, playwright_score: 0,
        confidence_score: 0, threshold: settings.threshold,
        decision: 'blocked_disabled', block_reason: 'Anti-FP layer disabled, alert sent without scoring',
        layer_details: { bypassed: true },
      })
      return new Response(JSON.stringify({ decision: 'sent', bypassed: true, alert }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const freshCutoff = new Date(Date.now() - settings.fresh_minutes * 60_000).toISOString()

    // === Layer 1: API (recent open event from monitor-visa-sites) ===
    let api_score = 0
    const { data: openEvent } = await admin
      .from('visa_open_events')
      .select('id, opened_at, closed_at, detection_method, response_snippet, category')
      .eq('country_code', country_code)
      .eq('provider', provider)
      .is('closed_at', null)
      .gte('opened_at', freshCutoff)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openEvent) {
      api_score = settings.weights.api // open and fresh → full score
      layerDetails.api = { open_event_id: openEvent.id, opened_at: openEvent.opened_at }
    } else {
      layerDetails.api = { reason: 'no fresh open event in visa_open_events' }
    }

    // === Layer 2: DOM (detection_method quality on the same event) ===
    let dom_score = 0
    if (openEvent?.detection_method) {
      const m = openEvent.detection_method.toLowerCase()
      const strong = ['dom_parse', 'html_parse', 'css_selector', 'json_api']
      const weak = ['keyword', 'text_match', 'regex']
      if (strong.some(s => m.includes(s))) dom_score = settings.weights.dom
      else if (weak.some(s => m.includes(s))) dom_score = Math.round(settings.weights.dom * 0.5)
      else dom_score = Math.round(settings.weights.dom * 0.3)
      layerDetails.dom = { detection_method: openEvent.detection_method, score: dom_score }
    } else {
      layerDetails.dom = { reason: 'no detection_method available' }
    }

    // === Layer 3 + 4: Browser verification (Calendar + Playwright) ===
    let calendar_score = 0
    let playwright_score = 0
    const { data: bv } = await admin
      .from('browser_verifications')
      .select('id, status, calendar_detected, available_dates_count, booking_buttons_count, no_appointments_text_found, checked_at')
      .eq('country_code', country_code)
      .eq('provider', provider)
      .gte('checked_at', freshCutoff)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (bv) {
      // Calendar layer
      if (bv.calendar_detected && bv.available_dates_count > 0) {
        calendar_score = settings.weights.calendar
      } else if (bv.calendar_detected) {
        calendar_score = Math.round(settings.weights.calendar * 0.4)
      }
      layerDetails.calendar = {
        detected: bv.calendar_detected,
        available_dates: bv.available_dates_count,
        score: calendar_score,
      }

      // Playwright layer (overall status)
      if (bv.status === 'open' && !bv.no_appointments_text_found) {
        playwright_score = settings.weights.playwright
      } else if (bv.status === 'open') {
        playwright_score = Math.round(settings.weights.playwright * 0.6) // open but text says no
      } else if (bv.booking_buttons_count > 0) {
        playwright_score = Math.round(settings.weights.playwright * 0.3)
      }
      layerDetails.playwright = {
        status: bv.status,
        booking_buttons: bv.booking_buttons_count,
        no_appointments_text: bv.no_appointments_text_found,
        score: playwright_score,
      }
    } else {
      layerDetails.calendar = { reason: 'no fresh browser_verifications row' }
      layerDetails.playwright = { reason: 'no fresh browser_verifications row' }
    }

    const confidence_score = api_score + dom_score + calendar_score + playwright_score
    const totalWeight =
      settings.weights.api + settings.weights.dom +
      settings.weights.calendar + settings.weights.playwright
    layerDetails.total_weight = totalWeight
    layerDetails.computed_at = new Date().toISOString()

    // Cooldown check
    const cooldownCutoff = new Date(Date.now() - settings.cooldown_minutes * 60_000).toISOString()
    const { data: recentSent } = await admin
      .from('alert_decisions')
      .select('id, created_at')
      .eq('country_code', country_code)
      .eq('provider', provider)
      .eq('decision', 'sent')
      .gte('created_at', cooldownCutoff)
      .limit(1)

    let decision: string
    let block_reason: string | null = null
    let alert_id: string | null = null

    if (recentSent && recentSent.length > 0) {
      decision = 'blocked_cooldown'
      block_reason = `Alert already sent within ${settings.cooldown_minutes} minutes`
    } else if (confidence_score < settings.threshold) {
      decision = 'blocked_low_score'
      block_reason = `Score ${confidence_score} < threshold ${settings.threshold}`
    } else {
      // SEND
      if (check_only) {
        decision = 'sent'
      } else try {
        const { data: alertResp, error: alertErr } = await admin.functions.invoke('send-visa-notification', {
          body: { country_code, provider, category, title, message, source_url, confidence_score }
        })
        if (alertErr) throw alertErr
        decision = 'sent'
        alert_id = (alertResp as any)?.id || null
      } catch (e: any) {
        decision = 'error'
        block_reason = `Send failed: ${e.message || e}`
      }
    }

    const { data: logRow } = await admin.from('alert_decisions').insert({
      country_code, provider, category,
      api_score, dom_score, calendar_score, playwright_score,
      confidence_score, threshold: settings.threshold,
      decision, block_reason, alert_id,
      layer_details: layerDetails,
    }).select('id').single()

    return new Response(JSON.stringify({
      decision, confidence_score, threshold: settings.threshold,
      breakdown: { api_score, dom_score, calendar_score, playwright_score },
      block_reason, decision_id: logRow?.id, layer_details: layerDetails,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('evaluate-visa-alert error:', e)
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})