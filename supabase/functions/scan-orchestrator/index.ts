import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Orchestrator: enqueues distributed scan tasks and dispatches N parallel workers.
// Triggered every minute by pg_cron, or manually.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* */ }
    const burst: boolean = body?.burst === true;
    const requestedWorkers: number = Math.min(20, Math.max(1, Number(body?.workers) || 0));

    // 1) Enqueue fresh tasks
    const { data: enqRes, error: enqErr } = await supabase.rpc('enqueue_scan_tasks' as any, { _burst: burst });
    if (enqErr) throw enqErr;
    const enqueued: number = (enqRes as number) ?? 0;

    // 2) Compute desired parallelism: adaptive load balancing
    //    pending tasks / 4 per worker, capped, boosted in burst mode.
    const { data: stats } = await supabase.rpc('get_scan_throughput_stats' as any);
    const s = Array.isArray(stats) ? stats[0] : stats;
    const pending: number = Number(s?.pending_tasks ?? 0);
    const burstActive: number = Number(s?.burst_active_tasks ?? 0);

    const baseWorkers = Math.min(12, Math.max(1, Math.ceil(pending / 4)));
    const workers = requestedWorkers || (burst || burstActive > 0 ? Math.min(20, baseWorkers * 2) : baseWorkers);

    // 3) Dispatch parallel workers (fire-and-forget, with a hard cap)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dispatchedAt = Date.now();
    const dispatches = Array.from({ length: workers }).map((_, i) =>
      fetch(`${supabaseUrl}/functions/v1/scan-worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
        body: JSON.stringify({ worker_index: i, batch_size: burst ? 6 : 4 }),
      }).catch((e) => ({ error: String(e) }))
    );

    // Don't await all — fan-out is fine, but we wait briefly so the orchestrator
    // call returns useful info. EdgeRuntime.waitUntil keeps them alive after response.
    // @ts-ignore — EdgeRuntime is provided by Deno deploy/Supabase runtime
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      (EdgeRuntime as any).waitUntil(Promise.allSettled(dispatches));
    }

    return new Response(JSON.stringify({
      ok: true,
      enqueued,
      pending,
      burst_active: burstActive,
      workers_dispatched: workers,
      mode: burst ? 'burst' : 'normal',
      dispatched_ms: Date.now() - dispatchedAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[orchestrator] error', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});