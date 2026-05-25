// Shared helpers for restricting edge functions to:
// - service-role (cron/internal callers)
// - admin/moderator users (privileged UI callers)
//
// All cron-only or internal-only functions MUST call requireServiceRole()
// at the top of their handler to reject anonymous traffic.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-token',
};

function unauthorized(msg = 'Unauthorized') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function forbidden(msg = 'Forbidden') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Require the caller to present the project's SERVICE_ROLE key in the
 * Authorization header. Returns null on success, or a 401 Response on failure.
 * Use for cron-invoked functions and function-to-function calls only.
 */
export function requireServiceRole(req: Request): Response | null {
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SERVICE_ROLE) return unauthorized('SERVICE_ROLE not configured');

  const raw = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== SERVICE_ROLE) return unauthorized();
  return null;
}

/**
 * Require an authenticated admin (or moderator) JWT.
 * Returns { user } on success, or a Response on failure.
 */
export async function requireAdmin(
  req: Request,
  opts: { allowModerator?: boolean } = {},
): Promise<{ user: { id: string; email?: string | null } } | Response> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const raw = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return unauthorized();

  // Service role bypass — internal callers are trusted as admin.
  if (token === SERVICE_ROLE) {
    return { user: { id: '00000000-0000-0000-0000-000000000000', email: 'service-role' } };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return unauthorized();

  const roles = opts.allowModerator ? ['admin', 'moderator'] : ['admin'];
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', roles)
    .maybeSingle();

  if (!roleRow) return forbidden('Admin role required');
  return { user: { id: user.id, email: user.email } };
}