/**
 * Adaptive headless/headful + interval decisions based on recent stealth metrics.
 */

export async function getProviderRiskSummary(supabaseUrl, serviceKey, provider) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stealth_metrics?select=outcome&provider=eq.${encodeURIComponent(provider)}&created_at=gte.${new Date(Date.now() - 60 * 60_000).toISOString()}`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      },
    );
    if (!res.ok) return { total: 0, captcha: 0, block: 0 };
    const rows = await res.json();
    const captcha = rows.filter((r) => r.outcome === 'captcha' || r.outcome === 'cloudflare').length;
    const block = rows.filter((r) => r.outcome === 'block').length;
    return { total: rows.length, captcha, block };
  } catch { return { total: 0, captcha: 0, block: 0 }; }
}

/** Decide whether this scan should run headful and how long to back off. */
export function adaptiveDecision(profile, riskSummary) {
  if (profile?.headful_only) return { headful: true, slowdownMultiplier: 1 };
  if (riskSummary.total < 5) return { headful: false, slowdownMultiplier: 1 };
  const captchaRate = riskSummary.captcha / riskSummary.total;
  if (captchaRate > 0.15 || riskSummary.block >= 3) {
    return { headful: true, slowdownMultiplier: 2 };
  }
  if (captchaRate > 0.07) {
    return { headful: Math.random() < 0.6, slowdownMultiplier: 1.5 };
  }
  return { headful: false, slowdownMultiplier: 1 };
}