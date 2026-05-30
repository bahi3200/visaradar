/**
 * VisaRadar — Real Browser Verification Worker (Playwright + Stealth)
 * Advanced Anti-Bot Evasion System (v2)
 *
 * Features:
 *  - playwright-extra + stealth plugin (hides webdriver fingerprints)
 *  - human-like mouse paths, scrolling, typing delays, hover/click jitter
 *  - WebGL / Canvas / timezone / locale / hardware spoofing
 *  - sec-ch-ua + Accept-Language + UA rotation
 *  - random headless/headful switching, random viewport sizes
 *  - smart proxy rotation w/ per-provider pools + cooldown awareness from server
 *  - captcha / cloudflare / rate-limit detection + automatic retry on new proxy
 *  - persistent storageState reuse + cookies across cycles
 *  - adaptive scan interval (provider risk score -> longer interval)
 *  - full evidence capture (screenshot + html + headers) on block
 */

import 'dotenv/config'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import fs from 'node:fs'
import path from 'node:path'
import { detectTlsAvailability } from './lib/tls-detector.js'

chromium.use(stealth())

const SUPABASE_URL = process.env.SUPABASE_URL
const WORKER_TOKEN = process.env.WORKER_TOKEN
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-browser-verification`
const BOT_INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-bot-detection`
const POLICY_URL = `${SUPABASE_URL}/functions/v1/get-scan-policy`
const BASE_INTERVAL_MS = (parseInt(process.env.INTERVAL_MINUTES || '5', 10)) * 60_000
const JITTER_PCT = Math.max(0, Math.min(80, parseFloat(process.env.SCAN_JITTER_PCT || '35')))
const HEADFUL_PROB = Math.max(0, Math.min(1, parseFloat(process.env.HEADFUL_PROBABILITY || '0.15')))
// Providers that MUST always run in headful mode (real visible Chromium)
const HEADFUL_PROVIDERS = new Set(
  (process.env.HEADFUL_PROVIDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
)
// Per-target gap (seconds) — start slow: 20–40s between targets
const BETWEEN_MIN_S = Math.max(1, parseInt(process.env.BETWEEN_TARGET_MIN_S || '20', 10))
const BETWEEN_MAX_S = Math.max(BETWEEN_MIN_S, parseInt(process.env.BETWEEN_TARGET_MAX_S || '40', 10))
// Residential-only enforcement
const REQUIRE_RESIDENTIAL = (process.env.REQUIRE_RESIDENTIAL_PROXY || 'true').toLowerCase() !== 'false'
const RUN_ONCE = process.argv.includes('--once')
const SESSION_DIR = path.resolve('./.sessions')
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })

