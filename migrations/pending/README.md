# `migrations/pending/`

Unapplied migrations, written here by instruction. **Nothing in this directory
has been run against any database**, and nothing here may be applied with
`db push` — the project forbids it. The route to production is
`apply_migration` through MCP, after a human approves the file.

## There is a second pending location, and it is older

Four unapplied files live in `supabase/migrations/` under a `PENDING-` prefix
instead:

| File | What it does |
| --- | --- |
| `PENDING-109-recurring-subscriptions.sql` | the `recurring` enum member, `subscriptions`, the billing columns |
| `PENDING-110-supplier-coordinates.sql` | `suppliers.latitude` / `.longitude`, GiST, the pair CHECK |
| `PENDING-money-integer-fix.sql` | 41 money columns from numeric ILS to integer agorot |

They are not moved here. The `PENDING-` prefix deliberately breaks the `NNN_`
convention so no tooling picks them up as part of the ordered chain, and moving
a file that four documents cite by path buys a tidier tree at the cost of every
one of those references. **Read both locations before concluding the schema is
settled.**

## Order

`003-products-whatsapp-enabled.sql` is independent of everything in
`supabase/migrations/`. It does not depend on PENDING-109 or PENDING-110.

`006-categories-sort-order.sql` is independent of all of them. It is data, not
schema: one UPDATE that moves `electronics` from a shared `sort_order` of 10 to
12. It adds no unique index on purpose, and the file says why.

## Two corrections, measured against production on 19.08.2026

Both were stale claims in this file, found by checking every object named here
against `ixvwfbuvfxxsjiywhbbb` rather than by reading.

**`002-products-geo.sql` no longer exists**, anywhere in the tree or on any
branch head. It was added in `f4fc79140` and has since been removed. It is not
"pending": `products.city`, `products.latitude` and `products.longitude` are
all **present in production today**, so its content was applied and the file
was dropped afterwards. The sentence above used to name it as an unapplied file
sitting in this directory, which would have led the next reader to go looking
for it, or worse, to rewrite and re-apply it.

**`PENDING-revoke_anon_writes.sql` does not exist either.** The table above
listed four files in `supabase/migrations/`; there are three. That mattered
more than a missing row, because the file it named is a security migration and
its absence read as "already written, waiting for approval". What is actually
true in production, measured:

| role | INSERT / UPDATE / DELETE | TRUNCATE | gate |
| --- | --- | --- | --- |
| `anon` | **`carts` only** | none | RLS on, policy `carts: owner all` |
| `authenticated` | 55 tables | **55 tables** | RLS, except TRUNCATE |

The `anon` grant is not a hole: an open guest cart is a product requirement,
the grant is confined to that one table, and RLS is on with an owner policy.

The `authenticated` grants are broad by Supabase default and RLS is the real
gate, with one exception worth writing down: **RLS does not apply to TRUNCATE.**
It is not reachable through PostgREST, so this is defence in depth rather than a
live exploit, and it is what `126_revoke_authenticated_dml.sql` addresses.

**That file is now here.** It was brought over from `feat/auth-model` on 19.08
rather than merging the branch, which would also have landed a second
guard-coverage suite alongside the one already in `src/lib/auth/`. Its central
measurement was re-checked against production before importing and still holds
exactly: the eight tables with RLS on and zero policies are
`legacy_percent_archive_112`, `payment_webhook_events`, `rate_limits`,
`referral_signals`, `search_index_dlq`, `settlement_events`,
`stock_reservations`, `user_rate_limits`. It revokes DML on those eight only,
and deliberately not across the schema: `authenticated` legitimately writes to
carts, addresses and profiles, and a blanket revoke would break the storefront
while the RLS policies above it kept passing.

## All thirteen files here are genuinely unapplied

