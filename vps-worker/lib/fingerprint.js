/**
 * Browser-side fingerprint overrides applied via addInitScript.
 * Rotates GPU/WebGL renderer, fonts list, screen, hardware concurrency,
 * device memory, and mediaDevices.
 */

const GPU_POOL = [
  { vendor: 'Intel Inc.', renderer: 'Intel(R) Iris(TM) Plus Graphics 640' },
  { vendor: 'Intel Inc.', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1' },
  { vendor: 'Qualcomm', renderer: 'Adreno (TM) 650' },
];

const FONT_POOL = [
  ['Arial','Calibri','Cambria','Consolas','Courier New','Georgia','Segoe UI','Tahoma','Times New Roman','Verdana'],
  ['Arial','Helvetica Neue','Menlo','Monaco','SF Pro Text','Times','Geneva'],
  ['Arial','DejaVu Sans','Liberation Sans','Ubuntu','Cantarell','Noto Sans'],
];

const SCREEN_POOL = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
];

const CONCURRENCY_POOL = [4, 6, 8, 8, 12, 16];
const MEMORY_POOL = [4, 8, 8, 16];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function buildFingerprint() {
  return {
    gpu: pick(GPU_POOL),
    fonts: pick(FONT_POOL),
    screen: pick(SCREEN_POOL),
    hardwareConcurrency: pick(CONCURRENCY_POOL),
    deviceMemory: pick(MEMORY_POOL),
    mediaDevices: Math.random() > 0.5
      ? [
          { kind: 'audioinput', label: '', deviceId: 'default', groupId: 'g1' },
          { kind: 'audiooutput', label: '', deviceId: 'default', groupId: 'g1' },
          { kind: 'videoinput', label: '', deviceId: 'cam1', groupId: 'g2' },
        ]
      : [
          { kind: 'audioinput', label: '', deviceId: 'default', groupId: 'g1' },
        ],
  };
}

/** Inject overrides into the page BEFORE any site script runs. */
export async function applyFingerprint(context, fp) {
  const initScript = `
    (() => {
      try {
        // hardwareConcurrency / deviceMemory
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory} });

        // screen overrides
        Object.defineProperty(screen, 'width',  { get: () => ${fp.screen.width} });
        Object.defineProperty(screen, 'height', { get: () => ${fp.screen.height} });
        Object.defineProperty(screen, 'availWidth',  { get: () => ${fp.screen.width} });
        Object.defineProperty(screen, 'availHeight', { get: () => ${fp.screen.height - 40} });

        // WebGL spoof
        const _getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (p) {
          if (p === 37445) return ${JSON.stringify(fp.gpu.vendor)};
          if (p === 37446) return ${JSON.stringify(fp.gpu.renderer)};
          return _getParameter.call(this, p);
        };
        if (typeof WebGL2RenderingContext !== 'undefined') {
          const _g2 = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function (p) {
            if (p === 37445) return ${JSON.stringify(fp.gpu.vendor)};
            if (p === 37446) return ${JSON.stringify(fp.gpu.renderer)};
            return _g2.call(this, p);
          };
        }

        // mediaDevices.enumerateDevices spoof
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const fakeDevices = ${JSON.stringify(fp.mediaDevices)};
          navigator.mediaDevices.enumerateDevices = async () => fakeDevices;
        }

        // document.fonts.check spoof — only report fonts from our pool as available
        if (document.fonts && document.fonts.check) {
          const allowed = new Set(${JSON.stringify(fp.fonts)});
          const orig = document.fonts.check.bind(document.fonts);
          document.fonts.check = (font, text) => {
            const m = String(font).match(/['"]?([^'"]+)['"]?$/);
            const family = m ? m[1].trim() : '';
            if (allowed.has(family)) return orig(font, text);
            return false;
          };
        }
      } catch (e) { /* swallow */ }
    })();
  `;
  await context.addInitScript(initScript);
}