// === Proxy pools ===
function parseProxyList(raw) {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean)
}
const GLOBAL_PROXIES = parseProxyList(process.env.DECODO_PROXY || process.env.PROXY_URL)
const PROVIDER_POOLS = {}
;(process.env.PROVIDER_PROXY_POOLS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(pair => {
  const m = pair.match(/^([a-zA-Z0-9_-]+)=(.+)$/)
  if (m) {
    PROVIDER_POOLS[m[1].toLowerCase()] = PROVIDER_POOLS[m[1].toLowerCase()] || []
    PROVIDER_POOLS[m[1].toLowerCase()].push(m[2])
  }
})

let _policy = { risk: [], cooldown_proxies: [] }
let _proxyIdx = 0

function poolFor(provider) {
  const p = (provider || '').toLowerCase()
  if (PROVIDER_POOLS[p] && PROVIDER_POOLS[p].length) return PROVIDER_POOLS[p]
  return GLOBAL_PROXIES
}

function isProxyOnCooldown(label, provider) {
  const now = Date.now()
  return (_policy.cooldown_proxies || []).some(c =>
    c.proxy_label === label && c.provider === provider &&
    (!c.cooldown_until || new Date(c.cooldown_until).getTime() > now)
  )
}

function nextProxy(provider, exclude = new Set()) {
  const pool = poolFor(provider)
  if (!pool.length) return null
  for (let i = 0; i < pool.length; i++) {
    const raw = pool[(_proxyIdx + i) % pool.length]
    try {
      const u = new URL(raw)
      // Residential-only: must be tagged residential (in URL/userinfo) or come from a known residential gateway
      const tag = `${raw}`.toLowerCase()
      const isResidential =
        tag.includes('residential') ||
        tag.includes('-resi') ||
        tag.includes('decodo.com') ||      // Decodo residential gateway
        tag.includes('smartproxy') ||
        tag.includes('brightdata') ||
        tag.includes('oxylabs') ||
        tag.includes('iproyal')
      if (REQUIRE_RESIDENTIAL && !isResidential) continue
      const label = `${u.hostname}:${u.port}${u.username ? ':' + u.username.split('-')[0] : ''}`
      if (exclude.has(label)) continue
      if (isProxyOnCooldown(label, provider)) continue
      _proxyIdx = (_proxyIdx + i + 1) % pool.length
      return {
        server: `${u.protocol}//${u.hostname}:${u.port}`,
        username: decodeURIComponent(u.username) || undefined,
        password: decodeURIComponent(u.password) || undefined,
        label,
      }
    } catch (e) {
      console.error('Invalid proxy url:', raw, e.message)
    }
  }
  return null
}

async function refreshPolicy() {
  try {
    const res = await fetch(POLICY_URL, { headers: { 'x-worker-token': WORKER_TOKEN } })
    if (res.ok) _policy = await res.json()
  } catch (e) { console.error('policy fetch failed', e.message) }
}

function providerRisk(provider) {
  const r = (_policy.risk || []).find(x => x.provider === provider)
  return r || { risk_score: 0, recommended_interval_seconds: BASE_INTERVAL_MS / 1000, throttle_until: null }
}

if (!SUPABASE_URL || !WORKER_TOKEN) {
  console.error('Missing SUPABASE_URL or WORKER_TOKEN'); process.exit(1)
}

let TARGETS = []
try {
  TARGETS = JSON.parse(process.env.TARGETS_JSON || '[]')
} catch (e) {
  console.error('Invalid TARGETS_JSON:', e.message); process.exit(1)
}
if (!TARGETS.length) {
  console.error('No targets configured'); process.exit(1)
}

// Realistic fingerprint matrix
const FINGERPRINTS = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: 'Windows', mobile: false, viewport: { width: 1920, height: 1080 },
    locale: 'en-US', tz: 'Europe/Paris', langs: ['en-US','en','fr'],
    webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    deviceMemory: 8, hardwareConcurrency: 12,
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    platform: 'macOS', mobile: false, viewport: { width: 1440, height: 900 },
    locale: 'fr-FR', tz: 'Europe/Paris', langs: ['fr-FR','fr','en'],
    webgl: { vendor: 'Apple Inc.', renderer: 'Apple M2' },
    deviceMemory: 16, hardwareConcurrency: 10,
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    secChUa: '"Microsoft Edge";v="129", "Chromium";v="129", "Not_A Brand";v="24"',
    platform: 'Windows', mobile: false, viewport: { width: 1366, height: 768 },
    locale: 'en-GB', tz: 'Europe/London', langs: ['en-GB','en'],
    webgl: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    deviceMemory: 8, hardwareConcurrency: 8,
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    secChUa: '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="24"',
    platform: 'Linux', mobile: false, viewport: { width: 1680, height: 1050 },
    locale: 'en-US', tz: 'Europe/Berlin', langs: ['en-US','en','de'],
    webgl: { vendor: 'Google Inc. (Mesa)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)' },
    deviceMemory: 16, hardwareConcurrency: 16,
  },
]

// Phrases that mean "no appointments available" in multiple languages
const NO_APPT_PHRASES = [
  'no appointment', 'no appointments', 'no slots', 'not available',
  'aucun rendez-vous', 'aucune disponibilité', 'pas de créneau',
  'keine termine', 'nicht verfügbar',
  'no hay citas', 'sin disponibilidad',
  'لا توجد مواعيد', 'غير متاح',
]

