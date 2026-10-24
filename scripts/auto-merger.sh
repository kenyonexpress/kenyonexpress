#!/bin/zsh
set +e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export GIT_SSH_COMMAND="ssh -o ConnectTimeout=10"
LOG=~/ke-goals/auto-merger.log
REPO=/Users/ofir/ke-merger
LOCK=/tmp/ke-auto-merger.lock

mkdir "$LOCK" 2>/dev/null || { echo "$(date): already running" >> $LOG; exit 0; }
trap "rmdir $LOCK 2>/dev/null" EXIT

cd "$REPO" || { echo "$(date): repo missing" >> $LOG; exit 1; }

git cherry-pick --abort 2>/dev/null
git merge --abort 2>/dev/null
git reset --hard HEAD 2>/dev/null
git clean -fd 2>/dev/null

git fetch origin main closeout/v1-final >> $LOG 2>&1
git checkout main >> $LOG 2>&1
git reset --hard origin/main >> $LOG 2>&1

PENDING_COUNT=$(git log origin/main..origin/closeout/v1-final --oneline | wc -l | tr -d ' ')
if [ "$PENDING_COUNT" = "0" ]; then
  echo "$(date): nothing pending" >> $LOG
  exit 0
fi

echo "$(date): merging $PENDING_COUNT commits from closeout/v1-final into main" >> $LOG

if git merge --no-ff -X theirs origin/closeout/v1-final -m "[auto-merger] merge closeout/v1-final ($PENDING_COUNT commits, $(date +%Y-%m-%dT%H:%M))" >> $LOG 2>&1; then
  echo "$(date): merge succeeded" >> $LOG
else
  echo "$(date): merge -X theirs failed, force-resolving all conflicts" >> $LOG
  CONFLICTED=$(git diff --name-only --diff-filter=U)
  if [ -n "$CONFLICTED" ]; then
    for f in $(echo "$CONFLICTED"); do
      git checkout --theirs "$f" 2>>$LOG
      git add "$f" 2>>$LOG
    done
    if git commit -m "[auto-merger] force-merge closeout/v1-final ($PENDING_COUNT commits, $(date +%Y-%m-%dT%H:%M))" >> $LOG 2>&1; then
      echo "$(date): force-merged" >> $LOG
    else
      echo "$(date): commit failed after force-resolve, aborting" >> $LOG
      git merge --abort 2>/dev/null
      git reset --hard origin/main 2>/dev/null
      exit 1
    fi
  else
    echo "$(date): no conflicts but merge failed, weird. aborting" >> $LOG
    git merge --abort 2>/dev/null
    git reset --hard origin/main 2>/dev/null
    exit 1
  fi
fi

for i in 1 2 3 4 5; do
  if git push origin main >> $LOG 2>&1; then
    echo "$(date): pushed" >> $LOG
    break
  fi
  echo "$(date): push failed attempt $i, refetching and rebasing" >> $LOG
  git fetch origin main >> $LOG 2>&1
  git merge --no-ff -X theirs origin/main -m "[auto-merger] resync main" >> $LOG 2>&1
  sleep 5
done
echo "$(date): done" >> $LOG
