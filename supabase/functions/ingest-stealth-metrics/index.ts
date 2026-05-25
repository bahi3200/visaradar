import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRole } from '../_shared/internalAuth.ts';

/**
 * Ingest stealth metrics from the VPS worker.
 * Auth: service-role only (workers carry the SERVICE_ROLE_KEY).
 * Body: { metrics: StealthMetric[] }  (batch supported)
 */
type Metric = {
  provider: string;
  country_code: string;
  stealth_profile_id?: string | null;
  proxy_label?: string | null;
  headful?: boolean;
  outcome: 'success' | 'captcha' | 'block' | 'cloudflare' | 'error' | 'timeout';
  duration_ms?: number | null;
  http_status?: number | null;
  cloudflare_detected?: boolean;
  fingerprint_rotated?: boolean;
  retry_count?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

function isMetric(m: any): m is Metric {
  return (
    m && typeof m === 'object' &&
    typeof m.provider === 'string' && m.provider.length > 0 && m.provider.length <= 64 &&
    typeof m.country_code === 'string' && /^[A-Z]{2}$/.test(m.country_code) &&
    typeof m.outcome === 'string' &&
    ['success','captcha','block','cloudflare','error','timeout'].includes(m.outcome)
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const metrics: Metric[] = Array.isArray(body?.metrics) ? body.metrics : (body ? [body] : []);
  const valid = metrics.filter(isMetric).slice(0, 200);
  if (valid.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid metrics' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let inserted = 0;
  const errors: string[] = [];
  for (const m of valid) {
    const { error } = await supabase.rpc('record_stealth_metric' as any, {
      _provider: m.provider,
      _country: m.country_code,
      _profile_id: m.stealth_profile_id ?? null,
      _proxy_label: m.proxy_label ?? null,
      _headful: !!m.headful,
      _outcome: m.outcome,
      _duration_ms: m.duration_ms ?? null,
      _http_status: m.http_status ?? null,
      _cloudflare: !!m.cloudflare_detected,
      _fingerprint_rotated: !!m.fingerprint_rotated,
      _retry_count: m.retry_count ?? 0,
      _error: m.error ?? null,
      _metadata: m.metadata ?? {},
    });
    if (error) errors.push(error.message);
    else inserted++;
  }

  return new Response(JSON.stringify({ ok: true, inserted, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});