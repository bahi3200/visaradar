/**
 * TLScontact (and visa-portal) DOM detection — production hardened.
 *
 * Provides:
 *   - region-aware selectors (Italy / Spain / Algeria + generic)
 *   - iframe + shadow DOM traversal
 *   - multi-stage waitForSelector strategy
 *   - SPA hydration + widget-mounted checks
 *   - structured failure reasons:
 *       selector_not_found | dom_not_ready | iframe_detected
 *       unexpected_layout  | empty_availability_state | ok
 */

// ---------- Selector matrices ----------

// Booking / "schedule appointment" buttons across TLScontact regional skins.
export const TLS_BUTTON_SELECTORS = [
  // Generic TLS / VFS / BLS
  'a[href*="appointment"]',
  'a[href*="book"]',
  'a[href*="schedule"]',
  'button[data-testid*="appointment"]',
  'button[data-testid*="book"]',
  'button[class*="appointment" i]',
  'button[class*="book" i]',
  'button[class*="schedule" i]',
  '[class*="cta" i] a',
  // TLScontact specific (observed)
  '.tls-button--primary',
  '.tls-cta',
  'a.book-now',
  'button.book-now',
  '[data-qa="book-appointment"]',
  '[data-qa="schedule-appointment"]',
  // Italy centers (visas-it.tlscontact.com)
  'a:has-text("Prenota")',
  'button:has-text("Prenota")',
  'a:has-text("Appuntamento")',
  // Spain (visas-es.tlscontact.com)
  'a:has-text("Reservar")',
  'button:has-text("Reservar")',
  'a:has-text("Cita")',
  // Algeria (visas-dz.tlscontact.com — FR + AR)
  'a:has-text("Réserver")',
  'button:has-text("Réserver")',
  'a:has-text("Rendez-vous")',
  'a:has-text("احجز")',
  'button:has-text("احجز")',
  // Fallback i18n
  'button:has-text("Book")',
  'a:has-text("Book")',
  'button:has-text("Schedule")',
  'button:has-text("Termin")',
]

// Available date cells across TLS variants
export const TLS_DATE_SELECTORS = [
  '[data-qa="available-date"]',
  '[data-testid="available-date"]',
  '.calendar-day--available',
  '.day--available',
  '.tls-calendar [class*="available"]',
  '.tls-calendar td:not(.disabled):not(.unavailable)',
  'button.day:not([disabled]):not(.disabled)',
  'button[data-day]:not([disabled])',
  '[role="gridcell"][aria-disabled="false"]',
  '[role="button"][aria-disabled="false"][data-date]',
]

// Widget / SPA mount sentinels
export const TLS_WIDGET_SELECTORS = [
  '#root',
  '#app',
  '[data-reactroot]',
  '[data-qa="appointment-widget"]',
  '.tls-appointment',
  '.appointment-widget',
  '.tls-calendar',
]

export const TLS_EMPTY_STATE_PHRASES = [
  'no appointment', 'no appointments', 'no slots available',
  'aucun rendez-vous', 'aucune disponibilité',
  'nessun appuntamento', 'nessuna disponibilità',
  'no hay citas', 'sin disponibilidad',
  'لا توجد مواعيد متاحة', 'لا توجد مواعيد',
]

// ---------- Frame + Shadow DOM traversal ----------

/**
 * Run a query across the main page, every same/cross-origin frame,
 * and every shadow root we can reach. Returns the total count.
 */
export async function deepCountSelectors(page, selectors) {
  let total = 0
  const frames = page.frames()
  for (const frame of frames) {
    for (const sel of selectors) {
      try {
        const n = await frame.locator(sel).count()
        total += n
      } catch {}
    }
    // Shadow DOM walk inside this frame
    try {
      const shadowCount = await frame.evaluate((sels) => {
        const out = { n: 0 }
        const visit = (root) => {
          for (const sel of sels) {
            try { out.n += root.querySelectorAll(sel).length } catch {}
          }
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
          let node = walker.currentNode
          while (node) {
            if (node.shadowRoot) visit(node.shadowRoot)
            node = walker.nextNode()
          }
        }
        try { visit(document) } catch {}
        return out.n
      }, selectors)
      total += shadowCount
    } catch {}
  }
  return total
}

