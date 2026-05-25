import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { requireServiceRoleOrAdmin } from '../_shared/internalAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(['approved', 'rejected', 'frozen']),
  adminNotes: z.string().optional(),
});

function buildEmailHtml(status: string, packageName: string, price: string, expiryDate: string, adminNotes?: string): string {
  const headerColor = status === 'approved' ? '#22c55e' : status === 'rejected' ? '#ef4444' : '#3b82f6';
  const headerIcon = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏸️';
  const headerText = status === 'approved' ? 'تمت الموافقة على طلب اشتراكك!' 
    : status === 'rejected' ? 'تم رفض طلب اشتراكك' 
    : 'تم تجميد اشتراكك مؤقتاً';

  let bodyContent = '';
  if (status === 'approved') {
    bodyContent = `
      <tr><td style="padding:8px 16px;color:#6b7280;font-size:14px;">الباقة</td><td style="padding:8px 16px;font-weight:bold;font-size:14px;">${packageName}</td></tr>
      ${price ? `<tr><td style="padding:8px 16px;color:#6b7280;font-size:14px;">المبلغ</td><td style="padding:8px 16px;font-weight:bold;font-size:14px;">${price}</td></tr>` : ''}
      <tr><td style="padding:8px 16px;color:#6b7280;font-size:14px;">صالح حتى</td><td style="padding:8px 16px;font-weight:bold;font-size:14px;">${expiryDate}</td></tr>
    `;
  } else {
    bodyContent = `
      <tr><td style="padding:8px 16px;color:#6b7280;font-size:14px;">الباقة</td><td style="padding:8px 16px;font-weight:bold;font-size:14px;">${packageName}</td></tr>
      ${adminNotes ? `<tr><td style="padding:8px 16px;color:#6b7280;font-size:14px;">${status === 'rejected' ? 'السبب' : 'الملاحظة'}</td><td style="padding:8px 16px;font-size:14px;">${adminNotes}</td></tr>` : ''}
    `;
  }

  const footerText = status === 'approved' 
    ? '🎉 يمكنك الآن الاستفادة من جميع خدمات المنصة. شكراً لثقتك بنا!'
    : status === 'rejected'
    ? 'يمكنك إعادة تقديم طلب جديد مع التأكد من صحة وصل الدفع. للاستفسار تواصل معنا عبر الدعم.'
    : 'للاستفسار تواصل معنا عبر الدعم.';

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:${headerColor};padding:28px 32px;text-align:center;">
    <p style="margin:0;font-size:36px;">${headerIcon}</p>
    <h1 style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:bold;">${headerText}</h1>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${bodyContent}
    </table>
    <p style="margin:24px 0 0;padding:16px;background:#f9fafb;border-radius:12px;font-size:14px;color:#4b5563;text-align:center;line-height:1.8;">
      ${footerText}
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">هذا البريد مُرسل تلقائياً - لا تقم بالرد عليه</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[notify-subscription-status] Function called');
    console.log('[notify-subscription-status] TELEGRAM_BOT_TOKEN present:', !!TELEGRAM_BOT_TOKEN);

    // Require admin or moderator (or service role) — this function can email/Telegram any user.
    const authFail = await requireServiceRoleOrAdmin(req, { allowModerator: true });
    if (authFail) {
      console.error('[notify-subscription-status] Auth check failed');
      return authFail;
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      console.error('[notify-subscription-status] Validation failed:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { requestId, status, adminNotes } = parsed.data;
    console.log('[notify-subscription-status] Processing:', { requestId, status });

    // Get the subscription request
    const { data: request, error: reqError } = await supabase
      .from('subscription_requests')
      .select('*, packages(name_ar, duration_months, price)')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      console.error('[notify-subscription-status] Request not found:', reqError?.message);
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const packageName = request.packages?.name_ar || 'الباقة';
    const price = request.packages?.price ? `${request.packages.price} د.ج` : '';
    const months = request.packages?.duration_months || 3;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
    const expiryDate = expiresAt.toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build Telegram message
    let telegramMessage = '';
    if (status === 'approved') {
      telegramMessage = [
        `✅ <b>تمت الموافقة على طلب اشتراكك!</b>`,
        ``,
        `📦 <b>الباقة:</b> ${packageName}`,
        price ? `💰 <b>المبلغ:</b> ${price}` : '',
        `📅 <b>صالح حتى:</b> ${expiryDate}`,
        ``,
        `🎉 يمكنك الآن الاستفادة من جميع خدمات المنصة.`,
        `شكراً لثقتك بنا! 🙏`,
      ].filter(Boolean).join('\n');
    } else if (status === 'rejected') {
      telegramMessage = [
        `❌ <b>تم رفض طلب اشتراكك</b>`,
        ``,
        `📦 <b>الباقة:</b> ${packageName}`,
        adminNotes ? `📝 <b>السبب:</b> ${adminNotes}` : '',
        ``,
        `يمكنك إعادة تقديم طلب جديد مع التأكد من صحة وصل الدفع.`,
        `للاستفسار تواصل معنا عبر الدعم. 📩`,
      ].filter(Boolean).join('\n');
    } else if (status === 'frozen') {
      telegramMessage = [
        `⏸ <b>تم تجميد اشتراكك مؤقتاً</b>`,
        ``,
        `📦 <b>الباقة:</b> ${packageName}`,
        adminNotes ? `📝 <b>الملاحظة:</b> ${adminNotes}` : '',
        ``,
        `للاستفسار تواصل معنا عبر الدعم. 📩`,
      ].filter(Boolean).join('\n');
    }

    // Send Telegram notification - try request's chat_id first, fallback to profile's telegram_id
    let telegramSent = false;
    let chatId = request.telegram_chat_id;
    
    // If no chat_id in request, try to get from profile
    if (!chatId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_id')
        .eq('user_id', request.user_id)
        .maybeSingle();
      chatId = profile?.telegram_id || null;
      console.log('[notify-subscription-status] Fallback to profile telegram_id:', chatId);
    }
    
    console.log('[notify-subscription-status] Chat ID:', chatId, '| Token present:', !!TELEGRAM_BOT_TOKEN);

    if (chatId && TELEGRAM_BOT_TOKEN) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const telegramBody = {
          chat_id: chatId,
          text: telegramMessage,
          parse_mode: 'HTML',
        };
        console.log('[notify-subscription-status] Sending to Telegram, chat_id:', chatId);
        
        const res = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telegramBody),
        });
        
        const resData = await res.json();
        if (res.ok) {
          telegramSent = true;
          console.log('[notify-subscription-status] Telegram sent successfully');
        } else {
          console.error('[notify-subscription-status] Telegram API error:', JSON.stringify(resData));
        }
      } catch (err) {
        console.error('[notify-subscription-status] Telegram fetch error:', err);
      }
    } else {
      console.warn('[notify-subscription-status] Skipping Telegram: chatId=', chatId, 'tokenPresent=', !!TELEGRAM_BOT_TOKEN);
    }

    // Send email notification
    let emailSent = false;
    const userEmail = request.email;
    if (userEmail) {
      try {
        const emailSubject = status === 'approved' 
          ? '✅ تمت الموافقة على اشتراكك'
          : status === 'rejected'
          ? '❌ تم رفض طلب اشتراكك'
          : '⏸️ تم تجميد اشتراكك';

        const emailHtml = buildEmailHtml(status, packageName, price, expiryDate, adminNotes);

        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (LOVABLE_API_KEY) {
          const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-subscription-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              to: userEmail,
              subject: emailSubject,
              html: emailHtml,
              fullName: request.full_name,
            }),
          });
          
          if (emailRes.ok) {
            emailSent = true;
          } else {
            console.error('[notify-subscription-status] Email send failed:', await emailRes.text());
          }
        }
      } catch (err) {
        console.error('[notify-subscription-status] Email error:', err);
      }
    }

    console.log('[notify-subscription-status] Done. telegramSent:', telegramSent, 'emailSent:', emailSent);

    return new Response(JSON.stringify({ success: true, telegramSent, emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[notify-subscription-status] Fatal error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
