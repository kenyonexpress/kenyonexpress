# S40: inbound mail, MX records for Zoho Mail (06.11.2026)

Queue item S40: add MX records for Zoho Mail free on `kenyonexpress.co.il` with `vercel dns add` (`mx.zoho.com` 10, `mx2.zoho.com` 20, `mx3.zoho.com` 50); if the Zoho account is not configured, BLOCKED.

**RESULT: BLOCKED zoho-account-needed.** No MX record was added. No DNS record, no code and no migration changed.

## Why blocked

Nothing on this machine or in the zone shows a Zoho Mail account that holds `kenyonexpress.co.il`:

| check | answer |
|---|---|
| Zoho domain-verification record in the zone (`zoho-verification=zb...` TXT on the apex, or a `zb*` CNAME) | none. The only apex TXT is `google-site-verification=...` |
| Zoho DKIM (`zmail._domainkey`, `zoho._domainkey`, `zb._domainkey`) | none |
| Zoho credentials in `~/ke-goals/secrets` (`cf.env`, `token.env`) | none, no mention of Zoho |
| Zoho in the repository (`docs/`, `STATE.md`, `.env*`) | no mention |
| Zoho anywhere in `~/ke-goals` | only the S40 queue line itself |

Zoho does not let a domain receive mail before it is added to an account and verified with a TXT or CNAME record. With no such record in the zone, the domain is not verified at Zoho, whether or not an account exists.

Pointing the MX records at Zoho before that would turn today's failure (no MX, senders fall back to the apex address, which is Vercel and does not answer on port 25) into an explicit rejection by Zoho (`relaying denied`) for every message to `support@kenyonexpress.co.il`. It would not deliver anything, so per the item it was not done.

## Not measured

Whether Zoho's servers accept `RCPT TO:<support@kenyonexpress.co.il>`. The direct SMTP probe to `mx.zoho.com:25` and `mx.zoho.eu:25` timed out: outbound port 25 is closed on this network. The conclusion above rests on the missing verification record, not on the probe.

## State of the zone (read-only)

`vercel dns ls kenyonexpress.co.il`, team `kenyonexpress-projects`, 06.11.2026:

```
rec_be6d63e09bb09c1e95950a2a    _dmarc               TXT    v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il
rec_b31ce500162158b67d3c1478                         TXT    google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I
rec_657aaf33e0c6dc2382443b50    send                 TXT    v=spf1 include:amazonses.com ~all
rec_31117d3378bd9f55eba2421d    send                 MX     10 feedback-smtp.us-east-1.amazonses.com.
rec_4a2906907a274e5aee37bcaa    resend._domainkey    TXT    p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJV...
```

Public DNS:

```
dig +short MX kenyonexpress.co.il      (empty)
dig +short TXT kenyonexpress.co.il     "google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I"
dig +short NS kenyonexpress.co.il      ns1.vercel-dns.com. ns2.vercel-dns.com.
```

The apex still has no MX record, as S39 found. `support@kenyonexpress.co.il` receives nothing: no customer mail and no DMARC reports.

## What Ofir needs to do

1. Open a Zoho Mail account (free plan) and add the domain `kenyonexpress.co.il`. Note the data centre: an account on `zoho.eu` uses `mx.zoho.eu`, `mx2.zoho.eu`, `mx3.zoho.eu`, not the `.com` hosts in the item.
2. Zoho shows a verification value (`zoho-verification=zb........`). Add it and verify in the Zoho console:
   ```
   vercel dns add kenyonexpress.co.il @ TXT 'zoho-verification=zb........zmverify.zoho.com'
   ```
3. Create the mailbox `support@kenyonexpress.co.il`.
4. Then the three records of this item:
   ```
   vercel dns add kenyonexpress.co.il @ MX mx.zoho.com 10
   vercel dns add kenyonexpress.co.il @ MX mx2.zoho.com 20
   vercel dns add kenyonexpress.co.il @ MX mx3.zoho.com 50
   ```
5. If mail will also be sent from Zoho (replies from `support@`): the apex needs `v=spf1 include:zoho.com ~all` and Zoho's DKIM record, otherwise `p=quarantine` from S39 sends those replies to spam.

Steps 2 and 4 can be done by the queue once the verification value is in `~/ke-goals/secrets`.

## Changed files

`docs/S40-mx.md`, `docs/INDEX.md`, `README.md` (document count), `STATE.md`. No code, no migration, no frozen path.

## Metrics

| metric | value |
|---|---|
| DNS records added | 0 |
| DNS records changed or removed | 0 |
| apex MX records before / after | 0 / 0 |
| freeze gate (`git diff design-locked-2026-10-19 -- <frozen paths>`) | empty |
| `pnpm lint:docs` | passed |
