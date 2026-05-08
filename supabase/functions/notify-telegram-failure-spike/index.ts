import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || '');
    const failureCount = Number(body.failure_count || 0);
    const threshold = Number(body.threshold || 0);
    const windowMin = Number(body.window_minutes || 0);
    const lastError: string = body.last_error || '';
    const lastAction: string = body.last_action || '';
    const lastChatId: string = body.last_chat_id || '';

    if (!userId || !failureCount) {
      return new Response(JSON.stringify({ error: 'missing_params' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the failing user's profile for context
    const { data: failingProfile } = await supabase
      .from('profiles')
      .select('full_name, telegram_username, telegram_id')
      .eq('user_id', userId)
      .maybeSingle();

    // Fetch admin user_ids
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);

    let adminChatIds: string[] = [];
    if (adminIds.length > 0) {
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('telegram_id')
        .in('user_id', adminIds);
      adminChatIds = (adminProfiles || [])
        .map((p: any) => p.telegram_id)
        .filter((id: string | null) => !!id);
    }

    const userLabel =
      failingProfile?.full_name
        ? escapeHtml(failingProfile.full_name)
        : `<code>${escapeHtml(userId.slice(0, 8))}</code>`;
    const usernameLine = failingProfile?.telegram_username
      ? `\n👤 <code>@${escapeHtml(failingProfile.telegram_username)}</code>`
      : '';

    const text = [
      `⚠️ <b>تكرار فشل ربط Telegram</b>`,
      ``,
      `🆔 المستخدم: ${userLabel}${usernameLine}`,
      `📛 عدد المحاولات الفاشلة: <b>${failureCount}</b> (الحد: ${threshold})`,
      `🕒 خلال آخر <b>${windowMin}</b> دقيقة`,
      lastAction ? `🔧 آخر عملية: <code>${escapeHtml(lastAction)}</code>` : '',
      lastChatId ? `💬 chat_id: <code>${escapeHtml(lastChatId)}</code>` : '',
      lastError ? `\n📝 آخر خطأ:\n<code>${escapeHtml(lastError).slice(0, 400)}</code>` : '',
      ``,
      `🔗 افتح سجل الربط من لوحة الأدمن للمراجعة.`,
    ].filter(Boolean).join('\n');

    let sent = 0;
    if (adminChatIds.length > 0) {
      const results = await Promise.allSettled(
        adminChatIds.map((chatId) =>
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          }).then((r) => r.ok),
        ),
      );
      sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    }

    await supabase.from('telegram_failure_alerts').insert({
      user_id: userId,
      failure_count: failureCount,
      threshold,
      window_minutes: windowMin,
      notified_admin_count: sent,
      last_error: lastError || null,
    });

    return new Response(JSON.stringify({ success: true, notified: sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    console.error('notify-telegram-failure-spike error', err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});