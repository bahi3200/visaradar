import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Official visa appointment websites per country
const VISA_SOURCES: Record<string, { name: string; nameAr: string; flag: string; officialUrl: string; provider: string }> = {
  IT: {
    name: 'Italy',
    nameAr: 'إيطاليا',
    flag: '🇮🇹',
    provider: 'VFS Global',
    officialUrl: 'https://visa.vfsglobal.com/dza/ar/ita/',
  },
  FR: {
    name: 'France',
    nameAr: 'فرنسا',
    flag: '🇫🇷',
    provider: 'TLScontact',
    officialUrl: 'https://visas-fr.tlscontact.com/',
  },
  ES: {
    name: 'Spain',
    nameAr: 'إسبانيا',
    flag: '🇪🇸',
    provider: 'BLS International',
    officialUrl: 'https://www.blsspainvisa.com/',
  },
};

const BodySchema = z.object({
  countryCode: z.enum(['IT', 'FR', 'ES']),
  messageAr: z.string().min(1).max(2000),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { countryCode, messageAr } = parsed.data;
    const source = VISA_SOURCES[countryCode];

    // Get active subscriptions for this country
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('telegram_chat_id, countries')
      .eq('status', 'active')
      .contains('countries', [countryCode]);

    if (subError) throw subError;

    const chatIds = (subscriptions || [])
      .map((s) => s.telegram_chat_id)
      .filter((id): id is string => !!id);

    let sentCount = 0;

    // Build rich Telegram message with source info
    const fullMessage = [
      `🔔 <b>تنبيه تأشيرة - ${source.flag} ${source.nameAr}</b>`,
      ``,
      messageAr,
      ``,
      `📍 <b>الموقع الرسمي:</b> ${source.provider}`,
      `🔗 <a href="${source.officialUrl}">افتح الموقع الآن</a>`,
      ``,
      `⚡ سارع بالحجز قبل نفاد المواعيد!`,
    ].join('\n');

    if (chatIds.length > 0) {
      for (const chatId of chatIds) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: fullMessage,
              parse_mode: 'HTML',
              disable_web_page_preview: false,
            }),
          });
          if (res.ok) sentCount++;
          else {
            const errData = await res.json();
            console.error(`Telegram error for chat ${chatId}:`, errData);
          }
        } catch (err) {
          console.error(`Failed to send to chat ${chatId}:`, err);
        }
      }
    }

    // Log the notification
    await supabase.from('visa_notifications').insert({
      country_code: countryCode,
      message_ar: messageAr,
      sent_count: sentCount,
      sent_by: user.id,
    });

    return new Response(JSON.stringify({
      success: true,
      sentCount,
      totalSubscribers: chatIds.length,
      source: source.provider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
