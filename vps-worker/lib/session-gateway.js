/**
 * Human Verification Gateway client for VPS workers.
 *
 * - getSession(provider, country): fetches a healthy session (cookies + UA) to inject into the browser context.
 * - reportChallenge(...): creates a CAPTCHA/Cloudflare challenge and triggers a Telegram link to the user.
 * - reportOutcome(...): records success/captcha/block so health_score adapts.
 *
 * Workers MUST stop scanning a (provider, country) when reportChallenge() is called,
 * until either the challenge is resolved (a healthy session appears) or its cooldown expires.
 */

async function call(path, { method = 'POST', token, body, query } = {}) {
  const SUPA = process.env.SUPABASE_URL;
  const url = new URL(`${SUPA}/functions/v1/${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export async function getSession(token, provider, country) {
  const { ok, data } = await call('hvg-get-session', { method: 'GET', token, query: { provider, country } });
  if (!ok) return null;
  return data?.session || null;
}

export async function reportChallenge(token, {
  provider, country, challenge_type = 'captcha',
  user_id = null, session_id = null, target_url = null, http_status = null, snippet = null, priority = 5,
}) {
  const { ok, data } = await call('hvg-create-challenge', {
    method: 'POST', token,
    body: { provider, country, challenge_type, user_id, session_id, target_url, http_status, snippet, priority },
  });
  return ok ? data : null;
}

export async function reportOutcome(token, { session_id, outcome, http_status, duration_ms, worker_id, metadata }) {
  if (!session_id) return null;
  const { ok } = await call('hvg-session-heartbeat', {
    method: 'POST', token,
    body: { session_id, outcome, http_status, duration_ms, worker_id, metadata },
  });
  return ok;
}

/**
 * Inject cookies + localStorage into a Playwright BrowserContext.
 * cookies: array in Playwright-compatible format (Cookie-Editor / EditThisCookie export works
 * after light normalization).
 */
export async function applySessionToContext(context, session, defaultUrl) {
  if (!session?.cookies?.length) return;
  const normalized = session.cookies
    .map((c) => normalizeCookie(c, defaultUrl))
    .filter(Boolean);
  if (normalized.length) await context.addCookies(normalized);

  if (session.local_storage && defaultUrl) {
    const page = await context.newPage();
    try {
      await page.goto(defaultUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.evaluate((ls) => {
        try { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, String(v)); } catch {}
      }, session.local_storage);
    } catch {} finally { await page.close().catch(() => {}); }
  }
}

function normalizeCookie(c, defaultUrl) {
  if (!c?.name) return null;
  const out = {
    name: c.name,
    value: String(c.value ?? ''),
    domain: c.domain || (defaultUrl ? new URL(defaultUrl).hostname : undefined),
    path: c.path || '/',
    httpOnly: !!c.httpOnly,
    secure: c.secure ?? true,
    sameSite: mapSameSite(c.sameSite),
  };
  if (c.expirationDate) out.expires = Math.floor(Number(c.expirationDate));
  if (c.expires && !out.expires) out.expires = Math.floor(Number(c.expires));
  return out;
}

function mapSameSite(v) {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('strict')) return 'Strict';
  if (s.startsWith('none') || s === 'no_restriction') return 'None';
  return 'Lax';
}