// Captcha / block signatures
const BLOCK_SIGNATURES = [
  { type: 'recaptcha',  re: /(g-recaptcha|recaptcha\/api\.js|grecaptcha)/i },
  { type: 'hcaptcha',   re: /(h-captcha|hcaptcha\.com)/i },
  { type: 'captcha',    re: /(captcha|verify you are human|i'?m not a robot|please verify)/i },
  { type: 'cloudflare', re: /(cf-chl|cloudflare|attention required|just a moment|checking your browser|ray id:)/i },
  { type: 'block',      re: /(access denied|forbidden|blocked|automated traffic|unusual activity|bot detected)/i },
  { type: 'rate_limit', re: /(too many requests|rate ?limit|429)/i },
]
function detectBlock({ status, title, text, html }) {
  const hay = `${title || ''}\n${text || ''}\n${html || ''}`
  for (const sig of BLOCK_SIGNATURES) if (sig.re.test(hay)) return sig.type
  if (status === 403) return 'block'
  if (status === 429) return 'rate_limit'
  if (status === 503 && /cloudflare/i.test(html || '')) return 'cloudflare'
  return null
}

// Selectors hinting at booking buttons
const BOOKING_SELECTORS = [
  'button:has-text("Book")', 'a:has-text("Book")',
  'button:has-text("Réserver")', 'a:has-text("Réserver")',
  'button:has-text("Schedule")', 'button:has-text("Appointment")',
  'button:has-text("Termin")', 'button:has-text("Cita")',
  'button:has-text("احجز")', 'a:has-text("احجز")',
  '[class*="book"]', '[class*="appointment"]', '[id*="book-now"]',
]

// Calendar selectors (common widgets)
const CALENDAR_SELECTORS = [
  '.calendar', '[class*="calendar"]', '[class*="datepicker"]',
  '.fc', '.ui-datepicker', '[role="grid"][aria-label*="alendar"]',
  'table[class*="calendar"]', '[data-testid*="calendar"]',
]

// Available-date cell selectors (not disabled)
const AVAILABLE_DATE_SELECTORS = [
  '.calendar td:not(.disabled):not(.unavailable)',
  '[class*="datepicker"] [class*="available"]',
  'button[class*="day"]:not([disabled]):not([class*="disabled"])',
  'td[class*="enabled"]', '[aria-disabled="false"][role="gridcell"]',
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function jitter(base, pct) {
  const delta = base * (pct / 100)
  return Math.max(1, Math.round(base + (Math.random() * 2 - 1) * delta))
}

// === Human-like behavior ===
async function humanizePage(page) {
  try {
    const vp = page.viewportSize() || { width: 1366, height: 768 }
    // Bezier-ish mouse movement (a few waypoints)
    let x = Math.random() * vp.width, y = Math.random() * vp.height
    const steps = 4 + Math.floor(Math.random() * 4)
    for (let i = 0; i < steps; i++) {
      const nx = Math.random() * vp.width
      const ny = Math.random() * vp.height
      await page.mouse.move(nx, ny, { steps: 8 + Math.floor(Math.random() * 12) })
      await sleep(120 + Math.random() * 380)
      x = nx; y = ny
    }
    // Random scrolls
    const scrolls = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < scrolls; i++) {
      await page.mouse.wheel(0, 150 + Math.random() * 600)
      await sleep(400 + Math.random() * 1200)
    }
    // Occasional scroll back up
    if (Math.random() < 0.4) {
      await page.mouse.wheel(0, -(200 + Math.random() * 500))
      await sleep(300 + Math.random() * 700)
    }
    // Hover something visible
    if (Math.random() < 0.5) {
      const el = await page.$('a, button')
      if (el) { await el.hover().catch(() => {}); await sleep(200 + Math.random() * 600) }
    }
  } catch {}
}

// Realistic typing for any input we may need
async function humanType(page, selector, text) {
  const el = await page.$(selector)
  if (!el) return false
  await el.click({ delay: 50 + Math.random() * 100 }).catch(() => {})
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 60 + Math.random() * 140 })
  }
  return true
}

