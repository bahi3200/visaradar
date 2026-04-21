import { test, expect } from "@playwright/test";

/**
 * Verifies that Notification.requestPermission() is NEVER invoked on:
 *   1. Public/unauthenticated landing pages
 *   2. Auth flows (/auth/login, /auth/register, /reset-password)
 *   3. Static legal pages (/privacy, /terms, /install, /help)
 *
 * We monkey-patch Notification.requestPermission via an init script and
 * assert the spy stays at zero calls after a generous settle delay
 * (the in-app auto-prompt fires after ~1.5s).
 */

const PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/auth/register",
  "/reset-password",
  "/privacy",
  "/terms",
  "/install",
  "/help",
];

test.describe("Notification permission gating", () => {
  for (const path of PUBLIC_PATHS) {
    test(`does NOT call Notification.requestPermission on ${path}`, async ({ page }) => {
      // Install the spy before any app code runs.
      await page.addInitScript(() => {
        // Pretend the API exists and is in default state.
        // @ts-expect-error – test stub
        window.__permissionRequests = 0;
        const stub = function () {} as unknown as typeof Notification;
        Object.defineProperty(stub, "permission", { value: "default", configurable: true });
        Object.defineProperty(stub, "requestPermission", {
          value: () => {
            // @ts-expect-error – test stub
            window.__permissionRequests += 1;
            return Promise.resolve("default");
          },
          configurable: true,
        });
        // @ts-expect-error – overriding global
        window.Notification = stub;
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      // Auto-prompt fires ~1500ms after auth resolves; wait longer for safety.
      await page.waitForTimeout(3000);

      const calls = await page.evaluate(
        // @ts-expect-error – test stub
        () => window.__permissionRequests as number
      );
      expect(calls, `requestPermission was called on public path ${path}`).toBe(0);
    });
  }
});
