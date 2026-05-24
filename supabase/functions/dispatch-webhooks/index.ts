import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 signature for webhook verification
async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { event_type, country_code } = body;
    if (!event_type || !country_code) {
      return new Response(JSON.stringify({ error: 'event_type and country_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find matching active webhooks
    const { data: webhooks } = await supabase
      .from('outbound_webhooks')
      .select('*')
      .eq('is_active', true)
      .contains('event_types', [event_type]);

    const matches = (webhooks || []).filter((w: any) =>
      !w.countries || w.countries.length === 0 || w.countries.includes(country_code),
    );

    let delivered = 0;
    const payloadStr = JSON.stringify({ ...body, dispatched_at: new Date().toISOString() });

    for (const wh of matches) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'VisaRadar-Webhook/1.0',
        'X-VisaRadar-Event': event_type,
      };
      if (wh.secret) {
        headers['X-VisaRadar-Signature'] = await signPayload(wh.secret, payloadStr);
      }

      let respStatus: number | null = null;
      let respBody = '';
      let success = false;
      let errMsg: string | null = null;

      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(wh.url, {
          method: 'POST',
          headers,
          body: payloadStr,
          signal: controller.signal,
        });
        clearTimeout(t);
        respStatus = res.status;
        respBody = (await res.text()).substring(0, 1000);
        success = res.ok;
        if (success) delivered++;
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      }

      await supabase.from('webhook_delivery_log').insert({
        webhook_id: wh.id,
        event_type,
        payload: body,
        response_status: respStatus,
        response_body: respBody,
        success,
        error_message: errMsg,
      });

      // Update webhook stats
      if (success) {
        await supabase.from('outbound_webhooks').update({
          last_success_at: new Date().toISOString(),
          failure_count: 0,
        }).eq('id', wh.id);
      } else {
        await supabase.from('outbound_webhooks').update({
          last_failure_at: new Date().toISOString(),
          failure_count: (wh.failure_count || 0) + 1,
        }).eq('id', wh.id);
      }
    }

    return new Response(JSON.stringify({ success: true, matched: matches.length, delivered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});