// Spoofing init script (runs before any page script)
function spoofScript(fp) {
  const langsJson = JSON.stringify(fp.langs)
  return `
    (() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'languages', { get: () => ${langsJson} });
        Object.defineProperty(navigator, 'platform', { get: () => '${fp.platform === 'Windows' ? 'Win32' : fp.platform === 'macOS' ? 'MacIntel' : 'Linux x86_64'}' });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory} });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} });
        // userAgentData (sec-ch-ua)
        if (navigator.userAgentData) {
          Object.defineProperty(navigator, 'userAgentData', {
            get: () => ({
              brands: [
                { brand: 'Google Chrome', version: '131' },
                { brand: 'Chromium', version: '131' },
                { brand: 'Not_A Brand', version: '24' },
              ],
              mobile: ${fp.mobile},
              platform: '${fp.platform}',
              getHighEntropyValues: () => Promise.resolve({ platform: '${fp.platform}', mobile: ${fp.mobile}, architecture: 'x86', bitness: '64', model: '', platformVersion: '15.0.0' }),
            }),
          });
        }
        // WebGL vendor/renderer spoof
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(p) {
          if (p === 37445) return '${fp.webgl.vendor}';
          if (p === 37446) return '${fp.webgl.renderer}';
          return getParameter.call(this, p);
        };
        if (typeof WebGL2RenderingContext !== 'undefined') {
          const gp2 = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function(p) {
            if (p === 37445) return '${fp.webgl.vendor}';
            if (p === 37446) return '${fp.webgl.renderer}';
            return gp2.call(this, p);
          };
        }
        // Canvas fingerprint: subtle noise
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          try {
            const ctx = this.getContext('2d');
            if (ctx && this.width && this.height) {
              const img = ctx.getImageData(0, 0, this.width, this.height);
              for (let i = 0; i < img.data.length; i += 97) img.data[i] = (img.data[i] + 1) & 0xff;
              ctx.putImageData(img, 0, 0);
            }
          } catch {}
          return toDataURL.apply(this, args);
        };
        // Hide chrome.runtime automation hint
        if (window.chrome) { Object.defineProperty(window.chrome, 'runtime', { get: () => undefined }); }
      } catch (e) {}
    })();
  `
}

function sessionPath(target, proxyLabel) {
  const safe = `${target.country_code}-${target.provider}-${(proxyLabel || 'noproxy').replace(/[^a-z0-9_-]/gi, '_')}.json`
  return path.join(SESSION_DIR, safe)
}
function loadStorageState(target, proxyLabel) {
  try {
    const p = sessionPath(target, proxyLabel)
    if (fs.existsSync(p)) {
      const st = JSON.parse(fs.readFileSync(p, 'utf-8'))
      // expire after 24h
      if (st.__saved_at && Date.now() - st.__saved_at < 24 * 3600_000) return st
    }
  } catch {}
  return undefined
}
async function saveStorageState(context, target, proxyLabel) {
  try {
    const st = await context.storageState()
    st.__saved_at = Date.now()
    fs.writeFileSync(sessionPath(target, proxyLabel), JSON.stringify(st))
  } catch {}
}

