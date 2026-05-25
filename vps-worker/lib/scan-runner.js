/**
 * Orchestrator: per-target scan with profile rotation, human simulation,
 * captcha/cloudflare detection, and adaptive cooldown reporting.
 *
 * Usage from worker.js:
 *   import { runStealthCheck } from './lib/scan-runner.js'
 *   const result = await runStealthCheck({ browser, page, target, supaUrl, token })
 */

import { pickProfilePair } from './profile-rotation.js'
import { detectCloudflare } from './cloudflare.js'
import { humanIdle, humanMouseMove, humanScroll, humanFocusBlur } from './humanize.js'
import { maybeVisitHomepage, naturalNavigateTo } from './navigation.js'

async function detectCaptcha(page) {
  try {
    const html = await page.content()
    return /recaptcha|hcaptcha|g-recaptcha|cf-challenge|captcha/i.test(html)
  } catch { return false }
}

async function reportMetric(supaUrl, token, payload) {
  try {
    await fetch(`${supaUrl}/functions/v1/ingest-stealth-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
  } catch {}
}

async function reportCaptchaEvent(supaUrl, token, provider, country, kind) {
  try {
    await fetch(`${supaUrl}/functions/v1/ingest-bot-detection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ provider, country, kind, source: 'scan-runner' }),
    })
  } catch {}
}

export async function runStealthCheck({ page, target, supaUrl, token, proxyLabel }) {
  const startedAt = Date.now()
  const { stealth, human } = await pickProfilePair(supaUrl, token, {
    provider: target.provider,
    country: target.country,
  })

  let outcome = 'success'
  let httpStatus = null
  let cloudflare = false
  let captcha = false
  let errorMsg = null

  try {
    const homepageProb = human?.visit_homepage_prob ?? 0.35
    if (target.homepage && Math.random() < homepageProb) {
      await maybeVisitHomepage(page, target.homepage, { probability: 1 }).catch(() => {})
      await page.waitForTimeout(humanIdle(human?.idle_avg_ms ?? 2000, (human?.idle_avg_ms ?? 2000) + (human?.idle_jitter_ms ?? 1500)))
    }

    let resp
    if (human?.navigation_style === 'explorer') {
      resp = await naturalNavigateTo(page, target.url, { hops: 2 }).catch(() => null)
    } else {
      resp = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    }
    httpStatus = resp?.status?.() ?? null

    // Human noise
    const vp = page.viewportSize() || { width: 1280, height: 720 }
    await humanMouseMove(page, Math.random()*vp.width, Math.random()*vp.height, Math.random()*vp.width, Math.random()*vp.height, 'medium').catch(()=>{})
    await humanScroll(page, { totalPx: 800 + Math.floor(Math.random()*1200), speed: human?.scroll_pattern === 'fast' ? 'fast' : 'medium' }).catch(()=>{})
    if (Math.random() < (human?.hover_prob ?? 0.5)) await humanFocusBlur(page).catch(()=>{})
    await page.waitForTimeout(humanIdle(human?.idle_avg_ms ?? 2000, (human?.idle_avg_ms ?? 2000) + (human?.idle_jitter_ms ?? 1500)))

    // Detection
    cloudflare = await detectCloudflare(page)
    captcha = await detectCaptcha(page)

    if (httpStatus === 403 || httpStatus === 429) outcome = 'block'
    else if (cloudflare) outcome = 'cloudflare'
    else if (captcha) outcome = 'captcha'
    else outcome = 'success'
  } catch (e) {
    outcome = 'error'
    errorMsg = String(e?.message || e).slice(0, 500)
  }

  const durationMs = Date.now() - startedAt

  // Persist metric
  await reportMetric(supaUrl, token, {
    provider: target.provider,
    country: target.country,
    stealth_profile_id: stealth?.id ?? null,
    human_profile_id: human?.id ?? null,
    proxy_label: proxyLabel ?? null,
    headful: false,
    outcome,
    duration_ms: durationMs,
    http_status: httpStatus,
    cloudflare_detected: cloudflare,
    fingerprint_rotated: true,
    retry_count: 0,
    error: errorMsg,
    fingerprint_success: outcome === 'success',
    captcha_seen: captcha,
  })

  // Escalate cooldown on captcha/block/cloudflare
  if (['captcha', 'cloudflare', 'block'].includes(outcome)) {
    await reportCaptchaEvent(supaUrl, token, target.provider, target.country, outcome)
  }

  return { outcome, httpStatus, cloudflare, captcha, durationMs, stealthProfile: stealth, humanProfile: human, error: errorMsg }
}