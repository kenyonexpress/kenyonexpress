#!/bin/bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
REPORT="night-report-$(date +%Y%m%d).md"
echo "# Night Watch $(date)" > "$REPORT"
for i in $(seq 1 15); do
  echo "" >> "$REPORT"
  echo "## Check $i — $(date +%H:%M)" >> "$REPORT"
  git pull --rebase --autostash >> "$REPORT" 2>&1
  pnpm install --silent 2>/dev/null
  ERR=$(pnpm type-check 2>&1 | grep -c "error TS")
  echo "TypeScript errors: $ERR" >> "$REPORT"
  if [ "$ERR" -eq 0 ]; then
    echo "TYPE-CHECK GREEN" >> "$REPORT"
    if pnpm test > /dev/null 2>&1; then
      echo "TESTS GREEN" >> "$REPORT"
      pnpm biome check --write . > /dev/null 2>&1
      if pnpm build > /dev/null 2>&1; then
        echo "BUILD GREEN — ALL SYSTEMS GO" >> "$REPORT"
        git add -A
        git commit -m "chore(night): all green — types, tests, build" >> "$REPORT" 2>&1
        git push origin phase5/homepage >> "$REPORT" 2>&1
        echo "## FINAL STATUS: FULL GREEN at $(date +%H:%M)" >> "$REPORT"
        git log --oneline -20 >> "$REPORT"
        break
      else
        echo "BUILD RED — waiting" >> "$REPORT"
      fi
    else
      echo "TESTS RED — waiting" >> "$REPORT"
    fi
  else
    echo "waiting — $ERR errors left" >> "$REPORT"
  fi
  sleep 1200
done
echo "## Night Watch ended $(date +%H:%M)" >> "$REPORT"
git status --short >> "$REPORT"
