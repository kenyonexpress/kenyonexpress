# Launch blockers (human only)

Code is not on this list. Agents must not run these steps. Agents must not apply production migrations, must not edit Cloudflare, must not paste Cardcom passwords.

Order is load-bearing. **DNS is last.** The first real charge happens on
`https://kenyonexpress.vercel.app`
while the apex still serves WordPress.

Source of clicks:
`docs/OWNER-CHECKLIST.md`,
`docs/LAUNCH-RUNBOOK.md`,
`docs/DNS-CUTOVER-PLAN.md`
(read the two-zone banner),
`docs/cursor/RISK-REGISTER.md`.

---

## H0. Open the live DNS zone, not the staged one

There are two Cloudflare zones for
`kenyonexpress.co.il`.

| Zone | Nameservers | Status | If you edit here |
|---|---|---|---|
| Live | `derek.ns.cloudflare.com`, `elma.ns.cloudflare.com` | what the registrar delegates | The internet changes |
| Staged | `ignat` / `tess` | `initializing`, `activated_on: null`, created 2026-08-10, account `13a3f166…` | API returns `success: true` and **nothing public changes** |

**Chrome > Cloudflare:** confirm the zone that shows nameservers
`derek` / `elma`
before any TTL or A-record edit.

Do **not** move the registrar to the staged nameservers as a shortcut. Staged records include a broken
`send` SPF
(`include[...].nses.com`)
and a duplicate
`resend._domainkey`.
Those break mail the day NS moves.

---

## H1. Resend: key + domain (before any real purchase)

Without this, cron can mark notifications "attempted" and the buyer still has no voucher email.

1. **Chrome > Resend > API Keys.** Create a production key. If STATE still reports `400 API key is invalid`, **mint a new one**. Do not keep pasting the same value.
2. **Chrome > Vercel > project `kenyonexpress` > Settings > Environment Variables > Production.** Set
   `RESEND_API_KEY`
   and
   `RESEND_FROM`
   on the verified domain. Not Preview-only.
3. **Chrome > Resend > Domains.** Add the sending domain. Copy the DNS records it shows.
4. **Chrome > Cloudflare (live zone) > DNS > Records.** Add those TXT/CNAME. Do not touch MX
   `10 mailgw2.spd.co.il`.
5. Back in Resend, **Verify**. Wait until the dashboard is green. This is DNS propagation, not a toggle.
6. DMARC day one:
   `p=none`
   (not `reject`).
7. Redeploy Production after adding env (Vercel > Deployments > latest > Redeploy). `NEXT_PUBLIC_*` is not involved here; still redeploy so the server process sees the key.

**Stop if:** verify stays red. Do not proceed to H4.

---

## H2. Pull WordPress images into R2 (before H8)

At cutover, 32 product URLs on
`kenyonexpress.co.il/wp-content/uploads/...`
404. 19 real products would launch without photos.

1. **Chrome > Cloudflare > R2.** Confirm bucket + public base.
2. **Chrome > Vercel > Production env.** All five must exist:
   `R2_ACCOUNT_ID`,
   `R2_BUCKET`,
   `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`,
   `R2_PUBLIC_BASE_URL`.
3. Upload / migrate the 32 objects so storefront URLs no longer depend on WordPress.
4. Spot-check one PDP on
   `https://kenyonexpress.vercel.app`
   : image 200, not 404.

**Stop if:** PDPs on vercel.app still hotlink `wp-content`. DNS will copy that failure to the apex.

---

## H3. Approve and apply migration 172 (stock the master test row to 0)

Not a delete. Row
`9bb347f8-03ec-48ce-8ff2-2503fb74c895`
must remain for historical
`order_items`
but must not appear as a ₪1 / ₪400 homepage deal.

1. Read
   `migrations/pending/172_hide_master_product_test_row.sql`
   yourself.
2. Apply through the approved production path (MCP / operator), **not**
   `db push`.
3. **Chrome > Supabase > SQL Editor:**

```sql
select stock_quantity, status, slug
from products
where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
```

Expect
`stock_quantity = 0`.

