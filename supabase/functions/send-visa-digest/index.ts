import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Country metadata (kept in sync with monitor-visa-sites)
const COUNTRY_META: Record<string, { nameAr: string; flag: string; provider: string; officialUrl: string }> = {
  IT: { nameAr: 'إيطاليا', flag: '🇮🇹', provider: 'VFS Global',  officialUrl: 'https://visa.vfsglobal.com/dza/ar/ita/' },
  FR: { nameAr: 'فرنسا',  flag: '🇫🇷', provider: 'TLScontact', officialUrl: 'https://visas-fr.tlscontact.com/' },
  ES: { nameAr: 'إسبانيا', flag: '🇪🇸', provider: 'BLS Spain',  officialUrl: 'https://algeria.blsspainvisa.com/' },
  DE: { nameAr: 'ألمانيا', flag: '🇩🇪', provider: 'VFS Global',  officialUrl: 'https://visa.vfsglobal.com/dza/ar/deu/' },
  GR: { nameAr: 'اليونان', flag: '🇬🇷', provider: 'VFS Global',  officialUrl: 'https://visa.vfsglobal.com/dza/ar/grc/' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

    // Allow forcing a specific frequency via body/query (?frequency=daily|weekly)
    const url = new URL(req.url);
    let body: any = null;
    try { body = await req.clone().json(); } catch { /* no body */ }
    const frequencyFilter = (url.searchParams.get('frequency') || body?.frequency || null) as
      | 'daily' | 'weekly' | null;

    // Fetch users with a digest preference
    let prefsQuery = supabase
      .from('notification_preferences')
      .select('user_id, digest_frequency, last_digest_sent_at, countries')
      .in('digest_frequency', ['daily', 'weekly']);
    if (frequencyFilter) prefsQuery = prefsQuery.eq('digest_frequency', frequencyFilter);
    const { data: prefsRows, error: prefsErr } = await prefsQuery;
    if (prefsErr) throw prefsErr;

    const candidates = prefsRows || [];
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0, reason: 'no digest users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch active visa subscriptions for these users
    const userIds = candidates.map((p) => p.user_id);
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, telegram_chat_id, countries, service_type')
      .eq('status', 'active')
      .in('service_type', ['visa', 'both'])
      .in('user_id', userIds);
    const subByUser = new Map<string, { chat_id: string | null; countries: string[] }>();
    for (const s of subs || []) {
      subByUser.set(s.user_id, {
        chat_id: s.telegram_chat_id || null,
        countries: s.countries || [],
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const now = Date.now();

    for (const pref of candidates) {
      const freq = pref.digest_frequency as 'daily' | 'weekly';
      const windowMs = freq === 'weekly' ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
      const lastSent = pref.last_digest_sent_at ? new Date(pref.last_digest_sent_at).getTime() : 0;

      // Skip if not yet time (gives 5-min slack so cron doesn't drift)
      if (lastSent && now - lastSent < windowMs - 5 * 60 * 1000) {
        skippedCount++;
        continue;
      }

      const sub = subByUser.get(pref.user_id);
      if (!sub || !sub.chat_id) { skippedCount++; continue; }

      const watchedCountries: string[] = (sub.countries.length ? sub.countries : pref.countries) || [];
      if (watchedCountries.length === 0) { skippedCount++; continue; }

      // Fetch open events since the user's last digest (or window start)
      const sinceIso = new Date(lastSent || now - windowMs).toISOString();
      const { data: events } = await supabase
        .from('visa_open_events')
        .select('country_code, provider, opened_at, closed_at')
        .in('country_code', watchedCountries)
        .gte('opened_at', sinceIso)
        .order('opened_at', { ascending: false });

      if (!events || events.length === 0) {
        // Still bump the timestamp so we don't re-scan the same empty window forever
        await supabase
          .from('notification_preferences')
          .update({ last_digest_sent_at: new Date().toISOString() })
          .eq('user_id', pref.user_id);
        skippedCount++;
        continue;
      }

      // Group by country
      const byCountry = new Map<string, { count: number; lastAt: string; stillOpen: boolean }>();
      for (const e of events) {
        const cur = byCountry.get(e.country_code) || { count: 0, lastAt: e.opened_at, stillOpen: false };
        cur.count += 1;
        if (new Date(e.opened_at) > new Date(cur.lastAt)) cur.lastAt = e.opened_at;
        if (!e.closed_at) cur.stillOpen = true;
        byCountry.set(e.country_code, cur);
      }

      const periodLabel = freq === 'weekly' ? 'الأسبوعي' : 'اليومي';
      const totalOpenings = events.length;
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' });

      const lines: string[] = [
        `📊 <b>تلخيص التنبيهات ${periodLabel} ${freq === 'weekly' ? '🗓️' : '☀️'}</b>`,
        ``,
        `تم رصد <b>${totalOpenings}</b> فتح للمواعيد خلال الفترة الماضية:`,
        ``,
      ];

      for (const [code, info] of byCountry.entries()) {
        const meta = COUNTRY_META[code];
        if (!meta) continue;
        const statusBadge = info.stillOpen ? '🟢 مفتوحة الآن' : '🔴 أُغلقت';
        lines.push(
          `${meta.flag} <b>${meta.nameAr}</b> — ${meta.provider}`,
          `   • فتحات: ${info.count}  |  ${statusBadge}`,
          `   • آخر تنبيه: ${fmt(info.lastAt)}`,
          `   🔗 <a href="${meta.officialUrl}">فتح موقع المزود</a>`,
          ``,
        );
      }

      lines.push(
        `💡 <i>هذا التلخيص ${periodLabel} — يمكنك تغييره أو تحويله إلى تنبيهات فورية من إعدادات الإشعارات.</i>`,
        `🤖 <i>VisaRadar</i>`,
      );

      const text = lines.join('\n');

      try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: sub.chat_id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        if (res.ok) {
          sentCount++;
          await supabase
            .from('notification_preferences')
            .update({ last_digest_sent_at: new Date().toISOString() })
            .eq('user_id', pref.user_id);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`Digest send failed for ${pref.user_id}:`, errData);
          skippedCount++;
        }
      } catch (err) {
        console.error(`Digest send error for ${pref.user_id}:`, err);
        skippedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount, skipped: skippedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-visa-digest error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});