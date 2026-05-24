// Auto-grant referral rewards when a referred user's first subscription is
// approved. Called from AdminRequests after the subscription row is inserted.
// Extends BOTH the referrer's and the referred user's active subscriptions
// by the configured bonus days from payment_settings, marks the referral
// rewarded, and logs each action in referral_reward_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "صلاحيات غير كافية" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { referred_user_id } = await req.json();
    if (!referred_user_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find pending referral for this referred user (not yet fully rewarded)
    const { data: referral } = await admin.from("referrals")
      .select("*")
      .eq("referred_id", referred_user_id)
      .maybeSingle();

    if (!referral) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_referral" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (referral.referrer_rewarded && referral.referred_rewarded) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_rewarded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load bonus day defaults
    const { data: ps } = await admin.from("payment_settings")
      .select("referrer_bonus_days, referred_bonus_days").limit(1).maybeSingle();
    const referrerDays = Math.max(0, Math.min(365, ps?.referrer_bonus_days ?? 7));
    const referredDays = Math.max(0, Math.min(365, ps?.referred_bonus_days ?? 7));

    const grants: Array<{ type: "referrer" | "referred"; userId: string; days: number; flag: string; daysField: string }> = [];
    if (!referral.referrer_rewarded && referrerDays > 0) {
      grants.push({ type: "referrer", userId: referral.referrer_id, days: referrerDays, flag: "referrer_rewarded", daysField: "referrer_bonus_days" });
    }
    if (!referral.referred_rewarded && referredDays > 0) {
      grants.push({ type: "referred", userId: referral.referred_id, days: referredDays, flag: "referred_rewarded", daysField: "referred_bonus_days" });
    }

    const results: any[] = [];
    for (const g of grants) {
      // Extend the user's most recent active subscription
      const { data: sub } = await admin.from("subscriptions")
        .select("id, expires_at").eq("user_id", g.userId).eq("status", "active")
        .order("expires_at", { ascending: false }).limit(1).maybeSingle();

      let applied = false;
      if (sub) {
        const newExpiry = new Date(new Date(sub.expires_at).getTime() + g.days * 86400000);
        await admin.from("subscriptions").update({ expires_at: newExpiry.toISOString() }).eq("id", sub.id);
        applied = true;
      }

      await admin.from("referrals")
        .update({ [g.flag]: true, [g.daysField]: applied ? g.days : 0 })
        .eq("id", referral.id);

      await admin.from("referral_reward_log").insert({
        referral_id: referral.id,
        action: "grant",
        reward_type: g.type,
        bonus_days: g.days,
        target_user_id: g.userId,
        performed_by: user.id,
        extension_applied: applied,
        notes: "auto-grant on subscription approval",
      });

      results.push({ type: g.type, days: g.days, applied });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "خطأ داخلي", details: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});