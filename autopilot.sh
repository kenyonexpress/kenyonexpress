#!/bin/bash
while true; do
  grep -q "AUTOPILOT-DONE" STATE.md 2>/dev/null && break
  claude --dangerously-skip-permissions -p "$(cat AUTOPILOT-PROMPT.md)"
  grep -q "AUTOPILOT-DONE" STATE.md 2>/dev/null && break
  sleep 1800
done
