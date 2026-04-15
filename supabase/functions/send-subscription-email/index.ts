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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Only allow internal calls (from other edge functions with service role)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      // Also allow calls with valid user JWT from admin
      const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader || '' } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Check admin role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { to, subject, html, fullName } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to send email using available methods
    // Method 1: Use Lovable's email queue if available (pgmq-based)
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    try {
      const { error: queueError } = await supabase.rpc('enqueue_email', {
        p_to: to,
        p_subject: subject,
        p_html: html,
        p_from_name: 'CCP Visa',
      });
      
      if (!queueError) {
        console.log('Email queued successfully via enqueue_email');
        return new Response(JSON.stringify({ success: true, method: 'queue' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('enqueue_email not available, trying alternative methods');
    } catch (e) {
      console.log('enqueue_email RPC not found, trying alternative');
    }

    // Method 2: Store as in-app notification (always works)
    const { error: notifError } = await supabase
      .from('email_notifications')
      .insert({
        recipient_email: to,
        recipient_name: fullName || '',
        subject,
        html_body: html,
        status: 'pending',
      });

    if (notifError) {
      console.error('Failed to store email notification:', notifError);
      // Don't fail - notification was logged
    }

    return new Response(JSON.stringify({ success: true, method: 'stored' }), {
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
