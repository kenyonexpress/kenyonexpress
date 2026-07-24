-- Cold-path extraction: WooCommerce mysqldump -> JSON for stage 1 (--source dump).
--
-- Use this only when the REST API is unavailable (plugin disabled, host blocks
-- it, or the site is already frozen for cutover). The REST path is the default
-- because it returns resolved product JSON instead of the wp_postmeta key soup.
--
-- Why queries and not a dump parser: serialized PHP nested inside escaped SQL
-- string literals is a reliable way to silently corrupt a catalog. Restore the
-- dump into a throwaway MySQL and query it.
--
--   mysql -u root -p ke_wp_restore --json < scripts/wp-import/sql/extract-from-dump.sql
--
-- Each block below is one entity. Run them one at a time and save the output as
-- wp_import/raw/dump/<entity>.json:
--
--   mysql -u root ke_wp_restore -N -B -e "<block>" | ... > wp_import/raw/dump/product.json
--
-- The column aliases match the WooCommerce REST field names on purpose, so the
-- transform stage does not care which source produced the row.
--
-- Table prefix: adjust wp_ below if the install uses a custom prefix.

-- ---------------------------------------------------------------------------
-- category
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',          t.term_id,
         'name',        t.name,
         'slug',        t.slug,
         'parent',      tt.parent,
         'description', tt.description,
         'count',       tt.count,
         'menu_order',  COALESCE(CAST(tm_order.meta_value AS SIGNED), 0),
         'image',       JSON_OBJECT('id', tm_thumb.meta_value)
       )) AS rows_json
FROM wp_terms t
JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id AND tt.taxonomy = 'product_cat'
LEFT JOIN wp_termmeta tm_order ON tm_order.term_id = t.term_id AND tm_order.meta_key = 'order'
LEFT JOIN wp_termmeta tm_thumb ON tm_thumb.term_id = t.term_id AND tm_thumb.meta_key = 'thumbnail_id';

-- ---------------------------------------------------------------------------
-- product (includes product_variation; the transform stage splits them by type)
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',                p.ID,
         'post_type',         p.post_type,
         'parent_id',         p.post_parent,
         'name',              p.post_title,
         'slug',              p.post_name,
         'status',            p.post_status,
         'description',       p.post_content,
         'short_description', p.post_excerpt,
         'date_created_gmt',  p.post_date_gmt,
         'date_modified_gmt', p.post_modified_gmt,
         'sku',               MAX(CASE WHEN pm.meta_key = '_sku'                   THEN pm.meta_value END),
         'regular_price',     MAX(CASE WHEN pm.meta_key = '_regular_price'         THEN pm.meta_value END),
         'sale_price',        MAX(CASE WHEN pm.meta_key = '_sale_price'            THEN pm.meta_value END),
         'price',             MAX(CASE WHEN pm.meta_key = '_price'                 THEN pm.meta_value END),
         'stock_status',      MAX(CASE WHEN pm.meta_key = '_stock_status'          THEN pm.meta_value END),
         'stock_quantity',    MAX(CASE WHEN pm.meta_key = '_stock'                 THEN pm.meta_value END),
         'manage_stock',      MAX(CASE WHEN pm.meta_key = '_manage_stock'          THEN pm.meta_value END),
         'virtual',           MAX(CASE WHEN pm.meta_key = '_virtual'               THEN pm.meta_value END),
         'downloadable',      MAX(CASE WHEN pm.meta_key = '_downloadable'          THEN pm.meta_value END),
         'weight',            MAX(CASE WHEN pm.meta_key = '_weight'                THEN pm.meta_value END),
         'total_sales',       MAX(CASE WHEN pm.meta_key = 'total_sales'            THEN pm.meta_value END),
         'thumbnail_id',      MAX(CASE WHEN pm.meta_key = '_thumbnail_id'          THEN pm.meta_value END),
         'gallery_ids',       MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END),
         'attributes_raw',    MAX(CASE WHEN pm.meta_key = '_product_attributes'    THEN pm.meta_value END),
         'seo_title',         MAX(CASE WHEN pm.meta_key IN ('_yoast_wpseo_title', 'rank_math_title')             THEN pm.meta_value END),
         'seo_description',   MAX(CASE WHEN pm.meta_key IN ('_yoast_wpseo_metadesc', 'rank_math_description')    THEN pm.meta_value END),
         'category_ids',      (SELECT JSON_ARRAYAGG(tt2.term_id)
                                 FROM wp_term_relationships tr2
                                 JOIN wp_term_taxonomy tt2 ON tt2.term_taxonomy_id = tr2.term_taxonomy_id
                                WHERE tr2.object_id = p.ID AND tt2.taxonomy = 'product_cat'),
         'tag_names',         (SELECT JSON_ARRAYAGG(t3.name)
                                 FROM wp_term_relationships tr3
                                 JOIN wp_term_taxonomy tt3 ON tt3.term_taxonomy_id = tr3.term_taxonomy_id
                                 JOIN wp_terms t3          ON t3.term_id = tt3.term_id
                                WHERE tr3.object_id = p.ID AND tt3.taxonomy = 'product_tag'),
         'product_type',      (SELECT t4.name
                                 FROM wp_term_relationships tr4
                                 JOIN wp_term_taxonomy tt4 ON tt4.term_taxonomy_id = tr4.term_taxonomy_id
                                 JOIN wp_terms t4          ON t4.term_id = tt4.term_id
                                WHERE tr4.object_id = p.ID AND tt4.taxonomy = 'product_type' LIMIT 1)
       )) AS rows_json
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID
WHERE p.post_type IN ('product', 'product_variation')
  AND p.post_status NOT IN ('auto-draft', 'inherit')
