-- 116_coupon_receipt_document.sql
--
-- A third document type, and the reason it is not a tax invoice.
--
-- WHAT A COUPON SALE IS. The customer pays now for something they will consume
-- later at a supplier's counter. The money that changes hands at checkout is an
-- ADVANCE, and this project already decided that on 2026-07-28: a coupon's
-- prepayment is the platform's at payment, the supplier is owed nothing on it,
-- and the product page hides VAT on coupons for exactly this reason. Issuing a
-- tax invoice for it states a taxable sale that has not happened yet.
--
-- So a coupon-only order gets `coupon_receipt` - a receipt for money received -
-- and a physical order keeps `tax_invoice_receipt`.
--
-- A MIXED ORDER GETS THE TAX INVOICE, NOT TWO DOCUMENTS. Splitting one payment
-- across two documents means two numbers for one card charge, and a customer
-- who can only reconcile half of their statement against each. Choosing the
-- stricter document for the whole order overstates nothing that is not already
-- being sold, and it is the direction that costs nothing if the classification
-- is wrong.
--
-- VAT ON A coupon_receipt IS ZERO, and the CHECK that net + vat = total still
-- holds because net then equals total. That is not a claim of exemption: it is
-- the statement that no VAT event has occurred yet. `vat_percent` is still
-- recorded, so a document reprinted later carries the rate of its own day.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_document_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type = ANY (ARRAY['tax_invoice_receipt', 'coupon_receipt', 'credit_note']));

COMMENT ON COLUMN public.invoices.document_type IS
  'tax_invoice_receipt = physical/mixed sale. coupon_receipt = advance for a voucher, VAT 0. credit_note = refund.';
