import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/internalAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default reminder milestones (days before expiry); overridable via site_settings.expiry_reminder_days
const DEFAULT_REMINDER_DAYS = [7, 3, 1];

function parseReminderDays(raw: string | null | undefined): number[] {
  if (!raw) return DEFAULT_REMINDER_DAYS;
  const parsed = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 60);
  // Deduplicate + sort desc so longest lead-time runs first
  const unique = Array.from(new Set(parsed)).sort((a, b) => b - a);
  return unique.length > 0 ? unique : DEFAULT_REMINDER_DAYS;
}

function buildExpiryEmailHtml(fullName: string, packageName: string, daysLeft: number, expiryDate: string): string {
  const urgencyColor = daysLeft <= 1 ? '#ef4444' : daysLeft <= 3 ? '#f97316' : '#eab308';
  const urgencyIcon = daysLeft <= 1 ? '🔴' : daysLeft <= 3 ? '🟠' : '🟡';
  const daysText = daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'غداً' : `خلال ${daysLeft} أيام`;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:${urgencyColor};padding:28px 32px;text-align:center;">
    <p style="margin:0;font-size:36px;">⏳</p>
    <h1 style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:bold;">اشتراكك ينتهي ${daysText}!</h1>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">مرحباً ${fullName || 'عزيزي المشترك'}،</p>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.8;">
      نود تذكيرك بأن اشتراكك في خدمة <b>CCP Visa</b> سينتهي قريباً. جدّد اشتراكك الآن للاستمرار في تلقي التنبيهات الفورية.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:12px 16px;color:#6b7280;font-size:14px;">الباقة</td><td style="padding:12px 16px;font-weight:bold;font-size:14px;">${packageName}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:12px 16px;color:#6b7280;font-size:14px;">تاريخ الانتهاء</td><td style="padding:12px 16px;font-weight:bold;font-size:14px;">${expiryDate}</td></tr>
      <tr><td style="padding:12px 16px;color:#6b7280;font-size:14px;">الحالة</td><td style="padding:12px 16px;font-weight:bold;font-size:14px;color:${urgencyColor};">${urgencyIcon} ينتهي ${daysText}</td></tr>
    </table>
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="https://id-preview--c59c86b6-a328-4a9c-8d92-4cd70ebd62c6.lovable.app/subscribe?renew=true" style="display:inline-block;background:${urgencyColor};color:#ffffff;font-weight:bold;font-size:16px;padding:14px 40px;border-radius:12px;text-decoration:none;">
        تجديد الاشتراك الآن ←
      </a>
    </div>
    <p style="margin:16px 0 0;padding:16px;background:#f9fafb;border-radius:12px;font-size:13px;color:#6b7280;text-align:center;line-height:1.8;">
      💡 جدّد اشتراكك قبل انتهائه لتجنب انقطاع خدمة التنبيهات
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px 24px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">هذا البريد مُرسل تلقائياً — لا تقم بالرد عليه</p>
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
  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Load configurable reminder days from site_settings
    const { data: settingRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'expiry_reminder_days')
      .maybeSingle();
    const REMINDER_DAYS = parseReminderDays(settingRow?.value);

    console.log('[check-expiring] Starting reminder check for milestones:', REMINDER_DAYS);

    const now = new Date();
    let totalNotified = 0;
    const summary: Record<string, number> = {};

    for (const milestone of REMINDER_DAYS) {
      // Window: subscriptions that expire in [milestone, milestone+1) days from now
      const windowStart = new Date(now.getTime() + (milestone - 1) * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + milestone * 24 * 60 * 60 * 1000);

      const { data: expiringSubs, error: subError } = await supabase
        .from('subscriptions')
        .select('*, packages(name_ar)')
        .eq('status', 'active')
        .gt('expires_at', windowStart.toISOString())
        .lte('expires_at', windowEnd.toISOString());

      if (subError) {
        console.error(`[check-expiring] Query error for D-${milestone}:`, subError);
        continue;
      }

      console.log(`[check-expiring] D-${milestone}: found ${expiringSubs?.length ?? 0} subs`);
      summary[`D-${milestone}`] = 0;

      if (!expiringSubs || expiringSubs.length === 0) continue;

      for (const sub of expiringSubs) {
        const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        const expiryDate = new Date(sub.expires_at).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
        const packageName = (sub as any).packages?.name_ar || 'الباقة';

        // Dedup via the new expiry_reminder_log table (per-milestone per-subscription)
        const { data: existingLog } = await supabase
          .from('expiry_reminder_log')
          .select('id')
          .eq('subscription_id', sub.id)
          .eq('milestone_days', milestone)
          .limit(1);

        if (existingLog && existingLog.length > 0) {
          console.log(`[check-expiring] D-${milestone}: already sent for sub ${sub.id}, skip`);
          continue;
        }

        // Get user profile and email
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, telegram_id')
          .eq('user_id', sub.user_id)
          .maybeSingle();

        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(sub.user_id);
        const userEmail = authUser?.email;
        const fullName = profile?.full_name || '';
        const telegramId = sub.telegram_chat_id || profile?.telegram_id;

        const daysText = daysLeft === 0 ? 'اليوم' : daysLeft === 1 ? 'غداً' : `خلال ${daysLeft} أيام`;

        let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
        let emailError: string | null = null;
        let telegramStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
        let telegramError: string | null = null;

        // Email
        if (userEmail) {
          const emailSubject = `⏳ اشتراكك ينتهي ${daysText} — جدّد الآن`;
          const emailHtml = buildExpiryEmailHtml(fullName, packageName, daysLeft, expiryDate);

          try {
            const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-subscription-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ to: userEmail, subject: emailSubject, html: emailHtml, fullName }),
            });
            if (!emailRes.ok) {
              emailStatus = 'failed';
              emailError = (await emailRes.text()).slice(0, 500);
              console.error(`[check-expiring] Email failed for ${userEmail}:`, emailError);
            } else {
              emailStatus = 'sent';
            }
          } catch (err) {
            emailStatus = 'failed';
            emailError = err instanceof Error ? err.message : String(err);
            console.error(`[check-expiring] Email error for ${userEmail}:`, err);
          }
        }

        // Telegram
        if (telegramId && TELEGRAM_BOT_TOKEN) {
          const telegramMessage = [
            `⏳ <b>تذكير: اشتراكك ينتهي ${daysText}!</b>`,
            ``,
            `📦 <b>الباقة:</b> ${packageName}`,
            `📅 <b>تاريخ الانتهاء:</b> ${expiryDate}`,
            `⏱ <b>الوقت المتبقي:</b> ${daysLeft} يوم`,
            ``,
            `🔄 جدّد اشتراكك الآن لتجنب انقطاع خدمة التنبيهات.`,
          ].join('\n');

          try {
            const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: telegramId, text: telegramMessage, parse_mode: 'HTML' }),
            });
            if (!res.ok) {
              telegramStatus = 'failed';
              telegramError = (await res.text()).slice(0, 500);
              console.error(`[check-expiring] Telegram failed:`, telegramError);
            } else {
              telegramStatus = 'sent';
            }
          } catch (err) {
            telegramStatus = 'failed';
            telegramError = err instanceof Error ? err.message : String(err);
            console.error(`[check-expiring] Telegram error:`, err);
          }
        }

        // Persist log entry (acts as dedup marker too)
        await supabase.from('expiry_reminder_log').insert({
          user_id: sub.user_id,
          subscription_id: sub.id,
          package_name: packageName,
          recipient_name: fullName || null,
          recipient_email: userEmail || null,
          telegram_chat_id: telegramId || null,
          milestone_days: milestone,
          days_left: daysLeft,
          expires_at: sub.expires_at,
          email_status: emailStatus,
          email_error: emailError,
          telegram_status: telegramStatus,
          telegram_error: telegramError,
        });

        totalNotified++;
        summary[`D-${milestone}`]++;
      }
    }

    console.log(`[check-expiring] Done. Total: ${totalNotified}`, summary);

    return new Response(JSON.stringify({ success: true, notified: totalNotified, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[check-expiring] Fatal error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
