-- 332_sms_definer_lockdown.sql (C194, M14)
--
-- scripts/audit-role-separation.mjs against production, 2026-11-03:
--   definer-mutable-search-path  fn_create_sms_broadcast
--   definer-mutable-search-path  fn_process_sms_delivery_event
-- Both are SECURITY DEFINER, EXECUTE-able by anon and authenticated, check no
-- caller role, and pin no search_path. Through PostgREST an anonymous client
-- could create broadcast drafts for any segment, or forge delivery and
-- unsubscribe events for any recipient SID.
--
-- The only callers are src/app/api/sms/broadcasts/route.ts (behind
-- validateAdminRequest) and src/app/api/webhooks/twilio/route.ts (behind the
-- Twilio signature check). Both use createAdminClient(), i.e. service_role, so
-- revoking from public/anon/authenticated removes nothing a real caller uses.
-- No policy references either function.
--
-- Idempotent: ALTER ... SET and REVOKE are safe to re-run.
-- Apply: supabase db query --linked -f migrations/applied/332_sms_definer_lockdown.sql

begin;

alter function public.fn_create_sms_broadcast(
  text, text, text, text, text, timestamp with time zone,
  time without time zone, time without time zone
) set search_path = public, pg_temp;

alter function public.fn_process_sms_delivery_event(text, text, text, text)
  set search_path = public, pg_temp;

revoke execute on function public.fn_create_sms_broadcast(
  text, text, text, text, text, timestamp with time zone,
  time without time zone, time without time zone
) from public, anon, authenticated;

revoke execute on function public.fn_process_sms_delivery_event(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.fn_create_sms_broadcast(
  text, text, text, text, text, timestamp with time zone,
  time without time zone, time without time zone
) to service_role;

grant execute on function public.fn_process_sms_delivery_event(text, text, text, text)
  to service_role;

commit;