async function checkTargetOnce(browser, target, opts) {
  const start = Date.now()
  const fp = opts.fp
  const proxy = opts.proxy
  const xhrLog = []
  const result = {
    country_code: target.country_code,
    provider: target.provider,
    url: target.url,
    status: 'unknown',
    booking_buttons_count: 0,
    calendar_detected: false,
    available_dates_count: 0,
    no_appointments_text_found: false,
    page_text_snippet: null,
    detection_details: {},
    xhr_requests: [],
    screenshot_base64: null,
    load_time_ms: 0,
    user_agent: fp.ua,
    error_message: null,
    proxy_used: proxy ? proxy.label : null,
    blocked: null,
    block_evidence: null,
  }

  const storageState = loadStorageState(target, proxy?.label)
const ctxOpts = {
  ignoreHTTPSErrors: true,
  userAgent: fp.ua,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.tz,
    proxy: proxy ? { server: proxy.server, username: proxy.username, password: proxy.password } : undefined,
    extraHTTPHeaders: {
      'Accept-Language': fp.langs.map((l, i) => `${l}${i ? ';q=' + (0.9 - i*0.1).toFixed(1) : ''}`).join(','),
      'sec-ch-ua': fp.secChUa,
      'sec-ch-ua-mobile': fp.mobile ? '?1' : '?0',
      'sec-ch-ua-platform': `"${fp.platform}"`,
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
    },
    ...(storageState ? { storageState } : {}),
  }

  const context = await browser.newContext(ctxOpts)
  await context.addInitScript({ content: spoofScript(fp) })
  const page = await context.newPage()

  let mainResponse = null
  page.on('response', (resp) => { if (resp.url() === target.url || resp.url().startsWith(target.url)) mainResponse = mainResponse || resp })

  // Network interception
  page.on('response', async (resp) => {
    try {
      const url = resp.url()
      const ct = resp.headers()['content-type'] || ''
      if (ct.includes('json') && (url.includes('slot') || url.includes('appointment') || url.includes('availab') || url.includes('book') || url.includes('calendar'))) {
        xhrLog.push({ url, status: resp.status(), contentType: ct })
      }
    } catch {}
  })

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })

    // Human-like behavior
    await humanizePage(page)

    // Wait for potential JS-rendered content
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // === Block / captcha detection FIRST ===
    const httpStatus = mainResponse ? mainResponse.status() : null
    const respHeaders = mainResponse ? mainResponse.headers() : {}
    const titleNow = await page.title().catch(() => '')
    const htmlNow = await page.content().catch(() => '')
    const textNow = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 5000)
    const blockType = detectBlock({ status: httpStatus, title: titleNow, text: textNow, html: htmlNow })
    if (blockType) {
      result.status = 'blocked'
      result.blocked = blockType
      const buf = await page.screenshot({ fullPage: false, type: 'png' }).catch(() => null)
      result.block_evidence = {
        detection_type: blockType,
        severity: ['captcha','recaptcha','hcaptcha','cloudflare'].includes(blockType) ? 4 : 3,
        http_status: httpStatus,
        page_title: titleNow,
        page_text_snippet: textNow.slice(0, 1500),
        response_headers: respHeaders,
        screenshot_base64: buf ? buf.toString('base64') : null,
        html_snapshot: htmlNow.slice(0, 200_000),
        fingerprint_used: { ua: fp.ua, platform: fp.platform, tz: fp.tz, viewport: fp.viewport, webgl: fp.webgl },
      }
      result.load_time_ms = Date.now() - start
      return result
    }

    // === TLS / VFS / BLS — enhanced multi-stage detection ===
    // Runs deep selector scan across iframes + shadow DOM, with
    // SPA-hydration waits and structured failure reasons.
    let tlsDeep = null
    try {
      tlsDeep = await detectTlsAvailability(page, { provider: target.provider })
    } catch (e) {
      tlsDeep = { failureReason: 'unexpected_layout', error: String(e?.message || e) }
    }

    // Count booking buttons (use multiple selectors, dedupe by element handle)
    let bookingCount = 0
    const seenBtns = new Set()
    for (const sel of BOOKING_SELECTORS) {
      try {
        const els = await page.$$(sel)
        for (const el of els) {
          const visible = await el.isVisible().catch(() => false)
          if (!visible) continue
          const box = await el.boundingBox().catch(() => null)
          const key = box ? `${Math.round(box.x)}-${Math.round(box.y)}` : Math.random().toString()
          if (seenBtns.has(key)) continue
          seenBtns.add(key)
          bookingCount++
        }
      } catch {}
    }
    // Merge: take the max of legacy count and deep-frame/shadow count.
    result.booking_buttons_count = Math.max(bookingCount, tlsDeep?.buttons || 0)

    // Calendar detection
    let calendarFound = false
    for (const sel of CALENDAR_SELECTORS) {
      try {
        const el = await page.$(sel)
        if (el && (await el.isVisible().catch(() => false))) {
          calendarFound = true
          break
        }
      } catch {}
    }
    result.calendar_detected = calendarFound

    // Available dates count
    if (calendarFound) {
      let availCount = 0
      for (const sel of AVAILABLE_DATE_SELECTORS) {
        try {
          const n = (await page.$$(sel)).length
          if (n > availCount) availCount = n
        } catch {}
      }
      result.available_dates_count = Math.max(availCount, tlsDeep?.dates || 0)
    } else {
      // Even without legacy calendar match, deep detector may have found dates.
      result.available_dates_count = tlsDeep?.dates || 0
    }

    // Page text + "no appointments" check
    const bodyText = (await page.evaluate(() => document.body?.innerText || '')).toLowerCase()
    result.page_text_snippet = bodyText.slice(0, 2000)
    result.no_appointments_text_found = NO_APPT_PHRASES.some(p => bodyText.includes(p.toLowerCase()))

    // Status decision
    if (result.calendar_detected && result.available_dates_count > 0) {
      result.status = 'open'
    } else if (result.booking_buttons_count > 0 && !result.no_appointments_text_found) {
      result.status = 'open'
    } else if (result.no_appointments_text_found) {
      result.status = 'closed'
    } else {
      result.status = 'closed'
    }

    // Screenshot on detection of "open"
    if (result.status === 'open') {
      const buf = await page.screenshot({ fullPage: false, type: 'png' })
      result.screenshot_base64 = buf.toString('base64')
    }

    result.detection_details = {
      checked_selectors: BOOKING_SELECTORS.length + CALENDAR_SELECTORS.length,
      body_length: bodyText.length,
      title: await page.title().catch(() => null),
      fingerprint: { platform: fp.platform, tz: fp.tz, viewport: fp.viewport, headful: opts.headful },
      proxy: proxy?.label || null,
      tls: tlsDeep ? {
        deep_buttons: tlsDeep.buttons,
        deep_dates: tlsDeep.dates,
        iframe_detected: tlsDeep.iframeDetected,
        widget_mounted: tlsDeep.widgetMounted,
        empty_state: tlsDeep.emptyState,
        failure_reason: tlsDeep.failureReason,
        stages: tlsDeep.stages,
      } : null,
    }

    // Snapshot raw HTML on failed cycles (buttons=0 AND dates=0)
    if (result.booking_buttons_count === 0 && result.available_dates_count === 0 && tlsDeep?.htmlSnapshot) {
      result.detection_details.failure_reason = tlsDeep.failureReason
      result.detection_details.html_snapshot = tlsDeep.htmlSnapshot
      result.error_message = result.error_message || `tls_detect:${tlsDeep.failureReason}`
      // Mark cycle status as error so admin dashboards surface it for triage.
      if (result.status !== 'open') result.status = 'error'
      console.warn(`  ⚠ TLS detect failed reason=${tlsDeep.failureReason} stages=${(tlsDeep.stages||[]).join('>')}`)
    }
    result.xhr_requests = xhrLog.slice(0, 20)
    result.load_time_ms = Date.now() - start

    // Persist session for reuse
    await saveStorageState(context, target, proxy?.label)
  } catch (e) {
    result.status = 'error'
    result.error_message = (e.message?.slice(0, 500) || String(e)) + (proxy ? ` [via ${proxy.label}]` : '')
    result.load_time_ms = Date.now() - start
  } finally {
    await context.close().catch(() => {})
  }

  return result
}

