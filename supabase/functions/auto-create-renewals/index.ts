// Auto-create renewal subscription_requests for subscribers who opted-in to
// auto-renewal. Runs daily via cron. For each active subscription with
// auto_renew=true expiring within RENEWAL_WINDOW_DAYS, creates a pending
// subscription_request pre-filled with current package + countries, marks
// the subscription's renewal_request_created_at, and notifies the user via
// Telegram with payment instructions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RENEWAL_WINDOW_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 86400000).toISOString();

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, package_id, countries, service_type, expires_at, telegram_chat_id, renewal_request_created_at, packages(name_ar, price, promo_price, duration_months)")
    .eq("auto_renew", true)
    .eq("status", "active")
    .lte("expires_at", cutoff)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const sub of subs ?? []) {
    // Skip if renewal request already created in the last 7 days
    if (sub.renewal_request_created_at) {
      const last = new Date(sub.renewal_request_created_at).getTime();
      if (Date.now() - last < RENEWAL_WINDOW_DAYS * 86400000) {
        skipped++;
        continue;
      }
    }

    // Skip if there's already a pending renewal request for this subscription
    const { data: existing } = await supabase
      .from("subscription_requests")
      .select("id")
      .eq("renewing_subscription_id", sub.id)
      .in("status", ["pending", "under_review"])
      .limit(1);
    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // Fetch user profile for full_name/email/phone
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", sub.user_id)
      .maybeSingle();
    const { data: userResp } = await supabase.auth.admin.getUserById(sub.user_id);
    const email = userResp?.user?.email ?? "";

    const { error: insertErr } = await supabase.from("subscription_requests").insert({
      user_id: sub.user_id,
      package_id: sub.package_id,
      service_type: sub.service_type,
      countries: sub.countries,
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? null,
      email,
      telegram_chat_id: sub.telegram_chat_id,
      status: "pending",
      is_auto_renewal: true,
      renewing_subscription_id: sub.id,
      admin_notes: `طلب تجديد تلقائي للاشتراك المنتهي في ${new Date(sub.expires_at).toLocaleDateString("ar-DZ")}`,
    });

    if (insertErr) {
      errors.push(`${sub.id}: ${insertErr.message}`);
      continue;
    }

    await supabase
      .from("subscriptions")
      .update({ renewal_request_created_at: new Date().toISOString() })
      .eq("id", sub.id);

    // Notify via Telegram if linked
    if (sub.telegram_chat_id) {
      const pkg = Array.isArray(sub.packages) ? sub.packages[0] : sub.packages;
      const price = pkg?.promo_price ?? pkg?.price ?? 0;
      const daysLeft = Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000);
      const msg = [
        `🔔 <b>تذكير تجديد اشتراكك</b>`,
        ``,
        `📦 الباقة: <b>${pkg?.name_ar ?? "—"}</b>`,
        `⏰ ينتهي خلال: <b>${daysLeft} يوم</b>`,
        `💰 المبلغ: <b>${price.toLocaleString()} د.ج</b>`,
        ``,
        `تم إنشاء طلب تجديد جاهز — ادفع عبر CCP/BaridiMob وارفع الإيصال:`,
        `🔗 https://visaradar.lovable.app/my-requests`,
      ].join("\n");

      try {
        await supabase.functions.invoke("telegram-send-message", {
          body: { chat_id: sub.telegram_chat_id, text: msg, parse_mode: "HTML" },
        });
      } catch (e) {
        console.error("telegram send failed", e);
      }
    }

    created++;
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: subs?.length ?? 0, created, skipped, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});