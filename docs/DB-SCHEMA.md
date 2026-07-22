# Database schema: `public`

Generated from live Supabase project `ixvwfbuvfxxsjiywhbbb` on 2026-07-23 by read-only introspection of information_schema and pg_catalog.

Tables documented: 28. All tables in schema public have row level security (RLS) enabled.

Regenerate this document with: `node scripts/db-doc.mjs` (requires the SUPABASE_DB_URL environment variable, see .env.example). The script is read-only (SELECT statements only).

Note: values shown below (defaults, index predicates, policy expressions) are DDL from the catalog. No table row data is included.

## affiliates

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| affiliate_code | text | YES |  |
| status | affiliate_status | NO | 'pending_review'::affiliate_status |
| payout_method | text | YES |  |
| payout_details | jsonb | NO | '{}'::jsonb |
| channel_description | text | YES |  |
| channel_urls | jsonb | NO | '[]'::jsonb |
| approved_at | timestamp with time zone | YES |  |
| approved_by | uuid | YES |  |
| total_clicks | integer | NO | 0 |
| total_conversions | integer | NO | 0 |
| total_earnings_ils | numeric | NO | 0 |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `affiliates_affiliate_code_key`: btree (affiliate_code)
- `affiliates_pkey`: btree (id)
- `affiliates_user_id_key`: btree (user_id)
- `idx_affiliates_code`: btree (affiliate_code)
- `idx_affiliates_status`: btree (status)
- `idx_affiliates_user_id`: btree (user_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| affiliates_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| affiliates_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| affiliates_user_select | SELECT | authenticated | PERMISSIVE | ((user_id = auth.uid()) AND (deleted_at IS NULL)) | - |
| affiliates_user_update | UPDATE | authenticated | PERMISSIVE | (user_id = auth.uid()) | (user_id = auth.uid()) |

## audit_log

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| actor_id | uuid | YES |  |
| actor_role | text | YES |  |
| action | audit_action | YES |  |
| entity_type | text | YES |  |
| entity_id | uuid | YES |  |
| changes | jsonb | NO | '{}'::jsonb |
| metadata | jsonb | NO | '{}'::jsonb |
| ip_address | inet | YES |  |
| user_agent | text | YES |  |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `audit_log_pkey`: btree (id)
- `idx_audit_log_action`: btree (action, created_at DESC)
- `idx_audit_log_actor`: btree (actor_id, created_at DESC)
- `idx_audit_log_created_at`: btree (created_at DESC)
- `idx_audit_log_entity`: btree (entity_type, entity_id, created_at DESC)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| audit_log_admin_select | SELECT | authenticated | PERMISSIVE | is_admin() | - |
| audit_log_no_delete | DELETE | authenticated | PERMISSIVE | false | - |
| audit_log_no_insert | INSERT | authenticated | PERMISSIVE | - | false |
| audit_log_no_update | UPDATE | authenticated | PERMISSIVE | false | - |

## carts

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| profile_id | uuid | YES |  |
| session_id | text | YES |  |
| items | jsonb | NO | '[]'::jsonb |
| expires_at | timestamp with time zone | NO | (now() + '30 days'::interval) |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- profile_id references profiles.id (on delete CASCADE)

### Indexes

- `carts_expires_at_idx`: btree (expires_at)
- `carts_pkey`: btree (id)
- `carts_profile_id_idx`: btree (profile_id)
- `carts_session_id_idx`: btree (session_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| carts: owner all | ALL | public | PERMISSIVE | ((profile_id = auth.uid()) OR (session_id = ((current_setting('request.cookies'::text, true))::json ->> 'session_id'::text)) OR is_admin()) | ((profile_id = auth.uid()) OR (profile_id IS NULL) OR is_admin()) |

## categories

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| parent_id | uuid | YES |  |
| slug | text | YES |  |
| name_he | text | YES |  |
| description_he | text | YES |  |
| image_url | text | YES |  |
| sort_order | integer | NO | 0 |
| is_active | boolean | NO | true |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| icon_url | text | YES |  |
| name_en | text | NO | ''::text |

### Primary key

- id

### Foreign keys

- parent_id references categories.id (on delete CASCADE)

### Indexes

- `categories_created_by_idx`: btree (created_by)
- `categories_pkey`: btree (id)
- `categories_slug_key`: btree (slug)
- `idx_categories_parent`: btree (parent_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| categories: content_uploader select own | SELECT | authenticated | PERMISSIVE | ((current_user_role() = 'content_uploader'::user_role) AND (created_by = auth.uid())) | - |
| categories_admin_write | ALL | public | PERMISSIVE | is_admin() | is_admin() |
| categories_public_read | SELECT | public | PERMISSIVE | (is_active = true) | - |

## coupon_codes

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| code | text | YES |  |
| product_id | uuid | YES |  |
| order_item_id | uuid | YES |  |
| user_id | uuid | YES |  |
| supplier_id | uuid | YES |  |
| status | coupon_status | NO | 'issued'::coupon_status |
| expires_at | timestamp with time zone | YES |  |
| qr_token | text | YES |  |
| platform_percent | numeric | YES |  |
| face_value_ils | numeric | NO | 0 |
| platform_paid_ils | numeric | NO | 0 |
| collect_amount_ils | numeric | NO | 0 |
| redeemed_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- order_item_id references order_items.id (on delete RESTRICT)
- product_id references products.id (on delete SET NULL)
- supplier_id references suppliers.id (on delete RESTRICT)
- user_id references profiles.id (on delete RESTRICT)

### Indexes

- `coupon_codes_code_key`: btree (code)
- `coupon_codes_pkey`: btree (id)
- `idx_coupon_codes_order_item`: btree (order_item_id)
- `idx_coupon_codes_supplier_status`: btree (supplier_id, status)
- `idx_coupon_codes_user`: btree (user_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| coupon_codes_owner_read | SELECT | public | PERMISSIVE | ((user_id = auth.uid()) OR is_admin()) | - |
| coupon_codes_support_select | SELECT | authenticated | PERMISSIVE | is_support() | - |

## coupon_deals

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| vendor_id | uuid | YES |  |
| title_he | text | YES |  |
| business_name | text | YES |  |
| original_price | numeric | YES |  |
| platform_price | numeric | YES |  |
| discount_percentage | numeric | YES |  |
| terms_he | text | YES |  |
| valid_from | timestamp with time zone | NO | now() |
| valid_until | timestamp with time zone | YES |  |
| max_uses | integer | YES |  |
| max_uses_per_user | integer | NO | 1 |
| location_he | text | YES |  |
| lat | double precision | YES |  |
| lng | double precision | YES |  |
| image_url | text | YES |  |
| status | text | NO | 'draft'::text |
| created_by | uuid | YES |  |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- vendor_id references vendors.id (on delete SET NULL)

### Indexes

- `coupon_deals_deleted_at_idx`: btree (deleted_at) WHERE (deleted_at IS NULL)
- `coupon_deals_pkey`: btree (id)
- `coupon_deals_status_idx`: btree (status)
- `coupon_deals_valid_idx`: btree (valid_from, valid_until)
- `coupon_deals_vendor_id_idx`: btree (vendor_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| coupon_deals: admin delete | DELETE | authenticated | PERMISSIVE | is_admin() | - |
| coupon_deals: admin insert | INSERT | authenticated | PERMISSIVE | - | is_admin() |
| coupon_deals: admin read all | SELECT | authenticated | PERMISSIVE | is_admin() | - |
| coupon_deals: admin update | UPDATE | authenticated | PERMISSIVE | is_admin() | is_admin() |
| coupon_deals: public read active | SELECT | public | PERMISSIVE | ((status = 'active'::text) AND (deleted_at IS NULL)) | - |

## coupons

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | uuid_generate_v4() |
| vendor_id | uuid | YES |  |
| product_id | uuid | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| description | text | YES |  |
| discount_type | text | YES |  |
| discount_value | numeric | YES |  |
| original_price | numeric | YES |  |
| min_purchase | numeric | YES | 0 |
| max_uses | integer | YES |  |
| used_count | integer | YES | 0 |
| expires_at | timestamp with time zone | YES |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES |  |

### Primary key

- id

### Foreign keys

- vendor_id references vendors.id (on delete CASCADE)

### Indexes

- `coupons_code_key`: btree (code)
- `coupons_created_by_idx`: btree (created_by)
- `coupons_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| Public can view coupons | SELECT | public | PERMISSIVE | (is_active = true) | - |

## escrow_holds

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| coupon_code_id | uuid | YES |  |
| order_id | uuid | YES |  |
| order_item_id | uuid | YES |  |
| supplier_id | uuid | YES |  |
| held_agorot | integer | YES |  |
| commission_agorot | integer | YES |  |
| release_agorot | integer | YES |  |
| status | escrow_status | NO | 'held'::escrow_status |
| held_at | timestamp with time zone | NO | now() |
| released_at | timestamp with time zone | YES |  |
| refunded_at | timestamp with time zone | YES |  |
| release_idempotency_key | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- coupon_code_id references coupon_codes.id (on delete RESTRICT)
- order_id references orders.id (on delete RESTRICT)
- order_item_id references order_items.id (on delete RESTRICT)
- supplier_id references suppliers.id (on delete RESTRICT)

### Indexes

- `escrow_holds_coupon_code_id_key`: btree (coupon_code_id)
- `escrow_holds_pkey`: btree (id)
- `escrow_holds_release_idempotency_key_key`: btree (release_idempotency_key)
- `idx_escrow_holds_order`: btree (order_id)
- `idx_escrow_holds_supplier`: btree (supplier_id, status)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| escrow_holds_admin_read | SELECT | public | PERMISSIVE | is_admin() | - |
| escrow_holds_owner_read | SELECT | public | PERMISSIVE | (order_id IN ( SELECT o.id FROM orders o WHERE (o.user_id = auth.uid()))) | - |
| escrow_holds_supplier_read | SELECT | public | PERMISSIVE | is_supplier_member(supplier_id) | - |

## order_items

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid | YES |  |
| product_id | uuid | YES |  |
| variant_id | uuid | YES |  |
| product_type | product_type | YES |  |
| supplier_id | uuid | YES |  |
| quantity | integer | NO | 1 |
| unit_price_ils | numeric | YES |  |
| total_price_ils | numeric | YES |  |
| commission_percent | numeric | YES |  |
| supplier_payout_ils | numeric | YES |  |
| cashback_earned_ils | numeric | NO | 0 |
| item_status | order_item_status | NO | 'pending'::order_item_status |
| fulfilled_at | timestamp with time zone | YES |  |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| platform_percent | numeric | YES |  |
| cashback_percent | numeric | YES |  |
| settlement_status | settlement_status | NO | 'pending'::settlement_status |
| upfront_percent | numeric | YES |  |
| commission_percent_snapshot | numeric | YES |  |
| face_value_agorot | integer | YES |  |
| paid_on_site_agorot | integer | YES |  |
| commission_agorot | integer | YES |  |
| supplier_immediate_agorot | integer | YES |  |
| escrow_held_agorot | integer | YES |  |
| escrow_release_agorot | integer | YES |  |
| balance_due_agorot | integer | YES |  |
| cashback_amount_agorot | integer | YES |  |

### Primary key

- id

### Foreign keys

- order_id references orders.id (on delete CASCADE)
- product_id references products.id (on delete SET NULL)
- supplier_id references suppliers.id (on delete RESTRICT)
- variant_id references product_variants.id (on delete SET NULL)

### Indexes

- `idx_order_items_order_id`: btree (order_id)
- `idx_order_items_product_id`: btree (product_id)
- `idx_order_items_settlement_status`: btree (settlement_status)
- `idx_order_items_supplier_id`: btree (supplier_id)
- `order_items_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| order_items_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| order_items_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| order_items_user_read | SELECT | authenticated | PERMISSIVE | (order_id IN ( SELECT orders.id FROM orders WHERE (orders.user_id = auth.uid()))) | - |

## orders

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| status | order_status | NO | 'pending'::order_status |
| subtotal_ils | numeric | YES |  |
| discount_ils | numeric | NO | 0 |
| cashback_applied_ils | numeric | NO | 0 |
| total_ils | numeric | YES |  |
| currency | text | NO | 'ILS'::text |
| cardcom_payment_id | text | YES |  |
| invoice_number | text | YES |  |
| address_id | uuid | YES |  |
| affiliate_code | text | YES |  |
| referral_code_used | text | YES |  |
| accepted_terms_at | timestamp with time zone | YES |  |
| notes | text | YES |  |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| paid_at | timestamp with time zone | YES |  |
| expires_at | timestamp with time zone | YES |  |

### Primary key

- id

### Foreign keys

- address_id references user_addresses.id (on delete SET NULL)

### Indexes

- `idx_orders_created_at`: btree (created_at DESC)
- `idx_orders_invoice_number`: btree (invoice_number)
- `idx_orders_pending_expiry`: btree (expires_at) WHERE (paid_at IS NULL)
- `idx_orders_user_status`: btree (user_id, status)
- `orders_invoice_number_key`: btree (invoice_number)
- `orders_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| orders_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| orders_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| orders_user_read | SELECT | authenticated | PERMISSIVE | (user_id = auth.uid()) | - |

## payment_tokens

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| profile_id | uuid | YES |  |
| cardcom_token | text | YES |  |
| last_4 | text | YES |  |
| card_brand | text | YES |  |
| expiry_month | integer | YES |  |
| expiry_year | integer | YES |  |
| is_default | boolean | NO | false |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- profile_id references profiles.id (on delete CASCADE)

### Indexes

- `idx_payment_tokens_profile`: btree (profile_id)
- `payment_tokens_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| payment_tokens_owner_read | SELECT | public | PERMISSIVE | (profile_id = auth.uid()) | - |

## payment_webhook_events

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| provider | text | YES |  |
| external_event_id | text | YES |  |
| signature_valid | boolean | NO | false |
| verified_against_api | boolean | NO | false |
| payload | jsonb | YES |  |
| payment_id | uuid | YES |  |
| processed_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- payment_id references payments.id (on delete SET NULL)

### Indexes

- `payment_webhook_events_dedup`: btree (provider, external_event_id)
- `payment_webhook_events_pkey`: btree (id)

### RLS policies

- (none)

## payments

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid | YES |  |
| kind | payment_kind | NO | 'charge'::payment_kind |
| status | payment_status | NO | 'initiated'::payment_status |
| amount_ils | numeric | YES |  |
| currency | text | NO | 'ILS'::text |
| wallet_applied_ils | numeric | NO | 0 |
| idempotency_key | text | YES |  |
| cardcom_low_profile_id | text | YES |  |
| cardcom_transaction_id | text | YES |  |
| raw_response | jsonb | YES |  |
| failure_code | text | YES |  |
| failure_message | text | YES |  |
| succeeded_at | timestamp with time zone | YES |  |
| failed_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- order_id references orders.id (on delete RESTRICT)

### Indexes

- `idx_payments_low_profile`: btree (cardcom_low_profile_id)
- `idx_payments_order`: btree (order_id)
- `payments_idempotency_key_key`: btree (idempotency_key)
- `payments_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| payments_owner_read | SELECT | public | PERMISSIVE | ((order_id IN ( SELECT o.id FROM orders o WHERE (o.user_id = auth.uid()))) OR is_admin()) | - |

## product_images

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid | YES |  |
| variant_id | uuid | YES |  |
| url | text | YES |  |
| alt_he | text | YES |  |
| sort_order | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `idx_images_product`: btree (product_id, sort_order)
- `product_images_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| images_admin_write | ALL | public | PERMISSIVE | is_admin() | is_admin() |
| images_public_read | SELECT | public | PERMISSIVE | (product_id IN ( SELECT products.id FROM products WHERE (products.status = 'active'::product_status))) | - |

## product_variants

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid | YES |  |
| sku | text | YES |  |
| name_he | text | YES |  |
| price_ils | numeric | YES |  |
| stock_quantity | integer | YES |  |
| attributes | jsonb | NO | '{}'::jsonb |
| sort_order | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| price | numeric | YES |  |
| is_active | boolean | NO | true |
| deleted_at | timestamp with time zone | YES |  |
| price_modifier | numeric | NO | 0 |

### Primary key

- id

### Foreign keys

- product_id references products.id (on delete CASCADE)

### Indexes

- `idx_variants_product`: btree (product_id)
- `product_variants_pkey`: btree (id)
- `product_variants_sku_key`: btree (sku)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| variants: admin all | ALL | authenticated | PERMISSIVE | has_role('content_uploader'::text) | has_role('content_uploader'::text) |
| variants: public read | SELECT | public | PERMISSIVE | ((is_active = true) AND (deleted_at IS NULL)) | - |
| variants_admin_write | ALL | public | PERMISSIVE | is_admin() | is_admin() |
| variants_public_read | SELECT | public | PERMISSIVE | (product_id IN ( SELECT products.id FROM products WHERE (products.status = 'active'::product_status))) | - |

## products

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| supplier_id | uuid | YES |  |
| category_id | uuid | YES |  |
| type | product_type | YES |  |
| status | product_status | NO | 'draft'::product_status |
| slug | text | YES |  |
| name_he | text | YES |  |
| description_he | text | YES |  |
| price_ils | numeric | YES |  |
| compare_at_price_ils | numeric | YES |  |
| cost_ils | numeric | YES |  |
| stock_quantity | integer | YES |  |
| attributes | jsonb | NO | '{}'::jsonb |
| published_at | timestamp with time zone | YES |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| name_en | text | YES |  |
| compare_at_price | numeric | YES |  |
| sku | text | YES |  |
| is_featured | boolean | NO | false |
| deleted_at | timestamp with time zone | YES |  |
| kenyon_price | numeric | YES |  |
| full_price | numeric | YES |  |
| is_coupon_enabled | boolean | NO | false |
| images | jsonb | NO | '[]'::jsonb |
| cashback_percent | numeric | NO | 0 |
| coupon_expiry_days | integer | YES |  |
| platform_percent | numeric | YES |  |
| commission_percent | numeric | NO | 5 |
| approval_status | product_approval_status | NO | 'approved'::product_approval_status |
| approval_note | text | YES |  |
| submitted_at | timestamp with time zone | YES |  |
| approved_by | uuid | YES |  |
| approved_at | timestamp with time zone | YES |  |

### Primary key

- id

### Foreign keys

- category_id references categories.id (on delete SET NULL)
- supplier_id references suppliers.id (on delete RESTRICT)

### Indexes

- `idx_products_approval_pending`: btree (submitted_at) WHERE (approval_status = 'pending'::product_approval_status)
- `idx_products_category`: btree (category_id)
- `idx_products_published`: btree (published_at DESC) WHERE (status = 'active'::product_status)
- `idx_products_status_type`: btree (status, type)
- `idx_products_supplier`: btree (supplier_id)
- `products_category_id_idx`: btree (category_id)
- `products_created_by_idx`: btree (created_by)
- `products_deleted_at_idx`: btree (deleted_at) WHERE (deleted_at IS NULL)
- `products_is_featured_idx`: btree (is_featured) WHERE (is_featured = true)
- `products_pkey`: btree (id)
- `products_slug_key`: btree (slug)
- `products_status_idx`: btree (status)
- `products_supplier_id_idx`: btree (supplier_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| products: admin delete | DELETE | authenticated | PERMISSIVE | is_admin() | - |
| products: admin insert | INSERT | authenticated | PERMISSIVE | - | has_role('content_uploader'::text) |
| products: admin read | SELECT | authenticated | PERMISSIVE | is_admin() | - |
| products: admin update | UPDATE | authenticated | PERMISSIVE | has_role('content_uploader'::text) | has_role('content_uploader'::text) |
| products: content_uploader insert | INSERT | authenticated | PERMISSIVE | - | ((current_user_role() = 'content_uploader'::user_role) AND (created_by = auth.uid())) |
| products: content_uploader select own | SELECT | authenticated | PERMISSIVE | ((current_user_role() = 'content_uploader'::user_role) AND (created_by = auth.uid())) | - |
| products: content_uploader update | UPDATE | authenticated | PERMISSIVE | ((current_user_role() = 'content_uploader'::user_role) AND (created_by = auth.uid())) | ((current_user_role() = 'content_uploader'::user_role) AND (created_by = auth.uid())) |
| products: public read | SELECT | public | PERMISSIVE | ((status = 'active'::product_status) AND (deleted_at IS NULL)) | - |
| products: vendor read own | SELECT | authenticated | PERMISSIVE | (supplier_id IN ( SELECT vendors.id FROM vendors WHERE (vendors.profile_id = auth.uid()))) | - |
| products_admin_write | ALL | public | PERMISSIVE | is_admin() | is_admin() |
| products_public_read | SELECT | public | PERMISSIVE | (status = 'active'::product_status) | - |

## profiles

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | YES |  |
| email | text | YES |  |
| full_name | text | YES |  |
| phone | text | YES |  |
| avatar_url | text | YES |  |
| wallet_balance | numeric | YES | 0 |
| total_purchases | integer | YES | 0 |
| role | user_role | YES | 'customer'::user_role |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| affiliate_code | text | YES |  |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `idx_profiles_affiliate_code`: btree (affiliate_code) WHERE (affiliate_code IS NOT NULL)
- `profiles_email_key`: btree (email)
- `profiles_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| Users can update own profile | UPDATE | public | PERMISSIVE | (auth.uid() = id) | - |
| Users can view own profile | SELECT | public | PERMISSIVE | (auth.uid() = id) | - |
| profiles: owner update | UPDATE | authenticated | PERMISSIVE | (id = auth.uid()) | ((id = auth.uid()) AND (role = ( SELECT profiles_1.role FROM profiles profiles_1 WHERE (profiles_1.id = auth.uid())))) |
| profiles_support_select | SELECT | authenticated | PERMISSIVE | is_support() | - |

## rate_limits

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| key | text | YES |  |
| attempts | integer | NO | 1 |
| window_start | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `rate_limits_key_idx`: btree (key)
- `rate_limits_key_key`: btree (key)
- `rate_limits_pkey`: btree (id)
- `rate_limits_window_idx`: btree (window_start)

### RLS policies

- (none)

## referrals

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| referrer_user_id | uuid | YES |  |
| referred_user_id | uuid | YES |  |
| referral_code | text | YES |  |
| status | referral_status | NO | 'pending'::referral_status |
| completed_at | timestamp with time zone | YES |  |
| bonus_paid_amount_ils | numeric | NO | 0 |
| referred_first_order_id | uuid | YES |  |
| rejection_reason | text | YES |  |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- referred_first_order_id references orders.id (on delete SET NULL)

### Indexes

- `idx_referrals_code`: btree (referral_code)
- `idx_referrals_referred_user`: btree (referred_user_id)
- `idx_referrals_referrer_status`: btree (referrer_user_id, status)
- `referrals_pkey`: btree (id)
- `referrals_unique_pair`: btree (referrer_user_id, referred_user_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| referrals_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| referrals_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| referrals_user_read | SELECT | authenticated | PERMISSIVE | (((referrer_user_id = auth.uid()) OR (referred_user_id = auth.uid())) AND (deleted_at IS NULL)) | - |

## split_executions

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| order_item_id | uuid | YES |  |
| order_id | uuid | YES |  |
| supplier_id | uuid | YES |  |
| face_value_agorot | integer | YES |  |
| commission_agorot | integer | YES |  |
| supplier_agorot | integer | YES |  |
| executed_at | timestamp with time zone | NO | now() |
| payment_id | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- order_id references orders.id (on delete RESTRICT)
- order_item_id references order_items.id (on delete RESTRICT)
- payment_id references payments.id (on delete SET NULL)
- supplier_id references suppliers.id (on delete RESTRICT)

### Indexes

- `idx_split_executions_order`: btree (order_id)
- `idx_split_executions_supplier`: btree (supplier_id)
- `split_executions_order_item_id_key`: btree (order_item_id)
- `split_executions_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| split_executions_admin_read | SELECT | public | PERMISSIVE | is_admin() | - |
| split_executions_owner_read | SELECT | public | PERMISSIVE | (order_id IN ( SELECT o.id FROM orders o WHERE (o.user_id = auth.uid()))) | - |
| split_executions_supplier_read | SELECT | public | PERMISSIVE | is_supplier_member(supplier_id) | - |

## suppliers

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| name | text | YES |  |
| contact_email | text | YES |  |
| contact_phone | text | YES |  |
| commission_percent | numeric | NO | 0 |
| notes | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `suppliers_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| suppliers_admin_all | ALL | public | PERMISSIVE | is_admin() | is_admin() |

## user_addresses

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| full_name | text | YES |  |
| phone | text | YES |  |
| street | text | YES |  |
| street_number | text | YES |  |
| apartment | text | YES |  |
| entrance | text | YES |  |
| floor | text | YES |  |
| city | text | YES |  |
| zip | text | YES |  |
| notes_for_courier | text | YES |  |
| is_default | boolean | NO | false |
| deleted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `idx_user_addresses_user_active`: btree (user_id) WHERE (deleted_at IS NULL)
- `idx_user_addresses_user_default`: btree (user_id, is_default)
- `uniq_default_address_per_user`: btree (user_id) WHERE ((is_default = true) AND (deleted_at IS NULL))
- `user_addresses_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| addresses_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| addresses_user_delete | DELETE | authenticated | PERMISSIVE | (user_id = auth.uid()) | - |
| addresses_user_insert | INSERT | authenticated | PERMISSIVE | - | (user_id = auth.uid()) |
| addresses_user_select | SELECT | authenticated | PERMISSIVE | ((user_id = auth.uid()) AND (deleted_at IS NULL)) | - |
| addresses_user_update | UPDATE | authenticated | PERMISSIVE | (user_id = auth.uid()) | (user_id = auth.uid()) |

## user_rate_limits

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| action | text | YES |  |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `user_rate_limits_lookup_idx`: btree (user_id, action, created_at DESC)
- `user_rate_limits_pkey`: btree (id)

### RLS policies

- (none)

## vendors

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | uuid_generate_v4() |
| profile_id | uuid | YES |  |
| business_name | text | YES |  |
| business_logo | text | YES |  |
| description | text | YES |  |
| website | text | YES |  |
| is_verified | boolean | YES | false |
| commission_rate | numeric | YES | 10.00 |
| created_at | timestamp with time zone | YES | now() |
| legal_name | text | YES |  |
| tax_id | text | YES |  |
| contact_name | text | YES |  |
| contact_email | text | YES |  |
| contact_phone | text | YES |  |
| business_id | text | YES |  |
| address | text | YES |  |
| bank_account_holder | text | YES |  |
| bank_name | text | YES |  |
| bank_branch | text | YES |  |
| bank_account | text | YES |  |
| logo_url | text | YES |  |
| status | text | NO | 'pending'::text |
| deleted_at | timestamp with time zone | YES |  |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- profile_id references profiles.id (on delete CASCADE)

### Indexes

- `vendors_deleted_at_idx`: btree (deleted_at) WHERE (deleted_at IS NULL)
- `vendors_pkey`: btree (id)
- `vendors_status_idx`: btree (status)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| vendors: admin read | SELECT | authenticated | PERMISSIVE | is_admin() | - |
| vendors: owner read | SELECT | authenticated | PERMISSIVE | (profile_id = auth.uid()) | - |
| vendors: super_admin delete | DELETE | authenticated | PERMISSIVE | (current_user_role() = 'super_admin'::user_role) | - |
| vendors: super_admin insert | INSERT | authenticated | PERMISSIVE | - | (current_user_role() = 'super_admin'::user_role) |
| vendors: super_admin update | UPDATE | authenticated | PERMISSIVE | (current_user_role() = 'super_admin'::user_role) | (current_user_role() = 'super_admin'::user_role) |

## wallet_accounts

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| code | text | YES |  |
| balance_ils | numeric | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- user_id references profiles.id (on delete CASCADE)

### Indexes

- `wallet_accounts_code_key`: btree (code)
- `wallet_accounts_pkey`: btree (id)
- `wallet_accounts_user_id_key`: btree (user_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| wallet_accounts_owner_read | SELECT | public | PERMISSIVE | ((user_id = auth.uid()) OR is_admin()) | - |

## wallet_balances

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| balance_ils | numeric | NO | 0 |
| lifetime_earned_ils | numeric | NO | 0 |
| lifetime_redeemed_ils | numeric | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| deleted_at | timestamp with time zone | YES |  |

### Primary key

- id

### Foreign keys

- (none)

### Indexes

- `idx_wallet_balances_user_id`: btree (user_id)
- `wallet_balances_pkey`: btree (id)
- `wallet_balances_user_id_key`: btree (user_id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| wallet_balances_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| wallet_balances_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| wallet_balances_user_read | SELECT | authenticated | PERMISSIVE | ((user_id = auth.uid()) AND (deleted_at IS NULL)) | - |

## wallet_entries

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| debit_account | uuid | YES |  |
| credit_account | uuid | YES |  |
| amount_ils | numeric | YES |  |
| reason | text | YES |  |
| idempotency_key | text | YES |  |
| order_id | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

### Primary key

- id

### Foreign keys

- credit_account references wallet_accounts.id (on delete RESTRICT)
- debit_account references wallet_accounts.id (on delete RESTRICT)
- order_id references orders.id (on delete SET NULL)

### Indexes

- `idx_wallet_entries_credit`: btree (credit_account)
- `idx_wallet_entries_debit`: btree (debit_account)
- `wallet_entries_idempotency_key_key`: btree (idempotency_key)
- `wallet_entries_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| wallet_entries_admin_read | SELECT | public | PERMISSIVE | is_admin() | - |

## wallet_transactions

RLS: enabled.

### Columns

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| wallet_id | uuid | YES |  |
| user_id | uuid | YES |  |
| type | wallet_tx_type | YES |  |
| source | wallet_tx_source | YES |  |
| amount_ils | numeric | YES |  |
| related_order_id | uuid | YES |  |
| cashback_percent | numeric | YES |  |
| profit_share_cap_percent | numeric | YES |  |
| gross_amount_ils | numeric | YES |  |
| notes | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| deleted_at | timestamp with time zone | YES |  |

### Primary key

- id

### Foreign keys

- related_order_id references orders.id (on delete SET NULL)
- wallet_id references wallet_balances.id (on delete CASCADE)

### Indexes

- `idx_wallet_transactions_created_at`: btree (created_at DESC)
- `idx_wallet_transactions_order_id`: btree (related_order_id)
- `idx_wallet_transactions_user_id`: btree (user_id, created_at DESC)
- `idx_wallet_transactions_wallet_id`: btree (wallet_id, created_at DESC)
- `wallet_transactions_pkey`: btree (id)

### RLS policies

| Policy | Command | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| wallet_transactions_admin_all | ALL | authenticated | PERMISSIVE | is_admin() | is_admin() |
| wallet_transactions_support_select | SELECT | authenticated | PERMISSIVE | (is_support() AND (deleted_at IS NULL)) | - |
| wallet_transactions_user_read | SELECT | authenticated | PERMISSIVE | ((user_id = auth.uid()) AND (deleted_at IS NULL)) | - |
