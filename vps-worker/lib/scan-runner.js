/**
 * Orchestrator: per-target scan with profile rotation, human simulation,
 * captcha/cloudflare detection, and adaptive cooldown reporting.
 *
 * Usage from worker.js:
 *   import { runStealthCheck } from './lib/scan-runner.js'
 *   const result = await runStealthCheck({ browser, page, target, supaUrl, token })
 */

import { pickProfilePair } from './profile-rotation.js'
import { detectCloudflare, detectCaptcha } from './cloudflare.js'
import { humanLikeMouseMove, humanLikeScroll, humanIdle } from './humanize.js'
import { maybeVisitHomepage, organicHop } from './navigation.js'

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
    // Sometimes warm up by visiting homepage first
    if (human && Math.random() < (human.visit_homepage_prob ?? 0.35) && target.homepage) {
      await maybeVisitHomepage(page, target.homepage)
      await humanIdle(page, human.idle_avg_ms, human.idle_jitter_ms)
    }

    const resp = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    httpStatus = resp?.status() ?? null

    // Human noise
    await humanLikeMouseMove(page, {
      minSpeed: human?.mouse_speed_min ?? 400,
      maxSpeed: human?.mouse_speed_max ?? 1200,
    })
    await humanLikeScroll(page, human?.scroll_pattern ?? 'natural')
    await humanIdle(page, human?.idle_avg_ms ?? 2200, human?.idle_jitter_ms ?? 1500)

    // Occasionally hop within site
    if (human?.navigation_style === 'explorer' && Math.random() < 0.4) {
      await organicHop(page).catch(() => {})
    }

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