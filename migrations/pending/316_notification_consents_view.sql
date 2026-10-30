-- 316: `notification_consents`, the notification slice of the consent log.
-- C99 names this log; the append-only evidence table is public.user_consents
-- (280), which the "קבל הכל באפליקציה" toggle already writes one row per change
-- to. A second table would split the evidence, so this is a read view over it.
-- Rollback: drop view if exists public.notification_consents;

create or replace view public.notification_consents
with (security_invoker = true) as
select id, user_id, consent_key, granted, source, ip_address, user_agent, created_at
from public.user_consents
where consent_key like 'notifications\_%';

revoke all on public.notification_consents from anon;
grant select on public.notification_consents to authenticated;