Checked object by object against production, not assumed from this file: none of
`payment_events`, `refunds`, `search_index_outbox`, `supplier_branches`,
`banners`, `homepage_sections` exists; neither does `order_items.shipped_at`,
`order_items.delivered_at` or `products.whatsapp_enabled`; and none of the six
guard functions in `007` is defined. `expire_vouchers` does exist, which is
expected: `004` replaces it rather than creating it.

`127_revoke_check_rate_limit_execute.sql` was added on 21.08 and is unapplied
like the rest. Measured before writing: `check_rate_limit` is SECURITY DEFINER
with `anon=X | authenticated=X | service_role=X`, its `p_key` argument is
caller-supplied and inserted verbatim, and the counter increments before the
limit is compared. So anyone holding the publishable key can spend any bucket:
five calls on `phone-otp-number:<e164>` lock a real person out of OTP sign-in
for an hour. **It has a deploy order and the file says so in a banner** - the
`src/lib/utils/rate-limit.ts` change to the service-role client must be live
before the revoke is applied, or the limiters hit their fail-open branch and
every limit in the app goes off silently.

## The audit that produced `125` measured the wrong tree

`125` was written to revoke six functions "with zero rpc() callsites in src/".
There are two Supabase clients in this repo. The supplier till is an Expo app at
`apps/mobile`, it uses the anon key with the cashier's session in SecureStore,
and `apps/mobile/src/lib/supplier/api.ts:64` calls `supplier_app_context` - one
of the six. Applying `125` as written would have stopped every till from
scanning at once, with nothing in the web app's logs, because
`loadSupplierContext()` returns null on error and the screen reads null as "this
device belongs to no supplier".

That revoke has been **removed from `125`** and the file now carries the
withdrawal and the reason. Two things came out of it worth keeping:

- **A grant audit that greps `src/` measures the website, not the product.**
- `voucher_success_payload`, which stays in `125`, is not the hygiene item the
  file called it. It takes a whole `vouchers` row as its argument, so the caller
  chooses `user_id`, and it then reads `profiles.full_name` as the definer.
  Proven read-only against production on 21.08 as role `authenticated`: a direct
  `SELECT` of the victim's profile returns **0 rows** and the same session gets
  their name back through the function. That is a live RLS bypass, not a dead
  grant.

`src/__tests__/revoked-functions-have-no-callers.test.ts` re-derives the revoke
list from this directory and checks it against every `.ts`/`.tsx` file in both
`src/` and `apps/`, so the next revoke of a mobile-only function fails a test
instead of a till.

`src/__tests__/pending-migrations-inventory.test.ts` now keeps this section
honest. It lives under `src/` because that is the only tree vitest is
configured to collect from; widening `vitest.config.ts` to reach `migrations/`
would change what every other suite in the repo picks up, for one file.

## ‏⚠️ התנגשות מספור עם `supabase/migrations/`, ‏19.08.2026

‏המספרים `120` ו-`121` **תפוסים פעמיים**, בשתי תיקיות, בשתי משמעויות שונות:

| מספר | ‏`supabase/migrations/` (הורץ בפרודקשן) | ‏`migrations/pending/` (ממתין לאופיר) |
| --- | --- | --- |
| ‏120 | ‏`120_split_public_select_policies_by_role.sql` | ‏`120_payment_events.sql` |
| ‏121 | ‏`121_widen_notification_outbox_kind_check.sql` | ‏`121_refunds.sql` |

‏זה קרה כי `supabase/migrations/` הגיע ל-118 ושני מחזורים הוסיפו לו 119-121
באותו יום, בעוד שהתור כאן שמר לעצמו את 120-126 מראש.

‏**מה לעשות כשמקדמים קובץ מכאן:** ‏למספר אותו מחדש ל-**122 ומעלה** לפי מה
שתפוס ב-`supabase/migrations/` באותו רגע, ולא להעתיק את המספר שכתוב כאן.
‏הקבצים שכבר הורצו לא ימוספרו מחדש: שינוי שם של מיגרציה שרצה אינו משנה דבר
במסד ורק שובר את הקשר בין הקובץ להיסטוריה.
