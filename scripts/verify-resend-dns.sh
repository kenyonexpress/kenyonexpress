#!/usr/bin/env bash
# G2 (05.11.2026): verify the four DNS records Resend needs on kenyonexpress.co.il,
# add any that are missing from the Vercel zone, resolve each one publicly, and
# ask Resend for the domain status when an API key with read scope is present.
#
# Three things learned writing this, each of which changes a line below:
#   1. Plain `dig` cannot reach any external resolver from this machine (port 53
#      times out to ns1.vercel-dns.com and to 8.8.8.8 alike), so resolution goes
#      over DNS-over-HTTPS (cloudflare-dns.com) and falls back to dig only when
#      dig answers at all.
#   2. The MX Resend issued for this domain is us-east-1, not eu-west-1: the
#      region is whatever Resend assigned when the domain was added, so the
#      expected host is a variable with that default, not a constant.
#   3. The DKIM value is per domain and only Resend knows it. The script adds
#      SPF, MX and DMARC on its own; a missing DKIM record is reported as FAIL
#      with the value to fetch, never invented.
#
# Usage: scripts/verify-resend-dns.sh            (verify, add missing, report)
#        CHECK_ONLY=1 scripts/verify-resend-dns.sh (never writes to the zone)
# Env:   RESEND_API_KEY (optional; needs domains:read, a send-only key is 400),
#        RESEND_MX_HOST (default feedback-smtp.us-east-1.amazonses.com),
#        RESEND_DKIM_VALUE (the `p=...` value, only needed to ADD the record).
set -u

DOMAIN="${DOMAIN:-kenyonexpress.co.il}"
MX_HOST="${RESEND_MX_HOST:-feedback-smtp.us-east-1.amazonses.com}"
CHECK_ONLY="${CHECK_ONLY:-0}"
fails=0

zone="$(vercel dns ls "$DOMAIN" 2>/dev/null)"
if ! printf '%s' "$zone" | grep -q "rec_"; then
  echo "FAIL zone: 'vercel dns ls $DOMAIN' returned no records (not linked, or wrong team)"
  exit 2
fi

# in_zone <name> <type> <value-substring>
in_zone() {
  printf '%s\n' "$zone" | awk -v n="$1" -v t="$2" '$2 == n && $3 == t { print }' | grep -q -- "$3"
}

# resolve <fqdn> <type>: answers on stdout, empty when nothing resolves.
resolve() {
  local out
  out="$(dig +short +time=2 +tries=1 "$1" "$2" 2>/dev/null)"
  if [ -n "$out" ] && ! printf '%s' "$out" | grep -q 'timed out'; then
    printf '%s\n' "$out"
    return
  fi
  curl -s -m 15 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$1&type=$2" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);for(const a of (j.Answer||[]))console.log(a.data)}catch{}})'
}

# check <name> <type> <value-substring> <value-to-add-or-empty>
check() {
  local name="$1" type="$2" needle="$3" value="$4" fqdn="$1.$DOMAIN" label
  label="$name $type"
  if ! in_zone "$name" "$type" "$needle"; then
    if [ "$CHECK_ONLY" = "1" ] || [ -z "$value" ]; then
      echo "FAIL $label: not in the Vercel zone${value:+ (CHECK_ONLY=1, not added)}${value:-; no value to add: fetch it from the Resend dashboard, then RESEND_DKIM_VALUE='p=...' $0}"
      fails=$((fails + 1))
      return
    fi
    echo "ADD  $label: vercel dns add $DOMAIN $name $type \"$value\""
    if ! vercel dns add "$DOMAIN" "$name" "$type" "$value" >/dev/null 2>&1; then
      echo "FAIL $label: vercel dns add refused"
      fails=$((fails + 1))
      return
    fi
  fi
  local answer
  answer="$(resolve "$fqdn" "$type")"
  if printf '%s' "$answer" | grep -q -- "$needle"; then
    echo "PASS $label: zone has it and $fqdn resolves ($(printf '%s' "$answer" | head -1 | cut -c1-60))"
  else
    echo "FAIL $label: in the zone but $fqdn does not resolve to it yet (answer: ${answer:-none})"
    fails=$((fails + 1))
  fi
}

check "resend._domainkey" TXT "p=" "${RESEND_DKIM_VALUE:-}"
check "send" TXT "include:amazonses.com" "v=spf1 include:amazonses.com ~all"
check "send" MX "$MX_HOST" "10 $MX_HOST"
check "_dmarc" TXT "v=DMARC1" "v=DMARC1; p=none;"

if [ -n "${RESEND_API_KEY:-}" ]; then
  status="$(curl -s -m 20 https://api.resend.com/domains -H "Authorization: Bearer $RESEND_API_KEY" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const d=(j.data||[]).find(x=>x.name===process.argv[1]);console.log(d?`${d.status} (${d.region})`:(j.message||j.name||"not-listed"))}catch{console.log("unparsed")}})' "$DOMAIN")"
  if [ "${status%% *}" = "verified" ]; then
    echo "PASS resend api: domain $DOMAIN is $status"
  else
    echo "FAIL resend api: domain $DOMAIN status '$status' (a send-only key answers 400 here; use a key with domains:read)"
    fails=$((fails + 1))
  fi
else
  echo "SKIP resend api: RESEND_API_KEY not in this shell (the production key is sensitive in Vercel and cannot be pulled)"
fi

if [ "$fails" -eq 0 ]; then echo "RESULT: PASS ($DOMAIN)"; else echo "RESULT: FAIL ($fails)"; fi
exit $(( fails > 0 ))
