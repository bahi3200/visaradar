import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Resolve a Human Verification challenge with cookies provided by the user.
 * Public endpoint (token-based). The token itself is the secret.
 * Body: { token, cookies: [...], local_storage?: {...}, user_agent?, fingerprint_hash?, ttl_minutes? }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const token = String(body?.token || '');
  if (!token || token.length < 16 || token.length > 200) return json({ error: 'token required' }, 400);

  const cookies = body?.cookies;
  if (!Array.isArray(cookies)) return json({ error: 'cookies array required' }, 400);
  if (cookies.length > 200) return json({ error: 'too many cookies' }, 400);

  const local_storage = (body?.local_storage && typeof body.local_storage === 'object') ? body.local_storage : {};
  const user_agent = body?.user_agent ? String(body.user_agent).slice(0, 500) : null;
  const fingerprint_hash = body?.fingerprint_hash ? String(body.fingerprint_hash).slice(0, 128) : null;
  const ttl = Math.min(Math.max(parseInt(body?.ttl_minutes ?? 240, 10) || 240, 30), 1440);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('hvg_resolve_challenge' as any, {
    _token: token,
    _cookies: cookies,
    _local_storage: local_storage,
    _user_agent: user_agent,
    _fingerprint_hash: fingerprint_hash,
    _ttl_minutes: ttl,
  });

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, session_id: data });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}