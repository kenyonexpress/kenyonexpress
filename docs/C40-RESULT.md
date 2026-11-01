# C40 Result: DNS Verification & Cloudflare Archive

**Goal:** DNS verify NS + A + Resend. Archive Cloudflare records.

**Completed:** 2026-10-24

## What Was Done

### 1. DNS Verification (NS + A)

Verified current DNS state via `dig`:

**Nameservers (NS):**
```
ns1.vercel-dns.com.
ns2.vercel-dns.com.
```
✅ **VERIFIED** - Domain successfully delegated to Vercel nameservers.

**A Records:**
```
216.150.1.129
216.150.1.193
```
✅ **VERIFIED** - Apex domain resolves to Vercel IPs.

**DMARC:**
```
v=DMARC1; p=none;
```
✅ **PRESENT** - DMARC policy configured.

### 2. Resend DNS Verification

**Status:** ✅ **CONFIGURED AND VERIFIED**

**Initial check ERROR:** Checked wrong selectors. Resend uses `send.` subdomain, not apex.

**Corrected verification via Vercel CLI + dig:**

```bash
# DKIM (resend._domainkey, NOT _resend._domainkey)
$ dig resend._domainkey.kenyonexpress.co.il TXT +short
"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJVyYJvyWcY6mDZv3g7chG2nVI8v2vq6Oc67XUeShO8kXAytuQND5FXmZtgnxHJuJsLRhzhQZhu1QiEWm4Dvj8V+SlWrGu0gSx6HO7fpaHqCU4odp4vd6NXLaAiNkYHSl05GlXx2UH7jCN8RmlmV6icllIaIw0uUN+qNUaS2wIDAQAB"

# MX (send subdomain, NOT apex)
$ dig send.kenyonexpress.co.il MX +short
10 feedback-smtp.us-east-1.amazonses.com.

# SPF (send subdomain, NOT apex)
$ dig send.kenyonexpress.co.il TXT +short
"v=spf1 include:amazonses.com ~all"
```

**Vercel DNS records (via `vercel api /v5/domains/kenyonexpress.co.il/records`):**

| Record | Type | Value | TTL | Created |
|---|---|---|---|---|
| resend._domainkey | TXT | p=MIGfMA0GCS... (RSA public key) | 60 | 2026-09-04 |
| send | MX | 10 feedback-smtp.us-east-1.amazonses.com. | 60 | 2026-09-04 |
| send | TXT | v=spf1 include:amazonses.com ~all | 60 | 2026-09-04 |

**Finding:** All three required Resend DNS records are configured in Vercel DNS and resolving correctly. Resend sends from `send.kenyonexpress.co.il` subdomain, not the apex domain.

**Resolution:** Items RS3 and RS4 in `docs/LAUNCH-CHECKLIST.md` can be marked complete. Resend DNS verification is green.

### 3. Cloudflare Records Archive

Created `docs/DNS-CLOUDFLARE-ARCHIVED.md` documenting:

- **30 records** from the Cloudflare staged zone (never activated)
- **Historical context:** Two Cloudflare zones existed (live: derek/elma, staged: ignat/tess)
- **Cutover:** Direct NS delegation to Vercel bypassed both Cloudflare zones
- **Corrupt records found:** Two records in staged zone contained literal `[...]` (duplicate DKIM, malformed SPF for `send.` subdomain)
- **Live zone state:** NO Resend records present (only existed in never-activated staged zone)
- **Current DNS state:** Verified post-cutover NS, A, DMARC records

## Summary

| Item | Status | Evidence |
|---|---|---|
| NS records | ✅ Verified | ns1/ns2.vercel-dns.com |
| A records | ✅ Verified | 216.150.1.129, 216.150.1.193 |
| DMARC | ✅ Present | v=DMARC1; p=none; |
| Resend DKIM | ✅ Verified | resend._domainkey.kenyonexpress.co.il |
| Resend SPF | ✅ Verified | send.kenyonexpress.co.il v=spf1 include:amazonses.com ~all |
| Resend MX | ✅ Verified | send.kenyonexpress.co.il → feedback-smtp.us-east-1.amazonses.com |
| Cloudflare archive | ✅ Created | docs/DNS-CLOUDFLARE-ARCHIVED.md |
| Vercel MCP | ❌ OAuth required | 403 forbidden, used CLI fallback |
| Supabase MCP | ❌ OAuth required | Tools not available |
| GitHub MCP | ⚠️ Not attempted | No PR needed for documentation task |

## Code Changes

None. This was a verification and documentation task.

## MCP Access

**Vercel MCP:** Available but requires explicit team permissions. Got 403 forbidden on domain/DNS operations. Used CLI fallback (`vercel api`) successfully to retrieve 10 DNS records.

**Supabase MCP:** Requires OAuth authorization (not available in non-interactive session). No tools loaded.

**GitHub MCP:** Requires OAuth authorization. Not attempted as no PR was needed for this documentation-only task.

## Quality Gates

- Type-check: Not applicable (documentation only)
- Lint: Not applicable (documentation only)
- Build: Not run (no code changes)
- Tests: Not applicable (documentation only)

## Next Steps

**No owner action required.** Resend DNS is fully configured and verified.

**Update `docs/LAUNCH-CHECKLIST.md`:**
- RS3: SPF TXT record - Mark **COMPLETE** (verified on send.kenyonexpress.co.il)
- RS4: DKIM CNAME(s) - Mark **COMPLETE** (verified at resend._domainkey.kenyonexpress.co.il)

## Files Created

- `docs/DNS-CLOUDFLARE-ARCHIVED.md` - Complete archive of Cloudflare DNS records
- `docs/C40-RESULT.md` - This file

## Evidence

DNS verification commands run on 2026-10-24:

```bash
# Infrastructure
dig kenyonexpress.co.il NS +short
dig kenyonexpress.co.il A +short
dig _dmarc.kenyonexpress.co.il TXT +short

# Resend (corrected selectors)
dig resend._domainkey.kenyonexpress.co.il TXT +short
dig send.kenyonexpress.co.il MX +short
dig send.kenyonexpress.co.il TXT +short

# Vercel DNS records
vercel api /v5/domains/kenyonexpress.co.il/records --method GET
```

All output captured in this file and `docs/DNS-CLOUDFLARE-ARCHIVED.md`.
