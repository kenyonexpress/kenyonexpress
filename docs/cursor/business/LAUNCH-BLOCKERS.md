# Launch blockers (human only)

Canonical detail: `docs/cursor/LAUNCH-BLOCKERS.md`. This file is the ordered list for the 100-item queue. DNS last. No agent apply.

| # | Human step | Verify |
|---|---|---|
| H0 | Cloudflare **live** zone derek/elma, not staged ignat/tess | Record edit actually hits apex |
| H1 | Resend domain + from address | Voucher mail after pay (cron) |
| H2 | Rotate leaked service role; preflight hash | New key boots; old hash refused |
| H3 | Cardcom production terminal, webhook `?s=` on Vercel, mock unset, sandbox not true | Staging ₪ then one real |
| H4 | WhatsApp business number; not 972524635550 | Float omitted or real |
| H5 | `CRON_SECRET` + Actions scheduler on; not Hobby vercel.json crons; not 162+Actions | notifications 200 |
| H6 | One real coupon pay + scan; ntfy topic unguessable; `ALERTS_ENABLED` not false | Order paid, voucher, scan |
| H7 | R2 all five env; pull WP images | PDP 200 images |
| H8 | 172 stock 0 on master SKU; guard still on | Cannot buy ₪1 |
| H9 | `CHECKOUT_ENABLED=true` exact; Vercel watches this repo, fra1, pnpm | Deploy = this git |
| H10 | Legal no escrow copy | `/legal/returns` |
| LAST | DNS records on live zone to Vercel | dig + webhook POST |

Not blockers: 169 ads honesty, 150 deletion RPC, EN locale, reviews marketing, payout schema, Meili.

---

## Second pass

Human only. DNS last. H2 rotate key. H6 real pay+scan. H8 172 stock 0. H9 CHECKOUT_ENABLED=true exact.
