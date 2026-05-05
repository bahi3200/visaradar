import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 25_000; // shorter — invoked on-demand from UI
const MIN_REMAINING_MS = 3_000;

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
}

async function tg(method: string, body: Record<string, unknown>, token: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Read offset
  let { data: state, error: stateErr } = await supabase
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();

  // Auto-heal: create the singleton row if it's missing so polling never
  // silently fails (this would prevent /start <token> from being processed
  // and the user's telegram_id would never be saved).
  if (stateErr && (stateErr.code === "PGRST116" || /no rows/i.test(stateErr.message))) {
    const { data: seeded, error: seedErr } = await supabase
      .from("telegram_bot_state")
      .upsert({ id: 1, update_offset: 0, updated_at: new Date().toISOString() }, { onConflict: "id" })
      .select("update_offset")
      .single();
    if (seedErr) {
      return new Response(JSON.stringify({ error: `seed_failed: ${seedErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    state = seeded;
    stateErr = null;
  }

  if (stateErr || !state) {
    return new Response(JSON.stringify({ error: stateErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let currentOffset = state.update_offset;
  let processed = 0;
  const linked: Array<{ user_id: string; chat_id: string }> = [];

  while (true) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(20, Math.floor(remaining / 1000) - 2);
    if (timeout < 1) break;

    const data = await tg("getUpdates", {
      offset: currentOffset,
      timeout,
      allowed_updates: ["message"],
    }, TOKEN);

    if (!data.ok) {
      return new Response(JSON.stringify({ error: "telegram_error", data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: TgUpdate[] = data.result || [];
    if (updates.length === 0) {
      // no new updates this iteration — exit early on UI calls
      break;
    }

    for (const u of updates) {
      const msg = u.message;
      if (!msg?.text) continue;
      const text = msg.text.trim();
      const chatId = String(msg.chat.id);
      const username = msg.chat.username || null;
      const fullName = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || null;

      // /start <token>
      const m = text.match(/^\/start\s+([A-Za-z0-9_-]{10,})/);
      if (m) {
        const token = m[1];
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, telegram_link_expires_at, full_name")
          .eq("telegram_link_token", token)
          .maybeSingle();

        if (!profile) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "❌ رمز الربط غير صالح. ارجع لتطبيق VisaRadar DZ واطلب رابطاً جديداً.",
          }, TOKEN);
          // No user_id available (token didn't match) — skip log row to avoid NOT NULL violation
        } else if (profile.telegram_link_expires_at && new Date(profile.telegram_link_expires_at) < new Date()) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "⏰ انتهت صلاحية الرمز (15 دقيقة). اطلب رابطاً جديداً من ملفك الشخصي.",
          }, TOKEN);
          await supabase.from("telegram_link_log").insert({
            user_id: profile.user_id,
            chat_id: chatId,
            username,
            action: "link_failed",
            status: "failed",
            error_message: "token_expired",
            source: "bot-poll",
          });
        } else {
          // Link!
          const { error: linkErr } = await supabase
            .from("profiles")
            .update({
              telegram_id: chatId,
              telegram_username: username,
              telegram_link_token: null,
              telegram_link_expires_at: null,
            })
            .eq("user_id", profile.user_id);

          if (linkErr) {
            await supabase.from("telegram_link_log").insert({
              user_id: profile.user_id,
              chat_id: chatId,
              username,
              action: "link_failed",
              status: "failed",
              error_message: `db_update_failed: ${linkErr.message}`,
              source: "bot-poll",
            });
            await tg("sendMessage", {
              chat_id: chatId,
              text: "❌ تم استقبال طلب الربط لكن فشل حفظه في قاعدة البيانات. أعد المحاولة أو تواصل مع الدعم.",
            }, TOKEN);
            continue;
          }

          // Note: telegram_link_log is now written automatically by DB trigger
          // (trg_log_telegram_link_change on profiles)

          await tg("sendMessage", {
            chat_id: chatId,
            text: `✅ <b>تم ربط حسابك بنجاح!</b>\n\nأهلاً ${profile.full_name || fullName || ""} 👋\nستصلك تنبيهات VisaRadar DZ هنا فور توفّر مواعيد التأشيرات.`,
            parse_mode: "HTML",
          }, TOKEN);

          linked.push({ user_id: profile.user_id, chat_id: chatId });
        }
      } else if (/^\/start\s*$/.test(text)) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "👋 أهلاً بك في <b>VisaRadar DZ</b>\n\nلربط حسابك، افتح ملفك الشخصي على الموقع واضغط زر <b>«ربط Telegram»</b>.",
          parse_mode: "HTML",
        }, TOKEN);
      }

      processed++;
    }

    const newOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await supabase
      .from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);

    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({
    ok: true,
    processed,
    linked,
    finalOffset: currentOffset,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
