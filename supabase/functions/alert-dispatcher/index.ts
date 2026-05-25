import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRole } from '../_shared/internalAuth.ts';

// Ultra-fast alert dispatcher.
// Input: { country_code, provider, text, parse_mode?, reply_markup?, priority?, chat_ids?: string[], alert_key? }
// If chat_ids missing → resolves active subscribers for country.
// Behavior: inserts into alert_queue, then INSTANTLY fans out in parallel (Promise.all)
// — does not wait for cron. Falls back to queue+retry if Telegram fails.

const TELEGRAM_API = 'https://api.telegram.org';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authFail = requireServiceRole(req);
  if (authFail) return authFail;
  const t0 = Date.now();

  const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!BOT) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const {
    country_code = null, provider = null,
    text, parse_mode = 'HTML', reply_markup = null,
    priority = 2, alert_key = null, chat_ids: explicitChatIds = null,
  } = body || {};

  if (!text || typeof text !== 'string') return json({ error: 'text required' }, 400);

  // 1) Resolve recipients
  let chatIds: string[] = Array.isArray(explicitChatIds) ? explicitChatIds.filter(Boolean) : [];
  if (chatIds.length === 0 && country_code) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('telegram_chat_id, countries, user_id')
      .eq('status', 'active')
      .not('telegram_chat_id', 'is', null);
    chatIds = (subs || [])
      .filter((s: any) => Array.isArray(s.countries) && s.countries.includes(country_code))
      .map((s: any) => String(s.telegram_chat_id));
  }
  chatIds = [...new Set(chatIds)];
  if (chatIds.length === 0) return json({ ok: true, recipients: 0, latency_ms: Date.now() - t0 });

  // 2) Bulk insert into queue (priority sets order if we fall back to worker)
  const enqueued_at = new Date().toISOString();
  const payload = { text, parse_mode, ...(reply_markup ? { reply_markup } : {}) };
  const rows = chatIds.map((cid) => ({
    chat_id: cid, country_code, provider, priority,
    payload, alert_key, status: 'claimed', claimed_by: 'dispatcher-instant',
    claimed_at: enqueued_at, enqueued_at,
  }));
  const { data: inserted, error: insErr } = await supabase
    .from('alert_queue').insert(rows).select('id, chat_id');
  if (insErr) return json({ error: insErr.message }, 500);

  // 3) INSTANT parallel fan-out — no per-message await loop
  const CONCURRENCY = 25;
  const workerId = `dispatcher-${crypto.randomUUID().slice(0, 6)}`;
  const items = (inserted || []) as { id: string; chat_id: string }[];

  const sendOne = async (it: { id: string; chat_id: string }) => {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${BOT}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: it.chat_id, ...payload }),
      });
      if (res.ok) {
        await res.json().catch(() => null);
        await supabase.rpc('complete_alert' as any, {
          _id: it.id, _success: true, _worker_id: workerId, _error: null,
        });
        return true;
      }
      const errBody = await res.text();
      await supabase.rpc('complete_alert' as any, {
        _id: it.id, _success: false, _worker_id: workerId, _error: `HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      });
      return false;
    } catch (e: any) {
      await supabase.rpc('complete_alert' as any, {
        _id: it.id, _success: false, _worker_id: workerId, _error: String(e?.message || e),
      });
      return false;
    }
  };

  // Chunked Promise.all for backpressure (Telegram allows ~30 msgs/sec)
  let ok = 0, fail = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(sendOne));
    ok += results.filter(Boolean).length;
    fail += results.length - results.filter(Boolean).length;
  }

  return json({
    ok: true,
    recipients: items.length,
    delivered: ok, failed: fail,
    latency_ms: Date.now() - t0,
    avg_per_msg_ms: items.length > 0 ? Math.round((Date.now() - t0) / items.length) : 0,
    worker_id: workerId,
  });
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}