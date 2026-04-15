import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  fingerprint: z.string().min(1).max(200),
  deviceName: z.string().max(200).optional(),
  browser: z.string().max(100).optional(),
  os: z.string().max(100).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fingerprint, deviceName, browser, os } = parsed.data;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    // Check if user is admin - admins bypass device limits
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });

    if (!isAdmin) {
      // Check if device is allowed
      const { data: allowed } = await supabase.rpc('is_device_allowed', {
        _user_id: user.id,
        _fingerprint: fingerprint,
      });

      if (!allowed) {
        // Get current devices for info
        const { data: devices } = await supabase
          .from('user_devices')
          .select('device_name, browser, last_active_at')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('last_active_at', { ascending: false })
          .limit(2);

        return new Response(JSON.stringify({
          allowed: false,
          error: 'تم تجاوز الحد الأقصى للأجهزة (جهازين). يرجى إلغاء تفعيل جهاز آخر أولاً.',
          activeDevices: devices,
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Register/update device
    const { error: upsertError } = await supabase
      .from('user_devices')
      .upsert({
        user_id: user.id,
        device_fingerprint: fingerprint,
        device_name: deviceName || 'جهاز غير معروف',
        browser: browser || null,
        os: os || null,
        ip_address: clientIp,
        is_active: true,
        last_active_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,device_fingerprint',
      });

    if (upsertError) throw upsertError;

    // Get device count
    const { data: count } = await supabase.rpc('count_active_devices', { _user_id: user.id });

    return new Response(JSON.stringify({
      allowed: true,
      activeDeviceCount: count,
      isShared: (count || 0) > 1,
    }), {
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
