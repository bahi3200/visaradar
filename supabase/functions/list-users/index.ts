import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to list users
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 500 });
    if (usersError) throw usersError;

    // Get subscriptions
    const { data: subscriptions } = await adminClient
      .from("subscriptions")
      .select("*, packages(name_ar, name_en, duration_months, is_golden)");

    // Get roles
    const { data: roles } = await adminClient.from("user_roles").select("*");

    // Get devices count
    const { data: devices } = await adminClient
      .from("user_devices")
      .select("user_id, is_active")
      .eq("is_active", true);

    // Get telegram link info from profiles
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, telegram_id, telegram_username, telegram_linked_at");

    // Map data
    const result = users.map((u) => {
      const userSubs = (subscriptions || []).filter((s) => s.user_id === u.id);
      const activeSub =
        userSubs.find((s) => s.status === "active" && new Date(s.expires_at) > new Date()) ||
        userSubs.find((s) => s.status === "paused");
      const userRoles = (roles || []).filter((r) => r.user_id === u.id).map((r) => r.role);
      const deviceCount = (devices || []).filter((d) => d.user_id === u.id).length;
      const profile = (profiles || []).find((p) => p.user_id === u.id);

      return {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || "",
        phone: u.user_metadata?.phone || "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until || null,
        roles: userRoles,
        active_devices: deviceCount,
        telegram_id: profile?.telegram_id || null,
        telegram_username: profile?.telegram_username || null,
        telegram_linked_at: profile?.telegram_linked_at || null,
        subscription: activeSub
          ? {
              id: activeSub.id,
              status: activeSub.status,
              package_name: activeSub.packages?.name_ar || "",
              is_golden: activeSub.packages?.is_golden || false,
              countries: activeSub.countries,
              expires_at: activeSub.expires_at,
              paused_at: activeSub.paused_at || null,
              paused_remaining_seconds: activeSub.paused_remaining_seconds || null,
            }
          : null,
      };
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
