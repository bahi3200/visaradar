import { sleep, humanIdle } from './humanize.js';

/**
 * Advanced block-detection signals.
 * Returns a normalized object: { detected, kind, confidence, signals[], reason }
 * Kinds: cloudflare | captcha | waf | rate_limit | block | maintenance | empty | none
 * Sources used (in order of strength):
 *   1. HTTP status (403/429/503/520-526)
 *   2. Response headers (cf-ray, cf-mitigated, server, x-amzn-waf, retry-after)
 *   3. Set-Cookie names (cf_chl_*, __cf_bm, awsalbcors)
 *   4. DOM elements (iframes for captcha vendors, challenge containers)
 *   5. Title + body text patterns (multi-lingual)
 *   6. Page weight (suspiciously small)
 */

const CF_TITLE_RE   = /just a moment|attention required|checking your browser|please wait|un instant|momento por favor|الرجاء الانتظار|تحقق من المتصفح/i;
const CF_BODY_RE    = /cf-(chl|browser|wrapper|spinner)-|cloudflare|cf_chl_|cf-mitigated|cf-error-details|__cf_chl_/i;
const CAPTCHA_RE    = /\b(g-recaptcha|grecaptcha|recaptcha\/api|hcaptcha\.com|h-captcha|turnstile|cf-turnstile|funcaptcha|arkoselabs|geetest|cloudflare-challenge)\b/i;
const WAF_RE        = /\b(access denied|request blocked|forbidden|reference (id|number)|incident id|blocked by .+ waf|imperva|akamai|sucuri|f5 big-ip|incapsula|denied by policy|blocked because of suspicious activity)\b/i;
const RATELIMIT_RE  = /\b(rate limit(ed)?|too many requests|slow down|429|تجاوزت الحد)\b/i;
const MAINT_RE      = /\b(under maintenance|service unavailable|temporarily unavailable|scheduled maintenance|الموقع تحت الصيانة|خدمة غير متوفرة)\b/i;
const CAPTCHA_DOM_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="turnstile"]',
  'iframe[src*="arkoselabs"]',
  'div.g-recaptcha',
  'div.h-captcha',
  'div[class*="cf-turnstile"]',
  'div#challenge-form',
  'div#cf-wrapper',
  'div.challenge-stage',
];

/**
 * Snapshot page state for detection. Accepts an optional response object
 * from page.goto() to pull HTTP status + headers.
 */
