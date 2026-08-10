#!/bin/zsh
# kenyon-loop.sh — לולאת אוטונומיה: מריצה claude ברצף על STATE.md.
# הרצה:  nohup caffeinate -dims ./kenyon-loop.sh >> ~/kenyon-loop.log 2>&1 &
# עצירה: pkill -f kenyon-loop.sh   (או: touch ~/.kenyon-loop.stop)

set -u

PROJECT_DIR="/Users/ofir/kenyonexpress-web/kenyonexpress"
LOG_FILE="$HOME/kenyon-loop.log"
PID_FILE="$HOME/.kenyon-loop.pid"
STOP_FILE="$HOME/.kenyon-loop.stop"
NTFY_TOPIC="https://ntfy.sh/kenyon-ofir-limit"

# כמה זמן לחכות בין סייקלים. כישלון מכפיל, עד תקרה.
COOLDOWN_OK=60
BACKOFF_MIN=300
BACKOFF_MAX=3600

PROMPT='עבוד ברצף, אשר אוטומטית, עצור רק ב-4 הקריטיים (push לפרודקשן ב-Vercel, מחיקת DB או קבצים, migration על פרודקשן, סוכן קוד שני על אותו repo).

קרא STATE.md, מצא את הכותרת "## המשך מ:", והתחל מה-goal הראשון בתור שעוד לא סומן בוצע. אם אין תור שם, בנה אותו מ-NEXT-GOALS.md וכתוב אותו ל-STATE.md תחת אותה כותרת.

התור סגור: עבוד goal אחד בכל פעם לפי הסדר עד סוף התור, וסיים בדוח סגירת גל ו-tag. אל תקפוץ בתור ואל תתחיל שניים במקביל.

אחרי כל goal, בסדר הזה: (1) pnpm test ו-pnpm type-check ו-pnpm lint ירוקים, (2) git commit, (3) git push, (4) עדכן STATE.md כולל שורת "המשך מ:" שמצביעה על ה-goal הבא, (5) curl -s -d "סיים: [שם ה-goal]" ntfy.sh/kenyon-ofir-limit, (6) מיד המשך ל-goal הבא בלי להכריז ובלי לחכות.'

log() {
  print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

notify() {
  curl -fsS -m 10 -d "$1" "$NTFY_TOPIC" >/dev/null 2>&1 || true
}

cleanup() {
  rm -f "$PID_FILE"
  log "loop stopped (pid $$)"
  exit 0
}
trap cleanup INT TERM

# מופע יחיד בלבד. שתי לולאות על אותו repo = שני סוכנים על אותם קבצים.
if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "loop already running (pid $old_pid). exiting."
    exit 1
  fi
  log "stale pid file (pid $old_pid), taking over"
fi
print -r -- "$$" > "$PID_FILE"

if [[ ! -d "$PROJECT_DIR" ]]; then
  log "FATAL: project dir missing: $PROJECT_DIR"
  notify "kenyon-loop: project dir missing"
  cleanup
fi
cd "$PROJECT_DIR" || { log "FATAL: cannot cd to $PROJECT_DIR"; cleanup; }

if ! command -v claude >/dev/null 2>&1; then
  log "FATAL: claude not on PATH"
  notify "kenyon-loop: claude not on PATH"
  cleanup
fi

log "loop started (pid $$) in $PROJECT_DIR"
notify "kenyon-loop: started"

cycle=0
backoff=$BACKOFF_MIN

while true; do
  if [[ -f "$STOP_FILE" ]]; then
    log "stop file present ($STOP_FILE). exiting."
    notify "kenyon-loop: stopped by stop file"
    cleanup
  fi

  cycle=$(( cycle + 1 ))
  log "cycle $cycle starting"

  # --print: לא אינטראקטיבי, יוצא כשהתור נגמר או כשהמכסה נגמרה.
  claude --dangerously-skip-permissions --print "$PROMPT"
  rc=$?

  if [[ $rc -eq 0 ]]; then
    log "cycle $cycle finished rc=0, sleeping ${COOLDOWN_OK}s"
    backoff=$BACKOFF_MIN
    sleep "$COOLDOWN_OK"
  else
    # רוב הכישלונות כאן הם מכסה שנגמרה. חכה ונסה שוב, עם backoff עולה.
    log "cycle $cycle failed rc=$rc, backing off ${backoff}s"
    notify "kenyon-loop: cycle $cycle exited rc=$rc, retry in ${backoff}s"
    sleep "$backoff"
    backoff=$(( backoff * 2 ))
    [[ $backoff -gt $BACKOFF_MAX ]] && backoff=$BACKOFF_MAX
  fi
done
