import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IP_URL = 'https://api.ipify.org?format=json';
const TLS_URL = 'https://visas-fr.tlscontact.com/';
const TIMEOUT_MS = 15_000;
const SLOW_MS = 5000;
const AUTO_DISABLE_FAILS = 5;

type HealthStatus = 'healthy' | 'slow' | 'blocked' | 'dead';

interface Proxy {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  consecutive_failures?: number;
}

function proxyUrl(p: Proxy) {
  const auth = p.username
    ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password ?? '')}@`
    : '';
  return `${p.protocol}://${auth}${p.host}:${p.port}`;
}

async function fetchViaProxy(url: string, p: Proxy) {
  let client: any = null;
  try {
    // @ts-ignore Deno unstable
    client = Deno.createHttpClient?.({ proxy: { url: proxyUrl(p) } });
  } catch (_) {}
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(url, {
      // @ts-ignore
      client,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/json,*/*',
      },
      redirect: 'follow',
    });
    const latency = Date.now() - started;
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, latency, body: text };
  } catch (err) {
    return { ok: false, status: 0, latency: Date.now() - started, error: String(err) };
  } finally {
    clearTimeout(tm);
  }
}

async function getDirectIp(): Promise<string | null> {
  try {
    const r = await fetch(IP_URL, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return j?.ip ?? null;
  } catch { return null; }
}

function classify(opts: {
  ipOk: boolean; ipChanged: boolean; latency: number;
  authOk: boolean; tlsOk: boolean; tlsStatus: number;
}): { status: HealthStatus; reason: string } {
  if (!opts.authOk) return { status: 'dead', reason: 'Authentication failed (407)' };
  if (!opts.ipOk)   return { status: 'dead', reason: 'No connection / timeout' };
  if (!opts.ipChanged) return { status: 'dead', reason: 'IP did not change (proxy bypassed)' };
  if (opts.tlsStatus === 403 || opts.tlsStatus === 429) {
    return { status: 'blocked', reason: `TLScontact returned ${opts.tlsStatus}` };
  }
  if (!opts.tlsOk && opts.tlsStatus >= 500) {
    return { status: 'blocked', reason: `TLScontact unreachable (${opts.tlsStatus})` };
  }
  if (opts.latency > SLOW_MS) return { status: 'slow', reason: `High latency ${opts.latency}ms` };
  return { status: 'healthy', reason: 'All checks passed' };
}

async function checkProxy(proxy: Proxy, directIp: string | null) {
  // 1) IP test (auth + connectivity + IP change)
  const ipRes = await fetchViaProxy(IP_URL, proxy);
  let proxyIp: string | null = null;
  let authOk = true;
  if (ipRes.ok) {
    try { proxyIp = JSON.parse(ipRes.body || '{}')?.ip ?? null; } catch {}
  } else if (ipRes.status === 407) {
    authOk = false;
  } else if (/407|proxy auth|authentication required/i.test((ipRes as any).error || '')) {
    authOk = false;
  }
  const ipOk = ipRes.ok && !!proxyIp;
  const ipChanged = !!proxyIp && (!directIp || proxyIp !== directIp);

  // 2) TLScontact reachability (skip if dead already)
  let tlsRes: any = { ok: false, status: 0, latency: 0 };
  if (ipOk) {
    tlsRes = await fetchViaProxy(TLS_URL, proxy);
  }

  const result = classify({
    ipOk, ipChanged,
    latency: ipRes.latency,
    authOk,
    tlsOk: tlsRes.ok,
    tlsStatus: tlsRes.status,
  });

  return {
    proxy_id: proxy.id,
    host: proxy.host,
    port: proxy.port,
    health: result.status,
    reason: result.reason,
    latency_ms: ipRes.latency,
    tls_latency_ms: tlsRes.latency,
    proxy_ip: proxyIp,
    direct_ip: directIp,
    ip_changed: ipChanged,
    auth_ok: authOk,
    ip_ok: ipOk,
    tls_ok: tlsRes.ok,
    tls_status: tlsRes.status,
    error: (ipRes as any).error || (tlsRes as any).error || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Admin auth
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: roleData } = await supabase
    .from('user_roles').select('role')
    .eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { proxy_id?: string; pool_id?: string; auto_disable?: boolean } = {};
  try { body = await req.json(); } catch {}

  let q = supabase.from('proxy_endpoints')
    .select('id, protocol, host, port, username, password, consecutive_failures, status');
  if (body.proxy_id) q = q.eq('id', body.proxy_id);
  else if (body.pool_id) q = q.eq('pool_id', body.pool_id);
  else return new Response(JSON.stringify({ error: 'proxy_id or pool_id required' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  const { data: proxies, error } = await q.limit(50);
  if (error) return new Response(JSON.stringify({ error: error.message }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  if (!proxies?.length) {
    return new Response(JSON.stringify({
      tested: 0, results: [], message: 'لا يوجد proxies. أضف عناوين أولاً.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const directIp = await getDirectIp();
  const autoDisable = body.auto_disable !== false;
  const results: any[] = [];

  for (const p of proxies) {
    const r = await checkProxy(p as Proxy, directIp);
    results.push(r);

    const success = r.health === 'healthy' || r.health === 'slow';
    await supabase.rpc('record_proxy_result', {
      _proxy_id: p.id,
      _success: success,
      _latency_ms: r.latency_ms,
      _status_code: r.tls_status || (r.ip_ok ? 200 : 0),
      _error: success ? null : r.reason,
      _used_for: 'health_check',
    });

    // Auto-disable if dead/blocked with enough consecutive failures
    if (autoDisable && (r.health === 'dead' || r.health === 'blocked')) {
      const fails = ((p as any).consecutive_failures ?? 0) + 1;
      if (fails >= AUTO_DISABLE_FAILS) {
        await supabase.from('proxy_endpoints').update({
          status: 'disabled',
          disabled_reason: `Auto: ${r.health} — ${r.reason}`,
          auto_disabled_at: new Date().toISOString(),
          cooldown_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }).eq('id', p.id);
      }
    }
  }

  const summary = {
    healthy: results.filter(r => r.health === 'healthy').length,
    slow:    results.filter(r => r.health === 'slow').length,
    blocked: results.filter(r => r.health === 'blocked').length,
    dead:    results.filter(r => r.health === 'dead').length,
  };

  return new Response(JSON.stringify({
    tested: results.length, direct_ip: directIp, summary, results,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});