// Wrapper with smart retry on block/captcha using fresh proxy + fingerprint
async function checkTarget(target, headfulProb) {
  const triedProxies = new Set()
  const maxAttempts = 3
  const forceHeadful = HEADFUL_PROVIDERS.has((target.provider || '').toLowerCase())
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fp = pick(FINGERPRINTS)
    const proxy = nextProxy(target.provider, triedProxies)
    // Residential-only: skip scan entirely if no usable proxy
    if (!proxy && REQUIRE_RESIDENTIAL) {
      console.warn(`  SKIP ${target.country_code}/${target.provider}: no healthy residential proxy available`)
      return {
        country_code: target.country_code, provider: target.provider, url: target.url,
        status: 'skipped', error_message: 'no_residential_proxy_available',
        proxy_used: null, load_time_ms: 0, user_agent: fp.ua,
        booking_buttons_count: 0, calendar_detected: false, available_dates_count: 0,
        no_appointments_text_found: false, page_text_snippet: null, detection_details: {},
        xhr_requests: [], screenshot_base64: null,
      }
    }
    if (proxy) triedProxies.add(proxy.label)
    const headful = forceHeadful || (Math.random() < headfulProb)
const browser = await chromium.launch({
  headless: !headful,
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--allow-running-insecure-content',
    '--disable-web-security',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-features=IsolateOrigins,site-per-process',
    `--window-size=${fp.viewport.width},${fp.viewport.height}`,
  ],
})
    try {
      const result = await checkTargetOnce(browser, target, { fp, proxy, headful })
      if (result.status !== 'blocked') return result
      console.warn(`  [attempt ${attempt}] blocked=${result.blocked} proxy=${proxy?.label}; retrying with new proxy+fp`)
      // Report the block to backend
      await sendBotEvent(target, result)
      if (attempt === maxAttempts) return result
      await sleep(2000 + Math.random() * 3000)
    } finally {
      await browser.close().catch(() => {})
    }
  }
}

