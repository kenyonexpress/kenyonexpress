# DNS cutover plan

**Nothing here has been run.** Executing the cutover is a hard stop and needs
Ofir. This file is the prepared commands, the rollback, and the two things that
have to be true before either is worth typing.

Snapshot of the current state: `docs/DNS-SNAPSHOT-PRE-CUTOVER.md`.

## Before anything

**1. The domain must be attached to the Vercel project first.** Adding a DNS
record that points at Vercel before Vercel knows the domain gives every visitor
a Vercel 404 page rather than the site. Attach it in the dashboard (or
`vercel domains add kenyonexpress.co.il`), let Vercel show the domain as
configured-but-not-pointed, and only then change DNS.

**2. `CHECKOUT_ENABLED=true` must already be set in Production.** Cutting the
real domain over to a deployment whose checkout server action refuses every
payment means the first real customer cannot buy. See
`docs/LAUNCH-READINESS.md`.

## Environment for the commands below

```bash
export CF_API_TOKEN='<token with Zone:Read + Zone:DNS:Edit on kenyonexpress.co.il>'
export ZONE_ID="$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  'https://api.cloudflare.com/client/v4/zones?name=kenyonexpress.co.il' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"][0]["id"])')"
echo "$ZONE_ID"
```

## Take the snapshot that the rollback depends on

Do not skip this. The rollback below restores what this file records, and if it
was never written there is nothing to restore to.

```bash
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=200" \
  > "$HOME/Desktop/kenyonexpress-dns-$(date +%Y-%m-%d-%H%M).json"
```

## What changes

Two records, apex and `www`. Everything else is untouched.

| Name | Now | After | Proxy |
| --- | --- | --- | --- |
| `kenyonexpress.co.il` | A → Cloudflare anycast (WordPress behind it) | A → `76.76.21.21` | DNS only |
| `www.kenyonexpress.co.il` | A → Cloudflare anycast | CNAME → `cname.vercel-dns.com` | DNS only |

**DNS only, not proxied.** Vercel terminates TLS for the domain itself and
issues its own certificate. Leaving Cloudflare's proxy on in front of it gives
two CDNs, two certificates and a redirect loop in the common
`Flexible`-SSL configuration. Turn the orange cloud off for these two records.

### Apex

```bash
# find the existing apex A records
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=kenyonexpress.co.il" \
  | python3 -m json.tool

# update the FIRST one to Vercel and delete any others (Vercel wants one A record)
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/<RECORD_ID_1>" \
  --data '{"type":"A","name":"kenyonexpress.co.il","content":"76.76.21.21","ttl":60,"proxied":false}'

curl -sS -X DELETE \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/<RECORD_ID_2>"
```

### www

```bash
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=www.kenyonexpress.co.il" \
  | python3 -m json.tool

# www must become a CNAME, so the A records are deleted and one CNAME created
curl -sS -X DELETE -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/<WWW_A_RECORD_ID>"

curl -sS -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"CNAME","name":"www","content":"cname.vercel-dns.com","ttl":60,"proxied":false}'
```

**TTL 60 on purpose.** A short TTL during a cutover is what makes the rollback
take a minute instead of a day. Raise it to `1` (automatic) once the deployment
has been serving the domain for a day.

## What is NOT touched, and why

| Record | Leave alone |
| --- | --- |
| `MX 10 mailgw2.spd.co.il` | Live mail. Deleting it stops mail delivery immediately. |
| `TXT v=spf1 ... mailchannels ... elasticemail` | The SPF for that same mail service. |
| `TXT google-site-verification=...` | Search Console ownership; removing it drops verification. |
| `_dmarc TXT v=DMARC1; p=none;` | DMARC policy. |
| `mail.kenyonexpress.co.il` | Resolves to the proxy today; not part of the web cutover. |

**The brief says to preserve "Resend MX/TXT/DKIM records". There are none.** The
mail on this domain is `spd.co.il`, and three common DKIM selectors were checked
and are absent. Do not go looking for Resend records to keep, and do not delete
the `spd.co.il` ones thinking they are stale.

## Verify, before telling anyone it is done

```bash
dig +short A kenyonexpress.co.il @1.1.1.1        # expect 76.76.21.21
dig +short CNAME www.kenyonexpress.co.il @1.1.1.1 # expect cname.vercel-dns.com
dig +short MX kenyonexpress.co.il @1.1.1.1        # expect mailgw2.spd.co.il, UNCHANGED

curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://kenyonexpress.co.il/
curl -sS -o /dev/null -w '%{http_code}\n' https://www.kenyonexpress.co.il/
```

A certificate error in the first minutes is normal: Vercel issues the
certificate after it sees the domain resolving to it. It is only a problem if it
persists past about fifteen minutes.

## Rollback

The apex and `www` values below are from the snapshot taken 2026-09-02. If the
JSON snapshot above was written, prefer it: it carries the record ids and the
proxied flags.

```bash
# apex back to the Cloudflare-proxied pair
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/<RECORD_ID_1>" \
  --data '{"type":"A","name":"kenyonexpress.co.il","content":"172.67.148.28","ttl":60,"proxied":true}'

curl -sS -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"A","name":"kenyonexpress.co.il","content":"104.21.55.125","ttl":60,"proxied":true}'

# www back to the proxied A pair, and the CNAME removed
curl -sS -X DELETE -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/<WWW_CNAME_ID>"

curl -sS -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"A","name":"www","content":"104.21.55.125","ttl":60,"proxied":true}'

curl -sS -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"A","name":"www","content":"172.67.148.28","ttl":60,"proxied":true}'
```

**The rollback restores DNS, not the shop.** Anyone who placed an order on the
Vercel deployment during the window has an order in Supabase that the WordPress
site knows nothing about. Check `orders` for rows created inside the window
before deciding the rollback was clean.
