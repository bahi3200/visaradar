import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ──────────────────────────────────────────────
// Anti-detection: rotating User-Agent pool
// ──────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

const ACCEPT_LANGUAGES = [
  'ar,en;q=0.9,fr;q=0.8',
  'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
  'en-US,en;q=0.9,ar;q=0.8',
  'ar-DZ,ar;q=0.9,fr;q=0.8,en;q=0.7',
  'fr,ar;q=0.9,en;q=0.8',
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────────────────────────────────────
// Optional proxy through ScraperAPI / ScrapingBee to bypass Cloudflare/CAPTCHA.
// Enabled automatically when SCRAPER_API_KEY env var is set.
// ──────────────────────────────────────────────
function proxiedUrl(url: string, render = false): string {
  const key = Deno.env.get('SCRAPER_API_KEY');
  if (!key) return url;
  const params = new URLSearchParams({
    api_key: key,
    url,
    country_code: 'eu',
    keep_headers: 'true',
  });
  if (render) params.set('render', 'true');
  return `https://api.scraperapi.com/?${params.toString()}`;
}

// ──────────────────────────────────────────────
// Phase 6 — Anti-Detection layer
// 1) Residential / datacenter proxy rotation via DB pool
// 2) Browser fingerprint headers (sec-ch-ua) per UA family
// ──────────────────────────────────────────────

const DEFAULT_PROXY_POOL = Deno.env.get('PROXY_POOL_NAME') || 'residential-eu';

let _sbProxyClient: ReturnType<typeof createClient> | null = null;
function getSbForProxy() {
  if (_sbProxyClient) return _sbProxyClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _sbProxyClient = createClient(url, key);
  return _sbProxyClient;
}

type PickedProxy = {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
};

async function pickProxy(country?: string, pool: string = DEFAULT_PROXY_POOL): Promise<PickedProxy | null> {
  const sb = getSbForProxy();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('pick_next_proxy', {
      _pool_name: pool,
      _country: country ?? null,
    });
    if (error || !data || !data.length) return null;
    return data[0] as PickedProxy;
  } catch { return null; }
}

async function recordProxy(id: string, success: boolean, latencyMs: number | null, status: number | null, err: string | null, usedFor: string) {
  const sb = getSbForProxy();
  if (!sb) return;
  try {
    await sb.rpc('record_proxy_result', {
      _proxy_id: id,
      _success: success,
      _latency_ms: latencyMs,
      _status_code: status,
      _error: err,
      _used_for: usedFor,
    });
  } catch { /* swallow */ }
}

function buildProxyUrl(p: PickedProxy): string {
  const auth = p.username
    ? `${encodeURIComponent(p.username)}${p.password ? ':' + encodeURIComponent(p.password) : ''}@`
    : '';
  return `${p.protocol}://${auth}${p.host}:${p.port}`;
}

// Browser fingerprint hints derived from UA family
function fingerprintHeaders(ua: string): Record<string, string> {
  const isChrome = /Chrome\/(\d+)/.test(ua) && !/Edg\//.test(ua) && !/Firefox/.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isMobile = /Mobile|iPhone|iPad|Android/.test(ua);
  const platform = /Windows/.test(ua) ? '"Windows"'
    : /Macintosh|Mac OS X/.test(ua) ? '"macOS"'
    : /iPhone|iPad/.test(ua) ? '"iOS"'
    : /Android/.test(ua) ? '"Android"'
    : '"Linux"';

  if (isFirefox || isSafari) {
    return { 'sec-ch-ua-mobile': isMobile ? '?1' : '?0', 'sec-ch-ua-platform': platform };
  }
  const ver = ua.match(/Chrome\/(\d+)/)?.[1] || '126';
  const brand = isEdge
    ? `"Microsoft Edge";v="${ver}", "Chromium";v="${ver}", "Not.A/Brand";v="24"`
    : `"Google Chrome";v="${ver}", "Chromium";v="${ver}", "Not.A/Brand";v="24"`;
  return {
    'sec-ch-ua': brand,
    'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
    'sec-ch-ua-platform': platform,
  };
}

// Fetch wrapper that rotates through DB proxy pool; falls back to direct/ScraperAPI.
// Auto-records success/failure stats for health monitoring.
async function antiDetectFetch(
  rawUrl: string,
  init: RequestInit,
  opts: { render?: boolean; country?: string; usedFor: string } = { usedFor: 'monitor' },
): Promise<{ response: Response; durationMs: number; viaProxy: boolean }> {
  const proxy = await pickProxy(opts.country);
  const start = Date.now();

  if (proxy) {
    try {
      // @ts-ignore Deno-specific HTTP client with proxy support
      const client = (Deno as any).createHttpClient?.({ proxy: { url: buildProxyUrl(proxy) } });
      const response = await fetch(rawUrl, { ...init, client } as any);
      const durationMs = Date.now() - start;
      try { client?.close?.(); } catch { /* noop */ }
      // Treat 2xx/3xx as success for proxy health
      const ok = response.status < 400;
      recordProxy(proxy.id, ok, durationMs, response.status, ok ? null : `HTTP ${response.status}`, opts.usedFor);
      return { response, durationMs, viaProxy: true };
    } catch (err) {
      const durationMs = Date.now() - start;
      recordProxy(proxy.id, false, durationMs, null, (err as Error).message, opts.usedFor);
      // fall through to direct/ScraperAPI
    }
  }

  const start2 = Date.now();
  const response = await fetch(proxiedUrl(rawUrl, opts.render === true), init);
  return { response, durationMs: Date.now() - start2, viaProxy: false };
}

// ──────────────────────────────────────────────
// Smart Ban & CAPTCHA Detection
// Classifies a fetched response into a ban reason (or null = clean).
// ──────────────────────────────────────────────
export type BanClassification = {
  reason: 'captcha' | 'cloudflare' | 'rate_limit' | 'temp_ban' | 'forbidden' | 'unknown';
  severity: 'low' | 'medium' | 'high';
  retryAfterSeconds: number | null;
} | null;

export function classifyBlock(status: number, headers: Headers, html: string, bodyText: string): BanClassification {
  const retryAfterRaw = headers.get('retry-after');
  let retryAfter: number | null = null;
  if (retryAfterRaw) {
    const n = parseInt(retryAfterRaw, 10);
    if (!isNaN(n)) retryAfter = n;
    else {
      const d = Date.parse(retryAfterRaw);
      if (!isNaN(d)) retryAfter = Math.max(0, Math.round((d - Date.now()) / 1000));
    }
  }

  const cfRay = headers.get('cf-ray');
  const server = (headers.get('server') || '').toLowerCase();
  const cfMitigated = headers.get('cf-mitigated');

  // 1) Rate-limit / Too Many Requests
  if (status === 429) {
    return { reason: 'rate_limit', severity: 'high', retryAfterSeconds: retryAfter };
  }
  // 2) Service overload — often masks throttling
  if (status === 503 && (cfRay || server.includes('cloudflare'))) {
    return { reason: 'cloudflare', severity: 'high', retryAfterSeconds: retryAfter };
  }
  // 3) CAPTCHA / browser challenge
  if (/cf[-_]chl|cf-browser-verification|hcaptcha|recaptcha|g-recaptcha|challenge-platform|__cf_chl|just a moment/i.test(html)) {
    return { reason: 'captcha', severity: 'high', retryAfterSeconds: retryAfter };
  }
  // 4) Cloudflare block / Access denied
  if (status === 403 && (cfRay || cfMitigated || /cloudflare|attention required|access denied|sorry, you have been blocked/i.test(html))) {
    return { reason: 'cloudflare', severity: 'high', retryAfterSeconds: retryAfter };
  }
  // 5) Temporary ban patterns
  if (/temporarily (banned|blocked|unavailable)|too many requests|ip.{0,10}banned|access (has been )?denied for security/i.test(html)) {
    return { reason: 'temp_ban', severity: 'medium', retryAfterSeconds: retryAfter };
  }
  // 6) Generic 403 with small body
  if (status === 403 && bodyText.length < 400) {
    return { reason: 'forbidden', severity: 'medium', retryAfterSeconds: retryAfter };
  }
  // 7) Generic blocked text on tiny body
  if (bodyText.length < 200 && /captcha|challenge|blocked|access denied|forbidden/i.test(html)) {
    return { reason: 'unknown', severity: 'low', retryAfterSeconds: retryAfter };
  }
  return null;
}

async function recordBanEvent(
  country: string, provider: string, c: NonNullable<BanClassification>,
  httpStatus: number, snippet: string, sourceUrl: string,
): Promise<Date | null> {
  const sb = getSbForProxy();
  if (!sb) return null;
  try {
    const { data } = await sb.rpc('record_ban_event', {
      _country: country, _provider: provider, _reason: c.reason, _severity: c.severity,
      _http_status: httpStatus, _retry_after: c.retryAfterSeconds,
      _snippet: snippet, _source_url: sourceUrl,
    });
    return data ? new Date(data as string) : null;
  } catch (e) {
    console.error('[ban] recordBanEvent failed:', e);
    return null;
  }
}

async function recordProviderSuccess(provider: string) {
  const sb = getSbForProxy();
  if (!sb) return;
  try { await sb.rpc('record_provider_success', { _provider: provider }); } catch { /* swallow */ }
}

async function isProviderThrottled(provider: string): Promise<Date | null> {
  const sb = getSbForProxy();
  if (!sb) return null;
  try {
    const { data } = await sb.from('provider_throttle').select('cooldown_until').eq('provider', provider).maybeSingle();
    if (data?.cooldown_until) {
      const d = new Date(data.cooldown_until);
      if (d.getTime() > Date.now()) return d;
    }
  } catch { /* swallow */ }
  return null;
}

