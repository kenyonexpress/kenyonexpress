#!/bin/bash
# Sentinel per AUTOPILOT-PROMPT.md (9): the word on the FIRST line of STATE.md.
# A plain whole-file grep matches the pending queue item "9. AUTOPILOT-DONE + tag"
# and breaks the loop before the first run.
is_done() { head -1 STATE.md 2>/dev/null | grep -q "AUTOPILOT-DONE"; }
while true; do
  is_done && break
  claude --dangerously-skip-permissions -p "$(cat AUTOPILOT-PROMPT.md)"
  is_done && break
  sleep 1800
done
