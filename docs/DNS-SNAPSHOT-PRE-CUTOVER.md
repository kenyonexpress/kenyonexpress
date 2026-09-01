# DNS snapshot, before the cutover

Taken 2026-09-02 from public resolvers (`dig @1.1.1.1`), not from the Cloudflare
API. **This is the resolvable view, and it is not the whole zone.** What it
cannot show: records that exist but do not resolve publicly, the proxied/DNS-only
flag per record, TTLs as configured rather than as served, and page rules.
Completing it needs a Cloudflare API token, which this session does not have.

It is still the thing that matters most for a cutover: it is what the internet
currently believes.

## Authoritative nameservers

```
derek.ns.cloudflare.com.
elma.ns.cloudflare.com.
```

The zone is on Cloudflare, so the cutover is a Cloudflare change and not a
registrar change.

## Apex and www

```
kenyonexpress.co.il      A      172.67.148.28
kenyonexpress.co.il      A      104.21.55.125
www.kenyonexpress.co.il  A      104.21.55.125
www.kenyonexpress.co.il  A      172.67.148.28
mail.kenyonexpress.co.il A      104.21.55.125, 172.67.148.28
```

Both A records are **Cloudflare anycast addresses**, not the WordPress origin.
The site is proxied (orange cloud), so the origin IP is not visible here and the
cutover replaces what Cloudflare proxies to, not a public origin address.

`mail.` resolving to the same proxy addresses is worth noticing before anything
is deleted: it is an A record on the proxy, not a mail host.

## Mail, and the premise this corrects

```
MX     10 mailgw2.spd.co.il.
TXT    "v=spf1 a mx ip4:192.116.71.122 include:relay.mailchannels.net include:_spf.elasticemail.com ~all"
TXT    "google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I"
_dmarc TXT "v=DMARC1; p=none;"
```

**There are no Resend records on this domain.** The launch brief says to preserve
"Resend MX/TXT/DKIM", and none exists: mail is `spd.co.il`, and the SPF includes
`mailchannels` and `elasticemail`. Three common DKIM selectors were checked and
all three are absent:

```
resend._domainkey    (none)
default._domainkey   (none)
s1._domainkey        (none)
```

So the rule for the cutover is not "keep the Resend records". It is **keep the
existing mail records exactly as they are**, because they belong to a live mail
service that has nothing to do with this deployment. If Resend is meant to send
for this domain later, that is a separate change with its own verification step,
and it is not part of a cutover.

## Subdomains checked and absent

`api.` and `cdn.` do not resolve. Nothing depends on them today.

## Still needed for a complete snapshot

A Cloudflare API token with `Zone:Read` on `kenyonexpress.co.il`:

```
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=kenyonexpress.co.il" \
  | python3 -m json.tool

curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=200" \
  | python3 -m json.tool
```

Run those two and paste the output under this heading before the cutover.
