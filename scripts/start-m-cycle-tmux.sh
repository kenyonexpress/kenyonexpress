#!/bin/bash

#
# START M-CYCLE IN TMUX: Launch M-Cycle in ke-final session
#
# Creates or attaches to tmux session "ke-final" and starts the M-cycle loop.
# Safe to run multiple times - will not create duplicate sessions.
#
# Usage:
#   ./scripts/start-m-cycle-tmux.sh [--attach]
#
# Options:
#   --attach    Attach to the session after starting (default: detached)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION_NAME="ke-final"
ATTACH=false

# Parse args
for arg in "$@"; do
  case $arg in
    --attach)
      ATTACH=true
      shift
      ;;
  esac
done

echo "[START-M-CYCLE] Checking for existing tmux session: $SESSION_NAME"

# Check if session exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[START-M-CYCLE] Session $SESSION_NAME already exists"

  # Check if M-cycle is already running
  if tmux capture-pane -t "$SESSION_NAME" -p | grep -q "M-CYCLE-LOOP"; then
    echo "[START-M-CYCLE] M-Cycle appears to be already running in session $SESSION_NAME"
    echo "[START-M-CYCLE] Current pane content:"
    tmux capture-pane -t "$SESSION_NAME" -p | tail -10
    echo ""
    echo "[START-M-CYCLE] To stop: touch /tmp/m-cycle.stop"
    echo "[START-M-CYCLE] To attach: tmux attach -t $SESSION_NAME"
    exit 0
  else
    echo "[START-M-CYCLE] Session exists but M-Cycle not running. Starting M-Cycle..."
    tmux send-keys -t "$SESSION_NAME" "cd $PROJECT_ROOT && ./scripts/run-m-cycle-loop.sh" C-m
  fi
else
  echo "[START-M-CYCLE] Creating new session: $SESSION_NAME"
  tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_ROOT"

  echo "[START-M-CYCLE] Starting M-Cycle loop in session $SESSION_NAME"
  tmux send-keys -t "$SESSION_NAME" "./scripts/run-m-cycle-loop.sh" C-m
fi

echo ""
echo "✅ M-Cycle started in tmux session: $SESSION_NAME"
echo ""
echo "Commands:"
echo "  Attach:  tmux attach -t $SESSION_NAME"
echo "  Detach:  Ctrl+b, then d"
echo "  Stop:    touch /tmp/m-cycle.stop"
echo "  Status:  tmux capture-pane -t $SESSION_NAME -p | tail -20"
echo ""

if [ "$ATTACH" = true ]; then
  echo "[START-M-CYCLE] Attaching to session..."
  tmux attach -t "$SESSION_NAME"
fi
