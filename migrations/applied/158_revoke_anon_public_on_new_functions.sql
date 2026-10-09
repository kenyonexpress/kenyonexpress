-- 158_revoke_anon_public_on_new_functions.sql (idempotent)
do $$
declare f text;
begin
  foreach f in array array[
    'public.add_business_days(timestamptz, integer)',
    'public.payout_available_at(timestamptz)',
    'public.fn_record_recent_search(text)',
    'public.enforce_payout_availability()',
    'public.fn_audit_log_append_only()',
    'public.fn_order_items_settlement_status_guard()',
    'public.fn_orders_status_guard()',
    'public.fn_payments_status_guard()',
    'public.payment_events_append_only()',
    'public.refunds_force_due_by()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
