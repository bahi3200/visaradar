import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  requestId: z.string().uuid(),
});

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestTag = `[notify-admin-new-payment:${crypto.randomUUID().slice(0, 8)}]`;

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: only authenticated users (the requester) can trigger
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized', fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      console.error(`${requestTag} auth failed`, authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized', fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { requestId } = parsed.data;
    console.log(`${requestTag} processing request ${requestId} from user ${user.id}`);

    // Fetch request (must belong to caller — prevents abuse)
    const { data: request, error: reqError } = await supabase
      .from('subscription_requests')
      .select('id, user_id, full_name, phone, email, countries, service_type, package_id, packages(name_ar, price, duration_months)')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      console.error(`${requestTag} request not found`, reqError?.message);
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.user_id !== user.id) {
      console.warn(`${requestTag} caller mismatch`);
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pkg = (request as any).packages || {};
    const packageName = pkg.name_ar || 'الباقة';
    const price = pkg.price ? `${pkg.price} د.ج` : '—';
    const months = pkg.duration_months ? `${pkg.duration_months} شهر` : '—';
    const countries = Array.isArray(request.countries) && request.countries.length
      ? request.countries.join(', ')
      : '—';

    const telegramMessage = [
      `💰 <b>وصل دفع جديد — طلب اشتراك</b>`,
      ``,
      `👤 <b>الاسم:</b> ${escapeHtml(request.full_name)}`,
      request.phone ? `📱 <b>الهاتف:</b> ${escapeHtml(request.phone)}` : '',
      request.email ? `📧 <b>البريد:</b> ${escapeHtml(request.email)}` : '',
      ``,
      `📦 <b>الباقة:</b> ${escapeHtml(packageName)}`,
      `💵 <b>السعر:</b> ${escapeHtml(price)}`,
      `⏱ <b>المدة:</b> ${escapeHtml(months)}`,
      `🌍 <b>الدول:</b> ${escapeHtml(countries)}`,
      `🛠 <b>الخدمة:</b> ${escapeHtml(request.service_type || '—')}`,
      ``,
      `🔗 افتح لوحة الإدارة لمراجعة الطلب.`,
    ].filter(Boolean).join('\n');

    // Find all admins with linked telegram_id
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (rolesError) {
      console.error(`${requestTag} failed to load admin roles`, rolesError.message);
    }

    const adminIds = (adminRoles || []).map((r: any) => r.user_id);
    let adminsWithTelegram: Array<{ user_id: string; telegram_id: string }> = [];

    if (adminIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, telegram_id')
        .in('user_id', adminIds)
        .not('telegram_id', 'is', null);

      if (profilesError) {
        console.error(`${requestTag} failed to load admin profiles`, profilesError.message);
      } else {
        adminsWithTelegram = (profiles || []).filter((p: any) => p.telegram_id) as any;
      }
    }

    console.log(`${requestTag} found ${adminIds.length} admin(s), ${adminsWithTelegram.length} with telegram`);

    let telegramSent = 0;
    let telegramFailed = 0;

    if (TELEGRAM_BOT_TOKEN && adminsWithTelegram.length > 0) {
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      for (const admin of adminsWithTelegram) {
        try {
          const res = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: admin.telegram_id,
              text: telegramMessage,
              parse_mode: 'HTML',
            }),
          });
          if (res.ok) {
            telegramSent++;
            await supabase.from('telegram_admin_messages').insert({
              sender_id: user.id,
              recipient_user_id: admin.user_id,
              chat_id: admin.telegram_id,
              message: telegramMessage,
              status: 'sent',
              template_id: 'new_payment_request',
              recipient_label: 'admin',
            });
          } else {
            telegramFailed++;
            const errText = await res.text();
            console.error(`${requestTag} telegram failed for ${admin.telegram_id}: ${res.status} ${errText}`);
            await supabase.from('telegram_admin_messages').insert({
              sender_id: user.id,
              recipient_user_id: admin.user_id,
              chat_id: admin.telegram_id,
              message: telegramMessage,
              status: 'failed',
              error_message: `${res.status}: ${errText}`.slice(0, 500),
              template_id: 'new_payment_request',
              recipient_label: 'admin',
            });
          }
        } catch (err: unknown) {
          telegramFailed++;
          const msg = err instanceof Error ? err.message : 'unknown';
          console.error(`${requestTag} telegram exception`, msg);
        }
      }
    }

    // Always insert an email_notifications row as durable in-app log for admins
    // (status=pending so it shows in EmailLog even if email not actually sent)
    try {
      await supabase.from('email_notifications').insert({
        recipient_email: 'admin@internal',
        recipient_name: 'Admin notification',
        subject: `💰 وصل دفع جديد — ${request.full_name}`,
        html_body: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(telegramMessage.replace(/<[^>]+>/g, ''))}</pre>`,
        status: 'logged',
      });
    } catch (err: unknown) {
      console.error(`${requestTag} email_notifications insert failed`, err);
    }

    return new Response(JSON.stringify({
      success: true,
      adminsTotal: adminIds.length,
      adminsWithTelegram: adminsWithTelegram.length,
      telegramSent,
      telegramFailed,
      hint: adminsWithTelegram.length === 0
        ? 'لا يوجد أدمن مربوط بالتلغرام — اربط حساب الأدمن من /telegram-link لتلقي الإشعارات.'
        : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${requestTag} fatal`, msg);
    return new Response(JSON.stringify({ error: msg, fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});