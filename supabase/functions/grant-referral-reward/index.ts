import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "صلاحيات غير كافية" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { referral_id, reward_type, bonus_days, action } = body;

    if (!referral_id || !reward_type || !["referrer", "referred"].includes(reward_type)) {
      return new Response(JSON.stringify({ error: "بيانات غير صالحة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get referral
    const { data: referral, error: refErr } = await adminClient
      .from("referrals")
      .select("*")
      .eq("id", referral_id)
      .single();

    if (refErr || !referral) {
      return new Response(JSON.stringify({ error: "الإحالة غير موجودة" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rewardField = reward_type === "referrer" ? "referrer_rewarded" : "referred_rewarded";
    const bonusDaysField = reward_type === "referrer" ? "referrer_bonus_days" : "referred_bonus_days";
    const targetUserId = reward_type === "referrer" ? referral.referrer_id : referral.referred_id;

    // === REVOKE ACTION ===
    if (action === "revoke") {
      if (!referral[rewardField]) {
        return new Response(JSON.stringify({ error: "المكافأة غير ممنوحة أصلاً" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const grantedDays = referral[bonusDaysField] || 0;

      // Subtract days from active subscription if days were granted
      if (grantedDays > 0) {
        const { data: activeSub } = await adminClient
          .from("subscriptions")
          .select("id, expires_at")
          .eq("user_id", targetUserId)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSub) {
          const currentExpiry = new Date(activeSub.expires_at);
          const newExpiry = new Date(currentExpiry.getTime() - grantedDays * 24 * 60 * 60 * 1000);
          // Don't set expiry before now
          const finalExpiry = newExpiry < new Date() ? new Date() : newExpiry;
          await adminClient
            .from("subscriptions")
            .update({ expires_at: finalExpiry.toISOString() })
            .eq("id", activeSub.id);
        }
      }

      // Reset reward status
      await adminClient
        .from("referrals")
        .update({ [rewardField]: false, [bonusDaysField]: 0 })
        .eq("id", referral_id);

      // Log the revoke action
      await adminClient.from("referral_reward_log").insert({
        referral_id,
        action: "revoke",
        reward_type,
        bonus_days: grantedDays,
        target_user_id: targetUserId,
        performed_by: user.id,
        extension_applied: grantedDays > 0,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: grantedDays > 0
            ? `تم سحب المكافأة وإزالة ${grantedDays} أيام من الاشتراك`
            : "تم سحب المكافأة",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // === GRANT ACTION (default) ===
    if (referral[rewardField]) {
      return new Response(JSON.stringify({ error: "المكافأة ممنوحة مسبقاً" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BONUS_DAYS = Math.max(1, Math.min(365, parseInt(bonus_days) || 7));

    // Extend active subscription
    const { data: activeSub } = await adminClient
      .from("subscriptions")
      .select("id, expires_at")
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let extensionApplied = false;
    if (activeSub) {
      const currentExpiry = new Date(activeSub.expires_at);
      const newExpiry = new Date(currentExpiry.getTime() + BONUS_DAYS * 24 * 60 * 60 * 1000);
      await adminClient
        .from("subscriptions")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", activeSub.id);
      extensionApplied = true;
    }

    // Mark reward as granted
    await adminClient
      .from("referrals")
      .update({ [rewardField]: true, [bonusDaysField]: extensionApplied ? BONUS_DAYS : 0 })
      .eq("id", referral_id);

    // Log the grant action
    await adminClient.from("referral_reward_log").insert({
      referral_id,
      action: "grant",
      reward_type,
      bonus_days: BONUS_DAYS,
      target_user_id: targetUserId,
      performed_by: user.id,
      extension_applied: extensionApplied,
    });

    // Log email notification
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const { data: authUser } = await adminClient.auth.admin.getUserById(targetUserId);
    const recipientEmail = authUser?.user?.email;
    const recipientName = profile?.full_name || "مستخدم";

    if (recipientEmail) {
      await adminClient.from("email_notifications").insert({
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject: "🎁 مكافأة إحالة — VisaRadar",
        html_body: `
          <div dir="rtl" style="font-family:sans-serif;padding:20px;">
            <h2>مرحباً ${recipientName}! 🎉</h2>
            <p>تمت مكافأتك على إحالتك الناجحة!</p>
            ${extensionApplied
              ? `<p>✅ تم تمديد اشتراكك <strong>${BONUS_DAYS} أيام</strong> إضافية كمكافأة.</p>`
              : `<p>ℹ️ لا يوجد اشتراك نشط حالياً. ستحصل على المكافأة عند الاشتراك.</p>`
            }
            <p>شكراً لدعمك VisaRadar! 🚀</p>
          </div>
        `,
        status: "pending",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        extension_applied: extensionApplied,
        bonus_days: BONUS_DAYS,
        message: extensionApplied
          ? `تم منح المكافأة وتمديد الاشتراك ${BONUS_DAYS} أيام`
          : "تم منح المكافأة (لا يوجد اشتراك نشط للتمديد)",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "خطأ داخلي", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
