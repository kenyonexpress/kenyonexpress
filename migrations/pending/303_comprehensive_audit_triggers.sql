-- 303_comprehensive_audit_triggers.sql
--
<<<<<<< HEAD
-- C68: Comprehensive audit log coverage for all critical tables
--
-- Adds audit triggers (who/what/before/after/at) to tables that handle:
--   - Financial transactions (orders, refunds, payments)
--   - Inventory (products, categories)
--   - Customer data (vouchers, discount redemptions)
--   - Core business logic (invoices, settlements)
--
-- The audit_log_trigger_fn() (defined in 025) already captures:
--   - who: actor_id (auth.uid)
=======
-- C68: Comprehensive audit log coverage for verified existing tables
--
-- Adds audit triggers (who/what/before/after/at) to tables that handle:
--   - Financial transactions (orders, payments, settlements)
--   - Inventory (products, categories)
--   - Customer data (vouchers, profiles)
--   - Core business logic (invoices)
--
-- The audit_log_trigger_fn() (defined in 025) already captures:
--   - who: actor_id (auth.uid) + actor_role
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
--   - what: action (created/updated/deleted), entity_type, entity_id
--   - before/after: changes jsonb with old/new snapshots
--   - at: created_at timestamp
--
-- Depends on: 011 (audit_log table), 025 (audit_log_trigger_fn)
<<<<<<< HEAD
=======
-- Tables verified to exist via supabase/migrations/
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)

-- ---------------------------------------------------------------------------
-- 1. Orders & Order Items (critical financial records)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_orders ON public.orders;
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_order_items ON public.order_items;
CREATE TRIGGER audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 2. Vouchers & Redemptions (escrow funds)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_vouchers ON public.vouchers;
CREATE TRIGGER audit_vouchers
  AFTER INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_voucher_redemptions ON public.voucher_redemptions;
CREATE TRIGGER audit_voucher_redemptions
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_redemptions
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 3. Refunds (financial reversals)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_refunds ON public.refunds;
CREATE TRIGGER audit_refunds
  AFTER INSERT OR UPDATE OR DELETE ON public.refunds
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 4. Categories (catalog structure changes)
=======
-- 3. Categories (catalog structure changes)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_categories ON public.categories;
CREATE TRIGGER audit_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 5. Discount Campaigns & Redemptions (promotional activity)
=======
-- 4. Discount Campaigns & Redemptions (promotional activity)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_discount_campaigns ON public.discount_campaigns;
CREATE TRIGGER audit_discount_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_campaigns
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_discount_redemptions ON public.discount_redemptions;
CREATE TRIGGER audit_discount_redemptions
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_redemptions
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 6. Invoices (legal/financial documents)
=======
-- 5. Invoices (legal/financial documents)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_invoices ON public.invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 7. Product Variants (inventory SKUs)
=======
-- 6. Product Variants (inventory SKUs)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_product_variants ON public.product_variants;
CREATE TRIGGER audit_product_variants
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 8. Coupon Codes (single-use promotional codes)
=======
-- 7. Coupon Codes (single-use promotional codes)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_coupon_codes ON public.coupon_codes;
CREATE TRIGGER audit_coupon_codes
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_codes
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_coupon_redemptions ON public.coupon_redemptions;
CREATE TRIGGER audit_coupon_redemptions
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_redemptions
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 9. Settlement Batches & Items (supplier payouts)
=======
-- 8. Settlement Batches & Items (supplier payouts)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_settlement_batches ON public.settlement_batches;
CREATE TRIGGER audit_settlement_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.settlement_batches
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_settlement_items ON public.settlement_items;
CREATE TRIGGER audit_settlement_items
  AFTER INSERT OR UPDATE OR DELETE ON public.settlement_items
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 10. Reconciliation (financial integrity checks)
=======
-- 9. Reconciliation (financial integrity checks)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_reconciliation_runs ON public.reconciliation_runs;
CREATE TRIGGER audit_reconciliation_runs
  AFTER INSERT OR UPDATE OR DELETE ON public.reconciliation_runs
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_reconciliation_discrepancies ON public.reconciliation_discrepancies;
CREATE TRIGGER audit_reconciliation_discrepancies
  AFTER INSERT OR UPDATE OR DELETE ON public.reconciliation_discrepancies
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 11. Affiliates (partner program)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_affiliates ON public.affiliates;
CREATE TRIGGER audit_affiliates
  AFTER INSERT OR UPDATE OR DELETE ON public.affiliates
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 12. Carts & Cart Items (shopping session state)
=======
-- 10. Carts & Cart Items (shopping session state)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_carts ON public.carts;
CREATE TRIGGER audit_carts
  AFTER INSERT OR UPDATE OR DELETE ON public.carts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_cart_items ON public.cart_items;
CREATE TRIGGER audit_cart_items
  AFTER INSERT OR UPDATE OR DELETE ON public.cart_items
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 13. Stock Reservations (inventory holds)
=======
-- 11. Stock Reservations (inventory holds)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_stock_reservations ON public.stock_reservations;
CREATE TRIGGER audit_stock_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_reservations
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
<<<<<<< HEAD
-- 14. Referral Program Settings (program configuration changes)
=======
-- 12. Referral Program Settings (program configuration changes)
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_referral_program_settings ON public.referral_program_settings;
CREATE TRIGGER audit_referral_program_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.referral_program_settings
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_referral_signals ON public.referral_signals;
CREATE TRIGGER audit_referral_signals
  AFTER INSERT OR UPDATE OR DELETE ON public.referral_signals
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

COMMENT ON TRIGGER audit_orders ON public.orders IS
  'C68: Audit all order lifecycle changes (created/updated/deleted). Captures actor, timestamp, and before/after snapshots in audit_log.';

COMMENT ON TRIGGER audit_vouchers ON public.vouchers IS
  'C68: Audit escrow voucher changes. Critical for financial reconciliation and fraud detection.';

<<<<<<< HEAD
COMMENT ON TRIGGER audit_refunds ON public.refunds IS
  'C68: Audit all refund operations. Essential for chargebacks, disputes, and financial reporting.';
=======
COMMENT ON TRIGGER audit_invoices ON public.invoices IS
  'C68: Audit legal document changes. Essential for compliance and financial reporting.';
>>>>>>> a0848fbf2 ([autopilot] C68: Add audit triggers for 20 verified tables + /admin/audit route)
