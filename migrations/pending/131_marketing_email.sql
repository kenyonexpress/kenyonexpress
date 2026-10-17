-- Migration 131: Marketing Email - Resend Broadcasts, Segmentation, Unsubscribe Management

-- This migration requires migration 130 (customer segmentation) to be applied first.
-- Check for prerequisite migration
do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'customer_segments') then
    raise exception 'Migration 130 (customer_segments) must be applied before migration 131';
  end if;
end $$;

-- Table: email_broadcasts
-- Stores marketing email broadcast campaigns
create table if not exists public.email_broadcasts (
  id bigserial primary key,
  name text not null,
  description text,
  subject_line text not null,
  preview_text text,
  html_body text not null,
  text_body text not null,
  target_segment varchar(50) not null,
  status varchar(50) not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  send_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  total_recipients bigint default 0,
  opened_count bigint default 0,
  clicked_count bigint default 0,
  bounced_count bigint default 0,
  complained_count bigint default 0,
  unsubscribed_count bigint default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index idx_email_broadcasts_status on public.email_broadcasts(status);
create index idx_email_broadcasts_target_segment on public.email_broadcasts(target_segment);
create index idx_email_broadcasts_created_at on public.email_broadcasts(created_at desc);

-- Table: email_broadcast_recipients
-- Track individual recipient send status
create table if not exists public.email_broadcast_recipients (
  id bigserial primary key,
  broadcast_id bigint not null references public.email_broadcasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_address text not null,
  status varchar(50) not null default 'queued' check (status in ('queued', 'sent', 'failed', 'bounced', 'complained', 'unsubscribed')),
  resend_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  opened_at timestamptz,
  opened_count int default 0,
  clicked_at timestamptz,
  clicked_urls text[] default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, user_id)
);

create index idx_email_broadcast_recipients_status on public.email_broadcast_recipients(status);
create index idx_email_broadcast_recipients_user on public.email_broadcast_recipients(user_id);
create index idx_email_broadcast_recipients_broadcast on public.email_broadcast_recipients(broadcast_id);

-- Table: email_unsubscribes
-- Track unsubscribe preferences per user, optionally per broadcast/segment
create table if not exists public.email_unsubscribes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_address text not null,
  segment_name varchar(50),
  broadcast_id bigint references public.email_broadcasts(id) on delete set null,
  unsubscribed_at timestamptz not null default now(),
  source varchar(50) not null default 'direct' check (source in ('direct', 'unsubscribe_link', 'complaint', 'bounce', 'admin')),
  reason text,
  unsubscribed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_email_unsubscribes_user on public.email_unsubscribes(user_id);
create index idx_email_unsubscribes_email on public.email_unsubscribes(email_address);
create index idx_email_unsubscribes_segment on public.email_unsubscribes(segment_name);
create unique index idx_email_unsubscribes_user_segment on public.email_unsubscribes(user_id, segment_name) where segment_name is not null and broadcast_id is null;

