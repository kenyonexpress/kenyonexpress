#!/bin/bash

#
# M-CYCLE LOOP: 2-Hour Maintenance Cycle Runner for tmux ke-final
#
# Runs M01-M18 maintenance tasks every 2 hours in a continuous loop.
# Designed to run inside tmux session "ke-final".
#
# Usage:
#   ./scripts/run-m-cycle-loop.sh
#
# Stop:
#   Create file: /tmp/m-cycle.stop
#   Or: kill the process
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STOP_FLAG="/tmp/m-cycle.stop"
CYCLE_INTERVAL=$((2 * 60 * 60)) # 2 hours in seconds

echo "[M-CYCLE-LOOP] Starting maintenance cycle loop"
echo "[M-CYCLE-LOOP] Project root: $PROJECT_ROOT"
echo "[M-CYCLE-LOOP] Cycle interval: $CYCLE_INTERVAL seconds (2 hours)"
echo "[M-CYCLE-LOOP] Stop flag: $STOP_FLAG"
echo ""

# Remove old stop flag if exists
rm -f "$STOP_FLAG"

cycle_count=0

while true; do
  cycle_count=$((cycle_count + 1))

  echo "========================================="
  echo "[M-CYCLE-LOOP] Cycle #$cycle_count starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "========================================="

  # Check for stop flag before running
  if [ -f "$STOP_FLAG" ]; then
    echo "[M-CYCLE-LOOP] Stop flag detected, exiting gracefully"
    rm -f "$STOP_FLAG"
    exit 0
  fi

  # Run the M-cycle
  cd "$PROJECT_ROOT"
  if node scripts/m-cycle.mjs; then
    echo "[M-CYCLE-LOOP] Cycle #$cycle_count completed successfully"
  else
    exit_code=$?
    echo "[M-CYCLE-LOOP] Cycle #$cycle_count completed with exit code $exit_code"

    # Critical failure (exit code 1) means critical tasks failed
    # We continue the loop but log the failure
    if [ $exit_code -eq 1 ]; then
      echo "[M-CYCLE-LOOP] ⚠️  CRITICAL FAILURES DETECTED - Check docs/M-CYCLE-STATUS.md"
      # Send notification
      if command -v curl &> /dev/null; then
        curl -d "M-Cycle #$cycle_count: Critical failures detected" https://ntfy.sh/kenyon-ofir-limit 2>/dev/null || true
      fi
    elif [ $exit_code -eq 2 ]; then
      echo "[M-CYCLE-LOOP] ❌ SCRIPT ERROR - Stopping loop"
      exit 2
    fi
  fi

  # Check for stop flag after running
  if [ -f "$STOP_FLAG" ]; then
    echo "[M-CYCLE-LOOP] Stop flag detected, exiting gracefully"
    rm -f "$STOP_FLAG"
    exit 0
  fi

  echo ""
  echo "[M-CYCLE-LOOP] Waiting $CYCLE_INTERVAL seconds until next cycle..."
  echo "[M-CYCLE-LOOP] Next cycle at approximately: $(date -u -v+${CYCLE_INTERVAL}S +%Y-%m-%dT%H:%M:%SZ)"
  echo "[M-CYCLE-LOOP] To stop, create file: $STOP_FLAG"
  echo ""

  # Sleep for 2 hours (check stop flag every minute)
  for ((i=0; i<$CYCLE_INTERVAL; i+=60)); do
    sleep 60
    if [ -f "$STOP_FLAG" ]; then
      echo "[M-CYCLE-LOOP] Stop flag detected during sleep, exiting gracefully"
      rm -f "$STOP_FLAG"
      exit 0
    fi
  done
done
