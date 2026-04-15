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
    provider: 'Capago (TLScontact)',
    checkUrl: 'https://fr.capago.net/rendez-vous/dz/',
    officialUrl: 'https://fr.capago.net/rendez-vous/dz/',
    apiEndpoints: [
      { url: 'https://fr.capago.net/api/rendez-vous/dz/slots', method: 'GET' },
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
};

// ──────────────────────────────────────────────
// Layer 1: Keyword-based weighted scoring
// ──────────────────────────────────────────────
type Indicator = { keyword: string; weight: number };

function analyzeKeywords(
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
function analyzeScriptData(
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
async function probeApiEndpoints(
  endpoints: MonitorTarget['apiEndpoints'],
): Promise<{ openScore: number; closedScore: number; apiResults: string[] }> {
  if (!endpoints || endpoints.length === 0) return { openScore: 0, closedScore: 0, apiResults: [] };

  let openScore = 0;
  let closedScore = 0;
  const apiResults: string[] = [];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(ep.url, {
        method: ep.method || 'GET',
        headers: {
          'User-Agent': randomPick(USER_AGENTS),
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': randomPick(ACCEPT_LANGUAGES),
          ...ep.headers,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await resp.text();
      apiResults.push(`API ${ep.url} → HTTP ${resp.status}, ${text.length} bytes`);

      // Skip non-success responses
      if (resp.status >= 400) {
        // 403/404 from appointment API often means closed
        if (resp.status === 403 || resp.status === 404 || resp.status === 422) {
          closedScore += 2;
          apiResults.push(`  → HTTP ${resp.status} interpreted as closed`);
        }
        continue;
      }

      // Try parsing JSON
      try {
        const json = JSON.parse(text);
        
        // Common API patterns for availability
        if (typeof json === 'object' && json !== null) {
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
    }
  }

  return { openScore, closedScore, apiResults };
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
function determineStatus(
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

  // Strong closed signal
  if (totalClosed >= 4) return { status: 'closed', totalOpen, totalClosed, detectionMethod };
  // Strong open signal
  if (totalOpen >= 4 && totalOpen > totalClosed) return { status: 'open', totalOpen, totalClosed, detectionMethod };
  // Moderate signals
  if (totalClosed >= 2 && totalOpen === 0) return { status: 'closed', totalOpen, totalClosed, detectionMethod };
  if (totalOpen >= 2 && totalClosed === 0) return { status: 'open', totalOpen, totalClosed, detectionMethod };

  return { status: 'unknown', totalOpen, totalClosed, detectionMethod };
}

// ──────────────────────────────────────────────
// Fetch with retry, rotating headers & jitter
// ──────────────────────────────────────────────
async function fetchWithRetry(url: string, maxRetries = 2): Promise<{ response: Response; durationMs: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) await randomDelay(1500, 4000);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const start = Date.now();
      const response = await fetch(url, {
        headers: {
          'User-Agent': randomPick(USER_AGENTS),
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
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      const durationMs = Date.now() - start;
      clearTimeout(timeout);
      return { response, durationMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError!;
}

// ──────────────────────────────────────────────
// Check a single site (multi-layer)
// ──────────────────────────────────────────────
async function checkSite(countryCode: string, target: MonitorTarget): Promise<CheckResult> {
  try {
    // Layer 0: Fetch the HTML page
    const { response, durationMs } = await fetchWithRetry(target.checkUrl);
    const html = await response.text();

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const snippet = bodyText.substring(0, 500);

    // Detect blocking / CAPTCHA
    const isBlocked =
      /captcha|challenge|blocked|access denied|403 forbidden|cf-browser/i.test(html) &&
      bodyText.length < 200;

    if (isBlocked) {
      return {
        countryCode, status: 'error', previousStatus: null,
        snippet: '[Blocked/CAPTCHA detected]', error: 'Anti-bot protection detected',
        changed: false, openScore: 0, closedScore: 0,
        httpStatus: response.status, responseTimeMs: durationMs,
        detectionMethod: 'blocked',
      };
    }

    // Run all detection layers in parallel
    const [apiResult] = await Promise.all([
      probeApiEndpoints(target.apiEndpoints),
    ]);

    const keywordResult = analyzeKeywords(
      html + ' ' + bodyText,
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

    const { status, totalOpen, totalClosed, detectionMethod } = determineStatus(layers);

    console.log(`[${countryCode}] Detection: ${detectionMethod} → ${status} (open:${totalOpen} closed:${totalClosed})`);
    if (apiResult.apiResults.length > 0) {
      console.log(`[${countryCode}] API probes:`, apiResult.apiResults.join(' | '));
    }
    if (scriptResult.detectedData.length > 0) {
      console.log(`[${countryCode}] Script data:`, scriptResult.detectedData.join(' | '));
    }

    return {
      countryCode, status, previousStatus: null,
      snippet, error: null, changed: false,
      openScore: totalOpen, closedScore: totalClosed,
      httpStatus: response.status, responseTimeMs: durationMs,
      detectionMethod,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error checking ${countryCode}:`, errorMsg);
    return {
      countryCode, status: 'error', previousStatus: null,
      snippet: null, error: errorMsg, changed: false,
      openScore: 0, closedScore: 0,
      httpStatus: null, responseTimeMs: 0,
      detectionMethod: 'error',
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

    // Stagger checks with random delays
    const siteResults: CheckResult[] = [];
    for (const code of countryCodes) {
      if (siteResults.length > 0) await randomDelay(800, 3000);
      const result = await checkSite(code, MONITOR_TARGETS[code]);
      siteResults.push(result);
    }

    // Fetch previous statuses
    const previousStatuses = await Promise.all(
      countryCodes.map(async (code) => {
        const { data } = await supabase
          .from('visa_monitor_checks')
          .select('status')
          .eq('country_code', code)
          .order('checked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { code, status: data?.status || null };
      }),
    );

    // Merge & detect changes
    const prevMap = new Map(previousStatuses.map((p) => [p.code, p.status]));
    for (const result of siteResults) {
      result.previousStatus = prevMap.get(result.countryCode) || null;
      result.changed = result.previousStatus
        ? result.previousStatus !== result.status
        : result.status === 'open';
    }

    // Batch insert
    const insertData = siteResults.map((result) => {
      const target = MONITOR_TARGETS[result.countryCode];
      return {
        country_code: result.countryCode,
        provider: target.provider,
        status: result.status,
        previous_status: result.previousStatus,
        response_snippet: result.snippet,
        error_message: result.error,
        detection_method: result.detectionMethod,
        notified: false,
      };
    });

    await supabase.from('visa_monitor_checks').insert(insertData);

    // Send alerts for "open" changes
    const openAlerts = siteResults.filter((r) => r.status === 'open' && r.changed);
    let totalSent = 0;

    if (openAlerts.length > 0) {
      const { data: allSubscriptions } = await supabase
        .from('subscriptions')
        .select('telegram_chat_id, countries')
        .eq('status', 'active');

      for (const alert of openAlerts) {
        const target = MONITOR_TARGETS[alert.countryCode];

        const chatIds = (allSubscriptions || [])
          .filter((s) => s.telegram_chat_id && (s.countries || []).includes(alert.countryCode))
          .map((s) => s.telegram_chat_id!);

        if (chatIds.length === 0) continue;

        const message = [
          `🚨 <b>تنبيه عاجل! مواعيد مفتوحة ${target.flag}</b>`,
          ``,
          `🔔 تم اكتشاف فتح مواعيد تأشيرة <b>${target.nameAr}</b>!`,
          ``,
          `📍 <b>المزود:</b> ${target.provider}`,
          `🔗 <a href="${target.officialUrl}">احجز موعدك الآن!</a>`,
          ``,
          `⚡ <b>سارع! المواعيد تنفد بسرعة!</b>`,
          ``,
          `🤖 <i>تنبيه تلقائي من VisaRadar</i>`,
        ].join('\n');

        let sentCount = 0;
        for (let i = 0; i < chatIds.length; i += 5) {
          const batch = chatIds.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map((chatId) =>
              fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: message,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                }),
              }).then((res) => res.ok),
            ),
          );
          sentCount += results.filter((r) => r.status === 'fulfilled' && r.value).length;
        }

        totalSent += sentCount;

        await supabase.from('visa_notifications').insert({
          country_code: alert.countryCode,
          message_ar: `تنبيه تلقائي: تم اكتشاف فتح مواعيد ${target.nameAr} عبر ${target.provider}`,
          sent_count: sentCount,
        });

        await supabase
          .from('visa_monitor_checks')
          .update({ notified: true })
          .eq('country_code', alert.countryCode)
          .order('checked_at', { ascending: false })
          .limit(1);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: siteResults.map((r) => ({
          country: r.countryCode,
          status: r.status,
          previousStatus: r.previousStatus,
          changed: r.changed,
          openScore: r.openScore,
          closedScore: r.closedScore,
          httpStatus: r.httpStatus,
          responseTimeMs: r.responseTimeMs,
          detectionMethod: r.detectionMethod,
        })),
        alertsSent: totalSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Monitor error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
