-- 312: payment_production flag (G104). OFF: the checkout submit creates no live charge.
-- Rollback: delete from public.feature_flags where key = 'payment_production';

insert into public.feature_flags (key, bool_value)
values ('payment_production', false)
on conflict (key) do nothing;