async function sendToSupabase(result) {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': WORKER_TOKEN,
    },
    body: JSON.stringify(result),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error(`Ingest failed [${res.status}]:`, txt)
    return false
  }
  return true
}

async function sendBotEvent(target, result) {
  if (!result.block_evidence) return
  try {
    await fetch(BOT_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-token': WORKER_TOKEN },
      body: JSON.stringify({
        country_code: target.country_code,
        provider: target.provider,
        url: target.url,
        detection_type: result.block_evidence.detection_type,
        severity: result.block_evidence.severity,
        blocked_reason: result.block_evidence.detection_type,
        http_status: result.block_evidence.http_status,
        proxy_used: result.proxy_used,
        fingerprint_used: result.block_evidence.fingerprint_used,
        response_headers: result.block_evidence.response_headers,
        page_title: result.block_evidence.page_title,
        page_text_snippet: result.block_evidence.page_text_snippet,
        screenshot_base64: result.block_evidence.screenshot_base64,
        html_snapshot: result.block_evidence.html_snapshot,
      }),
    })
  } catch (e) { console.error('bot ingest failed', e.message) }
}

async function runCycle() {
  console.log(`[${new Date().toISOString()}] Starting cycle (${TARGETS.length} targets)`)
  await refreshPolicy()
  // Shuffle targets for unpredictability
  const order = [...TARGETS].sort(() => Math.random() - 0.5)
  for (const target of order) {
    try {
      const risk = providerRisk(target.provider)
      if (risk.throttle_until && new Date(risk.throttle_until).getTime() > Date.now()) {
        console.log(`→ ${target.country_code}/${target.provider} THROTTLED until ${risk.throttle_until} (risk=${risk.risk_score})`)
        continue
      }
      // Adaptive headful probability: higher risk -> more headful
      const adaptiveHeadful = Math.min(0.6, HEADFUL_PROB + (Number(risk.risk_score || 0) / 200))
      console.log(`→ ${target.country_code}/${target.provider} (risk=${risk.risk_score} headful_p=${adaptiveHeadful.toFixed(2)})`)
      const result = await checkTarget(target, adaptiveHeadful)
      const det = result.detection_details || {}
      const tls = det.tls || {}
      const reason = det.failure_reason || tls.failure_reason || result.error_message || '-'
      const stages = (tls.stages || []).join('>') || '-'
      const snapLen = det.html_snapshot ? det.html_snapshot.length : 0
      console.log(`  status=${result.status} buttons=${result.booking_buttons_count} dates=${result.available_dates_count} proxy=${result.proxy_used || '-'}${result.blocked ? ' BLOCKED='+result.blocked : ''}`)
      console.log(`  detector reason=${reason} stages=${stages} widget_mounted=${tls.widget_mounted ?? '-'} iframe=${tls.iframe_detected ?? '-'} empty_state=${tls.empty_state ?? '-'} deep_buttons=${tls.deep_buttons ?? 0} deep_dates=${tls.deep_dates ?? 0} html_snapshot_bytes=${snapLen}`)
      await sendToSupabase(result)
      // Per-target gap: 20–40s by default (configurable)
      const gapMs = (BETWEEN_MIN_S + Math.random() * (BETWEEN_MAX_S - BETWEEN_MIN_S)) * 1000
      console.log(`  waiting ${(gapMs/1000).toFixed(0)}s before next target`)
      await sleep(gapMs)
    } catch (e) {
      console.error(`  Error: ${e.message}`)
    }
  }
}

function nextDelayMs() {
  // Use the highest recommended interval among providers as the base, plus jitter
  const recs = (_policy.risk || []).map(r => (r.recommended_interval_seconds || 300) * 1000)
  const base = recs.length ? Math.max(BASE_INTERVAL_MS, Math.max(...recs)) : BASE_INTERVAL_MS
  return jitter(base, JITTER_PCT)
}

async function main() {
  await runCycle()
  if (RUN_ONCE) return
  const loop = async () => {
    const delay = nextDelayMs()
    console.log(`Next cycle in ${(delay/1000).toFixed(0)}s`)
    setTimeout(async () => { try { await runCycle() } catch (e) { console.error(e) } finally { loop() } }, delay)
  }
  loop()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })