import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRole } from '../_shared/internalAuth.ts';

/**
 * Worker fetches a healthy session for (provider, country).
 * Auth: service-role only.
 * Query: ?provider=...&country=DZ
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const fail = requireServiceRole(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') || '';
  const country = (url.searchParams.get('country') || '').toUpperCase();
  if (!provider || !/^[A-Z]{2}$/.test(country)) return json({ error: 'provider & country required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('hvg_pick_session' as any, {
    _provider: provider,
    _country: country,
  });
  if (error) return json({ error: error.message }, 500);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json({ ok: true, session: null });
  return json({ ok: true, session: row });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}