GROUP BY p.ID;

-- ---------------------------------------------------------------------------
-- media (attachment inventory; source_url has the size suffix stripped later)
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',               p.ID,
         'parent_id',        p.post_parent,
         'src',              p.guid,
         'file',             MAX(CASE WHEN pm.meta_key = '_wp_attached_file' THEN pm.meta_value END),
         'name',             p.post_title,
         'alt',              MAX(CASE WHEN pm.meta_key = '_wp_attachment_image_alt' THEN pm.meta_value END),
         'mime_type',        p.post_mime_type,
         'date_created_gmt', p.post_date_gmt,
         'metadata_raw',     MAX(CASE WHEN pm.meta_key = '_wp_attachment_metadata' THEN pm.meta_value END)
       )) AS rows_json
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID
WHERE p.post_type = 'attachment'
GROUP BY p.ID;

-- ---------------------------------------------------------------------------
-- customer (no password hashes: the new site issues a reset flow, see doc 5.5)
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',                 u.ID,
         'email',              u.user_email,
         'username',           u.user_login,
         'display_name',       u.display_name,
         'date_created_gmt',   u.user_registered,
         'first_name',         MAX(CASE WHEN um.meta_key = 'first_name'          THEN um.meta_value END),
         'last_name',          MAX(CASE WHEN um.meta_key = 'last_name'           THEN um.meta_value END),
         'role',               MAX(CASE WHEN um.meta_key = 'wp_capabilities'     THEN um.meta_value END),
         'is_paying_customer', MAX(CASE WHEN um.meta_key = 'paying_customer'     THEN um.meta_value END),
         'billing',            JSON_OBJECT(
                                 'first_name', MAX(CASE WHEN um.meta_key = 'billing_first_name' THEN um.meta_value END),
                                 'last_name',  MAX(CASE WHEN um.meta_key = 'billing_last_name'  THEN um.meta_value END),
                                 'phone',      MAX(CASE WHEN um.meta_key = 'billing_phone'      THEN um.meta_value END),
                                 'email',      MAX(CASE WHEN um.meta_key = 'billing_email'      THEN um.meta_value END),
                                 'address_1',  MAX(CASE WHEN um.meta_key = 'billing_address_1'  THEN um.meta_value END),
                                 'city',       MAX(CASE WHEN um.meta_key = 'billing_city'       THEN um.meta_value END),
                                 'postcode',   MAX(CASE WHEN um.meta_key = 'billing_postcode'   THEN um.meta_value END)),
         'shipping',           JSON_OBJECT(
                                 'first_name', MAX(CASE WHEN um.meta_key = 'shipping_first_name' THEN um.meta_value END),
                                 'last_name',  MAX(CASE WHEN um.meta_key = 'shipping_last_name'  THEN um.meta_value END),
                                 'address_1',  MAX(CASE WHEN um.meta_key = 'shipping_address_1'  THEN um.meta_value END),
                                 'city',       MAX(CASE WHEN um.meta_key = 'shipping_city'       THEN um.meta_value END),
                                 'postcode',   MAX(CASE WHEN um.meta_key = 'shipping_postcode'   THEN um.meta_value END))
       )) AS rows_json
FROM wp_users u
LEFT JOIN wp_usermeta um ON um.user_id = u.ID
GROUP BY u.ID;
-- NOTE: u.user_pass is deliberately absent from the projection above. Password
-- hashes are never extracted, never staged, never migrated.

