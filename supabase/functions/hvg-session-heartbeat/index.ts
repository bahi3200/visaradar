import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRole } from '../_shared/internalAuth.ts';

/**
 * Workers report session outcomes here (success/captcha/cloudflare/block/timeout/error).
 * Body: { session_id, outcome, http_status?, duration_ms?, worker_id?, metadata? }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const fail = requireServiceRole(req);
  if (fail) return fail;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const session_id = String(body?.session_id || '');
  const outcome = String(body?.outcome || '');
  if (!session_id) return json({ error: 'session_id required' }, 400);
  if (!['success','captcha','cloudflare','block','timeout','error'].includes(outcome)) {
    return json({ error: 'invalid outcome' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await supabase.rpc('hvg_record_outcome' as any, {
    _session_id: session_id,
    _outcome: outcome,
    _http_status: body?.http_status ?? null,
    _duration_ms: body?.duration_ms ?? null,
    _worker_id: body?.worker_id ?? null,
    _metadata: body?.metadata ?? {},
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}