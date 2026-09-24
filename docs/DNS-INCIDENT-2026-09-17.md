# DNS incident, 2026-09-17: kenyonexpress.co.il does not resolve (lame delegation)

Measured 2026-09-17 06:38 (UTC+7) from the autopilot maintenance loop.

## Symptom

`kenyonexpress.co.il` and `www.kenyonexpress.co.il` return **SERVFAIL** from
1.1.1.1 and 8.8.8.8. Every visitor gets "site not found". The site itself is
up: `https://kenyonexpress.vercel.app/` answers 200 and `/api/health` answers
`{"ok":true,"database":"ok","latency_ms":196}`.

## Cause (measured, not assumed)

The .il registry delegates the domain to one pair of Cloudflare nameservers,
while the zone that actually holds the records lives on a different pair:

| Where | Nameservers | Answer for `kenyonexpress.co.il A` |
| --- | --- | --- |
| Registry (`dig @ns1.ns.il ... NS`) | `tess.ns.cloudflare.com`, `ignat.ns.cloudflare.com` | **REFUSED** (zone not on these servers) |
| Zone that has the records | `derek.ns.cloudflare.com`, `elma.ns.cloudflare.com` | `104.21.55.125`, `172.67.148.28` |

`derek`/`elma` are the pair recorded on 2026-09-02 in
`docs/DNS-SNAPSHOT-PRE-CUTOVER.md`. `tess`/`ignat` is the pair Cloudflare
assigns when the domain is **added to a different Cloudflare account** (each
account gets its own pair). So someone added the zone to a second account,
changed the registrar delegation to that account's pair, and the zone on that
account either was never activated or was deleted. Result: lame delegation.

Reproduce:

```bash
dig +norecurse @ns1.ns.il kenyonexpress.co.il NS        # tess / ignat
dig +norecurse @tess.ns.cloudflare.com kenyonexpress.co.il A   # REFUSED
dig @derek.ns.cloudflare.com kenyonexpress.co.il A     # 104.21.55.125
dig @8.8.8.8 kenyonexpress.co.il SOA                    # SERVFAIL
```

## Fix (manual, needs Ofir; nothing here can do it)

Pick **one** of the two, do not do both:

1. **Point the registrar back at the working zone.** At the .il registrar,
   set the nameservers to `derek.ns.cloudflare.com` and
   `elma.ns.cloudflare.com`. Takes effect within the 86400s registry TTL,
   usually much sooner because resolvers do not cache SERVFAIL for long.
2. **Or finish the move to the new account.** Log in to the Cloudflare account
   that owns `tess`/`ignat`, make sure the zone `kenyonexpress.co.il` exists
   there with the same records as the old zone (export from the old account:
   DNS, Export), and click "Check nameservers". Keep the MX/SPF/DKIM records
   for `mailgw2.spd.co.il`; they belong to a live mail service.

After either: `dig @8.8.8.8 kenyonexpress.co.il A` must return the two
Cloudflare anycast addresses, and `curl -I https://kenyonexpress.co.il/` must
return 200 with a valid certificate. Then re-run `pnpm deploy:smoke` if that
script is on the branch, or `scripts/production-smoke` from CI.

## What the autopilot did

* Confirmed the site is healthy on the Vercel alias, so this is DNS only.
* Wrote this document and recorded the finding in `STATE.md`.
* Sent an ntfy alert to `kenyon-ofir-limit`.
* Did **not** touch DNS: registrar and Cloudflare credentials are not
  available from the loop, and the rule is that DNS cutover is manual.