The application already refuses to **sell** it (implausible-discount ceiling 95%). 172 is what removes it from the catalogue. Both are required.

**Stop if:** you do not have approval to apply SQL. Leave the row; do not ask an agent to apply it.

---

## H3b. Re-measure RLS (human, read-only) before H4

CI still ships
`supabase/rls-manifest.json`
from
**2026-08-19**
(53 tables). Later notes say 61. That gap is R23.

1. **Terminal** (from this repo, you run it, not an agent in this pack):

```bash
node scripts/check-rls.mjs
```

2. If the script asks for MCP / a DB URL, use the **read-only** production path you already use for audits. Do not apply SQL.
3. Diff the printed table list against the committed JSON. New tables must have RLS on. Zero-policy tables must be deny-all on purpose.
4. If
   `refunds`
   or
   `payment_events`
   exist with a write policy whose predicate is
   `true`,
   **stop launch**. That is a code/SQL incident, not H8.

This pack does not commit the JSON (file type is forbidden here). A different session on a code branch commits the snapshot.

---

## H4. Cardcom production terminal + Vercel Production env

**Phone: 03-9436100.** Ask for a **production** terminal (test terminals take real cards and settle nowhere), tokenization, and invoice/receipt API.

They give three values. You invent the fourth.

1. Write down Terminal Number, API User Name, API Password.
2. Terminal (your machine), generate webhook secret:

```bash
openssl rand -hex 32
```

3. **Chrome > Vercel > `kenyonexpress` > Settings > Environment Variables > Production.** Set **separately**:

```
CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET
CHECKOUT_ENABLED=true
```

`CHECKOUT_ENABLED` must be the exact string
`true`.
`TRUE`,
`1`,
or missing closes the till.

4. **Do not set**
   `CARDCOM_USE_MOCK`
   in Production. **Do not set**
   `CARDCOM_SANDBOX=true`
   (boot must refuse; if you need to check, look at env list and delete it).
5. Confirm IndicatorUrl / success / fail URLs on the terminal point at the **vercel.app** host first (HTTPS), with
   `?s=`
   = the webhook secret. After DNS, you will change the host to the apex and keep the same secret.
6. Redeploy Production.

Also confirm these already exist in Production (boot-required):
`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`
or
`SUPABASE_SECRET_KEY`,
`VOUCHER_QR_SECRET`,
`CRON_SECRET`,
`NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SITE_URL`
(same canonical URL),
`CONTACT_TO`.
Optional degrade: Upstash, Meilisearch, QStash, Sentry DSN (DSN is build-time; missing = silent no-op SDK).

---

## H5. Prove the ten cron routes (one scheduler)

GitHub Actions
`cron.yml`
is the intended scheduler (
`CRON_SCHEDULER_ENABLED=true`
plus
`CRON_SECRET`
on the repo). cron-job.org is optional. **Two at once double-fires every job.**

1. **Chrome > Vercel > env.** Copy
   `CRON_SECRET`
   (eye icon). 64 hex chars. It is not written in git.
2. Terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.vercel.app/api/cron/health
```

Expect
`401`.
Anything else: stop. The route is not guarded on that deployment.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://kenyonexpress.vercel.app/api/cron/health
```

Expect
`200`.
401 here means the scheduler secret and the deployment secret differ (the usual failure).

3. **Chrome > GitHub > repo Settings > Secrets.** Confirm
   `CRON_SECRET`
   matches Vercel. Confirm
   `CRON_SCHEDULER_ENABLED`
   is true **or** you have exactly one external scheduler, not both.
4. Wait one
   `notifications`
   tick. History must show 200.

**Stop if:** health with secret is not 200. Buyers will pay and never get mail.

### H5 addendum. Count the jobs you actually have

This tree has **twelve** GET cron routes, not ten. After health is 200, hit (still on vercel.app, still with the same Bearer):

```
/api/cron/notifications
/api/cron/invoices
/api/cron/stock
/api/cron/stranded-payments
/api/cron/abandoned-cart
/api/cron/subscriptions
/api/cron/reap-carts
/api/cron/reconcile
/api/cron/expire-vouchers
/api/cron/retention
/api/cron/weekly-digest
```

