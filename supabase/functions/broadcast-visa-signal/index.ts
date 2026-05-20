import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  study: 'دراسة',
  tourism: 'سياحة',
  business: 'أعمال',
  work: 'عمل',
  family: 'زيارة عائلية',
  medical: 'علاج',
  short_stay: 'إقامة قصيرة',
  long_stay: 'إقامة طويلة',
  all: 'كل الفئات',
};

const COUNTRY_FLAGS: Record<string, string> = {
  IT: '🇮🇹', FR: '🇫🇷', ES: '🇪🇸', DE: '🇩🇪', GR: '🇬🇷',
  PT: '🇵🇹', BE: '🇧🇪', NL: '🇳🇱', CA: '🇨🇦', TR: '🇹🇷',
};

const COUNTRY_NAMES_AR: Record<string, string> = {
  IT: 'إيطاليا', FR: 'فرنسا', ES: 'إسبانيا', DE: 'ألمانيا', GR: 'اليونان',
  PT: 'البرتغال', BE: 'بلجيكا', NL: 'هولندا', CA: 'كندا', TR: 'تركيا',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildMessage(signal: any): string {
  const flag = COUNTRY_FLAGS[signal.country_code] || '🌍';
  const country = COUNTRY_NAMES_AR[signal.country_code] || signal.country_code;
  const category = signal.category ? (CATEGORY_LABELS_AR[signal.category] || signal.category) : null;
  const statusEmoji = signal.status === 'open' ? '🟢' : signal.status === 'closed' ? '🔴' : 'ℹ️';
  const statusText = signal.status === 'open' ? 'فُتح موعد' : signal.status === 'closed' ? 'أُغلق' : 'تنبيه';

  const lines: string[] = [];
  lines.push(`${statusEmoji} <b>${escapeHtml(statusText)} — ${flag} ${escapeHtml(country)}</b>`);
  if (category) lines.push(`📂 الفئة: <b>${escapeHtml(category)}</b>`);
  lines.push('');
  lines.push(`<b>${escapeHtml(signal.title_ar)}</b>`);
  if (signal.message_ar) {
    lines.push('');
    lines.push(escapeHtml(signal.message_ar));
  }
  if (signal.source_url) {
    lines.push('');
    lines.push(`🔗 <a href="${escapeHtml(signal.source_url)}">الرابط</a>`);
  }
  if (signal.source) {
    lines.push(`📰 المصدر: ${escapeHtml(signal.source)}`);
  }
  lines.push('');
  lines.push('— VisaRadar');
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'moderator'])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const signalId: string | undefined = body?.signal_id;
    if (!signalId) {
      return new Response(JSON.stringify({ error: 'signal_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: signal, error: sigErr } = await supabase
      .from('visa_external_signals')
      .select('*')
      .eq('id', signalId)
      .maybeSingle();
    if (sigErr || !signal) {
      return new Response(JSON.stringify({ error: 'Signal not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find active subscribers for this country
    const nowIso = new Date().toISOString();
    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select('user_id, countries, telegram_chat_id, service_type')
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .in('service_type', ['visa', 'both'])
      .contains('countries', [signal.country_code]);
    if (subErr) throw subErr;

    // Resolve telegram chat IDs (fallback to profiles.telegram_id)
    const userIds = Array.from(new Set((subs || []).map(s => s.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, telegram_id')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const tgByUser = new Map<string, string>();
    for (const p of (profiles || [])) {
      if (p.telegram_id) tgByUser.set(p.user_id, p.telegram_id);
    }

    const chatIds = new Set<string>();
    for (const s of (subs || [])) {
      const cid = s.telegram_chat_id || tgByUser.get(s.user_id);
      if (cid) chatIds.add(cid);
    }

    const text = buildMessage(signal);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const chatId of chatIds) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        });
        if (resp.ok) sent++;
        else {
          failed++;
          if (errors.length < 5) errors.push(`${chatId}: HTTP ${resp.status}`);
        }
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(`${chatId}: ${(e as Error).message}`);
      }
      // Slow down to respect Telegram rate limit (~30 msg/sec)
      await new Promise(r => setTimeout(r, 50));
    }

    await supabase
      .from('visa_external_signals')
      .update({
        broadcast_status: failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'sent'),
        recipients_count: sent,
        broadcast_error: errors.length ? errors.join(' | ') : null,
        broadcasted_at: new Date().toISOString(),
      })
      .eq('id', signalId);

    return new Response(JSON.stringify({
      ok: true, sent, failed, total_subscribers: chatIds.size,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});