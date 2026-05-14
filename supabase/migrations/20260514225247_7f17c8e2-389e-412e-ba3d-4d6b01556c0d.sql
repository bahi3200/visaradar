-- Tighten SECURITY DEFINER function exposure further.
-- Move helpers that are only invoked from service_role edge functions
-- behind service_role exclusively (PUBLIC/anon/authenticated cannot call them directly).
-- Functions still callable via service_role bypass RLS/grants regardless.

-- count_active_devices: only used by check-device edge function (service_role)
REVOKE EXECUTE ON FUNCTION public.count_active_devices(uuid) FROM PUBLIC, anon, authenticated;

-- is_device_allowed: only used by check-device edge function (service_role)
REVOKE EXECUTE ON FUNCTION public.is_device_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

-- Note: has_role MUST remain executable by `authenticated` because:
--   1) Client hooks (PaymentSettings, NotificationSettings) call it directly via RPC
--   2) RLS policies on multiple tables invoke it; the policy invoker needs EXECUTE
--
-- Note: get_payment_info / set_promo_input_method / update_package_promo
-- already enforce `has_role(auth.uid(), 'admin')` inside their bodies and must
-- stay callable by `authenticated` (admins authenticate using the same DB role).
-- There is no separate "admin" DB role to grant to in Postgres — admin gating
-- is enforced at the application layer via the user_roles table.