-- ---------------------------------------------------------------------------
-- order (legacy post storage; for HPOS installs read wc_orders instead)
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',                 p.ID,
         'status',             p.post_status,
         'date_created_gmt',   p.post_date_gmt,
         'customer_note',      p.post_excerpt,
         'number',             MAX(CASE WHEN pm.meta_key = '_order_number'         THEN pm.meta_value END),
         'customer_id',        MAX(CASE WHEN pm.meta_key = '_customer_user'        THEN pm.meta_value END),
         'currency',           MAX(CASE WHEN pm.meta_key = '_order_currency'       THEN pm.meta_value END),
         'total',              MAX(CASE WHEN pm.meta_key = '_order_total'          THEN pm.meta_value END),
         'total_tax',          MAX(CASE WHEN pm.meta_key = '_order_tax'            THEN pm.meta_value END),
         'shipping_total',     MAX(CASE WHEN pm.meta_key = '_order_shipping'       THEN pm.meta_value END),
         'discount_total',     MAX(CASE WHEN pm.meta_key = '_cart_discount'        THEN pm.meta_value END),
         'payment_method',     MAX(CASE WHEN pm.meta_key = '_payment_method'       THEN pm.meta_value END),
         'payment_method_title', MAX(CASE WHEN pm.meta_key = '_payment_method_title' THEN pm.meta_value END),
         'transaction_id',     MAX(CASE WHEN pm.meta_key = '_transaction_id'       THEN pm.meta_value END),
         'date_paid_gmt',      MAX(CASE WHEN pm.meta_key = '_date_paid'            THEN pm.meta_value END),
         'date_completed_gmt', MAX(CASE WHEN pm.meta_key = '_date_completed'       THEN pm.meta_value END),
         'billing',            JSON_OBJECT(
                                 'email',     MAX(CASE WHEN pm.meta_key = '_billing_email'     THEN pm.meta_value END),
                                 'phone',     MAX(CASE WHEN pm.meta_key = '_billing_phone'     THEN pm.meta_value END),
                                 'first_name',MAX(CASE WHEN pm.meta_key = '_billing_first_name'THEN pm.meta_value END),
                                 'last_name', MAX(CASE WHEN pm.meta_key = '_billing_last_name' THEN pm.meta_value END),
                                 'address_1', MAX(CASE WHEN pm.meta_key = '_billing_address_1' THEN pm.meta_value END),
                                 'city',      MAX(CASE WHEN pm.meta_key = '_billing_city'      THEN pm.meta_value END)),
         'line_items',         (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                         'id',           oi.order_item_id,
                                         'type',         oi.order_item_type,
                                         'name',         oi.order_item_name,
                                         'product_id',   MAX(CASE WHEN oim.meta_key = '_product_id'   THEN oim.meta_value END),
                                         'variation_id', MAX(CASE WHEN oim.meta_key = '_variation_id' THEN oim.meta_value END),
                                         'quantity',     MAX(CASE WHEN oim.meta_key = '_qty'          THEN oim.meta_value END),
                                         'subtotal',     MAX(CASE WHEN oim.meta_key = '_line_subtotal' THEN oim.meta_value END),
                                         'total',        MAX(CASE WHEN oim.meta_key = '_line_total'    THEN oim.meta_value END),
                                         'tax',          MAX(CASE WHEN oim.meta_key = '_line_tax'      THEN oim.meta_value END)))
                                  FROM wp_woocommerce_order_items oi
                                  LEFT JOIN wp_woocommerce_order_itemmeta oim ON oim.order_item_id = oi.order_item_id
                                 WHERE oi.order_id = p.ID
                                 GROUP BY oi.order_item_id)
       )) AS rows_json
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID
WHERE p.post_type = 'shop_order'
GROUP BY p.ID;

-- ---------------------------------------------------------------------------
-- coupon (Woo cart discount codes; archive only)
-- ---------------------------------------------------------------------------
SELECT JSON_ARRAYAGG(JSON_OBJECT(
         'id',            p.ID,
         'code',          p.post_title,
         'status',        p.post_status,
         'discount_type', MAX(CASE WHEN pm.meta_key = 'discount_type' THEN pm.meta_value END),
         'amount',        MAX(CASE WHEN pm.meta_key = 'coupon_amount' THEN pm.meta_value END),
         'usage_limit',   MAX(CASE WHEN pm.meta_key = 'usage_limit'   THEN pm.meta_value END),
         'usage_count',   MAX(CASE WHEN pm.meta_key = 'usage_count'   THEN pm.meta_value END),
         'date_expires',  MAX(CASE WHEN pm.meta_key = 'date_expires'  THEN pm.meta_value END)
       )) AS rows_json
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID
WHERE p.post_type = 'shop_coupon'
GROUP BY p.ID;