Each must be 200 with the secret and 401 without it. 200 without a secret is a stop: the till will look healthy and every job is public.

Confirm
`.github/workflows/cron.yml`
lists the same set. Do **not** add a `crons` key to
`vercel.json`.
Do **not** enable cron-job.org while Actions is on.

---

## H6. One real shekel on vercel.app (before DNS)

**Chrome > https://kenyonexpress.vercel.app**

Buy the cheapest **real** coupon (not the master test row). Real card. Not mock.

Then, in order:

1. **Supabase > SQL Editor:**

```sql
select id, status, paid_at, total_ils from orders order by created_at desc limit 1;
select id, status, code from vouchers order by created_at desc limit 1;
```

Expect
`orders.status = paid`
and one voucher
`issued`.

2. Mail arrived (H1).
3. `/account/orders` shows the order.
4. `/account/coupons` shows the QR.
5. `/supplier/scan` (or `/scan`) accepts **once** and refuses the second scan.
   Do **not** use
   `redeemAdminVoucher`
   for this proof. That path skips
   `redeem_voucher`
   (R20).
6. Cardcom dashboard amount equals
   `coupon_price`
   (absolute, not 10% of face).
7. Refund that charge from the **Cardcom dashboard** and confirm the refund lands.
8. **Supabase > SQL Editor:** cashback (if the product had a snapshot > 0) is one
   `wallet_entries`
   row with reason
   `order_cashback`
   and must not appear a second time after a webhook replay.
9. Chrome >
   `https://kenyonexpress.vercel.app/legal/returns`
   : remainder is cash at the partner. No escrow. No "we will release money to the supplier".
10. Chrome > homepage: the master test row may still render until 172. Do not buy it. If you can add it to cart, H3 is not done **and** the implausible-discount guard is broken. Stop.

**Rollback of till only:** set
`CHECKOUT_ENABLED=false`,
redeploy. Catalogue stays up.

**Stop if:** 42703, 0 vouchers, webhook 401, or amount mismatch. That is a code/credentials incident, not a DNS problem. Do not cut the domain to paper over it.

Returns copy on
`/legal/returns`
must describe cash-at-counter remainder and 14-day
`distance_sale_14d`,
not escrow. If that page still says escrow, fix copy before H8 (customers will screenshot it).

---

## H7. Attach the domain in Vercel (still do not change public DNS)

**Chrome > Vercel > `kenyonexpress` > Settings > Domains > Add Existing Domain**

1. `kenyonexpress.co.il` > Add.
2. `www.kenyonexpress.co.il` > Add.
3. Leave the screen open. Vercel shows the A it wants:
   `76.76.21.21`.
4. Status "Invalid Configuration" is expected until H8.

Adding DNS **before** this step serves a Vercel 404 to every visitor.

---

## H8. DNS cutover (the only step that is not seconds-reversible)

### Day before

**Chrome > Cloudflare (live zone H0) > DNS > Records**

For each apex/www A and AAAA currently published: Edit > TTL **2 min** > Save. Do this the day before, not on the day.

Terminal, snapshot:

```bash
dig +short kenyonexpress.co.il A     >  ~/Desktop/dns-before-cutover.txt
dig +short kenyonexpress.co.il AAAA  >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il A    >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il AAAA >> ~/Desktop/dns-before-cutover.txt
cat ~/Desktop/dns-before-cutover.txt
```

Measured 2026-09-01 (re-dig; do not trust this blob if the date is stale):

```
kenyonexpress.co.il      A     104.21.55.125       (Proxied)
kenyonexpress.co.il      A     172.67.148.28       (Proxied)
www                      same pair
AAAA                     Cloudflare proxy v6
NS                       derek / elma
MX                       10 mailgw2.spd.co.il
```

### On the day (after H1–H7)