// ---------- Multi-stage waiting ----------

export async function waitForTlsReady(page, { maxMs = 25_000 } = {}) {
  const stages = []
  // Stage 1: DOM content
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 })
    stages.push('domcontentloaded')
  } catch { return { ready: false, reason: 'dom_not_ready', stages } }

  // Stage 2: network idle (best effort)
  try {
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    stages.push('networkidle')
  } catch { stages.push('networkidle_timeout') }

  // Stage 3: SPA root mounted
  let mounted = false
  for (const sel of TLS_WIDGET_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 2_000, state: 'attached' })
      mounted = true
      stages.push(`mounted:${sel}`)
      break
    } catch {}
  }
  if (!mounted) return { ready: false, reason: 'dom_not_ready', stages }

  // Stage 4: hydration — wait until body text has meaningful length
  try {
    await page.waitForFunction(
      () => (document.body?.innerText || '').trim().length > 200,
      { timeout: 8_000 },
    )
    stages.push('hydrated')
  } catch { stages.push('hydration_timeout') }

  // Stage 5: settle
  await page.waitForTimeout(800 + Math.random() * 1200)
  return { ready: true, reason: 'ok', stages }
}

// ---------- Main detector ----------

/**
 * Returns:
 *   {
 *     buttons, dates,
 *     iframeDetected, widgetMounted,
 *     emptyState, failureReason,
 *     stages, htmlSnapshot (only when buttons=0 && dates=0)
 *   }
 */
export async function detectTlsAvailability(page, { provider = 'tls' } = {}) {
  const out = {
    buttons: 0,
    dates: 0,
    iframeDetected: false,
    widgetMounted: false,
    emptyState: false,
    failureReason: 'ok',
    stages: [],
    htmlSnapshot: null,
  }

  const ready = await waitForTlsReady(page)
  out.stages = ready.stages
  out.widgetMounted = ready.ready
  if (!ready.ready) {
    out.failureReason = ready.reason
  }

  // Iframe detection — booking widget often lives in one
  const frames = page.frames()
  out.iframeDetected = frames.length > 1

  // Deep count across frames + shadow DOM
  try { out.buttons = await deepCountSelectors(page, TLS_BUTTON_SELECTORS) } catch {}
  try { out.dates = await deepCountSelectors(page, TLS_DATE_SELECTORS) } catch {}

  // Empty-state text check
  try {
    const body = (await page.evaluate(() => document.body?.innerText || '')).toLowerCase()
    out.emptyState = TLS_EMPTY_STATE_PHRASES.some(p => body.includes(p.toLowerCase()))
  } catch {}

  // Decide failure reason if nothing found
  if (out.buttons === 0 && out.dates === 0 && out.failureReason === 'ok') {
    if (out.emptyState) out.failureReason = 'empty_availability_state'
    else if (out.iframeDetected) out.failureReason = 'iframe_detected'
    else if (!out.widgetMounted) out.failureReason = 'dom_not_ready'
    else out.failureReason = 'selector_not_found'
  }

  // Snapshot HTML on any failed cycle for offline forensics
  if (out.buttons === 0 && out.dates === 0) {
    try {
      const html = await page.content()
      out.htmlSnapshot = html.slice(0, 250_000)
    } catch {}
  }

  // Heuristic for unexpected layout: widget mounted but extremely small body
  if (out.failureReason === 'selector_not_found') {
    try {
      const len = await page.evaluate(() => (document.body?.innerText || '').length)
      if (len < 400) out.failureReason = 'unexpected_layout'
    } catch {}
  }

  return out
}