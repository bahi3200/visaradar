import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Verify admin role
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { chat_ids, message, template_id } = await req.json();
    const ids: string[] = Array.isArray(chat_ids) ? chat_ids : [chat_ids];
    const text = String(message || '').trim();
    const tplId: string | null = template_id ? String(template_id) : null;

    if (!text) {
      return new Response(JSON.stringify({ error: 'الرسالة فارغة' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validIds = ids
      .map((c) => String(c || '').trim())
      .filter((c) => /^-?\d{5,20}$/.test(c));

    if (validIds.length === 0) {
      return new Response(JSON.stringify({ error: 'لا يوجد chat_id صالح' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lookup recipient profiles for logging (user_id + display name)
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, full_name, telegram_username, telegram_id')
      .in('telegram_id', validIds);

    const profileByChat = new Map<string, { user_id: string; label: string }>();
    for (const p of profileRows || []) {
      if (!p.telegram_id) continue;
      profileByChat.set(p.telegram_id, {
        user_id: p.user_id,
        label: p.full_name || (p.telegram_username ? `@${p.telegram_username}` : p.telegram_id),
      });
    }

    const batchId = crypto.randomUUID();
    const results: Array<{ chat_id: string; ok: boolean; error?: string }> = [];
    const logRows: Array<Record<string, unknown>> = [];

    for (const chatId of validIds) {
      const profile = profileByChat.get(chatId);
      let ok = false;
      let errMsg: string | null = null;
      let tgMsgId: number | null = null;

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        const tgData = await tgRes.json();
        ok = tgRes.ok;
        if (!ok) {
          errMsg = tgData.description || 'send failed';
        } else {
          tgMsgId = tgData?.result?.message_id ?? null;
        }
      } catch (e) {
        ok = false;
        errMsg = e instanceof Error ? e.message : 'error';
      }

      results.push({ chat_id: chatId, ok, error: ok ? undefined : (errMsg || 'send failed') });

      logRows.push({
        sender_id: user.id,
        recipient_user_id: profile?.user_id ?? null,
        chat_id: chatId,
        recipient_label: profile?.label ?? null,
        message: text,
        template_id: tplId,
        status: ok ? 'sent' : 'failed',
        error_message: ok ? null : errMsg,
        telegram_message_id: tgMsgId,
        batch_id: batchId,
      });
    }

    // Persist log (best-effort — never block response on this)
    if (logRows.length > 0) {
      const { error: logErr } = await supabase
        .from('telegram_admin_messages')
        .insert(logRows);
      if (logErr) {
        console.error('Failed to log admin messages:', logErr);
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    return new Response(JSON.stringify({ success: true, sent, failed, batch_id: batchId, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