1. Delete the four AAAA on apex and www (Vercel apex is IPv4 only. A leftover AAAA keeps IPv6 users on WordPress).
2. One A per name:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `kenyonexpress.co.il` | `76.76.21.21` | **DNS only** (grey cloud) | 2 min |
| A | `www` | `76.76.21.21` | **DNS only** (grey cloud) | 2 min |

If two A records exist per name, edit one to
`76.76.21.21`
and **delete** the other. Two As round-robin; half the traffic stays on WordPress.

**Grey cloud, not orange.** Orange puts Cloudflare TLS in front of Vercel: redirect loops, untrusted cert, Vercel cannot issue.

3. Do not touch MX, TXT, `mail`, `pop`, `smtp`, `ftp`.

4. Verify:

```bash
dig +short kenyonexpress.co.il A          # exactly 76.76.21.21
dig +short www.kenyonexpress.co.il A      # exactly 76.76.21.21
dig +short kenyonexpress.co.il AAAA       # empty
dig +short www.kenyonexpress.co.il AAAA   # empty
dig +short kenyonexpress.co.il MX         # 10 mailgw2.spd.co.il
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content   # 0
```

Wait if `wp-content` is still there. Do not flip other records while waiting.

5. Point Cardcom Success / Fail / IndicatorUrl at the **apex** HTTPS URLs. **Keep the same**
   `CARDCOM_WEBHOOK_SECRET`.
   Redeploy only if
   `NEXT_PUBLIC_APP_URL`
   /
   `NEXT_PUBLIC_SITE_URL`
   were still the vercel.app host (they are inlined at build: change env, then Redeploy).

### Rollback

Restore two **proxied** A records per name to the pre-cutover Cloudflare anycast pair from the Desktop snapshot (2026-09-01 pair was
`172.67.148.28`
and
`104.21.55.125`).
Do not recreate AAAA by hand; orange cloud publishes v6. Leave the domain attached in Vercel.

---

## H9. Sixty minutes of watching

- Sentry (EU project).
- ntfy / operator channel if configured.
- Cardcom dashboard vs latest
  `payments`
  row.
- `/api/health` on the apex.
- One more tiny live purchase **on the apex** only after H8 dig is clean.

If anything money-shaped fails: till kill switch first (
`CHECKOUT_ENABLED=false`
+ redeploy), DNS rollback only if the site itself is the old WordPress or a Vercel 404.

---

## Not on this list

- Running pnpm, tests, or builds.
- Editing RLS.
- Calling
  `admin/payouts.ts`
  (no tables).
- Enabling a second cron scheduler.
- Meilisearch (optional degrade to ILIKE).
- Physical-product commercial push (no live payout ledger).
- i18n, Twilio campaigns, wishlist polish (post-launch).
- Closing test gaps G1–G10 (that is code on another branch).
- Calling
  `redeemAdminVoucher`
  as the launch proof of scan.

---

## H10. After a failed H8 (checklist)

1. Till:
   `CHECKOUT_ENABLED=false`
   + Redeploy.
2. DNS: restore proxied A pair from the Desktop snapshot. Do not recreate AAAA.
3. Confirm
   `dig`
   is Cloudflare anycast again, then
   `curl`
   shows WordPress
   `wp-content`
   (that is the rollback success signal).
4. Leave the domain attached in Vercel.
5. Do not apply extra migrations in that window.
6. Do not enable cron-job.org "to help" while Actions is still on.

---

## H4 addendum. WhatsApp public number

If
`NEXT_PUBLIC_WHATSAPP_PHONE`
is empty, the storefront falls back to
`972524635550`
(Test Store on the WordPress site). Set the real business number in Production and **Redeploy** before H8, even if campaigns (P4) are months away. This is a one-line env paste, still a human.

---

## H6 addendum. Analytics zero is not a closed till

After the shekel purchase, if the marketing dashboard still shows 0
`purchase`
events, that is R24 (ingest / migration 169), not proof Cardcom failed. You already proved pay with SQL in H6 step 1. Do not kill
`CHECKOUT_ENABLED`
only because ads report nothing.

Do not install a "debug" service role into the TestFlight / Play till app as part of H6. The phone uses the anon key.
