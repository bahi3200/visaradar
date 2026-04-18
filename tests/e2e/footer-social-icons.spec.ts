import { test, expect } from "../../playwright-fixture";

/**
 * E2E: تأكد من ظهور أيقونات السوشيال ميديا الأربع في الفوتر
 * عند زيارة الصفحة الرئيسية كزائر غير مسجل.
 *
 * يعتمد على:
 *  - سياسة RLS التي تسمح بقراءة مفاتيح site_settings ذات البادئة public_
 *  - وجود الصفوف الأربعة: public_facebook_url, public_instagram_url,
 *    public_tiktok_url, public_telegram_url
 */
test.describe("Footer social icons (guest)", () => {
  test("renders Facebook, Instagram, TikTok, and Telegram icons", async ({ page }) => {
    await page.goto("/");

    // الفوتر موجود في DOM
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // مرّر إلى الفوتر لضمان تحميل أي محتوى كسول
    await footer.scrollIntoViewIfNeeded();

    // التحقق من الأيقونات الأربع عبر aria-label (مستقل عن الـ SVG ولغة الواجهة)
    const expectedLabels = ["Facebook", "Instagram", "TikTok", "Telegram"];

    for (const label of expectedLabels) {
      const link = footer.locator(`a[aria-label="${label}"]`);
      await expect(link, `${label} link should be visible in footer`).toBeVisible();

      // الرابط يحتوي على href فعلي (ليس فارغاً)
      const href = await link.getAttribute("href");
      expect(href, `${label} link should have a non-empty href`).toBeTruthy();
      expect(href!.length).toBeGreaterThan(5);

      // الرابط يحتوي على أيقونة SVG
      await expect(link.locator("svg")).toBeVisible();
    }

    // العدد الإجمالي للأيقونات في الفوتر = 4
    const allSocialLinks = footer.locator("a[aria-label]").filter({
      has: page.locator("svg"),
    });
    await expect(allSocialLinks).toHaveCount(4);
  });
});
