-- Migration 308: Order lifecycle state machine with transition guards (was mis-saved as preflight_305.sql by F55)
-- F55: Complete order lifecycle end-to-end
-- Date: 2026-10-25

-- Add voucher_qr_url column to orders table for storing QR code URLs
ALTER TABLE IF EXISTS public.orders
ADD COLUMN IF NOT EXISTS voucher_qr_url text;

COMMENT ON COLUMN public.orders.voucher_qr_url IS
'URL to generated voucher QR code image. Populated on payment success for coupon orders.';

-- Create order status transition guard function
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- pending → paid: only when payment succeeds
  IF OLD.status = 'pending' AND NEW.status = 'paid' THEN
    IF NEW.paid_at IS NULL THEN
      RAISE EXCEPTION 'Cannot transition to paid without paid_at timestamp';
    END IF;
    RETURN NEW;
  END IF;

  -- paid → fulfilled: only when all items shipped/delivered
  IF OLD.status = 'paid' AND NEW.status = 'fulfilled' THEN
    RETURN NEW;
  END IF;

  -- any → cancelled: allowed from pending or paid (before fulfillment)
  IF NEW.status = 'cancelled' THEN
    IF OLD.status NOT IN ('pending', 'paid') THEN
      RAISE EXCEPTION 'Cannot cancel order in status: %', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  -- any → refunded: allowed from paid or fulfilled
  IF NEW.status = 'refunded' THEN
    IF OLD.status NOT IN ('paid', 'fulfilled', 'partially_fulfilled') THEN
      RAISE EXCEPTION 'Cannot refund order in status: %', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  -- fulfilled/refunded/cancelled are terminal states
  IF OLD.status IN ('fulfilled', 'refunded', 'cancelled') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'Cannot transition from terminal state: %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for order status transitions
DROP TRIGGER IF EXISTS enforce_order_status_transitions ON public.orders;
CREATE TRIGGER enforce_order_status_transitions
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_order_status_transition();

-- Create payment status transition guard function
CREATE OR REPLACE FUNCTION public.validate_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- initiated → redirected: only when low profile created
  IF OLD.status = 'initiated' AND NEW.status = 'redirected' THEN
    IF NEW.cardcom_low_profile_id IS NULL THEN
      RAISE EXCEPTION 'Cannot redirect without cardcom_low_profile_id';
    END IF;
    RETURN NEW;
  END IF;

  -- redirected → succeeded: only when verified
  IF OLD.status IN ('initiated', 'redirected') AND NEW.status = 'succeeded' THEN
    IF NEW.succeeded_at IS NULL THEN
      RAISE EXCEPTION 'Cannot mark succeeded without succeeded_at timestamp';
    END IF;
    RETURN NEW;
  END IF;

  -- redirected → failed: allowed
  IF OLD.status IN ('initiated', 'redirected') AND NEW.status = 'failed' THEN
    RETURN NEW;
  END IF;

  -- succeeded → refunded: only when refund processed
  IF OLD.status = 'succeeded' AND NEW.status = 'refunded' THEN
    IF NEW.refunded_at IS NULL THEN
      RAISE EXCEPTION 'Cannot mark refunded without refunded_at timestamp';
    END IF;
    RETURN NEW;
  END IF;

  -- Prevent invalid transitions
  IF OLD.status = 'succeeded' AND NEW.status = 'failed' THEN
    RAISE EXCEPTION 'Cannot transition from succeeded to failed';
  END IF;

  IF OLD.status = 'failed' AND NEW.status = 'succeeded' THEN
    RAISE EXCEPTION 'Cannot transition from failed to succeeded';
  END IF;

  IF OLD.status = 'refunded' AND NEW.status != 'refunded' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state refunded';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for payment status transitions
DROP TRIGGER IF EXISTS enforce_payment_status_transitions ON public.payments;
CREATE TRIGGER enforce_payment_status_transitions
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_payment_status_transition();

-- Create index on orders.voucher_qr_url for lookup
CREATE INDEX IF NOT EXISTS idx_orders_voucher_qr_url
  ON public.orders(voucher_qr_url)
  WHERE voucher_qr_url IS NOT NULL;
