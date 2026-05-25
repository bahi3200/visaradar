/**
 * Human session + stealth profile rotation.
 * Fetches active profiles from Supabase and rotates per (provider, country).
 */

const cache = { profiles: [], humans: [], fetchedAt: 0 }
const TTL_MS = 5 * 60_000

async function fetchTable(supaUrl, token, table, query = '*') {
  const res = await fetch(`${supaUrl}/rest/v1/${table}?select=${encodeURIComponent(query)}&is_active=eq.true`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json().catch(() => [])
}

export async function loadProfiles(supaUrl, token) {
  if (Date.now() - cache.fetchedAt < TTL_MS && cache.profiles.length) return cache
  const [profiles, humans] = await Promise.all([
    fetchTable(supaUrl, token, 'stealth_profiles', 'id,name,user_agent,viewport_width,viewport_height,locale,timezone,score'),
    fetchTable(supaUrl, token, 'human_session_profiles', 'id,name,mouse_speed_min,mouse_speed_max,scroll_pattern,idle_avg_ms,idle_jitter_ms,navigation_style,visit_homepage_prob,hover_prob'),
  ])
  cache.profiles = Array.isArray(profiles) ? profiles : []
  cache.humans = Array.isArray(humans) ? humans : []
  cache.fetchedAt = Date.now()
  return cache
}

function pickWeighted(items, weightKey = 'score') {
  if (!items.length) return null
  const weights = items.map((i) => Math.max(1, Number(i[weightKey] || 50)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/** Pick a stealth + human profile pair for a given provider/country. */
export async function pickProfilePair(supaUrl, token, { provider, country } = {}) {
  const { profiles, humans } = await loadProfiles(supaUrl, token)
  const stealth = pickWeighted(profiles, 'score')
  const human = humans.length ? humans[Math.floor(Math.random() * humans.length)] : null
  return { stealth, human, provider, country }
}

export function invalidateProfileCache() {
  cache.fetchedAt = 0
}