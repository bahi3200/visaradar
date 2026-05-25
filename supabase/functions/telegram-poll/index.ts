import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from '../_shared/internalAuth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 25_000; // shorter — invoked on-demand from UI
const MIN_REMAINING_MS = 3_000;

interface TgUpdate {
  update_id: number;
  message?: {
    message_id?: number;
    date?: number;
    chat: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
  channel_post?: {
    message_id?: number;
    date?: number;
    chat: { id: number; title?: string; username?: string; type?: string };
    text?: string;
    caption?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
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

// Country detection heuristics (Arabic + English + French + flag emojis)
const COUNTRY_HINTS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: "IT", patterns: [/إيطاليا|ايطاليا|italie|italy|italia|🇮🇹/i] },
  { code: "FR", patterns: [/فرنسا|france|🇫🇷/i] },
  { code: "ES", patterns: [/إسبانيا|اسبانيا|espagne|spain|españa|🇪🇸/i] },
  { code: "DE", patterns: [/ألمانيا|المانيا|allemagne|germany|deutschland|🇩🇪/i] },
  { code: "GR", patterns: [/اليونان|grèce|grece|greece|🇬🇷/i] },
  { code: "PT", patterns: [/البرتغال|portugal|🇵🇹/i] },
  { code: "NL", patterns: [/هولندا|pays-bas|netherlands|🇳🇱/i] },
  { code: "BE", patterns: [/بلجيكا|belgique|belgium|🇧🇪/i] },
  { code: "GB", patterns: [/بريطانيا|royaume-uni|uk|britain|🇬🇧/i] },
  { code: "CA", patterns: [/كندا|canada|🇨🇦/i] },
];

function detectCountry(text: string): string | null {
  for (const c of COUNTRY_HINTS) {
    if (c.patterns.some((p) => p.test(text))) return c.code;
  }
  return null;
}

function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

async function handleMonitoredPost(
  supabase: any,
  chatId: string,
  messageId: number,
  text: string,
  postedAt: Date,
  raw: unknown,
) {
  // Look up source
  const { data: source } = await supabase
    .from("monitored_telegram_sources")
    .select("id, country_code, category, keywords, is_active, auto_broadcast, title")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (!source || !source.is_active) return false;

  const matched = findMatchedKeywords(text, source.keywords || []);
  const isSignal = matched.length > 0;
  const detectedCountry = source.country_code || detectCountry(text);

  // Insert post (idempotent by unique chat_id+message_id)
  const { data: inserted, error: insErr } = await supabase
    .from("telegram_channel_posts")
    .upsert(
      {
        source_id: source.id,
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, 4000),
        matched_keywords: matched,
        detected_country: detectedCountry,
        detected_category: source.category,
        is_signal: isSignal,
        posted_at: postedAt.toISOString(),
        raw,
      },
      { onConflict: "chat_id,message_id" },
    )
    .select("id, broadcasted")
    .maybeSingle();

  if (insErr) {
    console.error("channel_post insert error:", insErr);
    return false;
  }

  // Update source stats
  await supabase
    .from("monitored_telegram_sources")
    .update({
      last_post_at: postedAt.toISOString(),
      posts_captured: (await supabase
        .from("telegram_channel_posts")
        .select("id", { count: "exact", head: true })
        .eq("source_id", source.id)).count ?? undefined,
    })
    .eq("id", source.id);

