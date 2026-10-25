# Gate Status Report

## Mobile Gate (380px) - MAINTENANCE_LOOP_6

**Date:** 2026-10-26 06:45 UTC+7
**Score:** 12.83% (⚠️ ABOVE 11% THRESHOLD)
**Status:** ALERT - Mobile fix goal requeued at head of maintenance loop

### Analysis
- Reference: 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr)
- Ours: 1 failed to load (1 fetch)
- Worst bands:
  - y 200-300: 55.3%
  - y 1700-1800: 45%
  - y 300-400: 33.1%

### Action Taken
Mobile fix goal requeued at head of ~/ke-goals/queue.txt for next maintenance cycle.