// ──────────────────────────────────────────────
// Monitor targets with multi-layer detection
// ──────────────────────────────────────────────
interface MonitorTarget {
  name: string;
  nameAr: string;
  flag: string;
  provider: string;
  // Primary: HTML page to check
  checkUrl: string;
  officialUrl: string;
  // Secondary: API endpoints that return JSON (JS-rendered data)
  apiEndpoints?: { url: string; method?: string; headers?: Record<string, string> }[];
  openIndicators: { keyword: string; weight: number }[];
  closedIndicators: { keyword: string; weight: number }[];
  // Patterns to find in inline <script> tags (JSON state, __NEXT_DATA__, etc.)
  scriptDataPatterns?: { regex: string; openMatch?: string; closedMatch?: string; weight: number }[];
  // HTTP status interpretation
  statusCodeHints?: { code: number; meaning: 'open' | 'closed' | 'error' }[];
}

const MONITOR_TARGETS: Record<string, MonitorTarget> = {
  IT: {
    name: 'Italy',
    nameAr: 'إيطاليا',
    flag: '🇮🇹',
    provider: 'VFS Global',
    checkUrl: 'https://visa.vfsglobal.com/dza/ar/ita/apply-visa',
    officialUrl: 'https://visa.vfsglobal.com/dza/ar/ita/',
    apiEndpoints: [
      { url: 'https://lift-api.vfsglobal.com/appointment/slots/dza/ita', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/ita/api/appointment-availability', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/slots-list/dza/ita', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/available-dates/dza/ita', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/ita/api/v1/slot-availability', method: 'GET' },
    ],
    openIndicators: [
      { keyword: 'book appointment', weight: 3 },
      { keyword: 'schedule appointment', weight: 3 },
      { keyword: 'slot available', weight: 3 },
      { keyword: 'available slots', weight: 3 },
      { keyword: 'حجز موعد', weight: 3 },
      { keyword: 'مواعيد متاحة', weight: 3 },
      { keyword: 'new appointment', weight: 3 },
      { keyword: 'select a date', weight: 3 },
      { keyword: 'choose date', weight: 3 },
      { keyword: 'available', weight: 1 },
      { keyword: 'appointment', weight: 1 },
      { keyword: 'متاح', weight: 1 },
    ],
    closedIndicators: [
      { keyword: 'no appointment available', weight: 5 },
      { keyword: 'no slots available', weight: 5 },
      { keyword: 'fully booked', weight: 4 },
      { keyword: 'currently unavailable', weight: 4 },
      { keyword: 'no appointment slots', weight: 5 },
      { keyword: 'appointments are not available', weight: 5 },
      { keyword: 'لا توجد مواعيد', weight: 5 },
      { keyword: 'محجوز بالكامل', weight: 4 },
      { keyword: 'غير متاح حالياً', weight: 4 },
      { keyword: 'غير متاح', weight: 3 },
      { keyword: 'not available', weight: 3 },
      { keyword: 'no dates', weight: 3 },
      { keyword: 'temporarily closed', weight: 4 },
    ],
    scriptDataPatterns: [
      { regex: '"isAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"appointmentAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"slots"\\s*:\\s*\\[(\\s*\\{)', weight: 4 }, // non-empty slots array = open
      { regex: '"slots"\\s*:\\s*\\[\\s*\\]', closedMatch: '[]', weight: 4 }, // empty slots = closed
      { regex: '"totalSlots"\\s*:\\s*(\\d+)', weight: 3 }, // numeric check in analyzeScriptData
    ],
  },
  FR: {
    name: 'France',
    nameAr: 'فرنسا',
    flag: '🇫🇷',
    provider: 'TLScontact',
    checkUrl: 'https://visas-fr.tlscontact.com/country/dz',
    officialUrl: 'https://visas-fr.tlscontact.com/',
    apiEndpoints: [
      { url: 'https://visas-fr.tlscontact.com/services/availability/fr/dz', method: 'GET' },
      { url: 'https://visas-fr.tlscontact.com/services/v1/appointments/availability/dz', method: 'GET' },
      { url: 'https://visas-fr.tlscontact.com/api/v1/centers/dz/slots', method: 'GET' },
      { url: 'https://fr.capago.net/api/v1/availability/dz', method: 'GET' },
    ],
    openIndicators: [
      { keyword: 'appointment available', weight: 3 },
      { keyword: 'créneau disponible', weight: 3 },
      { keyword: 'rendez-vous disponible', weight: 3 },
      { keyword: 'select a date', weight: 3 },
      { keyword: 'choose your appointment', weight: 3 },
      { keyword: 'available time', weight: 3 },
      { keyword: 'prendre rendez-vous', weight: 3 },
      { keyword: 'book', weight: 1 },
      { keyword: 'disponible', weight: 2 },
      { keyword: 'متاح', weight: 2 },
    ],
    closedIndicators: [
      { keyword: 'no appointment available', weight: 5 },
      { keyword: 'aucun créneau disponible', weight: 5 },
      { keyword: 'aucun rendez-vous disponible', weight: 5 },
      { keyword: 'no timeslot available', weight: 5 },
      { keyword: 'indisponible', weight: 4 },
      { keyword: 'complet', weight: 4 },
      { keyword: 'fully booked', weight: 4 },
      { keyword: 'no available dates', weight: 4 },
      { keyword: 'غير متاح', weight: 3 },
      { keyword: 'not available', weight: 3 },
    ],
    scriptDataPatterns: [
      { regex: '"available"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"timeslots"\\s*:\\s*\\[(\\s*\\{)', weight: 4 },
      { regex: '"timeslots"\\s*:\\s*\\[\\s*\\]', closedMatch: '[]', weight: 4 },
    ],
    statusCodeHints: [
      { code: 403, meaning: 'closed' },
    ],
  },
  ES: {
    name: 'Spain',
    nameAr: 'إسبانيا',
    flag: '🇪🇸',
    provider: 'BLS International Algeria',
    checkUrl: 'https://algeria.blsspainvisa.com/book_appointment.php',
    officialUrl: 'https://algeria.blsspainvisa.com/',
    apiEndpoints: [
      { url: 'https://algeria.blsspainvisa.com/api/check_availability.php', method: 'GET' },
      { url: 'https://algeria.blsspainvisa.com/api/slots_availability.php', method: 'GET' },
      { url: 'https://algeria.blsspainvisa.com/appointment/check_slot.php', method: 'GET' },
    ],
    openIndicators: [
      { keyword: 'appointment available', weight: 3 },
      { keyword: 'book now', weight: 3 },
      { keyword: 'select date', weight: 3 },
      { keyword: 'cita disponible', weight: 3 },
      { keyword: 'select appointment', weight: 3 },
      { keyword: 'choose your slot', weight: 3 },
      { keyword: 'حجز', weight: 2 },
      { keyword: 'متاح', weight: 2 },
      { keyword: 'disponible', weight: 2 },
    ],
    closedIndicators: [
      { keyword: 'no appointment available', weight: 5 },
      { keyword: 'no hay citas disponibles', weight: 5 },
      { keyword: 'no disponible', weight: 4 },
      { keyword: 'fully booked', weight: 4 },
      { keyword: 'no slots available', weight: 4 },
      { keyword: 'service temporarily unavailable', weight: 4 },
      { keyword: 'غير متاح', weight: 3 },
      { keyword: 'not available', weight: 3 },
    ],
    statusCodeHints: [
      { code: 404, meaning: 'closed' },
    ],
  },
  DE: {
    name: 'Germany',
    nameAr: 'ألمانيا',
    flag: '🇩🇪',
    provider: 'VFS Global',
    checkUrl: 'https://visa.vfsglobal.com/dza/ar/deu/apply-visa',
    officialUrl: 'https://visa.vfsglobal.com/dza/ar/deu/',
    apiEndpoints: [
      { url: 'https://lift-api.vfsglobal.com/appointment/slots/dza/deu', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/deu/api/appointment-availability', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/slots-list/dza/deu', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/available-dates/dza/deu', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/deu/api/v1/slot-availability', method: 'GET' },
    ],
    openIndicators: [
      { keyword: 'book appointment', weight: 3 },
      { keyword: 'schedule appointment', weight: 3 },
      { keyword: 'slot available', weight: 3 },
      { keyword: 'available slots', weight: 3 },
      { keyword: 'termin buchen', weight: 3 },
      { keyword: 'termin verfügbar', weight: 3 },
      { keyword: 'حجز موعد', weight: 3 },
      { keyword: 'مواعيد متاحة', weight: 3 },
      { keyword: 'new appointment', weight: 3 },
      { keyword: 'available', weight: 1 },
      { keyword: 'متاح', weight: 1 },
    ],
    closedIndicators: [
      { keyword: 'no appointment available', weight: 5 },
      { keyword: 'no slots available', weight: 5 },
      { keyword: 'fully booked', weight: 4 },
      { keyword: 'currently unavailable', weight: 4 },
      { keyword: 'keine termine verfügbar', weight: 5 },
      { keyword: 'keine termine', weight: 5 },
      { keyword: 'appointments are not available', weight: 5 },
      { keyword: 'لا توجد مواعيد', weight: 5 },
      { keyword: 'محجوز بالكامل', weight: 4 },
      { keyword: 'غير متاح', weight: 3 },
      { keyword: 'not available', weight: 3 },
      { keyword: 'temporarily closed', weight: 4 },
    ],
    scriptDataPatterns: [
      { regex: '"isAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"appointmentAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"slots"\\s*:\\s*\\[(\\s*\\{)', weight: 4 },
      { regex: '"slots"\\s*:\\s*\\[\\s*\\]', closedMatch: '[]', weight: 4 },
    ],
  },
  GR: {
    name: 'Greece',
    nameAr: 'اليونان',
    flag: '🇬🇷',
    provider: 'VFS Global',
    checkUrl: 'https://visa.vfsglobal.com/dza/ar/grc/apply-visa',
    officialUrl: 'https://visa.vfsglobal.com/dza/ar/grc/',
    apiEndpoints: [
      { url: 'https://lift-api.vfsglobal.com/appointment/slots/dza/grc', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/grc/api/appointment-availability', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/slots-list/dza/grc', method: 'GET' },
      { url: 'https://lift-api.vfsglobal.com/appointment/available-dates/dza/grc', method: 'GET' },
      { url: 'https://visa.vfsglobal.com/dza/ar/grc/api/v1/slot-availability', method: 'GET' },
    ],
    openIndicators: [
      { keyword: 'book appointment', weight: 3 },
      { keyword: 'schedule appointment', weight: 3 },
      { keyword: 'slot available', weight: 3 },
      { keyword: 'available slots', weight: 3 },
      { keyword: 'حجز موعد', weight: 3 },
      { keyword: 'مواعيد متاحة', weight: 3 },
      { keyword: 'new appointment', weight: 3 },
      { keyword: 'available', weight: 1 },
      { keyword: 'متاح', weight: 1 },
    ],
    closedIndicators: [
      { keyword: 'no appointment available', weight: 5 },
      { keyword: 'no slots available', weight: 5 },
      { keyword: 'fully booked', weight: 4 },
      { keyword: 'currently unavailable', weight: 4 },
      { keyword: 'appointments are not available', weight: 5 },
      { keyword: 'لا توجد مواعيد', weight: 5 },
      { keyword: 'محجوز بالكامل', weight: 4 },
      { keyword: 'غير متاح', weight: 3 },
      { keyword: 'not available', weight: 3 },
      { keyword: 'temporarily closed', weight: 4 },
    ],
    scriptDataPatterns: [
      { regex: '"isAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"appointmentAvailable"\\s*:\\s*(true|false)', openMatch: 'true', closedMatch: 'false', weight: 5 },
      { regex: '"slots"\\s*:\\s*\\[(\\s*\\{)', weight: 4 },
      { regex: '"slots"\\s*:\\s*\\[\\s*\\]', closedMatch: '[]', weight: 4 },
    ],
  },
};