  // Auto-broadcast if enabled, is_signal, country detected, and not already broadcasted
  if (
    isSignal &&
    source.auto_broadcast &&
    detectedCountry &&
    inserted &&
    !inserted.broadcasted
  ) {
    const { data: signal, error: sigErr } = await supabase
      .from("visa_external_signals")
      .insert({
        country_code: detectedCountry,
        category: source.category || "all",
        status: "open",
        title_ar: `🟢 موعد محتمل — ${source.title}`,
        message_ar: text.slice(0, 1500),
        source: `Telegram: ${source.title}`,
        source_url: null,
        broadcast_status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (!sigErr && signal) {
      await supabase
        .from("telegram_channel_posts")
        .update({ broadcasted: true, broadcast_signal_id: signal.id })
        .eq("id", inserted.id);

      // Fire broadcast edge function (service role auth)
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/broadcast-visa-signal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ signal_id: signal.id }),
        });
      } catch (e) {
        console.error("broadcast invoke error:", e);
      }
    }
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

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
      allowed_updates: ["message", "callback_query", "channel_post", "edited_channel_post"],
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
      // ─── Monitored channel/group posts (visa appointment signals) ───
      const post = u.channel_post;
      if (post?.chat?.id) {
        const postText = post.text || post.caption || "";
        if (postText) {
          await handleMonitoredPost(
            supabase,
            String(post.chat.id),
            post.message_id ?? 0,
            postText,
            post.date ? new Date(post.date * 1000) : new Date(),
            u,
          );
        }
        processed++;
        continue;
      }

      // ─── Inline button callbacks (unsubscribe / change service) ───
      if (u.callback_query) {
        const cq = u.callback_query;
        const chatId = String(cq.message?.chat.id ?? cq.from.id);
        const cbData = cq.data || '';

        // Resolve user via telegram_id == chatId
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('telegram_id', chatId)
          .maybeSingle();

        let answerText = '';
        let followUp: string | null = null;

        if (!profile) {
          answerText = '⚠️ الحساب غير مربوط بعد';
        } else if (cbData.startsWith('unsub:')) {
          const code = cbData.slice(6).toUpperCase();
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('id, countries')
            .eq('user_id', profile.user_id)
            .eq('status', 'active')
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sub) {
            const next = (sub.countries || []).filter((c: string) => c !== code);
            await supabase.from('subscriptions').update({ countries: next }).eq('id', sub.id);
            answerText = `🔕 تم إيقاف تنبيهات ${code}`;
            followUp = `🔕 <b>تم إيقاف تنبيهات الدولة ${code}</b>\nيمكنك إعادة تفعيلها من إعدادات الإشعارات على الموقع.`;
          } else {
            answerText = 'لا يوجد اشتراك نشط';
          }
        } else if (cbData === 'svc:menu') {
          followUp = `🛠️ <b>اختر نوع الخدمة</b>`;
          await tg('sendMessage', {
            chat_id: chatId,
            text: followUp,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '🛂 تأشيرات', callback_data: 'svc:visa' },
                { text: '💼 وظائف', callback_data: 'svc:jobs' },
                { text: '🎯 كل الخدمات', callback_data: 'svc:both' },
              ]],
            },
          }, TOKEN);
          followUp = null;
          answerText = '';
        } else if (cbData.startsWith('svc:')) {
          const type = cbData.slice(4);
          if (['visa', 'jobs', 'both'].includes(type)) {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('user_id', profile.user_id)
              .eq('status', 'active')
              .order('expires_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (sub) {
              await supabase.from('subscriptions').update({ service_type: type }).eq('id', sub.id);
              const labels: Record<string, string> = { visa: 'تأشيرات', jobs: 'وظائف', both: 'كل الخدمات' };
              answerText = `✅ تم التحديث: ${labels[type]}`;
              followUp = `✅ <b>تم تغيير نوع الخدمة إلى:</b> ${labels[type]}`;
            } else {
              answerText = 'لا يوجد اشتراك نشط';
            }
          } else {
            answerText = 'خيار غير صالح';
          }
        } else {
          answerText = 'إجراء غير معروف';
        }

        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: answerText || '✓' }, TOKEN);
        if (followUp) {
          await tg('sendMessage', { chat_id: chatId, text: followUp, parse_mode: 'HTML' }, TOKEN);
        }
        processed++;
        continue;
      }

      const msg = u.message;
      if (!msg?.text) continue;
      const text = msg.text.trim();
      const chatId = String(msg.chat.id);
      const username = msg.chat.username || null;
      const fullName = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || null;

      // Also capture posts from monitored groups (chat type group/supergroup)
      // when the bot is a member. This is fired for any group message.
      const isPrivate = !msg.chat.username && msg.chat.first_name; // crude private chat heuristic
      if (!isPrivate && msg.message_id) {
        const handled = await handleMonitoredPost(
          supabase,
          chatId,
          msg.message_id,
          text,
          msg.date ? new Date(msg.date * 1000) : new Date(),
          u,
        );
        if (handled) {
          processed++;
          continue;
        }
      }

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
