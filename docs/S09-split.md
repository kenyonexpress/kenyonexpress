# S09: split snapshot on order_items, frozen once paid

Queue S09, 04.11.2026. Goal: on a paid order, `order_items` holds
`platform_percent`, the platform amount and the supplier amount, copied from
the product at purchase time, and they cannot change afterwards.

## What was already true (measured, not assumed)

Checkout (`src/server/actions/payments/checkout.ts`, step 4) already copies the
split into every line when the order is created, through `calculateSettlement`
(`src/server/domain/orders/settlement.ts`) and `buildOrderItemMoneyRow`
(`src/lib/commerce/order-money-columns.ts`). On the hosted schema the task's
names map to existing columns:

| task name         | hosted column                                         |
|-------------------|-------------------------------------------------------|
| `platform_percent`| `platform_percent` (product rate, whole percent)      |
| `platform_amount` | `commission_agorot` (integer agorot)                  |
| `supplier_amount` | `supplier_immediate_agorot` (integer agorot), `supplier_payout_ils` shekel twin |

**No column was missing, so none was added.** A `platform_amount` beside
`commission_agorot` would be two sources for one number. The supplier share is
always the residual `paid_on_site - commission`, never a second multiplication.

Production, 04.11:

```
paid_items 947 | null platform_percent 0 | null commission_agorot 0 | null supplier_immediate_agorot 0
last 30 days 918 | of which any null 0 | commission + supplier <> paid_on_site: 0
```

## What was wrong

The live trigger `trg_order_items_percent_snapshot_lock` (on production, never
in the repo) froze only the three percent columns. The amounts of a paid line
could be rewritten. Rolled-back DO block, **before** 253:

```
S09_PROOF (rolled back) paid.commission_agorot=ALLOWED; paid.supplier_immediate_agorot=ALLOWED;
paid.platform_percent=REFUSED; paid.face_value_agorot=REFUSED; paid.settlement_status(no-op)=ALLOWED;
unpaid.commission_agorot=ALLOWED;
```

So a paid line could keep reading 30% while its money said something else.

## The fix: migration 253

`migrations/pending/253_order_items_split_amount_lock.sql`, CREATE OR REPLACE of
the same function (identity and grants unchanged), plus `CREATE OR REPLACE
TRIGGER` so a from-file database gets it too. Once `orders.paid_at` is set, an
UPDATE that changes any of these raises `check_violation`:

`platform_percent, supplier_split_percent, commission_percent_snapshot,
commission_percent, upfront_percent, commission_agorot,
supplier_immediate_agorot, supplier_payout_ils, paid_on_site_agorot,
face_value_agorot, balance_due_agorot, unit_price_ils, total_price_ils, quantity`

Deliberately **not** locked:

- `product_id`: FK is `ON DELETE SET NULL`. Locking it would make every product
  with a paid sale undeletable.
- `supplier_id`: FK is `ON DELETE RESTRICT`, so it cannot move by cascade.
- statuses, timestamps, escrow, cashback: finalize, refund, shipping and
  redemption move them after payment by design. Checked: no writer in `src/`
  and no function in `pg_proc` (`generate_payout_statement`,
  `reserve_order_stock` are the only ones that UPDATE near order_items, and
  neither touches a locked column) changes a locked column on a paid line.

### Applied

```
$ supabase db query --linked -f migrations/pending/253_order_items_split_amount_lock.sql
Initialising login role...
{ "rows": [] }
```

### Proof, **after** 253 (same DO block, rolled back by its final RAISE)

```
S09_PROOF (rolled back) paid.commission_agorot=REFUSED; paid.supplier_immediate_agorot=REFUSED;
paid.platform_percent=REFUSED;
paid.face_value_agorot=REFUSED(order item 2c66295c-f1b6-4aa7-a02e-d2603243e7f6 belongs to a paid order; split snapshot is frozen);
paid.settlement_status(no-op)=ALLOWED; unpaid.commission_agorot=ALLOWED;
```

Paid line: every split column refused. Status writes on a paid line still pass.
An unpaid (pending) line is still writable, as checkout's cancel path needs.

### Reversal (pre-253 body)

```sql
CREATE OR REPLACE FUNCTION public.fn_order_items_percent_snapshot_lock()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF (NEW.platform_percent IS DISTINCT FROM OLD.platform_percent
      OR NEW.supplier_split_percent IS DISTINCT FROM OLD.supplier_split_percent
      OR NEW.commission_percent_snapshot IS DISTINCT FROM OLD.commission_percent_snapshot)
     AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = OLD.order_id AND o.paid_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'order item % belongs to a paid order; percent snapshots are frozen', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;
```

## Tests

New: `src/server/domain/orders/split-snapshot.test.ts`, 4 tests.

1. Two products at the same price and different rates (12.5%, 30%) get their
   own `platform_percent`; amounts are integer agorot (7496 / 17991 on 59970)
   and platform + supplier = paid on site.
2. A coupon prepayment splits by the product rate (40₪ at 30% = 1200 / 2800),
   balance 36000 at the business.
3. The lock in 253 names every split column, and leaves
   `settlement_status`, `item_status`, `escrow_held_agorot`, `product_id` open.
4. Ratchet: every money column `buildOrderItemMoneyRow('ils', ...)` writes is
   locked, except cashback and escrow. A new money column added to checkout
   without adding it to the lock fails here.

```
$ pnpm vitest run src/server/domain/orders/split-snapshot.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ pnpm vitest run src/server/domain/orders src/lib/commerce src/server/actions/payments src/server/payments
 Test Files  46 passed (46)
      Tests  904 passed (904)
```

Full suite. The first run went red twice on inventory gates this item had
to satisfy: `pending-migrations-inventory` (253 not yet listed; added to the
test and to `migrations/pending/README.md`) and `ci-docs-inventory` (root
README said 290 documents, this file makes 291). Both fixed, then:

```
$ pnpm test
 Test Files  652 passed (652)
      Tests  7792 passed | 12 skipped (7804)
exit 0
```

### type-check and lint

```
$ pnpm type-check
tsc exit 0

$ pnpm exec biome check src docs migrations scripts
Checked 2048 files in 649ms. No fixes applied.

tokens-gate=0 copy-gate=0 asset-gate=0 raw-html-gate=0 postgrest-or-gate=0
cache-invalidation-gate=0 rtl-logical-gate=0 i18n-gate=0 locale-format-gate=0
input-dir-gate=0 docs-index-gate=0 docs-path-audit=0
```

A bare `pnpm lint` exits 1, as in S08: every diagnostic comes from the
untracked `.lighthouseci/` and `android/` directories, not committed and not
touched here.

### Design-freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
new since tag: src/components/turnstile/SupplierApplyChallenge.tsx
new since tag: src/components/turnstile/TurnstileRefresh.tsx
```

No UI file touched by this item; both listed files are S05's and new since the tag.