type CheckResult = {
  countryCode: string;
  category: string; // 'tourism' | 'study' | 'work'
  status: 'open' | 'closed' | 'error' | 'unknown';
  previousStatus: string | null;
  snippet: string | null;
  error: string | null;
  changed: boolean;
  openScore: number;
  closedScore: number;
  httpStatus: number | null;
  responseTimeMs: number;
  detectionMethod: string; // Which layer detected the status
  // ── Strong-tracking fields ──
  extractedDates: { date: string; center?: string; source: string }[];
  earliestDate: string | null;
  slotCount: number;
  centersOpen: string[];
  signalHash: string;
  signalBreakdown?: Record<string, { open: number; closed: number }>;
  htmlSnapshot?: string;
};

// ──────────────────────────────────────────────
// Visa categories (Tourism / Study / Work)
// Provider-specific parameter mapping for VFS lift-api,
// TLScontact and BLS check pages.
// ──────────────────────────────────────────────
export const VISA_CATEGORIES = [
  {
    key: 'tourism',
    ar: 'سياحة',
    en: 'Tourism',
    icon: '🏖️',
    vfsParam: 'Tourism',
    tlsParam: 'TOURISM',
    blsParam: 'tourism',
  },
  {
    key: 'study',
    ar: 'دراسة',
    en: 'Study',
    icon: '🎓',
    vfsParam: 'Study',
    tlsParam: 'STUDIES',
    blsParam: 'student',
  },
  {
    key: 'work',
    ar: 'عمل',
    en: 'Work',
    icon: '💼',
    vfsParam: 'Work',
    tlsParam: 'WORK',
    blsParam: 'work',
  },
] as const;

type VisaCategory = typeof VISA_CATEGORIES[number];

function buildCategoryTarget(target: MonitorTarget, cat: VisaCategory): MonitorTarget {
  const isVfs = /vfsglobal/i.test(target.checkUrl);
  const isTls = /tlscontact/i.test(target.checkUrl);
  const isBls = /blsspainvisa/i.test(target.checkUrl);

  const checkUrl = isVfs
    ? `${target.checkUrl}?visaCategory=${encodeURIComponent(cat.vfsParam)}`
    : isTls
      ? `${target.checkUrl}?visa_category=${encodeURIComponent(cat.tlsParam)}`
      : isBls
        ? `${target.checkUrl}?category=${encodeURIComponent(cat.blsParam)}`
        : target.checkUrl;

  const apiEndpoints = (target.apiEndpoints || []).map((ep) => {
    const sep = ep.url.includes('?') ? '&' : '?';
    if (isVfs) return { ...ep, url: `${ep.url}${sep}visaCategory=${encodeURIComponent(cat.vfsParam)}` };
    if (isTls) return { ...ep, url: `${ep.url}${sep}visa_category=${encodeURIComponent(cat.tlsParam)}` };
    if (isBls) return { ...ep, url: `${ep.url}${sep}category=${encodeURIComponent(cat.blsParam)}` };
    return ep;
  });

  return { ...target, checkUrl, apiEndpoints };
}

// ──────────────────────────────────────────────
// Layer 1: Keyword-based weighted scoring
// ──────────────────────────────────────────────
type Indicator = { keyword: string; weight: number };

export function analyzeKeywords(
  text: string,
  openIndicators: Indicator[],
  closedIndicators: Indicator[],
): { openScore: number; closedScore: number } {
  const lower = text.toLowerCase();
  let openScore = 0;
  let closedScore = 0;

  for (const ind of closedIndicators) {
    if (lower.includes(ind.keyword.toLowerCase())) closedScore += ind.weight;
  }
  for (const ind of openIndicators) {
    if (lower.includes(ind.keyword.toLowerCase())) openScore += ind.weight;
  }

  return { openScore, closedScore };
}

// ──────────────────────────────────────────────
// Layer 2: Inline <script> / JSON state analysis
// ──────────────────────────────────────────────
export function analyzeScriptData(
  html: string,
  patterns: MonitorTarget['scriptDataPatterns'],
): { openScore: number; closedScore: number; detectedData: string[] } {
  if (!patterns || patterns.length === 0) return { openScore: 0, closedScore: 0, detectedData: [] };

  // Extract all inline script content
  const scriptBlocks: string[] = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (match[1].trim().length > 0) scriptBlocks.push(match[1]);
  }
  const allScripts = scriptBlocks.join('\n');

  // Also check for JSON-LD, __NEXT_DATA__, window.__STATE__, etc.
  const statePatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i,
    /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/i,
    /window\.__STATE__\s*=\s*({[\s\S]*?});/i,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/i,
    /data-page="([^"]+)"/i, // Inertia.js
  ];

  let stateData = '';
  for (const p of statePatterns) {
    const m = html.match(p);
    if (m) stateData += '\n' + m[1];
  }

  const fullContent = allScripts + '\n' + stateData;
  let openScore = 0;
  let closedScore = 0;
  const detectedData: string[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex, 'gi');
    const m = regex.exec(fullContent);
    if (m) {
      const matched = m[1] || m[0];
      detectedData.push(`Pattern "${pattern.regex}" → "${matched}"`);

      if (pattern.openMatch && matched.toLowerCase() === pattern.openMatch.toLowerCase()) {
        openScore += pattern.weight;
      } else if (pattern.closedMatch && matched.toLowerCase() === pattern.closedMatch.toLowerCase()) {
        closedScore += pattern.weight;
      } else if (!pattern.openMatch && !pattern.closedMatch) {
        // Pattern with no specific match = presence means open (e.g., non-empty slots array)
        openScore += pattern.weight;
      } else if (pattern.regex.includes('totalSlots')) {
        const num = parseInt(matched, 10);
        if (!isNaN(num)) {
          if (num > 0) openScore += pattern.weight;
          else closedScore += pattern.weight;
        }
      }
    }
  }

  return { openScore, closedScore, detectedData };
}

