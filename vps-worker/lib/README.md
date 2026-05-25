# Human Simulation Layer — VPS Worker Modules

Modules to import from `worker.js`. All are stateless and side-effect-free except `metrics.js` which talks to Supabase.

## Integration example

```js
import { humanScroll, humanHoverClick, humanIdle, sleep, randInt } from './lib/humanize.js'
import { maybeVisitHomepage, naturalNavigateTo } from './lib/navigation.js'
import { detectCloudflare, handleCloudflare } from './lib/cloudflare.js'
import { buildFingerprint, applyFingerprint } from './lib/fingerprint.js'
import { geoForCountry, pickGeoMatchedProxy } from './lib/geo.js'
import { loadTimingProfiles, jitteredInterval, actionPause } from './lib/timing.js'
import { getProviderRiskSummary, adaptiveDecision } from './lib/adaptive.js'
import { sendStealthMetrics, pickStealthProfile, isProxyQuarantined } from './lib/metrics.js'

// 1) On startup
const timingMap = await loadTimingProfiles(SUPABASE_URL, SERVICE_KEY)

// 2) Per scan cycle
const profile = await pickStealthProfile(SUPABASE_URL, SERVICE_KEY)
const fp = buildFingerprint()
const geo = geoForCountry(target.country_code)
const timing = timingMap[target.provider] || {}
const risk = await getProviderRiskSummary(SUPABASE_URL, SERVICE_KEY, target.provider)
const { headful, slowdownMultiplier } = adaptiveDecision(timing, risk)

const proxy = pickGeoMatchedProxy(
  availableProxies, target.country_code,
  (p) => !isProxyQuarantined(SUPABASE_URL, SERVICE_KEY, p.label, target.provider),
)

const browser = await chromium.launch({ headless: !headful, proxy: proxy?.config })
const ctx = await browser.newContext({
  userAgent: profile?.user_agent,
  viewport: profile?.viewport || fp.screen,
  locale: geo.locale,
  timezoneId: geo.timezoneId,
  extraHTTPHeaders: { 'Accept-Language': geo.acceptLanguage },
})
await applyFingerprint(ctx, fp)

const page = await ctx.newPage()
const t0 = Date.now()
let outcome = 'success', rotated = false

try {
  await maybeVisitHomepage(page, target.provider, { probability: timing.visit_homepage_prob ?? 0.4 })
  await naturalNavigateTo(page, target.url, { hops: randInt(1, timing.max_hops ?? 3) })

  const cf = await handleCloudflare(page)
  if (cf.rotateFingerprint) { outcome = 'cloudflare'; rotated = true }

  await humanScroll(page, { totalPx: randInt(600, 1800), speed: timing.scroll_speed || 'medium' })
  await sleep(actionPause(timing) * slowdownMultiplier)
  // ... your existing detection logic
} catch (e) {
  outcome = 'error'
} finally {
  await sendStealthMetrics(SUPABASE_URL, SERVICE_KEY, [{
    provider: target.provider,
    country_code: target.country_code,
    stealth_profile_id: profile?.id || null,
    proxy_label: proxy?.label || null,
    headful,
    outcome,
    duration_ms: Date.now() - t0,
    fingerprint_rotated: rotated,
  }])
  await browser.close()
  await sleep(jitteredInterval(timing) * 1000 * slowdownMultiplier)
}
```

## Files

| File | Purpose |
|---|---|
| `humanize.js` | Bezier mouse curves, log-normal idle, variable scroll, focus/blur |
| `navigation.js` | Visit homepage first, multi-hop natural navigation |
| `cloudflare.js` | Detect + wait + rotate-on-fail strategy |
| `fingerprint.js` | GPU/WebGL/fonts/screen/hardware/media spoofing via initScript |
| `geo.js` | Country→timezone/locale/lang matching + proxy geo selection |
| `timing.js` | Per-provider timing profiles + Poisson-ish jitter |
| `adaptive.js` | Headful vs headless decision based on captcha rate |
| `metrics.js` | Report outcomes + pick stealth profile + quarantine lookup |

The VPS worker needs `SUPABASE_SERVICE_ROLE_KEY` set in env to call `ingest-stealth-metrics`.
Restart the worker manually after pulling these files.