export async function detectBlocker(page, response = null) {
  const signals = [];
  let httpStatus = null;
  let headers = {};
  let retryAfter = null;

  try {
    if (response) {
      httpStatus = response.status?.() ?? null;
      headers = (await response.allHeaders?.()) ?? {};
      retryAfter = parseInt(headers['retry-after'] || '', 10) || null;
    }
  } catch {}

  // 1) HTTP status
  if (httpStatus === 403) signals.push({ src: 'status', kind: 'block', weight: 60, detail: '403' });
  if (httpStatus === 429) signals.push({ src: 'status', kind: 'rate_limit', weight: 70, detail: '429' });
  if (httpStatus === 503) signals.push({ src: 'status', kind: 'maintenance', weight: 30, detail: '503' });
  if (httpStatus && httpStatus >= 520 && httpStatus <= 526) signals.push({ src: 'status', kind: 'cloudflare', weight: 60, detail: String(httpStatus) });

  // 2) Headers
  if (headers['cf-mitigated']) signals.push({ src: 'header', kind: 'cloudflare', weight: 80, detail: `cf-mitigated=${headers['cf-mitigated']}` });
  if (headers['cf-ray'] && (httpStatus === 403 || httpStatus === 429 || httpStatus === 503)) {
    signals.push({ src: 'header', kind: 'cloudflare', weight: 65, detail: 'cf-ray+bad-status' });
  }
  if (/imperva|incapsula/i.test(headers['server'] || '') || headers['x-iinfo']) signals.push({ src: 'header', kind: 'waf', weight: 60, detail: 'imperva' });
  if (headers['x-amzn-waf-action'] || /awswaf/i.test(headers['set-cookie'] || '')) signals.push({ src: 'header', kind: 'waf', weight: 60, detail: 'aws-waf' });
  if (headers['x-akamai-bot-detection']) signals.push({ src: 'header', kind: 'waf', weight: 60, detail: 'akamai' });

  // 3) Cookies
  try {
    const cookies = await page.context().cookies();
    for (const c of cookies) {
      if (/^cf_chl/.test(c.name) || c.name === 'cf_clearance') signals.push({ src: 'cookie', kind: 'cloudflare', weight: 55, detail: c.name });
      if (/^__cf_bm$/.test(c.name) && (httpStatus === 403 || httpStatus === 429)) signals.push({ src: 'cookie', kind: 'cloudflare', weight: 40, detail: '__cf_bm+bad' });
      if (/incap_ses|visid_incap/.test(c.name)) signals.push({ src: 'cookie', kind: 'waf', weight: 35, detail: c.name });
    }
  } catch {}

  // 4) DOM
  try {
    for (const sel of CAPTCHA_DOM_SELECTORS) {
      const el = await page.$(sel);
      if (el) {
        const kind = /turnstile|cf-/i.test(sel) ? 'cloudflare' : 'captcha';
        signals.push({ src: 'dom', kind, weight: 85, detail: sel });
        break;
      }
    }
  } catch {}

  // 5) Title + body
  let title = '';
  let html = '';
  try { title = (await page.title()) || ''; } catch {}
  try { html = (await page.content()) || ''; } catch {}
  const titleL = title.toLowerCase();

  if (CF_TITLE_RE.test(titleL)) signals.push({ src: 'title', kind: 'cloudflare', weight: 75, detail: title.slice(0, 80) });
  if (CF_BODY_RE.test(html))    signals.push({ src: 'body',  kind: 'cloudflare', weight: 60, detail: 'cf-body-pattern' });
  if (CAPTCHA_RE.test(html))    signals.push({ src: 'body',  kind: 'captcha',    weight: 70, detail: 'captcha-pattern' });
  if (WAF_RE.test(html))        signals.push({ src: 'body',  kind: 'waf',        weight: 55, detail: 'waf-pattern' });
  if (RATELIMIT_RE.test(html))  signals.push({ src: 'body',  kind: 'rate_limit', weight: 65, detail: 'rate-limit-pattern' });
  if (MAINT_RE.test(html))      signals.push({ src: 'body',  kind: 'maintenance', weight: 50, detail: 'maintenance-pattern' });

  // 6) Page weight heuristic — very short pages on bad statuses are likely interstitials
  if (html.length < 1500 && (httpStatus === 403 || httpStatus === 429 || httpStatus === 503)) {
    signals.push({ src: 'heuristic', kind: 'block', weight: 30, detail: `tiny-${html.length}b` });
  }
  if (!html || html.length < 200) {
    signals.push({ src: 'heuristic', kind: 'empty', weight: 20, detail: 'empty-body' });
  }

  // Aggregate: highest-weighted kind wins
  if (signals.length === 0) {
    return { detected: false, kind: 'none', confidence: 0, signals: [], httpStatus, retryAfter };
  }
  const byKind = {};
  for (const s of signals) byKind[s.kind] = (byKind[s.kind] || 0) + s.weight;
  const [kind, score] = Object.entries(byKind).sort((a, b) => b[1] - a[1])[0];
  const confidence = Math.min(100, score);
  const reason = signals
    .filter((s) => s.kind === kind)
    .map((s) => `${s.src}:${s.detail}`)
    .join(' | ');

  return {
    detected: confidence >= 40 && kind !== 'none' && kind !== 'empty',
    kind,
    confidence,
    signals,
    reason,
    httpStatus,
    retryAfter,
    titleSample: title.slice(0, 120),
  };
}

/** Back-compat: returns boolean-ish object like before. */
export async function detectCloudflare(page) {
  const r = await detectBlocker(page);
  return {
    detected: r.detected && (r.kind === 'cloudflare' || r.kind === 'captcha'),
    kind: r.kind,
    confidence: r.confidence,
    reason: r.reason,
  };
}

/**
 * Wait up to `maxWaitMs` for a CF challenge to clear automatically.
 * Returns true if cleared.
 */
export async function waitForChallenge(page, maxWaitMs = 30_000) {
  const start = Date.now();
  let lastConfidence = 100;
  while (Date.now() - start < maxWaitMs) {
    await sleep(2_000 + Math.floor(Math.random() * 1500));
    const r = await detectBlocker(page);
    if (!r.detected) return true;
    // Early exit if confidence rises (challenge solidified, not transient)
    if (r.confidence > lastConfidence + 20) return false;
    lastConfidence = r.confidence;
  }
  return false;
}

/**
 * Standard CF retry strategy: detect → wait → if still blocked, sleep random
 * 5–25s and signal caller to rotate fingerprint/proxy.
 */
export async function handleCloudflare(page, response = null) {
  const det = await detectBlocker(page, response);
  if (!det.detected) return { ...det, cleared: true };

  // Non-transient kinds: don't wait, just report
  if (['waf', 'rate_limit', 'block'].includes(det.kind)) {
    return { ...det, cleared: false, rotateFingerprint: true, cooldownHint: det.retryAfter ?? 1200 };
  }
  if (det.kind === 'maintenance') {
    return { ...det, cleared: false, rotateFingerprint: false, cooldownHint: 900 };
  }

  // Transient kinds (cloudflare interstitial, captcha): brief wait
  const cleared = await waitForChallenge(page, 30_000);
  if (cleared) return { ...det, cleared: true };

  await sleep(humanIdle(5_000, 25_000));
  return {
    ...det,
    cleared: false,
    rotateFingerprint: true,
    cooldownHint: det.retryAfter ?? (det.kind === 'captcha' ? 1800 : 600),
  };
}