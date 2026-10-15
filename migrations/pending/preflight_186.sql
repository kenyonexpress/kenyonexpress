-- preflight_186.sql -- read-only. Run before 186.

-- (1) The column does not exist yet.
--     EXPECT: 0 rows.
select column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders' and column_name = 'gift_send_at';

-- (2) The gift columns 108 added are present, so the feature this extends is live.
--     EXPECT: 3 rows.
select column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders'
   and column_name in ('gift_recipient_email', 'gift_recipient_name', 'gift_message');
