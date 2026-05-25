import { sleep, humanIdle } from './humanize.js';

const CF_TITLE_RE = /just a moment|attention required|checking your browser|please wait/i;
const CF_BODY_RE  = /cf-(chl|browser)-verify|cloudflare|cf_chl_/i;

/** Detect a Cloudflare-style interstitial / challenge on the current page. */
export async function detectCloudflare(page) {
  try {
    const title = (await page.title()).toLowerCase();
    if (CF_TITLE_RE.test(title)) return { detected: true, kind: 'title', title };
    const html = await page.content();
    if (CF_BODY_RE.test(html)) return { detected: true, kind: 'body' };
    // Some CF challenges set this cookie
    const cookies = await page.context().cookies();
    if (cookies.some((c) => /cf_chl/.test(c.name))) return { detected: true, kind: 'cookie' };
  } catch { /* */ }
  return { detected: false };
}

/**
 * Wait up to `maxWaitMs` for a CF challenge to clear automatically.
 * Returns true if cleared.
 */
export async function waitForChallenge(page, maxWaitMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(2_000);
    const r = await detectCloudflare(page);
    if (!r.detected) return true;
  }
  return false;
}

/**
 * Standard CF retry strategy: detect → wait → if still blocked, sleep random
 * 5–25s and signal caller to rotate fingerprint/proxy.
 */
export async function handleCloudflare(page) {
  const det = await detectCloudflare(page);
  if (!det.detected) return { detected: false, cleared: true };
  const cleared = await waitForChallenge(page, 30_000);
  if (cleared) return { detected: true, cleared: true };
  await sleep(humanIdle(5_000, 25_000));
  return { detected: true, cleared: false, rotateFingerprint: true };
}