import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceRoleOrAdmin } from '../_shared/internalAuth.ts';

/**
 * Send a Telegram message inviting the user to solve a CAPTCHA challenge.
 * Auth: service-role or admin (called by hvg-create-challenge or admin UI).
 * Body: { user_id, provider, country, challenge_type, verify_url }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const fail = await requireServiceRoleOrAdmin(req);
  if (fail) return fail;

  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN missing' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { user_id, provider, country, challenge_type, verify_url } = body || {};
  if (!user_id || !provider || !verify_url) return json({ error: 'user_id, provider, verify_url required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: profile } = await supabase
    .from('profiles').select('telegram_id, full_name').eq('user_id', user_id).maybeSingle();

  if (!profile?.telegram_id) return json({ ok: false, reason: 'no telegram link' });

  const html =
    `🛡️ <b>تحقق بشري مطلوب</b>\n\n` +
    `المزود: <b>${escapeHtml(provider)}</b>\n` +
    `الدولة: <b>${escapeHtml(country || '')}</b>\n` +
    `النوع: <code>${escapeHtml(challenge_type || 'captcha')}</code>\n\n` +
    `ظهر تحدي حماية وعلى المراقبة التوقف حتى تقوم بحله يدوياً.\n\n` +
    `<a href="${verify_url}">👉 افتح صفحة التحقق</a>\n\n` +
    `<i>تنتهي صلاحية الرابط خلال 30 دقيقة.</i>`;

  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: profile.telegram_id,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  const tg = await resp.json();
  if (!resp.ok || !tg.ok) return json({ error: 'telegram error', details: tg }, 502);

  return json({ ok: true });
});

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}