import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRoleOrAdmin } from '../_shared/internalAuth.ts';

/**
 * Create a Human Verification challenge when a worker hits CAPTCHA / Cloudflare / 403.
 * Auth: service-role (workers) or admin (manual trigger).
 * Body: { provider, country, challenge_type, user_id?, session_id?, target_url?, http_status?, snippet?, priority? }
 * Returns: { id, deep_link_token, verify_url, expires_at }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const fail = await requireServiceRoleOrAdmin(req);
  if (fail) return fail;

  let body: any;
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const provider = String(body?.provider || '').slice(0, 64);
  const country = String(body?.country || '').toUpperCase();
  const challenge_type = String(body?.challenge_type || 'unknown');
  if (!provider || !/^[A-Z]{2}$/.test(country)) return json({ error: 'provider and 2-letter country required' }, 400);
  if (!['captcha','cloudflare','rate_limit','login','unknown'].includes(challenge_type)) {
    return json({ error: 'invalid challenge_type' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('hvg_create_challenge' as any, {
    _provider: provider,
    _country: country,
    _challenge_type: challenge_type,
    _user_id: body?.user_id ?? null,
    _session_id: body?.session_id ?? null,
    _target_url: body?.target_url ?? null,
    _http_status: body?.http_status ?? null,
    _snippet: body?.snippet ?? null,
    _priority: body?.priority ?? 5,
  });

  if (error) return json({ error: error.message }, 500);
  const row = Array.isArray(data) ? data[0] : data;
  const origin = req.headers.get('origin') || `https://${Deno.env.get('SITE_HOST') || 'visaradar.lovable.app'}`;
  const verify_url = `${origin.replace(/\/+$/,'')}/verify/${row.deep_link_token}`;

  // Fire-and-forget Telegram notification (no await on failure path).
  if (body?.user_id) {
    try {
      await supabase.functions.invoke('telegram-send-verification', {
        body: { user_id: body.user_id, provider, country, challenge_type, verify_url },
      });
    } catch {}
    await supabase.from('challenge_sessions').update({ telegram_sent_at: new Date().toISOString(), status: 'notified' }).eq('id', row.id);
  }

  return json({ ok: true, id: row.id, deep_link_token: row.deep_link_token, verify_url, expires_at: row.expires_at });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}