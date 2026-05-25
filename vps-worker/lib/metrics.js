/**
 * Report stealth metrics back to the server.
 */

export async function sendStealthMetrics(supabaseUrl, serviceKey, metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) return { ok: true, inserted: 0 };
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ingest-stealth-metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ metrics }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Pick a stealth profile from the server (highest score, active). */
export async function pickStealthProfile(supabaseUrl, serviceKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stealth_profiles?select=*&is_active=eq.true&order=score.desc&limit=20`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    // weighted pick toward high-score profiles
    const top = rows.slice(0, 5);
    return top[Math.floor(Math.random() * top.length)];
  } catch { return null; }
}

export async function isProxyQuarantined(supabaseUrl, serviceKey, label, provider) {
  try {
    const url = `${supabaseUrl}/rest/v1/proxy_quarantine?select=id&proxy_label=eq.${encodeURIComponent(label)}&provider=eq.${encodeURIComponent(provider)}&released_at=is.null&quarantined_until=gt.${new Date().toISOString()}&limit=1`;
    const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!res.ok) return false;
    const rows = await res.json();
    return rows.length > 0;
  } catch { return false; }
}