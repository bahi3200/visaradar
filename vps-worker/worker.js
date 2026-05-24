/**
 * VisaRadar — Real Browser Verification Worker (Playwright + Stealth)
 * 
 * Deploy on a VPS (DigitalOcean / Hetzner / Contabo, etc.)
 * Required env vars (in .env):
 *   SUPABASE_URL=https://frhrvkzkihxaopnsznrj.supabase.co
 *   WORKER_TOKEN=<plain token created via admin UI>
 *   TARGETS_JSON=[{"country_code":"FR","provider":"vfs","url":"https://..."}, ...]
 *   INTERVAL_MINUTES=5
 *
 * Install:
 *   npm install
 *   npx playwright install --with-deps chromium
 *
 * Run as systemd service or pm2:
 *   pm2 start worker.js --name visaradar-worker
 */

import 'dotenv/config'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

chromium.use(stealth())

const SUPABASE_URL = process.env.SUPABASE_URL
const WORKER_TOKEN = process.env.WORKER_TOKEN
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-browser-verification`
const INTERVAL_MS = (parseInt(process.env.INTERVAL_MINUTES || '5', 10)) * 60_000
const RUN_ONCE = process.argv.includes('--once')

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

// Realistic user agents pool
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
]

// Phrases that mean "no appointments available" in multiple languages
const NO_APPT_PHRASES = [
  'no appointment', 'no appointments', 'no slots', 'not available',
  'aucun rendez-vous', 'aucune disponibilité', 'pas de créneau',
  'keine termine', 'nicht verfügbar',
  'no hay citas', 'sin disponibilidad',
  'لا توجد مواعيد', 'غير متاح',
]

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

async function checkTarget(browser, target) {
  const start = Date.now()
  const userAgent = pick(USER_AGENTS)
  const xhrLog = []
  let result = {
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
    user_agent: userAgent,
    error_message: null,
  }

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    },
  })

  const page = await context.newPage()

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
    await page.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 400)
    await sleep(1500 + Math.random() * 1500)
    await page.evaluate(() => window.scrollBy(0, 300))
    await sleep(1000 + Math.random() * 1000)

    // Wait for potential JS-rendered content
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

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
    result.booking_buttons_count = bookingCount

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
      result.available_dates_count = availCount
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
    }
    result.xhr_requests = xhrLog.slice(0, 20)
    result.load_time_ms = Date.now() - start
  } catch (e) {
    result.status = 'error'
    result.error_message = e.message?.slice(0, 500) || String(e)
    result.load_time_ms = Date.now() - start
  } finally {
    await context.close().catch(() => {})
  }

  return result
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

async function runCycle() {
  console.log(`[${new Date().toISOString()}] Starting cycle (${TARGETS.length} targets)`)
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  })
  try {
    for (const target of TARGETS) {
      try {
        console.log(`→ ${target.country_code}/${target.provider}`)
        const result = await checkTarget(browser, target)
        console.log(`  status=${result.status} buttons=${result.booking_buttons_count} dates=${result.available_dates_count}`)
        await sendToSupabase(result)
        await sleep(3000 + Math.random() * 4000)
      } catch (e) {
        console.error(`  Error: ${e.message}`)
      }
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  await runCycle()
  if (RUN_ONCE) return
  setInterval(runCycle, INTERVAL_MS)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })