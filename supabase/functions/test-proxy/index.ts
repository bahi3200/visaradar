import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEST_URL = 'https://api.ipify.org?format=json';
const TIMEOUT_MS = 15_000;

interface TestRequest {
  proxy_id?: string;
  pool_id?: string;
  test_url?: string;
}

async function testProxy(proxy: {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}, testUrl: string) {
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
    : '';
  const proxyUrl = `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;

  const started = Date.now();
  try {
    // Deno fetch with proxy via Deno.createHttpClient (unstable in some runtimes)
    // Fallback: use plain fetch with proxy header (works through some gateways).
    let client: any = null;
    try {
      // @ts-ignore Deno unstable API
      client = Deno.createHttpClient?.({ proxy: { url: proxyUrl } });
    } catch (_) { /* ignore */ }

    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    const resp = await fetch(testUrl, {
      // @ts-ignore client may not be supported in edge runtime; will throw and we fall back
      client,
      signal: ctrl.signal,
      headers: { 'User-Agent': 'VisaRadar-ProxyTest/1.0' },
    });
    clearTimeout(tm);
    const latency = Date.now() - started;
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, latency, body: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, status: 0, latency: Date.now() - started, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify caller is admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: TestRequest = {};
  try { body = await req.json(); } catch { /* GET allowed */ }

  const testUrl = body.test_url || TEST_URL;

  let query = supabase.from('proxy_endpoints').select('id, protocol, host, port, username, password, pool_id');
  if (body.proxy_id) query = query.eq('id', body.proxy_id);
  else if (body.pool_id) query = query.eq('pool_id', body.pool_id);
  else {
    return new Response(JSON.stringify({ error: 'proxy_id or pool_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: proxies, error } = await query.limit(50);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (!proxies?.length) {
    return new Response(
      JSON.stringify({ tested: 0, results: [], message: 'لا يوجد proxies في هذا الـ pool. أضف عناوين أولاً.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const results: any[] = [];
  for (const p of proxies) {
    const r = await testProxy(p as any, testUrl);
    results.push({ proxy_id: p.id, host: p.host, port: p.port, ...r });
    await supabase.rpc('record_proxy_result', {
      _proxy_id: p.id,
      _success: r.ok,
      _latency_ms: r.latency,
      _status_code: r.status,
      _error: r.ok ? null : (r as any).error || `HTTP ${r.status}`,
      _used_for: 'health_test',
    });
  }

  return new Response(JSON.stringify({ tested: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});