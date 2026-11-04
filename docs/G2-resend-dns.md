# G2: Resend DNS on the Vercel zone (05.11.2026)

`scripts/verify-resend-dns.sh` checks the four records Resend needs for
`kenyonexpress.co.il`, adds any that are missing from the Vercel zone, resolves
each one publicly, and asks Resend for the domain status when a key with
`domains:read` is in the shell. Run today, nothing needed adding.

## Measured

```
$ CHECK_ONLY=1 scripts/verify-resend-dns.sh
PASS resend._domainkey TXT: zone has it and resend._domainkey.kenyonexpress.co.il resolves ("p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJVyYJvyWcY6mDZv)
PASS send TXT: zone has it and send.kenyonexpress.co.il resolves ("v=spf1 include:amazonses.com ~all")
PASS send MX: zone has it and send.kenyonexpress.co.il resolves (10 feedback-smtp.us-east-1.amazonses.com.)
PASS _dmarc TXT: zone has it and _dmarc.kenyonexpress.co.il resolves ("v=DMARC1; p=none;")
SKIP resend api: RESEND_API_KEY not in this shell (the production key is sensitive in Vercel and cannot be pulled)
RESULT: PASS (kenyonexpress.co.il)
```

| record | in Vercel zone (`vercel dns ls`) | resolves publicly (cloudflare-dns.com) | verdict |
|---|---|---|---|
| `resend._domainkey` TXT | `rec_4a2906907a274e5aee37bcaa`, `p=MIGf...` | yes, same key | PASS |
| `send` TXT (SPF) | `rec_657aaf33e0c6dc2382443b50`, `v=spf1 include:amazonses.com ~all` | yes | PASS |
| `send` MX | `rec_31117d3378bd9f55eba2421d`, `10 feedback-smtp.us-east-1.amazonses.com.` | yes | PASS |
| `_dmarc` TXT | `rec_b5b7bf164081d50cba2161ec`, `v=DMARC1; p=none;` | yes | PASS |
| Resend API `status=verified` | n/a | n/a | NOT MEASURED (see below) |

Delegation: `kenyonexpress.co.il NS` answers `ns1/ns2.vercel-dns.com` publicly,
and the records above are served from the zone `vercel dns ls` shows under the
`kenyonexpress-projects` team, so the zone the registrar points at is the one
the CLI edits.

## Three corrections to the item as written

1. **The MX is `us-east-1`, not `eu-west-1`.** The host is the one Resend
   issued when the domain was added; its region is not ours to choose after
   the fact. The script takes it from `RESEND_MX_HOST` with the measured
   default. Replacing it with the eu-west-1 host would break bounce handling.
2. **`dig +short` cannot run here.** Port 53 to any external resolver times
   out on this machine (ns1.vercel-dns.com and 8.8.8.8 both "no servers could
   be reached"), while `curl` works, so the script resolves over DNS-over-HTTPS
   and only trusts `dig` when it answers at all.
3. **The Resend status call needs a key this machine does not have.** The
   production `RESEND_API_KEY` is sensitive in Vercel and cannot be pulled. The
   two keys in old local env backups answer 401 (revoked) and 400 (send-only,
   no `domains:read`). The script therefore reports SKIP, not PASS. The
   indirect evidence stands: S12 sent from `noreply@kenyonexpress.co.il` and
   Resend accepted it, which it refuses for an unverified domain.

## To close the one open line

Create a Resend API key with `domains:read` (dashboard, API Keys, permission
"Full access" or a read scope) and run:

```
RESEND_API_KEY=re_... scripts/verify-resend-dns.sh
```

A `verified` answer turns the SKIP into PASS; anything else prints the status
Resend holds.

## Gates

`pnpm lint` exit 0 (docs-index-gate: 341 documents). No source file changed;
the freeze diff against `design-locked-2026-10-19` is empty.
