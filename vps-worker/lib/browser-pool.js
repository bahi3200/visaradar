/**
 * Minimal browser pool with profile-aware context creation.
 * Reuses a single Chrome instance and rotates incognito contexts per scan.
 */

import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

chromium.use(stealth())

let _browser = null

export async function getBrowser({ headful = false, proxy = null } = {}) {
  if (_browser && _browser.isConnected()) return _browser
  _browser = await chromium.launch({
    headless: !headful,
    channel: 'chrome', // real Chrome stable (fallback to chromium if not installed)
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    proxy: proxy ? { server: proxy } : undefined,
  }).catch(async () => {
    // Fallback to default channel if chrome stable isn't available
    return chromium.launch({
      headless: !headful,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      proxy: proxy ? { server: proxy } : undefined,
    })
  })
  return _browser
}

export async function newStealthContext(browser, stealthProfile, humanProfile) {
  const ua = stealthProfile?.user_agent
  const viewport = {
    width: stealthProfile?.viewport_width ?? 1366,
    height: stealthProfile?.viewport_height ?? 768,
  }
  const locale = stealthProfile?.locale ?? 'en-US'
  const timezone = stealthProfile?.timezone ?? 'Europe/Paris'

  const ctx = await browser.newContext({
    userAgent: ua,
    viewport,
    locale,
    timezoneId: timezone,
    deviceScaleFactor: 1,
    bypassCSP: false,
    javaScriptEnabled: true,
    extraHTTPHeaders: {
      'Accept-Language': `${locale},en;q=0.8`,
    },
  })

  // Extra fingerprint hardening
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
    Object.defineProperty(navigator, 'plugins', {
      get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }],
    })
    // WebGL vendor spoof
    const getParameter = WebGLRenderingContext.prototype.getParameter
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Intel Inc.'
      if (p === 37446) return 'Intel Iris OpenGL Engine'
      return getParameter.call(this, p)
    }
  })

  return ctx
}

export async function closeBrowser() {
  if (_browser) {
    try { await _browser.close() } catch {}
    _browser = null
  }
}