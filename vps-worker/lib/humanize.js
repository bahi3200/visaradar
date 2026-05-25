/**
 * Human-like interaction primitives.
 * - Bezier mouse curves
 * - log-normal idle pauses
 * - realistic variable-speed scroll
 * - hover-before-click
 * - focus/blur emissions
 */

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** log-normal distribution clamped to [min,max] — feels more human than uniform. */
export function humanIdle(min = 200, max = 4000) {
  const mu = Math.log(min) + (Math.log(max) - Math.log(min)) * 0.35;
  const sigma = 0.6;
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random() || 1e-6;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const v = Math.exp(mu + sigma * z);
  return Math.max(min, Math.min(max, Math.round(v)));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cubic Bezier curve point. */
function bezier(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Move mouse along a humanized bezier curve, with jitter. */
export async function humanMouseMove(page, fromX, fromY, toX, toY, speed = 'medium') {
  const steps = speed === 'fast' ? 18 : speed === 'slow' ? 50 : 30;
  const dx = toX - fromX;
  const dy = toY - fromY;
  // two control points perpendicular-ish to the path with random offsets
  const cx1 = fromX + dx * 0.3 + (Math.random() - 0.5) * Math.abs(dy) * 0.6;
  const cy1 = fromY + dy * 0.3 + (Math.random() - 0.5) * Math.abs(dx) * 0.6;
  const cx2 = fromX + dx * 0.7 + (Math.random() - 0.5) * Math.abs(dy) * 0.6;
  const cy2 = fromY + dy * 0.7 + (Math.random() - 0.5) * Math.abs(dx) * 0.6;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = bezier(t, fromX, cx1, cx2, toX) + (Math.random() - 0.5) * 1.5;
    const y = bezier(t, fromY, cy1, cy2, toY) + (Math.random() - 0.5) * 1.5;
    await page.mouse.move(x, y);
    if (i % (Math.floor(steps / 6) || 1) === 0) await sleep(randInt(4, 18));
  }
}

/** Hover over a selector with a curved path, then optionally click. */
export async function humanHoverClick(page, selector, { click = true, speed = 'medium' } = {}) {
  const el = await page.$(selector);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;

  const target = {
    x: box.x + box.width * (0.3 + Math.random() * 0.4),
    y: box.y + box.height * (0.3 + Math.random() * 0.4),
  };

  // We don't know current mouse position, so start from a plausible spot
  const viewport = page.viewportSize() || { width: 1366, height: 768 };
  const from = {
    x: randInt(viewport.width * 0.2, viewport.width * 0.8),
    y: randInt(viewport.height * 0.2, viewport.height * 0.8),
  };

  await humanMouseMove(page, from.x, from.y, target.x, target.y, speed);
  await sleep(humanIdle(120, 600));
  if (click) {
    await page.mouse.down();
    await sleep(randInt(40, 130));
    await page.mouse.up();
  }
  return true;
}

/** Realistic variable-speed scrolling in chunks, with reversal pauses. */
export async function humanScroll(page, { totalPx = 1500, speed = 'medium' } = {}) {
  const chunkBase = speed === 'fast' ? 220 : speed === 'slow' ? 80 : 140;
  let scrolled = 0;
  while (scrolled < totalPx) {
    const chunk = chunkBase + randInt(-40, 60);
    await page.mouse.wheel(0, chunk);
    scrolled += chunk;
    await sleep(humanIdle(120, 700));
    // 12% chance: scroll back a bit (re-reading)
    if (Math.random() < 0.12) {
      await page.mouse.wheel(0, -randInt(60, 180));
      await sleep(humanIdle(200, 900));
    }
  }
}

/** Fire focus/blur on a random visible input to look like a human inspecting fields. */
export async function humanFocusBlur(page) {
  try {
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, [tabindex]'));
      const visible = inputs.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!visible.length) return;
      const el = visible[Math.floor(Math.random() * visible.length)];
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      setTimeout(() => el.dispatchEvent(new FocusEvent('blur', { bubbles: true })),
        200 + Math.random() * 800);
    });
  } catch { /* non-fatal */ }
}