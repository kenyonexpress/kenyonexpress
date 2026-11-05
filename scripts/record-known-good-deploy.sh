#!/usr/bin/env bash
# G5 (05.11.2026): record the deployment that is serving production right now
# as "known good", so a rollback has a target that was verified rather than
# whatever is newest. Appends to ~/ke-goals/known-good-deploy.txt and keeps the
# last five lines; the newest known-good is the LAST line.
#
# Run after every release tag (PHASE E) once the audit against production is
# green, and before any deploy you are not sure about.
#
#   scripts/record-known-good-deploy.sh            # record the newest READY production deployment
#   scripts/record-known-good-deploy.sh dpl_xxx    # record this one instead
#
# "Newest READY", not "newest": `vercel ls --prod` lists a BUILDING deployment
# first while a push is in flight, and that is not a rollback target.
set -euo pipefail

PROJECT_ID="${VERCEL_PROJECT_ID:-prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP}"
TEAM_ID="${VERCEL_TEAM_ID:-team_TUMTPVDP8218QHwedSjmgJWl}"
FILE="${KNOWN_GOOD_FILE:-$HOME/ke-goals/known-good-deploy.txt}"
KEEP=5

if [ "${1:-}" != "" ]; then
  ID="$1"; SHA="(given)"
else
  LINE="$(vercel api "/v6/deployments?projectId=$PROJECT_ID&teamId=$TEAM_ID&target=production&limit=10" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);const d=(p.deployments||[]).find(x=>x.readyState==="READY");if(!d){process.exit(3)}console.log(d.uid,((d.meta||{}).githubCommitSha||"").slice(0,9))})')" \
    || { echo "FAIL: no READY production deployment found"; exit 3; }
  ID="${LINE%% *}"; SHA="${LINE#* }"
fi

mkdir -p "$(dirname "$FILE")"; touch "$FILE"
if [ "$(tail -n 1 "$FILE" 2>/dev/null)" = "$ID" ]; then
  echo "known-good unchanged: $ID ($SHA)"
else
  printf '%s\n' "$ID" >> "$FILE"
  tail -n "$KEEP" "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  echo "known-good recorded: $ID ($SHA); file holds $(wc -l < "$FILE" | tr -d ' ') of $KEEP"
fi
echo "rollback: vercel promote $(tail -n 1 "$FILE") --yes"