-- Table: email_delivery_events
-- Webhook events from Resend (bounces, complaints, opens, clicks)
create table if not exists public.email_delivery_events (
  id bigserial primary key,
  broadcast_recipient_id bigint not null references public.email_broadcast_recipients(id) on delete cascade,
  event_type varchar(50) not null check (event_type in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
  resend_event_id text not null,
  bounce_type varchar(50) check (bounce_type in ('permanent', 'temporary', 'undetermined')),
  bounce_subtype varchar(50),
  complaint_type varchar(50),
  clicked_url text,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  unique (broadcast_recipient_id, resend_event_id)
);

create index idx_email_delivery_events_type on public.email_delivery_events(event_type);
create index idx_email_delivery_events_broadcast_recipient on public.email_delivery_events(broadcast_recipient_id);
create index idx_email_delivery_events_created_at on public.email_delivery_events(created_at desc);

-- Table: email_domain_auth
-- SPF, DKIM, DMARC configuration status per domain
create table if not exists public.email_domain_auth (
  id bigserial primary key,
  domain text not null unique,
  spf_record text,
  spf_verified bool default false,
  spf_verified_at timestamptz,
  dkim_record text,
  dkim_verified bool default false,
  dkim_verified_at timestamptz,
  dmarc_record text,
  dmarc_verified bool default false,
  dmarc_verified_at timestamptz,
  resend_domain_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_email_domain_auth_domain on public.email_domain_auth(domain);

-- RLS: email_broadcasts
alter table public.email_broadcasts enable row level security;

create policy "Admin can view all broadcasts" on public.email_broadcasts
  for select using (
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

create policy "Admin can create broadcasts" on public.email_broadcasts
  for insert with check (
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

create policy "Admin can update broadcasts" on public.email_broadcasts
  for update using (
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

-- RLS: email_broadcast_recipients
alter table public.email_broadcast_recipients enable row level security;

create policy "Users can view their own broadcast recipient status" on public.email_broadcast_recipients
  for select using (
    auth.uid() = user_id or
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

-- RLS: email_unsubscribes
alter table public.email_unsubscribes enable row level security;

create policy "Users can view/manage their own unsubscribes" on public.email_unsubscribes
  for select using (
    auth.uid() = user_id or
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

create policy "Users can unsubscribe themselves" on public.email_unsubscribes
  for insert with check (
    auth.uid() = user_id or
    auth.role() = 'service_role'
  );

-- RLS: email_delivery_events
alter table public.email_delivery_events enable row level security;

create policy "Admin can view delivery events" on public.email_delivery_events
  for select using (
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

create policy "Service role can insert delivery events (webhooks)" on public.email_delivery_events
  for insert with check (auth.role() = 'service_role');

-- RLS: email_domain_auth
alter table public.email_domain_auth enable row level security;

create policy "Admin can manage domain auth" on public.email_domain_auth
  for all using (
    exists(select 1 from public.admin_users where user_id = auth.uid())
  );

create policy "Service role can read domain auth" on public.email_domain_auth
  for select using (auth.role() = 'service_role');

-- Function: fn_get_segment_for_broadcast
-- Return users in the target segment, excluding unsubscribed users
create or replace function public.fn_get_segment_for_broadcast(p_segment_name varchar)
returns table(
  user_id uuid,
  email_address text,
  first_name text
) language sql stable as $$
  select distinct
    cs.user_id,
    p.email,
    p.first_name
  from public.customer_segments cs
  join auth.users u on cs.user_id = u.id
  join public.profiles p on u.id = p.user_id
  where cs.segment_name = p_segment_name
    and p.email is not null
    and not exists (
      select 1 from public.email_unsubscribes eu
      where eu.user_id = cs.user_id
        and (eu.segment_name = p_segment_name or eu.segment_name is null)
    );
$$;

-- Function: fn_create_broadcast
-- Create a broadcast campaign and queue recipients
create or replace function public.fn_create_broadcast(
  p_name text,
  p_description text,
  p_subject_line text,
  p_preview_text text,
  p_html_body text,
  p_text_body text,
  p_target_segment varchar,
  p_send_at timestamptz default null
)
returns bigint language plpgsql security definer as $$
declare
  v_broadcast_id bigint;
  v_recipient record;
begin
  -- Insert broadcast record
  insert into public.email_broadcasts (
    name, description, subject_line, preview_text,
    html_body, text_body, target_segment, send_at,
    created_by, status
  ) values (
    p_name, p_description, p_subject_line, p_preview_text,
    p_html_body, p_text_body, p_target_segment, p_send_at,
    auth.uid(), 'draft'
  )
  returning id into v_broadcast_id;

  -- Queue recipients from segment (excluding unsubscribed)
  insert into public.email_broadcast_recipients (broadcast_id, user_id, email_address)
  select v_broadcast_id, user_id, email_address
  from public.fn_get_segment_for_broadcast(p_target_segment);

  -- Update total_recipients count
  update public.email_broadcasts
  set total_recipients = (
    select count(*) from public.email_broadcast_recipients
    where broadcast_id = v_broadcast_id
  )
  where id = v_broadcast_id;

  return v_broadcast_id;
end;
$$;

-- Function: fn_unsubscribe_from_segment
-- Add user to unsubscribe list for a segment
create or replace function public.fn_unsubscribe_from_segment(
  p_user_id uuid,
  p_segment_name varchar default null,
  p_source varchar default 'direct',
  p_reason text default null
)
returns void language plpgsql security definer as $$
begin
  insert into public.email_unsubscribes (user_id, email_address, segment_name, source, reason, unsubscribed_by)
  select
    p_user_id,
    p.email,
    p_segment_name,
    p_source,
    p_reason,
    case when auth.role() = 'authenticated' then auth.uid() else null end
  from public.profiles p
  where p.user_id = p_user_id
  on conflict (user_id, segment_name) do update
  set
    unsubscribed_at = now(),
    source = p_source,
    reason = coalesce(excluded.reason, p_reason),
    unsubscribed_by = case when auth.role() = 'authenticated' then auth.uid() else null end
  where segment_name is not null;
end;
$$;

-- Function: fn_process_delivery_event
-- Process webhook delivery events from Resend and update recipient status
create or replace function public.fn_process_delivery_event(
  p_broadcast_recipient_id bigint,
  p_event_type varchar,
  p_resend_event_id text,
  p_bounce_type varchar default null,
  p_bounce_subtype varchar default null,
  p_complaint_type varchar default null,
  p_clicked_url text default null,
  p_user_agent text default null,
  p_ip_address text default null
)
returns void language plpgsql security definer as $$
declare
  v_broadcast_id bigint;
  v_user_id uuid;
begin
  -- Get broadcast and user info
  select broadcast_id, user_id into v_broadcast_id, v_user_id
  from public.email_broadcast_recipients
  where id = p_broadcast_recipient_id;

  -- Insert delivery event
  insert into public.email_delivery_events (
    broadcast_recipient_id, event_type, resend_event_id,
    bounce_type, bounce_subtype, complaint_type,
    clicked_url, user_agent, ip_address, received_at
  ) values (
    p_broadcast_recipient_id, p_event_type, p_resend_event_id,
    p_bounce_type, p_bounce_subtype, p_complaint_type,
    p_clicked_url, p_user_agent, p_ip_address, now()
  ) on conflict (broadcast_recipient_id, resend_event_id) do nothing;

  -- Update recipient status based on event
  if p_event_type = 'sent' then
    update public.email_broadcast_recipients
    set status = 'sent', sent_at = now()
    where id = p_broadcast_recipient_id;
  elsif p_event_type = 'bounced' then
    update public.email_broadcast_recipients
    set status = 'bounced', bounced_at = now(), error_message = p_bounce_subtype
    where id = p_broadcast_recipient_id;

    -- Hard bounce = unsubscribe
    if p_bounce_type = 'permanent' then
      perform public.fn_unsubscribe_from_segment(
        v_user_id,
        (select target_segment from public.email_broadcasts where id = v_broadcast_id),
        'bounce',
        'Hard bounce: ' || p_bounce_subtype
      );
    end if;
  elsif p_event_type = 'complained' then
    update public.email_broadcast_recipients
    set status = 'complained'
    where id = p_broadcast_recipient_id;

    -- Complaint = unsubscribe
    perform public.fn_unsubscribe_from_segment(
      v_user_id,
      null,
      'complaint',
      'Spam complaint'
    );
  elsif p_event_type = 'opened' then
    update public.email_broadcast_recipients
    set opened_at = now(), opened_count = coalesce(opened_count, 0) + 1
    where id = p_broadcast_recipient_id;
  elsif p_event_type = 'clicked' then
    update public.email_broadcast_recipients
    set
      clicked_at = now(),
      clicked_urls = array_append(coalesce(clicked_urls, array[]::text[]), p_clicked_url),
      clicked_count = coalesce(clicked_count, 0) + 1
    where id = p_broadcast_recipient_id and p_clicked_url is not null;
  end if;

  -- Update broadcast aggregates
  update public.email_broadcasts
  set
    opened_count = (select count(*) from public.email_broadcast_recipients where broadcast_id = v_broadcast_id and opened_at is not null),
    clicked_count = (select count(*) from public.email_broadcast_recipients where broadcast_id = v_broadcast_id and clicked_at is not null),
    bounced_count = (select count(*) from public.email_broadcast_recipients where broadcast_id = v_broadcast_id and status = 'bounced'),
    complained_count = (select count(*) from public.email_broadcast_recipients where broadcast_id = v_broadcast_id and status = 'complained'),
    unsubscribed_count = (select count(*) from public.email_broadcast_recipients where broadcast_id = v_broadcast_id and status = 'unsubscribed')
  where id = v_broadcast_id;
end;
$$;

-- Function: fn_get_broadcast_stats
-- Get comprehensive stats for a broadcast
create or replace function public.fn_get_broadcast_stats(p_broadcast_id bigint)
returns table(
  broadcast_id bigint,
  total_recipients bigint,
  sent_count bigint,
  opened_count bigint,
  open_rate numeric,
  clicked_count bigint,
  click_rate numeric,
  bounced_count bigint,
  bounce_rate numeric,
  complained_count bigint,
  complaint_rate numeric,
  unsubscribed_count bigint,
  unsubscribe_rate numeric
) language sql stable as $$
  select
    p_broadcast_id,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id)::bigint,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'sent')::bigint,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and opened_at is not null)::bigint,
    (select round(100.0 * count(*) / nullif((select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id), 0), 2) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and opened_at is not null)::numeric,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and clicked_at is not null)::bigint,
    (select round(100.0 * count(*) / nullif((select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id), 0), 2) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and clicked_at is not null)::numeric,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'bounced')::bigint,
    (select round(100.0 * count(*) / nullif((select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id), 0), 2) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'bounced')::numeric,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'complained')::bigint,
    (select round(100.0 * count(*) / nullif((select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id), 0), 2) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'complained')::numeric,
    (select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'unsubscribed')::bigint,
    (select round(100.0 * count(*) / nullif((select count(*) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id), 0), 2) from public.email_broadcast_recipients where broadcast_id = p_broadcast_id and status = 'unsubscribed')::numeric;
$$;

-- Grant execute permissions
grant execute on function public.fn_get_segment_for_broadcast(varchar) to authenticated, anon, service_role;
grant execute on function public.fn_create_broadcast(text, text, text, text, text, text, varchar, timestamptz) to authenticated, service_role;
grant execute on function public.fn_unsubscribe_from_segment(uuid, varchar, varchar, text) to authenticated, service_role;
grant execute on function public.fn_process_delivery_event(bigint, varchar, text, varchar, varchar, varchar, text, text, text) to service_role;
grant execute on function public.fn_get_broadcast_stats(bigint) to authenticated, service_role;
