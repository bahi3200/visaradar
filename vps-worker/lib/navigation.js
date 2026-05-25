import { humanScroll, humanFocusBlur, humanIdle, sleep, randInt } from './humanize.js';

const HOMEPAGES = {
  vfs: 'https://visa.vfsglobal.com/',
  tls: 'https://visas-fr.tlscontact.com/',
  bls: 'https://blsinternational.com/',
};

/**
 * Realistic pre-navigation: sometimes visit provider homepage first, scroll, idle.
 * Returns true if homepage was visited.
 */
export async function maybeVisitHomepage(page, provider, { probability = 0.4 } = {}) {
  if (Math.random() > probability) return false;
  const home = HOMEPAGES[(provider || '').toLowerCase()];
  if (!home) return false;
  try {
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(humanIdle(800, 3000));
    await humanScroll(page, { totalPx: randInt(400, 1400), speed: 'medium' });
    await humanFocusBlur(page);
    await sleep(humanIdle(500, 2000));
    return true;
  } catch {
    return false;
  }
}

/**
 * Follow a couple of random internal links before reaching the target URL.
 * Helps build a natural-looking referer chain.
 */
export async function naturalNavigateTo(page, targetUrl, { hops = 2 } = {}) {
  for (let i = 0; i < hops; i++) {
    try {
      const link = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.href)
          .filter((h) => {
            try {
              const u = new URL(h);
              return u.hostname === location.hostname && !u.hash;
            } catch { return false; }
          });
        if (!anchors.length) return null;
        return anchors[Math.floor(Math.random() * anchors.length)];
      });
      if (!link) break;
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await sleep(humanIdle(600, 2200));
      await humanScroll(page, { totalPx: randInt(200, 700) });
    } catch { break; }
  }
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
}