// ──────────────────────────────────────────────
// Layer 3: API endpoint probing
// ──────────────────────────────────────────────
export async function probeApiEndpoints(
  endpoints: MonitorTarget['apiEndpoints'],
): Promise<{
  openScore: number;
  closedScore: number;
  apiResults: string[];
  extractedDates: { date: string; center?: string; source: string }[];
  slotCount: number;
  centersOpen: string[];
}> {
  if (!endpoints || endpoints.length === 0)
    return { openScore: 0, closedScore: 0, apiResults: [], extractedDates: [], slotCount: 0, centersOpen: [] };

  let openScore = 0;
  let closedScore = 0;
  const apiResults: string[] = [];
  const extractedDates: { date: string; center?: string; source: string }[] = [];
  let slotCount = 0;
  const centersOpen = new Set<string>();

  for (const ep of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const ua = randomPick(USER_AGENTS);
      const { response: resp } = await antiDetectFetch(ep.url, {
        method: ep.method || 'GET',
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': randomPick(ACCEPT_LANGUAGES),
          ...fingerprintHeaders(ua),
          ...ep.headers,
        },
        signal: controller.signal,
      }, { render: false, usedFor: 'api-probe' });
      const text = await resp.text();
      apiResults.push(`API ${ep.url} → HTTP ${resp.status}, ${text.length} bytes`);

      // Skip non-success responses
      if (resp.status >= 400) {
        // NOTE: 401/403/404/422 from these endpoints usually means
        // auth-required / endpoint-moved / WAF-blocked — NOT "no slots".
        // Treating them as "closed" was masking real openings, so we
        // record the signal but do NOT add to closedScore here.
        apiResults.push(`  → HTTP ${resp.status} ignored (likely auth/blocked, not closed)`);
        continue;
      }

      // Try parsing JSON
      try {
        const json = JSON.parse(text);
        
        // Common API patterns for availability
        if (typeof json === 'object' && json !== null) {
          // ── Strong tracking: extract dates / slot counts / center names ──
          try {
            const found = extractDatesFromAny(json, ep.url);
            if (found.dates.length) extractedDates.push(...found.dates);
            if (found.slotCount > 0) slotCount += found.slotCount;
            for (const c of found.centers) centersOpen.add(c);
          } catch { /* ignore extraction errors */ }

          // Check for direct availability flags
          if ('available' in json) {
            if (json.available === true) { openScore += 6; apiResults.push('  → available: true'); }
            else { closedScore += 6; apiResults.push('  → available: false'); }
          }
          if ('isAvailable' in json) {
            if (json.isAvailable === true) { openScore += 6; apiResults.push('  → isAvailable: true'); }
            else { closedScore += 6; apiResults.push('  → isAvailable: false'); }
          }
          
          // Check for slots/dates arrays
          const slotsKey = ['slots', 'dates', 'timeslots', 'availableDates', 'available_dates', 'appointments']
            .find(k => k in json);
          if (slotsKey && Array.isArray(json[slotsKey])) {
            if (json[slotsKey].length > 0) {
              openScore += 5;
              apiResults.push(`  → ${slotsKey}: ${json[slotsKey].length} items`);
            } else {
              closedScore += 3;
              apiResults.push(`  → ${slotsKey}: empty`);
            }
          }

          // Check for count fields
          const countKey = ['totalSlots', 'count', 'total', 'availableCount']
            .find(k => k in json && typeof json[k] === 'number');
          if (countKey) {
            if (json[countKey] > 0) { openScore += 5; apiResults.push(`  → ${countKey}: ${json[countKey]}`); }
            else { closedScore += 3; apiResults.push(`  → ${countKey}: 0`); }
          }

          // Check for error/message indicating no availability
          if (json.error || json.message) {
            const msg = String(json.error || json.message).toLowerCase();
            if (/no.*available|not.*available|no.*slot|closed|unavailable/.test(msg)) {
              closedScore += 4;
              apiResults.push(`  → message indicates closed: "${msg}"`);
            }
          }
        }
      } catch {
        // Not JSON - check for plain text indicators
        const lower = text.toLowerCase();
        if (/true|available|open/.test(lower) && text.length < 50) {
          openScore += 2;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      apiResults.push(`API ${ep.url} → Error: ${msg}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { openScore, closedScore, apiResults, extractedDates, slotCount, centersOpen: Array.from(centersOpen) };
}

// ──────────────────────────────────────────────
// Deep-extract appointment dates, slot counts, and center names from any JSON shape
// ──────────────────────────────────────────────
const DATE_KEY_RE = /^(date|day|appointment_?date|slot_?date|available_?date|start|when)$/i;
const CENTER_KEY_RE = /^(center|centre|location|city|office|branch|center_?name)$/i;
const SLOT_KEY_RE = /^(slot|slots|appointments|available|count|total|total_?slots|available_?count)$/i;
const ISO_DATE_RE = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g;

export function extractDatesFromAny(
  node: any,
  source: string,
  out: { dates: { date: string; center?: string; source: string }[]; slotCount: number; centers: Set<string> } = { dates: [], slotCount: 0, centers: new Set() },
  ctxCenter?: string,
  depth = 0,
): { dates: { date: string; center?: string; source: string }[]; slotCount: number; centers: Set<string> } {
  if (depth > 6 || node == null) return out;

  if (typeof node === 'string') {
    let m: RegExpExecArray | null;
    while ((m = ISO_DATE_RE.exec(node)) !== null) {
      const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      const d = new Date(iso);
      // Only future dates within next 365 days are meaningful appointments
      const now = Date.now();
      if (!isNaN(d.getTime()) && d.getTime() >= now - 86400000 && d.getTime() <= now + 365 * 86400000) {
        out.dates.push({ date: iso, center: ctxCenter, source });
      }
    }
    return out;
  }

  if (Array.isArray(node)) {
    for (const item of node) extractDatesFromAny(item, source, out, ctxCenter, depth + 1);
    return out;
  }

  if (typeof node === 'object') {
    // Capture center context for nested children
    let center = ctxCenter;
    for (const [k, v] of Object.entries(node)) {
      if (CENTER_KEY_RE.test(k) && typeof v === 'string' && v.length > 1 && v.length < 80) {
        center = v;
        out.centers.add(v);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (DATE_KEY_RE.test(k) && typeof v === 'string') {
        extractDatesFromAny(v, source, out, center, depth + 1);
      } else if (SLOT_KEY_RE.test(k) && typeof v === 'number') {
        if (v > 0) out.slotCount += v;
      } else if (typeof v === 'object') {
        extractDatesFromAny(v, source, out, center, depth + 1);
      } else if (typeof v === 'string') {
        // Strings inside might carry dates too
        extractDatesFromAny(v, source, out, center, depth + 1);
      }
    }
  }
  return out;
}

// Stable signal hash — only changes when meaningful structure changes
export function computeSignalHash(input: {
  slotCount: number;
  earliestDate: string | null;
  centersOpen: string[];
  dates: string[];
}): string {
  const norm = {
    s: input.slotCount,
    e: input.earliestDate || '',
    c: [...input.centersOpen].sort(),
    d: [...new Set(input.dates)].sort(),
  };
  const str = JSON.stringify(norm);
  // Lightweight non-crypto hash (djb2) — fine for change detection
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

// ──────────────────────────────────────────────
// Layer 4: Meta tag & structured data analysis
// ──────────────────────────────────────────────
function analyzeMetaAndStructured(html: string): { openScore: number; closedScore: number } {
  let openScore = 0;
  let closedScore = 0;

  // Check meta tags
  const metaContent = (html.match(/<meta[^>]*content="([^"]*)"[^>]*>/gi) || [])
    .map(m => m.toLowerCase())
    .join(' ');

  if (/appointment.*available|book.*now|schedule.*appointment/.test(metaContent)) openScore += 2;
  if (/no.*appointment|unavailable|closed|fully.*booked/.test(metaContent)) closedScore += 2;

  // Check og:description and page title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].toLowerCase();
    if (/book|schedule|available|open/.test(title)) openScore += 1;
    if (/unavailable|closed|no.*appointment|maintenance/.test(title)) closedScore += 2;
  }

  // Check for date pickers / calendar widgets (hidden in HTML attributes)
  if (/class=".*calendar|datepicker|date-picker|time-slot|timeslot/i.test(html)) {
    openScore += 1; // Calendar widget present = possible open
  }
  if (/disabled.*calendar|no-dates|empty-calendar/i.test(html)) {
    closedScore += 1;
  }

  return { openScore, closedScore };
}

// ──────────────────────────────────────────────
// Layer 5: HTTP response analysis
// ──────────────────────────────────────────────
function analyzeHttpResponse(
  httpStatus: number,
  headers: Headers,
  target: MonitorTarget,
): { openScore: number; closedScore: number; hint: string } {
  let openScore = 0;
  let closedScore = 0;
  let hint = '';

  // Check configured status code hints
  if (target.statusCodeHints) {
    const match = target.statusCodeHints.find(h => h.code === httpStatus);
    if (match) {
      if (match.meaning === 'open') { openScore += 3; hint = `HTTP ${httpStatus} → open`; }
      else if (match.meaning === 'closed') { closedScore += 3; hint = `HTTP ${httpStatus} → closed`; }
      else { hint = `HTTP ${httpStatus} → error`; }
    }
  }

  // Redirect to login/error page often means closed
  const location = headers.get('location');
  if (location && /login|error|maintenance|closed/i.test(location)) {
    closedScore += 2;
    hint += ` Redirect → ${location}`;
  }

  // Check for maintenance headers
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    closedScore += 2;
    hint += ' Retry-After present';
  }

  return { openScore, closedScore, hint };
}

// ──────────────────────────────────────────────
// Combined multi-layer analysis
// ──────────────────────────────────────────────
export function determineStatus(
  layers: { name: string; openScore: number; closedScore: number }[],
): { status: 'open' | 'closed' | 'unknown'; totalOpen: number; totalClosed: number; detectionMethod: string } {
  let totalOpen = 0;
  let totalClosed = 0;
  const contributing: string[] = [];

  for (const layer of layers) {
    totalOpen += layer.openScore;
    totalClosed += layer.closedScore;
    if (layer.openScore > 0 || layer.closedScore > 0) {
      contributing.push(`${layer.name}(+${layer.openScore}/-${layer.closedScore})`);
    }
  }

  const detectionMethod = contributing.length > 0 ? contributing.join(', ') : 'none';

  // Confidence rules — tuned to minimise false "open" alerts while not missing real
  // openings. The single biggest source of noise was generic keywords ("available",
  // "appointment") matching menu/SEO copy on closed pages, so we require either
  // a clear margin OR a strong API/script signal.

  // 1) High-confidence OPEN: needs strong absolute score AND clearly outweighs closed.
  //    API or script layers (weights 4-6) are what reliably push a true opening past this bar.
  if (totalOpen >= 6 && totalOpen >= totalClosed * 2) {
    return { status: 'open', totalOpen, totalClosed, detectionMethod };
  }
  // 2) High-confidence CLOSED.
  if (totalClosed >= 5 && totalClosed > totalOpen) {
    return { status: 'closed', totalOpen, totalClosed, detectionMethod };
  }
  // 3) Clear closed with no opposing open signal.
  if (totalClosed >= 3 && totalOpen === 0) {
    return { status: 'closed', totalOpen, totalClosed, detectionMethod };
  }
  // 4) Clear open with no opposing closed signal.
  if (totalOpen >= 4 && totalClosed === 0) {
    return { status: 'open', totalOpen, totalClosed, detectionMethod };
  }
  // 5) Ambiguous / weak — stay "unknown" instead of guessing.
  return { status: 'unknown', totalOpen, totalClosed, detectionMethod };
}

// ──────────────────────────────────────────────
// Fetch with retry, rotating headers & jitter
// ──────────────────────────────────────────────
async function fetchWithRetry(url: string, maxRetries = 2): Promise<{ response: Response; durationMs: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      if (attempt > 0) await randomDelay(1500, 4000);
      const ua = randomPick(USER_AGENTS);
      const { response, durationMs } = await antiDetectFetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': randomPick(ACCEPT_LANGUAGES),
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'DNT': '1',
          ...fingerprintHeaders(ua),
        },
        signal: controller.signal,
        redirect: 'follow',
      }, { render: true, usedFor: 'html-fetch' });
      return { response, durationMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError!;
}

// ──────────────────────────────────────────────
// Check a single site (multi-layer)
// ──────────────────────────────────────────────
export { MONITOR_TARGETS };
export async function checkSite(
  countryCode: string,
  baseTarget: MonitorTarget,
  category: VisaCategory | { key: string } = { key: 'all' } as any,
): Promise<CheckResult> {
  const target = (category as VisaCategory).vfsParam
    ? buildCategoryTarget(baseTarget, category as VisaCategory)
    : baseTarget;
  try {
    // Layer 0: Fetch the HTML page
    const { response, durationMs } = await fetchWithRetry(target.checkUrl);
    const html = await response.text();

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const snippet = bodyText.substring(0, 500);

    // Smart Ban & CAPTCHA classification
    const ban = classifyBlock(response.status, response.headers, html, bodyText);
    if (ban) {
      const cooldown = await recordBanEvent(
        countryCode, target.provider, ban,
        response.status, snippet || html.substring(0, 500), target.checkUrl,
      );
      console.warn(
        `[BAN/${ban.reason}] ${countryCode} via ${target.provider} (status=${response.status}` +
        `${ban.retryAfterSeconds ? `, retry-after=${ban.retryAfterSeconds}s` : ''}` +
        `${cooldown ? `, cooldown until ${cooldown.toISOString()}` : ''})`,
      );
      return {
        countryCode, category: category.key, status: 'error', previousStatus: null,
        snippet: `[Blocked: ${ban.reason}]`, error: `Blocked by anti-bot: ${ban.reason}`,
        changed: false, openScore: 0, closedScore: 0,
        httpStatus: response.status, responseTimeMs: durationMs,
        detectionMethod: `blocked:${ban.reason}`,
        extractedDates: [], earliestDate: null, slotCount: 0, centersOpen: [], signalHash: 'blocked',
      };
    }

    // Clean response → reset provider throttle
    recordProviderSuccess(target.provider);

    // Run all detection layers in parallel
    const [apiResult] = await Promise.all([
      probeApiEndpoints(target.apiEndpoints),
    ]);

    const keywordResult = analyzeKeywords(
      bodyText,
      target.openIndicators,
      target.closedIndicators,
    );

    const scriptResult = analyzeScriptData(html, target.scriptDataPatterns);
    const metaResult = analyzeMetaAndStructured(html);
    const httpResult = analyzeHttpResponse(response.status, response.headers, target);

    // Combine all layers
    const layers = [
      { name: 'api', ...apiResult },
      { name: 'keywords', ...keywordResult },
      { name: 'scriptData', ...scriptResult },
      { name: 'meta', ...metaResult },
      { name: 'http', ...httpResult },
    ];

    let { status, totalOpen, totalClosed, detectionMethod } = determineStatus(layers);
    const signalBreakdown: Record<string, { open: number; closed: number }> = {};
    for (const l of layers) signalBreakdown[l.name] = { open: l.openScore, closed: l.closedScore };

    // Safety net: if the page is an empty SPA shell (no readable body text)
    // AND no layer produced ANY signal (open or closed), do NOT report "closed".
    // Returning "unknown" prevents false negatives that hide real openings.
    // NOTE: if an API layer produced a real closed signal (e.g. available:false,
    // empty slots), we keep that — only pure no-signal SPA shells become 'unknown'.
    const hasReadableBody = bodyText.length >= 200;
    if (!hasReadableBody && totalOpen === 0 && totalClosed === 0 && status !== 'open') {
      status = 'unknown';
      detectionMethod = `${detectionMethod} | spa-shell-no-signal`;
    }

    // Quality guard: weak HTTP-only / keyword-only signals are unreliable on modern
    // SPA visa sites (VFS/TLS/BLS render via JS). If the ONLY contributing layers
    // are http / keywords (no API, no scriptData, no meta), demote to 'unknown'
    // unless the API or browser_verifications layer confirms later.
    const strongLayers = ['api', 'scriptData'];
    const hasStrong = layers.some(l => strongLayers.includes(l.name) && (l.openScore > 0 || l.closedScore > 0));
    const weakOnly = !hasStrong &&
      layers.every(l => (l.openScore === 0 && l.closedScore === 0) || l.name === 'http' || l.name === 'keywords' || l.name === 'meta');
    if (status === 'open' && weakOnly) {
      status = 'unknown';
      detectionMethod = `${detectionMethod} | weak-only-demoted`;
    }
    if (status === 'closed' && weakOnly && !hasReadableBody) {
      status = 'unknown';
      detectionMethod = `${detectionMethod} | weak-shell-demoted`;
    }

    console.log(`[${countryCode}/${category.key}] Detection: ${detectionMethod} → ${status} (open:${totalOpen} closed:${totalClosed})`);
    if (apiResult.apiResults.length > 0) {
      console.log(`[${countryCode}/${category.key}] API probes:`, apiResult.apiResults.join(' | '));
    }
    if (scriptResult.detectedData.length > 0) {
      console.log(`[${countryCode}/${category.key}] Script data:`, scriptResult.detectedData.join(' | '));
    }

    // ── Strong tracking: aggregate dates + hash ──
    const allDates = (apiResult.extractedDates || []).map((d) => d.date);
    const uniqueDates = Array.from(new Set(allDates)).sort();
    const earliestDate = uniqueDates[0] || null;
    const signalHash = computeSignalHash({
      slotCount: apiResult.slotCount,
      earliestDate,
      centersOpen: apiResult.centersOpen,
      dates: uniqueDates,
    });

    return {
      countryCode, category: category.key, status, previousStatus: null,
      snippet, error: null, changed: false,
      openScore: totalOpen, closedScore: totalClosed,
      httpStatus: response.status, responseTimeMs: durationMs,
      detectionMethod,
      extractedDates: apiResult.extractedDates,
      earliestDate,
      slotCount: apiResult.slotCount,
      centersOpen: apiResult.centersOpen,
      signalHash,
      signalBreakdown,
      htmlSnapshot: status === 'open' ? html.substring(0, 20000) : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error checking ${countryCode}/${category.key}:`, errorMsg);
    return {
      countryCode, category: category.key, status: 'error', previousStatus: null,
      snippet: null, error: errorMsg, changed: false,
      openScore: 0, closedScore: 0,
      httpStatus: null, responseTimeMs: 0,
      detectionMethod: 'error',
      extractedDates: [], earliestDate: null, slotCount: 0, centersOpen: [], signalHash: 'error',
    };
  }
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Worker health: register heartbeat
    const workerId = `edge-${crypto.randomUUID().slice(0, 8)}`;
    const workerStartedAt = Date.now();
    const { data: workerRow } = await supabase
      .from('worker_health')
      .insert({ worker_id: workerId, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .maybeSingle();

    // Check if auto-monitoring is enabled (skip check for manual invocations with force=true)
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    let bodyData: any = null;
    try { bodyData = await req.clone().json(); } catch { /* no body */ }
    const isForced = force || bodyData?.force === true;

    if (!isForced) {
      const { data: setting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'auto_monitor_enabled')
        .maybeSingle();

      if (setting && setting.value === 'false') {
        return new Response(JSON.stringify({ 
          success: false, 
          skipped: true, 
          reason: 'Auto-monitoring is disabled' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const countryCodes = Object.keys(MONITOR_TARGETS);

    // ── Distributed sharding: accept a subset of countries via body.countries
    const shardCountries: string[] | null = Array.isArray(bodyData?.countries) && bodyData.countries.length > 0
      ? bodyData.countries.map((c: string) => String(c).toUpperCase())
      : null;
    const shardProvider: string | null = typeof bodyData?.provider === 'string' ? bodyData.provider : null;
    const taskId: string | null = typeof bodyData?.task_id === 'string' ? bodyData.task_id : null;
    const distributedScan = !!(shardCountries || shardProvider || taskId);

    // ── Respect scan_priorities cooldown_until: skip countries currently cooling down
    const { data: priorities } = await supabase
      .from('scan_priorities')
      .select('country_code, cooldown_until')
      .in('country_code', countryCodes);
    const cooldownSkip = new Set(
      (priorities || [])
        .filter((p: any) => p.cooldown_until && new Date(p.cooldown_until).getTime() > Date.now())
        .map((p: any) => p.country_code),
    );

    // ── Historical Detection Intelligence ──
    // Boost: if the current (weekday, hour) matches a known opening pattern for a
    // country+provider, we BYPASS the soft cooldown so we don't miss the window.
    // (Ban cooldown from provider_throttle still applies — see below.)
    const nowAlgiers = new Date(Date.now() + 60 * 60 * 1000); // UTC+1
    const wd = nowAlgiers.getUTCDay();
    const hr = nowAlgiers.getUTCHours();
    const { data: pw } = await supabase
      .from('predictive_windows')
      .select('country_code, provider, score')
      .eq('weekday', wd).eq('hour', hr).gte('score', 8);
    const boostedCountries = new Set((pw || []).map((p: any) => p.country_code));
    if (boostedCountries.size > 0) {
      console.log(`[predictive] boost active for ${[...boostedCountries].join(',')} at ${wd}h${hr}`);
    }
    const activeCountryCodes = countryCodes.filter((c) => boostedCountries.has(c) || !cooldownSkip.has(c));

    // ── Respect provider_throttle: if a provider is currently in escalating backoff,
    // skip ALL countries served by that provider until cooldown_until expires.
    const { data: throttles } = await supabase
      .from('provider_throttle')
      .select('provider, cooldown_until, last_reason');
    const throttledProviders = new Set(
      (throttles || [])
        .filter((t: any) => t.cooldown_until && new Date(t.cooldown_until).getTime() > Date.now())
        .map((t: any) => t.provider),
    );
    const providerSkip = new Set<string>();
    let finalActiveCountries = activeCountryCodes.filter((code) => {
      const prov = MONITOR_TARGETS[code]?.provider;
      if (prov && throttledProviders.has(prov)) {
        providerSkip.add(code);
        return false;
      }
      return true;
    });
    if (shardCountries) {
      const shardSet = new Set(shardCountries);
      finalActiveCountries = finalActiveCountries.filter((c) => shardSet.has(c));
    }
    if (shardProvider) {
      finalActiveCountries = finalActiveCountries.filter((c) => MONITOR_TARGETS[c]?.provider === shardProvider);
    }
    if (providerSkip.size > 0) {
      console.warn(`[throttle] skipping ${providerSkip.size} countries — providers in cooldown: ${[...throttledProviders].join(', ')}`);
    }

    // Stagger checks with random delays — across every (country × category) pair
    const siteResults: CheckResult[] = [];
    for (const code of finalActiveCountries) {
      for (const cat of VISA_CATEGORIES) {
        if (siteResults.length > 0) await randomDelay(600, 2000);
        const result = await checkSite(code, MONITOR_TARGETS[code], cat);
        siteResults.push(result);
      }
    }

    // Fetch previous statuses per (country, category)
    const previousStatuses = await Promise.all(
      siteResults.map(async (r) => {
        const { data } = await supabase
          .from('visa_monitor_checks')
          .select('status')
          .eq('country_code', r.countryCode)
          .eq('category', r.category)
          .order('checked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { key: `${r.countryCode}:${r.category}`, status: data?.status || null };
      }),
    );

    const prevMap = new Map(previousStatuses.map((p) => [p.key, p.status]));
    for (const result of siteResults) {
      const k = `${result.countryCode}:${result.category}`;
      result.previousStatus = prevMap.get(k) || null;
      result.changed = result.previousStatus
        ? result.previousStatus !== result.status
        : result.status === 'open';
    }

    // Batch insert
    const insertData = siteResults.map((result) => {
      const target = MONITOR_TARGETS[result.countryCode];
      const denom = result.openScore + result.closedScore;
      const winScore =
        result.status === 'open' ? result.openScore :
        result.status === 'closed' ? result.closedScore :
        Math.max(result.openScore, result.closedScore);
      const confidence_score = denom === 0 ? 0 : Math.min(100, Math.round((winScore / denom) * 100));
      return {
        country_code: result.countryCode,
        provider: target.provider,
        category: result.category,
        status: result.status,
        previous_status: result.previousStatus,
        response_snippet: result.snippet,
        error_message: result.error,
        detection_method: result.detectionMethod,
        notified: false,
        extracted_dates: result.extractedDates || [],
        slot_count: result.slotCount || 0,
        earliest_date: result.earliestDate,
        center_name: result.centersOpen?.[0] || null,
        confidence_score,
        signal_breakdown: result.signalBreakdown || {},
        worker_id: workerId,
      };
    });

    const { data: insertedChecks } = await supabase
      .from('visa_monitor_checks')
      .insert(insertData)
      .select('id, country_code, category, status');
    const checkIdByKey = new Map<string, string>();
    for (const c of (insertedChecks || []) as any[]) {
      checkIdByKey.set(`${c.country_code}:${c.category}`, c.id);
    }

    // ── Persist detection_evidence for open / changed results
    const evidenceRows = siteResults
      .filter((r) => r.status === 'open' || (r.changed && r.status !== 'error'))
      .map((r) => ({
        check_id: checkIdByKey.get(`${r.countryCode}:${r.category}`)!,
        country_code: r.countryCode,
        provider: MONITOR_TARGETS[r.countryCode].provider,
        evidence_type: r.htmlSnapshot ? 'html_snapshot' : 'detection_summary',
        url: MONITOR_TARGETS[r.countryCode].checkUrl,
        content: r.htmlSnapshot || (r.snippet ?? ''),
        metadata: {
          status: r.status,
          confidence_score:
            (r.openScore + r.closedScore) === 0
              ? 0
              : Math.round((Math.max(r.openScore, r.closedScore) / (r.openScore + r.closedScore)) * 100),
          signal_breakdown: r.signalBreakdown,
          extracted_dates: r.extractedDates,
          centers_open: r.centersOpen,
          slot_count: r.slotCount,
          earliest_date: r.earliestDate,
          http_status: r.httpStatus,
        },
      }))
      .filter((e) => e.check_id);
    if (evidenceRows.length > 0) {
      await supabase.from('detection_evidence').insert(evidenceRows);
    }

    // ── Update scan_priorities (mark scanned, track failures, ban cooldown)
    for (const r of siteResults) {
      const isFailure = r.status === 'error' || r.detectionMethod === 'blocked';
      const banDetected = r.detectionMethod === 'blocked' || r.httpStatus === 403;
      const update: any = { last_scanned_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (isFailure) {
        const { data: pri } = await supabase
          .from('scan_priorities').select('consecutive_failures, ban_detected_count')
          .eq('country_code', r.countryCode).maybeSingle();
        update.consecutive_failures = (pri?.consecutive_failures || 0) + 1;
        if (banDetected) {
          update.ban_detected_count = (pri?.ban_detected_count || 0) + 1;
          // 15-minute cooldown after ban
          update.cooldown_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
      } else {
        update.consecutive_failures = 0;
        update.cooldown_until = null;
      }
      await supabase.from('scan_priorities').update(update).eq('country_code', r.countryCode);
    }

    // ──────────────────────────────────────────────
    // Strong tracking: persist content signals + diff detection + early warnings
    // ──────────────────────────────────────────────
    const signalRows = siteResults
      .filter((r) => r.status !== 'error')
      .map((r) => {
        const target = MONITOR_TARGETS[r.countryCode];
        return {
          country_code: r.countryCode,
          provider: target.provider,
          category: r.category,
          center_name: r.centersOpen?.[0] || null,
          signal_hash: r.signalHash,
          slot_count: r.slotCount,
          centers_open: r.centersOpen || [],
          extracted_dates: r.extractedDates || [],
          earliest_date: r.earliestDate,
          raw_signal: { openScore: r.openScore, closedScore: r.closedScore, status: r.status },
        };
      });
    if (signalRows.length > 0) {
      await supabase.from('visa_content_signals').insert(signalRows);
    }

    // Diff detection: compare with the previous signal row per (country, category)
    const earlySignalsToInsert: any[] = [];
    const earlyAlertsToSend: { result: CheckResult; reason: string; details: any }[] = [];
    for (const r of siteResults) {
      if (r.status === 'error') continue;
      const { data: prevSignals } = await supabase
        .from('visa_content_signals')
        .select('signal_hash, slot_count, extracted_dates, centers_open, earliest_date, captured_at')
        .eq('country_code', r.countryCode)
        .eq('category', r.category)
        .order('captured_at', { ascending: false })
        .limit(2);
      const prev = (prevSignals || [])[1]; // [0] is the row we just inserted
      if (!prev) continue;

      const prevDates = new Set(((prev.extracted_dates as any[]) || []).map((d: any) => d?.date).filter(Boolean));
      const currDates = new Set((r.extractedDates || []).map((d) => d.date));
      const newDates = [...currDates].filter((d) => !prevDates.has(d));
      const newCenters = (r.centersOpen || []).filter((c) => !((prev.centers_open as string[]) || []).includes(c));
      const slotJump = (r.slotCount || 0) > (prev.slot_count || 0) && (r.slotCount || 0) - (prev.slot_count || 0) >= 1;
      const hashChanged = prev.signal_hash !== r.signalHash;

      if (!hashChanged) continue;

      let signalType: string | null = null;
      let confidence = 50;
      if (newDates.length > 0) { signalType = 'date_appeared'; confidence = 85; }
      else if (newCenters.length > 0) { signalType = 'partial_open'; confidence = 75; }
      else if (slotJump) { signalType = 'partial_open'; confidence = 70; }
      else { signalType = 'diff_detected'; confidence = 40; }

      // Skip noisy low-confidence diffs when nothing concrete changed
      if (confidence < 60 && r.status !== 'open') continue;

      const target = MONITOR_TARGETS[r.countryCode];
      const details = {
        newDates,
        newCenters,
        slotDelta: (r.slotCount || 0) - (prev.slot_count || 0),
        prevHash: prev.signal_hash,
        currHash: r.signalHash,
        earliestDate: r.earliestDate,
      };
      earlySignalsToInsert.push({
        country_code: r.countryCode,
        provider: target.provider,
        category: r.category,
        center_name: r.centersOpen?.[0] || null,
        signal_type: signalType,
        confidence,
        details,
        confirmed: r.status === 'open',
        confirmed_at: r.status === 'open' ? new Date().toISOString() : null,
      });

      // Send EARLY warning to subscribers if confidence is high enough and status is not already 'open'
      // (the main "open" alert flow below handles the confirmed case)
      if (confidence >= 70 && r.status !== 'open') {
        earlyAlertsToSend.push({ result: r, reason: signalType, details });
      }
    }
    if (earlySignalsToInsert.length > 0) {
      await supabase.from('visa_early_signals').insert(earlySignalsToInsert);
    }

    // Deliver early warnings (lightweight Telegram ping — distinct from full "open" alert)
    let earlySent = 0;
    if (earlyAlertsToSend.length > 0 && TELEGRAM_BOT_TOKEN) {
      // Dedupe with a 20-min window
      const EARLY_COOLDOWN_MIN = 20;
      const { data: allSubs } = await supabase
        .from('subscriptions')
        .select('user_id, telegram_chat_id, countries, service_type')
        .eq('status', 'active')
        .in('service_type', ['visa', 'both']);

      for (const ea of earlyAlertsToSend) {
        const r = ea.result;
        const target = MONITOR_TARGETS[r.countryCode];
        const { data: lastEarly } = await supabase
          .from('visa_early_signals')
          .select('created_at')
          .eq('country_code', r.countryCode)
          .eq('category', r.category)
          .eq('notified_count', 1)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastEarly?.created_at) {
          const ageMin = (Date.now() - new Date(lastEarly.created_at).getTime()) / 60000;
          if (ageMin < EARLY_COOLDOWN_MIN) continue;
        }

        const recipients = (allSubs || [])
          .filter((s) => s.telegram_chat_id && (s.countries || []).includes(r.countryCode))
          .map((s) => s.telegram_chat_id!);
        if (recipients.length === 0) continue;

        const catInfo = VISA_CATEGORIES.find((c) => c.key === r.category);
        const catAr = catInfo ? `${catInfo.icon} ${catInfo.ar}` : 'مواعيد';
        const newDatesLine = ea.details.newDates?.length
          ? `📅 <b>تواريخ جديدة:</b> ${ea.details.newDates.slice(0, 5).join('، ')}`
          : '';
        const newCentersLine = ea.details.newCenters?.length
          ? `🏢 <b>مراكز جديدة:</b> ${ea.details.newCenters.slice(0, 3).join('، ')}`
          : '';
        const text = [
          `⚡ <b>إشارة مبكرة — تغيّر مرصود</b>`,
          `━━━━━━━━━━━━━━━━━━`,
          `${target.flag} <b>${target.nameAr}</b> — ${catAr}`,
          `🔍 <b>النوع:</b> ${ea.reason === 'date_appeared' ? 'تواريخ جديدة ظهرت' : ea.reason === 'partial_open' ? 'فتح جزئي محتمل' : 'تغيّر في المحتوى'}`,
          `📊 <b>الثقة:</b> ${ea.details.slotDelta > 0 ? `+${ea.details.slotDelta} مواعيد` : 'تغيّر مرصود'}`,
          newDatesLine,
          newCentersLine,
          `━━━━━━━━━━━━━━━━━━`,
          `⚠️ <i>إشارة أولية — قد تحتاج لتأكيد. افتح الموقع فوراً.</i>`,
          `🔗 <a href="${target.officialUrl}">رابط المزود</a>`,
        ].filter(Boolean).join('\n');

        for (let i = 0; i < recipients.length; i += 10) {
          const batch = recipients.slice(i, i + 10);
          const results = await Promise.allSettled(
            batch.map((chatId) =>
              fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
                  reply_markup: {
                    inline_keyboard: [[{ text: `🚀 افتح الموقع الآن`, url: target.officialUrl }]],
                  },
                }),
              }).then((res) => res.ok),
            ),
          );
          earlySent += results.filter((x) => x.status === 'fulfilled' && x.value).length;
        }

        // Mark this signal as notified
        await supabase
          .from('visa_early_signals')
          .update({ notified_count: 1 })
          .eq('country_code', r.countryCode)
          .eq('category', r.category)
          .order('created_at', { ascending: false })
          .limit(1);
      }
    }

    // ──────────────────────────────────────────────
    // Admin alerts: repeated failures or sudden response changes
    // (focused on TLScontact provider but generic for any target)
    // ──────────────────────────────────────────────
    try {
      // Fetch admin telegram chat ids
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const adminIds = (adminRoles || []).map((r: any) => r.user_id);
      let adminChatIds: string[] = [];
      if (adminIds.length > 0) {
        const { data: adminProfiles } = await supabase
          .from('profiles')
          .select('telegram_id')
          .in('user_id', adminIds);
        adminChatIds = (adminProfiles || [])
          .map((p: any) => p.telegram_id)
          .filter((x: any) => !!x);
      }

      const sendAdminAlert = async (text: string) => {
        if (adminChatIds.length === 0) return;
        await Promise.allSettled(
          adminChatIds.map((chatId) =>
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
              }),
            }),
          ),
        );
      };

      const guessReason = (target: MonitorTarget, recent: any[], current: CheckResult): string => {
        const errs = recent
          .map((r) => (r.error_message || '').toLowerCase())
          .filter(Boolean)
          .join(' | ');
        const cur = (current.error || '').toLowerCase();
        const allErr = `${cur} ${errs}`.trim();
        if (/dns|name or service not known|enotfound/.test(allErr))
          return 'النطاق غير قابل للحلّ (DNS) — المزود قد يكون غيّر العنوان أو أوقف الخدمة';
        if (/captcha|cf-browser|access denied|forbidden|blocked/.test(allErr) || current.detectionMethod === 'blocked')
          return 'الموقع يحجب الطلبات الآلية (Anti-bot/CAPTCHA)';
        if (/timeout|timed out|aborted/.test(allErr))
          return 'استجابة بطيئة جداً أو انقطاع — قد يكون الموقع تحت ضغط أو في صيانة';
        if (current.httpStatus && current.httpStatus >= 500)
          return `خطأ في خادم المزود (HTTP ${current.httpStatus}) — صيانة أو عطل مؤقت`;
        if (current.httpStatus === 403 || current.httpStatus === 401)
          return 'حظر/منع وصول (HTTP 403/401) — ربما تغيّرت سياسة المزود';
        if (current.httpStatus === 404)
          return 'الصفحة غير موجودة (HTTP 404) — المزود غيّر بنية الموقع';
        return 'سبب غير محدد — يُرجى مراجعة سجل الفحوصات';
      };

      for (const result of siteResults) {
        const target = MONITOR_TARGETS[result.countryCode];
        // Pull last 5 checks for the same country+category
        const { data: history } = await supabase
          .from('visa_monitor_checks')
          .select('status, error_message, checked_at')
          .eq('country_code', result.countryCode)
          .eq('category', result.category)
          .order('checked_at', { ascending: false })
          .limit(6);
        const prior = (history || []).slice(1); // skip just-inserted row

        // 1) Repeated failures: current + last 2 are 'error'
        const recentErrors = [result, ...prior].slice(0, 3).filter((r: any) => r.status === 'error').length;
        const isRepeatedFailure = result.status === 'error' && recentErrors >= 3;

        // 2) Sudden response change: current differs from previous, and previous was stable
        const prevStatus = prior[0]?.status || null;
        const isSuddenChange =
          prevStatus &&
          prevStatus !== result.status &&
          // ignore the "open" change which is already alerted to subscribers
          !(result.status === 'open' && result.changed);

        if (!isRepeatedFailure && !isSuddenChange) continue;

        // Dedupe: skip if last check already triggered the same admin alert (notified flag reused)
        const reason = guessReason(target, prior, result);
        const catInfo = VISA_CATEGORIES.find((c) => c.key === result.category);
        const catLabel = catInfo ? `${catInfo.icon} ${catInfo.ar}` : result.category;
        const header = isRepeatedFailure
          ? `⚠️ <b>فشل متكرر في المراقبة</b>`
          : `🔄 <b>تغيّر مفاجئ في الاستجابة</b>`;
        const lines = [
          header,
          ``,
          `${target.flag} <b>${target.nameAr}</b> — ${catLabel} — ${target.provider}`,
          `📊 الحالة: <b>${result.status}</b>` + (prevStatus ? ` (سابقاً: ${prevStatus})` : ''),
          result.httpStatus ? `🌐 HTTP: ${result.httpStatus}` : ``,
          result.detectionMethod ? `🔍 طريقة الكشف: ${result.detectionMethod}` : ``,
          result.error ? `❌ الخطأ: <code>${(result.error || '').substring(0, 200)}</code>` : ``,
          ``,
          `💡 <b>السبب المحتمل:</b> ${reason}`,
          ``,
          `🔗 <a href="${target.officialUrl}">رابط المزود</a>`,
          `🤖 <i>تنبيه إداري تلقائي — VisaRadar</i>`,
        ].filter(Boolean).join('\n');

        await sendAdminAlert(lines);
      }
    } catch (alertErr) {
      console.error('Admin alert error:', alertErr);
    }

    // ──────────────────────────────────────────────
    // Send alerts for open appointments
    // - Fires immediately on any transition into "open"
    // - Re-notifies every 30 min while still open (in case users missed the first ping)
    // - Covers ALL visa categories (tourism / study / work) — the providers don't
    //   expose per-type slots, so any opening triggers a single combined alert.
    // ──────────────────────────────────────────────
    const RENOTIFY_WINDOW_MIN = 30;
    const openResults = siteResults.filter((r) => r.status === 'open');
    let totalSent = 0;

    if (openResults.length > 0) {
      // Only visa subscribers (or 'both') receive these alerts
      const { data: allSubscriptions } = await supabase
        .from('subscriptions')
        .select('user_id, telegram_chat_id, countries, service_type')
        .eq('status', 'active')
        .in('service_type', ['visa', 'both']);

      // Pull users who opted for daily/weekly digest — they will be EXCLUDED
      // from instant Telegram alerts (the digest function delivers them later).
      const subUserIds = Array.from(
        new Set((allSubscriptions || []).map((s) => s.user_id).filter(Boolean)),
      );
      let digestUserIds = new Set<string>();
      let langByUser = new Map<string, 'ar' | 'en'>();
      if (subUserIds.length > 0) {
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('user_id, digest_frequency, preferred_language')
          .in('user_id', subUserIds);
        for (const p of (prefs || []) as any[]) {
          if (p.digest_frequency && p.digest_frequency !== 'instant') {
            digestUserIds.add(p.user_id);
          }
          langByUser.set(p.user_id, p.preferred_language === 'en' ? 'en' : 'ar');
        }
      }

      for (const alert of openResults) {
        const target = MONITOR_TARGETS[alert.countryCode];
        const catInfo = VISA_CATEGORIES.find((c) => c.key === alert.category);
        const catAr = catInfo ? `${catInfo.icon} ${catInfo.ar}` : 'مواعيد';
        const catEn = catInfo ? `${catInfo.icon} ${catInfo.en}` : 'Appointments';

        // Decide if we should notify now (per country+category):
        let shouldNotify = alert.changed;
        if (!shouldNotify) {
          const { data: lastNotif } = await supabase
            .from('visa_notifications')
            .select('created_at')
            .eq('country_code', alert.countryCode)
            .eq('category', alert.category)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastAt = lastNotif?.created_at ? new Date(lastNotif.created_at).getTime() : 0;
          const ageMin = (Date.now() - lastAt) / 60000;
          shouldNotify = ageMin >= RENOTIFY_WINDOW_MIN;
        }
        if (!shouldNotify) continue;

        // ── Anti-False-Positive gateway ──
        // Require API + DOM + Calendar + Playwright confidence before broadcasting.
        try {
          const { data: gate } = await supabase.functions.invoke('evaluate-visa-alert', {
            body: {
              country_code: alert.countryCode,
              provider: target.provider,
              category: alert.category,
              check_only: true,
            },
          });
          const decision = (gate as any)?.decision;
          const confidence = (gate as any)?.confidence_score;
          const threshold = (gate as any)?.threshold;
          if (decision && decision !== 'sent') {
            console.log(`[Anti-FP] BLOCKED ${alert.countryCode}/${alert.category}: ${decision} (score=${confidence}/${threshold})`);
            continue;
          }
          console.log(`[Anti-FP] PASS ${alert.countryCode}/${alert.category}: score=${confidence}/${threshold}`);
        } catch (gateErr) {
          console.error('[Anti-FP] gateway error — failing safe (blocking alert):', gateErr);
          continue;
        }

        const recipients = (allSubscriptions || [])
          .filter((s) =>
            s.telegram_chat_id &&
            (s.countries || []).includes(alert.countryCode) &&
            !digestUserIds.has(s.user_id),
          )
          .map((s) => ({
            chatId: s.telegram_chat_id!,
            lang: (langByUser.get(s.user_id) ?? 'ar') as 'ar' | 'en',
          }));

        if (recipients.length === 0) continue;

        const isRecheck = !alert.changed;
        const COUNTRY_EN: Record<string, string> = {
          IT: 'Italy', FR: 'France', ES: 'Spain', DE: 'Germany', GR: 'Greece',
        };
        const nameEn = COUNTRY_EN[alert.countryCode] ?? alert.countryCode;

        const buildMessage = (lang: 'ar' | 'en') => {
          if (lang === 'en') {
            const nowStr = new Date().toLocaleString('en-GB', {
              timeZone: 'Africa/Algiers',
              hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
            });
            const header = isRecheck
              ? `🟢 <b>${catEn} appointments are still open</b>`
              : `🚨 <b>Urgent — ${catEn} appointments just opened</b>`;
            const badge = isRecheck ? '🟢 Ongoing' : '🆕 New';
            const text = [
              header,
              `━━━━━━━━━━━━━━━━━━`,
              `${target.flag} <b>${nameEn}</b>`,
              ``,
              `🛂 <b>Visa category:</b> ${catEn}`,
              `🏢 <b>Provider:</b> <code>${target.provider}</code>`,
              `📌 <b>Status:</b> ${badge}`,
              `🕒 <b>Detected at:</b> ${nowStr}`,
              `━━━━━━━━━━━━━━━━━━`,
              `⚡ <i>Slots run out in minutes — book now</i>`,
              ``,
              `🤖 <i>VisaRadar — automated alert</i>`,
            ].join('\n');
            const markup = {
              inline_keyboard: [
                [{ text: `🚀 Book now via ${target.provider}`, url: target.officialUrl }],
                [
                  { text: `🔕 Stop ${nameEn} alerts`, callback_data: `unsub:${alert.countryCode}` },
                  { text: '🛠️ Change service', callback_data: 'svc:menu' },
                ],
                [
                  { text: '🔔 Notification settings', url: 'https://visaradar.lovable.app/notifications' },
                  { text: '🌐 Open VisaRadar', url: 'https://visaradar.lovable.app' },
                ],
              ],
            };
            return { text, markup };
          }
          const nowStr = new Date().toLocaleString('ar-DZ', {
            timeZone: 'Africa/Algiers',
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
          });
          const header = isRecheck
            ? `🟢 <b>مواعيد ${catAr} لا تزال مفتوحة</b>`
            : `🚨 <b>تنبيه عاجل — مواعيد ${catAr} مفتوحة الآن</b>`;
          const badge = isRecheck ? '🟢 مستمرة' : '🆕 جديدة';
          const text = [
            header,
            `━━━━━━━━━━━━━━━━━━`,
            `${target.flag} <b>${target.nameAr}</b>`,
            ``,
            `🛂 <b>نوع التأشيرة:</b> ${catAr}`,
            `🏢 <b>المزود:</b> <code>${target.provider}</code>`,
            `📌 <b>الحالة:</b> ${badge}`,
            `🕒 <b>وقت الرصد:</b> ${nowStr}`,
            `━━━━━━━━━━━━━━━━━━`,
            `⚡ <i>المواعيد تنفد خلال دقائق — سارِع بالحجز</i>`,
            ``,
            `🤖 <i>VisaRadar — تنبيه تلقائي</i>`,
          ].join('\n');
          const markup = {
            inline_keyboard: [
              [{ text: `🚀 احجز الآن عبر ${target.provider}`, url: target.officialUrl }],
              [
                { text: `🔕 إيقاف تنبيهات ${target.nameAr}`, callback_data: `unsub:${alert.countryCode}` },
                { text: '🛠️ تغيير نوع الخدمة', callback_data: 'svc:menu' },
              ],
              [
                { text: '🔔 إدارة التنبيهات', url: 'https://visaradar.lovable.app/notifications' },
                { text: '🌐 فتح VisaRadar', url: 'https://visaradar.lovable.app' },
              ],
            ],
          };
          return { text, markup };
        };

        const payloadByLang = {
          ar: buildMessage('ar'),
          en: buildMessage('en'),
        };

        let sentCount = 0;
        for (let i = 0; i < recipients.length; i += 5) {
          const batch = recipients.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map((r) => {
              const p = payloadByLang[r.lang];
              return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: r.chatId,
                  text: p.text,
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                  reply_markup: p.markup,
                }),
              }).then((res) => res.ok);
            }),
          );
          sentCount += results.filter((r) => r.status === 'fulfilled' && r.value).length;
        }

        totalSent += sentCount;

        await supabase.from('visa_notifications').insert({
          country_code: alert.countryCode,
          category: alert.category,
          message_ar: isRecheck
            ? `تذكير تلقائي: مواعيد ${target.nameAr} (${catAr}) لا تزال مفتوحة عبر ${target.provider}`
            : `تنبيه تلقائي: تم اكتشاف فتح مواعيد ${target.nameAr} (${catAr}) عبر ${target.provider}`,
          sent_count: sentCount,
        });

        await supabase
          .from('visa_monitor_checks')
          .update({ notified: true })
          .eq('country_code', alert.countryCode)
          .eq('category', alert.category)
          .order('checked_at', { ascending: false })
          .limit(1);
      }
    }

    // ── Finalize worker_health
    if (workerRow?.id) {
      const succeeded = siteResults.filter((r) => r.status !== 'error').length;
      await supabase.from('worker_health').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - workerStartedAt,
        checks_attempted: siteResults.length,
        checks_succeeded: succeeded,
        checks_failed: siteResults.length - succeeded,
        metadata: { alertsSent: totalSent, skippedCooldown: Array.from(cooldownSkip) },
      }).eq('id', workerRow.id);
    }

    // ── Dispatch outbound webhooks (fire-and-forget) for visa_opened events
    const openTransitions = siteResults.filter((r) => r.status === 'open' && r.changed);
    if (openTransitions.length > 0) {
      const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
      for (const r of openTransitions) {
        fetch(`${supabaseUrl}/functions/v1/dispatch-webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon },
          body: JSON.stringify({
            event_type: 'visa_opened',
            country_code: r.countryCode,
            category: r.category,
            provider: MONITOR_TARGETS[r.countryCode].provider,
            check_id: checkIdByKey.get(`${r.countryCode}:${r.category}`),
            detected_at: new Date().toISOString(),
            confidence_score:
              (r.openScore + r.closedScore) === 0
                ? 0
                : Math.round((r.openScore / (r.openScore + r.closedScore)) * 100),
            earliest_date: r.earliestDate,
            centers_open: r.centersOpen,
            slot_count: r.slotCount,
          }),
        }).catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: siteResults.map((r) => ({
          country: r.countryCode,
          category: r.category,
          status: r.status,
          previousStatus: r.previousStatus,
          changed: r.changed,
          openScore: r.openScore,
          closedScore: r.closedScore,
          httpStatus: r.httpStatus,
          responseTimeMs: r.responseTimeMs,
          detectionMethod: r.detectionMethod,
        })),
        workerId,
        skippedCooldown: Array.from(cooldownSkip),
        alertsSent: totalSent,
        earlyAlertsSent: typeof earlySent === 'number' ? earlySent : 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Monitor error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      await sb.from('worker_health').insert({
        worker_id: `edge-failed-${Date.now()}`,
        status: 'crashed',
        error_message: msg.substring(0, 500),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
