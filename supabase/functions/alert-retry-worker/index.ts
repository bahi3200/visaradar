import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Retry worker: cron-driven (every minute). Claims any leftover 'pending' alerts
// (failed first attempt or expired claims) and retries them in parallel.
// Loops inside one invocation up to ~50s so cadence is effectively ~10s.
const TELEGRAM_API = 'https://api.telegram.org';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!BOT) return new Response('no bot token', { status: 500 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const workerId = `retry-${crypto.randomUUID().slice(0, 6)}`;
  const start = Date.now();
  const MAX_RUNTIME = 50_000;
  let totalOk = 0, totalFail = 0, totalClaimed = 0;

  while (Date.now() - start < MAX_RUNTIME) {
    const { data: claimed, error } = await supabase.rpc('claim_alerts' as any, {
      _worker_id: workerId, _limit: 25,
    });
    if (error) break;
    const batch = (claimed as any[]) || [];
    if (batch.length === 0) {
      // brief pause then re-check
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    totalClaimed += batch.length;

    const results = await Promise.all(batch.map(async (a: any) => {
      try {
        const res = await fetch(`${TELEGRAM_API}/bot${BOT}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: a.chat_id, ...a.payload }),
        });
        if (res.ok) { await res.json().catch(() => null);
          await supabase.rpc('complete_alert' as any, { _id: a.id, _success: true, _worker_id: workerId, _error: null });
          return true;
        }
        const t = await res.text();
        await supabase.rpc('complete_alert' as any, {
          _id: a.id, _success: false, _worker_id: workerId, _error: `HTTP ${res.status}: ${t.slice(0, 200)}`,
        });
        return false;
      } catch (e: any) {
        await supabase.rpc('complete_alert' as any, {
          _id: a.id, _success: false, _worker_id: workerId, _error: String(e?.message || e),
        });
        return false;
      }
    }));
    totalOk += results.filter(Boolean).length;
    totalFail += results.length - results.filter(Boolean).length;
  }

  return new Response(JSON.stringify({
    ok: true, worker_id: workerId, claimed: totalClaimed, sent: totalOk, failed: totalFail,
    runtime_ms: Date.now() - start,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});