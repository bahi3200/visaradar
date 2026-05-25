import { humanIdle } from './humanize.js';

/** Poisson-ish gap (in seconds) between scans for a provider. */
export function jitteredInterval(profile) {
  const min = profile?.min_interval_s ?? 30;
  const max = profile?.max_interval_s ?? 120;
  const jitterPct = (profile?.jitter_pct ?? 35) / 100;
  const base = min + Math.random() * (max - min);
  // Asymmetric jitter (negative shift up to half, positive up to full)
  const dir = Math.random() < 0.5 ? -0.5 : 1;
  const jitter = base * jitterPct * dir * Math.random();
  return Math.max(min, Math.round(base + jitter));
}

/** Pause between actions inside a scan (mouse, click, scroll cycles). */
export function actionPause(profile) {
  return humanIdle(profile?.min_idle_ms ?? 200, profile?.max_idle_ms ?? 4000);
}

/** Fetch timing profiles map from Supabase REST (provider -> profile). */
export async function loadTimingProfiles(supabaseUrl, serviceKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/provider_timing_profiles?select=*&is_active=eq.true`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const map = {};
    for (const r of rows) map[(r.provider || '').toLowerCase()] = r;
    return map;
  } catch { return {}; }
}