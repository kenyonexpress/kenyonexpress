-- pgTAP: every table in schema public has row level security ON and at least
-- one policy (a RESTRICTIVE deny_all_client_roles counts: it is the stated lock).
-- Generated from supabase/rls-manifest.json (measured against production
-- ixvwfbuvfxxsjiywhbbb, 2026-09-07). Run: supabase test db
-- Read-only; the transaction is rolled back.
--
-- Three assertions per manifest table, then one completeness check that reads
-- the live catalog: a public table that is neither in this file nor RLS-protected
-- fails the suite, so a new table cannot ship unprotected or untested.
begin;
select plan(215);

select has_table('public', 'abandoned_cart_nudges', 'public.abandoned_cart_nudges exists');
select ok((select relrowsecurity from pg_class where oid = 'public.abandoned_cart_nudges'::regclass), 'RLS is on for abandoned_cart_nudges');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'abandoned_cart_nudges'), '>=', 1, 'abandoned_cart_nudges has at least one policy');
select has_table('public', 'affiliates', 'public.affiliates exists');
select ok((select relrowsecurity from pg_class where oid = 'public.affiliates'::regclass), 'RLS is on for affiliates');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'affiliates'), '>=', 1, 'affiliates has at least one policy');
select has_table('public', 'ai_usage', 'public.ai_usage exists');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass), 'RLS is on for ai_usage');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'ai_usage'), '>=', 1, 'ai_usage has at least one policy');
select has_table('public', 'analytics_events', 'public.analytics_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass), 'RLS is on for analytics_events');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'analytics_events'), '>=', 1, 'analytics_events has at least one policy');
select has_table('public', 'audit_log', 'public.audit_log exists');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'RLS is on for audit_log');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'audit_log'), '>=', 1, 'audit_log has at least one policy');
select has_table('public', 'banners', 'public.banners exists');
select ok((select relrowsecurity from pg_class where oid = 'public.banners'::regclass), 'RLS is on for banners');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'banners'), '>=', 1, 'banners has at least one policy');
select has_table('public', 'carts', 'public.carts exists');
select ok((select relrowsecurity from pg_class where oid = 'public.carts'::regclass), 'RLS is on for carts');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'carts'), '>=', 1, 'carts has at least one policy');
select has_table('public', 'cashback_rules', 'public.cashback_rules exists');
select ok((select relrowsecurity from pg_class where oid = 'public.cashback_rules'::regclass), 'RLS is on for cashback_rules');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'cashback_rules'), '>=', 1, 'cashback_rules has at least one policy');
select has_table('public', 'categories', 'public.categories exists');
select ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass), 'RLS is on for categories');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'categories'), '>=', 1, 'categories has at least one policy');
select has_table('public', 'coupon_codes', 'public.coupon_codes exists');
select ok((select relrowsecurity from pg_class where oid = 'public.coupon_codes'::regclass), 'RLS is on for coupon_codes');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'coupon_codes'), '>=', 1, 'coupon_codes has at least one policy');
select has_table('public', 'coupon_deals', 'public.coupon_deals exists');
select ok((select relrowsecurity from pg_class where oid = 'public.coupon_deals'::regclass), 'RLS is on for coupon_deals');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'coupon_deals'), '>=', 1, 'coupon_deals has at least one policy');
select has_table('public', 'coupons', 'public.coupons exists');
select ok((select relrowsecurity from pg_class where oid = 'public.coupons'::regclass), 'RLS is on for coupons');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'coupons'), '>=', 1, 'coupons has at least one policy');
select has_table('public', 'discount_campaigns', 'public.discount_campaigns exists');
select ok((select relrowsecurity from pg_class where oid = 'public.discount_campaigns'::regclass), 'RLS is on for discount_campaigns');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'discount_campaigns'), '>=', 1, 'discount_campaigns has at least one policy');
select has_table('public', 'discount_redemptions', 'public.discount_redemptions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.discount_redemptions'::regclass), 'RLS is on for discount_redemptions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'discount_redemptions'), '>=', 1, 'discount_redemptions has at least one policy');
select has_table('public', 'email_suppressions', 'public.email_suppressions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.email_suppressions'::regclass), 'RLS is on for email_suppressions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'email_suppressions'), '>=', 1, 'email_suppressions has at least one policy');
select has_table('public', 'escrow_holds', 'public.escrow_holds exists');
select ok((select relrowsecurity from pg_class where oid = 'public.escrow_holds'::regclass), 'RLS is on for escrow_holds');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'escrow_holds'), '>=', 1, 'escrow_holds has at least one policy');
select has_table('public', 'homepage_sections', 'public.homepage_sections exists');
select ok((select relrowsecurity from pg_class where oid = 'public.homepage_sections'::regclass), 'RLS is on for homepage_sections');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'homepage_sections'), '>=', 1, 'homepage_sections has at least one policy');
select has_table('public', 'invoices', 'public.invoices exists');
select ok((select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), 'RLS is on for invoices');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'invoices'), '>=', 1, 'invoices has at least one policy');
select has_table('public', 'legacy_percent_archive_112', 'public.legacy_percent_archive_112 exists');
select ok((select relrowsecurity from pg_class where oid = 'public.legacy_percent_archive_112'::regclass), 'RLS is on for legacy_percent_archive_112');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'legacy_percent_archive_112'), '>=', 1, 'legacy_percent_archive_112 has at least one policy');
select has_table('public', 'media_assets', 'public.media_assets exists');
select ok((select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass), 'RLS is on for media_assets');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'media_assets'), '>=', 1, 'media_assets has at least one policy');
select has_table('public', 'newsletter_subscribers', 'public.newsletter_subscribers exists');
select ok((select relrowsecurity from pg_class where oid = 'public.newsletter_subscribers'::regclass), 'RLS is on for newsletter_subscribers');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'newsletter_subscribers'), '>=', 1, 'newsletter_subscribers has at least one policy');
select has_table('public', 'notification_outbox', 'public.notification_outbox exists');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass), 'RLS is on for notification_outbox');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'notification_outbox'), '>=', 1, 'notification_outbox has at least one policy');
select has_table('public', 'order_items', 'public.order_items exists');
select ok((select relrowsecurity from pg_class where oid = 'public.order_items'::regclass), 'RLS is on for order_items');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'order_items'), '>=', 1, 'order_items has at least one policy');
select has_table('public', 'orders', 'public.orders exists');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS is on for orders');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'orders'), '>=', 1, 'orders has at least one policy');
select has_table('public', 'payment_events', 'public.payment_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_events'::regclass), 'RLS is on for payment_events');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payment_events'), '>=', 1, 'payment_events has at least one policy');
select has_table('public', 'payment_tokens', 'public.payment_tokens exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_tokens'::regclass), 'RLS is on for payment_tokens');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payment_tokens'), '>=', 1, 'payment_tokens has at least one policy');
select has_table('public', 'payment_webhook_events', 'public.payment_webhook_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_webhook_events'::regclass), 'RLS is on for payment_webhook_events');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payment_webhook_events'), '>=', 1, 'payment_webhook_events has at least one policy');
select has_table('public', 'payments', 'public.payments exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payments'::regclass), 'RLS is on for payments');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payments'), '>=', 1, 'payments has at least one policy');
select has_table('public', 'payout_statement_lines', 'public.payout_statement_lines exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payout_statement_lines'::regclass), 'RLS is on for payout_statement_lines');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payout_statement_lines'), '>=', 1, 'payout_statement_lines has at least one policy');
select has_table('public', 'payout_statements', 'public.payout_statements exists');
select ok((select relrowsecurity from pg_class where oid = 'public.payout_statements'::regclass), 'RLS is on for payout_statements');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'payout_statements'), '>=', 1, 'payout_statements has at least one policy');
select has_table('public', 'popular_searches', 'public.popular_searches exists');
select ok((select relrowsecurity from pg_class where oid = 'public.popular_searches'::regclass), 'RLS is on for popular_searches');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'popular_searches'), '>=', 1, 'popular_searches has at least one policy');
select has_table('public', 'product_images', 'public.product_images exists');
select ok((select relrowsecurity from pg_class where oid = 'public.product_images'::regclass), 'RLS is on for product_images');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'product_images'), '>=', 1, 'product_images has at least one policy');
select has_table('public', 'product_variants', 'public.product_variants exists');
select ok((select relrowsecurity from pg_class where oid = 'public.product_variants'::regclass), 'RLS is on for product_variants');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'product_variants'), '>=', 1, 'product_variants has at least one policy');
select has_table('public', 'products', 'public.products exists');
select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'RLS is on for products');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'products'), '>=', 1, 'products has at least one policy');
select has_table('public', 'profiles', 'public.profiles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is on for profiles');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'profiles'), '>=', 1, 'profiles has at least one policy');
select has_table('public', 'push_tokens', 'public.push_tokens exists');
select ok((select relrowsecurity from pg_class where oid = 'public.push_tokens'::regclass), 'RLS is on for push_tokens');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'push_tokens'), '>=', 1, 'push_tokens has at least one policy');
select has_table('public', 'rate_limits', 'public.rate_limits exists');
select ok((select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass), 'RLS is on for rate_limits');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'rate_limits'), '>=', 1, 'rate_limits has at least one policy');
select has_table('public', 'referral_program_settings', 'public.referral_program_settings exists');
select ok((select relrowsecurity from pg_class where oid = 'public.referral_program_settings'::regclass), 'RLS is on for referral_program_settings');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'referral_program_settings'), '>=', 1, 'referral_program_settings has at least one policy');
select has_table('public', 'referral_signals', 'public.referral_signals exists');
select ok((select relrowsecurity from pg_class where oid = 'public.referral_signals'::regclass), 'RLS is on for referral_signals');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'referral_signals'), '>=', 1, 'referral_signals has at least one policy');
select has_table('public', 'referrals', 'public.referrals exists');
select ok((select relrowsecurity from pg_class where oid = 'public.referrals'::regclass), 'RLS is on for referrals');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'referrals'), '>=', 1, 'referrals has at least one policy');
select has_table('public', 'refunds', 'public.refunds exists');
select ok((select relrowsecurity from pg_class where oid = 'public.refunds'::regclass), 'RLS is on for refunds');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'refunds'), '>=', 1, 'refunds has at least one policy');
select has_table('public', 'report_cohort_retention', 'public.report_cohort_retention exists');
select ok((select relrowsecurity from pg_class where oid = 'public.report_cohort_retention'::regclass), 'RLS is on for report_cohort_retention');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'report_cohort_retention'), '>=', 1, 'report_cohort_retention has at least one policy');
select has_table('public', 'report_orders_daily', 'public.report_orders_daily exists');
select ok((select relrowsecurity from pg_class where oid = 'public.report_orders_daily'::regclass), 'RLS is on for report_orders_daily');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'report_orders_daily'), '>=', 1, 'report_orders_daily has at least one policy');
select has_table('public', 'report_revenue_daily', 'public.report_revenue_daily exists');
select ok((select relrowsecurity from pg_class where oid = 'public.report_revenue_daily'::regclass), 'RLS is on for report_revenue_daily');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'report_revenue_daily'), '>=', 1, 'report_revenue_daily has at least one policy');
select has_table('public', 'report_top_products', 'public.report_top_products exists');
select ok((select relrowsecurity from pg_class where oid = 'public.report_top_products'::regclass), 'RLS is on for report_top_products');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'report_top_products'), '>=', 1, 'report_top_products has at least one policy');
select has_table('public', 'reviews', 'public.reviews exists');
select ok((select relrowsecurity from pg_class where oid = 'public.reviews'::regclass), 'RLS is on for reviews');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'reviews'), '>=', 1, 'reviews has at least one policy');
select has_table('public', 'search_events', 'public.search_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.search_events'::regclass), 'RLS is on for search_events');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'search_events'), '>=', 1, 'search_events has at least one policy');
select has_table('public', 'search_index_dlq', 'public.search_index_dlq exists');
select ok((select relrowsecurity from pg_class where oid = 'public.search_index_dlq'::regclass), 'RLS is on for search_index_dlq');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'search_index_dlq'), '>=', 1, 'search_index_dlq has at least one policy');
select has_table('public', 'search_index_outbox', 'public.search_index_outbox exists');
select ok((select relrowsecurity from pg_class where oid = 'public.search_index_outbox'::regclass), 'RLS is on for search_index_outbox');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'search_index_outbox'), '>=', 1, 'search_index_outbox has at least one policy');
select has_table('public', 'seo_redirects', 'public.seo_redirects exists');
select ok((select relrowsecurity from pg_class where oid = 'public.seo_redirects'::regclass), 'RLS is on for seo_redirects');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'seo_redirects'), '>=', 1, 'seo_redirects has at least one policy');
select has_table('public', 'settlement_events', 'public.settlement_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.settlement_events'::regclass), 'RLS is on for settlement_events');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'settlement_events'), '>=', 1, 'settlement_events has at least one policy');
select has_table('public', 'split_executions', 'public.split_executions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.split_executions'::regclass), 'RLS is on for split_executions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'split_executions'), '>=', 1, 'split_executions has at least one policy');
select has_table('public', 'stock_reservations', 'public.stock_reservations exists');
select ok((select relrowsecurity from pg_class where oid = 'public.stock_reservations'::regclass), 'RLS is on for stock_reservations');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'stock_reservations'), '>=', 1, 'stock_reservations has at least one policy');
select has_table('public', 'subscription_charges', 'public.subscription_charges exists');
select ok((select relrowsecurity from pg_class where oid = 'public.subscription_charges'::regclass), 'RLS is on for subscription_charges');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'subscription_charges'), '>=', 1, 'subscription_charges has at least one policy');
select has_table('public', 'subscriptions', 'public.subscriptions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass), 'RLS is on for subscriptions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'subscriptions'), '>=', 1, 'subscriptions has at least one policy');
select has_table('public', 'supplier_branches', 'public.supplier_branches exists');
select ok((select relrowsecurity from pg_class where oid = 'public.supplier_branches'::regclass), 'RLS is on for supplier_branches');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'supplier_branches'), '>=', 1, 'supplier_branches has at least one policy');
select has_table('public', 'supplier_leads', 'public.supplier_leads exists');
select ok((select relrowsecurity from pg_class where oid = 'public.supplier_leads'::regclass), 'RLS is on for supplier_leads');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'supplier_leads'), '>=', 1, 'supplier_leads has at least one policy');
select has_table('public', 'supplier_members', 'public.supplier_members exists');
select ok((select relrowsecurity from pg_class where oid = 'public.supplier_members'::regclass), 'RLS is on for supplier_members');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'supplier_members'), '>=', 1, 'supplier_members has at least one policy');
select has_table('public', 'supplier_staff', 'public.supplier_staff exists');
select ok((select relrowsecurity from pg_class where oid = 'public.supplier_staff'::regclass), 'RLS is on for supplier_staff');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'supplier_staff'), '>=', 1, 'supplier_staff has at least one policy');
select has_table('public', 'suppliers', 'public.suppliers exists');
select ok((select relrowsecurity from pg_class where oid = 'public.suppliers'::regclass), 'RLS is on for suppliers');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'suppliers'), '>=', 1, 'suppliers has at least one policy');
select has_table('public', 'user_addresses', 'public.user_addresses exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_addresses'::regclass), 'RLS is on for user_addresses');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'user_addresses'), '>=', 1, 'user_addresses has at least one policy');
select has_table('public', 'user_rate_limits', 'public.user_rate_limits exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_rate_limits'::regclass), 'RLS is on for user_rate_limits');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'user_rate_limits'), '>=', 1, 'user_rate_limits has at least one policy');
select has_table('public', 'user_recent_searches', 'public.user_recent_searches exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_recent_searches'::regclass), 'RLS is on for user_recent_searches');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'user_recent_searches'), '>=', 1, 'user_recent_searches has at least one policy');
select has_table('public', 'vendors', 'public.vendors exists');
select ok((select relrowsecurity from pg_class where oid = 'public.vendors'::regclass), 'RLS is on for vendors');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'vendors'), '>=', 1, 'vendors has at least one policy');
select has_table('public', 'voucher_redemptions', 'public.voucher_redemptions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.voucher_redemptions'::regclass), 'RLS is on for voucher_redemptions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'voucher_redemptions'), '>=', 1, 'voucher_redemptions has at least one policy');
select has_table('public', 'vouchers', 'public.vouchers exists');
select ok((select relrowsecurity from pg_class where oid = 'public.vouchers'::regclass), 'RLS is on for vouchers');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'vouchers'), '>=', 1, 'vouchers has at least one policy');
select has_table('public', 'wallet_accounts', 'public.wallet_accounts exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_accounts'::regclass), 'RLS is on for wallet_accounts');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'wallet_accounts'), '>=', 1, 'wallet_accounts has at least one policy');
select has_table('public', 'wallet_balances', 'public.wallet_balances exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_balances'::regclass), 'RLS is on for wallet_balances');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'wallet_balances'), '>=', 1, 'wallet_balances has at least one policy');
select has_table('public', 'wallet_entries', 'public.wallet_entries exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_entries'::regclass), 'RLS is on for wallet_entries');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'wallet_entries'), '>=', 1, 'wallet_entries has at least one policy');
select has_table('public', 'wallet_transactions', 'public.wallet_transactions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_transactions'::regclass), 'RLS is on for wallet_transactions');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'wallet_transactions'), '>=', 1, 'wallet_transactions has at least one policy');
select has_table('public', 'wishlists', 'public.wishlists exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wishlists'::regclass), 'RLS is on for wishlists');
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'wishlists'), '>=', 1, 'wishlists has at least one policy');

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[],
  'no public table has RLS switched off'
);
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname <> all (array[
  'abandoned_cart_nudges',
  'affiliates',
  'ai_usage',
  'analytics_events',
  'audit_log',
  'banners',
  'carts',
  'cashback_rules',
  'categories',
  'coupon_codes',
  'coupon_deals',
  'coupons',
  'discount_campaigns',
  'discount_redemptions',
  'email_suppressions',
  'escrow_holds',
  'homepage_sections',
  'invoices',
  'legacy_percent_archive_112',
  'media_assets',
  'newsletter_subscribers',
  'notification_outbox',
  'order_items',
  'orders',
  'payment_events',
  'payment_tokens',
  'payment_webhook_events',
  'payments',
  'payout_statement_lines',
  'payout_statements',
  'popular_searches',
  'product_images',
  'product_variants',
  'products',
  'profiles',
  'push_tokens',
  'rate_limits',
  'referral_program_settings',
  'referral_signals',
  'referrals',
  'refunds',
  'report_cohort_retention',
  'report_orders_daily',
  'report_revenue_daily',
  'report_top_products',
  'reviews',
  'search_events',
  'search_index_dlq',
  'search_index_outbox',
  'seo_redirects',
  'settlement_events',
  'split_executions',
  'stock_reservations',
  'subscription_charges',
  'subscriptions',
  'supplier_branches',
  'supplier_leads',
  'supplier_members',
  'supplier_staff',
  'suppliers',
  'user_addresses',
  'user_rate_limits',
  'user_recent_searches',
  'vendors',
  'voucher_redemptions',
  'vouchers',
  'wallet_accounts',
  'wallet_balances',
  'wallet_entries',
  'wallet_transactions',
  'wishlists'
      ])),
  '{}'::text[],
  'every public table is covered by this file (add new tables to rls-manifest.json)'
);

select * from finish();
rollback;
