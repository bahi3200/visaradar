import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Scan worker: claims a batch of tasks (SKIP LOCKED), then invokes monitor-visa-sites
// in parallel for each task with a sharded countries+provider filter.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const batchSize = Math.min(10, Math.max(1, Number(body?.batch_size) || 4));

  try {
    const { data: tasks, error } = await supabase.rpc('claim_scan_tasks' as any, {
      _worker_id: workerId, _limit: batchSize,
    });
    if (error) throw error;
    const claimed = (tasks as any[]) || [];
    if (claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, worker_id: workerId, claimed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Execute all claimed tasks in parallel
    const results = await Promise.allSettled(claimed.map(async (t: any) => {
      const t0 = Date.now();
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/monitor-visa-sites?force=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
          body: JSON.stringify({
            force: true,
            task_id: t.id,
            countries: [t.country_code],
            provider: t.provider,
          }),
        });
        const ok = res.ok;
        const latency = Date.now() - t0;
        await supabase.rpc('complete_scan_task' as any, {
          _task_id: t.id, _success: ok, _latency_ms: latency,
          _error: ok ? null : `HTTP ${res.status}`,
        });
        return { id: t.id, ok, latency };
      } catch (e: any) {
        const latency = Date.now() - t0;
        await supabase.rpc('complete_scan_task' as any, {
          _task_id: t.id, _success: false, _latency_ms: latency, _error: String(e?.message || e),
        });
        return { id: t.id, ok: false, latency, error: String(e?.message || e) };
      }
    }));

    // Mark worker idle
    await supabase.from('scan_workers').update({ status: 'idle', last_heartbeat: new Date().toISOString() })
      .eq('worker_id', workerId);

    return new Response(JSON.stringify({
      ok: true,
      worker_id: workerId,
      claimed: claimed.length,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { ok: false, error: String(r.reason) }),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[scan-worker]', e);
    await supabase.from('scan_workers').update({ status: 'offline' }).eq('worker_id', workerId);
    return new Response(JSON.stringify({ ok: false, worker_id: workerId, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});