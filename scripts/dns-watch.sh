#!/usr/bin/env bash
#
# scripts/dns-watch.sh
#
# Watches kenyonexpress.co.il's NS records for the Cloudflare cutover
# (production-server-is-down / dns-zone-refused-at-cloudflare: as of
# 20.09.2026 the domain does not resolve at all -- delegation is intact but
# the zone is gone from the Cloudflare account). The moment the Cloudflare
# nameservers appear, this hands off to an autonomous claude session that
# brings production live and verifies it.
#
# Deliberately NOT a loop inside a claude session: a claude session ends on
# quota, on context limits, on a crash, or when its terminal closes, and any
# of those would silently stop the DNS check with it. This script has none
# of a claude session's state, so a LaunchAgent (see
# com.kenyonexpress.dnswatch.plist) can keep it running independently and
# restart it if it ever dies, and the 15-minute poll costs nothing while it
# waits.
#
# Idempotent by construction: `exec` below replaces this process with
# claude's, so once the cutover fires this script's own loop is gone for
# that run. If the launched claude session ever exits (finishes, crashes, or
# is killed) and the LaunchAgent restarts this script, it will immediately
# see the same Cloudflare NS records and re-launch claude again with the
# same goal -- which is the project's existing self-healing pattern
# (ke-eternal.sh does the same thing for the general closeout goal), not a
# bug. If that respawn-on-exit behaviour is ever unwanted, unload the
# LaunchAgent (see the plist) rather than edit this loop.

set -uo pipefail

PROJECT_DIR="/Users/ofir/kenyonexpress-web/kenyonexpress"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/dns-watch.log"
DOMAIN="kenyonexpress.co.il"
RESOLVER="@1.1.1.1"
CHECK_INTERVAL_SECONDS=900 # 15 minutes
NS_PATTERN="aria\.ns\.cloudflare\.com|quinton\.ns\.cloudflare\.com"
CLAUDE_BIN="/opt/homebrew/bin/claude"

mkdir -p "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >>"$LOG_FILE"
}

log "dns-watch starting, pid $$"

while true; do
  ns="$(dig +short NS "$DOMAIN" "$RESOLVER" 2>>"$LOG_FILE")"

  if printf '%s\n' "$ns" | grep -qE "$NS_PATTERN"; then
    log "CLOUDFLARE NS DETECTED: ${ns//$'\n'/, }"

    osascript -e 'display notification "Cloudflare nameservers are live for kenyonexpress.co.il -- launching the go-live goal." with title "DNS cutover detected" sound name "Glass"' >>"$LOG_FILE" 2>&1 || true

    cd "$PROJECT_DIR" || {
      log "FATAL: cannot cd to $PROJECT_DIR, aborting handoff"
      exit 1
    }

    log "handing off to claude (model sonnet) for the go-live sequence"

    exec "$CLAUDE_BIN" --dangerously-skip-permissions --model sonnet "$(
      cat <<'GOAL'
DNS CUTOVER DETECTED for kenyonexpress.co.il: Cloudflare nameservers now
resolve (aria.ns.cloudflare.com / quinton.ns.cloudflare.com). This session
was launched automatically by scripts/dns-watch.sh the moment that happened.

Read STATE.md first for full context, then work this sequence in order.
Commit at explicit paths only, never `-A` (git commit -- <paths> takes the
working tree of those paths, not the index -- see CLAUDE.md). Never apply a
migration to production. Follow every rule in CLAUDE.md and AGENTS.md.

1. Verify the Cloudflare zone for kenyonexpress.co.il is active, not merely
   pending -- check zone status, not just that NS resolves.
2. Verify the domain is attached to the Vercel project "kenyonexpress" (add
   it if the zone check in step 1 confirms the zone is ready and it is not
   already attached).
3. Run a production deploy.
4. Verify https://kenyonexpress.co.il/ returns HTTP 200 with the actual
   homepage content -- not a Cloudflare challenge page, not a Vercel error
   page, not a stale cache. Confirm with more than one fetch if the first
   looks wrong before concluding it failed.
5. Run scripts/compare.mjs against production at 380px, 768px and 1440px.
   Compare against the frozen refs/ke_live_*.png baselines. Fix any parity
   regression you find before moving on; if a gap is pre-existing and
   already documented in docs/UI-PARITY-REPORT.md, say so instead of
   re-chasing it.
6. Update STATE.md and docs/UI-PARITY-REPORT.md with what was measured, in
   the project's established format (see recent entries for the pattern).
7. Continue the perpetual closeout loop from STATE.md's own continuation
   pointer, in queue order, without stopping and without announcing it.

The four conditions that call for stopping to ask are: a further production
push to Vercel beyond the one this goal itself authorizes in step 3, DB or
file deletion, running a migration, or discovering a second code agent
already active on this repo (check for one before step 3, the same way past
sessions have: a `claude ... /goal` process with recent commits in its
working directory means someone else may already be mid-deploy). Every
other decision: take the conservative option, record it in STATE.md under
"החלטות שהתקבלו לבד", and continue.
GOAL
    )"
  fi

  log "no cutover yet: ${ns:-<empty>}"
  sleep "$CHECK_INTERVAL_SECONDS"
done
